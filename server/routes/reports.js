const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const auth = require('../middleware/auth');
const role = require('../middleware/role');

router.use(auth);
router.use(role('admin', 'kassir'));

router.get('/export/:format', reportController.exportReport);
router.get('/:type', reportController.getReport);

module.exports = router;
