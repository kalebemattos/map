const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcrypt');
const auth = require('./middleware/auth');
const withTenant = require('./middleware/withTenant');
const sharp = require('sharp');
const helmet = require('helmet');
const http = require('http');
const { Server: SocketServer } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');

// ── Cache de config por tenant (TTL 5 min) ───────────────────────────────────
const _tenantConfigCache = new Map();
const CONFIG_TTL_MS = 5 * 60 * 1000;

async function getConfigTenant(tenantId) {
  const cached = _tenantConfigCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  try {
    const [cfgRow, candidatos, mapas, regioes] = await Promise.all([
      dbGet('SELECT nome_sistema, logo_url, cores FROM tenant_config WHERE tenant_id = $1', [tenantId]),
      dbAll('SELECT chave, nome, cor_fundo, cor_texto, tem_votos_2022, foto_url FROM tenant_candidatos WHERE tenant_id = $1 ORDER BY ordem ASC', [tenantId]),
      dbAll('SELECT mapa_id AS id, nome, nivel_usuario, badge_fundo, badge_texto, subregioes, COALESCE(visivel, true) AS visivel FROM tenant_mapas WHERE tenant_id = $1', [tenantId]),
      dbAll('SELECT chave, label, cidades, lideres FROM tenant_regioes WHERE tenant_id = $1 ORDER BY ordem ASC', [tenantId]),
    ]);

    const data = {
      nome_sistema: cfgRow?.nome_sistema ?? 'Gestão Política',
      logo_url:     cfgRow?.logo_url     ?? null,
      cores:        cfgRow?.cores        ?? config.cores,
      candidatos:   candidatos.length    ? candidatos : config.candidatos,
      mapas:        mapas.length         ? mapas      : config.mapas,
      regioes:      regioes.length       ? regioes    : config.regioes,
    };

    _tenantConfigCache.set(tenantId, { data, expiresAt: Date.now() + CONFIG_TTL_MS });
    return data;

  } catch (err) {
    console.error(`[config] Erro ao carregar config do tenant ${tenantId}:`, err.message);
    return {
      nome_sistema: 'Gestão Política',
      logo_url:     null,
      cores:        config.cores,
      candidatos:   config.candidatos,
      mapas:        config.mapas,
      regioes:      config.regioes,
    };
  }
}

function invalidateTenantCache(tenantId) {
  _tenantConfigCache.delete(tenantId);
}

// Níveis de boot (derivados do config.js estático — usados antes do banco responder)
const NIVEIS_MAPA   = config.mapas.map(m => m.nivel_usuario);
const NIVEIS_TODOS  = ['dono', 'admin', 'visualizador', 'lider_regiao', ...NIVEIS_MAPA];

// NIVEIS_TODOS dinâmico por tenant (inclui níveis de mapas cadastrados no banco)
async function getNiveisTenant(tenantId) {
  try {
    const cfg = await getConfigTenant(tenantId);
    const niveisMapa = cfg.mapas.map(m => m.nivel_usuario);
    return ['dono', 'admin', 'visualizador', 'lider_regiao', ...niveisMapa];
  } catch {
    return NIVEIS_TODOS;
  }
}

function allow(...niveis) {
  return (req, res, next) => {
    if (!req.user || !niveis.includes(req.user.nivel)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    next();
  };
}
// Shortcut: permite todos os níveis conhecidos
function allowAll() { return allow(...NIVEIS_TODOS); }

// Helper: níveis com acesso irrestrito a dados (sem filtro de região)
function isPrivileged(nivel) { return nivel === 'dono' || nivel === 'admin'; }

const app = express();
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: [
          "'self'",
          "https://kalebemattos.github.io",
          "https://*.supabase.co",
          "https://*.100ms.live",
          "wss://*.100ms.live",
          "wss://paralaxgestao.online",
          "wss://www.paralaxgestao.online"
        ],
      }
    }
  })
);

const PORT = process.env.PORT || 10000;
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET não definido');
}
/* ================= VALIDAÇÃO DE ENV ================= */

const requiredEnvVars = [
  'JWT_SECRET',
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Variável obrigatória não definida: ${envVar}`);
    process.exit(1); // encerra o servidor
  }
}

console.log('✅ Variáveis de ambiente validadas com sucesso');

// Configuração Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Remove ?sslmode=* da URL para evitar que o pg-connection-string
// sobrescreva o ssl.rejectUnauthorized com 'verify-full'
const _dbUrl = new URL(process.env.DATABASE_URL);
_dbUrl.searchParams.delete('sslmode');
const pool = new Pool({
  connectionString: _dbUrl.toString(),
  ssl: { rejectUnauthorized: false }
});

async function dbAll(sql, params = []) {
  const r = await pool.query(sql, params);
  return r.rows;
}
async function registrarAuditoria(usuarioId, acao, entidade, entidadeId) {
  await pool.query(
    `INSERT INTO auditoria (usuario_id, acao, entidade, entidade_id)
     VALUES ($1, $2, $3, $4)`,
    [usuarioId, acao, entidade, entidadeId]
  );
}

pool.query('select current_database(), inet_server_addr()')
  .then(r => console.log('DB:', r.rows))
  .catch(e => console.error('DB ERR', e));

async function dbGet(sql, params = []) {
  const r = await pool.query(sql, params);
  return r.rows[0];
}

async function dbRun(sql, params = []) {
  await pool.query(sql, params);
}

// 🔐 ================= VALIDAÇÕES =================

function validarTexto(valor, max = 255) {
  if (typeof valor !== 'string') return false;
  if (valor.length === 0) return false;
  if (valor.length > max) return false;
  return true;
}

function validarNumero(valor, min = 0, max = 100000000) {
  const n = Number(valor);
  if (isNaN(n)) return false;
  if (n < min) return false;
  if (n > max) return false;
  return true;
}

/* ================= CONFIG ================= */
const allowedOrigins = [
  'https://kalebemattos.github.io',
  'http://paralaxgestao.online',
  'https://paralaxgestao.online',
  'http://www.paralaxgestao.online',
  'https://www.paralaxgestao.online',
  'null', // Android WebView (file:// assets)
];

app.use(cors({
  origin: function (origin, callback) {
    // Permite origens listadas, o Android WebView (file:// envia 'null' ou
    // ausente dependendo da versão do SO) e ausência de Origin.
    if (!origin || origin === 'null' || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Não permitido por CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.set('trust proxy', 1);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // 5 tentativas por IP
  message: { error: 'Muitas tentativas. Tente novamente mais tarde.' },
  standardHeaders: true,
  legacyHeaders: false
});
const createUserLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutos
  max: 20,
  message: { error: 'Limite de criação de usuários atingido. Tente novamente mais tarde.' },
  standardHeaders: true,
  legacyHeaders: false
});

const createLiderancaLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 50,
  message: { error: 'Muitas criações de liderança. Aguarde alguns minutos.' },
  standardHeaders: true,
  legacyHeaders: false
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 30,                   // 30 renovações por IP por janela
  message: { error: 'Muitas renovações de token. Tente novamente mais tarde.' },
  standardHeaders: true,
  legacyHeaders: false
});


/* ================= PATHS & GARANTIAS ================= */
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR);
}

/* ================= UPLOAD CONFIG ================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, name + ext);
  }
});
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB máximo
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido. Use JPEG, PNG, WEBP ou GIF.'));
    }
  }
});
async function otimizarImagem(caminhoArquivo) {
  const caminhoFinal = caminhoArquivo + '.webp';

  await sharp(caminhoArquivo)
    .resize({
      width: 1200,
      withoutEnlargement: true
    })
    .webp({ quality: 80 })
    .toFile(caminhoFinal);

  fs.unlinkSync(caminhoArquivo);

  return caminhoFinal;
}

/* ================= CONFIG PÚBLICA ================= */
// Sem autenticação — identifica o tenant pelo JWT (se presente) ou ?tenant=xxx
app.get('/api/config', async (req, res) => {
  try {
    let tenantId = req.query.tenant ?? null;

    const authHeader = req.headers.authorization ?? '';
    if (!tenantId && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
        tenantId = decoded.tenantId ?? null;
      } catch { /* token inválido — usa query param ou fallback */ }
    }

    if (!tenantId) {
      // Sem tenant identificado: retorna config estática (tela de login)
      return res.json({
        candidatos: config.candidatos,
        cores:      config.cores,
        mapas:      config.mapas.map(({ id, nome, nivel_usuario, subregioes }) => ({ id, nome, nivel_usuario, subregioes })),
        regioes:    config.regioes.map(({ chave, label, cidades, lideres }) => ({ chave, label, cidades, lideres })),
      });
    }

    const cfg = await getConfigTenant(tenantId);

    res.json({
      nome_sistema: cfg.nome_sistema,
      logo_url:     cfg.logo_url,
      cores:        cfg.cores,
      candidatos:   cfg.candidatos,
      mapas:        cfg.mapas.map(({ id, nome, nivel_usuario, badge_fundo, badge_texto, subregioes }) => ({
        id, nome, nivel_usuario, badge_fundo, badge_texto, subregioes,
      })),
      regioes:      cfg.regioes.map(({ chave, label, cidades, lideres }) => ({
        chave, label, cidades, lideres,
      })),
    });

  } catch (err) {
    console.error('[GET /api/config]', err);
    res.status(500).json({ error: 'Erro ao carregar configuração' });
  }
});

/* ================= LOGIN ================= */
app.post('/api/login', loginLimiter, async (req, res) => {
  const { usuario, senha } = req.body;

if (!usuario || !senha) {
  return res.status(400).json({ error: 'Dados incompletos' });
}

  try {
    // Procure por: SELECT id, usuario, senha_hash, nome FROM usuarios...
// E troque por:
const user = await dbGet(
  'SELECT id, usuario, senha_hash, nome, nivel, regiao_vinculada, tenant_id FROM usuarios WHERE usuario = $1',
  [usuario]
);

    if (!user) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    const ok = await bcrypt.compare(senha, user.senha_hash);

    if (!ok) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

  delete user.senha_hash;



const accessToken = jwt.sign(
  {
    id: user.id,
    nivel: user.nivel,
    role: user.nivel,
    regiao: user.regiao_vinculada,
    tenantId: user.tenant_id   // 🔥 ESSENCIAL
  },
  process.env.JWT_SECRET,
  { expiresIn: '15m' }
);

const refreshToken = jwt.sign(
  { id: user.id },
  process.env.JWT_SECRET,
  { expiresIn: '30d' }
);

// salva no banco
await pool.query(
  `INSERT INTO refresh_tokens (usuario_id, token, expira_em, tenant_id)
VALUES ($1, $2, NOW() + INTERVAL '30 days', $3)`,
  [user.id, refreshToken, user.tenant_id]
);


res.json({
  accessToken,
  refreshToken,
  user: {
    id: user.id,
    nome: user.nome,
    nivel: user.nivel,
    regiao: user.regiao_vinculada
  }
});

  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});
/* ================= REFRESH TOKEN ================= */
app.post('/api/refresh', refreshLimiter, async (req, res) => {

  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token ausente' });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

    

const user = await dbGet(
  'SELECT id, nivel, regiao_vinculada, tenant_id FROM usuarios WHERE id = $1',
  [decoded.id]
);

    if (!user) {
      return res.status(403).json({ error: 'Usuário não encontrado' });
    }

    const row = await dbGet(
      `SELECT * FROM refresh_tokens 
       WHERE token = $1 AND usuario_id = $2 AND tenant_id = $3`,
      [refreshToken, decoded.id, user.tenant_id]
    );

    if (!row) {
      return res.status(403).json({ error: 'Refresh inválido' });
    }

    const novoAccessToken = jwt.sign(
      {
        id: decoded.id,
        nivel: user.nivel,
        role: user.nivel,
        regiao: user.regiao_vinculada,
        tenantId: user.tenant_id
      },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({ accessToken: novoAccessToken });

  } catch (err) {
    return res.status(403).json({ error: 'Refresh inválido ou expirado' });
  }
});
/* ================= EXPECTATIVA DA CIDADE ================= */

// Helper: salva expectativas JSONB de forma dinâmica (qualquer mapa)
async function salvarExpectativaHelper(cidade, expectativas, regiao, mapa, tenantId) {
  // expectativas = { chave1: valor1, chave2: valor2, ... }
  const exp = {};
  for (const [k, v] of Object.entries(expectativas || {})) {
    exp[k] = Number(v) || 0;
  }
  // Mantém compat: se vieram as chaves legadas celia/fernando, atualiza colunas antigas também
  const legCelia    = exp.celia    ?? null;
  const legFernando = exp.fernando ?? null;

  await pool.query(
    `INSERT INTO expectativa_cidade
     (cidade, expectativa_celia, expectativa_fernando, expectativas, regiao, mapa, tenant_id)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
     ON CONFLICT (cidade, regiao, mapa, tenant_id)
     DO UPDATE SET
       expectativa_celia    = COALESCE($2, expectativa_cidade.expectativa_celia),
       expectativa_fernando = COALESCE($3, expectativa_cidade.expectativa_fernando),
       expectativas         = $4::jsonb`,
    [cidade, legCelia, legFernando, JSON.stringify(exp), regiao, mapa, tenantId]
  );
}

app.post('/api/expectativa-cidade', auth, withTenant, async (req, res) => {
  const { cidade, expectativas } = req.body;
  if (!cidade) return res.status(400).json({ error: 'Cidade não informada' });
  try {
    await salvarExpectativaHelper(cidade, expectativas, req.user.regiao, 'rj', req.tenantId);
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro expectativa-cidade POST:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.get('/api/expectativa-cidade', auth, withTenant, async (req, res) => {
  try {
    const { cidade } = req.query;
    if (!cidade) return res.status(400).json({ error: 'Cidade não informada' });

    const query = isPrivileged(req.user.nivel)
      ? `SELECT expectativas FROM expectativa_cidade WHERE cidade = $1 AND tenant_id = $2`
      : `SELECT expectativas FROM expectativa_cidade WHERE cidade = $1 AND LOWER(regiao) = LOWER($2) AND tenant_id = $3`;
    const params = isPrivileged(req.user.nivel)
      ? [cidade, req.tenantId]
      : [cidade, req.user.regiao, req.tenantId];

    const row = await dbGet(query, params);
    res.json({ expectativas: row?.expectativas || {} });
  } catch (err) {
    console.error('Erro expectativa-cidade GET:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ── Normalização de nomes (dedup lideranças) ─────────────────────────────────
function normalizarNome(str) {
  return (str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/\s+/g, ' ');
}

/* ================= GASTOS POR LIDERANÇA ================= */
app.post('/api/gastos',
  auth,
  withTenant,
  allowAll(),
  async (req, res) => {

  try {

    const { lideranca_id, valor, descricao } = req.body;
    const usuario = req.user.id; // ou req.user.nome

if (!lideranca_id || valor == null) {
  return res.status(400).json({ error: 'Dados incompletos' });
}

const valorNumerico = Number(valor);

if (isNaN(valorNumerico)) {
  return res.status(400).json({ error: 'Valor inválido' });
}

if (valorNumerico <= 0) {
  return res.status(400).json({ error: 'Valor deve ser positivo' });
}

    // 🔎 1️⃣ Verifica se a liderança existe e pertence ao tenant
    const lideranca = await dbGet(
      'SELECT regiao FROM liderancas WHERE id = $1 AND tenant_id = $2',
      [lideranca_id, req.tenantId]
    );

    if (!lideranca) {
      return res.status(404).json({ error: 'Liderança não encontrada' });
    }

    // 🔒 2️⃣ Validação de multi-tenant
    if (
      !isPrivileged(req.user.nivel) &&
      lideranca.regiao !== req.user.regiao
    ) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    // 📝 3️⃣ Inserção segura
    const data = new Date().toISOString();

    await pool.query(
  `
  INSERT INTO gastos_lideranca
  (lideranca_id, valor, descricao, data, usuario)
  VALUES ($1, $2, $3, $4, $5)
  `,
  [lideranca_id, valorNumerico, descricao, data, usuario]
);

    res.json({ ok: true });

  } catch (err) {
    console.error('Erro ao inserir gasto:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});


app.get('/api/gastos/:lideranca_id', auth, withTenant, async (req, res) => {
  try {
    const query = `
      SELECT g.*
      FROM gastos_lideranca g
      JOIN liderancas l ON g.lideranca_id = l.id
      WHERE g.lideranca_id = $1
        AND l.tenant_id = $2
        AND ($3 OR LOWER(l.regiao) = LOWER($4))
      ORDER BY g.id DESC
    `;
    const rows = await pool.query(query, [
      req.params.lideranca_id,
      req.tenantId,
      isPrivileged(req.user.nivel),
      req.user.regiao
    ]);
    res.json(rows.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar gastos' });
  }
});


app.get('/api/gastos-total/:lideranca_id', auth, withTenant, async (req, res) => {
  try {
    const query = `
      SELECT SUM(g.valor) as total
      FROM gastos_lideranca g
      JOIN liderancas l ON g.lideranca_id = l.id
      WHERE g.lideranca_id = $1
        AND l.tenant_id = $2
        AND ($3 OR LOWER(l.regiao) = LOWER($4))
    `;
    const row = await dbGet(query, [
      req.params.lideranca_id,
      req.tenantId,
      isPrivileged(req.user.nivel),
      req.user.regiao
    ]);
    res.json({ total: row?.total || 0 });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao calcular total' });
  }
});


/* ================= AUTOCOMPLETE DE PESSOAS ================= */
app.get('/api/pessoas/buscar', auth, withTenant, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    const norm = normalizarNome(q);
    const { rows } = await pool.query(`
      SELECT
        p.id, p.nome, p.foto, p.contato, p.perfil,
        COUNT(l.id) AS total_cidades,
        ARRAY_AGG(l.cidade ORDER BY l.cidade) FILTER (WHERE l.cidade IS NOT NULL) AS cidades
      FROM pessoas p
      LEFT JOIN liderancas l ON l.pessoa_id = p.id AND l.tenant_id = p.tenant_id
      WHERE p.tenant_id = $1 AND p.nome_norm ILIKE $2
      GROUP BY p.id
      ORDER BY
        CASE WHEN p.nome_norm = $3 THEN 0 WHEN p.nome_norm LIKE $4 THEN 1 ELSE 2 END,
        COUNT(l.id) DESC, p.nome
      LIMIT 10
    `, [req.tenantId, `%${norm}%`, norm, `${norm}%`]);
    res.json(rows);
  } catch (err) {
    console.error('[pessoas/buscar]', err);
    res.status(500).json({ error: err.message });
  }
});

/* ================= CRIAR LIDERANÇA ================= */
app.post('/api/liderancas',
  createLiderancaLimiter,
  auth,
  withTenant,
  allowAll(),
  upload.single('foto'),
  async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      pessoa_id: pessoaIdRaw, nome, cidade, contato, perfil,
      expectativa_votos, responsavel, status, release,
      vinculo_politico, regiao: regiaoBody, data_nascimento, mapa
    } = req.body;

    if (!validarTexto(cidade, 120))
      return res.status(400).json({ error: 'Cidade inválida' });

    const pessoaIdFornecido = pessoaIdRaw ? Number(pessoaIdRaw) : null;
    if (!pessoaIdFornecido && !validarTexto(nome, 120))
      return res.status(400).json({ error: 'Nome inválido (ou forneça pessoa_id)' });
    if (contato && !validarTexto(contato, 120))
      return res.status(400).json({ error: 'Contato inválido' });
    if (expectativa_votos && !validarNumero(expectativa_votos, 0, 1000000))
      return res.status(400).json({ error: 'Expectativa inválida' });

    // Upload de foto
    let fotoUrl = null;
    if (req.file) {
      const caminhoOtimizado = await otimizarImagem(req.file.path);
      const fileBuffer = fs.readFileSync(caminhoOtimizado);
      const fileName = `${Date.now()}.webp`;
      const { error } = await supabase.storage
        .from('liderancas').upload(fileName, fileBuffer, { contentType: 'image/webp', upsert: false });
      if (error) throw error;
      fotoUrl = supabase.storage.from('liderancas').getPublicUrl(fileName).data.publicUrl;
      try { fs.unlinkSync(caminhoOtimizado); } catch (_) {}
    }

    await client.query('BEGIN');

    let pessoaId = pessoaIdFornecido;

    if (!pessoaId) {
      // Cria ou recupera pessoa pelo nome normalizado
      const upsert = await client.query(`
        INSERT INTO pessoas (tenant_id, nome, nome_norm, contato, foto, perfil, data_nascimento, release)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (tenant_id, nome_norm) DO UPDATE
          SET contato         = COALESCE(EXCLUDED.contato,         pessoas.contato),
              foto            = COALESCE(EXCLUDED.foto,            pessoas.foto),
              perfil          = COALESCE(EXCLUDED.perfil,          pessoas.perfil),
              data_nascimento = COALESCE(EXCLUDED.data_nascimento, pessoas.data_nascimento),
              release         = COALESCE(EXCLUDED.release,         pessoas.release),
              atualizado_em   = now()
        RETURNING id
      `, [req.tenantId, nome.trim(), normalizarNome(nome),
          contato || null, fotoUrl, perfil || null,
          data_nascimento || null, release || null]);
      pessoaId = upsert.rows[0].id;
    } else if (fotoUrl) {
      await client.query(
        'UPDATE pessoas SET foto=$1, atualizado_em=now() WHERE id=$2 AND tenant_id=$3',
        [fotoUrl, pessoaId, req.tenantId]
      );
    }

    // Cria vínculo pessoa ↔ cidade
    await client.query(`
      INSERT INTO liderancas
        (pessoa_id, tenant_id, cidade, regiao, mapa, expectativa_votos, status, responsavel, vinculo_politico)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (pessoa_id, cidade, tenant_id) DO UPDATE
        SET expectativa_votos = EXCLUDED.expectativa_votos,
            status            = EXCLUDED.status,
            responsavel       = EXCLUDED.responsavel,
            vinculo_politico  = EXCLUDED.vinculo_politico,
            regiao            = EXCLUDED.regiao,
            mapa              = EXCLUDED.mapa
    `, [pessoaId, req.tenantId, cidade,
        regiaoBody || req.user.regiao || null,
        mapa || null, Number(expectativa_votos) || 0,
        status || 'ativa', responsavel || null, vinculo_politico || null]);

    await client.query('COMMIT');
    try { await registrarAuditoria(req.user.id, 'CRIAR', 'lideranca', String(pessoaId)); } catch (_) {}
    res.json({ success: true, pessoa_id: pessoaId });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao salvar liderança:', err);
    res.status(500).json({ error: 'Erro ao salvar liderança: ' + err.message });
  } finally { client.release(); }
});

/* ================= EXCLUIR LIDERANÇA ================= */
app.delete('/api/liderancas/:id', auth, withTenant, allowAll(), async (req, res) => {
  try {
    const { id } = req.params;
    let result;
    if (isPrivileged(req.user.nivel)) {
      result = await pool.query('DELETE FROM liderancas WHERE id=$1 AND tenant_id=$2', [id, req.tenantId]);
    } else {
      result = await pool.query('DELETE FROM liderancas WHERE id=$1 AND regiao=$2 AND tenant_id=$3',
        [id, req.user.regiao, req.tenantId]);
    }
    if (result.rowCount === 0) return res.status(404).json({ error: 'Não encontrado' });
    try { await registrarAuditoria(req.user.id, 'EXCLUIR', 'lideranca', id); } catch (_) {}
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao excluir liderança:', err);
    res.status(500).json({ error: 'Erro ao excluir liderança: ' + err.message });
  }
});

/* ================= EDITAR LIDERANÇA ================= */
app.put('/api/liderancas/:id', auth, withTenant, allowAll(), upload.single('foto'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const {
      nome, contato, cidade, expectativa_votos, perfil, responsavel,
      status, release, vinculo_politico, regiao: regiaoBody, data_nascimento, mapa
    } = req.body;

    if (!validarTexto(cidade, 120)) return res.status(400).json({ error: 'Cidade inválida' });
    if (!validarTexto(nome, 120))   return res.status(400).json({ error: 'Nome inválido' });
    if (contato && !validarTexto(contato, 120)) return res.status(400).json({ error: 'Contato inválido' });
    if (expectativa_votos && !validarNumero(expectativa_votos, 0, 1000000))
      return res.status(400).json({ error: 'Expectativa inválida' });

    const atual = await dbGet(
      'SELECT l.*, p.foto AS p_foto FROM liderancas l JOIN pessoas p ON p.id=l.pessoa_id WHERE l.id=$1 AND l.tenant_id=$2',
      [id, req.tenantId]
    );
    if (!atual) return res.status(404).json({ error: 'Liderança não encontrada' });
    if (!isPrivileged(req.user.nivel) && atual.regiao !== req.user.regiao)
      return res.status(403).json({ error: 'Acesso negado' });

    let fotoUrl = null;
    if (req.file) {
      const caminhoOtimizado = await otimizarImagem(req.file.path);
      const fileBuffer = fs.readFileSync(caminhoOtimizado);
      const fileName = `${Date.now()}.webp`;
      const { error } = await supabase.storage
        .from('liderancas').upload(fileName, fileBuffer, { contentType: 'image/webp', upsert: false });
      if (error) throw error;
      fotoUrl = supabase.storage.from('liderancas').getPublicUrl(fileName).data.publicUrl;
      try { fs.unlinkSync(caminhoOtimizado); } catch (_) {}
    }

    await client.query('BEGIN');

    // Atualiza dados pessoais em pessoas
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
      WHERE id=$8 AND tenant_id=$9
    `, [nome ? nome.trim() : null, nome ? normalizarNome(nome) : null,
        contato || null, fotoUrl,
        perfil || null, data_nascimento || null, release || null,
        atual.pessoa_id, req.tenantId]);

    // Atualiza vínculo em liderancas
    const result = await client.query(`
      UPDATE liderancas SET
        cidade           = COALESCE($1, cidade),
        expectativa_votos= COALESCE($2, expectativa_votos),
        status           = COALESCE($3, status),
        responsavel      = COALESCE($4, responsavel),
        vinculo_politico = COALESCE($5, vinculo_politico),
        regiao           = COALESCE($6, regiao),
        mapa             = COALESCE($7, mapa)
      WHERE id=$8 AND tenant_id=$9
      AND (regiao=$6 OR $10=ANY(ARRAY['dono','admin']))
    `, [cidade || null,
        expectativa_votos ? Number(expectativa_votos) : null,
        status || null, responsavel || null, vinculo_politico || null,
        regiaoBody || req.user.regiao, mapa || null,
        id, req.tenantId, req.user.nivel]);

    if (result.rowCount === 0)
      return res.status(404).json({ error: 'Não encontrado ou sem permissão' });

    await client.query('COMMIT');
    try { await registrarAuditoria(req.user.id, 'EDITAR', 'lideranca', id); } catch (_) {}
    res.json({ success: true });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Erro ao editar liderança: ' + err.message });
  } finally { client.release(); }
});

/* ================= BUSCAR LIDERANÇAS ================= */
// Mantém o formato agrupado por cidade que o frontend espera:
// [{ cidade, liderancas: [...] }]
app.get('/api/liderancas', auth, withTenant, async (req, res) => {
  try {
    const mapaFiltro = req.query.mapa || null;
    const params = mapaFiltro ? [req.tenantId, mapaFiltro] : [req.tenantId];
    const mapaClause = mapaFiltro ? 'AND l.mapa = $2' : '';

    const { rows } = await pool.query(`
      SELECT
        l.cidade,
        json_agg(json_build_object(
          'id',               l.id,
          'cidade',           l.cidade,
          'regiao',           l.regiao,
          'mapa',             l.mapa,
          'expectativa_votos',l.expectativa_votos,
          'status',           l.status,
          'responsavel',      l.responsavel,
          'vinculo_politico', l.vinculo_politico,
          'createdat',        l.createdat,
          'pessoa_id',        l.pessoa_id,
          'nome',             p.nome,
          'contato',          p.contato,
          'foto',             p.foto,
          'perfil',           p.perfil,
          'data_nascimento',  p.data_nascimento,
          'release',          p.release
        ) ORDER BY p.nome) AS liderancas
      FROM liderancas l
      JOIN pessoas p ON p.id = l.pessoa_id
      WHERE l.tenant_id = $1 ${mapaClause}
      GROUP BY l.cidade
      ORDER BY l.cidade
    `, params);

    res.json(rows);
  } catch (err) {
    console.error('[GET /liderancas]', err);
    res.status(500).json({ error: 'Erro ao buscar lideranças' });
  }
});


/* ================= BUSCAR OBSERVAÇÕES ================= */
app.get('/api/observacoes', auth, withTenant, async (req, res) => {
  try {
    let query, params;

    if (isPrivileged(req.user.nivel)) {
      query  = `SELECT cidade, json_agg(o.*) AS observacoes FROM observacoes o WHERE o.tenant_id = $1 GROUP BY cidade`;
      params = [req.tenantId];
    } else {
      query  = `SELECT cidade, json_agg(o.*) AS observacoes FROM observacoes o WHERE LOWER(o.regiao) = LOWER($1) AND o.tenant_id = $2 GROUP BY cidade`;
      params = [req.user.regiao, req.tenantId];
    }

    const result = await pool.query(query, params);
    res.json(result.rows);

  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar observações' });
  }
});


app.post('/api/observacoes',
  auth,
  withTenant,
  allowAll(),
  async (req, res) => {
  try {
    const { cidade, text } = req.body;
    if (!cidade || !text) return res.status(400).json({ error: 'Dados incompletos' });

    await pool.query(
      'INSERT INTO observacoes (cidade, text, regiao, tenant_id) VALUES ($1, $2, $3, $4)',
      [cidade, text, req.user.regiao, req.tenantId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao salvar observação:', err);
    res.status(500).json({ error: 'Erro ao salvar observação' });
  }
});

app.delete('/api/observacoes/:id',
  auth,
  withTenant,
  allowAll(),
  async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM observacoes
       WHERE id = $1
         AND tenant_id = $2
         AND (regiao = $3 OR $4 = ANY(ARRAY['dono','admin']))`,
      [id, req.tenantId, req.user.regiao, req.user.nivel]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Não encontrado' });
    }

    res.json({ ok: true });

  } catch (err) {
    console.error('Erro ao excluir observação:', err);
    res.status(500).json({ error: 'Erro ao excluir observação' });
  }
});

/* ================= COMPATIBILIDADE / OUTROS ================= */
app.get('/api/data', auth, withTenant, async (req, res) => {
  try {

    let liderancasQuery;
    let observacoesQuery;
    let params = [];

    if (isPrivileged(req.user.nivel)) {
      liderancasQuery  = 'SELECT * FROM liderancas WHERE tenant_id = $1';
      observacoesQuery = 'SELECT * FROM observacoes WHERE tenant_id = $1';
      params = [req.tenantId];
    } else {
      liderancasQuery  = 'SELECT * FROM liderancas WHERE LOWER(regiao) = LOWER($1) AND tenant_id = $2';
      observacoesQuery = 'SELECT * FROM observacoes WHERE LOWER(regiao) = LOWER($1) AND tenant_id = $2';
      params = [req.user.regiao, req.tenantId];
    }

    const liderancas  = await pool.query(liderancasQuery,  params);
    const observacoes = await pool.query(observacoesQuery, params);

    res.json({
      liderancas:  liderancas.rows,
      observacoes: observacoes.rows
    });

  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar dados' });
  }
});


app.get('/api/expectativa-cidade-todas', auth, withTenant, async (req, res) => {
  const rows = await dbAll(
    `SELECT cidade, expectativas FROM expectativa_cidade WHERE mapa = 'rj' AND tenant_id = $1`,
    [req.tenantId]
  );
  res.json(rows);
});




// ─── EXPECTATIVA ANGRA (isolada por mapa='angra') ───────────────────────────

app.post('/api/expectativa-angra', auth, withTenant, async (req, res) => {
  const { cidade, expectativas } = req.body;
  if (!cidade) return res.status(400).json({ error: 'Cidade não informada' });
  try {
    await salvarExpectativaHelper(cidade, expectativas, req.user.regiao, 'angra', req.tenantId);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erro interno' }); }
});

app.get('/api/expectativa-angra', auth, withTenant, async (req, res) => {
  const { cidade } = req.query;
  if (!cidade) return res.status(400).json({ error: 'Cidade não informada' });
  const row = await dbGet(
    `SELECT expectativas FROM expectativa_cidade WHERE cidade = $1 AND mapa = 'angra' AND tenant_id = $2`,
    [cidade, req.tenantId]
  );
  res.json({ expectativas: row?.expectativas || {} });
});

app.get('/api/expectativa-angra-todas', auth, withTenant, async (req, res) => {
  const rows = await dbAll(
    `SELECT cidade, expectativas FROM expectativa_cidade WHERE mapa = 'angra' AND tenant_id = $1`,
    [req.tenantId]
  );
  res.json(rows);
});

// ─── EXPECTATIVA RJ CAPITAL (isolada por mapa='rjcapital') ──────────────────

app.post('/api/expectativa-rjcapital', auth, withTenant, async (req, res) => {
  const { cidade, expectativas } = req.body;
  if (!cidade) return res.status(400).json({ error: 'Cidade não informada' });
  try {
    await salvarExpectativaHelper(cidade, expectativas, req.user.regiao, 'rjcapital', req.tenantId);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erro interno' }); }
});

app.get('/api/expectativa-rjcapital', auth, withTenant, async (req, res) => {
  const { cidade } = req.query;
  if (!cidade) return res.status(400).json({ error: 'Cidade não informada' });
  const row = await dbGet(
    `SELECT expectativas FROM expectativa_cidade WHERE cidade = $1 AND mapa = 'rjcapital' AND tenant_id = $2`,
    [cidade, req.tenantId]
  );
  res.json({ expectativas: row?.expectativas || {} });
});

app.get('/api/expectativa-rjcapital-todas', auth, withTenant, async (req, res) => {
  const rows = await dbAll(
    `SELECT cidade, expectativas FROM expectativa_cidade WHERE mapa = 'rjcapital' AND tenant_id = $1`,
    [req.tenantId]
  );
  res.json(rows);
});

// ─── EXPECTATIVA PIRAÍ (isolada por mapa='pirai') ────────────────────────────

app.post('/api/expectativa-pirai', auth, withTenant, async (req, res) => {
  const { cidade, expectativas } = req.body;
  if (!cidade) return res.status(400).json({ error: 'Cidade não informada' });
  try {
    await salvarExpectativaHelper(cidade, expectativas, req.user.regiao, 'pirai', req.tenantId);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erro interno' }); }
});

app.get('/api/expectativa-pirai', auth, withTenant, async (req, res) => {
  const { cidade } = req.query;
  if (!cidade) return res.status(400).json({ error: 'Cidade não informada' });
  const row = await dbGet(
    `SELECT expectativas FROM expectativa_cidade WHERE cidade = $1 AND mapa = 'pirai' AND tenant_id = $2`,
    [cidade, req.tenantId]
  );
  res.json({ expectativas: row?.expectativas || {} });
});

app.get('/api/expectativa-pirai-todas', auth, withTenant, async (req, res) => {
  const rows = await dbAll(
    `SELECT cidade, expectativas FROM expectativa_cidade WHERE mapa = 'pirai' AND tenant_id = $1`,
    [req.tenantId]
  );
  res.json(rows);
});

app.post('/api/pins',
  auth,
  withTenant,
  allowAll(),
  async (req, res) => {

  const { cidade, tipo, lat, lng, descricao } = req.body;

  // 🔎 Validação básica
  if (!cidade || !tipo || lat == null || lng == null) {
    return res.status(400).json({
      error: 'Cidade, tipo, latitude e longitude são obrigatórios'
    });
  }

  // 🔎 Validação numérica
  if (isNaN(Number(lat)) || isNaN(Number(lng))) {
    return res.status(400).json({
      error: 'Latitude e longitude inválidas'
    });
  }

  await pool.query(
    `
    INSERT INTO pins (cidade, tipo, lat, lng, descricao, regiao, tenant_id)
VALUES ($1,$2,$3,$4,$5,$6,$7)
    `,
    [
  cidade,
  tipo,
  Number(lat),
  Number(lng),
  descricao || null,
  req.user.regiao,
  req.tenantId   
]
  );

  res.json({ ok: true });
});


app.get('/api/pins', auth, withTenant, async (req, res) => {
  try {
    let query, params;

    if (isPrivileged(req.user.nivel)) {
      query  = `SELECT * FROM pins WHERE tenant_id = $1 ORDER BY id DESC`;
      params = [req.tenantId];
    } else {
      query  = `
        SELECT * FROM pins 
        WHERE LOWER(regiao) = LOWER($1)
        AND tenant_id = $2
        ORDER BY id DESC
      `;
      params = [req.user.regiao, req.tenantId];
    }

    const r = await pool.query(query, params);
    res.json(r.rows);

  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar pins' });
  }
});


app.delete('/api/pins/:id',
  auth,
  withTenant,
  allowAll(),
  async (req, res) => {

  const id = req.params.id;
  let result;

  if (isPrivileged(req.user.nivel)) {
    result = await pool.query(
      'DELETE FROM pins WHERE id = $1 AND tenant_id = $2',
      [id, req.tenantId]
    );
  } else {
    result = await pool.query(
      'DELETE FROM pins WHERE id = $1 AND regiao = $2 AND tenant_id = $3',
      [id, req.user.regiao, req.tenantId]
    );
  }

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Não encontrado' });
  }

  res.json({ ok: true });

});
app.put('/api/pins/:id',
  auth,
  withTenant,
  allowAll(),
  async (req, res) => {

  const { id } = req.params;
  const { descricao, tipo } = req.body;

  try {

    let result;

    if (isPrivileged(req.user.nivel)) {
      result = await pool.query(
        `
        UPDATE pins
        SET
          descricao = COALESCE($1, descricao),
          tipo = COALESCE($2, tipo)
        WHERE id = $3 AND tenant_id = $4
        `,
        [descricao, tipo, id, req.tenantId]
      );
    } else {
      result = await pool.query(
        `
        UPDATE pins
        SET
          descricao = COALESCE($1, descricao),
          tipo = COALESCE($2, tipo)
        WHERE id = $3
        AND regiao = $4
        AND tenant_id = $5
        `,
        [descricao, tipo, id, req.user.regiao, req.tenantId]
      );
    }

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Pin não encontrado' });
    }

    res.json({ ok: true });

  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar pin' });
  }
});

// Rota para o Dono criar novos usuários
app.post('/api/usuarios',
  createUserLimiter,
  auth,
  withTenant,
  allow('dono'),
  async (req, res) => {

  try {
    const { usuario, senha, nome, nivel, regiao_vinculada } = req.body;
    // 🔎 Validação básica
const precisaRegiao = nivel !== 'admin' && nivel !== 'dono';
if (!usuario || !senha || !nivel || (precisaRegiao && !regiao_vinculada)) {
  return res.status(400).json({
    error: precisaRegiao
      ? 'Usuario, senha, nivel e regiao_vinculada são obrigatórios'
      : 'Usuario, senha e nivel são obrigatórios'
  });
}
const niveisPermitidos = NIVEIS_TODOS;

if (!niveisPermitidos.includes(nivel)) {
  return res.status(400).json({
    error: 'Nivel inválido'
  });
}

    
    // Verifica se o usuário já existe dentro do tenant
    const existe = await dbGet('SELECT id FROM usuarios WHERE usuario = $1 AND tenant_id = $2', [usuario, req.tenantId]);
    if (existe) {
      return res.status(400).json({ error: 'Este login já está em uso.' });
    }

    // Cria a senha protegida (hash)
    const saltRounds = 10;
    const hash = await bcrypt.hash(senha, saltRounds);

    // Salva no banco de dados
    await pool.query(
      'INSERT INTO usuarios (usuario, senha_hash, nome, nivel, regiao_vinculada, tenant_id) VALUES ($1, $2, $3, $4, $5, $6)',
      [usuario, hash, nome, nivel, regiao_vinculada, req.tenantId]
    );

    res.json({ ok: true, message: 'Usuário criado com sucesso!' });
  } catch (err) {
    console.error('Erro ao criar usuário:', err);
    res.status(500).json({ error: 'Erro interno ao criar usuário.' });
  }
});

app.get('/api/usuarios',
  auth,
  withTenant,
  allow('dono'),
  async (req, res) => {
  try {
    const users = await dbAll(
      'SELECT id, usuario, nome, nivel, regiao_vinculada FROM usuarios WHERE tenant_id = $1',
      [req.tenantId]
    );
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar usuários.' });
  }
});

// Rota para editar usuário
app.put('/api/usuarios/:id', auth, withTenant, allow('dono'), async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, nivel, regiao_vinculada, senha } = req.body;

    const niveisPermitidos = NIVEIS_TODOS;
    if (nivel && !niveisPermitidos.includes(nivel)) {
      return res.status(400).json({ error: 'Nível inválido' });
    }

    // Monta os campos a atualizar dinamicamente
    const fields = [];
    const values = [];
    let idx = 1;

    if (nome)             { fields.push(`nome = $${idx++}`);             values.push(nome); }
    if (nivel)            { fields.push(`nivel = $${idx++}`);            values.push(nivel); }
    if (regiao_vinculada !== undefined) { fields.push(`regiao_vinculada = $${idx++}`); values.push(regiao_vinculada); }
    if (senha) {
      const hash = await require('bcrypt').hash(senha, 10);
      fields.push(`senha_hash = $${idx++}`);
      values.push(hash);
    }

    if (!fields.length) return res.status(400).json({ error: 'Nenhum campo para atualizar.' });

    values.push(id);
    values.push(req.tenantId);
    const result = await pool.query(
      `UPDATE usuarios SET ${fields.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1}`,
      values
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao editar usuário:', err);
    res.status(500).json({ error: 'Erro ao editar usuário.' });
  }
});

// Rota para excluir usuário
app.delete('/api/usuarios/:id', auth, withTenant, allow('dono'), async (req, res) => {

  try {
    const result = await pool.query(
      'DELETE FROM usuarios WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir usuário.' });
  }
});
/* ================= VALIDAR TOKEN ================= */
app.get('/api/validar-token', auth, withTenant, async (req, res) => {
  try {
    res.json({
      ok: true,
      user: {
        id: req.user.id,
        nivel: req.user.nivel,
        regiao: req.user.regiao,
        tenantId: req.tenantId
      }
    });
  } catch (err) {
    res.status(401).json({ error: 'Token inválido' });
  }
});
/* ================= LÍDER DA REGIÃO ================= */
app.get('/api/lider-regiao/:regiao', auth, withTenant, async (req, res) => {
  try {
    const { regiao } = req.params;

    if (!isPrivileged(req.user.nivel) && req.user.regiao !== regiao) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const row = await dbGet(
      `SELECT id, nome, usuario, regiao_vinculada
       FROM usuarios
       WHERE nivel = 'lider_regiao'
         AND regiao_vinculada = $1
         AND tenant_id = $2
       LIMIT 1`,
      [regiao, req.tenantId]
    );

    res.json(row ?? null);

  } catch (err) {
    console.error('Erro ao buscar líder da região:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});
/* ================= ANIVERSARIANTES ================= */

async function buscarAniversariantes(regiao, nivel, tenantId, dias = 7) {
  const isDono = isPrivileged(nivel);
  const { rows } = await pool.query(
    `SELECT
       nome,
       data_nascimento,
       cidade,
       regiao,
       contato,
       foto,
       (
         SELECT i FROM generate_series(0, $1) AS i
         WHERE to_char(CURRENT_DATE + (i * INTERVAL '1 day'), 'MMDD') = to_char(data_nascimento::date, 'MMDD')
         LIMIT 1
       ) AS dias_para_aniversario
     FROM liderancas
     WHERE data_nascimento IS NOT NULL
       AND tenant_id = $4
       AND to_char(data_nascimento::date, 'MMDD') = ANY(
         ARRAY(
           SELECT to_char(CURRENT_DATE + (i * INTERVAL '1 day'), 'MMDD')
           FROM generate_series(0, $1) AS i
         )
       )
       AND ($2 OR LOWER(regiao) = LOWER($3))
     ORDER BY dias_para_aniversario ASC, nome ASC`,
    [dias, isDono, regiao || '', tenantId]
  );
  return rows;
}

// GET /api/aniversariantes?dias=7
app.get('/api/aniversariantes', auth, withTenant, async (req, res) => {
  try {
    const dias = Math.min(parseInt(req.query.dias) || 7, 30);
    const rows = await buscarAniversariantes(req.user.regiao, req.user.nivel, req.tenantId, dias);
    res.json(rows);
  } catch (err) {
    console.error('Erro ao buscar aniversariantes:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Expectativa vs Mapeado por região
app.get('/api/dashboard/expectativa-regioes', auth, withTenant, allow('dono', 'admin'), async (req, res) => {
  try {
    const t = req.tenantId;
    const candidatos = await dbAll(
      'SELECT chave FROM tenant_candidatos WHERE tenant_id = $1 ORDER BY ordem ASC', [t]
    );

    // Agrega metas por região a partir do JSONB (em JS, sem SQL dinâmico)
    const expRows = await dbAll(
      `SELECT regiao, expectativas FROM expectativa_cidade
       WHERE regiao IS NOT NULL AND regiao <> '' AND tenant_id = $1`, [t]
    );
    const metasByRegiao = {};
    for (const row of expRows) {
      if (!metasByRegiao[row.regiao]) {
        metasByRegiao[row.regiao] = { regiao: row.regiao, meta_total: 0, metas: {} };
        candidatos.forEach(c => { metasByRegiao[row.regiao].metas[c.chave] = 0; });
      }
      const exp = row.expectativas || {};
      for (const c of candidatos) {
        const v = Number(exp[c.chave] || 0);
        metasByRegiao[row.regiao].metas[c.chave] += v;
        metasByRegiao[row.regiao].meta_total += v;
      }
    }

    const mapeados = await dbAll(`
      SELECT regiao,
        COALESCE(SUM(expectativa_votos), 0) AS votos_mapeados,
        COUNT(*) AS total_lideres,
        COUNT(*) FILTER (WHERE status = 'ativo') AS lideres_ativos
      FROM liderancas
      WHERE regiao IS NOT NULL AND regiao <> '' AND tenant_id = $1
      GROUP BY regiao
    `, [t]);
    const mapaMap = {};
    mapeados.forEach(m => { mapaMap[m.regiao] = m; });

    const allRegioes = new Set([
      ...Object.keys(metasByRegiao),
      ...mapeados.map(m => m.regiao)
    ]);

    const resultado = [...allRegioes].map(regiao => {
      const meta = metasByRegiao[regiao] || { meta_total: 0, metas: {} };
      const map  = mapaMap[regiao] || {};
      return {
        regiao,
        meta_total:    meta.meta_total,
        metas:         meta.metas,          // { chave: valor, ... }
        votos_mapeados: parseInt(map.votos_mapeados || 0),
        total_lideres:  parseInt(map.total_lideres  || 0),
        lideres_ativos: parseInt(map.lideres_ativos || 0),
        pct_atingido: meta.meta_total > 0
          ? Math.round((parseInt(map.votos_mapeados || 0) / meta.meta_total) * 100)
          : 0
      };
    }).sort((a, b) => b.meta_total - a.meta_total);

    res.json(resultado);
  } catch (err) {
    console.error('Erro dashboard/expectativa-regioes:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ================= KEEP ALIVE (RENDER) ================= */


/* ================= VIDEO CONFERÊNCIA (WebRTC via Socket.io) ================= */

// Criar sala de vídeo
app.post("/api/salas-video",
  auth,
  withTenant,
  allowAll(),
  async (req, res) => {
    try {
      const { nome, regiao } = req.body;
      if (!nome?.trim()) return res.status(400).json({ error: "Nome obrigatório" });

      const { rows } = await pool.query(
        "INSERT INTO salas_video (nome, host_id, regiao, tenant_id) VALUES ($1, $2, $3, $4) RETURNING *",
        [nome.trim(), req.user.id, regiao || req.user.regiao, req.tenantId]
      );
      res.json(rows[0]);
    } catch (err) {
      console.error("Erro ao criar sala:", err);
      res.status(500).json({ error: "Erro interno" });
    }
  }
);

// Listar salas da mesma região (dono vê todas)
app.get("/api/salas-video", auth, withTenant, async (req, res) => {
  try {
    const isDono = isPrivileged(req.user.nivel);
    const { rows } = await pool.query(
      isDono
        ? "SELECT s.*, u.nome as host_nome FROM salas_video s JOIN usuarios u ON s.host_id = u.id WHERE s.ativa = true AND s.tenant_id = $1 ORDER BY s.criada_em DESC"
        : "SELECT s.*, u.nome as host_nome FROM salas_video s JOIN usuarios u ON s.host_id = u.id WHERE s.regiao = $1 AND s.ativa = true AND s.tenant_id = $2 ORDER BY s.criada_em DESC",
      isDono ? [req.tenantId] : [req.user.regiao, req.tenantId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao listar salas" });
  }
});

// Encerrar sala
app.delete("/api/salas-video/:id",
  auth,
  withTenant,
  allowAll(),
  async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query(
        isPrivileged(req.user.nivel)
          ? "UPDATE salas_video SET ativa = false WHERE id = $1 AND tenant_id = $2 RETURNING *"
          : "UPDATE salas_video SET ativa = false WHERE id = $1 AND host_id = $2 AND tenant_id = $3 RETURNING *",
        isPrivileged(req.user.nivel) ? [id, req.tenantId] : [id, req.user.id, req.tenantId]
      );
      if (!result.rows.length) return res.status(403).json({ error: "Sem permissão" });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "Erro ao encerrar sala" });
    }
  }
);

/* ================= HTTP SERVER + SOCKET.IO ================= */

const server = http.createServer(app);

const io = new SocketServer(server, {
  cors: { origin: allowedOrigins, credentials: true }
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Token ausente"));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.usuario = decoded;
    next();
  } catch {
    next(new Error("Token inválido"));
  }
});

// Mapa de presença: socketId -> { id, nome, nivel, regiao }
const onlineUsers = new Map(); // socketId -> user + tenant

io.on("connection", (socket) => {
  const u = socket.usuario;
  const tenantId = u.tenantId;

  // Presença online — identidade vem do JWT (u), não do cliente
  socket.on("registrar-online", async () => {
    const info = {
  id: u.id,
  nome: u.nome,
  nivel: u.nivel,
  regiao: u.regiao,
  tenantId: tenantId
};
    onlineUsers.set(socket.id, info);
    const usuariosDoMesmoTenant = [...onlineUsers.values()]
  .filter(user => user.tenantId === tenantId);

socket.emit("lista-online", usuariosDoMesmoTenant);
    for (const [sid, user] of onlineUsers.entries()) {
  if (user.tenantId === tenantId && sid !== socket.id) {
    io.to(sid).emit("usuario-online", info);
  }
}

    // Envia aniversariantes de hoje da região do usuário
    try {
      const aniversariantes = await buscarAniversariantes(u.regiao, u.nivel, u.tenantId, 7);
      if (aniversariantes.length > 0) {
        socket.emit("aniversariantes", aniversariantes);
      }
    } catch (e) {
      console.error("Erro ao buscar aniversariantes para socket:", e);
    }
  });

  // Convite para sala
  socket.on("convidar-para-sala", ({ paraId, salaId, salaName, de }) => {
    for (const [sid, info] of onlineUsers.entries()) {
      if (info.id === paraId && info.tenantId === tenantId) { io.to(sid).emit("convite-reuniao", { salaId, salaName, de }); break; }
    }
  });

  // WebRTC Signaling — valida que a sala existe e o usuário tem acesso à região
  socket.on("entrar-sala", async ({ salaId }) => {
    const sala = await dbGet(
  'SELECT * FROM salas_video WHERE id = $1 AND ativa = true AND tenant_id = $2',
  [salaId, tenantId]
);
    if (!sala) return; // sala inexistente ou inativa
    if (!isPrivileged(u.nivel) && sala.regiao && sala.regiao !== u.regiao) return; // fora da região
    socket.join("sala:" + salaId);
    socket.salaAtual = salaId;
    socket.nomeUsuario = u.nome || u.id;
    socket.to("sala:" + salaId).emit("novo-peer", { peerId: socket.id, nome: socket.nomeUsuario });
    const salaRoom = io.sockets.adapter.rooms.get("sala:" + salaId);
    const existingPeers = [];
    if (salaRoom) salaRoom.forEach(sid => {
      if (sid !== socket.id) {
        const s = io.sockets.sockets.get(sid);
        if (s) existingPeers.push({ peerId: sid, nome: s.nomeUsuario || sid });
      }
    });
    socket.emit("peers-existentes", existingPeers);
  });

  socket.on("offer", ({ paraId, offer }) => {
    io.to(paraId).emit("offer", { deId: socket.id, nome: socket.nomeUsuario, offer });
  });
  socket.on("answer", ({ paraId, answer }) => {
    io.to(paraId).emit("answer", { deId: socket.id, answer });
  });
  socket.on("ice-candidate", ({ paraId, candidate }) => {
    io.to(paraId).emit("ice-candidate", { deId: socket.id, candidate });
  });

  // Chat
  socket.on("mensagem", ({ salaId, texto }) => {
    if (!texto?.trim()) return;
    io.to("sala:" + salaId).emit("nova-mensagem", {
      id: uuidv4(), nome: socket.nomeUsuario || u.id,
      userId: u.id, texto: texto.trim(), hora: Date.now()
    });
  });

  // Levantar mao
  socket.on("levantar-mao", (salaId) => {
    io.to("sala:" + salaId).emit("mao-levantada", { peerId: socket.id, nome: socket.nomeUsuario });
  });
  socket.on("abaixar-mao", (salaId) => {
    io.to("sala:" + salaId).emit("mao-abaixada", { peerId: socket.id });
  });

  // Sair
  socket.on("sair-sala", (salaId) => {
    socket.leave("sala:" + salaId);
    socket.to("sala:" + salaId).emit("peer-saiu", { peerId: socket.id });
  });
  socket.on("disconnect", () => {
    const info = onlineUsers.get(socket.id);
    onlineUsers.delete(socket.id);
    if (info) for (const [sid, user] of onlineUsers.entries()) {
  if (user.tenantId === info.tenantId) {
    io.to(sid).emit("usuario-offline", { id: info.id });
  }
}
    const salaId = socket.salaAtual;
    if (salaId) socket.to("sala:" + salaId).emit("peer-saiu", { peerId: socket.id });
  });
});

/* ================= DASHBOARD COMMAND CENTER ================= */

// KPIs gerais
app.get('/api/dashboard/kpis', auth, withTenant, allow('dono', 'admin'), async (req, res) => {
  try {
    const t = req.tenantId;

    // Candidatos do tenant (para stats dinâmicas)
    const candidatos = await dbAll(
      'SELECT chave, nome FROM tenant_candidatos WHERE tenant_id = $1 ORDER BY ordem ASC',
      [t]
    );

    const [totalLiderancas, ativasCount, inativasCount, votosTotal,
           regioesAtivas, gastosTotal, gastosUlt30, statusBreakdown, votosPorVinculo,
           todasExpCidades] = await Promise.all([
      dbGet('SELECT COUNT(*) as total FROM liderancas WHERE tenant_id = $1', [t]),
      dbGet("SELECT COUNT(*) as total FROM liderancas WHERE status = 'ativo' AND tenant_id = $1", [t]),
      dbGet("SELECT COUNT(*) as total FROM liderancas WHERE status != 'ativo' AND tenant_id = $1", [t]),
      dbGet('SELECT COALESCE(SUM(expectativa_votos),0) as total FROM liderancas WHERE tenant_id = $1', [t]),
      dbGet('SELECT COUNT(DISTINCT regiao) as total FROM liderancas WHERE tenant_id = $1', [t]),
      dbGet('SELECT COALESCE(SUM(g.valor),0) as total FROM gastos_lideranca g JOIN liderancas l ON l.id = g.lideranca_id WHERE l.tenant_id = $1', [t]),
      dbGet("SELECT COALESCE(SUM(g.valor),0) as total FROM gastos_lideranca g JOIN liderancas l ON l.id = g.lideranca_id WHERE l.tenant_id = $1 AND g.data::date >= NOW() - INTERVAL '30 days'", [t]),
      dbAll("SELECT COALESCE(status,'indefinido') as status, COUNT(*) as total FROM liderancas WHERE tenant_id = $1 GROUP BY status", [t]),
      dbAll("SELECT COALESCE(vinculo_politico,'Indefinido') as candidato, COALESCE(SUM(expectativa_votos),0) as votos FROM liderancas WHERE tenant_id = $1 GROUP BY vinculo_politico ORDER BY votos DESC", [t]),
      dbAll('SELECT expectativas FROM expectativa_cidade WHERE tenant_id = $1', [t]),
    ]);

    // Expectativa das lideranças por candidato (match exato pelo chave de vinculo_politico)
    const liderancasPorCandidato = {};
    for (const c of candidatos) {
      const row = await dbGet(
        `SELECT COALESCE(SUM(expectativa_votos),0) as total FROM liderancas
         WHERE tenant_id = $1 AND LOWER(vinculo_politico) = LOWER($2)`,
        [t, c.chave]
      );
      liderancasPorCandidato[c.chave] = parseInt(row.total);
    }

    // Expectativa das cidades por candidato (soma do JSONB)
    const cidadesPorCandidato = {};
    for (const c of candidatos) cidadesPorCandidato[c.chave] = 0;
    for (const row of todasExpCidades) {
      const exp = row.expectativas || {};
      for (const c of candidatos) {
        cidadesPorCandidato[c.chave] += Number(exp[c.chave] || 0);
      }
    }

    const porCandidato = candidatos.map(c => ({
      chave:      c.chave,
      nome:       c.nome,
      liderancas: liderancasPorCandidato[c.chave] || 0,
      cidades:    Math.round(cidadesPorCandidato[c.chave] || 0),
    }));

    res.json({
      totalLiderancas: parseInt(totalLiderancas.total),
      ativas:          parseInt(ativasCount.total),
      inativas:        parseInt(inativasCount.total),
      regioesAtivas:   parseInt(regioesAtivas.total),
      gastosTotal:     parseFloat(gastosTotal.total),
      gastosUlt30:     parseFloat(gastosUlt30.total),
      statusBreakdown,
      votosPorVinculo,
      liderancasTotal: parseInt(votosTotal.total),
      cidadesTotal:    porCandidato.reduce((s, c) => s + c.cidades, 0),
      porCandidato,
    });
  } catch (err) {
    console.error('Erro dashboard/kpis:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Ranking de lideranças por votos
app.get('/api/dashboard/ranking', auth, withTenant, allow('dono', 'admin'), async (req, res) => {
  try {
    const rows = await dbAll(`
      SELECT
        l.id, l.nome, l.cidade, l.regiao, l.status,
        l.expectativa_votos, l.vinculo_politico,
        COALESCE(SUM(g.valor), 0) as total_gastos,
        COUNT(g.id) as num_gastos
      FROM liderancas l
      LEFT JOIN gastos_lideranca g ON g.lideranca_id = l.id
      WHERE l.tenant_id = $1
      GROUP BY l.id, l.nome, l.cidade, l.regiao, l.status, l.expectativa_votos, l.vinculo_politico
      ORDER BY l.expectativa_votos DESC NULLS LAST
      LIMIT 20
    `, [req.tenantId]);
    res.json(rows);
  } catch (err) {
    console.error('Erro dashboard/ranking:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Alertas de risco
app.get('/api/dashboard/alertas', auth, withTenant, allow('dono', 'admin'), async (req, res) => {
  try {
    const t = req.tenantId;

    const inativas = await dbAll(`
      SELECT id, nome, cidade, regiao, expectativa_votos
      FROM liderancas
      WHERE status != 'ativo' AND expectativa_votos > 50
        AND tenant_id = $1
      ORDER BY expectativa_votos DESC
      LIMIT 10
    `, [t]);

    const regioesSemLider = await dbAll(`
      SELECT regiao, COUNT(*) FILTER (WHERE status = 'ativo') as ativos
      FROM liderancas
      WHERE tenant_id = $1
      GROUP BY regiao
      HAVING COUNT(*) FILTER (WHERE status = 'ativo') = 0
    `, [t]);

    const semVotos = await dbAll(`
      SELECT id, nome, cidade, regiao
      FROM liderancas
      WHERE (expectativa_votos IS NULL OR expectativa_votos = 0)
        AND tenant_id = $1
      LIMIT 10
    `, [t]);

    let auditRecentes = [];
    try {
      auditRecentes = await dbAll(`
        SELECT a.id, a.acao, a.entidade, u.nome as usuario
        FROM auditoria a
        LEFT JOIN usuarios u ON u.id = a.usuario_id
        WHERE u.tenant_id = $1
        ORDER BY a.id DESC
        LIMIT 10
      `, [t]);
    } catch (_) {
      // não quebra o endpoint se a auditoria falhar
    }

    res.json({
      liderancasInativas: inativas,
      regioesSemLider,
      semVotos,
      auditRecentes
    });
  } catch (err) {
    console.error('Erro dashboard/alertas:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Crescimento: gastos e votos por mês
app.get('/api/dashboard/crescimento', auth, withTenant, allow('dono', 'admin'), async (req, res) => {
  try {
    const t = req.tenantId;

    const gastosPorMes = await dbAll(`
      SELECT
        TO_CHAR(g.data::date, 'YYYY-MM') as mes,
        SUM(g.valor) as total_gastos,
        COUNT(DISTINCT g.lideranca_id) as liderancas_ativas
      FROM gastos_lideranca g
      JOIN liderancas l ON l.id = g.lideranca_id
      WHERE g.data::date >= NOW() - INTERVAL '12 months'
        AND l.tenant_id = $1
      GROUP BY mes
      ORDER BY mes ASC
    `, [t]);

    const votosEvolucao = await dbAll(`
      SELECT
        regiao,
        COALESCE(SUM(expectativa_votos), 0) as votos,
        COUNT(*) FILTER (WHERE status = 'ativo') as liderancas_ativas
      FROM liderancas
      WHERE tenant_id = $1
      GROUP BY regiao
      ORDER BY votos DESC
    `, [t]);

    res.json({ gastosPorMes, votosEvolucao });
  } catch (err) {
    console.error('Erro dashboard/crescimento:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Agenda inteligente — sugestões estratégicas
app.get('/api/dashboard/agenda', auth, withTenant, allow('dono', 'admin'), async (req, res) => {
  try {
    const t = req.tenantId;

    const regioesFracas = await dbAll(`
      SELECT regiao, COALESCE(SUM(expectativa_votos),0) as votos, COUNT(*) as total_lideres
      FROM liderancas
      WHERE tenant_id = $1
      GROUP BY regiao
      ORDER BY votos ASC
      LIMIT 5
    `, [t]);

    const semInteracao = await dbAll(`
      SELECT l.id, l.nome, l.cidade, l.regiao, l.expectativa_votos
      FROM liderancas l
      WHERE l.status = 'ativo'
        AND l.tenant_id = $1
        AND l.id NOT IN (
          SELECT DISTINCT g.lideranca_id FROM gastos_lideranca g
          JOIN liderancas l2 ON l2.id = g.lideranca_id
          WHERE g.data::date >= NOW() - INTERVAL '30 days'
            AND l2.tenant_id = $1
        )
      ORDER BY l.expectativa_votos DESC NULLS LAST
      LIMIT 10
    `, [t]);

    const topCidades = await dbAll(`
      SELECT cidade, regiao,
        COALESCE(SUM(expectativa_votos),0) as votos_potenciais,
        COUNT(*) as lideres
      FROM liderancas
      WHERE status = 'ativo' AND tenant_id = $1
      GROUP BY cidade, regiao
      ORDER BY votos_potenciais DESC
      LIMIT 8
    `, [t]);

    res.json({ regioesFracas, semInteracao, topCidades });
  } catch (err) {
    console.error('Erro dashboard/agenda:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ================= ADMIN — CONFIG DO TENANT ================= */

// GET config completa do tenant
app.get('/api/admin/config', auth, withTenant, allow('dono'), async (req, res) => {
  try {
    res.json(await getConfigTenant(req.tenantId));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar config' });
  }
});

// PUT identidade visual e nome do sistema
app.put('/api/admin/config/geral', auth, withTenant, allow('dono'), async (req, res) => {
  const { nome_sistema, logo_url, cores } = req.body;
  await pool.query(
    `INSERT INTO tenant_config (tenant_id, nome_sistema, logo_url, cores)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id) DO UPDATE SET
       nome_sistema = COALESCE($2, tenant_config.nome_sistema),
       logo_url     = COALESCE($3, tenant_config.logo_url),
       cores        = COALESCE($4, tenant_config.cores)`,
    [req.tenantId, nome_sistema ?? null, logo_url ?? null, cores ? JSON.stringify(cores) : null]
  );
  invalidateTenantCache(req.tenantId);
  res.json({ ok: true });
});

// ── Candidatos ───────────────────────────────────────────────────────────────

app.get('/api/admin/config/candidatos', auth, withTenant, allow('dono'), async (req, res) => {
  res.json(await dbAll(
    'SELECT * FROM tenant_candidatos WHERE tenant_id = $1 ORDER BY ordem ASC',
    [req.tenantId]
  ));
});

app.post('/api/admin/config/candidatos', auth, withTenant, allow('dono'), upload.single('foto'), async (req, res) => {
  try {
    const { chave, nome, cor_fundo, cor_texto, tem_votos_2022, ordem } = req.body;
    if (!chave || !nome) return res.status(400).json({ error: 'chave e nome são obrigatórios' });

    // Upload de foto para Supabase (bucket 'candidatos')
    let foto_url = req.body.foto_url ?? null;
    if (req.file) {
      const caminhoOtimizado = await otimizarImagem(req.file.path);
      const fileBuffer = fs.readFileSync(caminhoOtimizado);
      const fileName = `${req.tenantId}/${chave}_${Date.now()}.webp`;
      const { error: uploadErr } = await supabase.storage
        .from('candidatos')
        .upload(fileName, fileBuffer, { contentType: 'image/webp', upsert: true });
      if (uploadErr) throw uploadErr;
      const { data } = supabase.storage.from('candidatos').getPublicUrl(fileName);
      foto_url = data.publicUrl;
      try { fs.unlinkSync(caminhoOtimizado); } catch {}
    }

    await pool.query(
      `INSERT INTO tenant_candidatos (tenant_id, chave, nome, cor_fundo, cor_texto, tem_votos_2022, ordem, foto_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (tenant_id, chave) DO UPDATE SET
         nome = $3, cor_fundo = $4, cor_texto = $5, tem_votos_2022 = $6, ordem = $7,
         foto_url = COALESCE($8, tenant_candidatos.foto_url)`,
      [req.tenantId, chave, nome, cor_fundo ?? '#e0e7ff', cor_texto ?? '#3730a3',
       tem_votos_2022 === 'true' || tem_votos_2022 === true, ordem ?? 0, foto_url]
    );
    invalidateTenantCache(req.tenantId);
    res.json({ ok: true, foto_url });
  } catch (err) {
    console.error('[POST /api/admin/config/candidatos]', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/config/candidatos/:chave', auth, withTenant, allow('dono'), async (req, res) => {
  await pool.query(
    'DELETE FROM tenant_candidatos WHERE tenant_id = $1 AND chave = $2',
    [req.tenantId, req.params.chave]
  );
  invalidateTenantCache(req.tenantId);
  res.json({ ok: true });
});

// ── Mapas ────────────────────────────────────────────────────────────────────

app.get('/api/admin/config/mapas', auth, withTenant, allow('dono'), async (req, res) => {
  res.json(await dbAll(
    'SELECT *, COALESCE(visivel, true) AS visivel FROM tenant_mapas WHERE tenant_id = $1',
    [req.tenantId]
  ));
});

app.post('/api/admin/config/mapas', auth, withTenant, allow('dono'), async (req, res) => {
  const { mapa_id, nome, nivel_usuario, badge_fundo, badge_texto, subregioes } = req.body;
  if (!mapa_id || !nome || !nivel_usuario) return res.status(400).json({ error: 'mapa_id, nome e nivel_usuario são obrigatórios' });
  await pool.query(
    `INSERT INTO tenant_mapas (tenant_id, mapa_id, nome, nivel_usuario, badge_fundo, badge_texto, subregioes, visivel)
     VALUES ($1,$2,$3,$4,$5,$6,$7, true)
     ON CONFLICT (tenant_id, mapa_id) DO UPDATE SET
       nome = $3, nivel_usuario = $4, badge_fundo = $5, badge_texto = $6, subregioes = $7`,
    [req.tenantId, mapa_id, nome, nivel_usuario, badge_fundo ?? '#f0fdf4', badge_texto ?? '#14532d', JSON.stringify(subregioes ?? [])]
  );
  invalidateTenantCache(req.tenantId);
  res.json({ ok: true });
});

// PATCH — liga/desliga visibilidade de um mapa no home
app.patch('/api/admin/config/mapas/:mapa_id/visivel', auth, withTenant, allow('dono'), async (req, res) => {
  const { visivel } = req.body;
  if (typeof visivel !== 'boolean') return res.status(400).json({ error: 'visivel deve ser boolean' });
  await pool.query(
    `INSERT INTO tenant_mapas (tenant_id, mapa_id, nome, nivel_usuario, visivel)
     VALUES ($1, $2, $2, $2, $3)
     ON CONFLICT (tenant_id, mapa_id) DO UPDATE SET visivel = $3`,
    [req.tenantId, req.params.mapa_id, visivel]
  );
  invalidateTenantCache(req.tenantId);
  res.json({ ok: true, visivel });
});

app.delete('/api/admin/config/mapas/:mapa_id', auth, withTenant, allow('dono'), async (req, res) => {
  await pool.query(
    'DELETE FROM tenant_mapas WHERE tenant_id = $1 AND mapa_id = $2',
    [req.tenantId, req.params.mapa_id]
  );
  invalidateTenantCache(req.tenantId);
  res.json({ ok: true });
});

// ── Regiões ──────────────────────────────────────────────────────────────────

app.get('/api/admin/config/regioes', auth, withTenant, allow('dono'), async (req, res) => {
  res.json(await dbAll(
    'SELECT * FROM tenant_regioes WHERE tenant_id = $1 ORDER BY ordem ASC',
    [req.tenantId]
  ));
});

app.post('/api/admin/config/regioes', auth, withTenant, allow('dono'), async (req, res) => {
  const { chave, label, cidades, lideres, ordem } = req.body;
  if (!chave || !label) return res.status(400).json({ error: 'chave e label são obrigatórios' });
  await pool.query(
    `INSERT INTO tenant_regioes (tenant_id, chave, label, cidades, lideres, ordem)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (tenant_id, chave) DO UPDATE SET
       label = $3, cidades = $4, lideres = $5, ordem = $6`,
    [req.tenantId, chave, label, JSON.stringify(cidades ?? []), JSON.stringify(lideres ?? []), ordem ?? 0]
  );
  invalidateTenantCache(req.tenantId);
  res.json({ ok: true });
});


app.delete('/api/admin/config/regioes/:chave', auth, withTenant, allow('dono'), async (req, res) => {
  await pool.query(
    'DELETE FROM tenant_regioes WHERE tenant_id = $1 AND chave = $2',
    [req.tenantId, req.params.chave]
  );
  invalidateTenantCache(req.tenantId);
  res.json({ ok: true });
});


/* ================= KEEP ALIVE (RENDER) ================= */
app.get("/ping", (req, res) => {
  res.status(200).send("pong");
});

server.listen(PORT, async () => {
  console.log("Backend rodando em http://localhost:" + PORT);
  // Migrations automáticas — seguras de rodar múltiplas vezes (IF NOT EXISTS)

  // Tabela de auditoria (pode não existir em instâncias antigas)
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS auditoria (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER,
        acao TEXT,
        entidade TEXT,
        entidade_id INTEGER,
        criado_em TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('[migration] auditoria OK');
  } catch (e) {
    console.warn('[migration] auditoria:', e.message);
  }

  // Remove o check constraint hardcoded de vinculo_politico que bloqueia tenants com candidatos diferentes
  try {
    await pool.query(`ALTER TABLE liderancas DROP CONSTRAINT IF EXISTS liderancas_vinculo_politico_check`);
    console.log('[migration] liderancas_vinculo_politico_check removido OK');
  } catch (e) {
    console.warn('[migration] liderancas_vinculo_politico_check:', e.message);
  }

  // Colunas que podem faltar na tabela liderancas
  try {
    await pool.query(`ALTER TABLE liderancas ADD COLUMN IF NOT EXISTS mapa TEXT`);
    console.log('[migration] liderancas.mapa OK');
  } catch (e) {
    console.warn('[migration] liderancas.mapa:', e.message);
  }
  try {
    await pool.query(`ALTER TABLE liderancas ADD COLUMN IF NOT EXISTS data_nascimento DATE`);
    console.log('[migration] liderancas.data_nascimento OK');
  } catch (e) {
    console.warn('[migration] liderancas.data_nascimento:', e.message);
  }

  try {
    await pool.query(`ALTER TABLE tenant_candidatos ADD COLUMN IF NOT EXISTS foto_url TEXT`);
    console.log('[migration] tenant_candidatos.foto_url OK');
  } catch (e) {
    console.warn('[migration] tenant_candidatos.foto_url:', e.message);
  }
  try {
    await pool.query(`ALTER TABLE tenant_mapas ADD COLUMN IF NOT EXISTS visivel BOOLEAN DEFAULT TRUE`);
    console.log('[migration] tenant_mapas.visivel OK');
  } catch (e) {
    console.warn('[migration] tenant_mapas.visivel:', e.message);
  }
  try {
    await pool.query(`ALTER TABLE expectativa_cidade ADD COLUMN IF NOT EXISTS expectativas JSONB DEFAULT '{}'`);
    // Popula JSONB a partir das colunas legadas para linhas ainda não migradas
    await pool.query(`
      UPDATE expectativa_cidade
      SET expectativas = json_build_object(
        'celia',    COALESCE(expectativa_celia, 0),
        'fernando', COALESCE(expectativa_fernando, 0)
      )::jsonb
      WHERE expectativas = '{}'::jsonb
        AND (expectativa_celia IS NOT NULL OR expectativa_fernando IS NOT NULL)
    `);
    console.log('[migration] expectativa_cidade.expectativas JSONB OK');
  } catch (e) {
    console.warn('[migration] expectativa_cidade.expectativas:', e.message);
  }
});