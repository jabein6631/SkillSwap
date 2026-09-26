const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/sessionController');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

// Public / Optionally Authenticated routes
router.get('/', optionalAuth, sessionController.getSessions);

// All other session routes strictly require authentication
router.use(authenticateToken);
router.get('/my', sessionController.getMySessions);
router.get('/my-sessions', sessionController.getMySessions);
router.post('/', sessionController.bookSession);
router.post('/book', sessionController.bookSession);
router.post('/complete', sessionController.completeSession);
router.post('/cancel', sessionController.cancelSession);

// Live Zoom & Real-Time Video Conference Routes
router.get('/:id/live-meeting', sessionController.getOrCreateLiveMeeting);
router.post('/:id/live-meeting', sessionController.getOrCreateLiveMeeting);
router.post('/:id/end-meeting', sessionController.endLiveMeeting);
router.get('/:id/status', sessionController.checkSessionStatus);
router.post('/:id/signal', sessionController.sendSignal);
router.get('/:id/signals', sessionController.getSignals);

// Multi-Student Group Cohort & Live Masterclass Routes
router.post('/create-cohort', sessionController.createCohort);
router.post('/cohort', sessionController.createCohort);
router.post('/cohort/enroll', sessionController.enrollInCohort);
router.post('/enroll', sessionController.enrollInCohort);
router.post('/:id/enroll', sessionController.enrollInCohort);
router.delete('/:id/enroll', sessionController.cancelCohortEnrollment);
router.get('/:id/attendees', sessionController.getCohortAttendees);
router.post('/:id/complete-cohort', sessionController.completeCohort);
router.post('/:id/finalize-attendance', sessionController.finalizeAttendance);
router.post('/:id/attendance', sessionController.recordAttendance);
router.post('/:id/leave', sessionController.recordLeave);

// Session Details & Actions Routes
router.get('/:id', sessionController.getSessionById);
router.post('/:id/accept', sessionController.acceptSession);
router.post('/:id/decline', sessionController.declineSession);
router.post('/:id/finalize', sessionController.finalizeAttendance);
router.put('/:id', sessionController.updateSession);
router.patch('/:id', sessionController.updateSession);
router.patch('/:id/reschedule', sessionController.rescheduleSession);
router.post('/:id/reschedule', sessionController.rescheduleSession);
router.post('/:id/cancel', sessionController.cancelSession);
router.post('/:id/report', sessionController.reportSession);
router.post('/:id/check-halfway-payment', sessionController.checkOrProcessHalfwayPayment);

module.exports = router;
