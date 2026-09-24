const http = require('http');

async function postJson(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    };
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(raw) });
        } catch (e) {
          resolve({ status: res.statusCode, raw });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function getJson(path, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'GET',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    };
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(raw) });
        } catch (e) {
          resolve({ status: res.statusCode, raw });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  console.log('--- 1. Login as sri ---');
  const loginRes = await postJson('/api/auth/login', { email: 'sri@vignan.ac.in', password: 'Password123' });
  const token = loginRes.data.token;
  console.log('Login success:', !!token, 'User:', loginRes.data.user?.name);

  console.log('\n--- 2. Fetch Eligible Assessment Subjects ---');
  const subjectsRes = await getJson('/api/quizzes/subjects', token);
  console.log('Total eligible subjects:', subjectsRes.data.subjects?.length);
  subjectsRes.data.subjects?.forEach(s => {
    console.log(` - ${s.skill_name} [${s.category}] Tier: ${s.tier}, Best Score: ${s.quiz_score}%`);
  });

  console.log('\n--- 3. Generate Java Full Stack Assessment (Attempt 1) ---');
  const javaGen1 = await postJson('/api/quizzes/generate', {
    skillName: 'Java Full Stack Development',
    questionCount: 20,
    difficulty: 'Mixed',
    assessmentType: 'Complete Mentor Assessment'
  }, token);

  const quiz1 = javaGen1.data.assessment;
  console.log('Quiz 1 ID:', quiz1.id);
  console.log('Title:', quiz1.title);
  console.log('Total Questions:', quiz1.questions?.length);
  console.log('Time Limit:', quiz1.time_limit_minutes, 'mins');
  console.log('Max Marks:', quiz1.max_marks);

  const hasPythonInJava = quiz1.questions.some(q => 
    q.question.toLowerCase().includes('python') || 
    (q.code_snippet && q.code_snippet.toLowerCase().includes('def '))
  );
  console.log('Purity Check: Has Python in Java quiz?', hasPythonInJava);

  console.log('\nSample Java Questions:');
  quiz1.questions.slice(0, 4).forEach((q, i) => {
    console.log(`  ${i+1}. ${q.question}`);
    console.log(`     Snippet: ${q.code_snippet ? q.code_snippet.split('\n')[0] : 'None'}`);
    console.log(`     Correct: Option ${q.correct_option_index + 1} (${q.options[q.correct_option_index]})`);
  });

  console.log('\n--- 4. Generate Java Full Stack Assessment (Attempt 2 - Freshness Check) ---');
  const javaGen2 = await postJson('/api/quizzes/generate', {
    skillName: 'Java Full Stack Development',
    questionCount: 20,
    difficulty: 'Mixed',
    assessmentType: 'Complete Mentor Assessment'
  }, token);
  const quiz2 = javaGen2.data.assessment;
  const isFresh = quiz1.questions[0].question !== quiz2.questions[0].question;
  console.log('Freshness Check: Is Question 1 different in Attempt 2?', isFresh);

  console.log('\n--- 5. Submit Java Assessment & Verify Subject Isolation ---');
  // Build answers: answer 18 out of 20 correctly (+3 * 18 - 1 * 2 = 52 / 60 = 87%)
  const answers = {};
  quiz1.questions.forEach((q, i) => {
    if (i < 18) {
      answers[q.id] = q.correct_option_index; // correct
    } else {
      answers[q.id] = (q.correct_option_index + 1) % 4; // wrong
    }
  });

  const submitRes = await postJson('/api/quizzes/submit', {
    quizId: quiz1.id,
    skillName: 'Java Full Stack Development',
    answers
  }, token);

  console.log('Submission result:');
  console.log('  Total:', submitRes.data.totalQuestions);
  console.log('  Correct:', submitRes.data.correctCount);
  console.log('  Wrong:', submitRes.data.wrongCount);
  console.log('  Marks Obtained:', submitRes.data.marksObtained, '/', submitRes.data.maxMarks);
  console.log('  Score %:', submitRes.data.scorePercent + '%');
  console.log('  Passed:', submitRes.data.passed);
  console.log('  Tier Awarded:', submitRes.data.tierAwarded);

  console.log('\n--- 6. Verify Database Subject Isolation in skills_offered ---');
  const updatedSubjectsRes = await getJson('/api/quizzes/subjects', token);
  console.log('User subjects after Java assessment:');
  updatedSubjectsRes.data.subjects?.forEach(s => {
    console.log(` - ${s.skill_name}: Score = ${s.quiz_score}%, Tier = ${s.tier}`);
  });

  const pythonSkill = updatedSubjectsRes.data.subjects.find(s => s.skill_name.includes('Python'));
  const javaSkill = updatedSubjectsRes.data.subjects.find(s => s.skill_name.includes('Java'));

  console.log('\nSubject Isolation Assertions:');
  console.log('  Java skill recorded score:', javaSkill?.quiz_score === submitRes.data.scorePercent);
  console.log('  Python skill untouched (score = 95):', pythonSkill?.quiz_score === 95);
})();
