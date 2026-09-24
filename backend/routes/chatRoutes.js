/**
 * SkillSwap Platform - Protected Chat Routes
 */

const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { authenticateToken } = require('../middleware/auth');
const uploadVoice = require('../middleware/voiceUpload');

// All chat routes require authentication
router.use(authenticateToken);

router.get('/messages', chatController.getMessages);
router.post('/upload-voice', uploadVoice.single('audio'), chatController.uploadVoice);
router.post('/send', chatController.sendMessage);
router.post('/read', chatController.markAsRead);
router.post('/deliver', chatController.markAsDelivered);
router.get('/conversations', chatController.getConversations);

module.exports = router;
