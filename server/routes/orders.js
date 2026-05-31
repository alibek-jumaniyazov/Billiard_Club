const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const auth = require('../middleware/auth');
const role = require('../middleware/role');

router.use(auth);

router.get('/', orderController.getOrders);
router.post('/', role('admin', 'kassir', 'operator'), orderController.createOrder);
router.put('/:id/close', role('admin', 'kassir'), orderController.closeOrder);

module.exports = router;
