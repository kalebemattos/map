const fs = require('fs');
const path = require('path');
const dbPromise = require('./database');

(async () => {
  try {
    const usersPath = path.join(__dirname, 'users.json');
    const users = JSON.parse(fs.readFileSync(usersPath, 'utf-8'));

    const db = await dbPromise;

    for (const u of users) {
      await db.run(
        'INSERT INTO users (usuario, senha) VALUES (?, ?)',
        [u.usuario, u.senha]
      );
    }

    console.log('✅ Usuários migrados com sucesso');
  } catch (err) {
    console.error('❌ Erro ao migrar usuários:', err);
  }
})();