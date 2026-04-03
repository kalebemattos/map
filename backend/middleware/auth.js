const jwt = require('jsonwebtoken');

function auth(req, res, next) {
  const authHeader = req.headers.authorization;

  // 1️⃣ Verifica se o header existe
  if (!authHeader) {
    return res.status(401).json({ error: 'Token ausente' });
  }

  // 2️⃣ Verifica se começa com Bearer
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Formato de token inválido' });
  }

  const token = authHeader.split(' ')[1];

  // 3️⃣ Segurança extra: tipo e tamanho
  if (!token || typeof token !== 'string') {
    return res.status(401).json({ error: 'Token inválido' });
  }

  // JWT válido tem no máximo ~512 chars; bloqueia strings gigantes
  if (token.length > 512) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Estrutura explícita — não expõe campos internos do JWT desnecessariamente
    req.user = {
      id:     decoded.id,
      nivel:  decoded.nivel,
      role:   decoded.role   ?? decoded.nivel,  // retrocompatível com tokens antigos
      regiao: decoded.regiao ?? null,
    };

    // tenantId acessível diretamente em req (padrão multi-tenant)
    req.tenantId = decoded.tenantId ?? null;

    next();

  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado' });
    }

    return res.status(401).json({ error: 'Token inválido' });
  }
}

module.exports = auth;