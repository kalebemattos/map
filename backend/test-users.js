const dbPromise = require('./database');

(async () => {
  const db = await dbPromise;
  const users = await db.all('SELECT * FROM users');
  console.log(users);
})();