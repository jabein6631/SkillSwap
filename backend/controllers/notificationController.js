/**
 * SkillSwap Platform - Notification & Centralized Sidebar Badge Controller
 * Calculates dynamic, authenticated, user-scoped counts from SQLite database
 */

const { db } = require('../database/db');

const notificationController = {
  /**
   * GET /api/notifications/sidebar-counts
   * Returns centralized badge counts for the currently authenticated user
   */
  async getSidebarCounts(req, res, next) {
    try {
      const userId = req.user?.id || req.currentUserId;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      // 1. Peer Messages: Unread messages sent to this user
      let messagesCount = 0;
      try {
        const msgRow = await db.getAsync(
          `SELECT COUNT(*) AS unreadCount FROM messages 
           WHERE receiver_id = ? AND (status != 'READ' OR read_at IS NULL)`,
          [userId]
        );
        messagesCount = Number(msgRow?.unreadCount || 0);
      } catch (err) {
        console.warn('Error counting unread messages:', err.message);
      }

      // 2. Book Swap: Incoming pending swap requests requiring response for this mentor
      let bookSwapCount = 0;
      try {
        const swapRow = await db.getAsync(
          `SELECT COUNT(*) AS swapCount FROM sessions 
           WHERE teacher_id = ? AND session_type != 'GROUP_COHORT' AND UPPER(status) = 'PENDING'`,
          [userId]
        );
        bookSwapCount = Number(swapRow?.swapCount || 0);
      } catch (err) {
        console.warn('Error counting book swap requests:', err.message);
      }

      // 3. My Sessions: Actionable session items requiring user action
      // (Pending requests for mentor, or student pending response, or active sessions today)
      let mySessionsCount = 0;
      try {
        const sessRow = await db.getAsync(
          `SELECT COUNT(*) AS pendingCount FROM sessions 
           WHERE (teacher_id = ? OR student_id = ?) AND UPPER(status) = 'PENDING'`,
          [userId, userId]
        );
        mySessionsCount = Number(sessRow?.pendingCount || 0);
      } catch (err) {
        console.warn('Error counting my sessions:', err.message);
      }

      // 4. Support Desk: Open doubts / tickets across the platform
      let supportCount = 0;
      try {
        const doubtRow = await db.getAsync(
          `SELECT COUNT(*) AS openCount FROM support_doubts WHERE UPPER(status) = 'OPEN'`
        );
        supportCount = Number(doubtRow?.openCount || 0);
      } catch (err) {
        console.warn('Error counting open support doubts:', err.message);
      }

      // 5. Certificates & Portfolio: Actionable certificate states (NOT_VERIFIED or NEEDS_MANUAL_REVIEW)
      let certCount = 0;
      try {
        const certRow = await db.getAsync(
          `SELECT COUNT(*) AS certCount FROM certificates 
           WHERE user_id = ? AND UPPER(verification_status) IN ('NOT_VERIFIED', 'NEEDS_MANUAL_REVIEW')`,
          [userId]
        );
        certCount = Number(certRow?.certCount || 0);
      } catch (err) {
        console.warn('Error counting certificates:', err.message);
      }

      // 6. Skill Assessments: Actionable assessment notifications
      let assessmentCount = 0;
      try {
        const quizRow = await db.getAsync(
          `SELECT COUNT(*) AS quizCount FROM notifications 
           WHERE user_id = ? AND is_unread = 1 AND UPPER(type) IN ('QUIZ', 'ASSESSMENT')`,
          [userId]
        );
        assessmentCount = Number(quizRow?.quizCount || 0);
      } catch (err) {
        console.warn('Error counting assessment notifications:', err.message);
      }

      // 7. Live Session Room: Active ongoing sessions (IN_PROGRESS)
      let liveRoomCount = 0;
      try {
        const liveRow = await db.getAsync(
          `SELECT COUNT(*) AS liveCount FROM sessions 
           WHERE (teacher_id = ? OR student_id = ?) 
             AND (UPPER(status) = 'IN_PROGRESS' OR (meeting_started_at IS NOT NULL AND meeting_ended_at IS NULL))`,
          [userId, userId]
        );
        liveRoomCount = Number(liveRow?.liveCount || 0);
      } catch (err) {
        console.warn('Error counting live room sessions:', err.message);
      }

      res.json({
        success: true,
        counts: {
          messages: messagesCount,
          bookSwap: bookSwapCount,
          mySessions: mySessionsCount,
          support: supportCount,
          certificates: certCount,
          assessments: assessmentCount,
          liveRoom: liveRoomCount
        }
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/notifications
   * List notifications for currently authenticated user
   */
  async getNotifications(req, res, next) {
    try {
      const userId = req.user?.id || req.currentUserId;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const notifications = await db.allAsync(
        `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
        [userId]
      );

      res.json({
        success: true,
        notifications: notifications || []
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/notifications/mark-read
   * Mark all notifications read for authenticated user
   */
  async markAllRead(req, res, next) {
    try {
      const userId = req.user?.id || req.currentUserId;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      await db.runAsync(
        `UPDATE notifications SET is_unread = 0 WHERE user_id = ?`,
        [userId]
      );

      res.json({ success: true, message: 'All notifications marked as read' });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/notifications/:id/mark-read
   * Mark single notification read
   */
  async markNotificationRead(req, res, next) {
    try {
      const userId = req.user?.id || req.currentUserId;
      const { id } = req.params;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      await db.runAsync(
        `UPDATE notifications SET is_unread = 0 WHERE id = ? AND user_id = ?`,
        [id, userId]
      );

      res.json({ success: true, message: 'Notification marked as read' });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = notificationController;
