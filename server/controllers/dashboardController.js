const { Op: SequelizeOp } = require('sequelize');

const getStats = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [totalTables, activeTables, busyTables, dailyRevenue, monthlyRevenue, totalCustomers, activeSessionsData] = await Promise.all([
      require('../models').Table.count({ where: { isActive: true } }),
      require('../models').Table.count({ where: { status: 'bosh', isActive: true } }),
      require('../models').Table.count({ where: { status: 'band', isActive: true } }),
      require('../models').Session.sum('totalAmount', {
        where: { status: 'completed', isPaid: true, createdAt: { [SequelizeOp.between]: [today, tomorrow] } },
      }),
      require('../models').Session.sum('totalAmount', {
        where: { status: 'completed', isPaid: true, createdAt: { [SequelizeOp.gte]: firstDayOfMonth } },
      }),
      require('../models').Session.count({
        where: { customerName: { [SequelizeOp.ne]: null } },
        distinct: true, col: 'customerName',
      }),
      require('../models').Session.findAll({
        where: { status: 'active' },
        include: [{ model: require('../models').Table, as: 'table' }],
        order: [['startTime', 'ASC']],
      }),
    ]);

    const recentSessions = await require('../models').Session.findAll({
      where: { status: 'completed', createdAt: { [SequelizeOp.between]: [today, tomorrow] } },
      include: [{ model: require('../models').Table, as: 'table' }],
      order: [['endTime', 'DESC']],
      limit: 5,
    });

    res.json({
      success: true,
      data: {
        totalTables, activeTables, busyTables,
        dailyRevenue: parseFloat(dailyRevenue || 0),
        monthlyRevenue: parseFloat(monthlyRevenue || 0),
        totalCustomers,
        activeSessions: activeSessionsData.length,
        activeSessionsData,
        recentSessions,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getStats };
