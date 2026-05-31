const { User } = require('../models');
const { generateTokens, verifyRefreshToken } = require('../utils/jwtUtils');

const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'Username va parol talab qilinadi' });

    const user = await User.findOne({ where: { username, isActive: true } });
    if (!user) return res.status(401).json({ success: false, message: 'Username yoki parol noto\'g\'ri' });

    const isMatch = await user.validatePassword(password);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Username yoki parol noto\'g\'ri' });

    await user.update({ lastLogin: new Date() });
    const tokens = generateTokens(user);

    res.json({ success: true, message: 'Muvaffaqiyatli kirildi', data: { user, ...tokens } });
  } catch (error) {
    next(error);
  }
};

const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ success: false, message: 'Refresh token talab qilinadi' });

    const decoded = verifyRefreshToken(refreshToken);
    const user = await User.findByPk(decoded.id);
    if (!user || !user.isActive) return res.status(401).json({ success: false, message: 'Noto\'g\'ri token' });

    const tokens = generateTokens(user);
    res.json({ success: true, data: { user, ...tokens } });
  } catch (error) {
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Token yaroqsiz' });
    }
    next(error);
  }
};

const me = async (req, res) => {
  res.json({ success: true, data: req.user });
};

const logout = async (req, res) => {
  res.json({ success: true, message: 'Muvaffaqiyatli chiqildi' });
};

module.exports = { login, refresh, me, logout };
