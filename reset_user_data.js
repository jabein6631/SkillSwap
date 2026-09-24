const { db, initSchema } = require('./backend/database/db');

async function resetUserData() {
  console.log('🧹 Executing FULL DEVELOPMENT DATABASE RESET...');
  
  // Ensure schema exists first
  await initSchema();

  const userTables = [
    'support_answer_attachments',
    'support_doubt_attachments',
    'support_answers',
    'support_doubts',
    'support_tickets',
    'masterclass_reports',
    'masterclass_registrations',
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
    'code_lab_user_progress',
    'coding_submissions',
    'coding_submission_results',
    'coding_user_progress',
    'coding_user_topic_progress',
    'coding_ai_generations',
    'coding_ai_reviews',
    'coding_leaderboard',
    'users'
  ];

  for (const table of userTables) {
    try {
      await db.runAsync(`DELETE FROM ${table}`);
      console.log(`  ✓ Cleared user table: ${table}`);
    } catch (e) {
      console.warn(`  ⚠️ Could not clear ${table}:`, e.message);
    }
  }

  // Reset autoincrement sequence if sqlite_sequence exists
  try {
    await db.runAsync(`DELETE FROM sqlite_sequence WHERE name IN (${userTables.map(t => `'${t}'`).join(',')})`);
    console.log('  ✓ Reset sqlite_sequence autoincrement counters');
  } catch (e) {}

  console.log('\n✨ Database reset complete! User data cleared, reference catalog preserved.');
}

resetUserData()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Reset error:', err);
    process.exit(1);
  });
