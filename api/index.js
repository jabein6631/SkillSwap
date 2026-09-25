/**
 * SkillSwap Platform - Vercel Serverless Express Application Handler
 */
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const { initSchema } = require('../backend/database/db');
const { seedDatabase } = require('../backend/database/seed');

let isInitialized = false;
let initPromise = null;

async function ensureDbInitialized() {
  if (isInitialized) return;
  if (!initPromise) {
    initPromise = (async () => {
      try {
        console.log('⚡ Initializing production database schema & seed data...');
        await initSchema();
        await seedDatabase();
        isInitialized = true;
        console.log('✅ Production database schema & seed data ready!');
      } catch (err) {
        console.error('⚠️ Production DB init notice:', err.message);
      }
    })();
  }
  return initPromise;
}

app.use(async (req, res, next) => {
  await ensureDbInitialized();
  next();
});

try {
  const { attachUserContext } = require('../backend/middleware/auth');
  app.use(attachUserContext);
} catch (err) {
  console.warn('⚠️ Auth middleware load notice:', err.message);
}

try {
  const apiRoutes = require('../backend/routes');
  app.use('/api', apiRoutes);
} catch (err) {
  console.error('💥 API routes load error:', err);
}

const frontendPath = path.join(__dirname, '../frontend');
app.use('/css', express.static(path.join(frontendPath, 'css')));
app.use('/js', express.static(path.join(frontendPath, 'js')));
app.use('/assets', express.static(path.join(frontendPath, 'assets')));
app.use(express.static(frontendPath));

app.get('*', (req, res) => {
  if (req.originalUrl.startsWith('/api')) {
    return res.status(404).json({ success: false, error: 'API route not found: ' + req.originalUrl });
  }
  const indexPath = path.join(frontendPath, 'index.html');
  res.sendFile(indexPath);
});

module.exports = app;
