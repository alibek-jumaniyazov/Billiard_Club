const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');

router.post('/login', authController.login);
router.post('/refresh', authController.refresh);
router.get('/me', auth, authController.me);
router.post('/logout', auth, authController.logout);

module.exports = router;
