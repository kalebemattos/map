const bcrypt = require('bcrypt');

bcrypt.hash('NovaSenha123', 10)
  .then(hash => {
    console.log(hash);
  })
  .catch(console.error);
