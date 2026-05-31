const { Session, Table, Sale, Order, OrderItem, Product } = require('../models');
const { Op } = require('sequelize');
const sequelize = require('../models').sequelize;
const { exportToExcel } = require('../utils/excelExport');
const { exportToPDF } = require('../utils/pdfExport');

const getDateRange = (type, query) => {
  const now = new Date();
  let from, to;

  if (type === 'daily') {
    from = new Date(query.date || now);
    from.setHours(0, 0, 0, 0);
    to = new Date(from);
    to.setDate(to.getDate() + 1);
  } else if (type === 'weekly') {
    const week = parseInt(query.week) || Math.ceil(now.getDate() / 7);
    const year = parseInt(query.year) || now.getFullYear();
    from = new Date(year, now.getMonth(), (week - 1) * 7 + 1);
    to = new Date(from);
    to.setDate(to.getDate() + 7);
  } else if (type === 'monthly') {
    const month = parseInt(query.month) - 1 || now.getMonth();
    const year = parseInt(query.year) || now.getFullYear();
    from = new Date(year, month, 1);
    to = new Date(year, month + 1, 1);
  } else if (type === 'custom') {
    from = new Date(query.from);
    to = new Date(query.to);
    to.setDate(to.getDate() + 1);
  }

  return { from, to };
};

const getReport = async (req, res, next) => {
  try {
    const { type } = req.params;
    const { from, to } = getDateRange(type, req.query);

    const sessions = await Session.findAll({
      where: {
        status: 'completed',
        createdAt: { [Op.between]: [from, to] },
      },
      include: [{ model: Table, as: 'table', attributes: ['id', 'name', 'number'] }],
      order: [['createdAt', 'DESC']],
    });

    const totalRevenue = sessions.reduce((s, sess) => s + parseFloat(sess.totalAmount || 0), 0);
    const tableRevenue = sessions.reduce((s, sess) => s + parseFloat(sess.tableAmount || 0), 0);
    const barRevenue = sessions.reduce((s, sess) => s + parseFloat(sess.barAmount || 0), 0);
    const totalSessions = sessions.length;
    const avgSessionDuration = sessions.length ? sessions.reduce((s, sess) => s + (sess.durationMinutes || 0), 0) / sessions.length : 0;

    res.json({
      success: true,
      data: {
        period: { from, to, type },
        sessions,
        summary: { totalRevenue, tableRevenue, barRevenue, totalSessions, avgSessionDuration },
      },
    });
  } catch (error) {
    next(error);
  }
};

const exportReport = async (req, res, next) => {
  try {
    const { format } = req.params;
    const { type = 'custom', from, to } = req.query;
    const range = getDateRange(type, { from, to });

    const sessions = await Session.findAll({
      where: {
        status: 'completed',
        createdAt: { [Op.between]: [range.from, range.to] },
      },
      include: [{ model: Table, as: 'table', attributes: ['id', 'name', 'number'] }],
      order: [['createdAt', 'DESC']],
    });

    if (format === 'excel') {
      await exportToExcel(sessions, 'sessions', res);
    } else if (format === 'pdf') {
      const title = `${range.from.toLocaleDateString('uz-UZ')} - ${range.to.toLocaleDateString('uz-UZ')} Hisobot`;
      exportToPDF(sessions, 'sessions', title, res);
    } else {
      return res.status(400).json({ success: false, message: "Format 'excel' yoki 'pdf' bo'lishi kerak" });
    }
  } catch (error) {
    next(error);
  }
};

module.exports = { getReport, exportReport };
