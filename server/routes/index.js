const express = require('express');
const authRoutes = require('./auth');
const dashboardRoutes = require('./dashboard');
const tableRoutes = require('./tables');
const sessionRoutes = require('./sessions');
const categoryRoutes = require('./categories');
const productRoutes = require('./products');
const orderRoutes = require('./orders');
const reportRoutes = require('./reports');
const staffRoutes = require('./staff');
const settingsRoutes = require('./settings');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/tables', tableRoutes);
router.use('/sessions', sessionRoutes);
router.use('/categories', categoryRoutes);
router.use('/products', productRoutes);
router.use('/orders', orderRoutes);
router.use('/reports', reportRoutes);
router.use('/staff', staffRoutes);
router.use('/settings', settingsRoutes);

module.exports = router;
