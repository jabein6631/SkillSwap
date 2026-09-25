/**
 * SkillSwap Platform - Vercel Serverless Express Entrypoint
 */
const { app } = require('../backend/server');
const { initSchema } = require('../backend/database/db');
const { seedDatabase } = require('../backend/database/seed');

let isInitialized = false;

module.exports = async (req, res) => {
  if (!isInitialized) {
    try {
      await initSchema();
      await seedDatabase();
    } catch (err) {
      console.error('[Vercel Serverless Init Notice]:', err.message);
    }
    isInitialized = true;
  }
  return app(req, res);
};
