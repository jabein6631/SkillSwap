const http = require('http');

const BASE_URL = 'http://localhost:3000';

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data });
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

async function loginOrRegister(email, password, name, role = 'STUDENT') {
  let res = await request('POST', '/api/auth/login', { email, password });
  if (res.status === 200 && res.data.token) {
    return { token: res.data.token, user: res.data.user };
  }

  const regRes = await request('POST', '/api/auth/register', {
    name,
    email,
    password,
    role,
    college: 'Vignan University',
    major: 'Computer Science'
  });

  if (regRes.status === 200 || regRes.status === 201) {
    res = await request('POST', '/api/auth/login', { email, password });
    return { token: res.data.token, user: res.data.user };
  }

  throw new Error(`Auth failed for ${email}: ` + JSON.stringify(regRes.data));
}

async function runTests() {
  console.log('🧪 Starting Multi-User Doubt Visibility & Task Isolation Test Suite...\n');

  // Step 1: Authenticate 3 Distinct Personas
  const userA = await loginOrRegister('student_alice_test@vignan.ac.in', 'Password123!', 'Alice');
  const userB = await loginOrRegister('mentor_bob_test@vignan.ac.in', 'Password123!', 'Bob');
  const userMahi = await loginOrRegister('mahi_vis_test@vignan.ac.in', 'Password123!', 'Mahi');

  console.log(`✅ 1. Authenticated Users:`);
  console.log(`   - User A (Alice): ID=${userA.user.id}`);
  console.log(`   - User B (Bob): ID=${userB.user.id}`);
  console.log(`   - User C (Mahi): ID=${userMahi.user.id}\n`);

  // Step 2: User A creates a Doubt
  const createRes = await request('POST', '/api/support/doubts', {
    category: 'CODE_BUG',
    course: 'Python Programming & DSA',
    title: `Isolation Test: Recursion Limit Exceeded in Mergesort (${Date.now()})`,
    description: 'Encountered maximum recursion depth exceeded during merge operation.',
    codeSnippet: 'def mergesort(arr):\n    return mergesort(arr)'
  }, userA.token);

  if (createRes.status !== 201 && createRes.status !== 200) {
    throw new Error('User A could not create doubt: ' + JSON.stringify(createRes.data));
  }

  const doubtId = createRes.data.doubt.id;
  console.log(`✅ 2. User A (Alice) created Doubt: ${doubtId} (status = OPEN)`);

  // Step 3: Verify COMMON OPEN DOUBTS visibility
  const mahiOpenRes = await request('GET', '/api/support/doubts?status=OPEN', null, userMahi.token);
  const isPresentInOpen = (mahiOpenRes.data.doubts || []).some(d => d.id === doubtId);
  if (!isPresentInOpen) {
    throw new Error('Doubt #101 should be visible in Common Open Doubts for Mahi!');
  }
  console.log(`✅ 3. User C (Mahi) sees Doubt in COMMON OPEN DOUBTS.`);

  // Step 4: User B (Bob) accepts the Doubt
  const acceptRes = await request('POST', `/api/support/doubts/${doubtId}/accept`, {}, userB.token);
  if (acceptRes.status !== 200) {
    throw new Error('User B could not accept doubt: ' + JSON.stringify(acceptRes.data));
  }
  console.log(`✅ 4. User B (Bob) accepted Doubt ${doubtId} (status = ACCEPTED).`);

  // Step 5: Verify Isolation after Acceptance
  // User B (Bob) checks My Tasks
  const bobTasks = await request('GET', '/api/support/doubts?mine=true', null, userB.token);
  const bobHasIt = (bobTasks.data.doubts || []).some(d => d.id === doubtId);
  if (!bobHasIt) {
    throw new Error('User B must see the accepted doubt in My Tasks!');
  }
  console.log(`✅ 5a. User B (Bob) sees it in My Tasks.`);

  // User A (Alice) checks My Doubts
  const aliceDoubts = await request('GET', '/api/support/doubts?mine=true', null, userA.token);
  const aliceHasIt = (aliceDoubts.data.doubts || []).some(d => d.id === doubtId);
  if (!aliceHasIt) {
    throw new Error('User A must see their doubt in My Doubts!');
  }
  console.log(`✅ 5b. User A (Alice) sees it in My Doubts.`);

  // User C (Mahi) checks My Tasks (MUST NOT BE PRESENT)
  const mahiTasks = await request('GET', '/api/support/doubts?mine=true', null, userMahi.token);
  const mahiHasIt = (mahiTasks.data.doubts || []).some(d => d.id === doubtId);
  if (mahiHasIt) {
    throw new Error('FAILURE: User C (Mahi) MUST NOT see another user’s accepted doubt in My Tasks!');
  }
  console.log(`✅ 5c. User C (Mahi) does NOT see it in My Doubts / Tasks.`);

  // User C (Mahi) checks Common Open Doubts (MUST NO LONGER BE OPEN)
  const mahiOpenAfterRes = await request('GET', '/api/support/doubts?status=OPEN', null, userMahi.token);
  const isStillInOpen = (mahiOpenAfterRes.data.doubts || []).some(d => d.id === doubtId);
  if (isStillInOpen) {
    throw new Error('FAILURE: Accepted doubt must no longer appear in Open Doubts!');
  }
  console.log(`✅ 5d. Doubt disappeared from Open Doubts list after Bob accepted.`);

  // User C (Mahi) attempts to accept it (MUST GET 409 Conflict)
  const mahiAcceptAttempt = await request('POST', `/api/support/doubts/${doubtId}/accept`, {}, userMahi.token);
  if (mahiAcceptAttempt.status !== 409) {
    throw new Error(`Expected HTTP 409 Conflict on race/double accept, got ${mahiAcceptAttempt.status}`);
  }
  console.log(`✅ 5e. User C (Mahi) receives HTTP 409 Conflict attempting to accept already-accepted doubt.`);

  // Step 6: User B (Bob) submits Solution (status = RESOLVED)
  const answerRes = await request('POST', `/api/support/doubts/${doubtId}/answer`, {
    solution: 'Base case was missing in recursive subdivision. Added base condition `if len(arr) <= 1: return arr`.',
    classification: 'Level 2: Logic / Algorithm / State Bug',
    recommendedQuizSkill: 'Python Programming & DSA'
  }, userB.token);

  if (answerRes.status !== 200) {
    throw new Error('User B could not submit answer: ' + JSON.stringify(answerRes.data));
  }
  console.log(`✅ 6. User B (Bob) resolved Doubt ${doubtId} (status = RESOLVED).`);

  // Step 7: Verify Post-Resolution Task Visibility
  // User C (Mahi) checks My Tasks (MUST STILL NOT BE PRESENT)
  const mahiPostResolveTasks = await request('GET', '/api/support/doubts?mine=true', null, userMahi.token);
  const mahiHasResolvedInTasks = (mahiPostResolveTasks.data.doubts || []).some(d => d.id === doubtId);
  if (mahiHasResolvedInTasks) {
    throw new Error('FAILURE: Resolved doubt of unrelated user must NOT appear in Mahi’s My Tasks!');
  }
  console.log(`✅ 7a. User C (Mahi) does NOT have it in My Tasks after resolution.`);

  // User C (Mahi) checks Resolved Knowledge Base
  const mahiResolvedList = await request('GET', '/api/support/doubts?status=RESOLVED', null, userMahi.token);
  const mahiSeesInResolved = (mahiResolvedList.data.doubts || []).some(d => d.id === doubtId);
  if (!mahiSeesInResolved) {
    throw new Error('Resolved doubt should be visible in global Resolved knowledge base archive!');
  }
  console.log(`✅ 7b. User C (Mahi) can view it under Resolved Knowledge Base archive.`);

  // Step 8: User A (Alice) rates solution 5 Stars (≥ 3★)
  const rateRes = await request('POST', `/api/support/doubts/${doubtId}/rate`, {
    rating: 5,
    feedback: 'Fantastic and clear explanation, thank you!'
  }, userA.token);

  if (rateRes.status !== 200 || !rateRes.data.rewardReleased) {
    throw new Error('Rating failed or reward was not released: ' + JSON.stringify(rateRes.data));
  }
  console.log(`✅ 8. User A (Alice) rated 5 Stars. Mentor User B received +${rateRes.data.rewardAmount} Credits bounty.`);

  console.log('\n🎉 ALL TASK ISOLATION & USER VISIBILITY TESTS PASSED WITH 100% COMPLIANCE!');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err.message);
  process.exit(1);
});
