const { Debt, Session } = require('../models');
const { Op } = require('sequelize');

const getDebts = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, status = 'unpaid' } = req.query;
    const where = {};
    
    if (status === 'unpaid') where.isPaid = false;
    else if (status === 'paid') where.isPaid = true;

    if (search) {
      where[Op.or] = [
        { customerName: { [Op.iLike]: `%${search}%` } },
        { customerPhone: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { count, rows } = await Debt.findAndCountAll({
      where,
      include: [{ model: Session, as: 'session' }],
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

const payDebt = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount } = req.body; // Amount being paid right now

    const debt = await Debt.findByPk(id);
    if (!debt) return res.status(404).json({ success: false, message: 'Qarz topilmadi' });
    if (debt.isPaid) return res.status(400).json({ success: false, message: 'Bu qarz allaqachon to\'langan' });

    const newPaidAmount = parseFloat(debt.paidAmount) + parseFloat(amount);
    const newRemaining = parseFloat(debt.totalDebt) - newPaidAmount;
    
    const isPaid = newRemaining <= 0;

    await debt.update({
      paidAmount: newPaidAmount,
      remainingDebt: newRemaining > 0 ? newRemaining : 0,
      isPaid,
      paidAt: isPaid ? new Date() : null,
    });

    res.json({ success: true, message: 'To\'lov qabul qilindi', data: debt });
  } catch (error) {
    next(error);
  }
};

const deleteDebt = async (req, res, next) => {
  try {
    const debt = await Debt.findByPk(req.params.id);
    if (!debt) return res.status(404).json({ success: false, message: 'Qarz topilmadi' });
    
    // Admins only (middleware should handle this ideally, but doing it safely)
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Huquq yetarli emas' });
    }

    await debt.destroy();
    res.json({ success: true, message: 'Qarz o\'chirildi' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getDebts, payDebt, deleteDebt };
