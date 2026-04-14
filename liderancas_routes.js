/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ROTAS — NOVA MODELAGEM DE LIDERANÇAS (pessoas + liderancas many-to-many)
 *  Adicione este bloco ao server.js, substituindo as rotas antigas de
 *  /api/liderancas e adicionando as novas /api/pessoas/*.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Modelo novo:
 *    pessoas     → entidade única por tenant (nome, foto, contato…)
 *    liderancas  → vínculo pessoa ↔ cidade (expectativa, status, regiao…)
 */

// ─── Utilitário de normalização ──────────────────────────────────────────────
// Mesma lógica no frontend e no backend garante consistência.
function normalizarNome(str) {
  return (str || '')
    .normalize('NFD')                    // decompõe acentos
    .replace(/[\u0300-\u036f]/g, '')     // remove diacríticos
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');               // colapsa espaços duplos
}

// ────────────────────────────────────────────────────────────────────────────
//  AUTOCOMPLETE — GET /api/pessoas/buscar?q=chap
//  Retorna até 10 pessoas cujo nome_norm contenha o termo buscado.
//  Ordena: match exato > começa com > contém + por total de cidades.
// ────────────────────────────────────────────────────────────────────────────
app.get('/api/pessoas/buscar', auth, withTenant, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json([]);

    const norm = normalizarNome(q);

    const { rows } = await pool.query(`
      SELECT
        p.id,
        p.nome,
        p.foto,
        p.contato,
        p.perfil,
        COUNT(l.id)                                                  AS total_cidades,
        ARRAY_AGG(l.cidade ORDER BY l.cidade) FILTER (WHERE l.cidade IS NOT NULL) AS cidades
      FROM pessoas p
      LEFT JOIN liderancas l
             ON l.pessoa_id = p.id
            AND l.tenant_id = p.tenant_id
      WHERE p.tenant_id = $1
        AND p.nome_norm ILIKE $2
      GROUP BY p.id
      ORDER BY
        CASE
          WHEN p.nome_norm = $3        THEN 0   -- match exato primeiro
          WHEN p.nome_norm LIKE $4     THEN 1   -- começa com
          ELSE                              2   -- contém em qualquer posição
        END,
        COUNT(l.id) DESC,                       -- mais atuante vem antes
        p.nome
      LIMIT 10
    `, [
      req.tenantId,
      `%${norm}%`,   // $2  ILIKE (contém)
      norm,          // $3  match exato
      `${norm}%`,    // $4  começa com
    ]);

    res.json(rows);
  } catch (err) {
    console.error('[pessoas/buscar]', err);
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
//  CRIAR LIDERANÇA — POST /api/liderancas
//
//  Dois modos de uso:
//    A) pessoa_id fornecido → vincula pessoa existente à cidade
//    B) pessoa_id ausente   → cria pessoa nova e vincula
//
//  Body (FormData ou JSON):
//    pessoa_id?        number       — ID de pessoa já existente
//    nome              string       — obrigatório se pessoa_id ausente
//    cidade            string       — obrigatório sempre
//    contato?          string
//    foto?             File (multipart)
//    perfil?           string
//    data_nascimento?  string (ISO date)
//    release?          string
//    expectativa_votos? number
//    status?           string       — default 'ativa'
//    responsavel?      string
//    vinculo_politico? string
//    regiao?           string
//    mapa?             string
// ────────────────────────────────────────────────────────────────────────────
app.post('/api/liderancas',
  createLiderancaLimiter,
  auth,
  withTenant,
  allowAll(),
  upload.single('foto'),
  async (req, res) => {
    const client = await pool.connect();   // transação
    try {
      const {
        pessoa_id: pessoaIdRaw,
        nome,
        cidade,
        contato,
        perfil,
        data_nascimento,
        release,
        expectativa_votos,
        status,
        responsavel,
        vinculo_politico,
        regiao: regiaoBody,
        mapa,
      } = req.body;

      // ── Validações básicas ───────────────────────────────────────────────
      if (!validarTexto(cidade, 120))
        return res.status(400).json({ error: 'Cidade inválida' });

      const pessoaIdFornecido = pessoaIdRaw ? Number(pessoaIdRaw) : null;

      if (!pessoaIdFornecido && !validarTexto(nome, 120))
        return res.status(400).json({ error: 'Nome inválido (ou forneça pessoa_id)' });

      // ── Upload de foto ───────────────────────────────────────────────────
      let fotoUrl = null;
      if (req.file) {
        const caminhoOtimizado = await otimizarImagem(req.file.path);
        const fileBuffer       = fs.readFileSync(caminhoOtimizado);
        const fileName         = `${Date.now()}.webp`;

        const { error } = await supabase.storage
          .from('liderancas')
          .upload(fileName, fileBuffer, { contentType: 'image/webp', upsert: false });

        if (error) throw error;

        fotoUrl = supabase.storage.from('liderancas').getPublicUrl(fileName).data.publicUrl;
        try { fs.unlinkSync(caminhoOtimizado); } catch (_) {}
      }

      await client.query('BEGIN');

      // ── Resolve a pessoa ─────────────────────────────────────────────────
      let pessoaId = pessoaIdFornecido;

      if (!pessoaId) {
        // Modo B: cria ou recupera pessoa pelo nome normalizado
        const nomeNorm = normalizarNome(nome);

        const upsert = await client.query(`
          INSERT INTO pessoas (tenant_id, nome, nome_norm, contato, foto, perfil, data_nascimento, release)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (tenant_id, nome_norm) DO UPDATE
            -- Atualiza foto/contato só se forem fornecidos (não sobrescreve com NULL)
            SET contato         = COALESCE(EXCLUDED.contato,         pessoas.contato),
                foto            = COALESCE(EXCLUDED.foto,            pessoas.foto),
                perfil          = COALESCE(EXCLUDED.perfil,          pessoas.perfil),
                data_nascimento = COALESCE(EXCLUDED.data_nascimento, pessoas.data_nascimento),
                release         = COALESCE(EXCLUDED.release,         pessoas.release),
                atualizado_em   = now()
          RETURNING id
        `, [
          req.tenantId,
          nome.trim(),
          nomeNorm,
          contato   || null,
          fotoUrl,
          perfil    || null,
          data_nascimento || null,
          release   || null,
        ]);

        pessoaId = upsert.rows[0].id;
      } else if (fotoUrl) {
        // Modo A com nova foto: atualiza só a foto da pessoa existente
        await client.query(
          'UPDATE pessoas SET foto = $1, atualizado_em = now() WHERE id = $2 AND tenant_id = $3',
          [fotoUrl, pessoaId, req.tenantId]
        );
      }

      // ── Cria o vínculo pessoa ↔ cidade ───────────────────────────────────
      // ON CONFLICT: se já existia (mesma pessoa na mesma cidade), atualiza métricas
      await client.query(`
        INSERT INTO liderancas
          (pessoa_id, tenant_id, cidade, regiao, mapa, expectativa_votos,
           status, responsavel, vinculo_politico)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (pessoa_id, cidade, tenant_id) DO UPDATE
          SET expectativa_votos = EXCLUDED.expectativa_votos,
              status            = EXCLUDED.status,
              responsavel       = EXCLUDED.responsavel,
              vinculo_politico  = EXCLUDED.vinculo_politico,
              regiao            = EXCLUDED.regiao,
              mapa              = EXCLUDED.mapa
      `, [
        pessoaId,
        req.tenantId,
        cidade,
        regiaoBody || req.user.regiao || null,
        mapa       || null,
        Number(expectativa_votos) || 0,
        status     || 'ativa',
        responsavel || null,
        vinculo_politico || null,
      ]);

      await client.query('COMMIT');
      try { await registrarAuditoria(req.user.id, 'CRIAR', 'lideranca', String(pessoaId)); } catch (_) {}

      res.json({ success: true, pessoa_id: pessoaId });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[POST /liderancas]', err);
      res.status(500).json({ error: 'Erro ao salvar liderança: ' + err.message });
    } finally {
      client.release();
    }
  }
);

// ────────────────────────────────────────────────────────────────────────────
//  EDITAR LIDERANÇA — PUT /api/liderancas/:id
//  :id é o ID da linha em liderancas (o vínculo pessoa ↔ cidade)
// ────────────────────────────────────────────────────────────────────────────
app.put('/api/liderancas/:id',
  auth,
  withTenant,
  allowAll(),
  upload.single('foto'),
  async (req, res) => {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const {
        nome, contato, perfil, data_nascimento, release,
        cidade, expectativa_votos, status, responsavel,
        vinculo_politico, regiao: regiaoBody, mapa,
      } = req.body;

      // Verifica permissão
      const atual = await dbGet(
        `SELECT l.*, p.nome AS p_nome FROM liderancas l
         JOIN pessoas p ON p.id = l.pessoa_id
         WHERE l.id = $1 AND l.tenant_id = $2`,
        [id, req.tenantId]
      );
      if (!atual) return res.status(404).json({ error: 'Não encontrado' });
      if (!isPrivileged(req.user.nivel) && atual.regiao !== req.user.regiao)
        return res.status(403).json({ error: 'Acesso negado' });

      // Upload de foto (se enviada)
      let fotoUrl = null;
      if (req.file) {
        const caminhoOtimizado = await otimizarImagem(req.file.path);
        const fileBuffer       = fs.readFileSync(caminhoOtimizado);
        const fileName         = `${Date.now()}.webp`;
        const { error }        = await supabase.storage
          .from('liderancas')
          .upload(fileName, fileBuffer, { contentType: 'image/webp', upsert: false });
        if (error) throw error;
        fotoUrl = supabase.storage.from('liderancas').getPublicUrl(fileName).data.publicUrl;
        try { fs.unlinkSync(caminhoOtimizado); } catch (_) {}
      }

      await client.query('BEGIN');

      // Atualiza dados pessoais em "pessoas"
      await client.query(`
        UPDATE pessoas SET
          nome            = COALESCE($1, nome),
          nome_norm       = COALESCE($2, nome_norm),
          contato         = COALESCE($3, contato),
          foto            = COALESCE($4, foto),
          perfil          = COALESCE($5, perfil),
          data_nascimento = COALESCE($6, data_nascimento),
          release         = COALESCE($7, release),
          atualizado_em   = now()
        WHERE id = $8 AND tenant_id = $9
      `, [
        nome    ? nome.trim()             : null,
        nome    ? normalizarNome(nome)    : null,
        contato || null,
        fotoUrl,
        perfil  || null,
        data_nascimento || null,
        release || null,
        atual.pessoa_id,
        req.tenantId,
      ]);

      // Atualiza dados do vínculo em "liderancas"
      await client.query(`
        UPDATE liderancas SET
          cidade            = COALESCE($1, cidade),
          expectativa_votos = COALESCE($2, expectativa_votos),
          status            = COALESCE($3, status),
          responsavel       = COALESCE($4, responsavel),
          vinculo_politico  = COALESCE($5, vinculo_politico),
          regiao            = COALESCE($6, regiao),
          mapa              = COALESCE($7, mapa)
        WHERE id = $8 AND tenant_id = $9
      `, [
        cidade            || null,
        expectativa_votos ? Number(expectativa_votos) : null,
        status            || null,
        responsavel       || null,
        vinculo_politico  || null,
        regiaoBody        || null,
        mapa              || null,
        id,
        req.tenantId,
      ]);

      await client.query('COMMIT');
      try { await registrarAuditoria(req.user.id, 'EDITAR', 'lideranca', id); } catch (_) {}

      res.json({ ok: true });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[PUT /liderancas]', err);
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  }
);

// ────────────────────────────────────────────────────────────────────────────
//  LISTAR LIDERANÇAS — GET /api/liderancas
//  Usa a view v_liderancas para manter compatibilidade com o frontend atual
// ────────────────────────────────────────────────────────────────────────────
app.get('/api/liderancas', auth, withTenant, async (req, res) => {
  try {
    const { cidade, regiao, mapa, status } = req.query;

    const filtros  = ['l.tenant_id = $1'];
    const params   = [req.tenantId];
    let   paramIdx = 2;

    // Restrição por região (lider_regiao só vê sua região)
    if (!isPrivileged(req.user.nivel) && req.user.regiao) {
      filtros.push(`l.regiao = $${paramIdx++}`);
      params.push(req.user.regiao);
    } else if (regiao) {
      filtros.push(`l.regiao = $${paramIdx++}`);
      params.push(regiao);
    }

    if (cidade) { filtros.push(`l.cidade ILIKE $${paramIdx++}`); params.push(`%${cidade}%`); }
    if (mapa)   { filtros.push(`l.mapa = $${paramIdx++}`);        params.push(mapa); }
    if (status) { filtros.push(`l.status = $${paramIdx++}`);      params.push(status); }

    const where = filtros.join(' AND ');

    const { rows } = await pool.query(`
      SELECT
        l.id,
        l.tenant_id,
        l.cidade,
        l.regiao,
        l.mapa,
        l.expectativa_votos,
        l.status,
        l.responsavel,
        l.vinculo_politico,
        l.createdat,
        l.pessoa_id,
        -- Dados pessoais
        p.nome,
        p.contato,
        p.foto,
        p.perfil,
        p.data_nascimento,
        p.release,
        -- Quantas cidades essa pessoa atua (útil para UI)
        (SELECT COUNT(*) FROM liderancas l2
         WHERE l2.pessoa_id = l.pessoa_id AND l2.tenant_id = l.tenant_id) AS total_cidades_pessoa
      FROM liderancas l
      JOIN pessoas p ON p.id = l.pessoa_id
      WHERE ${where}
      ORDER BY p.nome
    `, params);

    res.json(rows);
  } catch (err) {
    console.error('[GET /liderancas]', err);
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
//  EXCLUIR VÍNCULO — DELETE /api/liderancas/:id
//  Remove SOMENTE o vínculo pessoa↔cidade.
//  A pessoa em si (tabela pessoas) continua existindo.
// ────────────────────────────────────────────────────────────────────────────
app.delete('/api/liderancas/:id', auth, withTenant, allowAll(), async (req, res) => {
  try {
    const { id } = req.params;
    let result;

    if (isPrivileged(req.user.nivel)) {
      result = await pool.query(
        'DELETE FROM liderancas WHERE id = $1 AND tenant_id = $2',
        [id, req.tenantId]
      );
    } else {
      result = await pool.query(
        'DELETE FROM liderancas WHERE id = $1 AND regiao = $2 AND tenant_id = $3',
        [id, req.user.regiao, req.tenantId]
      );
    }

    if (result.rowCount === 0) return res.status(404).json({ error: 'Não encontrado' });
    try { await registrarAuditoria(req.user.id, 'EXCLUIR', 'lideranca', id); } catch (_) {}
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /liderancas]', err);
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
//  CIDADES DE UMA PESSOA — GET /api/pessoas/:id/cidades
//  Retorna todas as cidades onde a pessoa atua (para o modal de perfil)
// ────────────────────────────────────────────────────────────────────────────
app.get('/api/pessoas/:id/cidades', auth, withTenant, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT l.id, l.cidade, l.regiao, l.mapa,
             l.expectativa_votos, l.status, l.responsavel, l.vinculo_politico
      FROM liderancas l
      WHERE l.pessoa_id = $1 AND l.tenant_id = $2
      ORDER BY l.cidade
    `, [req.params.id, req.tenantId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
