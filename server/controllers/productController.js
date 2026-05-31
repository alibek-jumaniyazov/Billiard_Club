const { Product, Category } = require('../models');
const { Op } = require('sequelize');

const getProducts = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, search, categoryId } = req.query;
    const where = { isActive: true };
    if (search) where.name = { [Op.iLike]: `%${search}%` };
    if (categoryId) where.categoryId = categoryId;

    const { count, rows } = await Product.findAndCountAll({
      where,
      include: [{ model: Category, as: 'category', attributes: ['id', 'name', 'icon'] }],
      order: [['name', 'ASC']],
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

const createProduct = async (req, res, next) => {
  try {
    const { categoryId, name, price, stock, unit, description } = req.body;
    const product = await Product.create({ categoryId, name, price, stock, unit, description });
    res.status(201).json({ success: true, message: 'Mahsulot qo\'shildi', data: product });
  } catch (error) {
    next(error);
  }
};

const updateProduct = async (req, res, next) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Mahsulot topilmadi' });
    const { categoryId, name, price, stock, unit, description } = req.body;
    await product.update({ categoryId, name, price, stock, unit, description });
    res.json({ success: true, message: 'Mahsulot yangilandi', data: product });
  } catch (error) {
    next(error);
  }
};

const deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Mahsulot topilmadi' });
    await product.update({ isActive: false });
    res.json({ success: true, message: 'Mahsulot o\'chirildi' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getProducts, createProduct, updateProduct, deleteProduct };
