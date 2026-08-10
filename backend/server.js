const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
// BigQuery é carregado de forma lazy dentro de getBQ() para não crashar o
// servidor caso o pacote ainda não tenha sido instalado neste ambiente.
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
const http  = require('http');
const https = require('https');
const { Server: SocketServer } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const config = require('./config');

// ── Cache de config por tenant (TTL 5 min) ───────────────────────────────────
const _tenantConfigCache = new Map();
const CONFIG_TTL_MS = 5 * 60 * 1000;

async function getConfigTenant(tenantId) {
  const cached = _tenantConfigCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  try {
    const [cfgRow, candidatos, mapas, regioes] = await Promise.all([
      dbGet('SELECT nome_sistema, logo_url, cores, home_cards_config FROM tenant_config WHERE tenant_id = $1', [tenantId]),
      dbAll('SELECT chave, nome, cor_fundo, cor_texto, cor_mapa, tem_votos_2022, foto_url, nome_urna_bq, ano_eleicao_bq, cargo_bq, meta_geral FROM tenant_candidatos WHERE tenant_id = $1 ORDER BY ordem ASC', [tenantId]),
      dbAll('SELECT mapa_id AS id, nome, nivel_usuario, badge_fundo, badge_texto, subregioes, COALESCE(visivel, true) AS visivel FROM tenant_mapas WHERE tenant_id = $1', [tenantId]),
      dbAll('SELECT chave, label, cidades, lideres FROM tenant_regioes WHERE tenant_id = $1 ORDER BY ordem ASC', [tenantId]),
    ]);

    const data = {
      nome_sistema:       cfgRow?.nome_sistema       ?? 'Gestão Política',
      logo_url:           cfgRow?.logo_url           ?? null,
      cores:              cfgRow?.cores              ?? config.cores,
      home_cards_config:  cfgRow?.home_cards_config  ?? {},
      candidatos:         candidatos.length          ? candidatos : config.candidatos,
      mapas:              mapas.length               ? mapas      : config.mapas,
      regioes:            regioes.length             ? regioes    : config.regioes,
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
const NIVEIS_TODOS  = ['dono', 'admin', 'visualizador', 'lider_regiao', 'lider_capital', ...NIVEIS_MAPA];

// NIVEIS_TODOS dinâmico por tenant (inclui níveis de mapas cadastrados no banco)
async function getNiveisTenant(tenantId) {
  try {
    const cfg = await getConfigTenant(tenantId);
    const niveisMapa = cfg.mapas.map(m => m.nivel_usuario);
    return ['dono', 'admin', 'visualizador', 'lider_regiao', 'lider_capital', ...niveisMapa];
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
// Serve os arquivos da raiz do projeto (home, analise, assets, etc.)
app.use(express.static(path.join(__dirname, '..')));
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
  const { senha, tenantId } = req.body;
  // Normaliza username para lowercase (criação já faz isso — garante consistência)
  const usuario = (req.body.usuario || '').trim().toLowerCase();

  if (!usuario || !senha) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }

  try {
    // Busca TODOS os usuários com aquele nome (pode existir em múltiplos tenants).
    // Se o frontend enviar tenantId, filtra direto; caso contrário percorre todos
    // e usa bcrypt para achar o match correto.
    let users;
    if (tenantId != null && tenantId !== '' && tenantId !== 'default') {
      // Filtro preciso por tenant — evita ambiguidade quando o mesmo username
      // existe em tenants diferentes com senhas distintas.
      users = await dbAll(
        'SELECT id, usuario, senha_hash, nome, nivel, regiao_vinculada, tenant_id FROM usuarios WHERE LOWER(usuario) = $1 AND tenant_id = $2',
        [usuario, tenantId]
      );
    } else {
      users = await dbAll(
        'SELECT id, usuario, senha_hash, nome, nivel, regiao_vinculada, tenant_id FROM usuarios WHERE LOWER(usuario) = $1 ORDER BY tenant_id ASC',
        [usuario]
      );
    }

    if (!users || users.length === 0) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    // Verifica bcrypt em cada registro até achar o correto
    let user = null;
    for (const candidate of users) {
      const ok = await bcrypt.compare(senha, candidate.senha_hash);
      if (ok) { user = candidate; break; }
    }

    if (!user) {
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
     ON CONFLICT (cidade, COALESCE(regiao,''), COALESCE(mapa,''), COALESCE(tenant_id::text,''))
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

// ── Resolve a região de uma cidade consultando tenant_regioes ────────────────
// Retorna a chave da região ou null se não encontrada.
async function resolverRegiao(tenantId, cidadeNome) {
  try {
    const { rows } = await pool.query(
      `SELECT chave, cidades FROM tenant_regioes WHERE tenant_id = $1`,
      [tenantId]
    );
    const normCidade = (cidadeNome || '').toLowerCase().trim();
    for (const row of rows) {
      let lista = row.cidades;
      if (typeof lista === 'string') { try { lista = JSON.parse(lista); } catch { lista = []; } }
      if (Array.isArray(lista) && lista.some(c => (c || '').toLowerCase().trim() === normCidade)) {
        return row.chave;
      }
    }
  } catch (_) {}
  return null;
}

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
        p.data_nascimento, p.release,
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
      vinculo_politico, regiao: regiaoBody, data_nascimento, mapa,
      apelido, rede_social,
      cep, bairro, lat, lng   // campos geo
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
      // cadastrado_por_id é preenchido automaticamente com o usuário logado;
      // no ON CONFLICT preserva o valor original (quem criou primeiro).
      const upsert = await client.query(`
        INSERT INTO pessoas (tenant_id, nome, nome_norm, contato, foto, perfil, data_nascimento, release, apelido, rede_social, cadastrado_por_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (tenant_id, nome_norm) DO UPDATE
          SET contato         = COALESCE(EXCLUDED.contato,         pessoas.contato),
              foto            = COALESCE(EXCLUDED.foto,            pessoas.foto),
              perfil          = COALESCE(EXCLUDED.perfil,          pessoas.perfil),
              data_nascimento = COALESCE(EXCLUDED.data_nascimento, pessoas.data_nascimento),
              release         = COALESCE(EXCLUDED.release,         pessoas.release),
              apelido         = COALESCE(EXCLUDED.apelido,         pessoas.apelido),
              rede_social     = COALESCE(EXCLUDED.rede_social,     pessoas.rede_social),
              atualizado_em   = now()
        RETURNING id
      `, [req.tenantId, nome.trim(), normalizarNome(nome),
          contato || null, fotoUrl, perfil || null,
          data_nascimento || null, release || null,
          apelido || null, rede_social || null,
          req.user.id]);  // $11 — usuário logado; preservado no ON CONFLICT
      pessoaId = upsert.rows[0].id;
    } else if (fotoUrl) {
      await client.query(
        'UPDATE pessoas SET foto=$1, atualizado_em=now() WHERE id=$2 AND tenant_id=$3',
        [fotoUrl, pessoaId, req.tenantId]
      );
    }

    // Garante que a região sempre seja preenchida.
    // Para submapas (mapa != null), usa o mapa como fallback de região — evita rejeitar
    // lideranças de bairros cujos nomes não constam em tenant_regioes.cidades.
    const regiaoFinal = regiaoBody || req.user.regiao
      || await resolverRegiao(req.tenantId, cidade)
      || mapa  // fallback: submapa como região (ex: 'angra', 'rjcapital')
      || null; // permite salvar sem região (não rejeita mais)
    // Não rejeita se regiaoFinal for null — salva sem região para não perder a liderança

    // Cria vínculo pessoa ↔ cidade
    await client.query(`
      INSERT INTO liderancas
        (pessoa_id, tenant_id, cidade, regiao, mapa, expectativa_votos, status, responsavel, vinculo_politico,
         cep, bairro, lat, lng)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (pessoa_id, cidade, tenant_id) DO UPDATE
        SET expectativa_votos = EXCLUDED.expectativa_votos,
            status            = EXCLUDED.status,
            responsavel       = EXCLUDED.responsavel,
            vinculo_politico  = EXCLUDED.vinculo_politico,
            regiao            = COALESCE(EXCLUDED.regiao, liderancas.regiao),
            mapa              = COALESCE(liderancas.mapa, EXCLUDED.mapa),
            cep               = COALESCE(EXCLUDED.cep,    liderancas.cep),
            bairro            = COALESCE(EXCLUDED.bairro, liderancas.bairro),
            lat               = COALESCE(EXCLUDED.lat,    liderancas.lat),
            lng               = COALESCE(EXCLUDED.lng,    liderancas.lng)
    `, [pessoaId, req.tenantId, cidade,
        regiaoFinal,
        mapa || null, Number(expectativa_votos) || 0,
        status || 'ativa', responsavel || null, vinculo_politico || null,
        cep   || null, bairro || null,
        lat   ? Number(lat)  : null,
        lng   ? Number(lng)  : null]);

    await client.query('COMMIT');
    try { await registrarAuditoria(req.user.id, 'CRIAR', 'lideranca', String(pessoaId)); } catch (_) {}
    res.json({ success: true, pessoa_id: pessoaId });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao salvar liderança:', err);
    res.status(500).json({ error: 'Erro ao salvar liderança: ' + err.message });
  } finally { client.release(); }
});

/* ================= RANKING DE CADASTROS POR USUÁRIO ================= */
// GET /api/liderancas/ranking-cadastros
// Retorna quantas pessoas cada usuário cadastrou, ordenado do maior para o menor.
// Restrito a admin/dono para proteger dados internos.
app.get('/api/liderancas/ranking-cadastros', auth, withTenant, allow('admin', 'dono'), async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        u.id                                  AS usuario_id,
        u.nome                                AS nome,
        u.usuario                             AS login,
        u.foto_url                            AS foto_url,
        u.regiao_vinculada                    AS regiao,
        COUNT(p.id)::int                      AS total_cadastros,
        MAX(p.criado_em)                      AS ultimo_cadastro
      FROM usuarios u
      LEFT JOIN pessoas p
        ON p.cadastrado_por_id = u.id
        AND p.tenant_id = $1
      WHERE u.tenant_id = $1
      GROUP BY u.id, u.nome, u.usuario, u.foto_url, u.regiao_vinculada
      ORDER BY total_cadastros DESC, u.nome ASC
    `, [req.tenantId]);

    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error('[ranking-cadastros]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ================= PINS GEOGRÁFICOS (lideranças com lat/lng) ================= */
// GET /api/liderancas/geo?mapa=pirai — retorna lideranças geocodificadas para renderização no mapa
app.get('/api/liderancas/geo', auth, withTenant, async (req, res) => {
  const mapaFiltro = req.query.mapa;
  if (!mapaFiltro) return res.status(400).json({ error: 'Parâmetro mapa obrigatório' });
  try {
    const { rows } = await pool.query(`
      SELECT l.id, l.cidade, l.vinculo_politico, l.expectativa_votos,
             l.cep, l.bairro, l.lat, l.lng,
             p.nome, p.foto, p.contato
      FROM liderancas l
      JOIN pessoas p ON p.id = l.pessoa_id
      WHERE l.tenant_id = $1
        AND l.mapa      = $2
        AND l.lat       IS NOT NULL
        AND l.lng       IS NOT NULL
      ORDER BY p.nome
    `, [req.tenantId, mapaFiltro]);
    res.json(rows);
  } catch (err) {
    console.error('[GET /liderancas/geo]', err);
    res.status(500).json({ error: 'Erro ao buscar pins geográficos' });
  }
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
      status, release, vinculo_politico, regiao: regiaoBody, data_nascimento, mapa,
      apelido, rede_social,
      cep, bairro, lat, lng   // campos geo
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
        apelido         = COALESCE($10, apelido),
        rede_social     = COALESCE($11, rede_social),
        atualizado_em   = now()
      WHERE id=$8 AND tenant_id=$9
    `, [nome ? nome.trim() : null, nome ? normalizarNome(nome) : null,
        contato || null, fotoUrl,
        perfil || null, data_nascimento || null, release || null,
        atual.pessoa_id, req.tenantId,
        apelido || null, rede_social || null]);

    // Garante que a região sempre seja preenchida na edição
    const cidadeAlvo = cidade || atual.cidade;
    const regiaoFinal = regiaoBody || req.user.regiao
      || await resolverRegiao(req.tenantId, cidadeAlvo);

    // Atualiza vínculo em liderancas
    const result = await client.query(`
      UPDATE liderancas SET
        cidade           = COALESCE($1, cidade),
        expectativa_votos= COALESCE($2, expectativa_votos),
        status           = COALESCE($3, status),
        responsavel      = COALESCE($4, responsavel),
        vinculo_politico = COALESCE($5, vinculo_politico),
        regiao           = COALESCE($6, regiao),
        mapa             = COALESCE($7, mapa),
        cep              = COALESCE($11, cep),
        bairro           = COALESCE($12, bairro),
        lat              = COALESCE($13::double precision, lat),
        lng              = COALESCE($14::double precision, lng)
      WHERE id=$8 AND tenant_id=$9
      AND (regiao=$6 OR $10=ANY(ARRAY['dono','admin']))
    `, [cidade || null,
        expectativa_votos ? Number(expectativa_votos) : null,
        status || null, responsavel || null, vinculo_politico || null,
        regiaoFinal || req.user.regiao, mapa || null,
        id, req.tenantId, req.user.nivel,
        cep   || null, bairro || null,
        lat   ? String(Number(lat))  : null,
        lng   ? String(Number(lng))  : null]);

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
// Quando mapa está filtrado (ex: angra, rjcapital), agrupa por COALESCE(bairro, cidade)
// e retorna como `bairro` no topo — isso garante que lideranças gravadas corretamente
// (cidade='Angra dos Reis', bairro='CENTRO') apareçam agrupadas pelo bairro no mapa,
// e também que registros antigos (cidade='CENTRO', bairro=NULL) continuem funcionando.
app.get('/api/liderancas', auth, withTenant, async (req, res) => {
  try {
    const mapaFiltro = req.query.mapa || null;
    // Com filtro de mapa → submapa específico (ex: angra, rjcapital)
    // Sem filtro de mapa → mapa estadual: retorna TODAS as lideranças da cidade,
    //   independente de qual mapa foram criadas (mapa = 'angra', null, etc.)
    const params = mapaFiltro ? [req.tenantId, mapaFiltro] : [req.tenantId];
    const mapaClause = mapaFiltro ? 'AND l.mapa = $2' : '';

    // Para submapas: agrupa pelo bairro (ou cidade se bairro for nulo) — compatível com
    // dados antigos (bairro=NULL, cidade='CENTRO') e novos (bairro='CENTRO', cidade='Angra dos Reis').
    // Para o mapa estadual: mantém agrupamento por cidade.
    const groupKey = mapaFiltro
      ? `COALESCE(l.bairro, l.cidade)`
      : `l.cidade`;
    const selectKey = mapaFiltro
      ? `COALESCE(l.bairro, l.cidade) AS bairro`
      : `l.cidade`;

    const { rows } = await pool.query(`
      SELECT
        ${selectKey},
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
          'apelido',          p.apelido,
          'rede_social',      p.rede_social,
          'contato',          p.contato,
          'foto',             p.foto,
          'perfil',           p.perfil,
          'data_nascimento',  p.data_nascimento,
          'release',          p.release,
          'cep',              l.cep,
          'bairro',           l.bairro,
          'lat',              l.lat,
          'lng',              l.lng
        ) ORDER BY p.nome) AS liderancas
      FROM liderancas l
      JOIN pessoas p ON p.id = l.pessoa_id
      WHERE l.tenant_id = $1 ${mapaClause}
      GROUP BY ${groupKey}
      ORDER BY ${groupKey}
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

    // Limites: 400 caracteres e 5 parágrafos
    if (text.length > 400)
      return res.status(400).json({ error: 'Observação muito longa (máx. 400 caracteres)' });
    if ((text.match(/\n/g) || []).length >= 5)
      return res.status(400).json({ error: 'Máximo de 5 parágrafos por observação' });

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

  const { cidade, tipo, lat, lng, descricao, mapa_id } = req.body;

  // Validação básica
  if (!cidade || !tipo || lat == null || lng == null) {
    return res.status(400).json({ error: 'Cidade, tipo, latitude e longitude são obrigatórios' });
  }
  if (isNaN(Number(lat)) || isNaN(Number(lng))) {
    return res.status(400).json({ error: 'Latitude e longitude inválidas' });
  }

  const mapaIdFinal = (mapa_id && typeof mapa_id === 'string') ? mapa_id.trim() : 'rj';

  await pool.query(
    `INSERT INTO pins (cidade, tipo, lat, lng, descricao, regiao, tenant_id, mapa_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [cidade, tipo, Number(lat), Number(lng), descricao || null,
     req.user.regiao, req.tenantId, mapaIdFinal]
  );

  res.json({ ok: true });
});


app.get('/api/pins', auth, withTenant, async (req, res) => {
  try {
    const mapaId = req.query.mapa_id || null;
    let where  = 'tenant_id = $1';
    const params = [req.tenantId];

    // Filtra pelo mapa específico se informado
    if (mapaId) {
      where += ` AND mapa_id = $${params.length + 1}`;
      params.push(mapaId);
    }

    // Usuários não-privilegiados: restringe à própria região
    if (!isPrivileged(req.user.nivel)) {
      if (!req.user.regiao) {
        return res.json([]); // sem região = sem acesso
      }
      where += ` AND LOWER(regiao) = LOWER($${params.length + 1})`;
      params.push(req.user.regiao);
    }

    const r = await pool.query(
      `SELECT * FROM pins WHERE ${where} ORDER BY id DESC`, params
    );
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

/* ═══════════════════════════════════════════════════════════════════════════
   PINS × AGENDA — integração bidirecional
   ═══════════════════════════════════════════════════════════════════════════ */

// Mapa de cores de estado — usado para serializar o visual junto à API
const ESTADO_COR = {
  agendado:      '#22c55e',   // verde  — tem evento futuro
  ativo:         '#3b82f6',   // azul   — ação < 14 dias
  atencao:       '#f59e0b',   // âmbar  — 14-30 dias sem ação
  inativo:       '#f97316',   // laranja — 30-60 dias sem ação
  critico:       '#ef4444',   // vermelho — > 60 dias sem ação
  nunca_ativado: '#94a3b8',   // cinza  — nunca teve evento
};

// Cor base por tipo (fallback quando não há estado calculado)
const TIPO_COR_BASE = {
  comite:             '#8e44ad',
  base_forte:         '#0057ff',
  lideranca_regional: '#00a650',
  expansao:           '#ffd500',
  agenda:             '#6ec6ff',
  risco:              '#e53935',
};

// ── GET /api/pins/com-status ─────────────────────────────────────────────────
// Retorna todos os pins com estado dinâmico, score de urgência e contadores
// calculados via vw_pin_status (VIEW no Postgres).
app.get('/api/pins/com-status', auth, withTenant, async (req, res) => {
  try {
    const t      = req.tenantId;
    const rf     = regiaoFilter(req);
    const mapaId = req.query.mapa_id || null;

    let where = 'tenant_id = $1';
    const params = [t];

    // Filtra pelo mapa específico se informado
    if (mapaId) {
      where += ` AND mapa_id = $${params.length + 1}`;
      params.push(mapaId);
    }

    if (rf.sql) {
      if (rf.params.length) {
        // filtro por região: substitui placeholder pelo índice correto
        where += rf.sql.replace('$__REG__', `$${params.length + 1}`);
        params.push(...rf.params);
      } else if (rf.sql.includes('1=0')) {
        // usuário sem região vinculada — não vê nenhum pin
        where += ' AND 1=0';
      }
    }

    const rows = await dbAll(
      `SELECT * FROM vw_pin_status WHERE ${where} ORDER BY score_urgencia DESC`,
      params
    );

    // Injeta cor_estado em cada pin para facilitar o frontend
    const resultado = rows.map(p => ({
      ...p,
      cor_estado: ESTADO_COR[p.estado] || TIPO_COR_BASE[p.tipo] || '#555',
      cor_tipo:   TIPO_COR_BASE[p.tipo] || '#555',
    }));

    res.json(resultado);
  } catch (err) {
    console.error('[GET /api/pins/com-status]', err);
    res.status(500).json({ error: 'Erro ao buscar status dos pins' });
  }
});

// ── GET /api/pins/:id/contexto ───────────────────────────────────────────────
// Contexto completo de um pin: status + eventos recentes + próximos + líderes
app.get('/api/pins/:id/contexto', auth, withTenant, async (req, res) => {
  try {
    const t  = req.tenantId;
    const id = parseInt(req.params.id);

    // Status calculado pela view
    const pin = await dbGet(
      'SELECT * FROM vw_pin_status WHERE id = $1 AND tenant_id = $2',
      [id, t]
    );
    if (!pin) return res.status(404).json({ error: 'Pin não encontrado' });

    // Eventos futuros (próximos 60 dias)
    const eventosFuturos = await dbAll(`
      SELECT e.id, e.titulo, e.tipo, e.prioridade, e.data_inicio, e.status,
             p.nome AS pessoa_nome
      FROM agenda_eventos e
      LEFT JOIN pessoas p ON p.id = e.pessoa_id
      WHERE e.pin_id = $1 AND e.tenant_id = $2
        AND e.status = 'pendente'
        AND e.data_inicio >= NOW()
      ORDER BY e.data_inicio ASC
      LIMIT 5
    `, [id, t]);

    // Eventos passados (últimos 90 dias)
    const eventosRecentes = await dbAll(`
      SELECT e.id, e.titulo, e.tipo, e.prioridade, e.data_inicio, e.status,
             p.nome AS pessoa_nome
      FROM agenda_eventos e
      LEFT JOIN pessoas p ON p.id = e.pessoa_id
      WHERE e.pin_id = $1 AND e.tenant_id = $2
        AND e.status <> 'cancelado'
        AND e.data_inicio < NOW()
        AND e.data_inicio >= NOW() - INTERVAL '90 days'
      ORDER BY e.data_inicio DESC
      LIMIT 5
    `, [id, t]);

    // Lideranças próximas à cidade do pin
    const liderancas = await dbAll(`
      SELECT l.id AS lideranca_id, p.id AS pessoa_id, p.nome, p.foto,
             l.expectativa_votos, l.status AS status_lideranca
      FROM liderancas l
      JOIN pessoas p ON p.id = l.pessoa_id AND p.tenant_id = l.tenant_id
      WHERE l.tenant_id = $1
        AND LOWER(l.cidade) = LOWER($2)
        AND l.status = 'ativa'
      ORDER BY l.expectativa_votos DESC NULLS LAST
      LIMIT 5
    `, [t, pin.cidade]);

    res.json({
      pin: {
        ...pin,
        cor_estado: ESTADO_COR[pin.estado] || TIPO_COR_BASE[pin.tipo] || '#555',
        cor_tipo:   TIPO_COR_BASE[pin.tipo] || '#555',
      },
      eventos_futuros:  eventosFuturos,
      eventos_recentes: eventosRecentes,
      liderancas,
    });
  } catch (err) {
    console.error('[GET /api/pins/:id/contexto]', err);
    res.status(500).json({ error: 'Erro ao buscar contexto do pin' });
  }
});

// Rota para o Dono ou Admin criar novos usuários
// Admin não pode criar usuários com nível "dono"
app.post('/api/usuarios',
  createUserLimiter,
  auth,
  withTenant,
  allow('dono', 'admin'),
  async (req, res) => {

  try {
    const { usuario, senha, nome, nivel, regiao_vinculada } = req.body;
    // 🔎 Validação básica
    // Região obrigatória apenas para lider_regiao e níveis de mapa (não para admin/dono/visualizador/lider_capital)
    const niveisPermitidos = NIVEIS_TODOS;
    const semRegiao = ['admin', 'dono', 'visualizador', 'lider_capital'];
    const precisaRegiao = nivel === 'lider_regiao' || (niveisPermitidos.includes(nivel) && !semRegiao.includes(nivel));
    if (!usuario || !senha || !nivel || (precisaRegiao && !regiao_vinculada)) {
      return res.status(400).json({
        error: precisaRegiao
          ? 'Usuario, senha, nivel e regiao_vinculada são obrigatórios'
          : 'Usuario, senha e nivel são obrigatórios'
      });
    }

if (!niveisPermitidos.includes(nivel)) {
  return res.status(400).json({
    error: 'Nivel inválido'
  });
}

// Admin não pode criar usuários com nível dono
if (req.user.nivel === 'admin' && nivel === 'dono') {
  return res.status(403).json({ error: 'Administradores não podem criar usuários com nível Dono.' });
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
  allow('dono', 'admin'),
  async (req, res) => {
  try {
    const users = await dbAll(
      'SELECT id, usuario, nome, nivel, regiao_vinculada, foto_url, contato, lider_principal FROM usuarios WHERE tenant_id = $1',
      [req.tenantId]
    );
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar usuários.' });
  }
});

// Rota para editar usuário
// Admin pode editar qualquer usuário exceto os de nível dono
app.put('/api/usuarios/:id', auth, withTenant, allow('dono', 'admin'), upload.single('foto'), async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, nivel, regiao_vinculada, senha, contato, lider_principal } = req.body;

    const niveisPermitidos = NIVEIS_TODOS;
    if (nivel && !niveisPermitidos.includes(nivel)) {
      return res.status(400).json({ error: 'Nível inválido' });
    }

    // Admin não pode editar usuários dono nem promover alguém a dono
    if (req.user.nivel === 'admin') {
      const alvo = await dbGet('SELECT nivel FROM usuarios WHERE id = $1 AND tenant_id = $2', [id, req.tenantId]);
      if (!alvo) return res.status(404).json({ error: 'Usuário não encontrado.' });
      if (alvo.nivel === 'dono') return res.status(403).json({ error: 'Administradores não podem editar usuários com nível Dono.' });
      if (nivel === 'dono') return res.status(403).json({ error: 'Administradores não podem promover usuários para o nível Dono.' });
    }

    // Monta os campos a atualizar dinamicamente
    const fields = [];
    const values = [];
    let idx = 1;

    if (nome !== undefined)             { fields.push(`nome = $${idx++}`);             values.push(nome); }
    if (nivel !== undefined)            { fields.push(`nivel = $${idx++}`);            values.push(nivel); }
    if (regiao_vinculada !== undefined) { fields.push(`regiao_vinculada = $${idx++}`); values.push(regiao_vinculada); }
    if (contato !== undefined)          { fields.push(`contato = $${idx++}`);          values.push(contato); }
    if (lider_principal !== undefined)  { fields.push(`lider_principal = $${idx++}`);  values.push(lider_principal === 'true' || lider_principal === true); }
    if (senha) {
      const hash = await require('bcrypt').hash(senha, 10);
      fields.push(`senha_hash = $${idx++}`);
      values.push(hash);
    }

    // Foto upload
    if (req.file) {
      let fotoPath = req.file.path;
      try { fotoPath = await otimizarImagem(req.file.path); } catch (e) { /* mantém original */ }
      const fotoUrl = '/uploads/' + path.basename(fotoPath);
      fields.push(`foto_url = $${idx++}`);
      values.push(fotoUrl);
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

// Rota pública (auth) para buscar líderes de região
app.get('/api/lideres-regiao', auth, withTenant, async (req, res) => {
  try {
    const lideres = await dbAll(
      `SELECT id, nome, contato, foto_url, regiao_vinculada
       FROM usuarios
       WHERE tenant_id = $1 AND lider_principal = TRUE`,
      [req.tenantId]
    );
    res.json(lideres);
  } catch (err) {
    console.error('Erro ao buscar líderes de região:', err);
    res.status(500).json({ error: 'Erro ao buscar líderes.' });
  }
});

// Rota para excluir usuário
// Admin pode excluir qualquer usuário exceto os de nível dono
app.delete('/api/usuarios/:id', auth, withTenant, allow('dono', 'admin'), async (req, res) => {

  try {
    // Admin não pode excluir usuários dono
    if (req.user.nivel === 'admin') {
      const alvo = await dbGet('SELECT nivel FROM usuarios WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
      if (!alvo) return res.status(404).json({ error: 'Usuário não encontrado.' });
      if (alvo.nivel === 'dono') return res.status(403).json({ error: 'Administradores não podem excluir usuários com nível Dono.' });
    }

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
/* ================= PRESENÇA / USUÁRIOS ONLINE ================= */

// POST /api/usuarios/heartbeat — marca o usuário como online (last_seen = agora)
app.post('/api/usuarios/heartbeat', auth, withTenant, async (req, res) => {
  try {
    await pool.query(
      'UPDATE usuarios SET last_seen = NOW() WHERE id = $1 AND tenant_id = $2',
      [req.user.id, req.tenantId]
    );
    res.json({ ok: true });
  } catch (err) {
    // Silencioso: coluna pode não existir ainda
    res.json({ ok: false });
  }
});

// GET /api/usuarios/online — retorna contagem de usuários ativos nos últimos 5 min
app.get('/api/usuarios/online', auth, withTenant, async (req, res) => {
  try {
    const row = await dbGet(
      `SELECT COUNT(*) AS count FROM usuarios
       WHERE tenant_id = $1 AND last_seen >= NOW() - INTERVAL '5 minutes'`,
      [req.tenantId]
    );
    res.json({ count: parseInt(row?.count || '0', 10) });
  } catch (err) {
    res.json({ count: 0 });
  }
});

// POST /api/usuarios/location — usuário envia sua posição GPS
app.post('/api/usuarios/location', auth, withTenant, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    if (latitude == null || longitude == null) {
      return res.status(400).json({ ok: false, error: 'latitude e longitude obrigatórios' });
    }
    await pool.query(
      `UPDATE usuarios
         SET latitude = $1, longitude = $2, location_updated_at = NOW(), last_seen = NOW()
       WHERE id = $3 AND tenant_id = $4`,
      [parseFloat(latitude), parseFloat(longitude), req.user.id, req.tenantId]
    );
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// GET /api/usuarios/locations — admin/dono vê todos os usuários com localização recente
app.get('/api/usuarios/locations', auth, withTenant, async (req, res) => {
  try {
    const nivel = req.user.nivel || '';
    const isAdmin = nivel === 'dono' || nivel === 'admin';
    if (!isAdmin) return res.status(403).json({ ok: false, error: 'Acesso restrito' });

    const rows = await pool.query(
      `SELECT id, nome, nivel, regiao_vinculada AS regiao,
              latitude, longitude, location_updated_at
         FROM usuarios
        WHERE tenant_id = $1
          AND latitude IS NOT NULL
          AND longitude IS NOT NULL
          AND location_updated_at >= NOW() - INTERVAL '15 minutes'
        ORDER BY location_updated_at DESC`,
      [req.tenantId]
    );
    res.json({ ok: true, data: rows.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
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
        COUNT(*) FILTER (WHERE status = 'ativa') AS lideres_ativos
      FROM liderancas
      WHERE regiao IS NOT NULL AND regiao <> '' AND tenant_id = $1
      GROUP BY regiao
    `, [t]);
    const mapaMap = {};
    mapeados.forEach(m => { mapaMap[m.regiao] = m; });

    // Busca labels e ordem das regiões configuradas
    const regioesCfg = await dbAll(
      'SELECT chave, label, ordem FROM tenant_regioes WHERE tenant_id = $1 ORDER BY ordem ASC', [t]
    );
    const labelMap = {};
    regioesCfg.forEach(r => { labelMap[r.chave] = r.label || r.chave; });

    // Une todas as regiões encontradas nos dados
    const allRegioes = new Set([
      ...regioesCfg.map(r => r.chave),
      ...Object.keys(metasByRegiao),
      ...mapeados.map(m => m.regiao)
    ]);

    const resultado = [...allRegioes].map(regiao => {
      const meta = metasByRegiao[regiao] || { meta_total: 0, metas: {} };
      const map  = mapaMap[regiao] || {};
      return {
        regiao,
        label:          labelMap[regiao] || regiao,
        meta_total:     meta.meta_total,
        metas:          meta.metas,
        votos_mapeados: parseInt(map.votos_mapeados || 0),
        total_lideres:  parseInt(map.total_lideres  || 0),
        lideres_ativos: parseInt(map.lideres_ativos || 0),
        pct_atingido: meta.meta_total > 0
          ? Math.round((parseInt(map.votos_mapeados || 0) / meta.meta_total) * 100)
          : 0
      };
    }).sort((a, b) => {
      // Ordena pela ordem configurada, depois pelo meta_total
      const oa = regioesCfg.findIndex(r => r.chave === a.regiao);
      const ob = regioesCfg.findIndex(r => r.chave === b.regiao);
      if (oa !== -1 && ob !== -1) return oa - ob;
      return b.meta_total - a.meta_total;
    });

    res.json(resultado);
  } catch (err) {
    console.error('Erro dashboard/expectativa-regioes:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ================= KEEP ALIVE (RENDER) ================= */


/* ================= EXPORT DADOS REGIÕES (para planilha Excel) ================= */
// GET /api/export-dados-regioes — retorna JSON com metas por candidato,
// lideranças + dobradas por candidato, e nº de líderes por cidade.
// Admin/dono only.
app.get('/api/export-dados-regioes', auth, withTenant, allow('dono', 'admin'), async (req, res) => {
  try {
    const t = req.tenantId;

    // 1. Metas por candidato por cidade
    const metaRows = await dbAll(`
      SELECT
        UPPER(TRIM(cidade)) AS cidade,
        expectativa_celia    AS meta_celia,
        expectativa_fernando AS meta_fernando,
        expectativas
      FROM expectativa_cidade
      WHERE tenant_id = $1
      ORDER BY cidade
    `, [t]);

    // 2. Lideranças por cidade + candidato
    const liderRows = await dbAll(`
      SELECT
        UPPER(TRIM(cidade)) AS cidade,
        COUNT(*)                                                         AS num_lideres,
        COALESCE(SUM(expectativa_votos) FILTER (
          WHERE vinculo_politico = 'celia' OR vinculo_politico = 'ambos'), 0) AS lid_votos_celia,
        COALESCE(SUM(expectativa_votos) FILTER (
          WHERE vinculo_politico = 'fernando' OR vinculo_politico = 'ambos'), 0) AS lid_votos_fernando
      FROM liderancas
      WHERE tenant_id = $1 AND cidade IS NOT NULL AND cidade <> ''
      GROUP BY UPPER(TRIM(cidade))
    `, [t]);

    // 3. Dobradas por cidade + candidato
    const dobRows = await dbAll(`
      SELECT
        UPPER(TRIM(cidade)) AS cidade,
        COALESCE(SUM(votos_candidato) FILTER (
          WHERE vinculo_politico = 'celia'), 0)    AS dob_votos_celia,
        COALESCE(SUM(votos_candidato) FILTER (
          WHERE vinculo_politico = 'fernando'), 0) AS dob_votos_fernando
      FROM dobradas
      WHERE tenant_id = $1 AND cidade IS NOT NULL AND cidade <> ''
      GROUP BY UPPER(TRIM(cidade))
    `, [t]);

    // Montar resultado por cidade
    const map = {};
    metaRows.forEach(r => {
      map[r.cidade] = {
        meta_celia: Number(r.meta_celia || 0),
        meta_fernando: Number(r.meta_fernando || 0),
        lid_celia: 0, lid_fernando: 0,
        dob_celia: 0, dob_fernando: 0,
        num_lideres: 0,
      };
    });
    liderRows.forEach(r => {
      if (!map[r.cidade]) map[r.cidade] = { meta_celia:0, meta_fernando:0, lid_celia:0, lid_fernando:0, dob_celia:0, dob_fernando:0, num_lideres:0 };
      map[r.cidade].lid_celia    = Number(r.lid_votos_celia || 0);
      map[r.cidade].lid_fernando = Number(r.lid_votos_fernando || 0);
      map[r.cidade].num_lideres  = Number(r.num_lideres || 0);
    });
    dobRows.forEach(r => {
      if (!map[r.cidade]) map[r.cidade] = { meta_celia:0, meta_fernando:0, lid_celia:0, lid_fernando:0, dob_celia:0, dob_fernando:0, num_lideres:0 };
      map[r.cidade].dob_celia    = Number(r.dob_votos_celia || 0);
      map[r.cidade].dob_fernando = Number(r.dob_votos_fernando || 0);
    });

    // lid + dob por candidato
    const resultado = Object.entries(map).map(([cidade, d]) => ({
      cidade,
      meta_celia:           d.meta_celia,
      meta_fernando:        d.meta_fernando,
      lid_dob_celia:        d.lid_celia + d.dob_celia,
      lid_dob_fernando:     d.lid_fernando + d.dob_fernando,
      num_lideres:          d.num_lideres,
    }));

    res.json({ cidades: resultado, gerado_em: new Date().toISOString() });
  } catch (err) {
    console.error('[GET /export-dados-regioes]', err);
    res.status(500).json({ error: 'Erro ao exportar dados' });
  }
});


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

// ─────────────────────────────────────────────
// DOBRADAS
// ─────────────────────────────────────────────

// Auto-criação da tabela se não existir
pool.query(`
  CREATE TABLE IF NOT EXISTS dobradas (
    id SERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    cidade TEXT NOT NULL,
    vinculo_politico TEXT NOT NULL,
    parceiro_nome TEXT NOT NULL,
    parceiro_foto TEXT,
    parceiro_cargo TEXT,
    responsavel TEXT,
    votos_oferecidos INTEGER DEFAULT 0,
    votos_candidato INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(e => console.error('Erro criando tabela dobradas:', e));

// Migrações de colunas para tabelas criadas antes desta versão
pool.query(`ALTER TABLE dobradas ADD COLUMN IF NOT EXISTS responsavel TEXT`)
  .catch(e => console.error('Erro migrando coluna responsavel:', e));
pool.query(`ALTER TABLE dobradas ADD COLUMN IF NOT EXISTS votos_candidato INTEGER DEFAULT 0`)
  .catch(e => console.error('Erro migrando coluna votos_candidato:', e));

// GET todas as dobradas (para mapa + sidebar)
app.get('/api/dobradas', auth, withTenant, async (req, res) => {
  try {
    const { cidade } = req.query;
    let sql = 'SELECT * FROM dobradas WHERE tenant_id = $1';
    const params = [req.tenantId];
    if (cidade) { sql += ' AND LOWER(cidade) = LOWER($2)'; params.push(cidade); }
    sql += ' ORDER BY cidade, id';
    const rows = await dbAll(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Erro GET /api/dobradas:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST nova dobrada (aceita foto via multipart)
app.post('/api/dobradas', auth, withTenant, allowAll(), upload.single('foto'), async (req, res) => {
  const { cidade, vinculo_politico, parceiro_nome, parceiro_cargo, responsavel, votos_oferecidos, votos_candidato } = req.body;
  if (!cidade || !vinculo_politico || !parceiro_nome) {
    return res.status(400).json({ error: 'Campos obrigatórios: cidade, vinculo_politico, parceiro_nome' });
  }
  try {
    let parceiro_foto = null;
    if (req.file) {
      const caminhoOtimizado = await otimizarImagem(req.file.path);
      const fileBuffer = fs.readFileSync(caminhoOtimizado);
      const fileName = `dobrada_${Date.now()}.webp`;
      const { error } = await supabase.storage
        .from('liderancas').upload(fileName, fileBuffer, { contentType: 'image/webp', upsert: false });
      if (error) throw error;
      parceiro_foto = supabase.storage.from('liderancas').getPublicUrl(fileName).data.publicUrl;
      try { fs.unlinkSync(caminhoOtimizado); } catch (_) {}
    }
    const row = await dbGet(
      `INSERT INTO dobradas (tenant_id, cidade, vinculo_politico, parceiro_nome, parceiro_foto, parceiro_cargo, responsavel, votos_oferecidos, votos_candidato)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [req.tenantId, cidade.trim(), vinculo_politico.trim(), parceiro_nome.trim(),
       parceiro_foto, parceiro_cargo || null, responsavel?.trim() || null,
       Number(votos_oferecidos) || 0, Number(votos_candidato) || 0]
    );
    res.json(row);
  } catch (err) {
    console.error('Erro POST /api/dobradas:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT editar dobrada
app.put('/api/dobradas/:id', auth, withTenant, allow('dono', 'admin'), upload.single('foto'), async (req, res) => {
  const { parceiro_nome, parceiro_cargo, responsavel, votos_oferecidos, votos_candidato, vinculo_politico } = req.body;
  try {
    // Se uma nova foto foi enviada, faz upload no Supabase
    let novaFoto = null;
    if (req.file) {
      const caminhoOtimizado = await otimizarImagem(req.file.path);
      const fileBuffer = fs.readFileSync(caminhoOtimizado);
      const fileName = `dobrada_${Date.now()}.webp`;
      const { error } = await supabase.storage
        .from('liderancas').upload(fileName, fileBuffer, { contentType: 'image/webp', upsert: false });
      if (error) throw error;
      novaFoto = supabase.storage.from('liderancas').getPublicUrl(fileName).data.publicUrl;
      try { fs.unlinkSync(caminhoOtimizado); } catch (_) {}
    }

    const row = await dbGet(
      `UPDATE dobradas SET
         parceiro_nome    = COALESCE($1, parceiro_nome),
         parceiro_foto    = COALESCE($2, parceiro_foto),
         parceiro_cargo   = COALESCE($3, parceiro_cargo),
         responsavel      = COALESCE($4, responsavel),
         votos_oferecidos = COALESCE($5, votos_oferecidos),
         votos_candidato  = COALESCE($6, votos_candidato),
         vinculo_politico = COALESCE($7, vinculo_politico)
       WHERE id = $8 AND tenant_id = $9 RETURNING *`,
      [parceiro_nome || null, novaFoto,
       parceiro_cargo || null, responsavel || null,
       votos_oferecidos !== undefined ? Number(votos_oferecidos) : null,
       votos_candidato !== undefined ? Number(votos_candidato) : null,
       vinculo_politico || null, req.params.id, req.tenantId]
    );
    if (!row) return res.status(404).json({ error: 'Dobrada não encontrada' });
    res.json(row);
  } catch (err) {
    console.error('Erro PUT /api/dobradas/:id:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE dobrada
app.delete('/api/dobradas/:id', auth, withTenant, allow('dono', 'admin'), async (req, res) => {
  try {
    await dbRun('DELETE FROM dobradas WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro DELETE /api/dobradas/:id:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

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

    // Dobradas por candidato: contagem + votos_oferecidos
    const dobradasPorCandidato = {};
    for (const c of candidatos) {
      const row = await dbGet(
        `SELECT COUNT(*) as total, COALESCE(SUM(votos_oferecidos),0) as votos
         FROM dobradas WHERE tenant_id = $1 AND LOWER(vinculo_politico) = LOWER($2)`,
        [t, c.chave]
      );
      dobradasPorCandidato[c.chave] = {
        count: parseInt(row.total),
        votos: parseInt(row.votos)
      };
    }

    // Totais globais de dobradas
    const dobTotaisRow = await dbGet(
      'SELECT COUNT(*) as total, COALESCE(SUM(votos_oferecidos),0) as votos FROM dobradas WHERE tenant_id = $1',
      [t]
    );

    // Contagem de cidades/bairros com cobertura (liderança OU dobrada)
    const [cidadesComLid, cidadesComDob] = await Promise.all([
      dbAll('SELECT DISTINCT LOWER(cidade) as cidade FROM liderancas WHERE tenant_id = $1 AND cidade IS NOT NULL', [t]),
      dbAll('SELECT DISTINCT LOWER(cidade) as cidade FROM dobradas WHERE tenant_id = $1 AND cidade IS NOT NULL', [t]),
    ]);
    const cidadesCobertas = new Set([
      ...cidadesComLid.map(r => r.cidade),
      ...cidadesComDob.map(r => r.cidade),
    ]).size;

    const porCandidato = candidatos.map(c => ({
      chave:         c.chave,
      nome:          c.nome,
      liderancas:    liderancasPorCandidato[c.chave] || 0,
      cidades:       Math.round(cidadesPorCandidato[c.chave] || 0),
      dobradas:      dobradasPorCandidato[c.chave]?.count || 0,
      votosDobradas: dobradasPorCandidato[c.chave]?.votos || 0,
    }));

    res.json({
      totalLiderancas:  parseInt(totalLiderancas.total),
      ativas:           parseInt(ativasCount.total),
      inativas:         parseInt(inativasCount.total),
      regioesAtivas:    parseInt(regioesAtivas.total),
      gastosTotal:      parseFloat(gastosTotal.total),
      gastosUlt30:      parseFloat(gastosUlt30.total),
      totalDobradas:    parseInt(dobTotaisRow.total),
      totalVotosDobradas: parseInt(dobTotaisRow.votos),
      cidadesCobertas,
      statusBreakdown,
      votosPorVinculo,
      liderancasTotal:  parseInt(votosTotal.total),
      cidadesTotal:     porCandidato.reduce((s, c) => s + c.cidades, 0),
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
        l.foto_url,
        COALESCE(SUM(g.valor), 0) as total_gastos,
        COUNT(g.id) as num_gastos
      FROM liderancas l
      LEFT JOIN gastos_lideranca g ON g.lideranca_id = l.id
      WHERE l.tenant_id = $1
      GROUP BY l.id, l.nome, l.cidade, l.regiao, l.status, l.expectativa_votos, l.vinculo_politico, l.foto_url
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

// POST upload de logo do tenant (multipart/form-data, campo 'logo')
app.post('/api/admin/config/logo', auth, withTenant, allow('dono'), upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    // Otimiza: redimensiona para largura máxima 400px mantendo proporção, converte para WebP
    const tempPath = req.file.path;
    const outPath  = tempPath + '.webp';
    await sharp(tempPath)
      .resize({ width: 400, withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(outPath);
    try { fs.unlinkSync(tempPath); } catch {}

    const fileBuffer = fs.readFileSync(outPath);
    const fileName   = `${req.tenantId}/logo_${Date.now()}.webp`;

    const { error: uploadErr } = await supabase.storage
      .from('logos')
      .upload(fileName, fileBuffer, { contentType: 'image/webp', upsert: true });
    try { fs.unlinkSync(outPath); } catch {}
    if (uploadErr) throw uploadErr;

    const { data } = supabase.storage.from('logos').getPublicUrl(fileName);
    const logo_url = data.publicUrl;

    await pool.query(
      `INSERT INTO tenant_config (tenant_id, logo_url)
       VALUES ($1, $2)
       ON CONFLICT (tenant_id) DO UPDATE SET logo_url = $2`,
      [req.tenantId, logo_url]
    );
    invalidateTenantCache(req.tenantId);
    res.json({ ok: true, logo_url });
  } catch (err) {
    console.error('[POST /api/admin/config/logo]', err);
    res.status(500).json({ error: err.message });
  }
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
    const { chave, nome, cor_fundo, cor_texto, cor_mapa, tem_votos_2022, ordem, nome_urna_bq, ano_eleicao_bq, cargo_bq, meta_geral } = req.body;
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
      `INSERT INTO tenant_candidatos (tenant_id, chave, nome, cor_fundo, cor_texto, cor_mapa, tem_votos_2022, ordem, foto_url, nome_urna_bq, ano_eleicao_bq, cargo_bq, meta_geral)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (tenant_id, chave) DO UPDATE SET
         nome = $3, cor_fundo = $4, cor_texto = $5, cor_mapa = $6, tem_votos_2022 = $7, ordem = $8,
         foto_url = COALESCE($9, tenant_candidatos.foto_url),
         nome_urna_bq = COALESCE($10, tenant_candidatos.nome_urna_bq),
         ano_eleicao_bq = COALESCE($11, tenant_candidatos.ano_eleicao_bq),
         cargo_bq = COALESCE($12, tenant_candidatos.cargo_bq),
         meta_geral = COALESCE($13, tenant_candidatos.meta_geral)`,
      [req.tenantId, chave, nome, cor_fundo ?? '#e0e7ff', cor_texto ?? '#3730a3',
       cor_mapa ?? cor_texto ?? '#cb181d',
       tem_votos_2022 === 'true' || tem_votos_2022 === true, ordem ?? 0, foto_url,
       nome_urna_bq || null,
       ano_eleicao_bq ? parseInt(ano_eleicao_bq) : null,
       cargo_bq || null,
       meta_geral != null ? parseInt(meta_geral) : null]
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

// ── Home Cards Config ─────────────────────────────────────────────────────────

// GET — retorna configuração de visibilidade dos cards do home por nível
// Qualquer usuário autenticado pode ler (para home.html filtrar corretamente)
// Apenas dono pode modificar (PUT abaixo)
app.get('/api/admin/config/home-cards', auth, withTenant, async (req, res) => {
  try {
    const row = await dbGet('SELECT home_cards_config FROM tenant_config WHERE tenant_id = $1', [req.tenantId]);
    res.json(row?.home_cards_config ?? {});
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar config de cards' });
  }
});

// PUT — salva configuração de visibilidade dos cards do home
app.put('/api/admin/config/home-cards', auth, withTenant, allow('dono'), async (req, res) => {
  try {
    const cardsConfig = req.body;
    if (typeof cardsConfig !== 'object' || Array.isArray(cardsConfig)) {
      return res.status(400).json({ error: 'Formato inválido' });
    }
    await pool.query(
      `INSERT INTO tenant_config (tenant_id, home_cards_config)
       VALUES ($1, $2)
       ON CONFLICT (tenant_id) DO UPDATE SET home_cards_config = $2`,
      [req.tenantId, JSON.stringify(cardsConfig)]
    );
    invalidateTenantCache(req.tenantId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[PUT /api/admin/config/home-cards]', err);
    res.status(500).json({ error: 'Erro ao salvar config de cards' });
  }
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

  const cidadesArray = Array.isArray(cidades) ? cidades : (cidades ?? []);

  await pool.query(
    `INSERT INTO tenant_regioes (tenant_id, chave, label, cidades, lideres, ordem)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (tenant_id, chave) DO UPDATE SET
       label = $3, cidades = $4, lideres = $5, ordem = $6`,
    [req.tenantId, chave, label, JSON.stringify(cidadesArray), JSON.stringify(lideres ?? []), ordem ?? 0]
  );

  // ── Cascade: propaga a mudança de região para todos os registros que referenciam
  // essas cidades. Assim, lideranças, observações, pins e expectativas sempre
  // refletem a configuração atual de regioes, e não o valor gravado no cadastro.
  if (cidadesArray.length > 0) {
    const cidadesNorm  = cidadesArray.map(c => (c || '').toLowerCase().trim()).filter(Boolean);
    // Parâmetros: $1 = tenantId, $2 = chave (nova região), $3...$N = cidades em lowercase
    const placeholders = cidadesNorm.map((_, i) => `$${i + 3}`).join(', ');
    const whereClause  = `tenant_id = $1 AND LOWER(TRIM(cidade)) IN (${placeholders})`;
    const params       = [req.tenantId, chave, ...cidadesNorm];

    await Promise.all([
      pool.query(`UPDATE liderancas         SET regiao = $2 WHERE ${whereClause}`, params),
      pool.query(`UPDATE observacoes        SET regiao = $2 WHERE ${whereClause}`, params),
      pool.query(`UPDATE pins               SET regiao = $2 WHERE ${whereClause}`, params),
      pool.query(`UPDATE expectativa_cidade SET regiao = $2 WHERE ${whereClause}`, params),
    ]);
  }

  invalidateTenantCache(req.tenantId);
  res.json({ ok: true });
});


// ── Sincroniza regiao em todas as tabelas a partir da config atual ────────────
// Útil após uma migração de cidades entre regiões que ocorreu antes desta feature.
app.post('/api/admin/config/regioes/sincronizar', auth, withTenant, allow('dono'), async (req, res) => {
  try {
    const regioes = await dbAll(
      'SELECT chave, cidades FROM tenant_regioes WHERE tenant_id = $1',
      [req.tenantId]
    );

    let totalAtualizados = 0;

    for (const regiao of regioes) {
      let lista = regiao.cidades;
      if (typeof lista === 'string') { try { lista = JSON.parse(lista); } catch { lista = []; } }
      if (!Array.isArray(lista) || lista.length === 0) continue;

      const cidadesNorm  = lista.map(c => (c || '').toLowerCase().trim()).filter(Boolean);
      const placeholders = cidadesNorm.map((_, i) => `$${i + 3}`).join(', ');
      const whereClause  = `tenant_id = $1 AND LOWER(TRIM(cidade)) IN (${placeholders})`;
      const params       = [req.tenantId, regiao.chave, ...cidadesNorm];

      const results = await Promise.all([
        pool.query(`UPDATE liderancas         SET regiao = $2 WHERE ${whereClause} AND (regiao IS DISTINCT FROM $2)`, params),
        pool.query(`UPDATE observacoes        SET regiao = $2 WHERE ${whereClause} AND (regiao IS DISTINCT FROM $2)`, params),
        pool.query(`UPDATE pins               SET regiao = $2 WHERE ${whereClause} AND (regiao IS DISTINCT FROM $2)`, params),
        pool.query(`UPDATE expectativa_cidade SET regiao = $2 WHERE ${whereClause} AND (regiao IS DISTINCT FROM $2)`, params),
      ]);
      totalAtualizados += results.reduce((s, r) => s + r.rowCount, 0);
    }

    invalidateTenantCache(req.tenantId);
    res.json({ ok: true, registros_atualizados: totalAtualizados });
  } catch (err) {
    console.error('[POST /api/admin/config/regioes/sincronizar]', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/config/regioes/:chave', auth, withTenant, allow('dono'), async (req, res) => {
  await pool.query(
    'DELETE FROM tenant_regioes WHERE tenant_id = $1 AND chave = $2',
    [req.tenantId, req.params.chave]
  );
  invalidateTenantCache(req.tenantId);
  res.json({ ok: true });
});


/* ================= AUTO-CADASTRO ================= */

// POST /api/admin/cadastro-token  — gera token de convite (admin/dono)
app.post('/api/admin/cadastro-token', auth, withTenant, allow('dono', 'admin'), async (req, res) => {
  try {
    await ensureCadastroTokensTable();

    const { regiao, horas = 48 } = req.body;
    const token      = crypto.randomBytes(24).toString('hex');
    const expires_at = new Date(Date.now() + Number(horas) * 3600 * 1000);

    await pool.query(
      `INSERT INTO cadastro_tokens (token, tenant_id, regiao, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [token, req.tenantId, regiao || null, expires_at, req.user?.id || null]
    );

    // Retorna apenas o token — o frontend monta a URL com window.location.origin
    res.json({ ok: true, token, expires_at });
  } catch (err) {
    console.error('[POST /api/admin/cadastro-token]', err.message, err.stack);
    res.status(500).json({ erro: 'Erro ao gerar token: ' + err.message });
  }
});

// Garante tabela cadastro_tokens (chamada compartilhada pelas rotas públicas)
async function ensureCadastroTokensTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cadastro_tokens (
      id          SERIAL PRIMARY KEY,
      token       TEXT NOT NULL UNIQUE,
      tenant_id   INTEGER NOT NULL,
      regiao      TEXT,
      cidade      TEXT,
      used_at     TIMESTAMPTZ,
      expires_at  TIMESTAMPTZ NOT NULL,
      created_by  TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Corrige tipo caso a tabela já exista com created_by INTEGER
  try {
    await pool.query(`ALTER TABLE cadastro_tokens ALTER COLUMN created_by TYPE TEXT USING created_by::TEXT`);
  } catch (_) { /* já é TEXT ou coluna não existe — ignora */ }
}

// GET /api/public/cadastro/:token  — valida token e retorna metadados do tenant
app.get('/api/public/cadastro/:token', async (req, res) => {
  try {
    await ensureCadastroTokensTable();
    const { token } = req.params;
    // Busca direto na tabela de tokens — sem JOIN com tenants (não existe tabela tenants)
    const row = await dbGet(
      `SELECT * FROM cadastro_tokens WHERE token = $1`,
      [token]
    );

    if (!row)                                          return res.status(404).json({ erro: 'Link inválido' });
    if (row.used_at)                                   return res.status(410).json({ erro: 'Este link já foi utilizado' });
    if (new Date(row.expires_at) < new Date())         return res.status(410).json({ erro: 'Este link expirou' });

    // Retorna configuração visual do tenant (nome, logo, cores, regioes para o form público)
    const cfg = await getConfigTenant(row.tenant_id);

    // Cidades da região pré-definida (para o select de cidade no form público)
    let cidadesRegiao = [];
    if (row.regiao && cfg.regioes) {
      const reg = cfg.regioes.find(r => r.chave === row.regiao);
      if (reg && reg.cidades) {
        cidadesRegiao = Array.isArray(reg.cidades) ? reg.cidades
          : (typeof reg.cidades === 'string' ? JSON.parse(reg.cidades) : []);
      }
    }

    res.json({
      ok:            true,
      regiao:        row.regiao,
      regiao_label:  cfg.regioes?.find(r => r.chave === row.regiao)?.label || row.regiao,
      cidades:       cidadesRegiao,
      nome_sistema:  cfg.nome_sistema,
      logo_url:      cfg.logo_url,
      cores:         cfg.cores,
      candidatos:    cfg.candidatos,
    });
  } catch (err) {
    console.error('[GET /api/public/cadastro/:token]', err);
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// POST /api/public/cadastro/:token  — registra nova liderança via formulário público
const cadastroPublicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });
app.post('/api/public/cadastro/:token', cadastroPublicLimiter, upload.single('foto'), async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureCadastroTokensTable();
    const { token } = req.params;

    // Valida token dentro de transação
    await client.query('BEGIN');
    const row = await client.query(
      `SELECT * FROM cadastro_tokens WHERE token = $1 FOR UPDATE`,
      [token]
    );
    const tk = row.rows[0];

    if (!tk)                            { await client.query('ROLLBACK'); return res.status(404).json({ erro: 'Link inválido' }); }
    if (tk.used_at)                     { await client.query('ROLLBACK'); return res.status(410).json({ erro: 'Este link já foi utilizado' }); }
    if (new Date(tk.expires_at) < new Date()) { await client.query('ROLLBACK'); return res.status(410).json({ erro: 'Link expirado' }); }

    const {
      nome, telefone, cidade,
      apelido, rede_social, data_nascimento,
      responsavel, vinculo_politico
    } = req.body;

    // Validações básicas
    if (!nome || !telefone) {
      await client.query('ROLLBACK');
      return res.status(400).json({ erro: 'Nome e telefone são obrigatórios' });
    }

    // Normaliza telefone (só dígitos) — armazenado em pessoas.contato
    const telLimpo = String(telefone).replace(/\D/g, '').slice(0, 20);
    if (telLimpo.length < 10) {
      await client.query('ROLLBACK');
      return res.status(400).json({ erro: 'Telefone inválido' });
    }

    // Verifica duplicata por telefone dentro do tenant
    const dupCheck = await client.query(
      `SELECT p.id FROM pessoas p
         JOIN liderancas l ON l.pessoa_id = p.id AND l.tenant_id = p.tenant_id
        WHERE p.tenant_id = $1 AND p.contato = $2 LIMIT 1`,
      [tk.tenant_id, telLimpo]
    );
    if (dupCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ erro: 'Este telefone já está cadastrado no sistema' });
    }

    // Sanitize
    const nomeLimpo       = String(nome).trim().slice(0, 120);
    const cidadeLimpa     = cidade           ? String(cidade).trim().slice(0, 80)           : null;
    const vinculoLimpo    = vinculo_politico ? String(vinculo_politico).trim().slice(0, 80) : null;
    const apelidoLimpo    = apelido          ? String(apelido).trim().slice(0, 80)          : null;
    const redeSocialLimpo = rede_social      ? String(rede_social).trim().slice(0, 120)     : null;
    const responsavelLimpo= responsavel      ? String(responsavel).trim().slice(0, 120)     : null;
    const nascimento      = data_nascimento  || null;

    // Upload de foto (mesmo fluxo do admin: multer → sharp → Supabase storage)
    let fotoUrl = null;
    if (req.file) {
      try {
        const caminhoOtimizado = await otimizarImagem(req.file.path);
        const fileBuffer = fs.readFileSync(caminhoOtimizado);
        const fileName = `${Date.now()}.webp`;
        const { error: uploadErr } = await supabase.storage
          .from('liderancas').upload(fileName, fileBuffer, { contentType: 'image/webp', upsert: false });
        if (uploadErr) throw uploadErr;
        fotoUrl = supabase.storage.from('liderancas').getPublicUrl(fileName).data.publicUrl;
        try { fs.unlinkSync(caminhoOtimizado); } catch (_) {}
      } catch (fotoErr) {
        console.warn('[cadastro público] erro no upload de foto:', fotoErr.message);
        // Não aborta o cadastro por causa da foto
      }
    }

    // Resolve a região a partir da cidade (ou usa a do token)
    const regiaoFinal = tk.regiao || (cidadeLimpa ? await resolverRegiao(tk.tenant_id, cidadeLimpa) : null);

    // 1) Cria ou recupera pessoa (upsert por nome normalizado) — mesmas tabelas do painel
    // cadastrado_por_id usa tk.created_by (quem gerou o link de cadastro público).
    const upsert = await client.query(`
      INSERT INTO pessoas (tenant_id, nome, nome_norm, contato, foto, apelido, rede_social, data_nascimento, cadastrado_por_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (tenant_id, nome_norm) DO UPDATE
        SET contato         = COALESCE(EXCLUDED.contato,         pessoas.contato),
            foto            = COALESCE(EXCLUDED.foto,            pessoas.foto),
            apelido         = COALESCE(EXCLUDED.apelido,         pessoas.apelido),
            rede_social     = COALESCE(EXCLUDED.rede_social,     pessoas.rede_social),
            data_nascimento = COALESCE(EXCLUDED.data_nascimento, pessoas.data_nascimento),
            atualizado_em   = now()
      RETURNING id
    `, [tk.tenant_id, nomeLimpo, normalizarNome(nomeLimpo),
        telLimpo, fotoUrl, apelidoLimpo, redeSocialLimpo, nascimento,
        tk.created_by || null]); // $9 — quem gerou o token; preservado no ON CONFLICT
    const pessoaId = upsert.rows[0].id;

    // 2) Cria vínculo pessoa ↔ cidade em liderancas (mesmas colunas do painel)
    await client.query(`
      INSERT INTO liderancas (pessoa_id, tenant_id, cidade, regiao, vinculo_politico, responsavel, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'ativa')
      ON CONFLICT (pessoa_id, cidade, tenant_id) DO NOTHING
    `, [pessoaId, tk.tenant_id, cidadeLimpa, regiaoFinal, vinculoLimpo, responsavelLimpo]);

    // Marca token como usado
    await client.query(
      `UPDATE cadastro_tokens SET used_at = NOW() WHERE id = $1`,
      [tk.id]
    );

    await client.query('COMMIT');
    res.json({ ok: true, id: pessoaId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /api/public/cadastro/:token]', err.message);
    res.status(500).json({ erro: 'Erro ao registrar: ' + err.message });
  } finally {
    client.release();
  }
});

/* ================= BIGQUERY – ELEIÇÕES ================= */

/* ---------- Lookup bairro: zona+seção → bairro (carregado do CSV) ---------- */
// Estrutura: bairrosLookup[id_municipio_tse][zona_secao] = 'BOTAFOGO'
const bairrosLookup = {};
(function loadBairrosCSV() {
  const csvPath = path.join(__dirname, '..', 'bairros.csv');
  try {
    if (!fs.existsSync(csvPath)) {
      console.warn('[bairros] bairros.csv não encontrado em', csvPath);
      return;
    }
    // CSV usa encoding Latin-1 (ISO-8859-1)
    const raw = fs.readFileSync(csvPath, 'latin1');
    const lines = raw.split(/\r?\n/).slice(1); // pula cabeçalho
    let count = 0;
    for (const line of lines) {
      const cols = line.split(';');
      if (cols.length < 9) continue;
      const zona   = cols[0].trim();
      const idMun  = cols[1].trim(); // Código Município TSE, ex: "60011"
      const bairro = cols[3].trim();
      const secao  = cols[8].trim();
      if (!zona || !idMun || !bairro || !secao) continue;
      if (!bairrosLookup[idMun]) bairrosLookup[idMun] = {};
      bairrosLookup[idMun][`${zona}_${secao}`] = bairro;
      count++;
    }
    const muns = Object.keys(bairrosLookup).length;
    console.log(`[bairros] ${count} seções carregadas para ${muns} município(s)`);
  } catch (e) {
    console.error('[bairros] Erro ao carregar CSV:', e.message);
  }
})();

// Rota de diagnóstico — acesse /api/eleicoes/ping no browser para confirmar deploy
app.get('/api/eleicoes/ping', (req, res) => {
  res.json({ ok: true, msg: 'bigquery-routes-online', ts: Date.now() });
});

// Inicializa cliente BigQuery (lazy singleton — require feito aqui para não
// crashar o servidor se @google-cloud/bigquery ainda não estiver instalado)
let _bq = null;
function getBQ() {
  if (_bq) return _bq;
  let BigQuery;
  try {
    BigQuery = require('@google-cloud/bigquery').BigQuery;
  } catch (e) {
    throw new Error('Pacote @google-cloud/bigquery não instalado. Execute "npm install" e reinicie o servidor.');
  }
  const credJson = process.env.BIGQUERY_CREDENTIALS;
  if (credJson) {
    try {
      _bq = new BigQuery({ projectId: 'paralax-eleicoes', credentials: JSON.parse(credJson) });
    } catch (e) {
      console.error('[BigQuery] Erro ao parsear BIGQUERY_CREDENTIALS:', e.message);
    }
  } else {
    const keyPath = path.join(__dirname, '..', 'chave.json');
    if (fs.existsSync(keyPath)) {
      _bq = new BigQuery({ projectId: 'paralax-eleicoes', keyFilename: keyPath });
    } else {
      console.warn('[BigQuery] chave.json não encontrado e BIGQUERY_CREDENTIALS não definido.');
    }
  }
  return _bq;
}

// Helper: executa query parametrizada no BigQuery
async function runBQ(sql, params) {
  const bq = getBQ();
  if (!bq) throw new Error('Cliente BigQuery não inicializado. Verifique as credenciais.');
  const [rows] = await bq.query({ query: sql, params, location: 'US' });
  return rows;
}

/**
 * GET /api/eleicoes/candidatos
 * Busca candidatos por nome (parcial), com filtros opcionais de ano, cargo e UF.
 * Query params: nome, ano, cargo, uf, turno (padrão 1)
 */
app.get('/api/eleicoes/candidatos', auth, withTenant, allowAll(), async (req, res) => {
  try {
    const { nome = '', ano, cargo, uf } = req.query;

    const conds = [];
    const params = {};

    if (nome.trim()) {
      // Remove acentos dos dois lados: NORMALIZE(NFD) decompõe o caractere em
      // base + combining marks, e o REGEXP_REPLACE remove os combining marks.
      // Assim "celia" bate com "CÉLIA", "joao" bate com "JOÃO", etc.
      conds.push(`REGEXP_REPLACE(NORMALIZE(UPPER(c.nome_urna), NFD), r'[\\u0300-\\u036f]', '') LIKE @nome`);
      const nomeSemAcento = nome.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
      params.nome = `%${nomeSemAcento}%`;
    }
    if (ano) {
      conds.push('c.ano = @ano');
      params.ano = parseInt(ano);
    }
    if (cargo) {
      conds.push('UPPER(c.cargo) = @cargo');
      params.cargo = cargo.trim().toUpperCase();
    }
    if (uf) {
      conds.push('c.sigla_uf = @uf');
      params.uf = uf.trim().toUpperCase();
    }

    if (conds.length === 0) {
      return res.status(400).json({ ok: false, error: 'Informe ao menos um filtro: nome ou cargo.' });
    }

    const where = 'WHERE ' + conds.join(' AND ');

    const sql = `
      SELECT DISTINCT
        c.ano,
        c.sigla_uf                              AS uf,
        UPPER(c.cargo)                          AS cargo,
        UPPER(c.nome_urna)                      AS nome,
        CAST(c.sequencial AS STRING)            AS sequencial,
        c.numero                                AS numero,
        UPPER(COALESCE(c.sigla_partido, ''))    AS partido,
        UPPER(COALESCE(m.nome, c.sigla_uf))     AS municipio_candidatura
      FROM \`basedosdados.br_tse_eleicoes.candidatos\` c
      LEFT JOIN \`basedosdados.br_bd_diretorios_brasil.municipio\` m
        ON c.id_municipio = m.id_municipio
      ${where}
      ORDER BY ano DESC, nome
      LIMIT 200
    `;

    const rows = await runBQ(sql, params);
    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error('[/api/eleicoes/candidatos]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /api/eleicoes/resultados
 * Retorna votos por município para um candidato específico.
 * Query params: sequencial (obrigatório), ano (obrigatório), uf (obrigatório), turno (padrão 1)
 */
app.get('/api/eleicoes/resultados', auth, withTenant, allowAll(), async (req, res) => {
  try {
    const { sequencial, ano, uf, turno = '1' } = req.query;
    if (!sequencial || !ano || !uf) {
      return res.status(400).json({ ok: false, error: 'Parâmetros obrigatórios: sequencial, ano, uf' });
    }

    // Votos do candidato por município
    const sqlVotos = `
      SELECT
        UPPER(COALESCE(m.nome, CAST(r.id_municipio AS STRING))) AS municipio,
        r.id_municipio,
        SUM(r.votos) AS votos
      FROM \`basedosdados.br_tse_eleicoes.resultados_candidato_municipio\` r
      LEFT JOIN \`basedosdados.br_bd_diretorios_brasil.municipio\` m
        ON r.id_municipio = m.id_municipio
      WHERE r.ano = @ano
        AND r.turno = @turno
        AND r.sigla_uf = @uf
        AND CAST(r.sequencial_candidato AS STRING) = @sequencial
        AND r.votos IS NOT NULL
      GROUP BY municipio, r.id_municipio
      ORDER BY votos DESC
    `;

    // Votos válidos por município (para calcular % do candidato)
    const sqlValidos = `
      SELECT
        UPPER(COALESCE(m.nome, CAST(p.id_municipio AS STRING))) AS municipio,
        p.id_municipio,
        SUM(p.votos_validos) AS votos_validos
      FROM \`basedosdados.br_tse_eleicoes.detalhes_votacao_municipio\` p
      LEFT JOIN \`basedosdados.br_bd_diretorios_brasil.municipio\` m
        ON p.id_municipio = m.id_municipio
      WHERE p.ano = @ano
        AND p.turno = @turno
        AND p.sigla_uf = @uf
      GROUP BY municipio, p.id_municipio
    `;

    const params = {
      ano: parseInt(ano),
      turno: parseInt(turno),
      uf: uf.trim().toUpperCase(),
      sequencial: sequencial.trim()
    };

    const [rowsVotos, rowsValidos] = await Promise.all([
      runBQ(sqlVotos, params),
      runBQ(sqlValidos, params)
    ]);

    // Monta mapa de votos válidos por id_municipio
    const validosMap = {};
    for (const r of rowsValidos) {
      validosMap[String(r.id_municipio)] = Number(r.votos_validos) || 0;
    }

    const data = rowsVotos.map(r => {
      const votos = Number(r.votos) || 0;
      const validos = validosMap[String(r.id_municipio)] || 0;
      return {
        municipio: r.municipio,
        id_municipio: String(r.id_municipio),
        votos,
        votos_validos: validos,
        percentual: validos > 0 ? ((votos / validos) * 100).toFixed(2) : null
      };
    });

    res.json({ ok: true, data });
  } catch (e) {
    console.error('[/api/eleicoes/resultados]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /api/eleicoes/zonas
 * Retorna votos por zona eleitoral para um candidato em um município.
 * Query params: sequencial (obrigatório), ano (obrigatório), uf (obrigatório), id_municipio (obrigatório), turno (padrão 1)
 */
app.get('/api/eleicoes/zonas', auth, withTenant, allowAll(), async (req, res) => {
  try {
    const { sequencial, ano, uf, id_municipio, turno = '1' } = req.query;
    if (!sequencial || !ano || !uf || !id_municipio) {
      return res.status(400).json({ ok: false, error: 'Parâmetros obrigatórios: sequencial, ano, uf, id_municipio' });
    }

    const params = {
      ano: parseInt(ano),
      turno: parseInt(turno),
      uf: uf.trim().toUpperCase(),
      sequencial: sequencial.trim(),
      id_municipio: String(id_municipio).trim()
    };

    // Votos do candidato por zona
    const sqlVotos = `
      SELECT
        r.zona,
        SUM(r.votos) AS votos
      FROM \`basedosdados.br_tse_eleicoes.resultados_candidato_municipio_zona\` r
      WHERE r.ano = @ano
        AND r.turno = @turno
        AND r.sigla_uf = @uf
        AND CAST(r.sequencial_candidato AS STRING) = @sequencial
        AND r.id_municipio = @id_municipio
        AND r.votos IS NOT NULL
      GROUP BY r.zona
      ORDER BY r.zona
    `;

    // Participação por zona (votos nominais totais, aptos, comparecimento)
    const sqlPart = `
      SELECT
        p.zona,
        SUM(p.votos_nominais)   AS votos_nominais,
        SUM(p.aptos)            AS aptos,
        SUM(p.comparecimento)   AS comparecimento
      FROM \`basedosdados.br_tse_eleicoes.detalhes_votacao_municipio_zona\` p
      WHERE p.ano = @ano
        AND p.turno = @turno
        AND p.sigla_uf = @uf
        AND p.id_municipio = @id_municipio
      GROUP BY p.zona
    `;

    const [rowsVotos, rowsPart] = await Promise.all([
      runBQ(sqlVotos, params),
      runBQ(sqlPart, params)
    ]);

    // Mapa zona → participação
    const partMap = {};
    for (const r of rowsPart) {
      partMap[String(r.zona)] = {
        votos_nominais: Number(r.votos_nominais) || 0,
        aptos: Number(r.aptos) || 0,
        comparecimento: Number(r.comparecimento) || 0
      };
    }

    const data = rowsVotos.map(r => {
      const votos = Number(r.votos) || 0;
      const part = partMap[String(r.zona)] || {};
      const nominais = part.votos_nominais || 0;
      return {
        zona: String(r.zona),
        votos,
        votos_nominais: nominais,
        aptos: part.aptos || 0,
        comparecimento: part.comparecimento || 0,
        percentual: nominais > 0 ? ((votos / nominais) * 100).toFixed(2) : null
      };
    });

    res.json({ ok: true, data });
  } catch (e) {
    console.error('[/api/eleicoes/zonas]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ---------- Helpers para tentativa com fallback de tabela ---------- */
// Retorna true se o erro indica tabela inacessível/inexistente (não é erro de query)
function isBQTableError(e) {
  const msg = (e && e.message) ? e.message : '';
  return msg.includes('Not found') || msg.includes('Access Denied') || msg.includes('does not exist');
}

// Tenta a query em múltiplos nomes de tabela, pulando os inacessíveis
async function tryTables(sqlTemplate, placeholder, tableNames, params) {
  for (const tbl of tableNames) {
    try {
      const rows = await runBQ(sqlTemplate.replace(placeholder, tbl), params);
      console.log(`[BQ] tabela ok: ${tbl}`);
      return { rows, table: tbl };
    } catch (e) {
      if (isBQTableError(e)) {
        console.warn(`[BQ] ${tbl} inacessível: ${e.message.split('\n')[0]}`);
      } else {
        throw e;
      }
    }
  }
  return null; // nenhuma funcionou
}

/**
 * GET /api/eleicoes/bairros
 * Retorna votos por bairro para qualquer tipo de eleição (municipal, estadual ou federal).
 *
 * Estratégia 1 (ideal): JOIN BigQuery resultados_secao + perfil_eleitorado_local_votacao
 *   → bairro real para qualquer município do Brasil.
 * Estratégia 2 (fallback): seção + lookup CSV (só funciona para municípios no CSV).
 * Estratégia 3 (último recurso): votos por zona (sempre funciona).
 * Query params: sequencial, ano, uf, id_municipio, turno (padrão 1)
 */
app.get('/api/eleicoes/bairros', auth, withTenant, allowAll(), async (req, res) => {
  try {
    const { sequencial, ano, uf, id_municipio, turno = '1' } = req.query;
    if (!sequencial || !ano || !uf || !id_municipio) {
      return res.status(400).json({ ok: false, error: 'Parâmetros obrigatórios: sequencial, ano, uf, id_municipio' });
    }

    const params = {
      ano:          parseInt(ano),
      turno:        parseInt(turno),
      uf:           uf.trim().toUpperCase(),
      sequencial:   sequencial.trim(),
      id_municipio: String(id_municipio).trim()
    };

    // ── Estratégia 1: JOIN com perfil_eleitorado_local_votacao (br_tse_eleicoes) ─
    // Combina resultados por seção com a tabela de locais de votação que tem o bairro.
    // Tenta variações de nome de tabela de resultados por seção.
    const PERFIL_TABLE = 'basedosdados.br_tse_eleicoes.perfil_eleitorado_local_votacao';
    const resultTablesSecao = [
      'resultados_candidato_secao',
      'resultados_candidato_municipio_secao'
    ];
    const detalheTablesSecao = [
      'detalhes_votacao_secao',
      'detalhes_votacao_municipio_secao'
    ];

    const makeSqlJoin = (resultTbl, detalheTbl) => `
      SELECT
        UPPER(COALESCE(
          NULLIF(TRIM(CAST(loc.bairro AS STRING)), ''),
          CONCAT('Zona ', CAST(r.zona AS STRING))
        )) AS bairro,
        SUM(r.votos)          AS votos,
        SUM(d.votos_nominais) AS votos_nominais
      FROM \`basedosdados.br_tse_eleicoes.${resultTbl}\` r
      LEFT JOIN (
        SELECT
          ano, sigla_uf, id_municipio,
          CAST(zona  AS STRING) AS zona,
          CAST(secao AS STRING) AS secao,
          ANY_VALUE(bairro)     AS bairro
        FROM \`${PERFIL_TABLE}\`
        WHERE ano = @ano AND sigla_uf = @uf AND id_municipio = @id_municipio
        GROUP BY ano, sigla_uf, id_municipio, zona, secao
      ) loc
        ON  loc.ano          = r.ano
        AND loc.sigla_uf     = r.sigla_uf
        AND loc.id_municipio = r.id_municipio
        AND loc.zona         = CAST(r.zona  AS STRING)
        AND loc.secao        = CAST(r.secao AS STRING)
      LEFT JOIN (
        SELECT
          ano, turno, sigla_uf, id_municipio,
          CAST(zona  AS STRING) AS zona,
          CAST(secao AS STRING) AS secao,
          SUM(votos_nominais)   AS votos_nominais
        FROM \`basedosdados.br_tse_eleicoes.${detalheTbl}\`
        WHERE ano = @ano AND turno = @turno AND sigla_uf = @uf AND id_municipio = @id_municipio
        GROUP BY ano, turno, sigla_uf, id_municipio, zona, secao
      ) d
        ON  d.ano          = r.ano
        AND d.turno        = r.turno
        AND d.sigla_uf     = r.sigla_uf
        AND d.id_municipio = r.id_municipio
        AND d.zona         = CAST(r.zona  AS STRING)
        AND d.secao        = CAST(r.secao AS STRING)
      WHERE r.ano    = @ano
        AND r.turno  = @turno
        AND r.sigla_uf = @uf
        AND CAST(r.sequencial_candidato AS STRING) = @sequencial
        AND r.id_municipio = @id_municipio
        AND r.votos IS NOT NULL
      GROUP BY bairro
      ORDER BY votos DESC
    `;

    // Tenta todas as combinações de tabelas de resultado × detalhe
    for (const rTbl of resultTablesSecao) {
      for (const dTbl of detalheTablesSecao) {
        try {
          const rows = await runBQ(makeSqlJoin(rTbl, dTbl), params);
          console.log(`[bairros] JOIN ok: ${rTbl} + perfil_local + ${dTbl}`);
          const data = rows.map(r => ({
            bairro:         String(r.bairro),
            votos:          Number(r.votos) || 0,
            votos_nominais: Number(r.votos_nominais) || 0,
            percentual:     r.votos_nominais > 0
              ? ((Number(r.votos) / Number(r.votos_nominais)) * 100).toFixed(2)
              : null
          }));
          return res.json({ ok: true, data, fonte: 'bigquery', por_bairro: true });
        } catch (e) {
          if (isBQTableError(e)) {
            console.warn(`[bairros] ${rTbl}+${dTbl} inacessível: ${e.message.split('\n')[0]}`);
          } else {
            throw e;
          }
        }
      }
    }

    // ── Estratégia 2: seção sem JOIN → lookup CSV ─────────────────────────────
    console.warn('[bairros] JOIN BigQuery falhou — tentando seção + CSV');
    const sqlSecoes = `
      SELECT r.zona, r.secao, SUM(r.votos) AS votos
      FROM \`basedosdados.br_tse_eleicoes.{{T}}\` r
      WHERE r.ano = @ano AND r.turno = @turno AND r.sigla_uf = @uf
        AND CAST(r.sequencial_candidato AS STRING) = @sequencial
        AND r.id_municipio = @id_municipio AND r.votos IS NOT NULL
      GROUP BY r.zona, r.secao
    `;
    const sqlTotal = `
      SELECT p.zona, p.secao, SUM(p.votos_nominais) AS votos_nominais
      FROM \`basedosdados.br_tse_eleicoes.{{T}}\` p
      WHERE p.ano = @ano AND p.turno = @turno AND p.sigla_uf = @uf
        AND p.id_municipio = @id_municipio
      GROUP BY p.zona, p.secao
    `;

    const [resSecoes, resTotal] = await Promise.all([
      tryTables(sqlSecoes, '{{T}}', resultTablesSecao, params),
      tryTables(sqlTotal,  '{{T}}', detalheTablesSecao, params)
    ]);

    if (resSecoes) {
      const totalMap = {};
      if (resTotal) {
        for (const r of resTotal.rows) {
          totalMap[`${r.zona}_${r.secao}`] = Number(r.votos_nominais) || 0;
        }
      }
      const munLookup = bairrosLookup[String(id_municipio).trim()] || {};
      const temBairro = Object.keys(munLookup).length > 0;
      const agg = {};
      for (const r of resSecoes.rows) {
        const chave  = `${r.zona}_${r.secao}`;
        const bairro = temBairro ? (munLookup[chave] || `Zona ${r.zona}`) : `Zona ${r.zona}`;
        if (!agg[bairro]) agg[bairro] = { votos: 0, votos_nominais: 0 };
        agg[bairro].votos          += Number(r.votos) || 0;
        agg[bairro].votos_nominais += totalMap[chave] || 0;
      }
      const data = Object.entries(agg)
        .map(([bairro, d]) => ({
          bairro,
          votos:          d.votos,
          votos_nominais: d.votos_nominais,
          percentual:     d.votos_nominais > 0
            ? ((d.votos / d.votos_nominais) * 100).toFixed(2)
            : null
        }))
        .sort((a, b) => b.votos - a.votos);
      return res.json({ ok: true, data, fonte: 'secao_csv', por_bairro: temBairro });
    }

    // ── Estratégia 2: fallback para zona (tabelas garantidas) ────────────────
    console.warn('[bairros] Tabelas de seção indisponíveis — usando zonas como fallback');

    const sqlZonaVotos = `
      SELECT r.zona, SUM(r.votos) AS votos
      FROM \`basedosdados.br_tse_eleicoes.resultados_candidato_municipio_zona\` r
      WHERE r.ano = @ano AND r.turno = @turno AND r.sigla_uf = @uf
        AND CAST(r.sequencial_candidato AS STRING) = @sequencial
        AND r.id_municipio = @id_municipio AND r.votos IS NOT NULL
      GROUP BY r.zona ORDER BY r.zona
    `;
    const sqlZonaPart = `
      SELECT p.zona, SUM(p.votos_nominais) AS votos_nominais, SUM(p.comparecimento) AS comparecimento
      FROM \`basedosdados.br_tse_eleicoes.detalhes_votacao_municipio_zona\` p
      WHERE p.ano = @ano AND p.turno = @turno AND p.sigla_uf = @uf
        AND p.id_municipio = @id_municipio
      GROUP BY p.zona
    `;
    const [rowsZona, rowsPart] = await Promise.all([
      runBQ(sqlZonaVotos, params),
      runBQ(sqlZonaPart, params).catch(() => [])
    ]);

    const partMap = {};
    for (const r of rowsPart) {
      partMap[String(r.zona)] = {
        votos_nominais: Number(r.votos_nominais) || 0,
        comparecimento: Number(r.comparecimento) || 0
      };
    }

    const dataZona = rowsZona.map(r => {
      const votos    = Number(r.votos) || 0;
      const part     = partMap[String(r.zona)] || {};
      const nominais = part.votos_nominais || 0;
      return {
        bairro:         `Zona ${r.zona}`,
        votos,
        votos_nominais: nominais,
        comparecimento: part.comparecimento || 0,
        percentual:     nominais > 0 ? ((votos / nominais) * 100).toFixed(2) : null
      };
    }).sort((a, b) => b.votos - a.votos);

    res.json({ ok: true, data: dataZona, fonte: 'zona', por_bairro: false });

  } catch (e) {
    console.error('[/api/eleicoes/bairros]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/eleicoes/locais ─────────────────────────────────────────────────
// Retorna locais de votação com votos do candidato, filtrado por bairro.
// perfil_eleitorado_local_votacao tem: nome (local de votação), endereco, numero, bairro
// JOIN: resultados_candidato_secao (zona,secao) → perfil (nome,endereco,bairro)
app.get('/api/eleicoes/locais', auth, withTenant, allowAll(), async (req, res) => {
  try {
    const { ano, uf, id_municipio, bairro, sequencial, turno = '1' } = req.query;
    if (!ano || !uf || !id_municipio || !sequencial) {
      return res.status(400).json({ ok: false, error: 'Parâmetros obrigatórios: ano, uf, id_municipio, sequencial' });
    }

    const p = {
      ano:           parseInt(ano),
      uf:            uf.trim().toUpperCase(),
      id_municipio:  String(id_municipio).trim(),
      sequencial:    String(sequencial).trim(),
      turno:         parseInt(turno),
      bairro_filtro: (bairro || '').trim().toUpperCase(),
    };

    const bairroWhere = bairro
      ? `AND UPPER(TRIM(CAST(loc.bairro AS STRING))) = @bairro_filtro`
      : '';

    const resultTables  = ['resultados_candidato_secao', 'resultados_candidato_municipio_secao'];
    const detalheTables = ['detalhes_votacao_secao', 'detalhes_votacao_municipio_secao'];

    // perfil_eleitorado_local_votacao tem colunas: nome, endereco, numero, bairro, zona, secao
    // (documentado em basedosdados.org/br_tse_eleicoes)
    const makeSql = (rTbl, dTbl) => `
      SELECT
        UPPER(TRIM(CAST(loc.nome AS STRING)))     AS nome_local,
        ANY_VALUE(UPPER(TRIM(CAST(loc.endereco AS STRING)))) AS endereco,
        SUM(r.votos)          AS votos,
        SUM(d.votos_nominais) AS votos_nominais,
        COUNT(DISTINCT CONCAT(CAST(r.zona AS STRING), '_', CAST(r.secao AS STRING))) AS num_secoes
      FROM \`basedosdados.br_tse_eleicoes.${rTbl}\` r
      LEFT JOIN (
        SELECT
          CAST(zona  AS STRING) AS zona,
          CAST(secao AS STRING) AS secao,
          ANY_VALUE(CAST(nome     AS STRING)) AS nome,
          ANY_VALUE(CAST(bairro   AS STRING)) AS bairro,
          ANY_VALUE(CAST(endereco AS STRING)) AS endereco
        FROM \`basedosdados.br_tse_eleicoes.perfil_eleitorado_local_votacao\`
        WHERE ano = @ano AND sigla_uf = @uf AND id_municipio = @id_municipio
        GROUP BY zona, secao
      ) loc ON CAST(r.zona AS STRING) = loc.zona AND CAST(r.secao AS STRING) = loc.secao
      LEFT JOIN (
        SELECT
          CAST(zona  AS STRING) AS zona,
          CAST(secao AS STRING) AS secao,
          SUM(votos_nominais)   AS votos_nominais
        FROM \`basedosdados.br_tse_eleicoes.${dTbl}\`
        WHERE ano = @ano AND turno = @turno AND sigla_uf = @uf AND id_municipio = @id_municipio
        GROUP BY zona, secao
      ) d ON CAST(r.zona AS STRING) = d.zona AND CAST(r.secao AS STRING) = d.secao
      WHERE r.ano    = @ano
        AND r.turno  = @turno
        AND r.sigla_uf = @uf
        AND CAST(r.sequencial_candidato AS STRING) = @sequencial
        AND r.id_municipio = @id_municipio
        AND r.votos IS NOT NULL
        ${bairroWhere}
      GROUP BY loc.nome
      ORDER BY votos DESC
      LIMIT 300
    `;

    for (const rTbl of resultTables) {
      for (const dTbl of detalheTables) {
        try {
          const rows = await runBQ(makeSql(rTbl, dTbl), p);
          console.log(`[locais] ok: ${rTbl}+${dTbl}: ${rows.length} locais`);
          const data = rows.map(r => ({
            nome_local:     String(r.nome_local     || '—'),
            endereco:       r.endereco ? String(r.endereco) : null,
            votos:          Number(r.votos)          || 0,
            votos_nominais: Number(r.votos_nominais) || 0,
            num_secoes:     Number(r.num_secoes)     || 0,
            percentual:     r.votos_nominais > 0
              ? ((Number(r.votos) / Number(r.votos_nominais)) * 100).toFixed(1)
              : null,
          }));
          return res.json({ ok: true, data });
        } catch (e) {
          console.warn(`[locais] ${rTbl}+${dTbl} falhou: ${e.message.split('\n')[0]}`);
        }
      }
    }

    return res.status(500).json({ ok: false, error: 'Não foi possível carregar os locais de votação.' });
  } catch (e) {
    console.error('[/api/eleicoes/locais]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/eleicoes/schema-debug ───────────────────────────────────────────
// Lista tabelas do dataset e colunas de tabelas relevantes.
app.get('/api/eleicoes/schema-debug', auth, withTenant, allow('dono', 'admin'), async (req, res) => {
  try {
    const result = {};

    // 1. Lista TODAS as tabelas do dataset br_tse_eleicoes
    try {
      const allTables = await runBQ(`
        SELECT table_name
        FROM \`basedosdados.br_tse_eleicoes.INFORMATION_SCHEMA.TABLES\`
        ORDER BY table_name
      `, {});
      result['__tabelas_disponiveis'] = allTables.map(r => r.table_name);
    } catch (e) {
      result['__tabelas_disponiveis'] = `ERRO: ${e.message.split('\n')[0]}`;
    }

    // 2. Colunas de tabelas de interesse
    const tables = [
      'resultados_candidato_secao',
      'perfil_eleitorado_local_votacao',
      'locais_votacao',
      'resultados_candidato_municipio',
      'detalhes_votacao_municipio_zona',
      'perfil_eleitorado_municipio',
      'candidatos',
    ];
    for (const tbl of tables) {
      try {
        const rows = await runBQ(`
          SELECT column_name, data_type
          FROM \`basedosdados.br_tse_eleicoes.INFORMATION_SCHEMA.COLUMNS\`
          WHERE table_name = '${tbl}'
          ORDER BY ordinal_position
        `, {});
        result[tbl] = rows.map(r => `${r.column_name} (${r.data_type})`);
      } catch (e) {
        result[tbl] = `ERRO: ${e.message.split('\n')[0]}`;
      }
    }

    // 3. Linha de amostra de perfil_eleitorado_local_votacao (com ano real)
    const { ano = '2022', uf = 'RJ', id_municipio = '60011' } = req.query;
    try {
      const sample = await runBQ(`
        SELECT * FROM \`basedosdados.br_tse_eleicoes.perfil_eleitorado_local_votacao\`
        WHERE ano = @ano AND sigla_uf = @uf AND id_municipio = @id_municipio
        LIMIT 1
      `, { ano: parseInt(ano), uf: uf.toUpperCase(), id_municipio: String(id_municipio) });
      result['__sample_perfil_local'] = sample.length ? Object.keys(sample[0]) : 'sem dados';
    } catch (e) {
      result['__sample_perfil_local'] = `ERRO: ${e.message.split('\n')[0]}`;
    }

    // 4. Linha de amostra de locais_votacao
    try {
      const sample2 = await runBQ(`
        SELECT * FROM \`basedosdados.br_tse_eleicoes.locais_votacao\`
        WHERE ano = @ano AND sigla_uf = @uf AND id_municipio = @id_municipio
        LIMIT 1
      `, { ano: parseInt(ano), uf: uf.toUpperCase(), id_municipio: String(id_municipio) });
      result['__sample_locais_votacao'] = sample2.length ? sample2[0] : 'sem dados';
    } catch (e) {
      result['__sample_locais_votacao'] = `ERRO: ${e.message.split('\n')[0]}`;
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── helpers para dados locais ─────────────────────────────────────────────────
function normalizeStr(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}

const DADOS_DIR = path.join(__dirname, '..', 'analise', 'dados');
const ANOS_LOCAIS = [2010, 2014, 2018, 2022];

function lerResumoLocal(ano) {
  try {
    const p = path.join(DADOS_DIR, String(ano), 'resumo.json');
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) { return null; }
}

function lerEleitoradoLocal(ano) {
  try {
    const p = path.join(DADOS_DIR, String(ano), 'eleitorado.json');
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) { return null; }
}

function encontrarCidadeLocal(obj, cidade) {
  if (!obj || !cidade) return null;
  const norm = normalizeStr(cidade);
  // exact match
  for (const k of Object.keys(obj)) {
    if (normalizeStr(k) === norm) return { key: k, data: obj[k] };
  }
  // partial match
  for (const k of Object.keys(obj)) {
    if (normalizeStr(k).includes(norm) || norm.includes(normalizeStr(k))) return { key: k, data: obj[k] };
  }
  return null;
}

// ── GET /api/eleicoes/historico ──────────────────────────────────────────────
// Retorna evolução de votos do candidato por ano eleitoral no mesmo município.
// JOIN com tabela candidatos para filtrar por nome_urna (resultados não tem essa coluna).
app.get('/api/eleicoes/historico', auth, withTenant, allowAll(), async (req, res) => {
  try {
    const { nome_urna, numero, cargo, uf, id_municipio, cidade } = req.query;
    if (!nome_urna || !uf || !id_municipio) {
      return res.status(400).json({ ok: false, error: 'Parâmetros obrigatórios: nome_urna, uf, id_municipio' });
    }

    // ── Fonte local: tenta primeiro se cidade fornecida ou BQ indisponível ──
    if (cidade) {
      try {
        const nomeNorm  = normalizeStr(nome_urna);
        const nomeWords = nomeNorm.split(/\s+/).filter(Boolean);
        const cargoNorm = cargo ? normalizeStr(cargo) : null;
        const cidadeNorm = normalizeStr(cidade);

        const resultado = [];
        for (const ano of ANOS_LOCAIS) {
          const resumo = lerResumoLocal(ano);
          if (!resumo) continue;
          for (const [cargoKey, cargoData] of Object.entries(resumo)) {
            if (cargoNorm && normalizeStr(cargoKey) !== cargoNorm) continue;
            const cidades = cargoData.CIDADES || {};
            const match = encontrarCidadeLocal(cidades, cidadeNorm);
            if (!match) continue;
            const candidatos = match.data.candidatos || [];
            for (const cand of candidatos) {
              const nCand = normalizeStr(cand.nome || '');
              if (nomeWords.every(w => nCand.includes(w))) {
                resultado.push({ ano, votos: Number(cand.votos) || 0 });
                break;
              }
            }
          }
        }
        if (resultado.length > 0) {
          resultado.sort((a, b) => a.ano - b.ano);
          return res.json({ ok: true, data: resultado, fonte: 'local' });
        }
      } catch (le) {
        console.warn('[/api/eleicoes/historico] local lookup falhou:', le.message);
      }
    }

    const params = {
      nome_urna:    nome_urna.trim().toUpperCase(),
      uf:           uf.trim().toUpperCase(),
      id_municipio: String(id_municipio).trim(),
    };

    // Filtros opcionais adicionados ao JOIN
    const cargoCond  = cargo  ? 'AND UPPER(c.cargo) = @cargo'                      : '';
    const numeroCond = numero ? 'AND CAST(c.numero AS STRING) = @numero'            : '';
    if (cargo)  params.cargo  = cargo.trim().toUpperCase();
    if (numero) params.numero = String(numero).trim();

    // resultados_candidato_municipio NÃO tem nome_urna → JOIN com candidatos
    const sql = `
      SELECT r.ano, SUM(r.votos) AS votos
      FROM \`basedosdados.br_tse_eleicoes.resultados_candidato_municipio\` r
      JOIN \`basedosdados.br_tse_eleicoes.candidatos\` c
        ON  r.ano                              = c.ano
        AND r.sigla_uf                         = c.sigla_uf
        AND r.id_municipio                     = c.id_municipio
        AND CAST(r.numero_candidato AS STRING) = CAST(c.numero AS STRING)
      WHERE UPPER(c.nome_urna) = @nome_urna
        AND r.sigla_uf         = @uf
        AND r.id_municipio     = @id_municipio
        ${cargoCond}
        ${numeroCond}
      GROUP BY r.ano
      ORDER BY r.ano ASC
    `;
    try {
      const rows = await runBQ(sql, params);
      const data = rows.map(r => ({ ano: Number(r.ano), votos: Number(r.votos) || 0 }));
      return res.json({ ok: true, data });
    } catch (bqErr) {
      console.warn('[/api/eleicoes/historico] BigQuery falhou, tentando local:', bqErr.message.split('\n')[0]);
      // Fallback local sem cidade específica: usar id_municipio não é possível nos JSONs locais
      return res.json({ ok: true, data: [], fonte: 'local_fallback', aviso: 'BigQuery indisponível e cidade não informada' });
    }
  } catch (e) {
    console.error('[/api/eleicoes/historico]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/eleicoes/abstencao ──────────────────────────────────────────────
// Retorna abstenção por zona para um município/ano/turno.
// Coluna correta na tabela TSE: "aptos" (não eleitores_aptos). Abstencoes = aptos - comparecimento.
app.get('/api/eleicoes/abstencao', auth, withTenant, allowAll(), async (req, res) => {
  try {
    const { ano, turno = '1', uf, id_municipio, cidade } = req.query;
    if (!ano || !uf || !id_municipio) {
      return res.status(400).json({ ok: false, error: 'Parâmetros obrigatórios: ano, uf, id_municipio' });
    }

    // ── Fonte local ──────────────────────────────────────────────────────────
    if (cidade) {
      try {
        const cidadeNorm = normalizeStr(cidade);
        const eleitorado = lerEleitoradoLocal(parseInt(ano));
        const resumo     = lerResumoLocal(parseInt(ano));
        if (eleitorado && resumo) {
          const elMatch = encontrarCidadeLocal(eleitorado, cidadeNorm);
          if (elMatch) {
            const genero = elMatch.data.genero || {};
            const aptos  = Object.values(genero).reduce((s, v) => s + (Number(v) || 0), 0);

            // busca total_validos + brancos (95) + nulos (96) de qualquer cargo disponível
            let comparecimento = 0;
            for (const cargoData of Object.values(resumo)) {
              const cidades = cargoData.CIDADES || {};
              const resMatch = encontrarCidadeLocal(cidades, cidadeNorm);
              if (!resMatch) continue;
              const total_validos = Number(resMatch.data.total_validos) || 0;
              let brancos = 0, nulos = 0;
              for (const cand of (resMatch.data.candidatos || [])) {
                if (cand.numero === 95) brancos = Number(cand.votos) || 0;
                if (cand.numero === 96) nulos   = Number(cand.votos) || 0;
              }
              const comp = total_validos + brancos + nulos;
              if (comp > comparecimento) comparecimento = comp;
              break; // usa o primeiro cargo encontrado
            }

            const abstencoes  = aptos - comparecimento;
            const pct_abstencao = aptos > 0 ? ((abstencoes / aptos) * 100).toFixed(1) : null;
            const data = [{ zona: 'Município', aptos, comparecimento, abstencoes, pct_abstencao }];
            return res.json({ ok: true, data, fonte: 'local' });
          }
        }
      } catch (le) {
        console.warn('[/api/eleicoes/abstencao] local lookup falhou:', le.message);
      }
    }

    const params = {
      ano:          parseInt(ano),
      turno:        parseInt(turno),
      uf:           uf.trim().toUpperCase(),
      id_municipio: String(id_municipio).trim(),
    };
    const sql = `
      SELECT
        d.zona,
        SUM(d.aptos)          AS aptos,
        SUM(d.comparecimento) AS comparecimento,
        SUM(d.votos_nominais) AS votos_nominais
      FROM \`basedosdados.br_tse_eleicoes.detalhes_votacao_municipio_zona\` d
      WHERE d.ano = @ano AND d.turno = @turno
        AND d.sigla_uf = @uf AND d.id_municipio = @id_municipio
      GROUP BY d.zona
      ORDER BY d.zona ASC
    `;
    try {
      const rows = await runBQ(sql, params);
      const data = rows.map(r => {
        const aptos = Number(r.aptos)          || 0;
        const comp  = Number(r.comparecimento) || 0;
        const abst  = aptos - comp;
        return {
          zona:           Number(r.zona),
          aptos,
          comparecimento: comp,
          abstencoes:     abst,
          pct_abstencao:  aptos > 0 ? ((abst / aptos) * 100).toFixed(1) : null,
        };
      });
      return res.json({ ok: true, data });
    } catch (bqErr) {
      console.warn('[/api/eleicoes/abstencao] BigQuery falhou:', bqErr.message.split('\n')[0]);
      return res.json({ ok: true, data: [], fonte: 'local_fallback', aviso: 'BigQuery indisponível e cidade não informada' });
    }
  } catch (e) {
    console.error('[/api/eleicoes/abstencao]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/eleicoes/perfil-eleitorado ──────────────────────────────────────
// Retorna perfil demográfico do eleitorado (faixa etária + gênero) por município.
// Agrega perfil_eleitorado_local_votacao (confirmado existente) ao nível municipal.
app.get('/api/eleicoes/perfil-eleitorado', auth, withTenant, allowAll(), async (req, res) => {
  try {
    const { ano, uf, id_municipio, cidade } = req.query;
    if (!ano || !uf || !id_municipio) {
      return res.status(400).json({ ok: false, error: 'Parâmetros obrigatórios: ano, uf, id_municipio' });
    }

    // ── Fonte local ──────────────────────────────────────────────────────────
    if (cidade) {
      try {
        const cidadeNorm = normalizeStr(cidade);
        const eleitorado = lerEleitoradoLocal(parseInt(ano));
        if (eleitorado) {
          const match = encontrarCidadeLocal(eleitorado, cidadeNorm);
          if (match) {
            const d = match.data;
            // Trim keys in all sub-objects
            function trimKeys(obj) {
              const out = {};
              for (const [k, v] of Object.entries(obj || {})) out[k.trim()] = v;
              return out;
            }
            const genero      = trimKeys(d.genero      || {});
            const faixa_etaria = trimKeys(d.faixa_etaria || {});
            const escolaridade = trimKeys(d.escolaridade || {});
            const estado_civil  = trimKeys(d.estado_civil  || {});
            console.log(`[perfil-eleitorado] ok via local JSON para ${match.key}`);
            return res.json({ ok: true, genero, faixa_etaria, escolaridade, estado_civil, fonte: 'local' });
          }
        }
      } catch (le) {
        console.warn('[/api/eleicoes/perfil-eleitorado] local lookup falhou:', le.message);
      }
    }

    const params = {
      ano:          parseInt(ano),
      uf:           uf.trim().toUpperCase(),
      id_municipio: String(id_municipio).trim(),
    };

    // Tenta perfil_eleitorado_municipio primeiro (mais leve); fallback para local_votacao agregado
    const queries = [
      {
        tbl: 'perfil_eleitorado_municipio',
        sql: `
          SELECT
            p.faixa_etaria,
            p.genero,
            SUM(p.qtde_eleitores_perfil) AS eleitores
          FROM \`basedosdados.br_tse_eleicoes.perfil_eleitorado_municipio\` p
          WHERE p.ano = @ano AND p.sigla_uf = @uf AND p.id_municipio = @id_municipio
          GROUP BY p.faixa_etaria, p.genero
          ORDER BY p.faixa_etaria, p.genero
        `,
      },
      {
        tbl: 'perfil_eleitorado_local_votacao',
        sql: `
          SELECT
            p.faixa_etaria,
            p.genero,
            SUM(p.qtde_eleitores_perfil) AS eleitores
          FROM \`basedosdados.br_tse_eleicoes.perfil_eleitorado_local_votacao\` p
          WHERE p.ano = @ano AND p.sigla_uf = @uf AND p.id_municipio = @id_municipio
          GROUP BY p.faixa_etaria, p.genero
          ORDER BY p.faixa_etaria, p.genero
        `,
      },
    ];

    for (const { tbl, sql } of queries) {
      try {
        const rows = await runBQ(sql, params);
        if (rows.length === 0) continue;
        const data = rows.map(r => ({
          faixa_etaria: String(r.faixa_etaria ?? 'Não informado'),
          genero:       String(r.genero       ?? 'Não informado'),
          eleitores:    Number(r.eleitores)   || 0,
        }));
        console.log(`[perfil-eleitorado] ok via ${tbl} (${data.length} grupos)`);
        return res.json({ ok: true, data });
      } catch (e) {
        console.warn(`[perfil-eleitorado] ${tbl} falhou:`, e.message.split('\n')[0]);
        // continua para o próximo
      }
    }

    res.json({ ok: true, data: [] });
  } catch (e) {
    console.error('[/api/eleicoes/perfil-eleitorado]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /api/eleicoes/cidades
 * Lista municípios com votos_validos para um UF/ano (sem candidato específico).
 * Query params: uf (obrigatório), ano (obrigatório), turno (padrão 1)
 */
app.get('/api/eleicoes/cidades', auth, withTenant, allowAll(), async (req, res) => {
  try {
    const { uf, ano, turno = '1', cargo } = req.query;
    if (!uf || !ano) return res.status(400).json({ ok: false, error: 'Parâmetros obrigatórios: uf, ano' });

    const params = {
      ano:   parseInt(ano),
      turno: parseInt(turno),
      uf:    uf.trim().toUpperCase(),
      ...(cargo ? { cargo: cargo.trim().toUpperCase() } : {})
    };

    // Usa perfil_eleitorado_municipio = cadastro eleitoral oficial do TSE.
    // Sempre busca o ano mais recente disponível na tabela (independente do ano de eleição selecionado)
    // para garantir que os dados sejam os mais atuais fornecidos pelo TSE.
    const sqlComparecimento = `
      SELECT
        UPPER(COALESCE(m.nome, CAST(p.id_municipio AS STRING))) AS municipio,
        CAST(p.id_municipio AS STRING) AS id_municipio,
        SUM(p.qtde_eleitores_perfil) AS votos_validos,
        MAX(p.ano) AS ano_referencia
      FROM \`basedosdados.br_tse_eleicoes.perfil_eleitorado_municipio\` p
      LEFT JOIN \`basedosdados.br_bd_diretorios_brasil.municipio\` m
        ON p.id_municipio = m.id_municipio
      WHERE p.sigla_uf = @uf
        AND p.ano = (
          SELECT MAX(ano)
          FROM \`basedosdados.br_tse_eleicoes.perfil_eleitorado_municipio\`
          WHERE sigla_uf = @uf
        )
      GROUP BY municipio, p.id_municipio
      ORDER BY votos_validos DESC
    `;
    const sqlFallback = `
      SELECT
        UPPER(COALESCE(m.nome, CAST(d.id_municipio AS STRING))) AS municipio,
        CAST(d.id_municipio AS STRING) AS id_municipio,
        MAX(d.aptos) AS votos_validos,
        @ano AS ano_referencia
      FROM \`basedosdados.br_tse_eleicoes.detalhes_votacao_municipio\` d
      LEFT JOIN \`basedosdados.br_bd_diretorios_brasil.municipio\` m
        ON d.id_municipio = m.id_municipio
      WHERE d.ano = @ano AND d.turno = @turno AND d.sigla_uf = @uf
      GROUP BY municipio, d.id_municipio
      ORDER BY votos_validos DESC
    `;

    let rows = [];
    try {
      rows = await runBQ(sqlComparecimento, params);
    } catch (_) {
      rows = await runBQ(sqlFallback, params);
    }

    const anoRef = rows.length > 0 ? Number(rows[0].ano_referencia) : parseInt(ano);
    res.json({
      ok: true,
      ano_referencia: anoRef,
      data: rows.map(r => ({
        municipio:     r.municipio,
        id_municipio:  String(r.id_municipio),
        votos_validos: Number(r.votos_validos) || 0
      }))
    });
  } catch (e) {
    console.error('[/api/eleicoes/cidades]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /api/eleicoes/ranking-cidade
 * Ranking TSE-style: eleitos / suplentes / não-eleitos + tabela de partidos.
 * Query params: uf, ano, id_municipio (obrigatórios), cargo (opcional), turno (padrão 1)
 */
app.get('/api/eleicoes/ranking-cidade', auth, withTenant, allowAll(), async (req, res) => {
  try {
    const { uf, ano, id_municipio, cargo, turno = '1' } = req.query;
    if (!uf || !ano || !id_municipio) {
      return res.status(400).json({ ok: false, error: 'Parâmetros obrigatórios: uf, ano, id_municipio' });
    }

    const params = {
      ano:          parseInt(ano),
      turno:        parseInt(turno),
      uf:           uf.trim().toUpperCase(),
      id_municipio: String(id_municipio).trim(),
      ...(cargo ? { cargo: cargo.trim().toUpperCase() } : {})
    };

    // ── Tipo de eleição determina o JOIN ─────────────────────────────────────
    // Eleições municipais (Prefeito/Vereador): número é único por município
    //   → JOIN precisa de id_municipio para não cruzar candidatos de outras cidades
    // Eleições gerais (Dep. Fed/Est, Gov, Sen): número é único no estado
    //   → JOIN SEM id_municipio (candidato não tem id_municipio da cidade onde recebeu votos)
    const cargoNorm  = (cargo || '').trim().toUpperCase();
    const isMunicipal = !cargo || cargoNorm === 'VEREADOR' || cargoNorm === 'PREFEITO' || cargoNorm === 'VICE-PREFEITO';
    const joinMunicipio = isMunicipal ? 'AND r.id_municipio = c.id_municipio' : '';

    // ── Candidatos ────────────────────────────────────────────────────────────
    const sqlRanking = `
      SELECT
        UPPER(COALESCE(c.nome_urna, 'DESCONHECIDO'))     AS nome_urna,
        UPPER(COALESCE(c.sigla_partido, ''))              AS partido,
        COALESCE(CAST(c.numero AS STRING), '')            AS numero,
        UPPER(c.cargo)                                    AS cargo,
        SUM(r.votos)                                      AS votos
      FROM \`basedosdados.br_tse_eleicoes.resultados_candidato_municipio\` r
      JOIN \`basedosdados.br_tse_eleicoes.candidatos\` c
        ON  r.ano      = c.ano
        AND r.sigla_uf = c.sigla_uf
        ${joinMunicipio}
        AND CAST(r.numero_candidato AS STRING) = CAST(c.numero AS STRING)
      WHERE r.ano      = @ano
        AND r.turno    = @turno
        AND r.sigla_uf = @uf
        AND CAST(r.id_municipio AS STRING) = @id_municipio
        ${cargo ? 'AND UPPER(c.cargo) = @cargo' : ''}
      GROUP BY nome_urna, partido, numero, cargo
      ORDER BY votos DESC
      LIMIT 500
    `;

    const rowsRanking = await runBQ(sqlRanking, params);

    // votos_validos = soma dos votos de todos os candidatos neste cargo/município
    // (evita inflação que ocorre na detalhes_votacao_municipio que soma todos os cargos)
    const votosValidos = rowsRanking.reduce((s, r) => s + (Number(r.votos) || 0), 0);

    // ── Monta ranking + agrega por partido ───────────────────────────────────
    const candidatos = [];
    const partidosMap = {};

    rowsRanking.forEach(r => {
      const votos = Number(r.votos) || 0;
      candidatos.push({
        nome_urna: r.nome_urna,
        partido:   r.partido,
        numero:    r.numero,
        cargo:     r.cargo,
        votos
      });

      // Agrega votos por partido
      const pd = r.partido || 'OUTROS';
      if (!partidosMap[pd]) partidosMap[pd] = { partido: pd, votos_nominais: 0 };
      partidosMap[pd].votos_nominais += votos;
    });

    const partidos = Object.values(partidosMap).sort((a, b) => b.votos_nominais - a.votos_nominais);

    res.json({
      ok: true,
      votos_validos: votosValidos,
      partidos,
      candidatos
    });
  } catch (e) {
    console.error('[/api/eleicoes/ranking-cidade]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ================= KEEP ALIVE (RENDER) ================= */
/* ╔══════════════════════════════════════════════════════════════════════╗
   ║                    AGENDA INTELIGENTE                                ║
   ╚══════════════════════════════════════════════════════════════════════╝ */

// ── helpers internos ──────────────────────────────────────────────────────

/**
 * Retorna filtro de região dependendo do nível do usuário.
 * dono/admin → sem filtro de região
 * demais     → restringe à regiao_vinculada do token
 */
function regiaoFilter(req) {
  if (isPrivileged(req.user.nivel)) return { sql: '', params: [] };

  // lider_capital vê TODOS os dados do mapa RJ Capital (todas as zonas)
  if (req.user.nivel === 'lider_capital') {
    const rjMapa = config.mapas.find(m => m.id === 'rjcapital');
    const zonas  = rjMapa?.subregioes ?? [];
    if (!zonas.length) return { sql: ' AND 1=0', params: [] };
    // Usa array PostgreSQL: regiao = ANY($N::text[])
    return { sql: ' AND regiao = ANY($__REG__::text[])', params: [zonas] };
  }

  const reg = req.user.regiao ?? null;
  if (!reg) return { sql: ' AND 1=0', params: [] }; // sem região = sem acesso
  return { sql: ' AND regiao = $__REG__', params: [reg] };
}

/**
 * Engine de sugestões: analisa dados do tenant e (re)gera sugestões
 * automáticas na tabela agenda_sugestoes.
 * Chamada ao criar/concluir eventos e via GET /api/agenda/sugestoes.
 */
async function gerarSugestoes(tenantId) {
  const client = await pool.connect();
  try {
    // ── 1. Regiões com baixa atividade (poucos eventos nos últimos 30 dias) ──
    const regioesBaixas = await client.query(`
      SELECT DISTINCT l.regiao,
        COUNT(DISTINCT l.id) AS total_lideres,
        COALESCE(SUM(l.expectativa_votos),0) AS votos_potenciais,
        COUNT(DISTINCT e.id) AS eventos_recentes
      FROM liderancas l
      LEFT JOIN agenda_eventos e
        ON e.tenant_id = l.tenant_id
        AND e.regiao   = l.regiao
        AND e.data_inicio >= NOW() - INTERVAL '30 days'
        AND e.status  <> 'cancelado'
      WHERE l.tenant_id = $1
        AND l.regiao IS NOT NULL
      GROUP BY l.regiao
      HAVING COUNT(DISTINCT e.id) < 2
      ORDER BY votos_potenciais DESC
      LIMIT 5
    `, [tenantId]);

    // ── 2. Líderes inativos (sem evento vinculado nos últimos 45 dias) ──
    const lideresInativos = await client.query(`
      SELECT p.id AS pessoa_id, p.nome, l.regiao, l.cidade,
        l.expectativa_votos,
        MAX(e.data_inicio) AS ultimo_contato
      FROM pessoas p
      JOIN liderancas l ON l.pessoa_id = p.id AND l.tenant_id = p.tenant_id
      LEFT JOIN agenda_eventos e
        ON e.pessoa_id = p.id
        AND e.tenant_id = p.tenant_id
        AND e.status <> 'cancelado'
      WHERE p.tenant_id = $1
        AND l.status = 'ativa'
      GROUP BY p.id, p.nome, l.regiao, l.cidade, l.expectativa_votos
      HAVING MAX(e.data_inicio) < NOW() - INTERVAL '45 days'
          OR MAX(e.data_inicio) IS NULL
      ORDER BY l.expectativa_votos DESC NULLS LAST
      LIMIT 8
    `, [tenantId]);

    // ── 3. Cidades prioritárias (muitos votos potenciais, poucos eventos) ──
    const cidadesPrioritarias = await client.query(`
      SELECT l.cidade, l.regiao,
        COALESCE(SUM(l.expectativa_votos),0) AS votos_potenciais,
        COUNT(DISTINCT l.id) AS total_lideres,
        COUNT(DISTINCT e.id) AS eventos_recentes
      FROM liderancas l
      LEFT JOIN agenda_eventos e
        ON e.tenant_id = l.tenant_id
        AND e.cidade   = l.cidade
        AND e.data_inicio >= NOW() - INTERVAL '60 days'
        AND e.status <> 'cancelado'
      WHERE l.tenant_id = $1
        AND l.cidade IS NOT NULL
      GROUP BY l.cidade, l.regiao
      HAVING COUNT(DISTINCT e.id) < 1
      ORDER BY votos_potenciais DESC
      LIMIT 5
    `, [tenantId]);

    await client.query('BEGIN');

    // Expira sugestões pendentes antigas (> 7 dias) antes de regenerar
    await client.query(`
      UPDATE agenda_sugestoes
      SET aceita = FALSE, aceita_em = NOW()
      WHERE tenant_id = $1
        AND aceita IS NULL
        AND gerada_em < NOW() - INTERVAL '7 days'
    `, [tenantId]);

    const inserirSugestao = async (tipo, titulo, descricao, score, regiao, cidade, pessoaId) => {
      // Evita duplicata pendente do mesmo tipo + regiao/pessoa
      const dup = await client.query(`
        SELECT id FROM agenda_sugestoes
        WHERE tenant_id = $1 AND tipo = $2 AND aceita IS NULL
          AND COALESCE(regiao,'') = COALESCE($3,'')
          AND COALESCE(pessoa_id::text,'') = COALESCE($4::text,'')
        LIMIT 1
      `, [tenantId, tipo, regiao ?? null, pessoaId ?? null]);
      if (dup.rows.length) return; // já existe

      await client.query(`
        INSERT INTO agenda_sugestoes
          (tenant_id, tipo, titulo, descricao, score, regiao, cidade, pessoa_id, expira_em)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8, NOW() + INTERVAL '7 days')
      `, [tenantId, tipo, titulo, descricao, score, regiao ?? null, cidade ?? null, pessoaId ?? null]);
    };

    for (const r of regioesBaixas.rows) {
      const score = Math.min(95, 50 + Math.round(Number(r.votos_potenciais) / 500));
      await inserirSugestao(
        'regiao_inativa',
        `Visitar região ${r.regiao}`,
        `A região ${r.regiao} tem ${r.total_lideres} líder(es) e ${r.votos_potenciais} votos potenciais, mas apenas ${r.eventos_recentes} evento(s) nos últimos 30 dias.`,
        score, r.regiao, null, null
      );
    }

    for (const l of lideresInativos.rows) {
      const diasSemContato = l.ultimo_contato
        ? Math.round((Date.now() - new Date(l.ultimo_contato)) / 86400000)
        : 999;
      const score = Math.min(90, 40 + Math.round(diasSemContato / 3));
      await inserirSugestao(
        'lider_inativo',
        `Contatar ${l.nome}`,
        `${l.nome} (${l.cidade || l.regiao}) está sem contato há ${diasSemContato > 500 ? 'mais de 1 ano' : diasSemContato + ' dias'}. Expectativa: ${l.expectativa_votos} votos.`,
        score, l.regiao, l.cidade, l.pessoa_id
      );
    }

    for (const c of cidadesPrioritarias.rows) {
      const score = Math.min(85, 45 + Math.round(Number(c.votos_potenciais) / 400));
      await inserirSugestao(
        'cidade_prioritaria',
        `Agendar visita em ${c.cidade}`,
        `${c.cidade} tem ${c.total_lideres} líder(es) e ${c.votos_potenciais} votos potenciais, mas nenhum evento agendado nos últimos 60 dias.`,
        score, c.regiao, c.cidade, null
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[gerarSugestoes] erro:', err.message);
  } finally {
    client.release();
  }
}

// ── GET /api/agenda/eventos ─────────────────────────────────────────────
// Query params: mes (YYYY-MM), regiao, tipo, status
app.get('/api/agenda/eventos', auth, withTenant, allowAll(), async (req, res) => {
  try {
    const t   = req.tenantId;
    const mes = req.query.mes; // ex: "2026-04"
    const rf  = regiaoFilter(req);

    let idx = 1;
    const params = [t];
    let whereParts = [`e.tenant_id = $${idx++}`];

    if (mes) {
      // Compara o mês no fuso de Brasília usando TO_CHAR — evita problemas com cast UTC→local
      whereParts.push(`TO_CHAR(e.data_inicio AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') = $${idx}`);
      params.push(mes); // ex: '2026-04'
      idx++;
    }
    if (rf.sql) {
      // substitui placeholder pelo índice correto
      const rfSql = rf.sql.replace('$__REG__', `$${idx}`);
      whereParts.push(rfSql.replace(/^ AND /, ''));
      params.push(...rf.params);
      idx += rf.params.length;
    }
    if (req.query.tipo)   { whereParts.push(`e.tipo = $${idx++}`);   params.push(req.query.tipo); }
    if (req.query.status) { whereParts.push(`e.status = $${idx++}`); params.push(req.query.status); }
    if (req.query.pin_id) { whereParts.push(`e.pin_id = $${idx++}`); params.push(parseInt(req.query.pin_id)); }

    const rows = await dbAll(`
      SELECT e.*,
        p.nome AS pessoa_nome,
        p.foto AS pessoa_foto
      FROM agenda_eventos e
      LEFT JOIN pessoas p ON p.id = e.pessoa_id AND p.tenant_id = e.tenant_id
      WHERE ${whereParts.join(' AND ')}
      ORDER BY e.data_inicio ASC
    `, params);

    res.json(rows);
  } catch (err) {
    console.error('[GET /api/agenda/eventos]', err);
    res.status(500).json({ error: 'Erro ao buscar eventos' });
  }
});

// ── POST /api/agenda/eventos ────────────────────────────────────────────
app.post('/api/agenda/eventos', auth, withTenant, allowAll(), async (req, res) => {
  try {
    const t = req.tenantId;
    const {
      titulo, descricao, tipo = 'reuniao', prioridade = 2,
      data_inicio, data_fim, regiao, cidade, pessoa_id, meta = {},
      sugestao_origem, recorrencia, pin_id
    } = req.body;

    if (!titulo || !data_inicio) {
      return res.status(400).json({ error: 'titulo e data_inicio são obrigatórios' });
    }

    // lider_regiao só pode criar em sua própria região
    if (!isPrivileged(req.user.nivel) && regiao && regiao !== req.user.regiao) {
      return res.status(403).json({ error: 'Você só pode criar eventos na sua região' });
    }

    // meta precisa ser JSON string para o pg conseguir inferir o tipo JSONB
    const metaJson = JSON.stringify(meta && typeof meta === 'object' ? meta : {});

    // sugestao_origem: garante null quando vazio/undefined
    const sugOrigemId = sugestao_origem && String(sugestao_origem).trim() !== ''
      ? parseInt(sugestao_origem, 10) || null
      : null;

    // Se o evento vem de um pin, valida que o pin é do mesmo tenant
    const pinId = pin_id ? parseInt(pin_id) || null : null;
    if (pinId) {
      const pinOk = await dbGet('SELECT id FROM pins WHERE id = $1 AND tenant_id = $2', [pinId, t]);
      if (!pinOk) return res.status(400).json({ error: 'Pin inválido para este tenant' });
    }

    // Auto-preenche regiao/cidade a partir do pin (se não fornecida explicitamente)
    let regiaoFinal = regiao ?? null;
    let cidadeFinal = cidade ?? null;
    if (pinId && (!regiaoFinal || !cidadeFinal)) {
      const pinData = await dbGet('SELECT regiao, cidade FROM pins WHERE id = $1', [pinId]);
      if (pinData) {
        regiaoFinal = regiaoFinal || pinData.regiao || null;
        cidadeFinal = cidadeFinal || pinData.cidade || null;
      }
    }

    const row = await dbGet(`
      INSERT INTO agenda_eventos
        (tenant_id, titulo, descricao, tipo, prioridade, data_inicio, data_fim,
         regiao, cidade, pessoa_id, criado_por, meta, sugestao_origem, pin_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14)
      RETURNING *
    `, [t, titulo.trim(), descricao ?? null, tipo, Number(prioridade),
        data_inicio, data_fim ?? null, regiaoFinal, cidadeFinal,
        pessoa_id ? Number(pessoa_id) : null, req.user.id,
        metaJson, sugOrigemId ? String(sugOrigemId) : null, pinId]);

    // Se o evento veio de uma sugestão, marca como aceita
    if (sugOrigemId) {
      await pool.query(`
        UPDATE agenda_sugestoes SET aceita = TRUE, aceita_em = NOW(), evento_gerado = $1
        WHERE id = $2 AND tenant_id = $3
      `, [row.id, sugOrigemId, t]);
    }

    // Configura recorrência se solicitado
    if (recorrencia?.frequencia) {
      await pool.query(`
        INSERT INTO agenda_recorrencias (tenant_id, evento_id, frequencia, dia_semana, proximo_em)
        VALUES ($1,$2,$3,$4,$5)
      `, [t, row.id, recorrencia.frequencia,
          recorrencia.dia_semana ?? null,
          recorrencia.proximo_em ?? data_inicio]);
    }

    // Regenera sugestões em background (sem bloquear resposta)
    gerarSugestoes(t).catch(e => console.error('[bg sugestoes]', e.message));

    res.status(201).json(row);
  } catch (err) {
    console.error('[POST /api/agenda/eventos]', err);
    res.status(500).json({ error: 'Erro ao criar evento' });
  }
});

// ── PUT /api/agenda/eventos/:id ─────────────────────────────────────────
app.put('/api/agenda/eventos/:id', auth, withTenant, allowAll(), async (req, res) => {
  try {
    const t  = req.tenantId;
    const id = parseInt(req.params.id);

    const existing = await dbGet(
      'SELECT * FROM agenda_eventos WHERE id = $1 AND tenant_id = $2', [id, t]
    );
    if (!existing) return res.status(404).json({ error: 'Evento não encontrado' });

    // lider_regiao só edita eventos da sua região
    if (!isPrivileged(req.user.nivel) && existing.regiao !== req.user.regiao) {
      return res.status(403).json({ error: 'Sem permissão para editar este evento' });
    }

    const fields = [];
    const values = [];
    let idx = 1;
    const set = (col, val) => { if (val !== undefined) { fields.push(`${col} = $${idx++}`); values.push(val); } };

    const b = req.body;
    set('titulo',       b.titulo);
    set('descricao',    b.descricao);
    set('tipo',         b.tipo);
    set('prioridade',   b.prioridade != null ? Number(b.prioridade) : undefined);
    set('status',       b.status);
    set('data_inicio',  b.data_inicio);
    set('data_fim',     b.data_fim);
    set('regiao',       b.regiao);
    set('cidade',       b.cidade);
    set('pessoa_id',    b.pessoa_id);
    set('meta',         b.meta);

    if (!fields.length) return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    fields.push(`atualizado_em = NOW()`);

    values.push(id, t);
    const updated = await dbGet(`
      UPDATE agenda_eventos SET ${fields.join(', ')}
      WHERE id = $${idx} AND tenant_id = $${idx + 1}
      RETURNING *
    `, values);

    // Se concluído, regenera sugestões
    if (b.status === 'concluido') {
      gerarSugestoes(t).catch(e => console.error('[bg sugestoes]', e.message));
    }

    res.json(updated);
  } catch (err) {
    console.error('[PUT /api/agenda/eventos/:id]', err);
    res.status(500).json({ error: 'Erro ao atualizar evento' });
  }
});

// ── DELETE /api/agenda/eventos/:id ─────────────────────────────────────
app.delete('/api/agenda/eventos/:id', auth, withTenant, allow('dono', 'admin', 'lider_regiao'), async (req, res) => {
  try {
    const t  = req.tenantId;
    const id = parseInt(req.params.id);

    const existing = await dbGet(
      'SELECT regiao, criado_por FROM agenda_eventos WHERE id = $1 AND tenant_id = $2', [id, t]
    );
    if (!existing) return res.status(404).json({ error: 'Evento não encontrado' });

    // lider_regiao só apaga eventos da sua região
    if (!isPrivileged(req.user.nivel) && existing.regiao !== req.user.regiao) {
      return res.status(403).json({ error: 'Sem permissão para excluir este evento' });
    }

    await pool.query('DELETE FROM agenda_eventos WHERE id = $1 AND tenant_id = $2', [id, t]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/agenda/eventos/:id]', err);
    res.status(500).json({ error: 'Erro ao excluir evento' });
  }
});

// ── GET /api/agenda/sugestoes ───────────────────────────────────────────
// Retorna as sugestões pendentes (aceita IS NULL) ordenadas por score DESC
app.get('/api/agenda/sugestoes', auth, withTenant, allowAll(), async (req, res) => {
  try {
    const t  = req.tenantId;
    const rf = regiaoFilter(req);
    let extraSql = '', extraParams = [];
    if (rf.sql) {
      extraSql = rf.sql.replace('$__REG__', `$2`);
      extraParams = rf.params;
    }

    // Dispara regeneração em background na primeira chamada do dia
    gerarSugestoes(t).catch(e => console.error('[bg sugestoes]', e.message));

    const sugestoes = await dbAll(`
      SELECT s.*, p.nome AS pessoa_nome
      FROM agenda_sugestoes s
      LEFT JOIN pessoas p ON p.id = s.pessoa_id AND p.tenant_id = s.tenant_id
      WHERE s.tenant_id = $1
        AND s.aceita IS NULL
        AND (s.expira_em IS NULL OR s.expira_em > NOW())
        ${extraSql}
      ORDER BY s.score DESC, s.gerada_em DESC
      LIMIT 20
    `, [t, ...extraParams]);

    res.json(sugestoes);
  } catch (err) {
    console.error('[GET /api/agenda/sugestoes]', err);
    res.status(500).json({ error: 'Erro ao buscar sugestões' });
  }
});

// ── PATCH /api/agenda/sugestoes/:id ────────────────────────────────────
// Aceitar (aceita=true) ou ignorar (aceita=false) uma sugestão
app.patch('/api/agenda/sugestoes/:id', auth, withTenant, allowAll(), async (req, res) => {
  try {
    const t      = req.tenantId;
    const id     = parseInt(req.params.id);
    const aceita = req.body.aceita === true;

    await pool.query(`
      UPDATE agenda_sugestoes SET aceita = $1, aceita_em = NOW()
      WHERE id = $2 AND tenant_id = $3
    `, [aceita, id, t]);

    res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /api/agenda/sugestoes/:id]', err);
    res.status(500).json({ error: 'Erro ao atualizar sugestão' });
  }
});

// ── GET /api/agenda/insights ────────────────────────────────────────────
// Painel de inteligência: KPIs de atividade, regiões quentes/frias, etc.
app.get('/api/agenda/insights', auth, withTenant, allow('dono', 'admin', 'lider_regiao'), async (req, res) => {
  try {
    const t  = req.tenantId;
    const rf = regiaoFilter(req);

    let regParams = [t];
    let regWhere  = '';
    if (rf.sql) {
      regWhere = rf.sql.replace('$__REG__', '$2');
      regParams.push(...rf.params);
    }

    const [proximos, concluidos, porTipo, regioesFrias, topLideres] = await Promise.all([
      // Próximos 7 dias
      dbAll(`
        SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE prioridade = 1) AS alta,
          COUNT(*) FILTER (WHERE prioridade = 2) AS media,
          COUNT(*) FILTER (WHERE prioridade = 3) AS baixa
        FROM agenda_eventos
        WHERE tenant_id = $1
          AND status = 'pendente'
          AND data_inicio BETWEEN NOW() AND NOW() + INTERVAL '7 days'
          ${regWhere}
      `, regParams),

      // Concluídos últimos 30 dias
      dbAll(`
        SELECT COUNT(*) AS total
        FROM agenda_eventos
        WHERE tenant_id = $1
          AND status = 'concluido'
          AND data_inicio >= NOW() - INTERVAL '30 days'
          ${regWhere}
      `, regParams),

      // Distribuição por tipo (últimos 60 dias)
      dbAll(`
        SELECT tipo, COUNT(*) AS total
        FROM agenda_eventos
        WHERE tenant_id = $1
          AND data_inicio >= NOW() - INTERVAL '60 days'
          ${regWhere}
        GROUP BY tipo ORDER BY total DESC
      `, regParams),

      // Regiões sem eventos nos últimos 30 dias
      dbAll(`
        SELECT l.regiao,
          COUNT(DISTINCT l.id) AS lideres,
          COALESCE(SUM(l.expectativa_votos),0) AS votos,
          MAX(e.data_inicio) AS ultimo_evento
        FROM liderancas l
        LEFT JOIN agenda_eventos e
          ON e.tenant_id = l.tenant_id AND e.regiao = l.regiao
          AND e.data_inicio >= NOW() - INTERVAL '30 days'
          AND e.status <> 'cancelado'
        WHERE l.tenant_id = $1
          AND l.regiao IS NOT NULL
          ${regWhere}
        GROUP BY l.regiao
        HAVING COUNT(DISTINCT e.id) = 0
        ORDER BY votos DESC
        LIMIT 6
      `, regParams),

      // Top líderes por expectativa sem contato recente
      dbAll(`
        SELECT p.id, p.nome, l.regiao, l.cidade, l.expectativa_votos,
          MAX(e.data_inicio) AS ultimo_contato
        FROM pessoas p
        JOIN liderancas l ON l.pessoa_id = p.id AND l.tenant_id = p.tenant_id
        LEFT JOIN agenda_eventos e ON e.pessoa_id = p.id AND e.tenant_id = p.tenant_id
          AND e.status <> 'cancelado'
        WHERE p.tenant_id = $1 AND l.status = 'ativa'
          ${regWhere.replace(/regiao/g, 'l.regiao')}
        GROUP BY p.id, p.nome, l.regiao, l.cidade, l.expectativa_votos
        ORDER BY l.expectativa_votos DESC NULLS LAST
        LIMIT 5
      `, regParams),
    ]);

    res.json({
      proximos_7dias:  proximos[0] || {},
      concluidos_30d:  concluidos[0]?.total || 0,
      por_tipo:        porTipo,
      regioes_frias:   regioesFrias,
      top_lideres:     topLideres,
    });
  } catch (err) {
    console.error('[GET /api/agenda/insights]', err);
    res.status(500).json({ error: 'Erro ao buscar insights' });
  }
});

// ── GET /api/agenda/eventos/:id ─────────────────────────────────────────
app.get('/api/agenda/eventos/:id', auth, withTenant, allowAll(), async (req, res) => {
  try {
    const t  = req.tenantId;
    const id = parseInt(req.params.id);
    const row = await dbGet(`
      SELECT e.*, p.nome AS pessoa_nome, p.foto AS pessoa_foto
      FROM agenda_eventos e
      LEFT JOIN pessoas p ON p.id = e.pessoa_id AND p.tenant_id = e.tenant_id
      WHERE e.id = $1 AND e.tenant_id = $2
    `, [id, t]);
    if (!row) return res.status(404).json({ error: 'Evento não encontrado' });

    // lider_regiao só vê eventos de sua região
    if (!isPrivileged(req.user.nivel) && row.regiao !== req.user.regiao) {
      return res.status(403).json({ error: 'Sem permissão' });
    }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar evento' });
  }
});

app.get("/ping", (req, res) => {
  res.status(200).send("pong");
});

// ── IA GROQ — proxy seguro (chave fica no servidor) ──────────────────────────
// Modelos Groq em ordem de preferência (fallback automático se rate limit)
const GROQ_MODELS = [
  'llama-3.1-8b-instant',       // 20k TPM free — principal (mais rápido e maior limite)
  'llama-3.3-70b-versatile',    // 6k TPM free — fallback para respostas mais elaboradas
];

app.post('/api/ia/chat', auth, withTenant, async (req, res) => {
  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) return res.status(503).json({ error: 'IA não configurada no servidor. Adicione GROQ_API_KEY nas variáveis de ambiente.' });

  const { mensagem, contexto } = req.body;
  if (!mensagem && !contexto) return res.status(400).json({ error: 'mensagem obrigatória' });

  const mensagemFinal = mensagem || '';

  // Trunca o contexto se for muito grande (limite seguro: ~3500 tokens ≈ 14000 chars)
  const MAX_CTX_CHARS = 14000;
  let contextoFinal = contexto || '';
  if (contextoFinal.length > MAX_CTX_CHARS) {
    // Mantém cabeçalho (regras + resumo) e trunca a tabela de municípios pelo meio
    const corte = contextoFinal.lastIndexOf('\n', MAX_CTX_CHARS);
    contextoFinal = contextoFinal.slice(0, corte > 0 ? corte : MAX_CTX_CHARS)
      + '\n  ... (demais municípios omitidos por limite de contexto)';
    console.warn(`[IA] contexto truncado: ${contexto.length} → ${contextoFinal.length} chars`);
  }

  const messages = [];
  if (contextoFinal) messages.push({ role: 'system', content: contextoFinal });
  if (mensagemFinal) messages.push({ role: 'user', content: mensagemFinal });

  // Tenta cada modelo em ordem, com fallback automático em caso de rate limit
  let lastError = null;
  for (const model of GROQ_MODELS) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
        body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 1200 })
      });
      const data = await r.json();

      // Rate limit (429) → tenta próximo modelo
      if (r.status === 429) {
        console.warn(`[IA] rate limit em ${model}, tentando próximo...`);
        lastError = data.error?.message || 'Rate limit';
        continue;
      }

      if (!r.ok) return res.status(r.status).json({ error: data.error?.message || 'Erro na API Groq' });

      const texto = data.choices?.[0]?.message?.content || '';
      return res.json({ resposta: texto, modelo: model });

    } catch (e) {
      console.error(`[IA] erro no modelo ${model}:`, e.message);
      lastError = e.message;
    }
  }

  // Todos os modelos falharam
  res.status(429).json({ error: `Limite de requisições atingido. Aguarde alguns segundos e tente novamente. (${lastError})` });
});

// ── Carrega dados estáticos de deputados das eleições 2022 ──────────────────
let _deputadosEstaduaisData = null;
let _deputadosFederaisData = null;

function getDeputadosEstaduais() {
  if (_deputadosEstaduaisData) return _deputadosEstaduaisData;
  try {
    const vm = require('vm');
    const code = fs.readFileSync(path.join(__dirname, '..', 'data.js'), 'utf8') + '\n__out__ = deputadosByCity;';
    const ctx = { window: {}, __out__: null };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    _deputadosEstaduaisData = ctx.__out__ || {};
    console.log('[deputados estaduais] carregado:', Object.keys(_deputadosEstaduaisData).length, 'cidades');
  } catch(e) {
    console.warn('[deputados estaduais] erro ao carregar data.js:', e.message);
    _deputadosEstaduaisData = {};
  }
  return _deputadosEstaduaisData;
}

function getDeputadosFederais() {
  if (_deputadosFederaisData) return _deputadosFederaisData;
  try {
    const vm = require('vm');
    const code = fs.readFileSync(path.join(__dirname, '..', 'deputadosFederais.js'), 'utf8') + '\n__out__ = deputadosFederaisByCity;';
    const ctx = { window: {}, __out__: null };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    _deputadosFederaisData = ctx.__out__ || {};
    console.log('[deputados federais] carregado:', Object.keys(_deputadosFederaisData).length, 'cidades');
  } catch(e) {
    console.warn('[deputados federais] erro ao carregar deputadosFederais.js:', e.message);
    _deputadosFederaisData = {};
  }
  return _deputadosFederaisData;
}

// ── Cache do contexto da IA por tenant (TTL 5 min) ──────────────────────────
const _iaContextoCache = new Map();
const IA_CTX_TTL = 5 * 60 * 1000;

/**
 * GET /api/ia/contexto
 * Monta contexto rico para Alice combinando:
 *  - Dados do tenant: lideranças + metas por cidade (Postgres)
 *  - Votos válidos por município em 2022 (BigQuery)
 *  - Resultados eleitorais dos candidatos por município (BigQuery, busca automática por nome)
 *  - Histórico eleitoral do candidato por ano (BigQuery)
 *  - Perfil do eleitorado RJ: faixa etária + gênero (BigQuery)
 *  - Taxa de abstenção por município (BigQuery)
 * O resultado é cacheado por 5 minutos por tenant.
 */

/* ─────────────────────────────────────────────────────────────
 * GET /api/turn-credentials
 * Retorna credenciais temporárias do Cloudflare TURN (TTL 24h).
 * Requer variáveis de ambiente: CF_TURN_KEY_ID, CF_TURN_API_TOKEN
 * ───────────────────────────────────────────────────────────── */
app.get('/api/turn-credentials', auth, async (req, res) => {
  const keyId = process.env.CF_TURN_KEY_ID;
  const token = process.env.CF_TURN_API_TOKEN;

  // TURN via Open Relay Project (Metered.ca) — mais confiável que freestun.net
  // Funciona em Android 4G/5G (NAT simétrico de operadoras) sem configuração extra.
  const TURN_FALLBACK = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    // Open Relay Project — TURN público confiável (Metered.ca)
    { urls: 'turn:openrelay.metered.ca:80',            username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443',           username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turns:openrelay.metered.ca:443',          username: 'openrelayproject', credential: 'openrelayproject' },
  ];

  if (!keyId || !token) {
    // Sem credenciais Cloudflare — usa fallback confiável
    return res.json({ iceServers: TURN_FALLBACK });
  }

  try {
    const cfRes = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ttl: 86400 }) // 24 horas
      }
    );

    if (!cfRes.ok) {
      const err = await cfRes.text();
      console.error('[TURN] Cloudflare error:', cfRes.status, '— usando fallback');
      // Retorna 200 com fallback confiável em vez de 502
      return res.json({ iceServers: TURN_FALLBACK, fonte: 'fallback' });
    }

    const data = await cfRes.json();
    // Cloudflare retorna iceServers como objeto único — precisa ser array para RTCPeerConnection
    const cfIce = data.iceServers;
    if (!cfIce) {
      console.warn('[TURN] CF retornou sem iceServers — usando fallback');
      return res.json({ iceServers: TURN_FALLBACK, fonte: 'fallback' });
    }
    const iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      ...(Array.isArray(cfIce) ? cfIce : [cfIce])
    ];
    return res.json({ iceServers, fonte: 'cloudflare' });

  } catch (err) {
    console.error('[TURN] Erro ao buscar CF — usando fallback:', err.message);
    // Nunca retorna erro para o cliente — sempre entrega servidores funcionais
    return res.json({ iceServers: TURN_FALLBACK, fonte: 'fallback' });
  }
});
app.get('/api/ia/contexto', auth, withTenant, async (req, res) => {
  const tenantId = req.tenantId;
  const f = n => Number(n || 0).toLocaleString('pt-BR');

  // Serve do cache se ainda válido
  const cached = _iaContextoCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json({ ok: true, contexto: cached.contexto, fonte: 'cache' });
  }

  try {
    // ── 1. Dados do tenant (Postgres) ─────────────────────────────────────────
    const [cfg, { rows: lidRows }, { rows: lidStatusRows }, { rows: expCidRows }, { rows: regioesCfg }] = await Promise.all([
      getConfigTenant(tenantId),
      // Líderes por cidade (para tabela de municípios)
      pool.query(`
        SELECT l.cidade,
               COUNT(*)                              AS total_lideres,
               SUM(COALESCE(l.expectativa_votos, 0)) AS meta_votos
        FROM liderancas l
        WHERE l.tenant_id = $1 AND l.mapa IS NULL
        GROUP BY l.cidade
      `, [tenantId]),
      // Líderes com contexto de status e interação
      pool.query(`
        SELECT
          l.id, l.nome, l.cidade, l.regiao,
          l.status, l.vinculo_politico,
          COALESCE(l.expectativa_votos, 0) AS expectativa_votos,
          MAX(g.data) AS ultima_interacao,
          EXTRACT(DAY FROM NOW() - MAX(g.data)) AS dias_sem_interacao,
          COUNT(g.id) AS total_gastos
        FROM liderancas l
        LEFT JOIN gastos_lideranca g ON g.lideranca_id = l.id
        WHERE l.tenant_id = $1 AND l.mapa IS NULL
        GROUP BY l.id, l.nome, l.cidade, l.regiao, l.status, l.vinculo_politico, l.expectativa_votos
        ORDER BY ultima_interacao ASC NULLS FIRST
      `, [tenantId]),
      // Meta por cidade por candidato (JSONB: {chave: valor})
      pool.query(`
        SELECT cidade, expectativas
        FROM expectativa_cidade
        WHERE tenant_id = $1
      `, [tenantId]),
      // Regiões configuradas do tenant
      pool.query(`
        SELECT chave, label, cidades
        FROM tenant_regioes
        WHERE tenant_id = $1
        ORDER BY ordem ASC
      `, [tenantId])
    ]);

    const candidatos = cfg.candidatos || [];
    const nomeSist   = cfg.nome_sistema || 'Campanha';
    const nomCands   = candidatos.map(c => c.nome || c.chave).join(', ');

    const lidMap = {};
    for (const r of lidRows) {
      lidMap[r.cidade] = { lideres: Number(r.total_lideres), meta: Number(r.meta_votos) };
    }

    // ── 1b. Processa metas por candidato por cidade ───────────────────────────
    // expCidMap: cidade(lower) → { chave: valor }
    const expCidMap = {};
    for (const r of expCidRows) {
      expCidMap[(r.cidade || '').toLowerCase()] = r.expectativas || {};
    }

    // ── 1c. Processa regiões e agrega metas + eleitorado por região ───────────
    // regiaoMap: chave → { label, cidades[] }
    const regiaoMap = {};
    for (const r of regioesCfg) {
      regiaoMap[r.chave] = {
        label: r.label || r.chave,
        cidades: Array.isArray(r.cidades) ? r.cidades : (r.cidades ? JSON.parse(r.cidades) : [])
      };
    }

    // ── 1d. Processa status dos líderes com contexto ──────────────────────────
    // Classifica risco: sem_interacao_nunca / risco_alto (>60d) / risco_medio (30-60d) / ok (<30d)
    const lidStatusPorCand = {}; // chave → { ativos, inativos, risco_alto, risco_medio, sem_interacao, exp_total }
    const lidSemInteracaoList = []; // lista para contexto textual

    for (const cand of candidatos) {
      lidStatusPorCand[cand.chave] = { ativos: 0, inativos: 0, risco_alto: 0, risco_medio: 0, sem_interacao: 0, exp_total: 0 };
    }

    for (const l of lidStatusRows) {
      const chave = (l.vinculo_politico || '').toLowerCase();
      const dias  = l.ultima_interacao ? Number(l.dias_sem_interacao || 0) : null;
      const exp   = Number(l.expectativa_votos);

      // Acumula por candidato
      const stats = lidStatusPorCand[chave];
      if (stats) {
        if (l.status === 'ativo') stats.ativos++;
        else stats.inativos++;
        stats.exp_total += exp;
        if (dias === null)  stats.sem_interacao++;
        else if (dias > 60) stats.risco_alto++;
        else if (dias > 30) stats.risco_medio++;
      }

      // Candidatos à lista de risco (sem interação ou > 30 dias, ativo, com expectativa)
      const isRisco = (dias === null || dias > 30) && l.status === 'ativo' && exp > 0;
      if (isRisco) {
        lidSemInteracaoList.push({
          nome: l.nome,
          cidade: l.cidade,
          regiao: l.regiao,
          vinculo: l.vinculo_politico,
          exp,
          dias,
          risco: dias === null ? 'nunca_interagiu' : dias > 60 ? 'critico' : 'medio'
        });
      }
    }

    // Ordena por risco (críticos primeiro) e limita a 40 líderes
    lidSemInteracaoList.sort((a, b) => {
      const ord = { nunca_interagiu: 0, critico: 1, medio: 2 };
      return (ord[a.risco] ?? 3) - (ord[b.risco] ?? 3) || b.exp - a.exp;
    });
    const lidRiscoTop = lidSemInteracaoList.slice(0, 40);

    // ── 2. BigQuery (paralelo) ────────────────────────────────────────────────
    let votosValidos = {};   // municipio(UPPER) → votos
    let resultsByCand = {};  // chave → { municipio(UPPER) → votos }
    let historicoByCand = {}; // chave → [{ ano, votos_total }]
    let perfilTexto = '';
    let abstencaoTexto = '';

    const bq = getBQ();
    if (bq) {
      // Descobre sequenciais dos candidatos no BQ (pelo nome, busca automática)
      const seqMap = {}; // chave → { sequencial, ano, cargo, nome_urna }

      await Promise.all(candidatos.map(async cand => {
        // Usa nome_urna_bq se configurado, senão usa o nome do sistema como busca
        const nomeBusca = (cand.nome_urna_bq || cand.nome || '').trim();
        if (!nomeBusca) return;
        const anoBusca  = cand.ano_eleicao_bq || 2022;
        const cargoBusca = cand.cargo_bq || null;

        try {
          const sqlSeq = `
            SELECT DISTINCT
              CAST(sequencial AS STRING) AS sequencial,
              ano,
              UPPER(cargo)     AS cargo,
              UPPER(nome_urna) AS nome_urna
            FROM \`basedosdados.br_tse_eleicoes.candidatos\`
            WHERE sigla_uf = 'RJ'
              AND ano = @ano
              AND UPPER(nome_urna) LIKE @nome
              ${cargoBusca ? 'AND UPPER(cargo) = @cargo' : ''}
            ORDER BY ano DESC
            LIMIT 3
          `;
          const params = {
            ano:  parseInt(anoBusca),
            nome: '%' + nomeBusca.toUpperCase() + '%',
            ...(cargoBusca ? { cargo: cargoBusca.toUpperCase() } : {})
          };
          const rows = await runBQ(sqlSeq, params);
          if (rows.length > 0) {
            seqMap[cand.chave] = {
              sequencial: rows[0].sequencial,
              ano:        rows[0].ano,
              cargo:      rows[0].cargo,
              nome_urna:  rows[0].nome_urna,
            };
            console.log(`[ia/contexto] ${cand.chave} → ${rows[0].nome_urna} (seq ${rows[0].sequencial}, ${rows[0].cargo})`);
          } else {
            console.warn(`[ia/contexto] BQ: candidato "${nomeBusca}" não encontrado em ${anoBusca}`);
          }
        } catch (e) {
          console.warn(`[ia/contexto] BQ busca seq ${cand.chave}:`, e.message.split('\n')[0]);
        }
      }));

      // Executa todas as queries em paralelo
      const bqTasks = [];

      // 2a. Votos válidos por município 2022
      bqTasks.push(
        runBQ(`
          SELECT UPPER(COALESCE(m.nome, CAST(d.id_municipio AS STRING))) AS municipio,
                 SUM(d.votos_validos) AS votos_validos
          FROM \`basedosdados.br_tse_eleicoes.detalhes_votacao_municipio\` d
          LEFT JOIN \`basedosdados.br_bd_diretorios_brasil.municipio\` m
            ON d.id_municipio = m.id_municipio
          WHERE d.ano = 2022 AND d.turno = 1 AND d.sigla_uf = 'RJ'
          GROUP BY municipio
        `, {}).then(rows => {
          for (const r of rows) votosValidos[r.municipio] = Number(r.votos_validos);
        }).catch(e => console.warn('[ia/ctx] votos_validos:', e.message.split('\n')[0]))
      );

      // 2b. Resultados por candidato por município
      for (const cand of candidatos) {
        const info = seqMap[cand.chave];
        if (!info) continue;
        bqTasks.push(
          runBQ(`
            SELECT UPPER(COALESCE(m.nome, CAST(r.id_municipio AS STRING))) AS municipio,
                   SUM(r.votos) AS votos
            FROM \`basedosdados.br_tse_eleicoes.resultados_candidato_municipio\` r
            LEFT JOIN \`basedosdados.br_bd_diretorios_brasil.municipio\` m
              ON r.id_municipio = m.id_municipio
            WHERE r.ano = @ano AND r.turno = 1 AND r.sigla_uf = 'RJ'
              AND CAST(r.sequencial_candidato AS STRING) = @seq
            GROUP BY municipio
          `, { ano: parseInt(info.ano), seq: info.sequencial }).then(rows => {
            const mapa = {};
            for (const r of rows) mapa[r.municipio] = Number(r.votos);
            resultsByCand[cand.chave] = { mapa, ano: info.ano, cargo: info.cargo, nome_urna: info.nome_urna };
          }).catch(e => console.warn(`[ia/ctx] resultados ${cand.chave}:`, e.message.split('\n')[0]))
        );

        // 2c. Histórico eleitoral do candidato (todos os anos disponíveis)
        bqTasks.push(
          runBQ(`
            SELECT r.ano, SUM(r.votos) AS votos_total
            FROM \`basedosdados.br_tse_eleicoes.resultados_candidato_municipio\` r
            JOIN \`basedosdados.br_tse_eleicoes.candidatos\` c
              ON c.ano = r.ano AND c.sigla_uf = r.sigla_uf
              AND CAST(c.sequencial AS STRING) = CAST(r.sequencial_candidato AS STRING)
            WHERE r.sigla_uf = 'RJ' AND r.turno = 1
              AND UPPER(c.nome_urna) LIKE @nome
            GROUP BY r.ano
            ORDER BY r.ano
          `, { nome: '%' + (cand.nome_urna_bq || cand.nome || '').toUpperCase() + '%' })
          .then(rows => {
            historicoByCand[cand.chave] = rows.map(r => ({ ano: r.ano, votos: Number(r.votos_total) }));
          }).catch(e => console.warn(`[ia/ctx] historico ${cand.chave}:`, e.message.split('\n')[0]))
        );
      }

      // 2d. Perfil do eleitorado RJ (faixa etária + gênero)
      bqTasks.push(
        runBQ(`
          SELECT faixa_etaria, genero, SUM(qtde_eleitores_perfil) AS total
          FROM \`basedosdados.br_tse_eleicoes.perfil_eleitorado_municipio\`
          WHERE ano = 2022 AND sigla_uf = 'RJ'
          GROUP BY faixa_etaria, genero
          ORDER BY faixa_etaria, genero
        `, {}).then(rows => {
          const pfMap = {};
          for (const r of rows) {
            const fx = r.faixa_etaria || 'Não informado';
            if (!pfMap[fx]) pfMap[fx] = { M: 0, F: 0, total: 0 };
            const g = (r.genero || '').toUpperCase();
            if (g === 'MASCULINO') pfMap[fx].M += Number(r.total);
            else if (g === 'FEMININO') pfMap[fx].F += Number(r.total);
            pfMap[fx].total += Number(r.total);
          }
          const linhasPf = Object.entries(pfMap)
            .map(([fx, d]) => `  ${fx}: total=${f(d.total)}, feminino=${f(d.F)}, masculino=${f(d.M)}`)
            .join('\n');
          perfilTexto = linhasPf ? `\nPERFIL DO ELEITORADO RJ (2022, por faixa etária e gênero):\n${linhasPf}` : '';
        }).catch(e => console.warn('[ia/ctx] perfil:', e.message.split('\n')[0]))
      );

      // 2e. Abstenção por município 2022 (top 20 com maior abstenção)
      bqTasks.push(
        runBQ(`
          SELECT UPPER(COALESCE(m.nome, CAST(d.id_municipio AS STRING))) AS municipio,
                 ROUND(SUM(d.abstencoes) * 100.0 / NULLIF(SUM(d.comparecimento + d.abstencoes), 0), 1) AS pct_abstencao
          FROM \`basedosdados.br_tse_eleicoes.detalhes_votacao_municipio\` d
          LEFT JOIN \`basedosdados.br_bd_diretorios_brasil.municipio\` m
            ON d.id_municipio = m.id_municipio
          WHERE d.ano = 2022 AND d.turno = 1 AND d.sigla_uf = 'RJ'
          GROUP BY municipio
          HAVING pct_abstencao IS NOT NULL
          ORDER BY pct_abstencao DESC
          LIMIT 20
        `, {}).then(rows => {
          if (rows.length) {
            const linhasAbs = rows.map(r => `  ${r.municipio}: ${r.pct_abstencao}%`).join('\n');
            abstencaoTexto = `\nTOP 20 MUNICÍPIOS POR ABSTENÇÃO (2022):\n${linhasAbs}`;
          }
        }).catch(e => console.warn('[ia/ctx] abstencao:', e.message.split('\n')[0]))
      );

      // Aguarda todas as queries BQ em paralelo
      await Promise.all(bqTasks);
    }

    // ── 3. Monta tabela por município ─────────────────────────────────────────
    const todasCidades = new Set([
      ...Object.keys(lidMap),
      ...Object.keys(votosValidos).map(c => c)
    ]);

    // Normaliza nomes do lidMap para UPPER para fazer join com BQ
    const lidMapUpper = {};
    for (const [k, v] of Object.entries(lidMap)) lidMapUpper[k.toUpperCase()] = { ...v, nomeOriginal: k };

    // Formato compacto para economizar tokens: números sem separador de milhar,
    // colunas separadas por pipe, nomes abreviados.
    // Ex: "Rio de Janeiro|4907206|12|45000|celia:3241(0.1%)"
    const cabecalhoCols = ['cidade', 'vv', 'lid', 'meta',
      ...candidatos.filter(c => resultsByCand[c.chave]).map(c => `${c.chave}`)
    ].join('|');

    const linhas = cabecalhoCols + '\n' + [...todasCidades]
      .sort((a, b) => (votosValidos[b.toUpperCase()] || votosValidos[b] || 0) -
                      (votosValidos[a.toUpperCase()] || votosValidos[a] || 0))
      .map(cidade => {
        const cidadeUp = cidade.toUpperCase();
        const vv  = votosValidos[cidadeUp] || votosValidos[cidade] || 0;
        const ld  = lidMapUpper[cidadeUp] || lidMap[cidade] || { lideres: 0, meta: 0 };
        let cols = [cidade, vv, ld.lideres, Math.round(ld.meta)];
        for (const cand of candidatos) {
          const res = resultsByCand[cand.chave];
          if (!res || !res.mapa) continue;
          const votos = res.mapa[cidadeUp] || res.mapa[cidade] || 0;
          const pct = vv > 0 ? ((votos / vv) * 100).toFixed(1) : '?';
          cols.push(`${votos}(${pct}%)`);
        }
        return cols.join('|');
      }).join('\n');

    // ── 4. Histórico por candidato ────────────────────────────────────────────
    let historicoTexto = '';
    for (const cand of candidatos) {
      const hist = historicoByCand[cand.chave];
      if (hist && hist.length) {
        const res = resultsByCand[cand.chave];
        const nomeBQ = res ? res.nome_urna : (cand.nome || cand.chave);
        const linhasH = hist.map(h => `  ${h.ano}: ${f(h.votos)} votos`).join('\n');
        historicoTexto += `\nHISTÓRICO ELEITORAL — ${nomeBQ} (total estado RJ):\n${linhasH}\n`;
      }
    }

    // ── 5. Info dos candidatos encontrados no BQ ──────────────────────────────
    let candBQTexto = '';
    for (const cand of candidatos) {
      const res = resultsByCand[cand.chave];
      if (res) {
        const totalVotosCand = Object.values(res.mapa).reduce((s, v) => s + v, 0);
        const totalVV = Object.values(votosValidos).reduce((s, v) => s + v, 0);
        const pctTotal = totalVV > 0 ? ((totalVotosCand / totalVV) * 100).toFixed(2) : '?';
        candBQTexto += `  ${cand.nome || cand.chave} (${res.nome_urna}, ${res.cargo}, ${res.ano}): `
                     + `${f(totalVotosCand)} votos no estado (${pctTotal}% dos votos válidos)\n`;
      }
    }

    // ── 6. Totais ─────────────────────────────────────────────────────────────
    const totalVV   = Object.values(votosValidos).reduce((s, v) => s + v, 0);
    const totalLid  = lidRows.reduce((s, r) => s + Number(r.total_lideres), 0);
    const totalMeta = lidRows.reduce((s, r) => s + Number(r.meta_votos), 0);

    // Coluna de candidatos presentes na tabela
    const candCols = candidatos.filter(c => resultsByCand[c.chave])
      .map(c => { const res = resultsByCand[c.chave]; return `${c.chave}=votos ${res.nome_urna} ${res.ano}`; })
      .join(', ');

    // ── 7. Meta por região por candidato + eleitorado real por região ─────────
    let regiaoTexto = '';
    if (Object.keys(regiaoMap).length > 0) {
      // Normaliza nomes BQ para lookup (UPPER sem acento não é necessário, só UPPER)
      const votosValidosUpper = {};
      for (const [k, v] of Object.entries(votosValidos)) votosValidosUpper[k.toUpperCase()] = v;

      const linhasReg = [];
      for (const [chaveReg, reg] of Object.entries(regiaoMap)) {
        const cids = reg.cidades || [];

        // Eleitorado real da região (soma votos válidos das cidades)
        const eleitoradoReg = cids.reduce((s, c) => {
          return s + (votosValidosUpper[c.toUpperCase()] || 0);
        }, 0);

        // Meta por candidato na região (soma expectativas das cidades)
        const metasPorCand = {};
        for (const cand of candidatos) metasPorCand[cand.chave] = 0;
        for (const cidade of cids) {
          const expCid = expCidMap[cidade.toLowerCase()] || {};
          for (const cand of candidatos) {
            metasPorCand[cand.chave] += Number(expCid[cand.chave] || 0);
          }
        }

        // Exp. líderes por candidato na região
        const expLideresPorCand = {};
        for (const cand of candidatos) expLideresPorCand[cand.chave] = 0;
        for (const l of lidStatusRows) {
          if ((l.regiao || '').toLowerCase() !== chaveReg.toLowerCase()) continue;
          const ch = (l.vinculo_politico || '').toLowerCase();
          if (expLideresPorCand[ch] !== undefined) {
            expLideresPorCand[ch] += Number(l.expectativa_votos);
          }
        }

        // Resultados eleitorais 2022 dos candidatos na região
        const resultadosReg = {};
        for (const cand of candidatos) {
          const res = resultsByCand[cand.chave];
          if (!res) continue;
          const totalCand = cids.reduce((s, c) => s + (res.mapa[c.toUpperCase()] || res.mapa[c] || 0), 0);
          resultadosReg[cand.chave] = totalCand;
        }

        const candDetalhes = candidatos.map(cand => {
          const meta  = metasPorCand[cand.chave];
          const expLid = expLideresPorCand[cand.chave];
          const res2022 = resultadosReg[cand.chave];
          const pctMeta = eleitoradoReg > 0 && meta > 0 ? ((meta / eleitoradoReg) * 100).toFixed(1) + '%' : '—';
          const cobert  = meta > 0 ? Math.round((expLid / meta) * 100) + '%' : '—';
          const partes = [`${cand.nome || cand.chave}: meta=${f(meta)}_votos(${pctMeta}_do_eleitorado) exp_lideres=${f(expLid)} cobertura=${cobert}`];
          if (res2022 !== undefined) partes.push(`resultado_2022=${f(res2022)}`);
          return partes.join(' ');
        }).join(' | ');

        linhasReg.push(`  ${reg.label} (${cids.length} cidades, eleitorado=${f(eleitoradoReg)}): ${candDetalhes}`);
      }

      if (linhasReg.length) {
        regiaoTexto = `\nMETA POR REGIÃO POR CANDIDATO (meta=votos cadastrados, exp_lideres=votos prometidos pelos líderes, cobertura=exp_lid/meta):\n${linhasReg.join('\n')}\n`;
      }
    }

    // ── 8. Status e risco dos líderes por candidato ───────────────────────────
    let statusCandTexto = '';
    if (candidatos.length > 0) {
      const linhasStatus = candidatos.map(cand => {
        const s = lidStatusPorCand[cand.chave] || {};
        return `  ${cand.nome || cand.chave}: ativos=${s.ativos||0} inativos=${s.inativos||0} `
             + `risco_critico(>60d_sem_interacao)=${s.risco_alto||0} `
             + `risco_medio(30-60d)=${s.risco_medio||0} `
             + `nunca_interagiu=${s.sem_interacao||0} `
             + `exp_votos_total=${f(s.exp_total||0)}`;
      }).join('\n');
      statusCandTexto = `\nSTATUS DOS LÍDERES POR CANDIDATO:\n${linhasStatus}\n`;
    }

    // ── 9. Líderes em risco (sem interação recente) ───────────────────────────
    let lidRiscoTexto = '';
    if (lidRiscoTop.length > 0) {
      const linhasRisco = lidRiscoTop.map(l => {
        const diasStr = l.dias === null ? 'nunca_interagiu' : `${Math.round(l.dias)}d_sem_interacao`;
        return `  ${l.nome} | ${l.cidade} | ${l.regiao} | ${l.vinculo || '—'} | exp=${l.exp} | ${diasStr} | risco=${l.risco}`;
      }).join('\n');
      lidRiscoTexto = `\nLÍDERES EM RISCO (ativos, sem interação recente, ordenados por criticidade):\n${linhasRisco}\n`;
    }

    // ── 10. Deputados estaduais e federais por município (2022) ─────────────────
    let deputadosTexto = '';
    try {
      const estaduaisData = getDeputadosEstaduais();
      const federaisData  = getDeputadosFederais();

      // Normaliza lookup: chave UPPER → array
      const fedUpper = {};
      for (const [k, v] of Object.entries(federaisData)) fedUpper[k.toUpperCase()] = v;

      const linhasDeputados = [];
      for (const cidade of [...todasCidades].sort()) {
        const cidadeUp = cidade.toUpperCase();

        // Estaduais: data.js usa nome original (ex: "Angra dos Reis")
        const est = estaduaisData[cidade] || [];
        // Federais: deputadosFederais.js usa UPPER (ex: "ANGRA DOS REIS")
        const fed = fedUpper[cidadeUp] || [];

        if (est.length === 0 && fed.length === 0) continue;

        const estStr = est.slice(0, 5).map(d => `${d.name}:${d.votes}`).join(', ');
        const fedStr = fed.slice(0, 5).map(d => `${d.name}:${d.votes}`).join(', ');
        linhasDeputados.push(`  ${cidade}: estaduais=[${estStr}] federais=[${fedStr}]`);
      }

      if (linhasDeputados.length) {
        deputadosTexto = `\nDEPUTADOS MAIS VOTADOS POR MUNICÍPIO (eleições 2022, top 5 estaduais e federais):\n${linhasDeputados.join('\n')}\n`;
      }
    } catch(e) {
      console.warn('[ia/ctx] deputados:', e.message);
    }

    const contexto = `Alice — assistente estratégica da ${nomeSist}.${nomCands ? ` Candidatos: ${nomCands}.` : ''}

REGRAS: Responda APENAS com os dados abaixo. Não invente. Se não houver dado, diga isso.

RESUMO: municípios=${todasCidades.size}, votos_validos_RJ_2022=${f(totalVV)}, lideres=${totalLid}, meta_total=${f(totalMeta)}
${candBQTexto ? 'DESEMPENHO 2022: ' + candBQTexto.trim() : ''}
${historicoTexto.trim()}
${regiaoTexto.trim()}
${statusCandTexto.trim()}
${lidRiscoTexto.trim()}
${perfilTexto.trim()}
${abstencaoTexto.trim()}
${deputadosTexto.trim()}

TABELA POR MUNICÍPIO (colunas: ${cabecalhoCols}${candCols ? ' | ' + candCols : ''}):
${linhas}
`;

    // Cacheia por 5 min
    _iaContextoCache.set(tenantId, { contexto, expiresAt: Date.now() + IA_CTX_TTL });

    res.json({ ok: true, contexto });

  } catch (err) {
    console.error('[GET /api/ia/contexto]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ─────────────────────────────────────────────────────────────
 * ORGANOGRAMA — GET / PUT / upload foto
 * ───────────────────────────────────────────────────────────── */

// GET /api/organograma — carrega dados do organograma do tenant
app.get('/api/organograma', auth, withTenant, allowAll(), async (req, res) => {
  try {
    const row = await dbGet(
      'SELECT dados, card_size FROM organograma WHERE tenant_id = $1',
      [req.tenantId]
    );
    if (!row) return res.json({ dados: null, cardSize: 200 });
    res.json({ dados: row.dados, cardSize: row.card_size });
  } catch (err) {
    console.error('[GET /api/organograma]', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/organograma — salva dados do organograma (dono e admin)
app.put('/api/organograma', auth, withTenant, allow('dono', 'admin'), async (req, res) => {
  try {
    const { dados, cardSize } = req.body;
    if (!dados || typeof dados !== 'object') {
      return res.status(400).json({ error: 'Dados inválidos' });
    }
    await pool.query(
      `INSERT INTO organograma (tenant_id, dados, card_size, updated_at, updated_by)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (tenant_id) DO UPDATE SET
         dados      = EXCLUDED.dados,
         card_size  = EXCLUDED.card_size,
         updated_at = NOW(),
         updated_by = EXCLUDED.updated_by`,
      [req.tenantId, JSON.stringify(dados), cardSize || 200, String(req.user.id)]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[PUT /api/organograma]', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/organograma/foto — faz upload de uma foto, retorna URL pública
app.post('/api/organograma/foto', auth, withTenant, allow('dono', 'admin'), upload.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    const tempPath = req.file.path;
    const outPath  = tempPath + '.webp';

    await sharp(tempPath)
      .resize({ width: 300, height: 300, fit: 'cover', position: 'center' })
      .webp({ quality: 82 })
      .toFile(outPath);
    try { fs.unlinkSync(tempPath); } catch {}

    const fileBuffer = fs.readFileSync(outPath);
    const fileName   = `${req.tenantId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.webp`;

    const { error: uploadErr } = await supabase.storage
      .from('organograma-fotos')
      .upload(fileName, fileBuffer, { contentType: 'image/webp', upsert: false });
    try { fs.unlinkSync(outPath); } catch {}

    if (uploadErr) throw uploadErr;

    const { data } = supabase.storage.from('organograma-fotos').getPublicUrl(fileName);
    res.json({ ok: true, url: data.publicUrl });
  } catch (err) {
    console.error('[POST /api/organograma/foto]', err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// MÓDULO DE AVISOS / NOTIFICAÇÕES
// ═══════════════════════════════════════════════════════════════════

// GET /api/notificacoes/ping — diagnóstico (sem autenticação, para testar)
app.get('/api/notificacoes/ping', async (req, res) => {
  try {
    const tabelas = await dbAll(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('notificacao_tokens','notificacao_lembretes','notificacao_leituras')
    `);
    res.json({ ok: true, tabelas: tabelas.map(t => t.table_name) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Helper: envia push via Expo Push API usando https nativo (compatível com qualquer Node)
async function enviarExpoPush(tokens, titulo, corpo) {
  if (!tokens || tokens.length === 0) return;
  const lotes = [];
  for (let i = 0; i < tokens.length; i += 100) lotes.push(tokens.slice(i, i + 100));

  for (const lote of lotes) {
    const payload = JSON.stringify(lote.map(t => ({
      to: t, sound: 'default', title: titulo, body: corpo, data: { tipo: 'aviso' },
    })));

    await new Promise((resolve) => {
      const opts = {
        hostname: 'exp.host',
        path: '/--/api/v2/push/send',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      };
      const req = https.request(opts, (res) => {
        res.resume(); // descarta a resposta
        resolve();
      });
      req.on('error', (e) => {
        console.warn('[push] erro https:', e.message);
        resolve();
      });
      req.write(payload);
      req.end();
    });
  }
}

// POST /api/notificacoes/token — salva o push token do dispositivo
app.post('/api/notificacoes/token', auth, withTenant, async (req, res) => {
  try {
    const { token, plataforma } = req.body;
    if (!token || typeof token !== 'string') return res.status(400).json({ error: 'token inválido' });
    await pool.query(`
      INSERT INTO notificacao_tokens (tenant_id, usuario_id, token, plataforma, atualizado_em)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (tenant_id, usuario_id, token)
      DO UPDATE SET plataforma = EXCLUDED.plataforma, atualizado_em = NOW()
    `, [req.tenantId, String(req.user.id), token, plataforma || 'unknown']);
    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/notificacoes/token]', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/notificacoes/lembretes — lista lembretes pendentes (não lidos) para o usuário
app.get('/api/notificacoes/lembretes', auth, withTenant, async (req, res) => {
  try {
    const { nao_lidos } = req.query;
    let sql, params;
    if (nao_lidos === 'true') {
      sql = `
        SELECT l.id, l.titulo, l.mensagem, l.regiao, l.nivel, l.criado_em
        FROM notificacao_lembretes l
        WHERE l.tenant_id = $1
          AND (l.regiao IS NULL OR l.regiao = $2 OR $2 IS NULL)
          AND (l.nivel  IS NULL OR l.nivel  = $3)
          AND l.id NOT IN (
            SELECT lembrete_id FROM notificacao_leituras WHERE usuario_id = $4
          )
        ORDER BY l.criado_em DESC
        LIMIT 50
      `;
      params = [req.tenantId, req.user.regiao || null, req.user.nivel, String(req.user.id)];
    } else {
      sql = `
        SELECT l.id, l.titulo, l.mensagem, l.regiao, l.nivel, l.criado_em
        FROM notificacao_lembretes l
        WHERE l.tenant_id = $1
        ORDER BY l.criado_em DESC
        LIMIT 50
      `;
      params = [req.tenantId];
    }
    const rows = await dbAll(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[GET /api/notificacoes/lembretes]', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notificacoes/lembretes — cria aviso e dispara push (dono/admin)
app.post('/api/notificacoes/lembretes', auth, withTenant, allow('dono', 'admin'), async (req, res) => {
  const step = { atual: 'inicio' };
  try {
    const { titulo, mensagem, regiao, nivel } = req.body;

    console.log('[aviso] body:', { titulo, mensagem: mensagem?.slice(0,30), regiao, nivel });
    console.log('[aviso] user:', { id: req.user.id, nivel: req.user.nivel, tenantId: req.tenantId });

    if (!mensagem || typeof mensagem !== 'string' || !mensagem.trim()) {
      return res.status(400).json({ error: 'mensagem é obrigatória' });
    }

    // ── 1. Salva o lembrete ──────────────────────────────────────────────────
    step.atual = 'insert_lembrete';
    const tituloFinal  = (titulo || 'Aviso da gestão').trim();
    const mensagemFinal = mensagem.trim();
    const criadoPor    = req.user.id != null ? String(req.user.id) : null;
    const tenantId     = req.tenantId;

    const row = await dbGet(`
      INSERT INTO notificacao_lembretes (tenant_id, criado_por, titulo, mensagem, regiao, nivel)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, titulo, mensagem
    `, [tenantId, criadoPor, tituloFinal, mensagemFinal, regiao || null, nivel || null]);

    console.log('[aviso] lembrete criado:', row?.id);

    // ── 2. Busca push tokens dos destinatários (sem JOIN — mais seguro) ──────
    step.atual = 'buscar_tokens';
    let tokens = [];
    try {
      // Busca todos os tokens do tenant
      const allTokens = await dbAll(
        `SELECT usuario_id, token FROM notificacao_tokens WHERE tenant_id = $1`,
        [tenantId]
      );

      if (regiao || nivel) {
        // Filtra por usuários com a região/nível correto
        let usersWhere = `WHERE tenant_id = $1`;
        const usersParams = [tenantId];
        let i = 2;
        if (regiao && !nivel) { usersWhere += ` AND regiao_vinculada = $${i++}`; usersParams.push(regiao); }
        if (nivel)             { usersWhere += ` AND nivel = $${i++}`;            usersParams.push(nivel); }

        const filteredUsers = await dbAll(
          `SELECT id::TEXT AS id FROM usuarios ${usersWhere}`, usersParams
        );
        const userIds = new Set(filteredUsers.map(u => String(u.id)));
        tokens = allTokens
          .filter(t => userIds.has(String(t.usuario_id)))
          .map(t => t.token)
          .filter(Boolean);
      } else {
        tokens = allTokens.map(t => t.token).filter(Boolean);
      }
    } catch (tokenErr) {
      // Tokens indisponíveis não impedem salvar o aviso
      console.warn('[aviso] erro ao buscar tokens (ignorado):', tokenErr.message);
    }

    console.log('[aviso] tokens encontrados:', tokens.length);

    // ── 3. Dispara push em background ────────────────────────────────────────
    if (tokens.length > 0) {
      enviarExpoPush(tokens, row.titulo, row.mensagem).catch(e =>
        console.warn('[aviso] push falhou (ignorado):', e.message)
      );
    }

    res.json({ ok: true, id: row.id, total_tokens: tokens.length });
  } catch (err) {
    console.error(`[POST /api/notificacoes/lembretes] etapa=${step.atual}`, err.message);
    res.status(500).json({ error: `[${step.atual}] ${err.message}` });
  }
});

// GET /api/notificacoes/lembretes/historico — histórico de avisos enviados (dono/admin)
app.get('/api/notificacoes/lembretes/historico', auth, withTenant, allow('dono', 'admin'), async (req, res) => {
  try {
    const rows = await dbAll(`
      SELECT l.id, l.titulo, l.mensagem, l.regiao, l.nivel, l.criado_em,
             u.nome AS enviado_por,
             (SELECT COUNT(*) FROM notificacao_leituras nl WHERE nl.lembrete_id = l.id) AS total_leituras
      FROM notificacao_lembretes l
      LEFT JOIN usuarios u ON u.id::TEXT = l.criado_por
      WHERE l.tenant_id = $1
      ORDER BY l.criado_em DESC
      LIMIT 100
    `, [req.tenantId]);
    res.json(rows);
  } catch (err) {
    console.error('[GET /api/notificacoes/lembretes/historico]', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/notificacoes/lembretes/:id/lido — marca como lido para este usuário
app.patch('/api/notificacoes/lembretes/:id/lido', auth, withTenant, async (req, res) => {
  try {
    await pool.query(`
      INSERT INTO notificacao_leituras (lembrete_id, usuario_id, lido_em)
      VALUES ($1, $2, NOW())
      ON CONFLICT (lembrete_id, usuario_id) DO NOTHING
    `, [parseInt(req.params.id, 10), String(req.user.id)]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /api/notificacoes/lembretes/:id/lido]', err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════

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
    await pool.query(`ALTER TABLE tenant_candidatos ADD COLUMN IF NOT EXISTS cor_mapa TEXT DEFAULT '#cb181d'`);
    console.log('[migration] tenant_candidatos.cor_mapa OK');
  } catch (e) {
    console.warn('[migration] tenant_candidatos.cor_mapa:', e.message);
  }
  try {
    await pool.query(`ALTER TABLE tenant_mapas ADD COLUMN IF NOT EXISTS visivel BOOLEAN DEFAULT TRUE`);
    console.log('[migration] tenant_mapas.visivel OK');
  } catch (e) {
    console.warn('[migration] tenant_mapas.visivel:', e.message);
  }
  try {
    await pool.query(`ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS home_cards_config JSONB DEFAULT '{}'`);
    console.log('[migration] tenant_config.home_cards_config OK');
  } catch (e) {
    console.warn('[migration] tenant_config.home_cards_config:', e.message);
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

  // ── AGENDA INTELIGENTE ────────────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agenda_eventos (
        id           SERIAL PRIMARY KEY,
        tenant_id    INTEGER NOT NULL,
        titulo       TEXT NOT NULL,
        descricao    TEXT,
        tipo         TEXT NOT NULL DEFAULT 'reuniao',
        -- tipos: reuniao | visita | atendimento | evento_politico | ligacao | tarefa
        status       TEXT NOT NULL DEFAULT 'pendente',
        -- status: pendente | concluido | cancelado
        prioridade   INTEGER NOT NULL DEFAULT 2,
        -- 1=alta 2=media 3=baixa
        data_inicio  TIMESTAMPTZ NOT NULL,
        data_fim     TIMESTAMPTZ,
        regiao       TEXT,
        cidade       TEXT,
        pessoa_id    INTEGER REFERENCES pessoas(id) ON DELETE SET NULL,
        criado_por   TEXT,    -- UUID do usuario que criou
        -- metadados extras (lat/lng, link, notas)
        meta         JSONB NOT NULL DEFAULT '{}',
        -- se veio de sugestão automática
        sugestao_origem TEXT,
        criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_agenda_eventos_tenant    ON agenda_eventos(tenant_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_agenda_eventos_data       ON agenda_eventos(tenant_id, data_inicio)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_agenda_eventos_regiao     ON agenda_eventos(tenant_id, regiao)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_agenda_eventos_pessoa     ON agenda_eventos(pessoa_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_agenda_eventos_status     ON agenda_eventos(tenant_id, status)`);
    // Integração pins × agenda
    await pool.query(`ALTER TABLE agenda_eventos ADD COLUMN IF NOT EXISTS pin_id INTEGER REFERENCES pins(id) ON DELETE SET NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_agenda_eventos_pin ON agenda_eventos(pin_id)`);
    console.log('[migration] agenda_eventos OK');
  } catch (e) {
    console.warn('[migration] agenda_eventos:', e.message);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agenda_recorrencias (
        id           SERIAL PRIMARY KEY,
        tenant_id    INTEGER NOT NULL,
        evento_id    INTEGER NOT NULL REFERENCES agenda_eventos(id) ON DELETE CASCADE,
        frequencia   TEXT NOT NULL,
        -- diaria | semanal | quinzenal | mensal
        dia_semana   INTEGER[],
        -- 0=dom … 6=sab (para semanal)
        proximo_em   TIMESTAMPTZ NOT NULL,
        ativa        BOOLEAN NOT NULL DEFAULT TRUE,
        criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_agenda_rec_tenant ON agenda_recorrencias(tenant_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_agenda_rec_proximo ON agenda_recorrencias(proximo_em) WHERE ativa = TRUE`);
    console.log('[migration] agenda_recorrencias OK');
  } catch (e) {
    console.warn('[migration] agenda_recorrencias:', e.message);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agenda_sugestoes (
        id           SERIAL PRIMARY KEY,
        tenant_id    INTEGER NOT NULL,
        tipo         TEXT NOT NULL,
        -- regiao_inativa | lider_inativo | cidade_prioritaria | followup | marco_eleitoral
        titulo       TEXT NOT NULL,
        descricao    TEXT,
        score        INTEGER NOT NULL DEFAULT 50,
        -- 0-100: quanto maior mais urgente
        regiao       TEXT,
        cidade       TEXT,
        pessoa_id    INTEGER REFERENCES pessoas(id) ON DELETE CASCADE,
        aceita       BOOLEAN,
        -- NULL=pendente TRUE=aceita FALSE=ignorada
        aceita_em    TIMESTAMPTZ,
        evento_gerado INTEGER REFERENCES agenda_eventos(id) ON DELETE SET NULL,
        gerada_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expira_em    TIMESTAMPTZ
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_agenda_sug_tenant  ON agenda_sugestoes(tenant_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_agenda_sug_score   ON agenda_sugestoes(tenant_id, score DESC) WHERE aceita IS NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_agenda_sug_regiao  ON agenda_sugestoes(tenant_id, regiao)`);
    console.log('[migration] agenda_sugestoes OK');
  } catch (e) {
    console.warn('[migration] agenda_sugestoes:', e.message);
  }

  // ── COLUNA origem EM liderancas ───────────────────────────────────────────
  try {
    await pool.query(`ALTER TABLE liderancas ADD COLUMN IF NOT EXISTS foto_url TEXT`);
    console.log('[migration] liderancas.foto_url OK');
  } catch (e) {
    console.warn('[migration] liderancas.foto_url:', e.message);
  }
  try {
    await pool.query(`ALTER TABLE liderancas ADD COLUMN IF NOT EXISTS origem TEXT DEFAULT 'manual'`);
    console.log('[migration] liderancas.origem OK');
  } catch (e) {
    console.warn('[migration] liderancas.origem:', e.message);
  }

  // ── CAMPOS GEOGRÁFICOS EM liderancas ─────────────────────────────────────
  try {
    await pool.query(`ALTER TABLE liderancas ADD COLUMN IF NOT EXISTS cep    TEXT`);
    await pool.query(`ALTER TABLE liderancas ADD COLUMN IF NOT EXISTS bairro TEXT`);
    await pool.query(`ALTER TABLE liderancas ADD COLUMN IF NOT EXISTS lat    DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE liderancas ADD COLUMN IF NOT EXISTS lng    DOUBLE PRECISION`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_liderancas_geo ON liderancas(lat, lng) WHERE lat IS NOT NULL`);
    console.log('[migration] liderancas geo-fields OK');
  } catch (e) {
    console.warn('[migration] liderancas geo-fields:', e.message);
  }

  // ── CAMPOS BQ EM CANDIDATOS ───────────────────────────────────────────────
  try {
    await pool.query(`ALTER TABLE tenant_candidatos ADD COLUMN IF NOT EXISTS nome_urna_bq TEXT`);
    console.log('[migration] tenant_candidatos.nome_urna_bq OK');
  } catch (e) { console.warn('[migration] tenant_candidatos.nome_urna_bq:', e.message); }
  try {
    await pool.query(`ALTER TABLE tenant_candidatos ADD COLUMN IF NOT EXISTS ano_eleicao_bq INTEGER`);
    console.log('[migration] tenant_candidatos.ano_eleicao_bq OK');
  } catch (e) { console.warn('[migration] tenant_candidatos.ano_eleicao_bq:', e.message); }
  try {
    await pool.query(`ALTER TABLE tenant_candidatos ADD COLUMN IF NOT EXISTS cargo_bq TEXT`);
    console.log('[migration] tenant_candidatos.cargo_bq OK');
  } catch (e) { console.warn('[migration] tenant_candidatos.cargo_bq:', e.message); }

  // ── ORGANOGRAMA ──────────────────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS organograma (
        id         SERIAL PRIMARY KEY,
        tenant_id  INTEGER NOT NULL UNIQUE,
        dados      JSONB   NOT NULL DEFAULT '{}',
        card_size  INTEGER NOT NULL DEFAULT 200,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by TEXT
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_organograma_tenant ON organograma(tenant_id)`);
    // Migra coluna updated_by de INTEGER para TEXT caso já exista como INTEGER
    await pool.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'organograma'
            AND column_name = 'updated_by'
            AND data_type = 'integer'
        ) THEN
          ALTER TABLE organograma ALTER COLUMN updated_by TYPE TEXT USING updated_by::TEXT;
        END IF;
      END $$;
    `);
    console.log('[migration] organograma OK');
  } catch (e) {
    console.warn('[migration] organograma:', e.message);
  }

  // ── PRESENÇA: coluna last_seen em usuarios ────────────────────────────────
  try {
    await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ`);
    console.log('[migration] usuarios.last_seen OK');
  } catch (e) {
    console.warn('[migration] usuarios.last_seen:', e.message);
  }

  // ── LOCALIZAÇÃO: colunas lat/lng em usuarios ──────────────────────────────
  try {
    await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ`);
    console.log('[migration] usuarios.location OK');
  } catch (e) {
    console.warn('[migration] usuarios.location:', e.message);
  }

  // ── AUTO-CADASTRO TOKENS ──────────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cadastro_tokens (
        id          SERIAL PRIMARY KEY,
        token       TEXT NOT NULL UNIQUE,
        tenant_id   INTEGER NOT NULL,
        regiao      TEXT,
        cidade      TEXT,
        used_at     TIMESTAMPTZ,
        expires_at  TIMESTAMPTZ NOT NULL,
        created_by  TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_cadastro_tokens_tenant ON cadastro_tokens(tenant_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_cadastro_tokens_token  ON cadastro_tokens(token)`);
    console.log('[migration] cadastro_tokens OK');
  } catch (e) {
    console.warn('[migration] cadastro_tokens:', e.message);
  }

  // ── MÓDULO DE AVISOS / NOTIFICAÇÕES ──────────────────────────────────────
  // ── MÓDULO DE AVISOS / NOTIFICAÇÕES ──────────────────────────────────────
  // Usa TEXT para IDs de usuário — compatível com SERIAL, BIGSERIAL e UUID
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notificacao_tokens (
        id            SERIAL PRIMARY KEY,
        tenant_id     INTEGER NOT NULL,
        usuario_id    TEXT NOT NULL,
        token         TEXT NOT NULL,
        plataforma    TEXT DEFAULT 'unknown',
        atualizado_em TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (tenant_id, usuario_id, token)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_notif_tokens_tenant ON notificacao_tokens(tenant_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_notif_tokens_user   ON notificacao_tokens(usuario_id)`);
    // Se a tabela já existia com usuario_id INTEGER, converte para TEXT
    await pool.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'notificacao_tokens'
            AND column_name = 'usuario_id'
            AND data_type = 'integer'
        ) THEN
          ALTER TABLE notificacao_tokens ALTER COLUMN usuario_id TYPE TEXT USING usuario_id::TEXT;
        END IF;
      END $$
    `);
    console.log('[migration] notificacao_tokens OK');
  } catch (e) {
    console.warn('[migration] notificacao_tokens:', e.message);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notificacao_lembretes (
        id          SERIAL PRIMARY KEY,
        tenant_id   INTEGER NOT NULL,
        criado_por  TEXT,
        titulo      TEXT NOT NULL,
        mensagem    TEXT NOT NULL,
        regiao      TEXT,
        nivel       TEXT,
        criado_em   TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_notif_lembretes_tenant ON notificacao_lembretes(tenant_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_notif_lembretes_criado ON notificacao_lembretes(tenant_id, criado_em DESC)`);
    // Se a tabela já existia com criado_por INTEGER, converte para TEXT
    await pool.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'notificacao_lembretes'
            AND column_name = 'criado_por'
            AND data_type = 'integer'
        ) THEN
          ALTER TABLE notificacao_lembretes ALTER COLUMN criado_por TYPE TEXT USING criado_por::TEXT;
        END IF;
      END $$
    `);
    console.log('[migration] notificacao_lembretes OK');
  } catch (e) {
    console.warn('[migration] notificacao_lembretes:', e.message);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notificacao_leituras (
        lembrete_id  INTEGER NOT NULL REFERENCES notificacao_lembretes(id) ON DELETE CASCADE,
        usuario_id   TEXT NOT NULL,
        lido_em      TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (lembrete_id, usuario_id)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_notif_leituras_user ON notificacao_leituras(usuario_id)`);
    // Se a tabela já existia com usuario_id INTEGER, converte para TEXT
    await pool.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'notificacao_leituras'
            AND column_name = 'usuario_id'
            AND data_type = 'integer'
        ) THEN
          ALTER TABLE notificacao_leituras ALTER COLUMN usuario_id TYPE TEXT USING usuario_id::TEXT;
        END IF;
      END $$
    `);
    console.log('[migration] notificacao_leituras OK');
  } catch (e) {
    console.warn('[migration] notificacao_leituras:', e.message);
  }
});