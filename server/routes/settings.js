const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const auth = require('../middleware/auth');
const role = require('../middleware/role');

router.use(auth);

router.get('/', settingsController.getSettings);
router.put('/', role('admin'), settingsController.updateSettings);

module.exports = router;
