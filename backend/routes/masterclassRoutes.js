/**
 * SkillSwap Platform - Public Group Masterclass Routes
 * Supports public discovery, 0-credit free join, live attendance tracking, and attendance rewards
 */

const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/sessionController');
const { authenticateToken } = require('../middleware/auth');
const { trusodbService, supabaseService } = require('../database/trusodb');

// All masterclass routes require authentication
router.use(authenticateToken);

/**
 * GET /api/masterclasses
 * Public upcoming and live Masterclasses created by ANY registered user
 */
router.get('/', async (req, res, next) => {
  try {
    const allSessions = await supabaseService.getSessions();
    const publicMasterclasses = allSessions.filter(
      s => s.session_type === 'GROUP_COHORT' && s.status && s.status.toLowerCase() !== 'cancelled'
    );
    res.json({
      success: true,
      masterclasses: publicMasterclasses,
      count: publicMasterclasses.length
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/masterclasses/my
 * Masterclasses hosted by the authenticated user
 */
router.get('/my', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const allSessions = await supabaseService.getSessions();
    const myMasterclasses = allSessions.filter(
      s => s.session_type === 'GROUP_COHORT' && s.teacher_id === userId
    );
    res.json({
      success: true,
      masterclasses: myMasterclasses,
      count: myMasterclasses.length
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/masterclasses (or /create)
 * Create a new public group masterclass
 */
router.post('/', sessionController.createCohort);
router.post('/create', sessionController.createCohort);

/**
 * GET /api/masterclasses/:id
 * Get details for a specific masterclass
 */
router.get('/:id', sessionController.getSessionById);

/**
 * POST /api/masterclasses/:id/register
 * Zero-credit free registration for student
 */
router.post('/:id/register', sessionController.enrollInCohort);

/**
 * POST /api/masterclasses/:id/join
 * Join live masterclass & record attendance
 */
router.post('/:id/join', sessionController.getOrCreateLiveMeeting);
router.get('/:id/join', sessionController.getOrCreateLiveMeeting);

/**
 * POST /api/masterclasses/:id/leave
 * Record attendee leave time & duration
 */
router.post('/:id/leave', sessionController.recordLeave);

/**
 * POST /api/masterclasses/:id/finalize-attendance
 * End session, finalize attendance percentage, and award creator credit
 */
router.post('/:id/finalize-attendance', sessionController.finalizeAttendance);

/**
 * PUT /api/masterclasses/:id and PATCH /api/masterclasses/:id
 * Update existing masterclass
 */
router.put('/:id', sessionController.updateSession);
router.patch('/:id', sessionController.updateSession);

/**
 * POST/PATCH /api/masterclasses/:id/reschedule
 * Reschedule masterclass date/time & notify participants
 */
router.post('/:id/reschedule', sessionController.rescheduleSession);
router.patch('/:id/reschedule', sessionController.rescheduleSession);

/**
 * POST /api/masterclasses/:id/cancel
 * Cancel masterclass
 */
router.post('/:id/cancel', sessionController.cancelSession);

/**
 * POST /api/masterclasses/:id/report
 * Submit issue report for masterclass
 */
router.post('/:id/report', sessionController.reportSession);

module.exports = router;
