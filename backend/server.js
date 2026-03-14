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
const sharp = require('sharp');
const helmet = require('helmet');

function allow(...niveisPermitidos) {
  return (req, res, next) => {
    if (!req.user || !niveisPermitidos.includes(req.user.nivel)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    next();
  };
}

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
        connectSrc: ["'self'", "https://kalebemattos.github.io", "https://*.supabase.co"],
      }
    },
    hsts: {
      maxAge: 31536000,        // 1 ano em segundos
      includeSubDomains: true,
      preload: true
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

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
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

pool.query('select current_database()')
  .then(r => console.log('✅ Banco conectado:', r.rows[0]))
  .catch(e => console.error('❌ DB ERR:', e.message));

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
];

app.use(cors({
  origin: function (origin, callback) {
    if (allowedOrigins.includes(origin)) {
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
  max: 20,                   // 20 tentativas por IP
  message: { error: 'Muitas tentativas de refresh. Tente novamente mais tarde.' },
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
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de arquivo não permitido. Envie apenas imagens (JPEG, PNG, WEBP).'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB máximo
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

/* ================= LOGIN ================= */
app.post('/api/login', loginLimiter, async (req, res) => {
  const { usuario, senha } = req.body;

  if (!usuario || !senha) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }

  if (typeof usuario !== 'string' || usuario.length > 60) {
    return res.status(400).json({ error: 'Dados inválidos' });
  }

  if (typeof senha !== 'string' || senha.length > 128) {
    return res.status(400).json({ error: 'Dados inválidos' });
  }

  try {
    // Procure por: SELECT id, usuario, senha_hash, nome FROM usuarios...
// E troque por:
const user = await dbGet(
  'SELECT id, usuario, senha_hash, nome, nivel, regiao_vinculada FROM usuarios WHERE usuario = $1',
  [usuario]
);

    // Hash fictício garante tempo de resposta constante mesmo quando usuário não existe
    // — impede enumeração de usuários por timing attack
    const HASH_FAKE = '$2b$10$invalido.hash.para.timing.proteção.xxxxxxxxxxx';
    const hashParaComparar = user ? user.senha_hash : HASH_FAKE;
    const ok = await bcrypt.compare(senha, hashParaComparar);

    if (!user || !ok) {
      // Log de tentativa falha (sem revelar qual campo falhou)
      console.warn(`[LOGIN FALHA] usuario="${usuario}" ip="${req.ip}" ts="${new Date().toISOString()}"`);
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

  delete user.senha_hash;

  // Log de login bem-sucedido
  console.log(`[LOGIN OK] usuario="${usuario}" nivel="${user.nivel}" ip="${req.ip}" ts="${new Date().toISOString()}"`);
  try { await registrarAuditoria(user.id, 'LOGIN', 'usuario', user.id); } catch {}



const accessToken = jwt.sign(
  {
    id: user.id,
    nivel: user.nivel,
    regiao: user.regiao_vinculada
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
  `INSERT INTO refresh_tokens (usuario_id, token, expira_em)
   VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
  [user.id, refreshToken]
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

    const row = await dbGet(
      'SELECT * FROM refresh_tokens WHERE token = $1 AND usuario_id = $2',
      [refreshToken, decoded.id]
    );

    if (!row) {
      return res.status(403).json({ error: 'Refresh inválido' });
    }

    const user = await dbGet(
  'SELECT nivel, regiao_vinculada FROM usuarios WHERE id = $1',
  [decoded.id]
);
if (!user) {
  return res.status(403).json({ error: 'Usuário não encontrado' });
}

const novoAccessToken = jwt.sign(
  {
    id: decoded.id,
    nivel: user.nivel,
    regiao: user.regiao_vinculada
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
app.post('/api/expectativa-cidade', auth, async (req, res) => {
  const { cidade, celia, fernando } = req.body;

if (!cidade) {
  return res.status(400).json({ error: 'Cidade não informada' });
}

const celiaValor = Number(celia || 0);
const fernandoValor = Number(fernando || 0);

await pool.query(
`
INSERT INTO expectativa_cidade
(cidade, expectativa_celia, expectativa_fernando, regiao)
VALUES ($1,$2,$3,$4)
ON CONFLICT (cidade, regiao)
DO UPDATE SET
expectativa_celia = excluded.expectativa_celia,
expectativa_fernando = excluded.expectativa_fernando
`,
[
cidade,
celiaValor,
fernandoValor,
req.user.regiao
]
);

res.json({ ok: true });

});


app.get('/api/expectativa-cidade', auth,
 async (req, res) => {

  const { cidade } = req.query;

  if (!cidade) {
    return res.status(400).json({ error: 'Cidade não informada' });
  }

  let query;
  let params;

  if (req.user.nivel === 'dono') {
    query = 'SELECT expectativa_celia, expectativa_fernando FROM expectativa_cidade WHERE cidade = $1';
    params = [cidade];
  } else {
    query = 'SELECT expectativa_celia, expectativa_fernando FROM expectativa_cidade WHERE cidade = $1 AND LOWER(regiao) = LOWER($2)';
    params = [cidade, req.user.regiao];
  }

  const row = await dbGet(query, params);

  res.json({
  celia: row?.expectativa_celia || 0,
  fernando: row?.expectativa_fernando || 0
});
});

/* ================= GASTOS POR LIDERANÇA ================= */
app.post('/api/gastos',
  auth,
  allow('admin', 'dono', 'lider_regiao'),
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

    // 🔎 1️⃣ Verifica se a liderança existe
    const lideranca = await dbGet(
      'SELECT regiao FROM liderancas WHERE id = $1',
      [lideranca_id]
    );

    if (!lideranca) {
      return res.status(404).json({ error: 'Liderança não encontrada' });
    }

    // 🔒 2️⃣ Validação de multi-tenant
    if (
      req.user.nivel !== 'dono' &&
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


app.get('/api/gastos/:lideranca_id', auth, async (req, res) => {
  try {

    let query;
    let params;

    if (req.user.nivel === 'dono') {
      query = `
        SELECT g.*
        FROM gastos_lideranca g
        JOIN liderancas l ON g.lideranca_id = l.id
        WHERE g.lideranca_id = $1
        ORDER BY g.id DESC
      `;
      params = [req.params.lideranca_id];
    } else {
      query = `
        SELECT g.*
        FROM gastos_lideranca g
        JOIN liderancas l ON g.lideranca_id = l.id
        WHERE g.lideranca_id = $1
        AND l.regiao = $2
        ORDER BY g.id DESC
      `;
      params = [req.params.lideranca_id, req.user.regiao];
    }

    const rows = await pool.query(query, params);

    res.json(rows.rows);

  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar gastos' });
  }
});


app.get('/api/gastos-total/:lideranca_id', auth, async (req, res) => {
  try {

    let query;
    let params;

    if (req.user.nivel === 'dono') {
      query = `
        SELECT SUM(g.valor) as total
        FROM gastos_lideranca g
        JOIN liderancas l ON g.lideranca_id = l.id
        WHERE g.lideranca_id = $1
      `;
      params = [req.params.lideranca_id];
    } else {
      query = `
        SELECT SUM(g.valor) as total
        FROM gastos_lideranca g
        JOIN liderancas l ON g.lideranca_id = l.id
        WHERE g.lideranca_id = $1
        AND l.regiao = $2
      `;
      params = [req.params.lideranca_id, req.user.regiao];
    }

    const row = await dbGet(query, params);

    res.json({ total: row?.total || 0 });

  } catch (err) {
    res.status(500).json({ error: 'Erro ao calcular total' });
  }
});


/* ================= CRIAR LIDERANÇA ================= */
app.post('/api/liderancas',
  createLiderancaLimiter,
  auth,
  allow('admin', 'dono', 'lider_regiao'),
  upload.single('foto'),
  async (req, res) => {

  try {
    const {
 nome,
 contato,
 cidade,
 expectativa_votos,
 perfil,
 responsavel,
 status,
 release,
 vinculo_politico,
 regiao: regiaoBody,
 data_nascimento,
 mapa
} = req.body;
    if (!validarTexto(cidade, 120)) {
  return res.status(400).json({ error: 'Cidade inválida' });
}

if (!validarTexto(nome, 120)) {
  return res.status(400).json({ error: 'Nome inválido' });
}

if (contato && !validarTexto(contato, 120)) {
  return res.status(400).json({ error: 'Contato inválido' });
}

if (expectativa_votos && !validarNumero(expectativa_votos, 0, 1000000)) {
  return res.status(400).json({ error: 'Expectativa inválida' });
}

    const votos = Number(expectativa_votos) || 0;
    
    // --- LÓGICA SUPABASE STORAGE ---
    let foto = null;
    
      if (req.file) {

  const caminhoOtimizado = await otimizarImagem(req.file.path);

  const fileBuffer = fs.readFileSync(caminhoOtimizado);
  const fileName = `${Date.now()}.webp`;

  const { error } = await supabase.storage
    .from('liderancas')
    .upload(fileName, fileBuffer, {
      contentType: 'image/webp',
      upsert: false
    });

  if (error) throw error;

  const { data } = supabase.storage
    .from('liderancas')
    .getPublicUrl(fileName);

  foto = data.publicUrl;

  try {
    fs.unlinkSync(caminhoOtimizado);
  } catch (err) {
    console.error('Erro ao remover arquivo local:', err);
  }
}

    // -------------------------------

    if (!cidade || !nome) {
      return res.status(400).json({ error: 'Cidade e nome são obrigatórios' });
    }

    await pool.query(
  `
  INSERT INTO liderancas
(cidade, nome, contato, foto, expectativa_votos, perfil, responsavel, status, release, regiao, vinculo_politico, data_nascimento, mapa)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
  `,
  [
  cidade,
  nome,
  contato,
  foto,
  votos,
  perfil || null,
  responsavel || null,
  status || 'ativa',
  release || null,
  regiaoBody || req.user.regiao,
  vinculo_politico || 'fernando',
  data_nascimento || null,
  req.body.mapa || null
]
);
// 🔐 REGISTRA AUDITORIA AQUI
await registrarAuditoria(
  req.user.id,
  'CRIAR',
  'lideranca',
  null
);
    res.json({ success: true });

  } catch (err) {
    console.error('Erro ao salvar liderança:', err);
    res.status(500).json({ error: 'Erro ao salvar liderança' });
  }
});

/* ================= EXCLUIR LIDERANÇA ================= */
app.delete('/api/liderancas/:id',
  auth,
  allow('admin', 'dono', 'lider_regiao'),
  async (req, res) => {

  try {
    const { id } = req.params;

    let result;

    if (req.user.nivel === 'dono') {
      result = await pool.query(
        'DELETE FROM liderancas WHERE id = $1',
        [id]
      );
    } else if (req.user.nivel === 'admin') {
      // admin pode deletar qualquer liderança (escopo global intencional)
      result = await pool.query(
        'DELETE FROM liderancas WHERE id = $1',
        [id]
      );
    } else {
      // lider_regiao só deleta da própria região
      result = await pool.query(
        'DELETE FROM liderancas WHERE id = $1 AND regiao = $2',
        [id, req.user.regiao]
      );
    }

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Não encontrado' });
    }
// 🔐 REGISTRA AUDITORIA AQUI
await registrarAuditoria(
  req.user.id,
  'EXCLUIR',
  'lideranca',
  id
);
    res.json({ ok: true });

  } catch (err) {
    console.error('Erro ao excluir liderança:', err);
    res.status(500).json({ error: 'Erro ao excluir liderança' });
  }
});

/* ================= EDITAR LIDERANÇA ================= */
app.put('/api/liderancas/:id',
  auth,
  allow('admin', 'dono', 'lider_regiao'),
  upload.single('foto'),
  async (req, res) => {

  try {
    const { id } = req.params;
    const {
 nome,
 contato,
 cidade,
 expectativa_votos,
 perfil,
 responsavel,
 status,
 release,
 vinculo_politico,
 regiao: regiaoBody,
 data_nascimento,
 mapa
} = req.body;
    // 🔐 ===== VALIDAÇÃO =====

if (!validarTexto(cidade, 120)) {
  return res.status(400).json({ error: 'Cidade inválida' });
}

if (!validarTexto(nome, 120)) {
  return res.status(400).json({ error: 'Nome inválido' });
}

if (contato && !validarTexto(contato, 120)) {
  return res.status(400).json({ error: 'Contato inválido' });
}

if (expectativa_votos && !validarNumero(expectativa_votos, 0, 1000000)) {
  return res.status(400).json({ error: 'Expectativa inválida' });
}

    if (!cidade || !nome) {
  return res.status(400).json({
    error: 'Cidade e nome são obrigatórios'
  });
}

    const votos = Number(expectativa_votos) || 0;

    const atual = await dbGet(
      'SELECT * FROM liderancas WHERE id = $1',
      [id]
    );
if (!atual) {
  return res.status(404).json({ error: 'Liderança não encontrada' });
}

if (
  req.user.nivel !== 'dono' &&
  req.user.nivel !== 'admin' &&
  atual.regiao !== req.user.regiao
) {
  return res.status(403).json({ error: 'Acesso negado' });
}
    // --- LÓGICA SUPABASE STORAGE ---
    let foto = atual.foto; 
    if (req.file) {

  // 🔹 1. Otimiza imagem antes de enviar
  const caminhoOtimizado = await otimizarImagem(req.file.path);

  const fileBuffer = fs.readFileSync(caminhoOtimizado);
  const fileName = `${Date.now()}.webp`;

  const { error } = await supabase.storage
    .from('liderancas')
    .upload(fileName, fileBuffer, {
      contentType: 'image/webp',
      upsert: false
    });

  if (error) throw error;

  const { data } = supabase.storage
    .from('liderancas')
    .getPublicUrl(fileName);

  foto = data.publicUrl;

  // 🧹 Remove arquivo local
  try {
    fs.unlinkSync(caminhoOtimizado);
  } catch (err) {
    console.error('Erro ao remover arquivo local:', err);
  }
}

    // -------------------------------

    const result = await pool.query(
  `
  UPDATE liderancas
SET
nome=$1,
contato=$2,
expectativa_votos=$3,
perfil=$4,
responsavel=$5,
status=$6,
release=$7,
foto=$8,
cidade=$9,
vinculo_politico=$10,
regiao=COALESCE($12, regiao),
data_nascimento=$13
WHERE id=$11 AND (LOWER(regiao)=LOWER($12) OR $14='dono' OR $14='admin')
  `,
  [
  nome,
  contato,
  votos,
  perfil || null,
  responsavel || null,
  status || 'ativa',
  release || null,
  foto,
  cidade,
  vinculo_politico || 'fernando',
  id,
  regiaoBody || req.user.regiao,
  data_nascimento || null,
  req.user.nivel
]
);
if (result.rowCount === 0) {
  return res.status(404).json({ error: 'Não encontrado ou sem permissão' });
}

// 🔐 REGISTRA AUDITORIA AQUI
await registrarAuditoria(
  req.user.id,
  'EDITAR',
  'lideranca',
  id
);
    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao editar liderança' });
  }
});

/* ================= BUSCAR LIDERANÇAS ================= */
app.get('/api/liderancas', auth, async (req, res) => {
  try {

    let query;
    let params = [];

    const mapaFiltro = req.query.mapa || null;
    if (mapaFiltro) {
      query = `SELECT cidade, json_agg(l.*) AS liderancas FROM liderancas l WHERE mapa = $1 GROUP BY cidade`;
      params = [mapaFiltro];
    } else {
      query = `SELECT cidade, json_agg(l.*) AS liderancas FROM liderancas l GROUP BY cidade`;
    }

    const result = await pool.query(query, params);
    res.json(result.rows);

  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar lideranças' });
  }
});


/* ================= BUSCAR OBSERVAÇÕES ================= */
app.get('/api/observacoes', auth, async (req, res) => {
  try {

    let query;
    let params = [];

    query = `
SELECT cidade, json_agg(o.*) AS observacoes
FROM observacoes o
GROUP BY cidade
`;

    const result = await pool.query(query, params);
    res.json(result.rows);

  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar observações' });
  }
});


app.post('/api/observacoes',
  auth,
  allow('admin', 'dono', 'lider_regiao'),
  async (req, res) => {
  try {
    const { cidade, text } = req.body;
    if (!cidade || !text) return res.status(400).json({ error: 'Dados incompletos' });

    await pool.query(
  'INSERT INTO observacoes (cidade, text, regiao) VALUES ($1, $2, $3)',
  [cidade, text, req.user.regiao]
);
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao salvar observação:', err);
    res.status(500).json({ error: 'Erro ao salvar observação' });
  }
});

app.delete('/api/observacoes/:id',
  auth,
  allow('admin', 'dono', 'lider_regiao'),
  async (req, res) => {
  try {
    const { id } = req.params;
    let result;

if (req.user.nivel === 'dono') {
  result = await pool.query(
    'DELETE FROM observacoes WHERE id = $1',
    [id]
  );
} else {
  result = await pool.query(
    'DELETE FROM observacoes WHERE id = $1 AND regiao = $2',
    [id, req.user.regiao]
  );
}

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
app.get('/api/data', auth, async (req, res) => {
  try {

    let liderancasQuery;
    let observacoesQuery;
    let params = [];

    if (req.user.nivel === 'dono') {
      liderancasQuery = 'SELECT * FROM liderancas';
      observacoesQuery = 'SELECT * FROM observacoes';
    } else {
      liderancasQuery = 'SELECT * FROM liderancas WHERE LOWER(regiao) = LOWER($1)';
      observacoesQuery = 'SELECT * FROM observacoes WHERE LOWER(regiao) = LOWER($1)';
      params = [req.user.regiao];
    }

    const liderancas = await pool.query(liderancasQuery, params);
    const observacoes = await pool.query(observacoesQuery, params);

    res.json({
      liderancas: liderancas.rows,
      observacoes: observacoes.rows
    });

  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar dados' });
  }
});


app.get('/api/expectativa-cidade-todas', auth, async (req, res) => {

  let query;
  let params = [];

  query = `
SELECT
cidade,
expectativa_celia,
expectativa_fernando
FROM expectativa_cidade
`;

  const rows = await dbAll(query, params);
  res.json(rows);
});




// ─── EXPECTATIVA ANGRA (isolada por mapa='angra') ───────────────────────────

app.post('/api/expectativa-angra', auth, async (req, res) => {
  const { cidade, celia, fernando } = req.body;
  if (!cidade) return res.status(400).json({ error: 'Cidade não informada' });

  const celiaValor    = Number(celia    || 0);
  const fernandoValor = Number(fernando || 0);

  await pool.query(
    `INSERT INTO expectativa_cidade (cidade, expectativa_celia, expectativa_fernando, regiao, mapa)
     VALUES ($1,$2,$3,$4,'angra')
     ON CONFLICT (cidade, regiao, mapa)
     DO UPDATE SET expectativa_celia = excluded.expectativa_celia,
                   expectativa_fernando = excluded.expectativa_fernando`,
    [cidade, celiaValor, fernandoValor, req.user.regiao || 'angra']
  );

  res.json({ ok: true });
});

app.get('/api/expectativa-angra', auth, async (req, res) => {
  const { cidade } = req.query;
  if (!cidade) return res.status(400).json({ error: 'Cidade não informada' });

  const row = await dbGet(
    `SELECT expectativa_celia, expectativa_fernando FROM expectativa_cidade
     WHERE cidade = $1 AND mapa = 'angra'`,
    [cidade]
  );

  res.json({ celia: row?.expectativa_celia || 0, fernando: row?.expectativa_fernando || 0 });
});

app.get('/api/expectativa-angra-todas', auth, async (req, res) => {
  const rows = await dbAll(
    `SELECT cidade, expectativa_celia, expectativa_fernando
     FROM expectativa_cidade WHERE mapa = 'angra'`,
    []
  );
  res.json(rows);
});



// ─── EXPECTATIVA RJ CAPITAL (isolada por mapa='rjcapital') ──────────────────

app.post('/api/expectativa-rjcapital', auth, async (req, res) => {
  const { cidade, celia, fernando } = req.body;
  if (!cidade) return res.status(400).json({ error: 'Cidade não informada' });

  const celiaValor    = Number(celia    || 0);
  const fernandoValor = Number(fernando || 0);

  await pool.query(
    `INSERT INTO expectativa_cidade (cidade, expectativa_celia, expectativa_fernando, regiao, mapa)
     VALUES ($1,$2,$3,$4,'rjcapital')
     ON CONFLICT (cidade, regiao, mapa)
     DO UPDATE SET expectativa_celia = excluded.expectativa_celia,
                   expectativa_fernando = excluded.expectativa_fernando`,
    [cidade, celiaValor, fernandoValor, req.user.regiao || 'rjcapital']
  );

  res.json({ ok: true });
});

app.get('/api/expectativa-rjcapital', auth, async (req, res) => {
  const { cidade } = req.query;
  if (!cidade) return res.status(400).json({ error: 'Cidade não informada' });

  const row = await dbGet(
    `SELECT expectativa_celia, expectativa_fernando FROM expectativa_cidade
     WHERE cidade = $1 AND mapa = 'rjcapital'`,
    [cidade]
  );

  res.json({ celia: row?.expectativa_celia || 0, fernando: row?.expectativa_fernando || 0 });
});

app.get('/api/expectativa-rjcapital-todas', auth, async (req, res) => {
  const rows = await dbAll(
    `SELECT cidade, expectativa_celia, expectativa_fernando
     FROM expectativa_cidade WHERE mapa = 'rjcapital'`,
    []
  );
  res.json(rows);
});

app.post('/api/pins',
  auth,
  allow('admin', 'dono', 'lider_regiao'),
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
    INSERT INTO pins (cidade, tipo, lat, lng, descricao, regiao)
    VALUES ($1,$2,$3,$4,$5,$6)
    `,
    [cidade, tipo, Number(lat), Number(lng), descricao || null, req.user.regiao]
  );

  res.json({ ok: true });
});


app.get('/api/pins', auth, async (req, res) => {
  try {

    let query;
    let params = [];

    query = `
SELECT * FROM pins
`;

    const r = await pool.query(query, params);
    res.json(r.rows);

  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar pins' });
  }
});


app.delete('/api/pins/:id',
  auth,
  allow('admin', 'dono', 'lider_regiao'),
  async (req, res) => {
  const id = req.params.id;

let result;

if (req.user.nivel === 'dono') {
  result = await pool.query(
    'DELETE FROM pins WHERE id = $1',
    [id]
  );
} else {
  result = await pool.query(
    'DELETE FROM pins WHERE id = $1 AND regiao = $2',
    [id, req.user.regiao]
  );
}

if (result.rowCount === 0) {
  return res.status(404).json({ error: 'Não encontrado' });
}

res.json({ ok: true });

});

app.put('/api/pins/:id',
  auth,
  allow('admin', 'dono', 'lider_regiao'),
  async (req, res) => {

  const { id } = req.params;
  const { descricao, tipo } = req.body;

  try {

    let result;

    if (req.user.nivel === 'dono') {
      result = await pool.query(
        `
        UPDATE pins
        SET
          descricao = COALESCE($1, descricao),
          tipo = COALESCE($2, tipo)
        WHERE id = $3
        `,
        [descricao, tipo, id]
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
        `,
        [descricao, tipo, id, req.user.regiao]
      );
    }

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Pin não encontrado' });
    }

    res.json({ ok: true });

  } catch (err) {
    console.error('Erro ao atualizar pin:', err);
    res.status(500).json({ error: 'Erro ao atualizar pin' });
  }

});

// Rota para o Dono criar novos usuários
app.post('/api/usuarios',
  createUserLimiter,
  auth,
  allow('dono'),
  async (req, res) => {

  try {
    const { usuario, senha, nome, nivel, regiao_vinculada } = req.body;
    // 🔎 Validação básica
if (!usuario || !senha || !nivel) {
  return res.status(400).json({
    error: 'Usuario, senha e nivel são obrigatórios'
  });
}
if (!/^[a-zA-Z0-9._-]{1,60}$/.test(usuario)) {
  return res.status(400).json({
    error: 'Login inválido. Use apenas letras, números, . _ - (máx. 60 caracteres).'
  });
}
if (nivel === 'lider_regiao' && !regiao_vinculada) {
  return res.status(400).json({
    error: 'Região vinculada é obrigatória para Líder de Região'
  });
}
const niveisPermitidos = ['dono', 'admin', 'visualizador', 'lider_regiao'];

if (!niveisPermitidos.includes(nivel)) {
  return res.status(400).json({
    error: 'Nivel inválido'
  });
}

if (!/(?=.*[A-Z])(?=.*[0-9]).{8,}/.test(senha)) {
  return res.status(400).json({
    error: 'Senha fraca. Use pelo menos 8 caracteres, uma letra maiúscula e um número.'
  });
}

    
    // Verifica se o usuário já existe
    const existe = await dbGet('SELECT id FROM usuarios WHERE usuario = $1', [usuario]);
    if (existe) {
      return res.status(400).json({ error: 'Este login já está em uso.' });
    }

    // Cria a senha protegida (hash)
    const saltRounds = 10;
    const hash = await bcrypt.hash(senha, saltRounds);

    // Salva no banco de dados
    await pool.query(
      'INSERT INTO usuarios (usuario, senha_hash, nome, nivel, regiao_vinculada) VALUES ($1, $2, $3, $4, $5)',
      [usuario, hash, nome, nivel, regiao_vinculada]
    );

    const novoUser = await dbGet('SELECT id FROM usuarios WHERE usuario = $1', [usuario]);
    try { await registrarAuditoria(req.user.id, 'CRIAR_USUARIO', 'usuario', novoUser?.id); } catch {}
    res.json({ ok: true, message: 'Usuário criado com sucesso!' });
  } catch (err) {
    console.error('Erro ao criar usuário:', err);
    res.status(500).json({ error: 'Erro interno ao criar usuário.' });
  }
});

// Rota para listar usuários (Para aparecer na sua tabela de gestão)
app.get('/api/usuarios',
  auth,
  allow('dono'),
  async (req, res) => {
  try {
    const users = await dbAll('SELECT id, usuario, nome, nivel, regiao_vinculada FROM usuarios');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar usuários.' });
  }
});


// Rota para editar usuário
app.put('/api/usuarios/:id', auth, allow('dono'), async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, nivel, regiao_vinculada, senha } = req.body;

    const niveisPermitidos = ['dono', 'admin', 'visualizador', 'lider_regiao'];
    if (nivel && !niveisPermitidos.includes(nivel)) {
      return res.status(400).json({ error: 'Nível inválido' });
    }

    // Não deixa o dono rebaixar a própria conta
    const meId = req.user.id;
    if (String(id) === String(meId) && nivel && nivel !== 'dono') {
      return res.status(400).json({ error: 'Você não pode alterar o seu próprio nível.' });
    }

    if (senha) {
      if (!/(?=.*[A-Z])(?=.*[0-9]).{8,}/.test(senha)) {
        return res.status(400).json({
          error: 'Senha fraca. Use pelo menos 8 caracteres, uma letra maiúscula e um número.'
        });
      }
      const hash = await require('bcrypt').hash(senha, 10);
      await pool.query(
        `UPDATE usuarios SET
           nome = COALESCE($1, nome),
           nivel = COALESCE($2, nivel),
           regiao_vinculada = $3,
           senha_hash = $4
         WHERE id = $5`,
        [nome || null, nivel || null, regiao_vinculada || null, hash, id]
      );
      // Invalida todas as sessões ativas do usuário ao trocar a senha
      await pool.query(
        'DELETE FROM refresh_tokens WHERE usuario_id = $1',
        [id]
      );
    } else {
      await pool.query(
        `UPDATE usuarios SET
           nome = COALESCE($1, nome),
           nivel = COALESCE($2, nivel),
           regiao_vinculada = $3
         WHERE id = $4`,
        [nome || null, nivel || null, regiao_vinculada || null, id]
      );
    }

    try { await registrarAuditoria(req.user.id, 'EDITAR_USUARIO', 'usuario', id); } catch {}
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao editar usuário:', err);
    res.status(500).json({ error: 'Erro interno ao editar usuário.' });
  }
});
// Rota para excluir usuário
app.delete('/api/usuarios/:id', auth, allow('dono'), async (req, res) => {

  try {
    const result = await pool.query(
  'DELETE FROM usuarios WHERE id = $1',
  [req.params.id]
);

if (result.rowCount === 0) {
  return res.status(404).json({ error: 'Usuário não encontrado' });
}

try { await registrarAuditoria(req.user.id, 'EXCLUIR_USUARIO', 'usuario', req.params.id); } catch {}
res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir usuário.' });
  }
});
/* ================= VALIDAR TOKEN ================= */
app.get('/api/validar-token', auth, async (req, res) => {
  try {
    res.json({
      ok: true,
      user: {
        id: req.user.id,
        nivel: req.user.nivel,
        regiao: req.user.regiao
      }
    });
  } catch (err) {
    res.status(401).json({ error: 'Token inválido' });
  }
});
/* ================= LÍDER DA REGIÃO ================= */
app.get('/api/lider-regiao/:regiao', auth, async (req, res) => {
  try {

    const { regiao } = req.params;

    let row;

    if (req.user.nivel === 'dono') {
      // Dono pode consultar qualquer região
      row = await dbGet(
        `SELECT id, nome, usuario, regiao_vinculada
         FROM usuarios
         WHERE nivel = 'lider_regiao'
         AND regiao_vinculada = $1
         LIMIT 1`,
        [regiao]
      );
    } else {
      // Outros só podem consultar a própria região
      if (req.user.regiao !== regiao) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      row = await dbGet(
        `SELECT id, nome, usuario, regiao_vinculada
         FROM usuarios
         WHERE nivel = 'lider_regiao'
         AND regiao_vinculada = $1
         LIMIT 1`,
        [regiao]
      );
    }

    if (!row) {
      return res.json(null);
    }

    res.json(row);

  } catch (err) {
    console.error('Erro ao buscar líder da região:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ================= LOGOUT ================= */
app.post('/api/logout', async (req, res) => {
  const { refreshToken } = req.body;

  if (refreshToken) {
    try {
      // Identifica usuário para auditoria antes de deletar
      const row = await dbGet(
        'SELECT usuario_id FROM refresh_tokens WHERE token = $1',
        [refreshToken]
      );
      await pool.query(
        'DELETE FROM refresh_tokens WHERE token = $1',
        [refreshToken]
      );
      if (row) {
        try { await registrarAuditoria(row.usuario_id, 'LOGOUT', 'usuario', row.usuario_id); } catch {}
      }
    } catch (err) {
      console.error('Erro ao revogar refresh token:', err.message);
    }
  }

  res.json({ ok: true });
});

/* ================= LOGOUT TOTAL (todos os dispositivos) ================= */
app.post('/api/logout-all', auth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM refresh_tokens WHERE usuario_id = $1',
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao revogar todos os tokens:', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ================= KEEP ALIVE (RENDER) ================= */
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

app.listen(PORT, () => {
  console.log(`✅ Backend rodando em http://localhost:${PORT}`);
});

// ── Limpeza de refresh tokens expirados (a cada 6h) ──────────
async function limparRefreshTokensExpirados() {
  try {
    const result = await pool.query(
      'DELETE FROM refresh_tokens WHERE expira_em < NOW()'
    );
    if (result.rowCount > 0) {
      console.log(`🧹 ${result.rowCount} refresh token(s) expirado(s) removido(s).`);
    }
  } catch (err) {
    console.error('Erro ao limpar refresh tokens:', err.message);
  }
}

limparRefreshTokensExpirados(); // roda na inicialização
setInterval(limparRefreshTokensExpirados, 6 * 60 * 60 * 1000); // a cada 6h