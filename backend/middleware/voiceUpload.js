/**
 * SkillSwap Platform - Voice Message Binary Upload Middleware
 * Strictly accepts audio recordings only (zero image/document/pdf uploads)
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const voiceDir = path.join(__dirname, '../../uploads/voice');
if (!fs.existsSync(voiceDir)) {
  fs.mkdirSync(voiceDir, { recursive: true });
}

let storage;
if (process.env.VERCEL) {
  storage = multer.memoryStorage();
} else {
  try {
    storage = multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, voiceDir);
      },
      filename: (req, file, cb) => {
        let ext = 'webm';
        if (file.mimetype) {
          if (file.mimetype.includes('mp4')) ext = 'mp4';
          else if (file.mimetype.includes('ogg')) ext = 'ogg';
          else if (file.mimetype.includes('wav')) ext = 'wav';
          else if (file.mimetype.includes('aac')) ext = 'aac';
        }
        const origExt = path.extname(file.originalname).replace('.', '').toLowerCase();
        if (['webm', 'mp4', 'ogg', 'wav', 'aac'].includes(origExt)) {
          ext = origExt;
        }
        const uniqueSuffix = Date.now() + '-' + Math.random().toString(36).substring(2, 8);
        cb(null, `voice-${uniqueSuffix}.${ext}`);
      }
    });
  } catch (e) {
    storage = multer.memoryStorage();
  }
}

const fileFilter = (req, file, cb) => {
  const isAudio = file.mimetype && (
    file.mimetype.startsWith('audio/') ||
    file.mimetype === 'video/webm' || // Some Chromium versions label audio/webm as video/webm
    file.mimetype === 'application/ogg'
  );
  if (isAudio) {
    cb(null, true);
  } else {
    cb(new Error('Direct chat supports strictly text and voice recordings only. File attachments are not allowed.'));
  }
};

const uploadVoice = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024 // 25 MB max
  }
});

module.exports = uploadVoice;
