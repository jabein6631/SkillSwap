const express = require('express');
const router = express.Router();
const quizController = require('../controllers/quizController');
const { optionalAuth, authenticateToken } = require('../middleware/auth');

// Dynamic Subject Assessment Endpoints
router.get('/subjects', optionalAuth, quizController.getUserAssessmentSubjects);
router.post('/generate', optionalAuth, quizController.generateAssessment);
router.post('/submit', optionalAuth, quizController.submitQuiz);
router.get('/my-attempts', optionalAuth, quizController.getMyAssessmentHistory);
router.get('/history', optionalAuth, quizController.getMyAssessmentHistory);

// Legacy and Direct Dynamic Endpoints
router.get('/dynamic/:skillName', optionalAuth, quizController.getDynamicQuiz);
router.get('/attempts/:userId', optionalAuth, quizController.getAttemptsByUser);
router.get('/', optionalAuth, quizController.getQuizzes);
router.get('/:skillName', optionalAuth, quizController.getDynamicQuiz);

module.exports = router;
