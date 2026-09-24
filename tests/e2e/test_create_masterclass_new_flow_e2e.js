/**
 * Automated End-to-End Test: New Dedicated Create Group Masterclass Flow
 * Tests:
 * 1. User login (Sri Dhanush)
 * 2. Save as Draft Masterclass (status = 'DRAFT')
 * 3. Create Confirmed Masterclass with all rich fields (status = 'Confirmed')
 * 4. Verify Masterclass appears in Creator's "My Masterclasses" tab
 * 5. Verify Masterclass is PUBLIC and visible in another user's (Akki) "Group Sessions" tab
 * 6. Free join registration for peer without credit fee
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

async function run() {
  console.log('=== Starting Create Masterclass New Flow E2E Test ===\n');

  // 1. Login as Sri Dhanush (Creator)
  console.log('1. Logging in as Sri Dhanush...');
  const loginResSri = await request('http://localhost:3000/api/auth/login', {
    method: 'POST'
  }, JSON.stringify({ email: 'sri@vignan.ac.in', password: 'Password123' }));

  if (loginResSri.status !== 200 || !loginResSri.body.token) {
    throw new Error('Sri login failed: ' + JSON.stringify(loginResSri.body));
  }
  const tokenSri = loginResSri.body.token;
  console.log('✓ Sri logged in successfully (User ID:', loginResSri.body.user.id, ')\n');

  // 2. Login as Akki (Peer Student)
  console.log('2. Logging in as Akki...');
  const loginResAkki = await request('http://localhost:3000/api/auth/login', {
    method: 'POST'
  }, JSON.stringify({ email: 'akki@vignan.ac.in', password: 'Password123' }));

  if (loginResAkki.status !== 200 || !loginResAkki.body.token) {
    throw new Error('Akki login failed: ' + JSON.stringify(loginResAkki.body));
  }
  const tokenAkki = loginResAkki.body.token;
  console.log('✓ Akki logged in successfully (User ID:', loginResAkki.body.user.id, ')\n');

  // 3. Save a Draft Masterclass
  console.log('3. Creating Masterclass as DRAFT...');
  const draftPayload = {
    title: 'Advanced System Design (Draft Edition)',
    skillName: 'Web Development',
    subject: 'Web Development',
    category: 'Backend Development',
    description: 'Draft notes on distributed caching, sharding, and microservices.',
    date: '2026-09-20',
    time: '04:00 PM',
    durationHours: 1.5,
    platform: 'SkillSwap Live Room',
    maxParticipants: 20,
    session_series_type: 'One-time Masterclass',
    learning_details: '• Caching architectures\n• DB sharding strategies',
    tags: ['system-design', 'backend', 'caching'],
    credits_per_attendee: 1.5,
    minimum_academic_level: '3rd Year',
    prerequisites: 'Basic backend and DB knowledge',
    status: 'DRAFT'
  };

  const draftRes = await request('http://localhost:3000/api/sessions/cohort', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenSri}` }
  }, JSON.stringify(draftPayload));

  if (draftRes.status !== 201 && draftRes.status !== 200) {
    throw new Error('Draft creation failed: ' + JSON.stringify(draftRes.body));
  }
  console.log('✓ Draft masterclass created:', draftRes.body.session?.title, '(Status:', draftRes.body.session?.status, ')\n');

  // 4. Create a Confirmed Public Masterclass
  console.log('4. Creating Confirmed Public Masterclass with all rich fields...');
  const confirmedPayload = {
    title: 'Complete React.js & Vite from Basics to Deployment',
    skillName: 'React.js',
    subject: 'React.js',
    category: 'Frontend Development',
    description: 'Hands-on session building modern web applications with React 19, hooks, and clean state patterns.',
    date: '2026-09-22',
    time: '06:00 PM',
    durationHours: 2.0,
    platform: 'Google Meet',
    maxParticipants: 50,
    session_series_type: 'One-time Masterclass',
    learning_details: '• Component design and custom hooks\n• Optimizing rerenders\n• Real-world deployment on Vercel',
    tags: ['react', 'frontend', 'javascript', 'web-development'],
    credits_per_attendee: 1.0,
    minimum_academic_level: 'Any',
    prerequisites: 'Basic HTML, CSS, and modern JS',
    status: 'Confirmed'
  };

  const confRes = await request('http://localhost:3000/api/sessions/cohort', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenSri}` }
  }, JSON.stringify(confirmedPayload));

  if (confRes.status !== 201 && confRes.status !== 200) {
    throw new Error('Confirmed Masterclass creation failed: ' + JSON.stringify(confRes.body));
  }
  const createdSession = confRes.body.session;
  console.log('✓ Confirmed Masterclass created:', createdSession.title, '(ID:', createdSession.id, ')\n');

  // 5. Verify Creator sees it in My Masterclasses
  console.log('5. Verifying Creator (Sri) sees session in My Masterclasses...');
  const sriSessionsRes = await request('http://localhost:3000/api/sessions/my-sessions', {
    headers: { Authorization: `Bearer ${tokenSri}` }
  });

  const masterclassesSri = sriSessionsRes.body.masterclasses || [];
  const foundInSri = masterclassesSri.some(m => m.id === createdSession.id || m.title === confirmedPayload.title);
  if (!foundInSri) {
    throw new Error('Confirmed Masterclass not found in Sri\'s masterclasses list!');
  }
  console.log('✓ Masterclass found in Sri\'s hosted masterclasses list (Count:', masterclassesSri.length, ')\n');

  // 6. Verify Akki sees it in PUBLIC Group Sessions
  console.log('6. Verifying Peer (Akki) sees session in PUBLIC Group Sessions...');
  const akkiSessionsRes = await request('http://localhost:3000/api/sessions/my-sessions', {
    headers: { Authorization: `Bearer ${tokenAkki}` }
  });

  const groupsAkki = akkiSessionsRes.body.groups || [];
  const foundInAkki = groupsAkki.some(g => g.id === createdSession.id || g.title === confirmedPayload.title);
  if (!foundInAkki) {
    throw new Error('Confirmed Masterclass is NOT visible in Akki\'s group sessions list!');
  }
  console.log('✓ Masterclass successfully visible to Akki under Group Sessions (Total public groups:', groupsAkki.length, ')\n');

  // 7. Test Akki registering for the Masterclass (Free Join)
  console.log('7. Testing Akki registering for the Masterclass (Free Join)...');
  const enrollRes = await request('http://localhost:3000/api/sessions/cohort/enroll', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenAkki}` }
  }, JSON.stringify({ cohortSessionId: createdSession.id }));

  if (enrollRes.status !== 200) {
    throw new Error('Akki enroll failed: ' + JSON.stringify(enrollRes.body));
  }
  console.log('✓ Akki registered successfully:', enrollRes.body.message, '(Attendee Count:', enrollRes.body.session?.current_attendees, ')\n');

  console.log('========================================================');
  console.log('🎉 ALL CREATE MASTERCLASS NEW FLOW TESTS PASSED 100%!');
  console.log('========================================================');
}

run().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
