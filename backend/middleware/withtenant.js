function withTenant(req, res, next) {
  if (req.tenantId === null || req.tenantId === undefined) {
    return res.status(403).json({
      error: 'Tenant não identificado'
    });
  }

  next();
}

module.exports = withTenant;