/**
 * SkillSwap Platform - Automated Verification Test
 * Feature: Automatic Session End at Scheduled End Time
 */

const { db } = require('../../backend/database/db');
const { trusodbService } = require('../../backend/database/trusodb');

async function runTests() {
  console.log('🧪 Starting Verification Test: Automatic Session End at Scheduled End Time...\n');

  try {
    // ---------------------------------------------------------
    // Test 1: Scheduled End Calculation Helper
    // ---------------------------------------------------------
    const testSessionExpired = {
      id: 'test_auto_end_1',
      teacher_id: 'sri',
      student_id: 'rishitha',
      skill: 'Python Core',
      hours: 0.5,
      date: '2026-09-20',
      time: '10:00 AM',
      status: 'LIVE',
      meeting_started_at: new Date(Date.now() - 40 * 60 * 1000).toISOString() // started 40 mins ago for 30m session
    };

    const isExpired1 = trusodbService.isSessionExpired(testSessionExpired);
    if (!isExpired1) {
      throw new Error('Test 1 Failed: Session started 40m ago with 30m duration was not recognized as expired.');
    }
    console.log('✅ Test 1 Passed: Expired session correctly evaluated as isSessionExpired = true.');

    // ---------------------------------------------------------
    // Test 2: Active Session Not Expired
    // ---------------------------------------------------------
    const testSessionActive = {
      id: 'test_auto_end_2',
      teacher_id: 'sri',
      student_id: 'rishitha',
      skill: 'Python Core',
      hours: 1.0,
      date: new Date().toISOString().split('T')[0],
      time: '11:00 PM',
      status: 'LIVE',
      meeting_started_at: new Date(Date.now() - 10 * 60 * 1000).toISOString() // started 10 mins ago for 60m session
    };

    const isExpired2 = trusodbService.isSessionExpired(testSessionActive);
    if (isExpired2) {
      throw new Error('Test 2 Failed: Active session with 50m remaining was falsely marked as expired.');
    }
    console.log('✅ Test 2 Passed: Active session with remaining time correctly evaluated as isSessionExpired = false.');

    // ---------------------------------------------------------
    // Test 3: Unjoined Session Expired Edge Case
    // ---------------------------------------------------------
    const testSessionUnjoined = {
      id: 'test_auto_end_3',
      teacher_id: 'sri',
      student_id: 'rishitha',
      skill: 'Python Core',
      hours: 0.5, // 30 mins
      date: '2026-09-20', // yesterday
      time: '5:00 PM',
      status: 'Confirmed'
    };

    const isExpired3 = trusodbService.isSessionExpired(testSessionUnjoined);
    if (!isExpired3) {
      throw new Error('Test 3 Failed: Unjoined session past its scheduled time was not recognized as expired.');
    }
    console.log('✅ Test 3 Passed: Unjoined session past scheduled end time correctly evaluated as isSessionExpired = true.');

    // ---------------------------------------------------------
    // Test 4: Database Auto-Expiration & Lock
    // ---------------------------------------------------------
    const dbSessionId = 'sess_auto_end_db_' + Date.now();
    await db.runAsync(
      `INSERT INTO sessions (id, teacher_id, student_id, skill, hours, credits, date, time, status, meeting_started_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [dbSessionId, 'sri', 'rishitha', 'React.js', 0.5, 1.0, '2026-09-20', '10:00 AM', 'LIVE', new Date(Date.now() - 35 * 60 * 1000).toISOString()]
    );

    const expiredIds = await trusodbService.checkAndUpdateExpiredSessions();
    if (!expiredIds.includes(dbSessionId)) {
      throw new Error('Test 4 Failed: Database auto-expiration check did not process expired session.');
    }

    const updatedDbSession = await db.getAsync(`SELECT * FROM sessions WHERE id = ?`, [dbSessionId]);
    if (updatedDbSession.status !== 'ENDED') {
      throw new Error(`Test 4 Failed: Database session status is "${updatedDbSession.status}", expected "ENDED".`);
    }
    console.log('✅ Test 4 Passed: Database auto-expiration worker updated expired session status to "ENDED".');

    // ---------------------------------------------------------
    // Test 5: Rejection of Late Join via API
    // ---------------------------------------------------------
    const headers = { 'Content-Type': 'application/json' };
    const authUser = await db.getAsync(`SELECT * FROM users WHERE id = 'sri'`);
    if (authUser) {
      const jwt = require('jsonwebtoken');
      const token = jwt.sign({ id: authUser.id, role: authUser.role }, process.env.JWT_SECRET || 'skillswap-dev-secret-key-2026');
      headers['Authorization'] = `Bearer ${token}`;
    }

    const joinRes = await fetch(`http://localhost:3000/api/sessions/${dbSessionId}/live-meeting`, {
      headers
    });
    const joinData = await joinRes.json();
    if (joinRes.ok || !joinData.isEnded) {
      throw new Error('Test 5 Failed: Late join attempt to expired session was not rejected with HTTP 400 & isEnded=true.');
    }
    console.log('✅ Test 5 Passed: Late join attempt to expired session correctly rejected with HTTP 400 & isEnded = true.');

    // ---------------------------------------------------------
    // Test 6: Check Status Endpoint
    // ---------------------------------------------------------
    const statusRes = await fetch(`http://localhost:3000/api/sessions/${dbSessionId}/status`, {
      headers
    });
    const statusData = await statusRes.json();
    if (!statusData.success || !statusData.isEnded || statusData.status !== 'ENDED') {
      throw new Error('Test 6 Failed: GET /api/sessions/:id/status did not return isEnded=true and status=ENDED.');
    }
    console.log('\n🎉 ALL 6 AUTOMATIC SESSION END VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
    return true;
  } catch (err) {
    console.error('\n❌ Verification Test Error:', err.message);
    process.exit(1);
  }
}

runTests();
