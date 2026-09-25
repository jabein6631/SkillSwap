/**
 * SkillSwap Platform - Vercel Serverless Express Entrypoint
 */
module.exports = (req, res) => {
  try {
    const { app } = require('../backend/server');
    return app(req, res);
  } catch (err) {
    console.error('💥 Vercel Serverless Handler Error:', err);
    return res.status(500).json({
      success: false,
      error: 'Vercel Serverless Execution Error',
      message: err.message,
      stack: err.stack
    });
  }
};
