/**
 * SkillSwap Platform - Modular Express Application Server & WebRTC Signaling Hub
 */

const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');

const requestLogger = require('./middleware/requestLogger');
const { attachUserContext } = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');
const apiRoutes = require('./routes');
const { initSchema } = require('./database/db');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

module.exports = {
  app,
  server,
  broadcastSupportEvent: (data) => broadcastSupportEvent(data),
  broadcastChatEvent: (data) => broadcastChatEvent(data)
};

// Security & Parsing Middleware (Support up to 50MB for multi-file attachments & media)
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(requestLogger);
app.use(attachUserContext);

const fs = require('fs');

// Ensure uploads/voice directory exists
const uploadsPath = path.join(__dirname, '../uploads');
const voiceUploadsPath = path.join(uploadsPath, 'voice');
if (!fs.existsSync(voiceUploadsPath)) {
  fs.mkdirSync(voiceUploadsPath, { recursive: true });
}

// Serve Uploads directory statically with HTTP byte-ranges enabled for smooth audio streaming
app.use('/uploads', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
  next();
}, express.static(uploadsPath, {
  acceptRanges: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.webm')) {
      res.setHeader('Content-Type', 'audio/webm');
    } else if (filePath.endsWith('.ogg')) {
      res.setHeader('Content-Type', 'audio/ogg');
    } else if (filePath.endsWith('.mp4')) {
      res.setHeader('Content-Type', 'audio/mp4');
    } else if (filePath.endsWith('.wav')) {
      res.setHeader('Content-Type', 'audio/wav');
    }
    res.setHeader('Accept-Ranges', 'bytes');
  }
}));

// Serve Frontend Static Assets (HTML, CSS, JS, Images)
const frontendPath = path.join(__dirname, '../frontend');
app.use('/css', express.static(path.join(frontendPath, 'css'), { maxAge: 0 }));
app.use('/js', express.static(path.join(frontendPath, 'js'), { maxAge: 0 }));
app.use('/assets', express.static(path.join(frontendPath, 'assets'), { maxAge: 0 }));
app.use(express.static(frontendPath, { maxAge: 0 }));
app.use(express.static(path.join(__dirname, '..'))); // Fallback static path

// Nested Static Asset Resolver (e.g. handles /sessions/css/style.css, /sessions/masterclass/js/app.js)
app.use((req, res, next) => {
  const ext = path.extname(req.path).toLowerCase();
  const staticExts = ['.css', '.js', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.map', '.webm', '.ogg', '.mp4', '.wav'];
  if (staticExts.includes(ext)) {
    const filename = path.basename(req.path);
    const candidatePaths = [
      path.join(frontendPath, req.path),
      path.join(frontendPath, 'css', filename),
      path.join(frontendPath, 'js', filename),
      path.join(frontendPath, 'assets', filename),
      path.join(frontendPath, filename)
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        return res.sendFile(p);
      }
    }
    return res.status(404).type('text/plain').send('Static asset not found: ' + req.path);
  }
  next();
});

// Mount Modular API Routes
app.use('/api', apiRoutes);

// Catch-All Route for Single Page Application
app.get('*', (req, res, next) => {
  if (req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/webrtc-signaling') || req.originalUrl.startsWith('/uploads')) {
    return next();
  }
  const ext = path.extname(req.path).toLowerCase();
  if (['.css', '.js', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.map'].includes(ext)) {
    return res.status(404).type('text/plain').send('Static asset not found: ' + req.path);
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Centralized Error Handling Middleware
app.use(errorHandler);

// ==========================================
// WebSocket Real-Time WebRTC Signaling Server
// ==========================================
const wss = new WebSocketServer({ server, path: '/webrtc-signaling' });
const rooms = new Map(); // roomId -> Map(peerId -> { ws, userProfile })

wss.on('connection', (ws) => {
  let currentRoomId = null;
  let currentPeerId = null;

  ws.on('message', (messageRaw) => {
    try {
      const data = JSON.parse(messageRaw);
      const { type, roomId, peerId, targetPeerId, userProfile, sdp, candidate, mediaState, text, emoji } = data;

      switch (type) {
        case 'join-room': {
          currentRoomId = roomId || 'skillswap-room-default';
          currentPeerId = peerId || 'peer_' + Math.random().toString(36).substring(2, 9);

          if (!rooms.has(currentRoomId)) {
            rooms.set(currentRoomId, new Map());
          }
          const room = rooms.get(currentRoomId);

          // Get list of all existing peers in this meeting room
          const existingPeers = [];
          room.forEach((info, existingId) => {
            existingPeers.push({
              peerId: existingId,
              userProfile: info.userProfile
            });
          });

          // Add this peer to the room
          room.set(currentPeerId, { ws, userProfile });

          // Send confirmation back to newly joined peer with existing peers list
          ws.send(JSON.stringify({
            type: 'room-joined',
            roomId: currentRoomId,
            peerId: currentPeerId,
            peers: existingPeers
          }));

          // Notify all existing peers that a new participant has joined
          room.forEach((info, existingId) => {
            if (existingId !== currentPeerId && info.ws.readyState === 1) {
              info.ws.send(JSON.stringify({
                type: 'peer-joined',
                roomId: currentRoomId,
                peerId: currentPeerId,
                userProfile
              }));
            }
          });
          break;
        }

        case 'offer': {
          if (currentRoomId && rooms.has(currentRoomId)) {
            const room = rooms.get(currentRoomId);
            const target = room.get(targetPeerId);
            if (target && target.ws.readyState === 1) {
              target.ws.send(JSON.stringify({
                type: 'offer',
                senderPeerId: currentPeerId,
                sdp,
                userProfile
              }));
            }
          }
          break;
        }

        case 'answer': {
          if (currentRoomId && rooms.has(currentRoomId)) {
            const room = rooms.get(currentRoomId);
            const target = room.get(targetPeerId);
            if (target && target.ws.readyState === 1) {
              target.ws.send(JSON.stringify({
                type: 'answer',
                senderPeerId: currentPeerId,
                sdp
              }));
            }
          }
          break;
        }

        case 'ice-candidate': {
          if (currentRoomId && rooms.has(currentRoomId)) {
            const room = rooms.get(currentRoomId);
            const target = room.get(targetPeerId);
            if (target && target.ws.readyState === 1) {
              target.ws.send(JSON.stringify({
                type: 'ice-candidate',
                senderPeerId: currentPeerId,
                candidate
              }));
            }
          }
          break;
        }

        case 'media-state': {
          if (currentRoomId && rooms.has(currentRoomId)) {
            const room = rooms.get(currentRoomId);
            room.forEach((info, otherId) => {
              if (otherId !== currentPeerId && info.ws.readyState === 1) {
                info.ws.send(JSON.stringify({
                  type: 'media-state',
                  senderPeerId: currentPeerId,
                  mediaState
                }));
              }
            });
          }
          break;
        }

        case 'chat-message': {
          if (currentRoomId && rooms.has(currentRoomId)) {
            const room = rooms.get(currentRoomId);
            room.forEach((info) => {
              if (info.ws.readyState === 1) {
                info.ws.send(JSON.stringify({
                  type: 'chat-message',
                  senderPeerId: currentPeerId,
                  senderName: userProfile?.name || 'User',
                  text,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                }));
              }
            });
          }
          break;
        }

        case 'reaction': {
          if (currentRoomId && rooms.has(currentRoomId)) {
            const room = rooms.get(currentRoomId);
            room.forEach((info) => {
              if (info.ws.readyState === 1) {
                info.ws.send(JSON.stringify({
                  type: 'reaction',
                  senderPeerId: currentPeerId,
                  senderName: userProfile?.name || 'User',
                  emoji
                }));
              }
            });
          }
          break;
        }

        case 'end-session': {
          if (currentRoomId && rooms.has(currentRoomId)) {
            const room = rooms.get(currentRoomId);
            room.forEach((info) => {
              if (info.ws.readyState === 1) {
                info.ws.send(JSON.stringify({
                  type: 'session-ended',
                  senderPeerId: currentPeerId,
                  message: 'This session has ended and is no longer available.'
                }));
              }
            });
            rooms.delete(currentRoomId);
          }
          break;
        }

        case 'code-update': {
          if (currentRoomId && rooms.has(currentRoomId)) {
            const room = rooms.get(currentRoomId);
            const senderInfo = room.get(currentPeerId);
            const isSenderHost = senderInfo?.userProfile?.isHost;
            if (isSenderHost) {
              room.forEach((info, otherId) => {
                if (otherId !== currentPeerId && info.ws.readyState === 1) {
                  info.ws.send(JSON.stringify({
                    type: 'code-update',
                    senderPeerId: currentPeerId,
                    code: data.code
                  }));
                }
              });
            } else {
              console.warn(`Unauthorized code-update attempt from non-host peer: ${currentPeerId}`);
            }
          }
          break;
        }

        case 'leave-room': {
          handlePeerLeave(currentRoomId, currentPeerId);
          break;
        }
      }
    } catch (e) {
      console.warn('WebSocket message error:', e.message);
    }
  });

  const handlePeerLeave = (rId, pId) => {
    if (rId && pId && rooms.has(rId)) {
      const room = rooms.get(rId);
      room.delete(pId);
      if (room.size === 0) {
        rooms.delete(rId);
      } else {
        room.forEach((info) => {
          if (info.ws.readyState === 1) {
            info.ws.send(JSON.stringify({
              type: 'peer-left',
              roomId: rId,
              peerId: pId
            }));
          }
        });
      }
    }
  };

  ws.on('close', () => {
    handlePeerLeave(currentRoomId, currentPeerId);
  });

  ws.on('error', () => {
    handlePeerLeave(currentRoomId, currentPeerId);
  });
});

/**
 * Real-time event broadcaster to all connected clients (for Instant Support Hub updates)
 */
function broadcastSupportEvent(eventData) {
  const message = JSON.stringify({
    type: 'support-update',
    timestamp: new Date().toISOString(),
    ...eventData
  });

  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      try {
        client.send(message);
      } catch (err) {
        // Silently ignore individual send errors
      }
    }
  });
}

/**
 * Real-time Chat Broadcaster (for instant WhatsApp-style text and voice messaging)
 */
function broadcastChatEvent(chatData) {
  const message = JSON.stringify({
    type: 'chat-update',
    timestamp: new Date().toISOString(),
    ...chatData
  });

  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      try {
        client.send(message);
      } catch (err) {
        // Silently ignore individual send errors
      }
    }
  });
}

const { trusodbService } = require('./database/trusodb');

// Initialize DB and Boot Server
async function startServer() {
  try {
    await initSchema();
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`\n========================================================`);
      console.log(`🚀 SkillSwap Platform Live: http://localhost:${PORT}`);
      console.log(`📚 Frontend Path: ${frontendPath}`);
      console.log(`🎥 Real-Time WebRTC Video & Zoom Hub: Active on /webrtc-signaling`);
      console.log(`⏱️ Automatic Live Session Expiration Engine: Active (10s interval)`);
      console.log(`========================================================\n`);
    });

    // Periodic Background Worker: Automatically end expired sessions & broadcast session-ended event
    setInterval(async () => {
      try {
        const expiredIds = await trusodbService.checkAndUpdateExpiredSessions();
        if (expiredIds && expiredIds.length > 0) {
          for (const sessionId of expiredIds) {
            const roomId = `skillswap_meet_${sessionId}`;
            console.log(`⏰ [Server Expiry Monitor] Session ${sessionId} scheduled duration expired. Broadcasting session-ended.`);
            if (rooms.has(roomId)) {
              const room = rooms.get(roomId);
              room.forEach((info) => {
                if (info.ws && info.ws.readyState === 1) {
                  info.ws.send(JSON.stringify({
                    type: 'session-ended',
                    sessionId,
                    message: 'This session has reached its scheduled end time and has ended.'
                  }));
                }
              });
              rooms.delete(roomId);
            }
          }
        }
      } catch (err) {
        // Silently ignore ticker errors
      }
    }, 10000);

  } catch (err) {
    console.error('❌ Failed to start SkillSwap server:', err);
    process.exit(1);
if (require.main === module) {
  startServer();
}

module.exports = { app, server, wss, broadcastSupportEvent, broadcastChatEvent };


