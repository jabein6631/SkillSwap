/**
 * SkillSwap Platform - WhatsApp-Style Direct Chat Controller
 * Supports strictly Text and Voice Messages ONLY (ZERO File Uploads)
 */

const { db } = require('../database/db');

let serverModule = null;
try {
  serverModule = require('../server');
} catch (e) {}

function safeChatBroadcast(event, data) {
  try {
    if (!serverModule) {
      serverModule = require('../server');
    }
    if (serverModule && typeof serverModule.broadcastChatEvent === 'function') {
      serverModule.broadcastChatEvent({ event, ...data });
    }
  } catch (err) {
    console.warn('safeChatBroadcast notice:', err.message);
  }
}

const chatController = {
  /**
   * Upload Voice Note Binary Recording
   * POST /api/chats/upload-voice
   */
  async uploadVoice(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No audio recording file uploaded or invalid audio MIME type.' });
      }
      if (req.file.size === 0) {
        return res.status(400).json({ success: false, error: 'Unable to record audio. Audio blob is empty.' });
      }
      let audioUrl = '';
      if (req.file.buffer) {
        const mime = req.file.mimetype || 'audio/webm';
        audioUrl = `data:${mime};base64,${req.file.buffer.toString('base64')}`;
      } else {
        audioUrl = `/uploads/voice/${req.file.filename}`;
      }
      const duration = Number(req.body.duration || req.body.audioDuration || 0);

      res.json({
        success: true,
        audioUrl,
        audio_url: audioUrl,
        duration,
        filename: req.file.filename || 'voice-note',
        mimetype: req.file.mimetype,
        size: req.file.size
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Get Message Thread with a Peer
   * GET /api/chats/messages?peerId=xxx
   */
  async getMessages(req, res, next) {
    try {
      const currentUserId = req.user.id;
      const peerId = req.query.peerId;

      if (!peerId) {
        return res.status(400).json({ success: false, error: 'Please provide peerId query parameter.' });
      }

      // Mark incoming unread messages as READ for this authenticated receiver
      await db.runAsync(
        `UPDATE messages 
         SET status = 'READ', read_at = CURRENT_TIMESTAMP 
         WHERE sender_id = ? AND receiver_id = ? AND (status != 'READ' OR read_at IS NULL)`,
        [peerId, currentUserId]
      );

      // Broadcast read receipt so sender sees double blue checks
      safeChatBroadcast('chat_read', {
        readerId: currentUserId,
        peerId: peerId
      });

      const messages = await db.allAsync(
        `SELECT * FROM messages 
         WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
         ORDER BY created_at ASC, id ASC`,
        [currentUserId, peerId, peerId, currentUserId]
      );

      res.json({
        success: true,
        messages: messages.map(m => {
          const effectiveAudioUrl = m.audio_url || m.audio_data || null;
          let parsedWaveform = null;
          if (m.audio_waveform) {
            try {
              parsedWaveform = typeof m.audio_waveform === 'string' ? JSON.parse(m.audio_waveform) : m.audio_waveform;
            } catch (e) {
              parsedWaveform = null;
            }
          }
          return {
            ...m,
            message_type: m.message_type || 'text',
            audio_url: effectiveAudioUrl,
            audio_data: effectiveAudioUrl,
            audio_duration: Number(m.audio_duration || 0),
            audio_waveform: parsedWaveform,
            waveform: parsedWaveform
          };
        })
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Send a Direct Peer Message (Text OR Voice ONLY)
   * POST /api/chats/send
   */
  async sendMessage(req, res, next) {
    try {
      const senderId = req.user.id;
      const { receiverId, text, messageType, message_type, audioUrl, audio_url, audioData, audio_data, audioDuration, audio_duration, file, attachment } = req.body;

      // 1. Strict Validation: Reject any file, image, or document uploads
      const hasAttachmentPayload = Boolean(
        file || attachment || req.body.attachments || req.body.attachment_data || 
        req.body.attachmentData || req.body.file_data || req.body.fileData || 
        req.body.fileName || req.body.file_name || req.body.image || req.body.imageData ||
        (messageType && messageType !== 'text' && messageType !== 'voice') ||
        (message_type && message_type !== 'text' && message_type !== 'voice')
      );

      if (hasAttachmentPayload) {
        return res.status(400).json({
          success: false,
          error: 'Files, documents, and camera uploads are not permitted in Direct Chat. Direct chat supports only text and voice messages.'
        });
      }

      const targetReceiverId = receiverId || req.body.receiver_id || req.body.peerId || req.body.peer_id;

      if (!targetReceiverId) {
        return res.status(400).json({ success: false, error: 'Please provide a valid receiverId.' });
      }

      if (targetReceiverId === senderId) {
        return res.status(400).json({ success: false, error: 'Cannot send message to yourself.' });
      }

      const receiver = await db.getAsync(`SELECT * FROM users WHERE id = ?`, [targetReceiverId]);
      if (!receiver) {
        return res.status(404).json({ success: false, error: 'Recipient user not found.' });
      }

      const persistentAudioUrl = audioUrl || audio_url || audioData || audio_data || null;
      const type = (messageType || message_type || (persistentAudioUrl ? 'voice' : 'text')).toLowerCase();
      const finalAudioDuration = Number(audioDuration || audio_duration || 0);
      const finalText = (text || '').trim();

      if (type === 'voice') {
        if (!persistentAudioUrl) {
          return res.status(400).json({ success: false, error: 'Voice message payload is missing audio URL.' });
        }
        if (typeof persistentAudioUrl === 'string' && persistentAudioUrl.startsWith('blob:')) {
          return res.status(400).json({ success: false, error: 'Invalid audio URL: Browser blob URLs cannot be persisted. Upload the audio binary first.' });
        }
      } else {
        if (!finalText) {
          return res.status(400).json({ success: false, error: 'Text message cannot be empty.' });
        }
      }

      const rawWaveform = req.body.audioWaveform || req.body.audio_waveform || req.body.waveform || null;
      const waveformStr = Array.isArray(rawWaveform) ? JSON.stringify(rawWaveform) : (typeof rawWaveform === 'string' ? rawWaveform : null);

      const msgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });

      await db.runAsync(
        `INSERT INTO messages (
          id, sender_id, receiver_id, message_type, text, audio_data, audio_url, audio_duration, audio_waveform, time, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SENT', CURRENT_TIMESTAMP)`,
        [
          msgId,
          senderId,
          targetReceiverId,
          type,
          type === 'voice' ? (finalText || '🎤 Voice message') : finalText,
          type === 'voice' ? persistentAudioUrl : null,
          type === 'voice' ? persistentAudioUrl : null,
          type === 'voice' ? finalAudioDuration : 0,
          type === 'voice' ? waveformStr : null,
          timeStr
        ]
      );

      const parsedWaveform = waveformStr ? JSON.parse(waveformStr) : null;

      const createdMessage = {
        id: msgId,
        sender_id: senderId,
        receiver_id: targetReceiverId,
        message_type: type,
        text: type === 'voice' ? (finalText || '🎤 Voice message') : finalText,
        audio_url: type === 'voice' ? persistentAudioUrl : null,
        audio_data: type === 'voice' ? persistentAudioUrl : null,
        audio_duration: type === 'voice' ? finalAudioDuration : 0,
        audio_waveform: parsedWaveform,
        waveform: parsedWaveform,
        time: timeStr,
        status: 'SENT',
        created_at: now.toISOString()
      };

      // Create Notification for receiver
      const notifSnippet = type === 'voice' 
        ? `🎤 Voice message (${Math.round(finalAudioDuration)}s)` 
        : (finalText.length > 60 ? finalText.substring(0, 60) + '...' : finalText);

      await db.runAsync(
        `INSERT INTO notifications (id, user_id, title, message, time, is_unread, type)
         VALUES (?, ?, ?, ?, ?, 1, 'message')`,
        [
          'notif_msg_' + Date.now(),
          targetReceiverId,
          `💬 New message from ${req.user.name}`,
          notifSnippet,
          'Just now'
        ]
      );

      // Broadcast real-time websocket event
      safeChatBroadcast('chat-update', {
        type: 'chat-update',
        senderId,
        senderName: req.user.name,
        receiverId: targetReceiverId,
        message: createdMessage
      });

      res.status(201).json({
        success: true,
        message: createdMessage
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Mark Conversation as Read
   * POST /api/chats/read
   */
  async markAsRead(req, res, next) {
    try {
      const currentUserId = req.user.id;
      const targetPeerId = req.body.peerId || req.body.peer_id || req.body.senderId || req.body.sender_id || req.params.peerId;

      let updatedRows = 0;
      if (targetPeerId) {
        const result = await db.runAsync(
          `UPDATE messages 
           SET status = 'READ', read_at = CURRENT_TIMESTAMP 
           WHERE sender_id = ? AND receiver_id = ? AND (status != 'READ' OR read_at IS NULL)`,
          [targetPeerId, currentUserId]
        );
        updatedRows = result?.changes || 0;

        safeChatBroadcast('chat_read', {
          event: 'chat_read',
          readerId: currentUserId,
          peerId: targetPeerId
        });
      }

      res.json({ success: true, updated: updatedRows });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Mark Conversation as Delivered
   * POST /api/chats/deliver
   */
  async markAsDelivered(req, res, next) {
    try {
      const currentUserId = req.user.id;
      const targetPeerId = req.body.peerId || req.body.peer_id || req.body.senderId || req.body.sender_id;

      let updatedRows = 0;
      if (targetPeerId) {
        const result = await db.runAsync(
          `UPDATE messages 
           SET status = 'DELIVERED' 
           WHERE sender_id = ? AND receiver_id = ? AND status = 'SENT'`,
          [targetPeerId, currentUserId]
        );
        updatedRows = result?.changes || 0;

        if (updatedRows > 0) {
          safeChatBroadcast('chat_delivered', {
            event: 'chat_delivered',
            delivererId: currentUserId,
            peerId: targetPeerId
          });
        }
      } else {
        const pending = await db.allAsync(
          `SELECT DISTINCT sender_id FROM messages WHERE receiver_id = ? AND status = 'SENT'`,
          [currentUserId]
        );
        const result = await db.runAsync(
          `UPDATE messages 
           SET status = 'DELIVERED' 
           WHERE receiver_id = ? AND status = 'SENT'`,
          [currentUserId]
        );
        updatedRows = result?.changes || 0;

        if (pending && pending.length > 0) {
          for (const row of pending) {
            safeChatBroadcast('chat_delivered', {
              event: 'chat_delivered',
              delivererId: currentUserId,
              peerId: row.sender_id
            });
          }
        }
      }

      res.json({ success: true, updated: updatedRows });
    } catch (err) {
      next(err);
    }
  },

  /**
   * List Active Conversations with Last Message & Unread Count for Authenticated User
   * GET /api/chats/conversations
   */
  async getConversations(req, res, next) {
    try {
      const userId = req.user.id;

      // Auto-update any pending SENT messages for this authenticated user to DELIVERED
      try {
        const pendingSent = await db.allAsync(
          `SELECT DISTINCT sender_id FROM messages WHERE receiver_id = ? AND status = 'SENT'`,
          [userId]
        );
        if (pendingSent && pendingSent.length > 0) {
          await db.runAsync(
            `UPDATE messages SET status = 'DELIVERED' WHERE receiver_id = ? AND status = 'SENT'`,
            [userId]
          );
          for (const row of pendingSent) {
            safeChatBroadcast('chat_delivered', {
              event: 'chat_delivered',
              delivererId: userId,
              peerId: row.sender_id
            });
          }
        }
      } catch (e) {}

      // Get all active registered student peers (excluding current user and admin)
      const allUsers = await db.allAsync(
        `SELECT id, name, college, major, avatar, rating, role, is_admin 
         FROM users 
         WHERE id != ? AND is_admin = 0 AND (role IS NULL OR role != 'ADMIN')`,
        [userId]
      );

      const peers = [];
      for (const peer of allUsers) {
        // Fetch top skill for this peer
        let topSkill = null;
        try {
          topSkill = await db.getAsync(
            `SELECT name, rate, tier FROM skills_offered WHERE user_id = ? ORDER BY rate DESC LIMIT 1`,
            [peer.id]
          );
        } catch (e) {
          // ignore if table doesn't exist
        }

        // Fetch the latest message between current user and peer
        const lastMsg = await db.getAsync(
          `SELECT * FROM messages 
           WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
           ORDER BY created_at DESC, id DESC LIMIT 1`,
          [userId, peer.id, peer.id, userId]
        );

        // Count unread messages sent by this peer to the current user
        const unreadCountRow = await db.getAsync(
          `SELECT COUNT(*) AS unreadCount FROM messages 
           WHERE sender_id = ? AND receiver_id = ? AND (status != 'READ' OR read_at IS NULL)`,
          [peer.id, userId]
        );

        const unreadCount = Number(unreadCountRow?.unreadCount || 0);
        const isVoice = lastMsg?.message_type === 'voice' || Boolean(lastMsg?.audio_data);
        const duration = Number(lastMsg?.audio_duration || 0);
        const previewText = isVoice 
          ? `🎙️ Voice message${duration > 0 ? ' (' + Math.round(duration) + 's)' : ''}` 
          : (lastMsg?.text || '');

        peers.push({
          peer,
          peer_id: peer.id,
          name: peer.name || peer.id,
          major: peer.major || 'Vignan Student',
          avatar: peer.avatar || peer.id,
          topSkill: topSkill?.name || 'Peer Mentor',
          rate: topSkill?.rate || 2.5,
          tier: topSkill?.tier || 'Elite Master',
          lastMessage: lastMsg ? {
            ...lastMsg,
            message_type: isVoice ? 'voice' : 'text',
            audio_duration: duration
          } : null,
          last_message: previewText,
          last_message_preview: previewText,
          last_message_type: isVoice ? 'voice' : 'text',
          last_message_time: lastMsg?.time || '',
          last_message_created_at: lastMsg?.created_at || null,
          unreadCount: unreadCount,
          unread_count: unreadCount
        });
      }

      // Sort: Conversations with recent messages first (by created_at DESC), then peers without messages
      peers.sort((a, b) => {
        const timeA = a.last_message_created_at ? new Date(a.last_message_created_at).getTime() : 0;
        const timeB = b.last_message_created_at ? new Date(b.last_message_created_at).getTime() : 0;
        if (timeA !== timeB) {
          return timeB - timeA;
        }
        return (a.name || '').localeCompare(b.name || '');
      });

      res.json({
        success: true,
        conversations: peers
      });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = chatController;
