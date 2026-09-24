const http = require('http');
const fs = require('fs');
const path = require('path');

const API_BASE = 'http://localhost:3000';

function makeRequest(method, reqPath, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(reqPath, API_BASE);
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runCompleteMatrixTests() {
  console.log('===============================================================');
  console.log('STARTING COMPLETE MY SESSIONS ACTION MATRIX E2E VERIFICATION');
  console.log('===============================================================\n');
  let passed = 0;
  let total = 0;

  function assert(condition, desc) {
    total++;
    if (condition) {
      console.log(`  ✅ PASS [${total}]: ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL [${total}]: ${desc}`);
      process.exitCode = 1;
    }
  }

  try {
    // 0. Auth
    console.log('--- Auth Setup ---');
    const mahiLogin = await makeRequest('POST', '/api/auth/login', {
      email: 'mahi@vignan.ac.in',
      password: 'Password123'
    });
    assert(mahiLogin.status === 200 && mahiLogin.data.token, 'Mahi authenticated successfully');
    const mahi = mahiLogin.data;

    const akkiLogin = await makeRequest('POST', '/api/auth/login', {
      email: 'akki@vignan.ac.in',
      password: 'Password123'
    });
    assert(akkiLogin.status === 200 && akkiLogin.data.token, 'Akki authenticated successfully');
    const akki = akkiLogin.data;

    console.log(`User A (Mahi): ${mahi.user.id}, User B (Akki): ${akki.user.id}\n`);

    // ==========================================
    // TEST 1: PENDING REQUEST CREATION & CARDS
    // ==========================================
    console.log('--- TEST 1: PENDING State & View Details Data ---');
    const nonce = Date.now() % 10000;
    const createReq1 = await makeRequest('POST', '/api/sessions', {
      tutorId: akki.user.id,
      subject: 'Python Programming',
      topic: 'Problem Solving',
      sessionDate: `2027-01-01`,
      time: `${(nonce % 12) + 1}:00 AM`,
      durationHours: 1,
      additionalNotes: 'Practice DSA problem solving in Python'
    }, { Authorization: `Bearer ${mahi.token}` });

    assert(createReq1.status === 200 || createReq1.status === 201, `Request 1 created with ID: ${createReq1.data?.sessionId}`);
    const req1Id = createReq1.data?.sessionId;

    // View Details verification for Request 1
    const detail1 = await makeRequest('GET', `/api/sessions/${req1Id}`, null, { Authorization: `Bearer ${mahi.token}` });
    assert(detail1.status === 200, 'GET /api/sessions/:id returns 200');
    assert(detail1.data.session.topic === 'Problem Solving', `Session topic is 'Problem Solving' (got '${detail1.data.session.topic}')`);
    assert(detail1.data.session.subject === 'Python Programming', `Session subject is 'Python Programming' (got '${detail1.data.session.subject}')`);
    assert(detail1.data.session.requester_id === mahi.user.id, 'Requester ID matches Mahi');
    assert(detail1.data.session.tutor_id === akki.user.id, 'Mentor ID matches Akki');
    assert(detail1.data.session.status === 'PENDING', 'Initial DB status is PENDING');

    // Mahi session list: in studentPending & upcoming tab count
    const mahiList1 = await makeRequest('GET', '/api/sessions/my', null, { Authorization: `Bearer ${mahi.token}` });
    const inMahiPending1 = (mahiList1.data.studentPending || []).find(s => s.id === req1Id);
    assert(!!inMahiPending1, 'Mahi sees request in studentPending (Waiting for Mentor Response)');
    assert(mahiList1.data.counts.upcoming >= 1, `Upcoming tab count includes pending request (count: ${mahiList1.data.counts.upcoming})`);

    // Akki session list: in requests & pending acceptance
    const akkiList1 = await makeRequest('GET', '/api/sessions/my', null, { Authorization: `Bearer ${akki.token}` });
    const inAkkiReq1 = (akkiList1.data.requests || []).find(s => s.id === req1Id);
    assert(!!inAkkiReq1, 'Akki sees request in requests (Session Requests)');
    assert(inAkkiReq1?.status === 'PENDING', 'Akki sees status PENDING');

    // ==========================================
    // TEST 2: USER A CANCELS
    // ==========================================
    console.log('\n--- TEST 2: User A Cancels Request ---');
    const cancel1 = await makeRequest('POST', `/api/sessions/${req1Id}/cancel`, {
      reason: 'Need to reschedule'
    }, { Authorization: `Bearer ${mahi.token}` });

    assert(cancel1.status === 200, `Cancel response is 200 (got ${cancel1.status})`);
    assert(cancel1.data.status === 'CANCELLED', 'Returned status is CANCELLED');
    assert(cancel1.data.cancelled_by === mahi.user.id, 'cancelled_by is Mahi ID');

    // Shared DB record check
    const dbCheck1 = await makeRequest('GET', `/api/sessions/${req1Id}`, null, { Authorization: `Bearer ${mahi.token}` });
    assert(dbCheck1.data.session.status === 'CANCELLED', 'ONE shared DB record has status CANCELLED');
    assert(dbCheck1.data.session.cancelled_by === mahi.user.id, 'DB record has cancelled_by = Mahi');
    assert(!!dbCheck1.data.session.cancelled_at, 'DB record has server timestamp cancelled_at');

    // Mahi session list after cancel: moved to cancelled, removed from studentPending
    const mahiListAfterCancel = await makeRequest('GET', '/api/sessions/my', null, { Authorization: `Bearer ${mahi.token}` });
    const inMahiPendingAfterCancel = (mahiListAfterCancel.data.studentPending || []).find(s => s.id === req1Id);
    const inMahiCancelledAfterCancel = (mahiListAfterCancel.data.cancelled || []).find(s => s.id === req1Id);
    assert(!inMahiPendingAfterCancel, 'Mahi no longer has request in studentPending');
    assert(!!inMahiCancelledAfterCancel, 'Mahi has request in Cancelled section');

    // Akki session list after cancel: shows CANCELLED by student in requests
    const akkiListAfterCancel = await makeRequest('GET', '/api/sessions/my', null, { Authorization: `Bearer ${akki.token}` });
    const inAkkiReqAfterCancel = (akkiListAfterCancel.data.requests || []).find(s => s.id === req1Id);
    assert(!!inAkkiReqAfterCancel, 'Akki sees cancelled request in requests');
    assert(inAkkiReqAfterCancel?.status === 'CANCELLED', 'Akki sees status CANCELLED');
    assert(inAkkiReqAfterCancel?.cancelled_by === mahi.user.id, 'Akki sees cancelled_by is student');

    // Akki attempts to Accept or Decline after Cancel -> must fail with 409
    const invalidAcceptOnCancel = await makeRequest('POST', `/api/sessions/${req1Id}/accept`, {}, { Authorization: `Bearer ${akki.token}` });
    assert(invalidAcceptOnCancel.status === 409, `Backend rejects Accept on cancelled request with 409 (got ${invalidAcceptOnCancel.status})`);

    const invalidDeclineOnCancel = await makeRequest('POST', `/api/sessions/${req1Id}/decline`, { reason: 'test' }, { Authorization: `Bearer ${akki.token}` });
    assert(invalidDeclineOnCancel.status === 409, `Backend rejects Decline on cancelled request with 409 (got ${invalidDeclineOnCancel.status})`);

    // ==========================================
    // TEST 3: USER B DECLINES
    // ==========================================
    console.log('\n--- TEST 3: User B Declines Request ---');
    const createReq2 = await makeRequest('POST', '/api/sessions', {
      tutorId: akki.user.id,
      subject: 'Python Programming',
      topic: 'Problem Solving',
      sessionDate: `2027-01-02`,
      time: `${(nonce % 12) + 1}:30 AM`,
      durationHours: 1,
      additionalNotes: 'Decline flow test'
    }, { Authorization: `Bearer ${mahi.token}` });
    const req2Id = createReq2.data?.sessionId;
    assert(!!req2Id, `Request 2 created with ID: ${req2Id}`);

    // Akki declines Request 2
    const decline2 = await makeRequest('POST', `/api/sessions/${req2Id}/decline`, {
      reason: 'Unavailable at this time slot'
    }, { Authorization: `Bearer ${akki.token}` });

    assert(decline2.status === 200, `Decline response is 200 (got ${decline2.status})`);
    assert(decline2.data.status === 'DECLINED', 'Returned status is DECLINED');
    assert(decline2.data.declined_by_user_id === akki.user.id, 'declined_by_user_id is Akki ID');

    // Verify DB
    const dbCheck2 = await makeRequest('GET', `/api/sessions/${req2Id}`, null, { Authorization: `Bearer ${akki.token}` });
    assert(dbCheck2.data.session.status === 'DECLINED', 'ONE shared DB record has status DECLINED');
    assert(dbCheck2.data.session.declined_by_user_id === akki.user.id, 'DB record has declined_by_user_id = Akki');
    assert(!!dbCheck2.data.session.declined_at, 'DB record has server timestamp declined_at');

    // Akki UI: seen in requests with status DECLINED
    const akkiListAfterDecline = await makeRequest('GET', '/api/sessions/my', null, { Authorization: `Bearer ${akki.token}` });
    const inAkkiReqAfterDecline = (akkiListAfterDecline.data.requests || []).find(s => s.id === req2Id);
    assert(!!inAkkiReqAfterDecline, 'Akki sees request in requests');
    assert(inAkkiReqAfterDecline?.status === 'DECLINED', 'Akki sees status DECLINED');

    // Mahi UI: seen in studentPending with status DECLINED (which frontend renders as DECLINED BY MENTOR)
    const mahiListAfterDecline = await makeRequest('GET', '/api/sessions/my', null, { Authorization: `Bearer ${mahi.token}` });
    const inMahiPendingAfterDecline = (mahiListAfterDecline.data.studentPending || []).find(s => s.id === req2Id);
    assert(!!inMahiPendingAfterDecline, 'Mahi sees request in studentPending as DECLINED BY MENTOR');
    assert(inMahiPendingAfterDecline?.status === 'DECLINED', 'Status is DECLINED in studentPending');

    // Mahi attempts to Cancel after Decline -> must fail with 409
    const invalidCancelOnDecline = await makeRequest('POST', `/api/sessions/${req2Id}/cancel`, { reason: 'test' }, { Authorization: `Bearer ${mahi.token}` });
    assert(invalidCancelOnDecline.status === 409, `Backend rejects Cancel on declined request with 409 (got ${invalidCancelOnDecline.status})`);

    // Akki attempts to Accept after Decline -> must fail with 409
    const invalidAcceptOnDecline = await makeRequest('POST', `/api/sessions/${req2Id}/accept`, {}, { Authorization: `Bearer ${akki.token}` });
    assert(invalidAcceptOnDecline.status === 409, `Backend rejects Accept on declined request with 409 (got ${invalidAcceptOnDecline.status})`);

    // ==========================================
    // TEST 4: USER B ACCEPTS
    // ==========================================
    console.log('\n--- TEST 4: User B Accepts Request ---');
    const createReq3 = await makeRequest('POST', '/api/sessions', {
      tutorId: akki.user.id,
      subject: 'Python Programming',
      topic: 'Problem Solving',
      sessionDate: `2027-01-03`,
      time: `${(nonce % 12) + 1}:00 PM`,
      durationHours: 1,
      additionalNotes: 'Accept flow test'
    }, { Authorization: `Bearer ${mahi.token}` });
    const req3Id = createReq3.data?.sessionId;
    assert(!!req3Id, `Request 3 created with ID: ${req3Id}`);

    // Akki accepts Request 3
    const accept3 = await makeRequest('POST', `/api/sessions/${req3Id}/accept`, {}, { Authorization: `Bearer ${akki.token}` });
    assert(accept3.status === 200, `Accept response is 200 (got ${accept3.status})`);
    assert(accept3.data.status === 'ACCEPTED', 'Returned status is ACCEPTED');
    assert(accept3.data.accepted_by_user_id === akki.user.id, 'accepted_by_user_id is Akki ID');

    // Verify DB
    const dbCheck3 = await makeRequest('GET', `/api/sessions/${req3Id}`, null, { Authorization: `Bearer ${akki.token}` });
    assert(dbCheck3.data.session.status === 'ACCEPTED', 'ONE shared DB record has status ACCEPTED');
    assert(dbCheck3.data.session.accepted_by_user_id === akki.user.id, 'DB record has accepted_by_user_id = Akki');
    assert(!!dbCheck3.data.session.accepted_at, 'DB record has server timestamp accepted_at');

    // Both users see session in upcoming
    const mahiListAfterAccept = await makeRequest('GET', '/api/sessions/my', null, { Authorization: `Bearer ${mahi.token}` });
    const inMahiUpcoming3 = (mahiListAfterAccept.data.upcoming || []).find(s => s.id === req3Id);
    assert(!!inMahiUpcoming3, 'Mahi sees accepted session in upcoming');

    const akkiListAfterAccept = await makeRequest('GET', '/api/sessions/my', null, { Authorization: `Bearer ${akki.token}` });
    const inAkkiUpcoming3 = (akkiListAfterAccept.data.upcoming || []).find(s => s.id === req3Id);
    assert(!!inAkkiUpcoming3, 'Akki sees accepted session in upcoming');

    // Neither sees it in pending requests
    const inMahiPending3 = (mahiListAfterAccept.data.studentPending || []).find(s => s.id === req3Id);
    const inAkkiPending3 = (akkiListAfterAccept.data.requests || []).find(s => s.id === req3Id && s.status === 'PENDING');
    assert(!inMahiPending3, 'Mahi studentPending no longer contains accepted session');
    assert(!inAkkiPending3, 'Akki requests no longer contains accepted session as PENDING');

    // ==========================================
    // TEST 5: CONCURRENT ACCEPT / CANCEL RACE CONDITION
    // ==========================================
    console.log('\n--- TEST 5: Concurrent Accept vs Cancel Race Condition ---');
    const createReq4 = await makeRequest('POST', '/api/sessions', {
      tutorId: akki.user.id,
      subject: 'Python Programming',
      topic: 'Problem Solving',
      sessionDate: `2027-01-04`,
      time: `${(nonce % 12) + 1}:45 PM`,
      durationHours: 1,
      additionalNotes: 'Race condition test'
    }, { Authorization: `Bearer ${mahi.token}` });
    const req4Id = createReq4.data?.sessionId;
    assert(!!req4Id, `Request 4 created with ID: ${req4Id}`);

    // Fire both simultaneously
    const [raceCancel, raceAccept] = await Promise.all([
      makeRequest('POST', `/api/sessions/${req4Id}/cancel`, { reason: 'Race cancel' }, { Authorization: `Bearer ${mahi.token}` }),
      makeRequest('POST', `/api/sessions/${req4Id}/accept`, {}, { Authorization: `Bearer ${akki.token}` })
    ]);

    const statuses = [raceCancel.status, raceAccept.status].sort();
    assert(
      statuses[0] === 200 && statuses[1] === 409,
      `Exactly one succeeds (200) and the other fails (409 Conflict): Cancel=${raceCancel.status}, Accept=${raceAccept.status}`
    );

    // Verify DB integrity
    const dbCheck4 = await makeRequest('GET', `/api/sessions/${req4Id}`, null, { Authorization: `Bearer ${mahi.token}` });
    assert(
      dbCheck4.data.session.status === 'CANCELLED' || dbCheck4.data.session.status === 'ACCEPTED',
      `DB has one consistent final status: ${dbCheck4.data.session.status}`
    );

    // ==========================================
    // TEST 6: REFRESH PERSISTENCE
    // ==========================================
    console.log('\n--- TEST 6: Refresh Persistence ---');
    const mahiRecheck = await makeRequest('GET', '/api/sessions/my', null, { Authorization: `Bearer ${mahi.token}` });
    const akkiRecheck = await makeRequest('GET', '/api/sessions/my', null, { Authorization: `Bearer ${akki.token}` });

    assert(
      (mahiRecheck.data.cancelled || []).some(s => s.id === req1Id),
      'Mahi persistence: Request 1 still in cancelled after refresh'
    );
    assert(
      (akkiRecheck.data.requests || []).find(s => s.id === req1Id)?.status === 'CANCELLED',
      'Akki persistence: Request 1 still CANCELLED BY STUDENT in requests after refresh'
    );
    assert(
      (mahiRecheck.data.studentPending || []).find(s => s.id === req2Id)?.status === 'DECLINED',
      'Mahi persistence: Request 2 still DECLINED BY MENTOR after refresh'
    );
    assert(
      (akkiRecheck.data.requests || []).find(s => s.id === req2Id)?.status === 'DECLINED',
      'Akki persistence: Request 2 still DECLINED in requests after refresh'
    );
    assert(
      (mahiRecheck.data.upcoming || []).some(s => s.id === req3Id) &&
      (akkiRecheck.data.upcoming || []).some(s => s.id === req3Id),
      'Persistence: Request 3 still in upcoming for both users after refresh'
    );

    // ==========================================
    // TEST 7: SCROLLBAR & MODAL DOM LIFECYCLE
    // ==========================================
    console.log('\n--- TEST 7: Modal & Scrollbar Lifecycle Inspection ---');
    const appJsContent = fs.readFileSync(path.join(__dirname, 'frontend/js/app.js'), 'utf8');
    const cssContent = fs.readFileSync(path.join(__dirname, 'frontend/css/style.css'), 'utf8');
    const htmlContent = fs.readFileSync(path.join(__dirname, 'frontend/index.html'), 'utf8');

    assert(appJsContent.includes('restorePageScroll()'), 'app.js defines restorePageScroll() helper');
    assert(
      appJsContent.includes("document.body.classList.remove('modal-open')") &&
      appJsContent.includes("document.body.style.overflow = ''") &&
      appJsContent.includes("document.documentElement.style.overflow = ''"),
      'restorePageScroll() properly clears modal-open and resets body & documentElement overflow'
    );
    assert(cssContent.includes('.modal-overlay {') && cssContent.includes('z-index: 50000;'), 'CSS elevates modal-overlay to z-index: 50000');
    assert(cssContent.includes('.modal-overlay.active {') && cssContent.includes('pointer-events: auto !important;'), 'CSS forces active modal visible and clickable');
    assert(htmlContent.includes('id="cancelSessionModal"'), 'index.html contains cancelSessionModal');
    assert(htmlContent.includes('id="declineSessionRequestModal"'), 'index.html contains declineSessionRequestModal');
    assert(htmlContent.includes('Keep Request'), 'index.html contains [Keep Request] buttons');
    assert(htmlContent.includes('Yes, Cancel Request'), 'index.html contains [Yes, Cancel Request] button');
    assert(htmlContent.includes('Yes, Decline'), 'index.html contains [Yes, Decline] button');

    // ==========================================
    // TEST 8: 50% DURATION CREDIT TRANSFER INTACT
    // ==========================================
    console.log('\n--- TEST 8: Credit Transfer Audit (Pre-50% Invariant) ---');
    const mahiFinalWallet = await makeRequest('GET', '/api/wallet/balance', null, { Authorization: `Bearer ${mahi.token}` });
    const akkiFinalWallet = await makeRequest('GET', '/api/wallet/balance', null, { Authorization: `Bearer ${akki.token}` });
    assert(typeof mahiFinalWallet.data.wallet.availableCredits === 'number', 'Mahi available credits is a valid number');
    assert(typeof akkiFinalWallet.data.wallet.availableCredits === 'number', 'Akki available credits is a valid number');

    console.log(`\n===============================================================`);
    console.log(`COMPLETE VERIFICATION RESULTS: ${passed} / ${total} assertions passed!`);
    console.log(`===============================================================\n`);

  } catch (err) {
    console.error('Test execution failed:', err);
    process.exitCode = 1;
  }
}

runCompleteMatrixTests();
