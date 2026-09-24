/**
 * test_halfway_credit_transfer_e2e.js
 * Comprehensive E2E automated test for Critical Credit Transfer Rule:
 * 1. User A (Mahi) books User B (Akki) for Python session (1 Credit, 1 hour).
 * 2. User A retains full available credits before 50% milestone.
 * 3. Cancel before 50% -> User A NO credit loss, User B NO credit received.
 * 4. Both join -> student_joined_at & teacher_joined_at recorded, meeting_started_at initialized.
 * 5. 50% Duration reached -> Atomic transfer: User A -= 1.0, User B += 1.0.
 * 6. User A ledger: 'Session Payment', -1.0, COMPLETED, Session ID.
 * 7. User B ledger: 'Session Earnings', +1.0, COMPLETED, Session ID.
 * 8. Duplicate Protection: Re-triggering milestone does NOT duplicate transfer or ledger.
 * 9. End/Cancel after 50% does NOT transfer or refund again.
 */

const BASE_URL = 'http://localhost:3000/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('===============================================================');
  console.log('🚀 RUNNING E2E TESTS: CRITICAL CREDIT TRANSFER RULE (50% DURATION)');
  console.log('===============================================================\n');

  // 1. Authenticate Mahi (User A) and Akki (User B)
  console.log('--- Step 1: Authenticate Users ---');
  const loginA = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'mahi@vignan.ac.in', password: 'Password123' })
  });
  assert(loginA.ok && loginA.data.token, 'User A (Mahi) logged in successfully');
  const tokenA = loginA.data.token;
  const userA = loginA.data.user;

  const loginB = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'akki@vignan.ac.in', password: 'Password123' })
  });
  assert(loginB.ok && loginB.data.token, 'User B (Akki) logged in successfully');
  const tokenB = loginB.data.token;
  const userB = loginB.data.user;

  // Fetch initial balances
  const balA_init = await request('/wallet/balance', { headers: { Authorization: `Bearer ${tokenA}` } });
  const balB_init = await request('/wallet/balance', { headers: { Authorization: `Bearer ${tokenB}` } });
  console.log(`Initial Balances -> User A (Mahi): ${balA_init.data.wallet.availableCredits} Cr | User B (Akki): ${balB_init.data.wallet.availableCredits} Cr`);

  // --- Step 2: Test Cancellation BEFORE 50% Duration ---
  console.log('\n--- Step 2: Test Cancellation BEFORE 50% Duration ---');
  const uniqueDate1 = `2026-11-${String(Math.floor(10 + Math.random() * 18))}`;
  const uniqueTime1 = `${Math.floor(1 + Math.random() * 9)}:${String(Math.floor(10 + Math.random() * 49))} AM`;
  const bookRes1 = await request('/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({
      mentorId: userB.id,
      tutorId: userB.id,
      subject: 'Python',
      skill: 'Python',
      hours: 1,
      rate: 1.0,
      credits: 1.0,
      date: uniqueDate1,
      time: uniqueTime1,
      topic: 'Pre-50% Cancellation Test',
      session_type: 'ONE_ON_ONE'
    })
  });
  assert(bookRes1.ok && bookRes1.data?.sessionId, `Booking created for pre-50% cancellation test (${bookRes1.data?.sessionId || JSON.stringify(bookRes1.data)})`);
  const sess1Id = bookRes1.data?.sessionId;

  // Verify User A balance is NOT deducted at booking
  const balA_afterBook1 = await request('/wallet/balance', { headers: { Authorization: `Bearer ${tokenA}` } });
  assert(
    Number(balA_afterBook1.data?.wallet?.availableCredits) === Number(balA_init.data?.wallet?.availableCredits),
    `User A available credits unchanged at booking: ${balA_afterBook1.data?.wallet?.availableCredits} Cr`
  );

  // User A cancels the request before 50%
  const cancelRes1 = await request(`/sessions/${sess1Id}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ reason: 'Student cancelled before session started' })
  });
  assert(cancelRes1.ok && cancelRes1.data?.success, 'Session cancelled before 50% successfully');

  // Verify balances: User A NO credit loss, User B NO credit received
  const balA_afterCancel1 = await request('/wallet/balance', { headers: { Authorization: `Bearer ${tokenA}` } });
  const balB_afterCancel1 = await request('/wallet/balance', { headers: { Authorization: `Bearer ${tokenB}` } });
  assert(
    Number(balA_afterCancel1.data?.wallet?.availableCredits) === Number(balA_init.data?.wallet?.availableCredits),
    `User A NO credit loss after pre-50% cancel: ${balA_afterCancel1.data?.wallet?.availableCredits} Cr`
  );
  assert(
    Number(balB_afterCancel1.data?.wallet?.availableCredits) === Number(balB_init.data?.wallet?.availableCredits),
    `User B NO credit received after pre-50% cancel: ${balB_afterCancel1.data?.wallet?.availableCredits} Cr`
  );

  // --- Step 3: Main Flow: Book -> Both Join -> 50% Duration Reached -> Atomic Transfer ---
  console.log('\n--- Step 3: Main Flow: Book -> Both Join -> 50% Duration Reached ---');
  const uniqueDate2 = `2026-12-${String(Math.floor(10 + Math.random() * 18))}`;
  const uniqueTime2 = `${Math.floor(1 + Math.random() * 9)}:${String(Math.floor(10 + Math.random() * 49))} PM`;
  const bookRes2 = await request('/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({
      mentorId: userB.id,
      tutorId: userB.id,
      subject: 'Python',
      skill: 'Python',
      hours: 1,
      rate: 1.0,
      credits: 1.0,
      date: uniqueDate2,
      time: uniqueTime2,
      topic: 'Critical 50% Duration Credit Transfer Test',
      session_type: 'ONE_ON_ONE'
    })
  });
  assert(bookRes2.ok && bookRes2.data?.sessionId, `Booking created for 50% transfer test (${bookRes2.data?.sessionId || JSON.stringify(bookRes2.data)})`);
  const sess2Id = bookRes2.data?.sessionId;

  // Accept session by User B (Mentor)
  const acceptRes = await request(`/sessions/${sess2Id}/accept`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` }
  });
  assert(acceptRes.ok && acceptRes.data.status === 'ACCEPTED', 'Mentor accepted session request');

  // Verify balance BEFORE payment
  const balA_beforeTransfer = await request('/wallet/balance', { headers: { Authorization: `Bearer ${tokenA}` } });
  const balB_beforeTransfer = await request('/wallet/balance', { headers: { Authorization: `Bearer ${tokenB}` } });
  const initialA_credits = Number(balA_beforeTransfer.data.wallet.availableCredits);
  const initialB_credits = Number(balB_beforeTransfer.data.wallet.availableCredits);
  console.log(`Before 50% Transfer -> User A: ${initialA_credits} Cr | User B: ${initialB_credits} Cr`);

  // Attempt transfer BEFORE both join -> should fail
  const earlyTransferAttempt = await request(`/sessions/${sess2Id}/check-halfway-payment`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  assert(!earlyTransferAttempt.ok, 'Transfer rejected before both participants join the room');

  // User A (Student) enters live meeting
  const joinA = await request(`/sessions/${sess2Id}/live-meeting`, {
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  assert(joinA.ok && joinA.data.session.student_joined_at, 'User A joined live meeting room (student_joined_at set)');

  // User B (Mentor) enters live meeting
  const joinB = await request(`/sessions/${sess2Id}/live-meeting`, {
    headers: { Authorization: `Bearer ${tokenB}` }
  });
  assert(joinB.ok && joinB.data.session.teacher_joined_at, 'User B joined live meeting room (teacher_joined_at set)');
  assert(joinB.data.session.meeting_started_at, 'Meeting started_at set once both joined');

  // Reach 50% duration milestone and trigger payment transfer
  console.log('Triggering 50% duration transfer...');
  const transferRes = await request(`/sessions/${sess2Id}/check-halfway-payment`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ force: true }) // Force threshold for automated test runner
  });
  assert(transferRes.ok && transferRes.data.success, '50% duration credit transfer executed successfully');
  assert(transferRes.data.payment_status === 'RELEASED', 'Session payment_status updated to RELEASED');
  assert(transferRes.data.transferredCredits === 1.0, 'Transferred exactly 1.0 Credit');

  // Verify Balances: User A -= 1.0, User B += 1.0
  const balA_afterTransfer = await request('/wallet/balance', { headers: { Authorization: `Bearer ${tokenA}` } });
  const balB_afterTransfer = await request('/wallet/balance', { headers: { Authorization: `Bearer ${tokenB}` } });
  const finalA_credits = Number(balA_afterTransfer.data.wallet.availableCredits);
  const finalB_credits = Number(balB_afterTransfer.data.wallet.availableCredits);

  console.log(`After 50% Transfer -> User A: ${finalA_credits} Cr (Expected: ${initialA_credits - 1.0}) | User B: ${finalB_credits} Cr (Expected: ${initialB_credits + 1.0})`);
  assert(
    Math.abs(finalA_credits - (initialA_credits - 1.0)) < 0.001,
    `User A balance decreased by exactly 1.0 Credit (${finalA_credits} Cr)`
  );
  assert(
    Math.abs(finalB_credits - (initialB_credits + 1.0)) < 0.001,
    `User B balance increased by exactly 1.0 Credit (${finalB_credits} Cr)`
  );

  // --- Step 4: Verify Transaction Ledgers for BOTH Users ---
  console.log('\n--- Step 4: Verify Transaction Ledgers for BOTH Users ---');
  const txA_res = await request('/wallet/transactions', { headers: { Authorization: `Bearer ${tokenA}` } });
  const txB_res = await request('/wallet/transactions', { headers: { Authorization: `Bearer ${tokenB}` } });

  const userA_tx = txA_res.data.transactions.find(t => t.reference_id === sess2Id && t.type === 'Session Payment');
  assert(!!userA_tx, 'User A has "Session Payment" ledger entry for this session ID');
  if (userA_tx) {
    assert(Number(userA_tx.amount) === -1.0, `User A impact is -1.0 Credit (${userA_tx.amount})`);
    assert(userA_tx.status === 'COMPLETED', `User A transaction status is COMPLETED (${userA_tx.status})`);
    assert(userA_tx.description.includes('Credit paid to'), `User A description is accurate (${userA_tx.description})`);
  }

  const userB_tx = txB_res.data.transactions.find(t => t.reference_id === sess2Id && t.type === 'Session Earnings');
  assert(!!userB_tx, 'User B has "Session Earnings" ledger entry for this session ID');
  if (userB_tx) {
    assert(Number(userB_tx.amount) === 1.0, `User B impact is +1.0 Credit (${userB_tx.amount})`);
    assert(userB_tx.status === 'COMPLETED', `User B transaction status is COMPLETED (${userB_tx.status})`);
    assert(userB_tx.description.includes('Credit earned from'), `User B description is accurate (${userB_tx.description})`);
  }

  // --- Step 5: Duplicate Protection ---
  console.log('\n--- Step 5: Duplicate Protection ---');
  const dupAttempt = await request(`/sessions/${sess2Id}/check-halfway-payment`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ force: true })
  });
  assert(dupAttempt.ok && dupAttempt.data.alreadyReleased === true, 'Duplicate transfer prevented (alreadyReleased: true)');

  const balA_afterDup = await request('/wallet/balance', { headers: { Authorization: `Bearer ${tokenA}` } });
  const balB_afterDup = await request('/wallet/balance', { headers: { Authorization: `Bearer ${tokenB}` } });
  assert(
    Number(balA_afterDup.data.wallet.availableCredits) === finalA_credits,
    `User A balance NOT debited again on duplicate call (${balA_afterDup.data.wallet.availableCredits} Cr)`
  );
  assert(
    Number(balB_afterDup.data.wallet.availableCredits) === finalB_credits,
    `User B balance NOT credited again on duplicate call (${balB_afterDup.data.wallet.availableCredits} Cr)`
  );

  // --- Step 6: Session Conclusion / Finalize After 50% ---
  console.log('\n--- Step 6: Conclude Session After 50% ---');
  const completeRes = await request(`/sessions/${sess2Id}/finalize`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ attendanceStatus: 'Attended' })
  });
  assert(completeRes.ok && completeRes.data.success, 'Session concluded successfully');

  // Verify balances did NOT change again upon conclusion
  const balA_final = await request('/wallet/balance', { headers: { Authorization: `Bearer ${tokenA}` } });
  const balB_final = await request('/wallet/balance', { headers: { Authorization: `Bearer ${tokenB}` } });
  assert(
    Number(balA_final.data.wallet.availableCredits) === finalA_credits,
    `User A balance unchanged after session conclusion: ${balA_final.data.wallet.availableCredits} Cr`
  );
  assert(
    Number(balB_final.data.wallet.availableCredits) === finalB_credits,
    `User B balance unchanged after session conclusion: ${balB_final.data.wallet.availableCredits} Cr`
  );

  console.log('\n===============================================================');
  console.log(`🏁 TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
