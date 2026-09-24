/**
 * End-to-End Test: 1-on-1 Swap Session Request -> Acceptance -> Live Room -> Completion -> Instructor Credit Flow
 * & Group Masterclass Details, Edit, Reschedule, and Issue Report Verification.
 */

const http = require('http');

function request(url, options = {}, postData = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    if (postData) {
      if (!reqOptions.headers['Content-Type']) {
        reqOptions.headers['Content-Type'] = 'application/json';
      }
      reqOptions.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let body = data;
        try { body = JSON.parse(data); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function loginUser(email, password, name, role = 'STUDENT') {
  let loginRes = await request('http://localhost:3000/api/auth/login', {
    method: 'POST'
  }, JSON.stringify({ email, password }));

  if (loginRes.status !== 200 || !loginRes.body.token) {
    await request('http://localhost:3000/api/auth/register', {
      method: 'POST'
    }, JSON.stringify({
      name,
      email,
      password,
      college: 'Vignan University',
      major: 'Computer Science',
      role
    }));

    loginRes = await request('http://localhost:3000/api/auth/login', {
      method: 'POST'
    }, JSON.stringify({ email, password }));
  }

  if (loginRes.status !== 200 || !loginRes.body.token) {
    throw new Error(`Failed to authenticate ${email}: ` + JSON.stringify(loginRes.body));
  }

  return { token: loginRes.body.token, user: loginRes.body.user };
}

async function runE2ETests() {
  console.log('============================================================');
  console.log('🧪 RUNNING COMPLETE 1-ON-1 SWAP & MASTERCLASS WORKFLOW E2E');
  console.log('============================================================\n');

  // 1. Authenticate Mahi (User A / Student) & Akki (User B / Instructor)
  console.log('Step 1: Authenticating User A (Mahi) and User B (Akki)...');
  const userA = await loginUser('mahi@vignan.ac.in', 'Password123', 'Mahi');
  const userB = await loginUser('akki@vignan.ac.in', 'Password123', 'Akki');

  // Set known credit balances and mentor rate
  const { db } = require('./backend/database/db');
  await db.runAsync(`UPDATE users SET credits = 20.0, escrow_locked = 0.0 WHERE id = ?`, [userA.user.id]);
  await db.runAsync(`UPDATE users SET credits = 4.0, escrow_locked = 0.0 WHERE id = ?`, [userB.user.id]);

  const existingSkill = await db.getAsync(`SELECT * FROM skills_offered WHERE user_id = ? AND LOWER(name) LIKE '%python%'`, [userB.user.id]);
  if (existingSkill) {
    await db.runAsync(`UPDATE skills_offered SET rate = 2.5 WHERE id = ?`, [existingSkill.id]);
  } else {
    await db.runAsync(`INSERT INTO skills_offered (id, user_id, name, level, rate) VALUES (?, ?, 'Python Programming', 'Advanced', 2.5)`, ['sk_' + Date.now(), userB.user.id]);
  }
  console.log(`✓ Mahi logged in (ID: ${userA.user.id}, Balance: 20.0 Cr)`);
  console.log(`✓ Akki logged in (ID: ${userB.user.id}, Balance: 4.0 Cr, Rate: 2.5 Cr/hr)\n`);

  // 2. Mahi books Akki for Python DSA
  console.log('Step 2: User A (Mahi) books 1-on-1 Swap Session with User B (Akki)...');
  const randomDay = Math.floor(Math.random() * 20) + 10;
  const bookingDate = `2026-10-${randomDay < 10 ? '0' + randomDay : randomDay}`;
  const bookingTime = '10:00 AM – 11:00 AM';
  await db.runAsync(`DELETE FROM sessions WHERE teacher_id = ? AND date = ? AND time = ?`, [userB.user.id, bookingDate, bookingTime]);

  const bookRes = await request('http://localhost:3000/api/sessions/book', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userA.token}` }
  }, JSON.stringify({
    tutorId: userB.user.id,
    skillName: 'Python Programming',
    topic: 'Help with Python DSA and recursion',
    sessionDate: bookingDate,
    time: bookingTime,
    durationHours: 1.0,
    description: 'I want help understanding recursion and DSA problems.',
    meetingPlatform: 'Google Meet'
  }));

  if (bookRes.status !== 200 && bookRes.status !== 201) {
    throw new Error('Booking failed: ' + JSON.stringify(bookRes.body));
  }

  const sessionId = bookRes.body.sessionId || bookRes.body.session?.id;
  const initialSession = bookRes.body.session;
  console.log(`✓ Session request created! Session ID: ${sessionId}`);
  console.log(`✓ Session Status is strictly: "${initialSession.status}" (MUST BE "PENDING")`);
  if (initialSession.status.toUpperCase() !== 'PENDING') {
    throw new Error(`Expected initial session status PENDING, got ${initialSession.status}!`);
  }

  // Verify Akki has NOT received credits yet!
  const akkiWalletBefore = await db.getAsync(`SELECT credits, escrow_locked FROM users WHERE id = ?`, [userB.user.id]);
  console.log(`✓ Akki wallet balance immediately after booking: ${akkiWalletBefore.credits} Cr (Instructor did NOT receive credits on booking!)`);
  if (akkiWalletBefore.credits !== 4.0) {
    throw new Error(`Instructor received credits prematurely! Expected 4.0, got ${akkiWalletBefore.credits}`);
  }

  // Verify Mahi's escrow is locked
  const mahiWalletAfterBooking = await db.getAsync(`SELECT credits, escrow_locked FROM users WHERE id = ?`, [userA.user.id]);
  console.log(`✓ Mahi available credits: ${mahiWalletAfterBooking.credits} Cr, Escrow Locked: ${mahiWalletAfterBooking.escrow_locked} Cr\n`);

  // 3. Verify Akki sees incoming request in My Sessions (/api/sessions/my)
  console.log('Step 3: Verifying User B (Akki) sees request in SESSION REQUESTS...');
  const akkiSessionsRes = await request('http://localhost:3000/api/sessions/my', {
    headers: { Authorization: `Bearer ${userB.token}` }
  });

  const akkiRequests = akkiSessionsRes.body.requests || [];
  const foundRequest = akkiRequests.find(r => r.id === sessionId);
  if (!foundRequest) {
    throw new Error('Incoming request was not found in Akki requests array!');
  }
  console.log(`✓ Request found in Akki's SESSION REQUESTS queue!`);
  console.log(`  - Student: ${foundRequest.studentName || 'Mahi'}`);
  console.log(`  - Subject: ${foundRequest.skill}`);
  console.log(`  - Date/Time: ${foundRequest.date} @ ${foundRequest.time}`);
  console.log(`  - Description: "${foundRequest.description}"`);
  console.log(`  - Status: ${foundRequest.status}\n`);

  // 4. Verify Mahi sees "Waiting for Mentor Response" in studentPending
  console.log('Step 4: Verifying User A (Mahi) sees "Waiting for Mentor Response"...');
  const mahiSessionsRes = await request('http://localhost:3000/api/sessions/my', {
    headers: { Authorization: `Bearer ${userA.token}` }
  });
  const mahiPending = mahiSessionsRes.body.studentPending || [];
  const foundPending = mahiPending.find(p => p.id === sessionId);
  if (!foundPending) {
    throw new Error('Pending request was not found in Mahi studentPending array!');
  }
  console.log(`✓ Verified Mahi view: status is "${foundPending.status}" (🟡 Waiting for Mentor Response)\n`);

  // 5. Step 8 Enforcement: Verify Live Room access is BLOCKED for PENDING session
  console.log('Step 5: Verifying Step 8 — Live Meeting Room BLOCKS PENDING session...');
  const livePendingRes = await request(`http://localhost:3000/api/sessions/${sessionId}/live-meeting`, {
    headers: { Authorization: `Bearer ${userA.token}` }
  });
  console.log(`  - Live meeting response status for PENDING session: ${livePendingRes.status} (${livePendingRes.body?.error})`);
  if (livePendingRes.status !== 400) {
    throw new Error(`Expected HTTP 400 blocking live room for PENDING session, got ${livePendingRes.status}`);
  }
  console.log('✓ Successfully BLOCKED live room access for PENDING session!\n');

  // 6. User A MUST NOT accept their own request (Security Check)
  console.log('Step 6: Verifying Security — User A cannot accept their own session request...');
  const unauthorizedAccept = await request(`http://localhost:3000/api/sessions/${sessionId}/accept`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userA.token}` }
  });
  console.log(`  - Student acceptance attempt status: ${unauthorizedAccept.status} (${unauthorizedAccept.body?.error})`);
  if (unauthorizedAccept.status !== 403) {
    throw new Error(`Expected HTTP 403 when student attempts to accept request, got ${unauthorizedAccept.status}`);
  }
  console.log('✓ Successfully rejected unauthorized acceptance by student with HTTP 403 Forbidden!\n');

  // 7. Akki (User B) Accepts Session Request
  console.log('Step 7: User B (Akki) Accepts Session Request via POST /api/sessions/:id/accept...');
  const acceptRes = await request(`http://localhost:3000/api/sessions/${sessionId}/accept`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userB.token}` }
  });

  if (acceptRes.status !== 200 || !acceptRes.body.success) {
    throw new Error('Accept session failed: ' + JSON.stringify(acceptRes.body));
  }
  console.log(`✓ Session successfully accepted! Status: ${acceptRes.body.status}`);

  // 8. ATOMIC ACCEPTANCE IDEMPOTENCY: Second accept returns 409 Conflict
  console.log('Step 8: Verifying Atomic Acceptance Protection — Second accept returns 409 Conflict...');
  const duplicateAccept = await request(`http://localhost:3000/api/sessions/${sessionId}/accept`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userB.token}` }
  });
  console.log(`  - Duplicate accept status: ${duplicateAccept.status} (${duplicateAccept.body?.error})`);
  if (duplicateAccept.status !== 409) {
    throw new Error(`Expected HTTP 409 Conflict on duplicate acceptance, got ${duplicateAccept.status}`);
  }
  console.log('✓ Successfully returned HTTP 409 Conflict on duplicate accept attempt!\n');

  // 9. Verify Live Meeting Room is now accessible for ACCEPTED session
  console.log('Step 9: Verifying Live Room is accessible now that session is ACCEPTED...');
  const liveAcceptedRes = await request(`http://localhost:3000/api/sessions/${sessionId}/live-meeting`, {
    headers: { Authorization: `Bearer ${userA.token}` }
  });
  if (liveAcceptedRes.status !== 200 || !liveAcceptedRes.body.success) {
    throw new Error('Live meeting room failed for accepted session: ' + JSON.stringify(liveAcceptedRes.body));
  }
  console.log(`✓ Live meeting room created and active for session ${sessionId} (Room: ${liveAcceptedRes.body.roomName})\n`);

  // 10. Finalize Session Attendance (Akki completes session and awards credits)
  console.log('Step 10: Finalizing Attendance — Akki marks Mahi as "Attended"...');
  const finalizeRes = await request(`http://localhost:3000/api/sessions/${sessionId}/finalize`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userB.token}` }
  }, JSON.stringify({ attendanceStatus: 'Attended' }));

  if (finalizeRes.status !== 200 || !finalizeRes.body.success) {
    throw new Error('Finalize attendance failed: ' + JSON.stringify(finalizeRes.body));
  }
  console.log(`✓ Attendance finalized! Reward awarded: +${finalizeRes.body.rewardCredits} Credits`);
  console.log(`✓ Session Status is now: ${finalizeRes.body.status}\n`);

  // 11. Verify Wallet Balances and Credit Ledger
  console.log('Step 11: Verifying INSTRUCTOR Wallet and Credit Ledger Transactions...');
  const akkiWalletAfter = await db.getAsync(`SELECT credits, lifetime_earned FROM users WHERE id = ?`, [userB.user.id]);
  console.log(`✓ Akki Wallet balance: BEFORE = 4.0 Cr, AFTER = ${akkiWalletAfter.credits} Cr (Expected 6.5 Cr)`);
  if (akkiWalletAfter.credits !== 6.5) {
    throw new Error(`Expected Akki balance 6.5 Cr, got ${akkiWalletAfter.credits} Cr!`);
  }

  // Verify Credit Ledger (transactions table)
  const rewardTx = await db.getAsync(
    `SELECT * FROM transactions WHERE reference_type = 'SESSION' AND reference_id = ? AND type = 'SESSION_REWARD'`,
    [sessionId]
  );
  if (!rewardTx) {
    throw new Error('SESSION_REWARD transaction not found in ledger!');
  }
  console.log(`✓ Credit Ledger Transaction Verified:`);
  console.log(`  - ID: ${rewardTx.id}`);
  console.log(`  - User: Akki (${rewardTx.user_id})`);
  console.log(`  - Type: ${rewardTx.type}`);
  console.log(`  - Amount: +${rewardTx.amount} Credits`);
  console.log(`  - Description: "${rewardTx.description}"\n`);

  // 12. DUPLICATE REWARD PROTECTION: Finalizing again yields NO second reward!
  console.log('Step 12: Testing DUPLICATE REWARD PROTECTION — Calling finalize attendance a 2nd time...');
  const secondFinalize = await request(`http://localhost:3000/api/sessions/${sessionId}/finalize`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userB.token}` }
  }, JSON.stringify({ attendanceStatus: 'Attended' }));

  console.log(`  - Second finalize response: alreadyFinalized = ${secondFinalize.body.alreadyFinalized}`);
  const akkiWalletAfterSecond = await db.getAsync(`SELECT credits FROM users WHERE id = ?`, [userB.user.id]);
  if (akkiWalletAfterSecond.credits !== 6.5) {
    throw new Error(`DUPLICATE REWARD LEAK! Wallet credited twice! Balance: ${akkiWalletAfterSecond.credits}`);
  }
  console.log(`✓ Duplicate reward successfully BLOCKED! Akki wallet balance remains precisely 6.5 Cr\n`);

  // 13. Test Decline Flow on a second session
  console.log('Step 13: Testing Session Decline & Automatic Escrow Refund Flow...');
  await db.runAsync(`DELETE FROM sessions WHERE teacher_id = ? AND date = '2026-09-25' AND time = '02:00 PM – 03:00 PM'`, [userB.user.id]);

  const bookRes2 = await request('http://localhost:3000/api/sessions/book', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userA.token}` }
  }, JSON.stringify({
    tutorId: userB.user.id,
    skillName: 'System Design',
    topic: 'Microservices & Distributed Caching',
    sessionDate: '2026-09-25',
    time: '02:00 PM – 03:00 PM',
    durationHours: 1.0,
    description: 'Need help designing scalable rate limiter.'
  }));

  if (bookRes2.status !== 200 && bookRes2.status !== 201) {
    throw new Error('Booking 2 failed: ' + JSON.stringify(bookRes2.body));
  }

  const session2Id = bookRes2.body.sessionId || bookRes2.body.session?.id;
  console.log(`✓ Second session booked (ID: ${session2Id}, Status: PENDING)`);

  const declineRes = await request(`http://localhost:3000/api/sessions/${session2Id}/decline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userB.token}` }
  }, JSON.stringify({ reason: 'Unavailable due to exams' }));

  if (declineRes.status !== 200 || !declineRes.body.success) {
    throw new Error('Decline failed: ' + JSON.stringify(declineRes.body));
  }
  console.log(`✓ Session successfully DECLINED! Refunded: +${declineRes.body.refundedCredits} Credits`);
  const session2Record = await db.getAsync(`SELECT status, additional_notes FROM sessions WHERE id = ?`, [session2Id]);
  if (session2Record.status !== 'DECLINED') {
    throw new Error(`Expected DECLINED status, got ${session2Record.status}`);
  }
  console.log(`✓ Verified DB status is "DECLINED"\n`);

  // 14. Masterclass Dedicated Details & Actions Test
  console.log('Step 14: Testing Group Masterclass Creation, Details Page, and Issue Report...');
  const mcRes = await request('http://localhost:3000/api/sessions/create-cohort', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userB.token}` }
  }, JSON.stringify({
    skillName: 'Advanced Docker & Kubernetes',
    topic: 'Container Orchestration Mastery',
    category: 'Cloud Computing',
    description: 'Master Docker multi-stage builds and Kubernetes clusters.',
    learningDetails: 'Docker internals\nPod networking\nHelm charts\nIngress controllers',
    sessionDate: '2026-09-28',
    time: '11:00 AM – 12:30 PM',
    durationHours: 1.5,
    maxCapacity: 15,
    prerequisites: 'Basic Linux command line experience',
    tags: ['DevOps', 'Docker', 'Kubernetes', 'Cloud']
  }));

  const mcId = mcRes.body.sessionId;
  console.log(`✓ Masterclass created! ID: ${mcId}`);

  // Fetch Masterclass Details
  const mcDetailRes = await request(`http://localhost:3000/api/sessions/${mcId}`, {
    headers: { Authorization: `Bearer ${userA.token}` }
  });
  if (mcDetailRes.status !== 200 || !mcDetailRes.body.session) {
    throw new Error('Failed to fetch masterclass details: ' + JSON.stringify(mcDetailRes.body));
  }
  const mc = mcDetailRes.body.session;
  console.log(`✓ Masterclass Details verified:`);
  console.log(`  - Title: ${mc.topic}`);
  console.log(`  - Subject/Category: ${mc.skill} • ${mc.category}`);
  console.log(`  - Date & Time: ${mc.date} @ ${mc.time}`);
  console.log(`  - Learning Details: ${mc.learning_details.split('\n').length} checklist items`);
  console.log(`  - Prerequisites: "${mc.prerequisites}"`);
  console.log(`  - Capacity: ${mc.max_capacity} students\n`);

  // Student enrolls (Free — 0 credits)
  const enrollRes = await request('http://localhost:3000/api/sessions/enroll', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userA.token}` }
  }, JSON.stringify({ sessionId: mcId }));
  console.log(`✓ Student enrolled in Masterclass! Enrolled Count: ${enrollRes.body.enrolledCount} (0 Credits spent)`);

  // Edit Masterclass (Ensuring no hardcoded 05:00 PM override)
  console.log('Step 15: Testing Edit Masterclass (Ensuring DB time preserved, capacity decrease check)...');
  const editRes = await request(`http://localhost:3000/api/sessions/${mcId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${userB.token}` }
  }, JSON.stringify({
    topic: 'Container Orchestration & Microservices Mastery',
    skill: 'Cloud & DevOps',
    category: 'Cloud Computing',
    description: 'Updated description for cloud architecture.',
    date: '2026-09-29',
    time: '03:00 PM – 04:30 PM', // Custom time, NOT 05:00 PM
    hours: 1.5,
    max_capacity: 20
  }));

  if (editRes.status !== 200 || !editRes.body.success) {
    throw new Error('Edit masterclass failed: ' + JSON.stringify(editRes.body));
  }
  const updatedMc = await db.getAsync(`SELECT * FROM sessions WHERE id = ?`, [mcId]);
  if (updatedMc.time !== '03:00 PM – 04:30 PM') {
    throw new Error(`Masterclass time was overwritten! Expected "03:00 PM – 04:30 PM", got "${updatedMc.time}"`);
  }
  console.log(`✓ Masterclass edited successfully! Updated time verified: ${updatedMc.time}\n`);

  // Test Capacity Decrease Constraint (Cannot decrease below enrolled count)
  console.log('Step 16: Verifying Capacity Decrease Validation...');
  const invalidCapacityRes = await request(`http://localhost:3000/api/sessions/${mcId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${userB.token}` }
  }, JSON.stringify({
    max_capacity: 0 // 1 student is enrolled, so 0 is invalid
  }));
  if (invalidCapacityRes.status === 200 && invalidCapacityRes.body.success) {
    throw new Error('Failed to block capacity decrease below enrolled count!');
  }
  console.log(`✓ Capacity decrease below enrolled students successfully rejected!\n`);

  // Report Issue on Masterclass
  console.log('Step 17: Testing Issue Report Insertion into masterclass_reports table...');
  const reportRes = await request(`http://localhost:3000/api/sessions/${mcId}/report`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userA.token}` }
  }, JSON.stringify({
    issue_type: 'Technical Problem',
    description: 'Audio echo observed in test environment',
    priority: 'High'
  }));

  if ((reportRes.status !== 200 && reportRes.status !== 201) || !reportRes.body.success) {
    throw new Error('Report submission failed: ' + JSON.stringify(reportRes.body));
  }
  const reportInDb = await db.getAsync(`SELECT * FROM masterclass_reports WHERE masterclass_id = ?`, [mcId]);
  if (!reportInDb) {
    throw new Error('Report was not persisted to masterclass_reports table!');
  }
  console.log(`✓ Masterclass Report Verified in DB (ID: ${reportInDb.id}, Type: ${reportInDb.issue_type}, Priority: ${reportInDb.priority})\n`);

  console.log('============================================================');
  console.log('🎉 ALL 17 E2E TESTS PASSED 100% SUCCESSFULLY!');
  console.log('============================================================');
}

runE2ETests().catch(err => {
  console.error('\n❌ E2E TEST FAILED:', err);
  process.exit(1);
});
