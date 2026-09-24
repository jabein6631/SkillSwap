/**
 * SkillSwap Platform - Notification & Centralized Sidebar Badge Routes
 */

const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticateToken } = require('../middleware/auth');

// All notification and badge count routes require authentication
router.use(authenticateToken);

// Centralized dynamic sidebar badge counts
router.get('/sidebar-counts', notificationController.getSidebarCounts);

// User notifications management
router.get('/', notificationController.getNotifications);
router.post('/mark-read', notificationController.markAllRead);
router.post('/:id/mark-read', notificationController.markNotificationRead);

module.exports = router;
