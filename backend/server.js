const { Pool } = require('pg');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 10000;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
async function dbAll(sql, params = []) {
  const r = await pool.query(sql, params);
  return r.rows;
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

/* ================= CONFIG ================= */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ================= PATHS ================= */
const UPLOAD_DIR = path.join(__dirname, 'uploads');

/* ================= GARANTIAS ================= */
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR);
}

/* ================= STATIC ================= */
app.use('/uploads', express.static(UPLOAD_DIR));

/* ================= UPLOAD ================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, name + ext);
  }
});
const upload = multer({ storage });

/* ================= LOGIN ================= */
app.post('/api/login', async (req, res) => {
  const { usuario, senha } = req.body;

  if (!usuario || !senha) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }

  

  const found = await dbGet(
    'SELECT * FROM users WHERE usuario = $1 AND senha = $2',
    [usuario, senha]
  );

  if (!found) {
    return res.status(401).json({ error: 'Usuário ou senha inválidos' });
  }

  const { senha: _, ...safe } = found;
  res.json(safe);
});

/* =====================================================
   EXPECTATIVA DA CIDADE
===================================================== */

// cria tabela se não existir

  
// salvar / atualizar expectativa da cidade
app.post('/api/expectativa-cidade', async (req, res) => {
  const { cidade, valor } = req.body;

  if (!cidade) {
    return res.status(400).json({ error: 'Cidade não informada' });
  }

  

  await dbRun(
    `
    INSERT INTO expectativa_cidade (cidade, expectativa)
    VALUES ($1, $2)
    ON CONFLICT(cidade)
    DO UPDATE SET expectativa = excluded.expectativa
    `,
    [cidade, Number(valor || 0)]
  );

  res.json({ success: true });
});

/* ================= BUSCAR DATA (MAPA + PAINEL) ================= */
app.get('/api/data', async (req, res) => {
  

  const liderancas = await dbAll('SELECT * FROM liderancas');
  const expectativas = await dbAll('SELECT * FROM expectativa_cidade');

  const data = {};

  // expectativas da cidade
  expectativas.forEach(row => {
    data[row.cidade] = {
      expectativaCidade: Number(row.expectativa || 0),
      liderancas: []
    };
  });

  // lideranças
  liderancas.forEach(row => {
    if (!data[row.cidade]) {
      data[row.cidade] = {
        expectativaCidade: 0,
        liderancas: []
      };
    }

    data[row.cidade].liderancas.push({
      id: row.id,
      nome: row.nome,
      contato: row.contato,
      foto: row.foto,
      expectativa_votos: Number(row.expectativa_votos || 0),
      createdAt: row.createdAt
    });
  });

  res.json(data);
});
// =======================
// GASTOS POR LIDERANÇA
// =======================

// adicionar gasto
app.post('/api/gastos', async (req, res) => {
  
  const { lideranca_id, valor, descricao, usuario } = req.body;
  const data = new Date().toISOString();

  await dbRun(
    'INSERT INTO gastos_lideranca (lideranca_id, valor, descricao, data, usuario) VALUES ($1, $2, $3, $4, $5)',
    [lideranca_id, valor, descricao, data, usuario]
  );

  res.json({ ok: true });
});

// listar gastos da liderança
app.get('/api/gastos/:lideranca_id', async (req, res) => {
  
  const rows = await dbAll(
    'SELECT * FROM gastos_lideranca WHERE lideranca_id = $1 ORDER BY id DESC',
    [req.params.lideranca_id]
  );
  res.json(rows);
});

// total gasto da liderança
app.get('/api/gastos-total/:lideranca_id', async (req, res) => {
  
  const row = await dbGet(
    'SELECT SUM(valor) as total FROM gastos_lideranca WHERE lideranca_id = $1',
    [req.params.lideranca_id]
  );
  res.json({ total: row.total || 0 });
});

/* ================= CRIAR LIDERANÇA ================= */
app.post('/api/liderancas', upload.single('foto'), async (req, res) => {
  try {
    const { cidade, nome, contato } = req.body;
    const expectativa_votos = Number(req.body.expectativa_votos) || 0;

    if (!cidade || !nome) {
      return res.status(400).json({ error: 'Cidade e nome são obrigatórios' });
    }

    const lideranca = {
      id: 'l_' + Date.now(),
      nome,
      contato: contato || '',
      foto: req.file
  ? `/uploads/${req.file.filename}`
  : null,
      createdAt: new Date().toISOString()
    };

    

    await dbRun(
      `
      INSERT INTO liderancas
      (id, cidade, nome, contato, foto, expectativa_votos, createdAt)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        lideranca.id,
        cidade,
        lideranca.nome,
        lideranca.contato,
        lideranca.foto,
        expectativa_votos,
        lideranca.createdAt
      ]
    );

    res.json({ success: true, lideranca });

  } catch (err) {
    console.error('Erro ao salvar liderança:', err);
    res.status(500).json({ error: 'Erro ao salvar liderança' });
  }
});

/* ================= EXCLUIR LIDERANÇA ================= */
app.delete('/api/liderancas/:id', async (req, res) => {
  try {
    const { id } = req.params;

    
    await dbRun('DELETE FROM liderancas WHERE id = $1', [id]);

    res.json({ success: true });

  } catch (err) {
    console.error('Erro ao excluir liderança:', err);
    res.status(500).json({ error: 'Erro ao excluir liderança' });
  }
});

/* ================= EDITAR LIDERANÇA ================= */
app.put('/api/liderancas/:id', upload.single('foto'), async (req, res) => {
  try {
    const { id } = req.params;
    const { cidade, nome, contato, expectativa_votos } = req.body;

const atual = await dbGet(
  'SELECT * FROM liderancas WHERE id = $1',
  [id]
);

let foto = atual.foto;

if (req.file) {
  foto = `/uploads/${req.file.filename}`;
}


    
    

    await dbRun(
      `
      UPDATE liderancas
SET cidade = $1, nome = $2, contato = $3, foto = $4, expectativa_votos = $5
WHERE id = $6
      `,
      [
  cidade || atual.cidade,
  nome || atual.nome,
  contato || atual.contato,
  foto,
  Number(expectativa_votos ?? atual.expectativa_votos),
  id
]
    );

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao editar liderança' });
  }
});

app.get('/api/data', async (req, res) => {
  try {
    const liderancas = await dbAll('SELECT * FROM liderancas');
    const gastos = await dbAll('SELECT * FROM gastos_lideranca');
    const observacoes = await dbAll('SELECT * FROM observacoes');

    res.json({
      liderancas,
      gastos,
      observacoes
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao carregar dados' });
  }
});


app.listen(PORT, () => {
  console.log(`✅ Backend rodando em http://localhost:${PORT}`);
});
