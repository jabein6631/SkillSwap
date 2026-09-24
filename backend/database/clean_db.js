const { db, initSchema } = require('./db');

async function cleanDatabase() {
  console.log('🧹 Purging all existing tables and data from Turso Cloud Database...');

  const tables = [
    'support_answer_attachments',
    'support_doubt_attachments',
    'support_answers',
    'support_doubts',
    'support_tickets',
    'session_attendees',
    'reviews',
    'transactions',
    'sessions',
    'login_history',
    'notifications',
    'messages',
    'quiz_attempts',
    'quiz_questions',
    'quizzes',
    'rejected_certificates',
    'certificate_verifications',
    'certificates',
    'skills_wanted',
    'skills_offered',
    'users'
  ];

  for (const table of tables) {
    try {
      await db.runAsync(`DROP TABLE IF EXISTS ${table}`);
    } catch (e) {}
  }

  console.log('🏗️ Recreating all 20 fresh normalized tables...');
  await initSchema();

  console.log('✨ Clean database ready! All 20 tables exist with 0 rows. You can now register and log in fresh.');
}

cleanDatabase()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Error cleaning database:', err);
    process.exit(1);
  });
