const express = require('express');
const router = express.Router();
const tableController = require('../controllers/tableController');
const auth = require('../middleware/auth');
const role = require('../middleware/role');

router.use(auth);

router.get('/', tableController.getTables);
router.get('/:id', tableController.getTable);
router.post('/', role('admin'), tableController.createTable);
router.put('/:id', role('admin', 'kassir'), tableController.updateTable);
router.delete('/:id', role('admin'), tableController.deleteTable);

module.exports = router;
