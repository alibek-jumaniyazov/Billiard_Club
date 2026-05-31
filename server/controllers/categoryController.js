const { Category, Product } = require('../models');

const getCategories = async (req, res, next) => {
  try {
    const categories = await Category.findAll({
      where: { isActive: true },
      include: [{ model: Product, as: 'products', where: { isActive: true }, required: false }],
      order: [['name', 'ASC']],
    });
    res.json({ success: true, data: categories });
  } catch (error) {
    next(error);
  }
};

const createCategory = async (req, res, next) => {
  try {
    const { name, description, icon } = req.body;
    const category = await Category.create({ name, description, icon });
    res.status(201).json({ success: true, message: 'Kategoriya qo\'shildi', data: category });
  } catch (error) {
    next(error);
  }
};

const updateCategory = async (req, res, next) => {
  try {
    const category = await Category.findByPk(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'Kategoriya topilmadi' });
    const { name, description, icon } = req.body;
    await category.update({ name, description, icon });
    res.json({ success: true, message: 'Kategoriya yangilandi', data: category });
  } catch (error) {
    next(error);
  }
};

const deleteCategory = async (req, res, next) => {
  try {
    const category = await Category.findByPk(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'Kategoriya topilmadi' });
    const productCount = await Product.count({ where: { categoryId: category.id, isActive: true } });
    if (productCount > 0) return res.status(400).json({ success: false, message: 'Kategoriyada mahsulotlar mavjud' });
    await category.update({ isActive: false });
    res.json({ success: true, message: 'Kategoriya o\'chirildi' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getCategories, createCategory, updateCategory, deleteCategory };
