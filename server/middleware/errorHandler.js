const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  if (err.name === 'SequelizeValidationError') {
    const errors = err.errors.map(e => ({ field: e.path, message: e.message }));
    return res.status(400).json({ success: false, message: 'Validatsiya xatosi', errors });
  }
  if (err.name === 'SequelizeUniqueConstraintError') {
    const field = err.errors[0]?.path;
    return res.status(400).json({ success: false, message: `Bu ${field} allaqachon mavjud` });
  }
  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(400).json({ success: false, message: 'Bog\'liq ma\'lumotlar mavjud, o\'chrib bo\'lmaydi' });
  }
  if (err.name === 'SequelizeDatabaseError') {
    return res.status(500).json({ success: false, message: 'Ma\'lumotlar bazasi xatosi' });
  }

  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Server xatosi';
  res.status(statusCode).json({ success: false, message });
};

module.exports = errorHandler;
