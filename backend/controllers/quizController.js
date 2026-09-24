/**
 * SkillSwap Platform - AI Dynamic Subject-Pure Mentor Assessment Controller
 */

const { trusodbService, supabaseService } = require('../database/trusodb');
const { db } = require('../database/db');

const quizController = {
  /**
   * Get Eligible Assessment Subjects for Authenticated User
   * GET /api/quizzes/subjects
   */
  async getUserAssessmentSubjects(req, res, next) {
    try {
      const userId = req.user?.id || req.query.userId;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Authentication required.' });
      }

      const subjects = await supabaseService.getAssessmentSubjects(userId);
      res.json({ success: true, subjects });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Generate a Fresh, Dynamic, Subject-Pure Assessment
   * POST /api/quizzes/generate
   */
  async generateAssessment(req, res, next) {
    try {
      const userId = req.user?.id;
      const { skillName, subjectName, subjectId, questionCount, difficulty, assessmentType } = req.body;
      const targetSkill = (skillName || subjectName || 'Python Programming & DSA').trim();

      const assessment = await supabaseService.generateDynamicAssessment({
        skillName: targetSkill,
        questionCount: Number(questionCount) || 20,
        difficulty: difficulty || 'Mixed',
        assessmentType: assessmentType || 'Complete Mentor Assessment'
      });

      res.json({
        success: true,
        assessment
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Legacy 20-Q getter
   * GET /api/quizzes/dynamic/:skillName
   */
  async getDynamicQuiz(req, res, next) {
    try {
      const skillName = req.params.skillName || req.query.skillName || 'Python Programming & DSA';
      const count = Number(req.query.count) || 20;
      const difficulty = req.query.difficulty || 'Mixed';

      const quiz = await supabaseService.generateDynamicAssessment({
        skillName,
        questionCount: count,
        difficulty
      });
      res.json({ success: true, quiz });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Submit Assessment Answers with Negative Marking (+3 / -1 / 0)
   * POST /api/quizzes/submit
   */
  async submitQuiz(req, res, next) {
    try {
      const { quizId, answers, userAnswers, skillName } = req.body;
      const finalAnswers = answers || userAnswers || {};
      const userId = req.user?.id || req.body.userId;

      if (!userId) {
        return res.status(401).json({ success: false, error: 'Authentication required to submit assessment.' });
      }

      const result = await supabaseService.submit20Quiz(userId, quizId, skillName, finalAnswers);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * Get Assessment History for Authenticated User
   * GET /api/quizzes/my-attempts
   */
  async getMyAssessmentHistory(req, res, next) {
    try {
      const userId = req.user?.id || req.params.userId;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Authentication required.' });
      }

      const attempts = await db.allAsync(
        `SELECT id, quiz_id, skill_name, total_questions, correct_count, wrong_count, unattempted_count, 
                marks_obtained, max_marks, score_percent, passed, tier_awarded, attempted_at 
         FROM quiz_attempts 
         WHERE user_id = ? 
         ORDER BY attempted_at DESC, id DESC`,
        [userId]
      );

      res.json({ success: true, attempts });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Backward-compatible quizzes catalog
   * GET /api/quizzes
   */
  async getQuizzes(req, res, next) {
    try {
      const quizzes = await supabaseService.getQuizzes();
      res.json({ success: true, quizzes });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Backward-compatible attempts by userId
   * GET /api/quizzes/attempts/:userId
   */
  async getAttemptsByUser(req, res, next) {
    try {
      const userId = req.params.userId || req.user?.id;
      const attempts = await supabaseService.getAttemptsByUser(userId);
      res.json({ success: true, attempts });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = quizController;
