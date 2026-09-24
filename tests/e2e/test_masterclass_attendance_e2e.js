const http = require('http');
const { db } = require('./backend/database/db');

async function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function loginOrRegister(email, password, name) {
  let res = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email, password });

  if (!res.body?.token) {
    await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      name,
      email,
      password,
      college: 'Vignan University',
      major: 'B.Tech CSE',
      role: 'STUDENT'
    });

    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { email, password });
  }

  if (!res.body?.token) {
    throw new Error(`Failed to login/register ${email}: ` + JSON.stringify(res.body));
  }
  return { token: res.body.token, user: res.body.user };
}

async function runMasterclassE2ETests() {
  console.log('🎓 ============================================================');
  console.log('🎓 STARTING PUBLIC MASTERCLASS & ATTENDANCE REWARD E2E TESTS');
  console.log('🎓 ============================================================');

  // STEP 1: Set up 10 registered test users (User 1 .. User 10)
  console.log('\n--- Step 1: Setting up 10 Registered Users ---');
  const users = [];
  for (let i = 1; i <= 10; i++) {
    const email = `test_user_${i}@vignan.ac.in`;
    const name = `Test User ${i}`;
    const auth = await loginOrRegister(email, 'Password123', name);
    users.push(auth);
  }
  console.log(`✅ Logged in / verified 10 test accounts (User 1 .. User 10).`);

  // Normalize other test users in DB to have clean test baseline
  // Let's count total registered website users (non-admin)
  const totalUsersRow = await db.getAsync(`SELECT COUNT(*) as count FROM users WHERE role != 'ADMIN' OR role IS NULL`);
  const totalPlatformUsers = totalUsersRow.count;
  console.log(`ℹ️ Total non-admin registered users in platform database: ${totalPlatformUsers}`);

  const user1 = users[0]; // Host / Creator
  const user2 = users[1]; // Attendee 1
  const user3 = users[2]; // Attendee 2
  const user4 = users[3]; // Attendee 3
  const user5 = users[4]; // Attendee 4
  const user6 = users[5]; // Registrant only (did NOT attend)

  // Give User 1 a baseline credit balance so we can measure exact credit changes
  await db.runAsync(`UPDATE users SET credits = 10.0 WHERE id = ?`, [user1.user.id]);
  await db.runAsync(`UPDATE users SET credits = 5.0 WHERE id = ?`, [user2.user.id]);

  // STEP 2: User 1 creates "Python DSA Problem Solving Masterclass"
  console.log('\n--- Step 2: User 1 Creates Public Group Masterclass ---');
  const createRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/sessions/create-cohort',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${user1.token}`
    }
  }, {
    topic: 'Python DSA Problem Solving Masterclass',
    skill: 'Python DSA Problem Solving',
    date: '2026-09-20',
    time: '04:00 PM',
    durationHours: 1,
    maxStudents: 50,
    ratePerStudent: 0.0, // Strictly 0.0 Cr
    description: 'Master dynamic programming and graph algorithms for interviews.',
    meetingLink: 'https://meet.skillswap.internal/room/python-dsa-masterclass'
  });

  if (createRes.status !== 200 && createRes.status !== 201) {
    throw new Error('❌ Failed to create cohort session: ' + JSON.stringify(createRes.body));
  }
  const createdSession = createRes.body.session || createRes.body.data;
  const masterclassId = createdSession.id;
  console.log(`✅ Masterclass created successfully: ID=${masterclassId}, Topic="${createdSession.topic}", Credits=${createdSession.credits}`);

  if (Number(createdSession.rate_per_student) !== 0 || Number(createdSession.credits) !== 0) {
    throw new Error(`❌ Masterclass rate_per_student or credits must be 0! Got rate=${createdSession.rate_per_student}, credits=${createdSession.credits}`);
  }

  // STEP 3: Verify Public Visibility Across ALL 10 Users
  console.log('\n--- Step 3: Verifying Public Visibility on "My Sessions" for All 10 Users ---');
  for (let i = 0; i < 10; i++) {
    const u = users[i];
    const sessionsRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/sessions/my',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${u.token}` }
    });

    if (sessionsRes.status !== 200 || !sessionsRes.body.success) {
      throw new Error(`❌ Failed to fetch sessions for User ${i + 1}: ` + JSON.stringify(sessionsRes.body));
    }

    const groups = sessionsRes.body.groups || sessionsRes.body.sessions?.groups || [];
    const masterclasses = sessionsRes.body.masterclasses || sessionsRes.body.sessions?.masterclasses || [];
    const foundInGroups = groups.some(s => s.id === masterclassId);
    if (!foundInGroups) {
      throw new Error(`❌ User ${i + 1} CANNOT see the Masterclass in their "Group Sessions" tab! Returned groups: ${groups.map(g => g.id)}`);
    }

    if (i === 0) {
      // Host / Creator: MUST be in masterclasses ("My Masterclasses")
      const foundInMyMasterclasses = masterclasses.some(s => s.id === masterclassId);
      if (!foundInMyMasterclasses) {
        throw new Error(`❌ Creator (User 1) does NOT see the Masterclass in "My Masterclasses" tab!`);
      }
    } else {
      // Non-hosts: MUST NOT be in "My Masterclasses" tab
      const foundInMyMasterclasses = masterclasses.some(s => s.id === masterclassId);
      if (foundInMyMasterclasses) {
        throw new Error(`❌ User ${i + 1} (non-host) incorrectly sees someone else's Masterclass in "My Masterclasses" tab!`);
      }
    }
  }
  console.log('✅ TEST 1-3 PASSED: Masterclass is PUBLIC for all 10 users under Group Sessions, and creator-only under "My Masterclasses"!');

  // STEP 4: Free Join (0 Credits) Verification
  console.log('\n--- Step 4: Testing Free Join (0 Credits Cost) for User 2 ---');
  const user2Before = await db.getAsync(`SELECT credits, escrow_locked FROM users WHERE id = ?`, [user2.user.id]);
  console.log(`User 2 balance before registration: ${user2Before.credits} Cr (Escrow: ${user2Before.escrow_locked} Cr)`);

  const enrollRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/sessions/${masterclassId}/enroll`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${user2.token}`
    }
  }, {});

  if (enrollRes.status !== 200) {
    throw new Error('❌ Enroll failed: ' + JSON.stringify(enrollRes.body));
  }

  const user2After = await db.getAsync(`SELECT credits, escrow_locked FROM users WHERE id = ?`, [user2.user.id]);
  console.log(`User 2 balance after registration: ${user2After.credits} Cr (Escrow: ${user2After.escrow_locked} Cr)`);

  if (user2Before.credits !== user2After.credits || user2Before.escrow_locked !== user2After.escrow_locked) {
    throw new Error(`❌ User 2 was charged or escrowed credits for registering! Before=${user2Before.credits}, After=${user2After.credits}`);
  }

  const regRow = await db.getAsync(
    `SELECT * FROM masterclass_registrations WHERE masterclass_id = ? AND user_id = ?`,
    [masterclassId, user2.user.id]
  );
  if (!regRow) {
    throw new Error('❌ User 2 registration was not recorded in masterclass_registrations table!');
  }
  console.log('✅ TEST 4 PASSED: User 2 joined for 0 Credits without deduction or escrow hold.');

  // Also register Users 3, 4, 5, and 6
  for (const u of [user3, user4, user5, user6]) {
    await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/sessions/${masterclassId}/enroll`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${u.token}`
      }
    }, {});
  }
  console.log('✅ Users 3, 4, 5, 6 registered for Masterclass.');

  // STEP 5: Live Attendance Tracking (5 Distinct Attendees)
  console.log('\n--- Step 5: Live Attendance Tracking (User 1, 2, 3, 4, 5 Attend; User 6 Absent) ---');
  // Record attendance for User 1 (Host), User 2, User 3, User 4, User 5
  for (const u of [user1, user2, user3, user4, user5]) {
    const attRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/sessions/${masterclassId}/attendance`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${u.token}`
      }
    }, { status: 'ATTENDED' });

    if (attRes.status !== 200) {
      throw new Error(`❌ Failed to record attendance for ${u.user.name}: ` + JSON.stringify(attRes.body));
    }
  }

  // Verify User 6 has NOT attended
  const user6Att = await db.getAsync(
    `SELECT * FROM masterclass_attendance WHERE masterclass_id = ? AND user_id = ?`,
    [masterclassId, user6.user.id]
  );
  if (user6Att) {
    throw new Error('❌ User 6 was unexpectedly recorded as an attendee!');
  }

  const attendanceCountRow = await db.allAsync(
    `SELECT * FROM masterclass_attendance WHERE masterclass_id = ? AND attendance_status = 'ATTENDED'`,
    [masterclassId]
  );
  console.log(`✅ Verified ${attendanceCountRow.length} attendees recorded in masterclass_attendance.`);
  if (attendanceCountRow.length !== 5) {
    throw new Error(`❌ Expected exactly 5 attendees, found: ${attendanceCountRow.length}`);
  }

  // STEP 6: Finalize Attendance & Reward Calculation
  console.log('\n--- Step 6: Finalizing Attendance and Verifying Creator Reward ---');
  const user1Before = await db.getAsync(`SELECT credits, lifetime_earned FROM users WHERE id = ?`, [user1.user.id]);
  console.log(`Creator (User 1) credits before finalization: ${user1Before.credits} Cr`);

  // Expected Attendance %: (5 / totalPlatformUsers) * 100
  const expectedAttendancePct = Math.round(((5 / totalPlatformUsers) * 100) * 100) / 100;
  console.log(`Expected Attendance Calculation: (5 / ${totalPlatformUsers}) * 100 = ${expectedAttendancePct}%`);

  // Look up expected reward rule
  const expectedTierRule = await db.getAsync(
    `SELECT * FROM masterclass_reward_rules WHERE ? >= min_attendance_percentage ORDER BY min_attendance_percentage DESC LIMIT 1`,
    [expectedAttendancePct]
  );
  const expectedReward = expectedTierRule ? Number(expectedTierRule.reward_credits) : 0.0;
  console.log(`Expected Reward from Rules Tier (${expectedTierRule?.id}): ${expectedReward} Cr`);

  const finalizeRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/sessions/${masterclassId}/finalize-attendance`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${user1.token}`
    }
  }, {});

  if (finalizeRes.status !== 200 || !finalizeRes.body.success) {
    throw new Error('❌ Finalize attendance failed: ' + JSON.stringify(finalizeRes.body));
  }

  const finData = finalizeRes.body.data || finalizeRes.body;
  console.log('Finalize Response:', finData);

  if (finData.actualAttendees !== 5) {
    throw new Error(`❌ Expected 5 actualAttendees, got ${finData.actualAttendees}`);
  }
  if (finData.totalUsers !== totalPlatformUsers) {
    throw new Error(`❌ Expected totalUsers to be ${totalPlatformUsers}, got ${finData.totalUsers}`);
  }
  if (finData.rewardCredits !== expectedReward) {
    throw new Error(`❌ Expected rewardCredits to be ${expectedReward}, got ${finData.rewardCredits}`);
  }

  const user1After = await db.getAsync(`SELECT credits, lifetime_earned FROM users WHERE id = ?`, [user1.user.id]);
  console.log(`Creator (User 1) credits after finalization: ${user1After.credits} Cr`);

  const actualCreditDiff = Math.round((user1After.credits - user1Before.credits) * 100) / 100;
  if (actualCreditDiff !== expectedReward) {
    throw new Error(`❌ Creator credit increase mismatch! Expected +${expectedReward} Cr, but got +${actualCreditDiff} Cr`);
  }
  console.log(`✅ TEST 5 & 6 PASSED: Creator awarded exact attendance reward (+${expectedReward} Cr).`);

  // STEP 7: Credit Ledger / Transactions Verification
  console.log('\n--- Step 7: Credit Ledger & Transactions Verification ---');
  const rewardTx = await db.allAsync(
    `SELECT * FROM transactions WHERE reference_type = 'MASTERCLASS' AND reference_id = ?`,
    [masterclassId]
  );
  console.log(`Found ${rewardTx.length} transaction(s) for masterclass:`, rewardTx);
  if (expectedReward > 0) {
    if (rewardTx.length !== 1) {
      throw new Error(`❌ Expected exactly 1 reward transaction, got ${rewardTx.length}`);
    }
    if (rewardTx[0].user_id !== user1.user.id || Number(rewardTx[0].amount) !== expectedReward) {
      throw new Error(`❌ Transaction details incorrect: user_id=${rewardTx[0].user_id}, amount=${rewardTx[0].amount}`);
    }
  }
  console.log('✅ TEST 7 PASSED: Transaction recorded in credit ledger with reference_type=MASTERCLASS and correct amount.');

  // STEP 8: Idempotency Protection (Call Finalize a 2nd Time)
  console.log('\n--- Step 8: Idempotency & Duplicate Reward Protection ---');
  const secondFinalizeRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/sessions/${masterclassId}/finalize-attendance`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${user1.token}`
    }
  }, {});

  const secondData = secondFinalizeRes.body.data || secondFinalizeRes.body;
  console.log('Second Finalize Response:', secondData);
  if (!secondData.alreadyFinalized) {
    throw new Error('❌ Second finalize did not report alreadyFinalized=true!');
  }

  const user1AfterSecond = await db.getAsync(`SELECT credits FROM users WHERE id = ?`, [user1.user.id]);
  if (user1AfterSecond.credits !== user1After.credits) {
    throw new Error(`❌ Duplicate credits awarded on second finalize call! Was ${user1After.credits}, now ${user1AfterSecond.credits}`);
  }

  const rewardTxAfterSecond = await db.allAsync(
    `SELECT * FROM transactions WHERE reference_type = 'MASTERCLASS' AND reference_id = ?`,
    [masterclassId]
  );
  if (expectedReward > 0 && rewardTxAfterSecond.length !== 1) {
    throw new Error(`❌ Duplicate transaction created! Found ${rewardTxAfterSecond.length}`);
  }
  console.log('✅ TEST 8 PASSED: Duplicate reward prevented; idempotency strictly enforced.');

  // STEP 9: Non-Attendee Verification
  console.log('\n--- Step 9: Non-Attendee Verification ---');
  const u6InAttendance = await db.getAsync(
    `SELECT * FROM masterclass_attendance WHERE masterclass_id = ? AND user_id = ?`,
    [masterclassId, user6.user.id]
  );
  if (u6InAttendance) {
    throw new Error('❌ Non-attendee User 6 was found in masterclass_attendance!');
  }
  console.log('✅ TEST 9 PASSED: User 6 (registered but did not attend) was not counted in attendance.');

  // STEP 10: Check Session Status
  console.log('\n--- Step 10: Finalized Session Status in DB & "My Sessions" ---');
  const sessionInDb = await db.getAsync(`SELECT status, total_earned_credits FROM sessions WHERE id = ?`, [masterclassId]);
  if (sessionInDb.status !== 'ATTENDANCE_FINALIZED') {
    throw new Error(`❌ Session status in DB is not ATTENDANCE_FINALIZED! Found: ${sessionInDb.status}`);
  }
  console.log(`✅ Session in DB status: ${sessionInDb.status}, total_earned_credits: ${sessionInDb.total_earned_credits}`);

  console.log('\n🎉 ============================================================');
  console.log('🎉 ALL 10 MASTERCLASS REQUIREMENTS & TESTS PASSED WITH 100% SUCCESS!');
  console.log('🎉 ============================================================');
}

runMasterclassE2ETests().catch(err => {
  console.error('❌ Masterclass test failed with error:', err);
  process.exit(1);
});
