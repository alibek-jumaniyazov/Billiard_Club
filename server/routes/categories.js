const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const auth = require('../middleware/auth');
const role = require('../middleware/role');

router.use(auth);

router.get('/', categoryController.getCategories);
router.post('/', role('admin'), categoryController.createCategory);
router.put('/:id', role('admin'), categoryController.updateCategory);
router.delete('/:id', role('admin'), categoryController.deleteCategory);

module.exports = router;
