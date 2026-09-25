module.exports = (req, res) => {
  res.status(200).json({
    status: 'online',
    timestamp: new Date().toISOString(),
    platform: 'SkillSwap Peer-to-Peer Hub',
    env: {
      hasTursoUrl: Boolean(process.env.TURSO_DATABASE_URL),
      hasTursoToken: Boolean(process.env.TURSO_AUTH_TOKEN || process.env.TURSO_AUTH_NTOKE),
      hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
      hasSupabaseAnonKey: Boolean(process.env.SUPABASE_ANON_KEY),
      nodeEnv: process.env.NODE_ENV
    }
  });
};
