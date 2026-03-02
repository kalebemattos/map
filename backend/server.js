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
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
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
const upload = multer({ storage });
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

  try {
    // Procure por: SELECT id, usuario, senha_hash, nome FROM usuarios...
// E troque por:
const user = await dbGet(
  'SELECT id, usuario, senha_hash, nome, nivel, regiao_vinculada FROM usuarios WHERE usuario = $1',
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
app.post('/api/refresh', async (req, res) => {

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
  const { cidade, valor } = req.body;

  if (!cidade) {
    return res.status(400).json({ error: 'Cidade não informada' });
  }

  if (valor == null) {
  return res.status(400).json({ error: 'Valor não informado' });
}

const valorNumerico = Number(valor);

if (isNaN(valorNumerico)) {
  return res.status(400).json({ error: 'Valor inválido' });
}

await pool.query(
  `
  INSERT INTO expectativa_cidade (cidade, expectativa, regiao)
  VALUES ($1, $2, $3)
  ON CONFLICT (cidade, regiao)
  DO UPDATE SET expectativa = excluded.expectativa
  `,
  [cidade, valorNumerico, req.user.regiao]
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
    query = 'SELECT expectativa FROM expectativa_cidade WHERE cidade = $1';
    params = [cidade];
  } else {
    query = 'SELECT expectativa FROM expectativa_cidade WHERE cidade = $1 AND regiao = $2';
    params = [cidade, req.user.regiao];
  }

  const row = await dbGet(query, params);

  res.json({ valor: row?.expectativa || 0 });
});

/* ================= GASTOS POR LIDERANÇA ================= */
app.post('/api/gastos',
  auth,
  allow('admin', 'dono'),
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
  allow('admin', 'dono'),
  upload.single('foto'),
  async (req, res) => {

  try {
    const {
      cidade,
      nome,
      contato,
      expectativa_votos,
      perfil,
      responsavel,
      status,
      release
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
  (cidade, nome, contato, foto, expectativa_votos, perfil, responsavel, status, release, regiao)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
    req.user.regiao   // 🔥 AQUI
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
  allow('admin', 'dono'),
  async (req, res) => {

  try {
    const { id } = req.params;

    let result;

    if (req.user.nivel === 'dono') {
      result = await pool.query(
        'DELETE FROM liderancas WHERE id = $1',
        [id]
      );
    } else {
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
  allow('admin', 'dono'),
  upload.single('foto'),
  async (req, res) => {

  try {
    const { id } = req.params;
    const {
      cidade,
      nome,
      contato,
      expectativa_votos,
      perfil,
      responsavel,
      status,
      release
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
    cidade=$9
  WHERE id=$10 AND regiao=$11
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
    id,
    req.user.regiao   // 🔥 ESTE É O PARÂMETRO QUE FALTAVA
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

    if (req.user.nivel === 'dono') {
      query = `
        SELECT cidade, json_agg(l.*) AS liderancas
        FROM liderancas l
        GROUP BY cidade
      `;
    } else {
      query = `
        SELECT cidade, json_agg(l.*) AS liderancas
        FROM liderancas l
        WHERE l.regiao = $1
        GROUP BY cidade
      `;
      params = [req.user.regiao];
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

    if (req.user.nivel === 'dono') {
      query = `
        SELECT cidade, json_agg(o.*) AS observacoes
        FROM observacoes o
        GROUP BY cidade
      `;
    } else {
      query = `
        SELECT cidade, json_agg(o.*) AS observacoes
        FROM observacoes o
        WHERE o.regiao = $1
        GROUP BY cidade
      `;
      params = [req.user.regiao];
    }

    const result = await pool.query(query, params);
    res.json(result.rows);

  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar observações' });
  }
});


app.post('/api/observacoes',
  auth,
  allow('admin', 'dono'),
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
  allow('admin', 'dono'),
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
      liderancasQuery = 'SELECT * FROM liderancas WHERE regiao = $1';
      observacoesQuery = 'SELECT * FROM observacoes WHERE regiao = $1';
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

  if (req.user.nivel === 'dono') {
    query = 'SELECT cidade, expectativa FROM expectativa_cidade';
  } else {
    query = 'SELECT cidade, expectativa FROM expectativa_cidade WHERE regiao = $1';
    params = [req.user.regiao];
  }

  const rows = await dbAll(query, params);
  res.json(rows);
});


app.post('/api/pins',
  auth,
  allow('admin', 'dono'),
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

    if (req.user.nivel === 'dono') {
      query = 'SELECT * FROM pins';
    } else {
      query = 'SELECT * FROM pins WHERE regiao = $1';
      params = [req.user.regiao];
    }

    const r = await pool.query(query, params);
    res.json(r.rows);

  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar pins' });
  }
});


app.delete('/api/pins/:id',
  auth,
  allow('admin', 'dono'),
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
  allow('admin', 'dono'),
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
if (!usuario || !senha || !nivel || !regiao_vinculada) {
  return res.status(400).json({
    error: 'Usuario, senha, nivel e regiao_vinculada são obrigatórios'
  });
}
const niveisPermitidos = ['dono', 'admin', 'visualizador', 'lider_regiao'];

if (!niveisPermitidos.includes(nivel)) {
  return res.status(400).json({
    error: 'Nivel inválido'
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
/* ================= KEEP ALIVE (RENDER) ================= */
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

app.listen(PORT, () => {
  console.log(`✅ Backend rodando em http://localhost:${PORT}`);
});
