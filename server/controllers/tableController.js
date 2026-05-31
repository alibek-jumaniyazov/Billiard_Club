const { Table, Session } = require('../models');
const { Op } = require('sequelize');

const getTables = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, search, status, sortBy = 'number', sortOrder = 'ASC' } = req.query;

    const where = { isActive: true };
    if (search) where.name = { [Op.iLike]: `%${search}%` };
    if (status) where.status = status;

    const { count, rows } = await Table.findAndCountAll({
      where,
      include: [
        {
          model: Session,
          as: 'sessions',
          where: { status: { [Op.in]: ['active', 'paused'] } },
          required: false,
        },
      ],
      order: [[sortBy, sortOrder.toUpperCase()]],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    // Har bir stol uchun bugungi yakunlangan sessiyalar sonini hisoblaymiz
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tablesWithStats = await Promise.all(rows.map(async (table) => {
      const todayCompletedCount = await Session.count({
        where: {
          tableId: table.id,
          status: 'completed',
          endTime: { [Op.gte]: today },
        },
      });

      const tableData = table.toJSON();
      tableData.todayCompletedSessions = todayCompletedCount;
      return tableData;
    }));

    res.json({
      success: true,
      data: tablesWithStats,
      pagination: { total: count, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(count / limit) },
    });
  } catch (error) {
    next(error);
  }
};

const getTable = async (req, res, next) => {
  try {
    const table = await Table.findByPk(req.params.id, {
      include: [{ model: Session, as: 'sessions', where: { status: { [Op.in]: ['active', 'paused'] } }, required: false, limit: 1 }],
    });
    if (!table) return res.status(404).json({ success: false, message: 'Stol topilmadi' });
    res.json({ success: true, data: table });
  } catch (error) {
    next(error);
  }
};

const createTable = async (req, res, next) => {
  try {
    const { name, number, pricePerHour, description } = req.body;
    const table = await Table.create({ name, number, pricePerHour, description });
    res.status(201).json({ success: true, message: 'Stol qo\'shildi', data: table });
  } catch (error) {
    next(error);
  }
};

const updateTable = async (req, res, next) => {
  try {
    const table = await Table.findByPk(req.params.id);
    if (!table) return res.status(404).json({ success: false, message: 'Stol topilmadi' });

    const { name, number, pricePerHour, description, status } = req.body;
    await table.update({ name, number, pricePerHour, description, status });
    res.json({ success: true, message: 'Stol yangilandi', data: table });
  } catch (error) {
    next(error);
  }
};

const deleteTable = async (req, res, next) => {
  try {
    const table = await Table.findByPk(req.params.id);
    if (!table) return res.status(404).json({ success: false, message: 'Stol topilmadi' });

    const activeSession = await Session.findOne({ where: { tableId: table.id, status: { [Op.in]: ['active', 'paused'] } } });
    if (activeSession) return res.status(400).json({ success: false, message: 'Aktiv sessiya mavjud, stolni o\'chirib bo\'lmaydi' });

    await table.update({ isActive: false });
    res.json({ success: true, message: 'Stol o\'chirildi' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getTables, getTable, createTable, updateTable, deleteTable };
