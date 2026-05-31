const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const auth = require('../middleware/auth');
const role = require('../middleware/role');

router.use(auth);

router.get('/', productController.getProducts);
router.post('/', role('admin'), productController.createProduct);
router.put('/:id', role('admin'), productController.updateProduct);
router.delete('/:id', role('admin'), productController.deleteProduct);

module.exports = router;
