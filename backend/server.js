const dbPromise = require('./database');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

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

  const db = await dbPromise;

  const found = await db.get(
    'SELECT * FROM users WHERE usuario = ? AND senha = ?',
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
async function ensureExpectativaTable() {
  const db = await dbPromise;
  await db.exec(`
    CREATE TABLE IF NOT EXISTS expectativa_cidade (
      cidade TEXT PRIMARY KEY,
      expectativa INTEGER DEFAULT 0
    );
  `);
}

// salvar / atualizar expectativa da cidade
app.post('/api/expectativa-cidade', async (req, res) => {
  const { cidade, valor } = req.body;

  if (!cidade) {
    return res.status(400).json({ error: 'Cidade não informada' });
  }

  const db = await dbPromise;

  await db.run(
    `
    INSERT INTO expectativa_cidade (cidade, expectativa)
    VALUES (?, ?)
    ON CONFLICT(cidade)
    DO UPDATE SET expectativa = excluded.expectativa
    `,
    [cidade, Number(valor || 0)]
  );

  res.json({ success: true });
});

/* ================= BUSCAR DATA (MAPA + PAINEL) ================= */
app.get('/api/data', async (req, res) => {
  const db = await dbPromise;

  const liderancas = await db.all('SELECT * FROM liderancas');
  const expectativas = await db.all('SELECT * FROM expectativa_cidade');

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

    const db = await dbPromise;

    await db.run(
      `
      INSERT INTO liderancas
      (id, cidade, nome, contato, foto, expectativa_votos, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
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

    const db = await dbPromise;
    await db.run('DELETE FROM liderancas WHERE id = ?', [id]);

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

    const db = await dbPromise;
    const atual = await db.get(
      'SELECT * FROM liderancas WHERE id = ?',
      [id]
    );

    if (!atual) {
      return res.status(404).json({ error: 'Liderança não encontrada' });
    }

    let foto = atual.foto;
    if (req.file) {
      foto = `/uploads/${req.file.filename}`;
    }

    await db.run(
      `
      UPDATE liderancas
      SET cidade = ?, nome = ?, contato = ?, foto = ?, expectativa_votos = ?
      WHERE id = ?
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

/* ================= START ================= */
(async () => {
  const db = await dbPromise;

  // garantir coluna expectativa_votos
  const cols = await db.all(`PRAGMA table_info(liderancas);`);
  const hasExpectativa = cols.some(c => c.name === 'expectativa_votos');

  if (!hasExpectativa) {
    await db.exec(`
      ALTER TABLE liderancas
      ADD COLUMN expectativa_votos INTEGER DEFAULT 0;
    `);
  }

  // garantir tabela expectativa_cidade
  await ensureExpectativaTable();

  // índice
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_liderancas_cidade
    ON liderancas (cidade);
  `);

  app.listen(PORT, () => {
    console.log(`✅ Backend rodando em http://localhost:${PORT}`);
  });
})();
