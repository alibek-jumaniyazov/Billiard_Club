const role = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Autentifikatsiya talab qilinadi' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Bu amalni bajarish uchun ruxsat yo'q. Kerakli rol: ${allowedRoles.join(', ')}`,
      });
    }
    next();
  };
};

module.exports = role;
