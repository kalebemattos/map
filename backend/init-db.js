const dbPromise = require('./database');

(async () => {
  const db = await dbPromise;

  await db.exec(`
    CREATE TABLE IF NOT EXISTS liderancas (
      id TEXT PRIMARY KEY,
      cidade TEXT,
      nome TEXT,
      contato TEXT,
      foto TEXT,
      createdAt TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT,
      senha TEXT
    );
  `);

  console.log('Banco SQLite pronto');
})();