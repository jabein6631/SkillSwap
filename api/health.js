const { db } = require('../backend/database/db');

module.exports = async (req, res) => {
  try {
    const userCount = await db.getAsync('SELECT COUNT(*) as count FROM users');
    const certCount = await db.getAsync('SELECT COUNT(*) as count FROM certificates');
    const sessionCount = await db.getAsync('SELECT COUNT(*) as count FROM sessions');

    res.status(200).json({
      status: 'online',
      timestamp: new Date().toISOString(),
      platform: 'SkillSwap Peer-to-Peer Hub',
      env: {
        hasTursoUrl: Boolean(process.env.TURSO_DATABASE_URL || process.env.TURSO_URL),
        tursoHost: (process.env.TURSO_DATABASE_URL || process.env.TURSO_URL || '').split('@').pop(),
        hasTursoToken: Boolean(process.env.TURSO_AUTH_TOKEN || process.env.TURSO_AUTH_NTOKE || process.env.TURSO_TOKEN),
        hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
        hasSupabaseAnonKey: Boolean(process.env.SUPABASE_ANON_KEY),
        nodeEnv: process.env.NODE_ENV
      },
      dbCounts: {
        users: userCount ? userCount.count : 0,
        certificates: certCount ? certCount.count : 0,
        sessions: sessionCount ? sessionCount.count : 0
      }
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      error: err.message
    });
  }
};
