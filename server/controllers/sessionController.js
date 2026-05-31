const { Session, Table, User, Order, OrderItem, Product } = require('../models');
const { Op } = require('sequelize');

const getSessions = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, tableId, from, to, search } = req.query;
    const where = {};

    // Cancelled sessiyalarni odatiy ro'yxatda ko'rsatmaslik
    if (status) {
      where.status = status;
    } else {
      where.status = { [Op.ne]: 'cancelled' };
    }
    if (tableId) where.tableId = tableId;
    if (search) where.customerName = { [Op.iLike]: `%${search}%` };
    if (from || to) {
      where.startTime = {};
      if (from) where.startTime[Op.gte] = new Date(from);
      if (to) where.startTime[Op.lte] = new Date(to);
    }

    const { count, rows } = await Session.findAndCountAll({
      where,
      include: [
        { model: Table, as: 'table', attributes: ['id', 'name', 'number'] },
        { model: User, as: 'user', attributes: ['id', 'name', 'username'] },
      ],
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

// ============ SESSIYA BOSHLASH (MULTI-SESSION QOLLAB-QUVVATLASH) ============
const startSession = async (req, res, next) => {
  const { sequelize } = require('../models');
  const t = await sequelize.transaction();

  try {
    const { tableId, customerName, customerPhone, notes } = req.body;

    const table = await Table.findByPk(tableId, { transaction: t });
    if (!table) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Stol topilmadi' });
    }

    // Agar stolda faol sessiya bo'lsa — avval uni yakunlaymiz
    let closedSession = null;
    const existingSession = await Session.findOne({
      where: { tableId, status: { [Op.in]: ['active', 'paused'] } },
      include: [
        { model: Table, as: 'table' },
        { model: Order, as: 'orders', include: [{ model: OrderItem, as: 'items' }] },
      ],
      transaction: t,
    });

    if (existingSession) {
      // Eski sessiyani yakunlaymiz (endSession logikasi)
      const endTime = new Date();
      let durationMs = endTime - new Date(existingSession.startTime);
      const totalPausedMs = parseInt(existingSession.totalPausedMs || 0);

      // Agar pauzada bo'lsa, joriy pauza vaqtini ham qo'shamiz
      if (existingSession.status === 'paused' && existingSession.pausedAt) {
        durationMs = durationMs - totalPausedMs - (endTime - new Date(existingSession.pausedAt));
      } else {
        durationMs = durationMs - totalPausedMs;
      }

      durationMs = Math.max(0, durationMs);
      const durationMinutes = Math.ceil(durationMs / 60000);
      const durationHours = durationMinutes / 60;
      const tableAmount = parseFloat(table.pricePerHour) * durationHours;

      let barAmount = 0;
      for (const order of existingSession.orders) {
        if (order.status === 'open') {
          barAmount += parseFloat(order.totalAmount || 0);
          await order.update({ status: 'closed' }, { transaction: t });
        }
      }

      const totalAmount = Math.max(0, tableAmount + barAmount);

      await existingSession.update({
        endTime,
        durationMinutes,
        tableAmount: tableAmount.toFixed(2),
        barAmount: barAmount.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        status: 'completed',
        isPaid: true,
        pausedAt: null,
        notes: (existingSession.notes || '') + ' [Yangi sessiya boshlanishi sababli yakunlandi]',
      }, { transaction: t });

      // Sale yozamiz
      const { Sale } = require('../models');
      await Sale.create({
        sessionId: existingSession.id,
        tableAmount: tableAmount.toFixed(2),
        barAmount: barAmount.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        paymentMethod: 'cash',
        discount: 0,
      }, { transaction: t });

      closedSession = {
        id: existingSession.id,
        durationMinutes,
        tableAmount: tableAmount.toFixed(2),
        barAmount: barAmount.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
      };
    }

    // Yangi sessiya yaratamiz
    const session = await Session.create({
      tableId,
      userId: req.user.id,
      customerName,
      customerPhone,
      startTime: new Date(),
      notes,
      status: 'active',
      pausedAt: null,
      totalPausedMs: 0,
    }, { transaction: t });

    await table.update({ status: 'band' }, { transaction: t });

    await Order.create({
      sessionId: session.id,
      tableId,
      userId: req.user.id,
      status: 'open',
    }, { transaction: t });

    await t.commit();

    const fullSession = await Session.findByPk(session.id, {
      include: [{ model: Table, as: 'table' }],
    });

    res.status(201).json({
      success: true,
      message: closedSession
        ? `Oldingi o'yin yakunlandi (${closedSession.totalAmount} so'm). Yangi o'yin boshlandi!`
        : "O'yin boshlandi",
      data: { session: fullSession, closedSession },
    });
  } catch (error) {
    await t.rollback();
    next(error);
  }
};

// ============ PAUZA ============
const pauseSession = async (req, res, next) => {
  try {
    const session = await Session.findByPk(req.params.id, {
      include: [{ model: Table, as: 'table' }],
    });

    if (!session) return res.status(404).json({ success: false, message: 'Sessiya topilmadi' });
    if (session.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Faqat faol sessiyani pauzaga olish mumkin' });
    }

    await session.update({
      status: 'paused',
      pausedAt: new Date(),
    });

    res.json({
      success: true,
      message: "O'yin pauzaga olindi",
      data: session,
    });
  } catch (error) {
    next(error);
  }
};

// ============ DAVOM ETTIRISH ============
const resumeSession = async (req, res, next) => {
  try {
    const session = await Session.findByPk(req.params.id, {
      include: [{ model: Table, as: 'table' }],
    });

    if (!session) return res.status(404).json({ success: false, message: 'Sessiya topilmadi' });
    if (session.status !== 'paused') {
      return res.status(400).json({ success: false, message: 'Sessiya pauzada emas' });
    }

    const pausedDuration = new Date() - new Date(session.pausedAt);
    const newTotalPausedMs = parseInt(session.totalPausedMs || 0) + pausedDuration;

    await session.update({
      status: 'active',
      pausedAt: null,
      totalPausedMs: newTotalPausedMs,
    });

    res.json({
      success: true,
      message: "O'yin davom ettirildi",
      data: session,
    });
  } catch (error) {
    next(error);
  }
};

// ============ BEKOR QILISH (X) ============
const cancelSession = async (req, res, next) => {
  const { sequelize } = require('../models');
  const t = await sequelize.transaction();

  try {
    const session = await Session.findByPk(req.params.id, {
      include: [
        { model: Table, as: 'table' },
        { model: Order, as: 'orders' },
      ],
      transaction: t,
    });

    if (!session) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Sessiya topilmadi' });
    }
    if (session.status !== 'active' && session.status !== 'paused') {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Faqat faol yoki pauzadagi sessiyani bekor qilish mumkin' });
    }

    // Barcha ochiq orderlarni bekor qilamiz
    for (const order of session.orders) {
      if (order.status === 'open') {
        await order.update({ status: 'cancelled' }, { transaction: t });
      }
    }

    // Sessiyani cancelled qilamiz — Sale/Debt yaratilMAYDI
    await session.update({
      status: 'cancelled',
      endTime: new Date(),
      tableAmount: 0,
      barAmount: 0,
      totalAmount: 0,
      pausedAt: null,
    }, { transaction: t });

    // Stolni bo'shatamiz
    await session.table.update({ status: 'bosh' }, { transaction: t });

    await t.commit();

    res.json({
      success: true,
      message: "Sessiya bekor qilindi. Tarixga yozilmadi.",
      data: session,
    });
  } catch (error) {
    await t.rollback();
    next(error);
  }
};

// ============ O'YINNI YAKUNLASH ============
const endSession = async (req, res, next) => {
  const { sequelize } = require('../models');
  const t = await sequelize.transaction();

  try {
    const session = await Session.findByPk(req.params.id, {
      include: [
        { model: Table, as: 'table' },
        { model: Order, as: 'orders', include: [{ model: OrderItem, as: 'items' }] },
      ],
      transaction: t,
    });

    if (!session) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Sessiya topilmadi' });
    }
    if (session.status !== 'active' && session.status !== 'paused') {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Sessiya allaqachon tugagan' });
    }

    const endTime = new Date();
    let durationMs = endTime - new Date(session.startTime);
    const totalPausedMs = parseInt(session.totalPausedMs || 0);

    // Agar hozir pauzada bo'lsa, joriy pauza vaqtini ham hisobga olamiz
    if (session.status === 'paused' && session.pausedAt) {
      const currentPauseMs = endTime - new Date(session.pausedAt);
      durationMs = durationMs - totalPausedMs - currentPauseMs;
    } else {
      durationMs = durationMs - totalPausedMs;
    }

    durationMs = Math.max(0, durationMs);
    const durationMinutes = Math.ceil(durationMs / 60000);
    const durationHours = durationMinutes / 60;
    const tableAmount = parseFloat(session.table.pricePerHour) * durationHours;

    let barAmount = 0;
    for (const order of session.orders) {
      if (order.status === 'open') {
        barAmount += parseFloat(order.totalAmount || 0);
        await order.update({ status: 'closed' }, { transaction: t });
      }
    }

    const { paymentMethod = 'cash', discount = 0, notes, isDebt = false, isTableDebt = false, isBarDebt = false, customerName, customerPhone } = req.body;
    const totalAmount = Math.max(0, tableAmount + barAmount - parseFloat(discount));
    
    let actualPaidAmount = totalAmount;
    let totalDebt = 0;

    if (isDebt) {
      if (!customerName && !session.customerName) {
        await t.rollback();
        return res.status(400).json({ success: false, message: 'Qarzga yozish uchun mijoz ismi kiritilishi shart' });
      }
      if (!isTableDebt && !isBarDebt) {
        await t.rollback();
        return res.status(400).json({ success: false, message: "Qarzga yozish uchun Stol yoki Bar ni belgilang" });
      }
      
      const tDebt = isTableDebt ? tableAmount : 0;
      const bDebt = isBarDebt ? barAmount : 0;
      totalDebt = tDebt + bDebt;
      actualPaidAmount = Math.max(0, totalAmount - totalDebt);

      const finalCustomerName = customerName || session.customerName;
      const finalCustomerPhone = customerPhone || session.customerPhone;

      const { Debt } = require('../models');
      await Debt.create({
        sessionId: session.id,
        customerName: finalCustomerName,
        customerPhone: finalCustomerPhone,
        tableAmount: tDebt.toFixed(2),
        barAmount: bDebt.toFixed(2),
        totalDebt: totalDebt.toFixed(2),
        remainingDebt: totalDebt.toFixed(2),
        description: notes,
      }, { transaction: t });
    }

    await session.update({
      endTime,
      durationMinutes,
      tableAmount: tableAmount.toFixed(2),
      barAmount: barAmount.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
      status: 'completed',
      paymentMethod,
      isPaid: !isDebt || actualPaidAmount > 0,
      customerName: customerName || session.customerName,
      customerPhone: customerPhone || session.customerPhone,
      notes,
      pausedAt: null,
    }, { transaction: t });

    await session.table.update({ status: 'bosh' }, { transaction: t });

    const { Sale } = require('../models');
    await Sale.create({
      sessionId: session.id,
      tableAmount: tableAmount.toFixed(2),
      barAmount: barAmount.toFixed(2),
      totalAmount: actualPaidAmount.toFixed(2),
      paymentMethod,
      discount,
    }, { transaction: t });

    await t.commit();

    const updatedSession = await Session.findByPk(session.id, {
      include: [{ model: Table, as: 'table' }],
    });

    res.json({
      success: true,
      message: isDebt ? "O'yin tugadi va qarzga yozildi" : "O'yin tugadi",
      data: {
        session: updatedSession,
        durationMinutes,
        tableAmount: tableAmount.toFixed(2),
        barAmount: barAmount.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        actualPaidAmount: actualPaidAmount.toFixed(2),
        totalDebt: totalDebt.toFixed(2),
      },
    });
  } catch (error) {
    await t.rollback();
    next(error);
  }
};

const getSession = async (req, res, next) => {
  try {
    const session = await Session.findByPk(req.params.id, {
      include: [
        { model: Table, as: 'table' },
        { model: User, as: 'user', attributes: ['id', 'name'] },
        {
          model: Order, as: 'orders',
          include: [
            { model: OrderItem, as: 'items', include: [{ model: Product, as: 'product' }] },
          ],
        },
      ],
    });

    if (!session) return res.status(404).json({ success: false, message: 'Sessiya topilmadi' });
    res.json({ success: true, data: session });
  } catch (error) {
    next(error);
  }
};

module.exports = { getSessions, startSession, endSession, getSession, pauseSession, resumeSession, cancelSession };
