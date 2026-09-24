const http = require('http');

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

async function login(email, password, name = 'Test User') {
  let res = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email, password });

  if (!res.body?.token) {
    // Attempt registration
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

  if (!res.body?.token) throw new Error(`Login failed for ${email}: ` + JSON.stringify(res.body));
  return { token: res.body.token, user: res.body.user };
}

async function runE2ETests() {
  console.log('🧪 Starting End-to-End Support & Multi-Attachment Test Flow...');

  // 1. Login User A (Pujitha), User B (Bharath), User C (Taman)
  const userA = await login('pujitha@vignan.ac.in', 'Password123');
  const userB = await login('bharath@vignan.ac.in', 'Password123');
  const userC = await login('taman@vignan.ac.in', 'Password123');
  console.log('✅ 1. Authenticated User A (Pujitha), User B (Bharath), User C (Taman)');

  // 2. User A creates Doubt with 2 attachments (Python code and PNG screenshot)
  const samplePyCode = `def quicksort(arr):
    if len(arr) <= 1:
        return arr
    pivot = arr[0]
    # BUG: recursive infinite partition
    return quicksort([x for x in arr if x <= pivot]) + [pivot] + quicksort([x for x in arr if x > pivot])`;
  const samplePyBase64 = `data:text/x-python;base64,${Buffer.from(samplePyCode).toString('base64')}`;
  
  const samplePngBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkWPjfDwAE4wG8a8J4WAAAAABJRU5ErkJggg==';

  const createRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/support/doubts',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userA.token}`
    }
  }, {
    title: 'Recursion depth exceeded in quicksort partition',
    description: 'I implemented quicksort in Python but encountering maximum recursion depth exceeded. Attached my source code and error terminal screenshot.',
    category: 'Code Bug / Error',
    course: 'Python Programming & DSA',
    codeSnippet: samplePyCode,
    attachments: [
      {
        name: 'quicksort_bug.py',
        type: 'text/x-python',
        size: Buffer.byteLength(samplePyCode),
        data: samplePyBase64
      },
      {
        name: 'error_terminal.png',
        type: 'image/png',
        size: 1200,
        data: samplePngBase64
      }
    ]
  });

  if (createRes.status !== 201 || !createRes.body.success) {
    throw new Error('Create Doubt failed: ' + JSON.stringify(createRes.body));
  }

  const createdDoubt = createRes.body.doubt;
  console.log(`✅ 2. User A created Doubt ID: ${createdDoubt.id} with ${createdDoubt.attachments.length} attachments.`);

  // 3. User B views Doubt and its attachments in Support Hub
  const getDoubtsRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/support/doubts',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${userB.token}` }
  });

  const doubtFound = getDoubtsRes.body.doubts.find(d => d.id === createdDoubt.id);
  if (!doubtFound) throw new Error('Doubt not found in common support hub for User B');
  if (!doubtFound.attachments || doubtFound.attachments.length !== 2) {
    throw new Error(`Expected 2 attachments on doubt, found: ${doubtFound.attachments?.length}`);
  }
  console.log(`✅ 3. User B successfully sees Doubt #${createdDoubt.id} with ${doubtFound.attachments.length} attachments in Support Desk.`);

  // 4. Test downloading student attachment
  const att1 = doubtFound.attachments[0];
  const downloadRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/support/attachments/${att1.id}/download`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${userB.token}` }
  });

  if (downloadRes.status !== 200 || !downloadRes.raw.includes('def quicksort')) {
    throw new Error('Download attachment failed: ' + downloadRes.raw);
  }
  console.log(`✅ 4. User B successfully downloaded attachment "${att1.file_name}" via secure backend download endpoint.`);

  // 5. User B accepts the doubt
  const acceptRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/support/doubts/${createdDoubt.id}/accept`,
    method: 'POST',
    headers: { 'Authorization': `Bearer ${userB.token}` }
  });

  if (acceptRes.status !== 200 || !acceptRes.body.success) {
    throw new Error('Accept doubt failed: ' + JSON.stringify(acceptRes.body));
  }
  console.log(`✅ 5. User B accepted Doubt #${createdDoubt.id}.`);

  // 6. User C attempts to accept same doubt -> receives 409 Conflict
  const raceRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/support/doubts/${createdDoubt.id}/accept`,
    method: 'POST',
    headers: { 'Authorization': `Bearer ${userC.token}` }
  });

  if (raceRes.status !== 409) {
    throw new Error(`Expected 409 Conflict for User C, got status: ${raceRes.status}`);
  }
  console.log('✅ 6. User C received 409 Conflict attempting to accept already accepted doubt.');

  // 7. User B submits solution with 2 answer attachments
  const fixedPyCode = `def quicksort(arr):
    if len(arr) <= 1:
        return arr
    pivot = arr[0]
    less = [x for x in arr[1:] if x <= pivot]
    greater = [x for x in arr[1:] if x > pivot]
    return quicksort(less) + [pivot] + quicksort(greater)`;
  const fixedPyBase64 = `data:text/x-python;base64,${Buffer.from(fixedPyCode).toString('base64')}`;

  const answerRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/support/doubts/${createdDoubt.id}/answer`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userB.token}`
    }
  }, {
    solution: 'Your recursion depth exceeded error was caused by including the pivot inside `[x for x in arr if x <= pivot]`. Partitioning `arr[1:]` avoids infinite recursion.',
    classification: 'Level 2: Logic / State / Edge Case',
    recommendedQuizSkill: 'Python Programming & DSA',
    attachments: [
      {
        name: 'fixed_quicksort.py',
        type: 'text/x-python',
        size: Buffer.byteLength(fixedPyCode),
        data: fixedPyBase64
      },
      {
        name: 'quicksort_diagram.png',
        type: 'image/png',
        size: 980000,
        data: samplePngBase64
      }
    ]
  });

  if (answerRes.status !== 200 || !answerRes.body.success) {
    throw new Error('Submit answer failed: ' + JSON.stringify(answerRes.body));
  }
  console.log(`✅ 7. User B submitted verified solution with 2 solution attachments (+${answerRes.body.rewardEarned} Cr earned).`);

  // 8. User A checks resolved doubt & downloads answer attachment
  const doubtDetailRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/support/doubts/${createdDoubt.id}`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${userA.token}` }
  });

  const resolvedDoubt = doubtDetailRes.body.doubt;
  if (resolvedDoubt.status !== 'RESOLVED') {
    throw new Error(`Expected status RESOLVED, got: ${resolvedDoubt.status}`);
  }
  if (!resolvedDoubt.answer_attachments || resolvedDoubt.answer_attachments.length !== 2) {
    throw new Error(`Expected 2 answer attachments, got: ${resolvedDoubt.answer_attachments?.length}`);
  }

  const ansAtt1 = resolvedDoubt.answer_attachments[0];
  const downloadAnsRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/support/attachments/${ansAtt1.id}/download`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${userA.token}` }
  });

  if (downloadAnsRes.status !== 200 || !downloadAnsRes.raw.includes('quicksort(less)')) {
    throw new Error('Download answer attachment failed: ' + downloadAnsRes.raw);
  }
  console.log(`✅ 8. User A successfully verified resolved doubt and downloaded mentor's solution attachment "${ansAtt1.file_name}".`);

  // 9. User A rates 4 Stars (>= 3 Stars) releasing the +1.0 Cr bounty to Mentor User B
  const rateRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/support/doubts/${createdDoubt.id}/rate`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userA.token}`
    }
  }, { rating: 4, feedback: 'Excellent solution!' });

  if (rateRes.status !== 200 || !rateRes.body.rewardReleased) {
    throw new Error('Rating reward release failed: ' + JSON.stringify(rateRes.body));
  }
  console.log(`✅ 9. User A rated 4 Stars! Mentor User B successfully received +${rateRes.body.rewardAmount} Credits bounty.`);

  console.log('\n🎉 ALL MULTI-ATTACHMENT & 3-STAR RATING SUPPORT SYSTEM E2E TESTS PASSED SUCCESSFULLY!');
}

runE2ETests().catch(err => {
  console.error('❌ E2E Test Failed:', err);
  process.exit(1);
});
