const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/sessionController');
const auth = require('../middleware/auth');
const role = require('../middleware/role');

router.use(auth);

router.get('/', sessionController.getSessions);
router.get('/:id', sessionController.getSession);
router.post('/start', role('admin', 'kassir', 'operator'), sessionController.startSession);
router.put('/:id/end', role('admin', 'kassir'), sessionController.endSession);
router.put('/:id/pause', role('admin', 'kassir', 'operator'), sessionController.pauseSession);
router.put('/:id/resume', role('admin', 'kassir', 'operator'), sessionController.resumeSession);
router.put('/:id/cancel', role('admin', 'kassir'), sessionController.cancelSession);

module.exports = router;
