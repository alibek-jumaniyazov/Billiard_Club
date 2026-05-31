const { Session, Table, User, Order, OrderItem, Product } = require('../models');
const { Op } = require('sequelize');

const getSessions = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, tableId, from, to, search } = req.query;
    const where = {};

    if (status) where.status = status;
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

const startSession = async (req, res, next) => {
  try {
    const { tableId, customerName, customerPhone, notes } = req.body;

    const table = await Table.findByPk(tableId);
    if (!table) return res.status(404).json({ success: false, message: 'Stol topilmadi' });
    if (table.status === 'band') return res.status(400).json({ success: false, message: 'Stol band' });

    const session = await Session.create({
      tableId,
      userId: req.user.id,
      customerName,
      customerPhone,
      startTime: new Date(),
      notes,
      status: 'active',
    });

    await table.update({ status: 'band' });

    const order = await Order.create({
      sessionId: session.id,
      tableId,
      userId: req.user.id,
      status: 'open',
    });

    const fullSession = await Session.findByPk(session.id, {
      include: [{ model: Table, as: 'table' }],
    });

    res.status(201).json({ success: true, message: "O'yin boshlandi", data: { session: fullSession, order } });
  } catch (error) {
    next(error);
  }
};

const endSession = async (req, res, next) => {
  try {
    const session = await Session.findByPk(req.params.id, {
      include: [
        { model: Table, as: 'table' },
        { model: Order, as: 'orders', include: [{ model: OrderItem, as: 'items' }] },
      ],
    });

    if (!session) return res.status(404).json({ success: false, message: 'Sessiya topilmadi' });
    if (session.status !== 'active') return res.status(400).json({ success: false, message: 'Sessiya allaqachon tugagan' });

    const endTime = new Date();
    const durationMs = endTime - new Date(session.startTime);
    const durationMinutes = Math.ceil(durationMs / 60000);
    const durationHours = durationMinutes / 60;
    const tableAmount = parseFloat(session.table.pricePerHour) * durationHours;

    let barAmount = 0;
    for (const order of session.orders) {
      if (order.status === 'open') {
        barAmount += parseFloat(order.totalAmount || 0);
        await order.update({ status: 'closed' });
      }
    }

    const { paymentMethod = 'cash', discount = 0, notes, isDebt = false, isTableDebt = false, isBarDebt = false, customerName, customerPhone } = req.body;
    const totalAmount = Math.max(0, tableAmount + barAmount - parseFloat(discount));
    
    let actualPaidAmount = totalAmount;
    let totalDebt = 0;

    if (isDebt) {
      if (!customerName && !session.customerName) {
        return res.status(400).json({ success: false, message: 'Qarzga yozish uchun mijoz ismi kiritilishi shart' });
      }
      if (!isTableDebt && !isBarDebt) {
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
      });
    }

    await session.update({
      endTime,
      durationMinutes,
      tableAmount: tableAmount.toFixed(2),
      barAmount: barAmount.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
      status: 'completed',
      paymentMethod,
      isPaid: !isDebt || actualPaidAmount > 0, // considered paid if they paid at least something or not debt
      customerName: customerName || session.customerName,
      customerPhone: customerPhone || session.customerPhone,
      notes,
    });

    await session.table.update({ status: 'bosh' });

    const { Sale } = require('../models');
    await Sale.create({
      sessionId: session.id,
      tableAmount: tableAmount.toFixed(2),
      barAmount: barAmount.toFixed(2),
      totalAmount: actualPaidAmount.toFixed(2), // Record only what was actually paid today
      paymentMethod,
      discount,
    });

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

module.exports = { getSessions, startSession, endSession, getSession };
