const { User } = require('../models');
const { Op } = require('sequelize');

const getStaff = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, role } = req.query;
    const where = {};
    if (search) where[Op.or] = [
      { name: { [Op.iLike]: `%${search}%` } },
      { username: { [Op.iLike]: `%${search}%` } },
    ];
    if (role) where.role = role;

    const { count, rows } = await User.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    res.json({
      success: true,
      data: rows,
      pagination: { total: count, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(count / limit) },
    });
  } catch (error) {
    next(error);
  }
};

const createStaff = async (req, res, next) => {
  try {
    const { name, username, password, role } = req.body;
    const exists = await User.findOne({ where: { username } });
    if (exists) return res.status(400).json({ success: false, message: 'Bu username allaqachon mavjud' });

    const user = await User.create({ name, username, password, role });
    res.status(201).json({ success: true, message: 'Xodim qo\'shildi', data: user });
  } catch (error) {
    next(error);
  }
};

const updateStaff = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Xodim topilmadi' });

    const { name, role, isActive, password } = req.body;
    const updates = { name, role, isActive };
    if (password) updates.password = password;

    await user.update(updates);
    res.json({ success: true, message: 'Xodim yangilandi', data: user });
  } catch (error) {
    next(error);
  }
};

const deleteStaff = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Xodim topilmadi' });
    if (user.id === req.user.id) return res.status(400).json({ success: false, message: 'O\'zingizni o\'chira olmaysiz' });
    await user.update({ isActive: false });
    res.json({ success: true, message: 'Xodim o\'chirildi' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getStaff, createStaff, updateStaff, deleteStaff };
