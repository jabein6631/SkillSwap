require('dotenv').config();
const { db } = require('./backend/database/db');

async function clearSupportData() {
  console.log('🧹 Clearing all data from Academic Support Team tables while preserving user logins & profiles...\n');

  try {
    await db.runAsync(`DELETE FROM support_doubt_attachments;`);
    console.log('✅ Cleared support_doubt_attachments');

    await db.runAsync(`DELETE FROM support_answer_attachments;`);
    console.log('✅ Cleared support_answer_attachments');

    await db.runAsync(`DELETE FROM support_answers;`);
    console.log('✅ Cleared support_answers');

    await db.runAsync(`DELETE FROM support_doubts;`);
    console.log('✅ Cleared support_doubts');

    await db.runAsync(`DELETE FROM support_tickets;`);
    console.log('✅ Cleared support_tickets');

    // Also clear support-related notifications if any
    try {
      await db.runAsync(`DELETE FROM notifications WHERE type IN ('reward', 'doubt', 'match');`);
      console.log('✅ Cleared old support notifications');
    } catch (e) {}

    const remainingUsers = await db.allAsync(`SELECT id, name, email, role, credits FROM users;`);
    console.log(`\n👥 User login accounts preserved (${remainingUsers.length} users):`);
    remainingUsers.forEach(u => {
      console.log(`   - ${u.name} (${u.email}) [${u.role}] — ${u.credits} Cr`);
    });

    console.log('\n🎉 Support Desk data successfully wiped clean! Users can now submit fresh doubts.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error clearing support data:', err);
    process.exit(1);
  }
}

clearSupportData();
