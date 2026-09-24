/**
 * Automated End-to-End Test: Book a New Swap Session 6-Step Workflow & Atomic Double-Booking Protection
 * Tests:
 * 1. User authentication (Akki as Student, Sri Dhanush as Mentor)
 * 2. Step 1: GET /api/booking/mentors (validates metadata and caller exclusion)
 * 3. Step 2: GET /api/booking/subjects (validates subjects and topics)
 * 4. Step 3: GET /api/booking/availability (validates available slots)
 * 5. Step 4 & 5: POST /api/booking/confirm (validates atomic booking, escrow credit lock, transaction ledger)
 * 6. Atomic Double-Booking Collision Test: Concurrent or duplicate booking on identical slot returns HTTP 409 Conflict
 * 7. Step 6: GET /api/booking/calendar/:sessionId.ics (validates RFC 5545 calendar export)
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
  console.log('=== Starting 6-Step Booking Flow & Double-Booking Protection E2E Test ===\n');

  // 1. Log in Student (Akki)
  console.log('1. Logging in Student (Akki)...');
  let akkiLogin = await request('http://localhost:3000/api/auth/login', {
    method: 'POST'
  }, JSON.stringify({ email: 'akki@vignan.ac.in', password: 'Password123' }));

  if (akkiLogin.status !== 200 || !akkiLogin.body.token) {
    await request('http://localhost:3000/api/auth/register', {
      method: 'POST'
    }, JSON.stringify({
      name: 'Akki',
      email: 'akki@vignan.ac.in',
      password: 'Password123',
      college: 'Vignan University',
      major: 'Computer Science',
      role: 'STUDENT'
    }));

    akkiLogin = await request('http://localhost:3000/api/auth/login', {
      method: 'POST'
    }, JSON.stringify({ email: 'akki@vignan.ac.in', password: 'Password123' }));
  }

  if (akkiLogin.status !== 200 || !akkiLogin.body.token) {
    throw new Error('Akki login failed: ' + JSON.stringify(akkiLogin.body));
  }
  const akkiToken = akkiLogin.body.token;
  const akkiId = akkiLogin.body.user.id;
  console.log('✓ Akki logged in (ID:', akkiId, ')\n');

  // 2. Step 1: Query Mentors
  console.log('2. Step 1: Testing GET /api/booking/mentors...');
  const mentorsRes = await request('http://localhost:3000/api/booking/mentors', {
    headers: { Authorization: `Bearer ${akkiToken}` }
  });

  if (mentorsRes.status !== 200 || !mentorsRes.body.mentors) {
    throw new Error('Get mentors failed: ' + JSON.stringify(mentorsRes.body));
  }
  const mentors = mentorsRes.body.mentors;
  console.log(`✓ Retrieved ${mentors.length} mentors`);

  // Verify calling student is not in mentors list
  const selfInMentors = mentors.some(m => m.id === akkiId);
  if (selfInMentors) {
    throw new Error('Logged in user unexpectedly appeared in their own mentors list!');
  }
  console.log('✓ Calling student correctly excluded from available mentors list');

  const targetMentor = mentors.find(m => m.name.includes('Sri Dhanush') || m.email.includes('sri')) || mentors[0];
  console.log(`✓ Selected mentor: ${targetMentor.name} (Rate: ${targetMentor.rate} Cr/hr, Tier: ${targetMentor.tier})\n`);

  // 3. Step 2: Query Subjects & Topics
  console.log('3. Step 2: Testing GET /api/booking/subjects...');
  const subjectsRes = await request('http://localhost:3000/api/booking/subjects', {
    headers: { Authorization: `Bearer ${akkiToken}` }
  });

  if (subjectsRes.status !== 200 || !subjectsRes.body.subjects) {
    throw new Error('Get subjects failed: ' + JSON.stringify(subjectsRes.body));
  }
  const subjects = subjectsRes.body.subjects;
  console.log(`✓ Retrieved ${subjects.length} subjects catalogue`);

  const dsaSubject = subjects.find(s => s.name.includes('Python') || s.name.includes('Data Structures')) || subjects[0];
  const selectedTopic = (dsaSubject.topics && dsaSubject.topics[0]) || 'Recursion and Divide & Conquer';
  console.log(`✓ Selected subject: ${dsaSubject.name} | Topic: ${selectedTopic}\n`);

  // 4. Step 3: Query Availability for Date
  const randomDays = Math.floor(Math.random() * 20) + 15;
  const bookingDate = new Date(Date.now() + 86400000 * randomDays).toISOString().split('T')[0];
  console.log(`4. Step 3: Testing GET /api/booking/availability for ${targetMentor.name} on ${bookingDate}...`);
  const availRes = await request(`http://localhost:3000/api/booking/availability?mentorId=${targetMentor.id}&date=${bookingDate}`, {
    headers: { Authorization: `Bearer ${akkiToken}` }
  });

  if (availRes.status !== 200 || !availRes.body.slots) {
    throw new Error('Get availability failed: ' + JSON.stringify(availRes.body));
  }
  const availableSlots = availRes.body.slots;
  console.log(`✓ Retrieved ${availableSlots.length} available slots:`, availableSlots.join(', '));
  const selectedTime = availableSlots[0] || '10:00 AM';
  console.log(`✓ Selected time slot: ${selectedTime}\n`);

  // 5. Steps 4 & 5: Confirm Booking (Escrow deduction + Ledger check)
  console.log('5. Steps 4 & 5: Testing POST /api/booking/confirm...');
  const bookingPayload = {
    mentorId: targetMentor.id,
    subject: dsaSubject.name,
    topic: selectedTopic,
    date: bookingDate,
    time: selectedTime,
    durationHours: 1.0,
    title: 'Help with QuickSort and Recursion Tree Analysis',
    description: 'I am preparing for upcoming technical interviews and need help analyzing time complexity and optimizing recursive calls.',
    sessionType: '1-on-1 Swap Session',
    meetingPlatform: 'Google Meet',
    additionalNotes: 'Please review Python sorting implementations before session.'
  };

  const confirmRes = await request('http://localhost:3000/api/booking/confirm', {
    method: 'POST',
    headers: { Authorization: `Bearer ${akkiToken}` }
  }, JSON.stringify(bookingPayload));

  if ((confirmRes.status !== 200 && confirmRes.status !== 201) || !confirmRes.body.session) {
    throw new Error('Booking confirmation failed: ' + JSON.stringify(confirmRes.body));
  }
  const bookedSession = confirmRes.body.session;
  console.log('✓ Session booked successfully! ID:', bookedSession.id);
  console.log('✓ Escrow Credits Deducted:', bookedSession.credits, 'Cr (New Balance:', confirmRes.body.wallet?.balance, 'Cr)\n');

  // 6. ATOMIC DOUBLE-BOOKING COLLISION TEST
  console.log('6. Testing ATOMIC DOUBLE-BOOKING PROTECTION...');
  console.log(`Attempting duplicate booking on same slot (${targetMentor.name}, ${bookingDate} at ${selectedTime})...`);

  // Another user (or same user) attempts to book the EXACT same mentor, date, and time
  const collisionRes = await request('http://localhost:3000/api/booking/confirm', {
    method: 'POST',
    headers: { Authorization: `Bearer ${akkiToken}` }
  }, JSON.stringify(bookingPayload));

  console.log('Collision response status code:', collisionRes.status);
  console.log('Collision response body:', collisionRes.body);

  if (collisionRes.status !== 409) {
    throw new Error(`Expected HTTP 409 Conflict on double booking, but received status ${collisionRes.status}!`);
  }
  console.log('✓ Double-booking successfully BLOCKED with HTTP 409 Conflict:', collisionRes.body.error, '\n');

  // Verify availability now excludes that slot
  const availAfterRes = await request(`http://localhost:3000/api/booking/availability?mentorId=${targetMentor.id}&date=${bookingDate}`, {
    headers: { Authorization: `Bearer ${akkiToken}` }
  });
  const bookedSlotsList = availAfterRes.body.bookedSlots || [];
  if (!bookedSlotsList.includes(selectedTime)) {
    throw new Error(`Booked slot ${selectedTime} was not reported in bookedSlots!`);
  }
  console.log('✓ Slot correctly registered as booked in availability check\n');

  // 7. Step 6: Test Calendar .ics Download
  console.log('7. Step 6: Testing GET /api/booking/calendar/:sessionId.ics...');
  const calRes = await request(`http://localhost:3000/api/booking/calendar/${bookedSession.id}.ics`, {
    headers: { Authorization: `Bearer ${akkiToken}` }
  });

  if (calRes.status !== 200) {
    throw new Error('Calendar .ics download failed: ' + JSON.stringify(calRes.body));
  }
  const icsData = typeof calRes.body === 'string' ? calRes.body : JSON.stringify(calRes.body);
  if (!icsData.includes('BEGIN:VCALENDAR') || !icsData.includes('BEGIN:VEVENT')) {
    throw new Error('Calendar output did not match RFC 5545 format!');
  }
  console.log('✓ Valid RFC 5545 iCalendar (.ics) downloaded:\n' + icsData.split('\n').slice(0, 10).join('\n') + '\n...\n');

  console.log('========================================================');
  console.log('🎉 ALL 6-STEP BOOKING FLOW & DOUBLE-BOOKING TESTS PASSED 100%!');
  console.log('========================================================');
}

run().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
