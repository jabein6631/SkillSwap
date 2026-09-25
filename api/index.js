/**
 * SkillSwap Platform - Vercel Serverless Express Entrypoint
 */
const { app } = require('../backend/server');
const { initSchema } = require('../backend/database/db');
const { seedDatabase } = require('../backend/database/seed');

let isInitialized = false;

// Middleware for lazy initialization of Turso Cloud DB on Vercel
app.use(async (req, res, next) => {
  if (!isInitialized) {
    try {
      await initSchema();
      await seedDatabase();
    } catch (err) {
      console.error('[Vercel Serverless Init Notice]:', err.message);
    }
    isInitialized = true;
  }
  next();
});

module.exports = app;
