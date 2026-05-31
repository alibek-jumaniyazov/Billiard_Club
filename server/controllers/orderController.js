const { Order, OrderItem, Product, Session, Table } = require('../models');

const getOrders = async (req, res, next) => {
  try {
    const { sessionId, tableId, status } = req.query;
    const where = {};
    if (sessionId) where.sessionId = sessionId;
    if (tableId) where.tableId = tableId;
    if (status) where.status = status;

    const orders = await Order.findAll({
      where,
      include: [
        { model: Table, as: 'table', attributes: ['id', 'name', 'number'] },
        {
          model: OrderItem, as: 'items',
          include: [{ model: Product, as: 'product', attributes: ['id', 'name', 'price', 'unit'] }],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    res.json({ success: true, data: orders });
  } catch (error) {
    next(error);
  }
};

const createOrder = async (req, res, next) => {
  try {
    const { sessionId, tableId, items } = req.body;

    let [order] = await Order.findOrCreate({
      where: { sessionId, status: 'open' },
      defaults: { sessionId, tableId, userId: req.user.id, status: 'open', totalAmount: 0 },
    });

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Buyurtma elementlari talab qilinadi' });
    }

    let addedAmount = 0;
    for (const item of items) {
      const product = await Product.findByPk(item.productId);
      if (!product) continue;

      const subtotal = parseFloat(product.price) * parseInt(item.quantity);
      await OrderItem.create({
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        price: product.price,
        subtotal,
      });
      addedAmount += subtotal;

      if (product.stock > 0) {
        await product.update({ stock: Math.max(0, product.stock - item.quantity) });
      }
    }

    const newTotal = parseFloat(order.totalAmount) + addedAmount;
    await order.update({ totalAmount: newTotal.toFixed(2) });

    if (sessionId) {
      const session = await Session.findByPk(sessionId);
      if (session) {
        const newBarAmount = parseFloat(session.barAmount || 0) + addedAmount;
        await session.update({ barAmount: newBarAmount.toFixed(2) });
      }
    }

    const fullOrder = await Order.findByPk(order.id, {
      include: [{ model: OrderItem, as: 'items', include: [{ model: Product, as: 'product' }] }],
    });

    res.status(201).json({ success: true, message: 'Buyurtma qo\'shildi', data: fullOrder });
  } catch (error) {
    next(error);
  }
};

const closeOrder = async (req, res, next) => {
  try {
    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Buyurtma topilmadi' });
    await order.update({ status: 'closed' });
    res.json({ success: true, message: 'Buyurtma yopildi', data: order });
  } catch (error) {
    next(error);
  }
};

module.exports = { getOrders, createOrder, closeOrder };
