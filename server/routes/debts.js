const express = require('express');
const router = express.Router();
const { getDebts, payDebt, deleteDebt } = require('../controllers/debtController');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/', getDebts);
router.post('/:id/pay', payDebt);
router.delete('/:id', deleteDebt);

module.exports = router;
