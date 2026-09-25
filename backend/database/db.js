require('dotenv').config();
const path = require('path');
const { createClient } = require('@libsql/client');

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || process.env.TURSO_AUTH_NTOKE;

let isTurso = false;
let tursoClient = null;
let sqliteDb = null;

if (TURSO_URL && TURSO_TOKEN) {
  try {
    tursoClient = createClient({
      url: TURSO_URL,
      authToken: TURSO_TOKEN
    });
    isTurso = true;
    console.log('✅ Turso libSQL Cloud Database connected at:', TURSO_URL);
  } catch (err) {
    console.error('⚠️ Failed to initialize Turso client, falling back to SQLite:', err.message);
  }
}

if (!isTurso) {
  try {
    const sqlite3 = require('sqlite3').verbose();
    const DB_PATH = path.join(__dirname, 'skillswap.db');
    sqliteDb = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('❌ Error opening SQLite database:', err.message);
      } else {
        console.log('✅ Local SQLite database connected at:', DB_PATH);
      }
    });
  } catch (err) {
    console.warn('⚠️ SQLite native module fallback unavailable:', err.message);
  }
}

const db = {};

db.runAsync = function (sql, params = []) {
  if (isTurso && tursoClient) {
    return tursoClient.execute({ sql, args: params }).then((res) => ({
      lastID: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : undefined,
      changes: res.rowsAffected
    }));
  }
  return new Promise((resolve, reject) => {
    sqliteDb.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

db.getAsync = function (sql, params = []) {
  if (isTurso && tursoClient) {
    return tursoClient.execute({ sql, args: params }).then((res) => {
      if (!res.rows || res.rows.length === 0) return null;
      return res.rows[0];
    });
  }
  return new Promise((resolve, reject) => {
    sqliteDb.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

db.allAsync = function (sql, params = []) {
  if (isTurso && tursoClient) {
    return tursoClient.execute({ sql, args: params }).then((res) => res.rows || []);
  }
  return new Promise((resolve, reject) => {
    sqliteDb.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

async function initSchema() {
  // 1. Users Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT,
      password_hash TEXT,
      role TEXT DEFAULT 'STUDENT',
      name TEXT NOT NULL,
      college TEXT NOT NULL,
      major TEXT NOT NULL,
      avatar TEXT,
      bio TEXT,
      credits REAL NOT NULL DEFAULT 3.0,
      escrow_locked REAL NOT NULL DEFAULT 0.0,
      lifetime_earned REAL NOT NULL DEFAULT 0.0,
      lifetime_spent REAL NOT NULL DEFAULT 0.0,
      rating REAL NOT NULL DEFAULT 5.0,
      reviews_count INTEGER NOT NULL DEFAULT 0,
      badges_json TEXT,
      is_admin INTEGER DEFAULT 0,
      last_login_at DATETIME,
      login_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. Skills Offered Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS skills_offered (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      level TEXT NOT NULL,
      category TEXT NOT NULL,
      rate REAL NOT NULL DEFAULT 1.0,
      tier TEXT DEFAULT 'Standard',
      description TEXT,
      is_verified INTEGER DEFAULT 0,
      quiz_score INTEGER DEFAULT 0,
      cert_count INTEGER DEFAULT 0,
      qualification_bonus_awarded INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 3. Skills Wanted Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS skills_wanted (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      level TEXT NOT NULL,
      category TEXT NOT NULL,
      goal TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 4. Certificates Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS certificates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      skill_name TEXT NOT NULL,
      authority TEXT NOT NULL,
      title TEXT NOT NULL,
      credential_id TEXT,
      credential_url TEXT,
      score_or_grade TEXT,
      is_verified INTEGER DEFAULT 0,
      certificate_status TEXT DEFAULT 'PENDING_VERIFICATION',
      verification_status TEXT DEFAULT 'PENDING_VERIFICATION',
      tutor_eligible INTEGER DEFAULT 0,
      verification_method TEXT,
      verification_reason TEXT,
      verification_evidence TEXT,
      certificate_file_hash TEXT,
      verified_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 5. Quizzes Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS quizzes (
      id TEXT PRIMARY KEY,
      skill_name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      passing_score INTEGER NOT NULL DEFAULT 70,
      time_limit_minutes INTEGER NOT NULL DEFAULT 5,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 6. Quiz Questions Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS quiz_questions (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL,
      question TEXT NOT NULL,
      code_snippet TEXT,
      options_json TEXT NOT NULL,
      correct_option_index INTEGER NOT NULL,
      explanation TEXT,
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id)
    )
  `);

  // 7. Quiz Attempts Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      quiz_id TEXT NOT NULL,
      skill_name TEXT NOT NULL,
      total_questions INTEGER NOT NULL DEFAULT 20,
      correct_count INTEGER NOT NULL DEFAULT 0,
      wrong_count INTEGER NOT NULL DEFAULT 0,
      unattempted_count INTEGER NOT NULL DEFAULT 0,
      marks_obtained REAL NOT NULL DEFAULT 0,
      max_marks INTEGER NOT NULL DEFAULT 60,
      score_percent INTEGER NOT NULL,
      passed INTEGER NOT NULL,
      tier_awarded TEXT,
      user_answers_json TEXT,
      detailed_results_json TEXT,
      attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 8. Sessions Table (Complete Masterclass & Swap Schema)
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      teacher_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      skill TEXT NOT NULL,
      hours INTEGER NOT NULL,
      rate REAL NOT NULL DEFAULT 1.0,
      credits REAL NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Confirmed',
      topic TEXT,
      code_workspace TEXT,
      session_type TEXT DEFAULT 'ONE_ON_ONE',
      max_capacity INTEGER DEFAULT 1,
      rate_per_student REAL DEFAULT 1.0,
      enrolled_count INTEGER DEFAULT 0,
      total_earned_credits REAL DEFAULT 0.0,
      category TEXT,
      description TEXT,
      learning_details TEXT,
      tags TEXT,
      minimum_academic_level TEXT,
      prerequisites TEXT,
      platform TEXT DEFAULT 'Google Meet',
      meeting_platform TEXT DEFAULT 'Google Meet',
      session_series_type TEXT,
      zoom_meeting_id TEXT,
      zoom_meeting_password TEXT,
      zoom_join_url TEXT,
      zoom_start_url TEXT,
      zoom_meeting_created INTEGER DEFAULT 0,
      teacher_joined_at DATETIME,
      student_joined_at DATETIME,
      meeting_started_at DATETIME,
      meeting_ended_at DATETIME,
      payment_status TEXT DEFAULT 'PENDING',
      additional_notes TEXT,
      halfway_paid INTEGER DEFAULT 0,
      halfway_paid_at DATETIME,
      cancellation_reason TEXT,
      cancelled_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (teacher_id) REFERENCES users(id)
    )
  `);

  // 9. Session Attendees Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS session_attendees (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      student_name TEXT,
      credits_locked REAL DEFAULT 0.0,
      status TEXT DEFAULT 'ENROLLED',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      left_at DATETIME,
      attended_duration_minutes INTEGER DEFAULT 0,
      UNIQUE(session_id, student_id)
    )
  `);

  // 10. Masterclass Registrations Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS masterclass_registrations (
      id TEXT PRIMARY KEY,
      masterclass_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT DEFAULT 'REGISTERED',
      registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(masterclass_id, user_id)
    )
  `);

  // 11. Masterclass Reports Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS masterclass_reports (
      id TEXT PRIMARY KEY,
      masterclass_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      issue_type TEXT,
      description TEXT,
      priority TEXT DEFAULT 'Medium',
      status TEXT DEFAULT 'OPEN',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 12. Transactions Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL,
      student_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 13. Reviews Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      target_user_id TEXT NOT NULL,
      reviewer_name TEXT NOT NULL,
      reviewer_avatar TEXT,
      skill TEXT NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT,
      tags_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (target_user_id) REFERENCES users(id)
    )
  `);

  // 14. Messages Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      receiver_id TEXT NOT NULL,
      message_type TEXT DEFAULT 'text',
      text TEXT NOT NULL,
      audio_data TEXT,
      audio_url TEXT,
      audio_duration REAL DEFAULT 0,
      audio_waveform TEXT,
      time TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      status TEXT DEFAULT 'SENT',
      read_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_id) REFERENCES users(id),
      FOREIGN KEY (receiver_id) REFERENCES users(id)
    )
  `);

  // 15. Notifications Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      time TEXT NOT NULL,
      is_unread INTEGER DEFAULT 1,
      type TEXT NOT NULL DEFAULT 'match',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 16. Code Lab Problems Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS code_lab_problems (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      input_format TEXT,
      output_format TEXT,
      constraints_json TEXT,
      examples_json TEXT,
      starter_code_json TEXT,
      visible_test_cases_json TEXT,
      hidden_test_cases_json TEXT,
      tags_json TEXT,
      category TEXT DEFAULT 'Coding',
      solved_count INTEGER DEFAULT 0,
      est_time TEXT DEFAULT '10-15 mins',
      generation_source TEXT DEFAULT 'AI',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 17. Code Lab User Progress Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS code_lab_user_progress (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      problem_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'NOT_STARTED',
      attempts INTEGER DEFAULT 0,
      last_submitted_code TEXT,
      language TEXT,
      solved_at DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, problem_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (problem_id) REFERENCES code_lab_problems(id)
    )
  `);

  // 18. Support Tickets Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      student_name TEXT,
      session_id TEXT,
      skill_name TEXT,
      eligibility_proof TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      code_snippet TEXT,
      attachment_name TEXT,
      attachment_data TEXT,
      issue_type TEXT,
      reward_credits REAL DEFAULT 1.0,
      status TEXT DEFAULT 'OPEN',
      support_mentor_id TEXT,
      support_mentor_name TEXT,
      mentor_classification TEXT,
      mentor_solution TEXT,
      recommended_assessment_skill TEXT,
      resolved_at DATETIME,
      rating INTEGER,
      feedback TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 19. Support Doubts Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS support_doubts (
      id TEXT PRIMARY KEY,
      student_id TEXT,
      student_name TEXT,
      raised_by_user_id TEXT,
      session_id TEXT,
      skill_name TEXT,
      category TEXT,
      course TEXT,
      eligibility_proof TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      code_snippet TEXT,
      attachment_name TEXT,
      attachment_data TEXT,
      issue_type TEXT,
      reward_credits REAL DEFAULT 1.0,
      status TEXT DEFAULT 'OPEN',
      support_mentor_id TEXT,
      support_mentor_name TEXT,
      accepted_by_user_id TEXT,
      accepted_at DATETIME,
      resolved_at DATETIME,
      rating INTEGER,
      feedback TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 20. Support Answers Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS support_answers (
      id TEXT PRIMARY KEY,
      doubt_id TEXT NOT NULL,
      answered_by_user_id TEXT NOT NULL,
      answer_text TEXT NOT NULL,
      classification TEXT,
      attachment_name TEXT,
      attachment_data TEXT,
      recommended_assessment_skill TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 21. Support Doubt Attachments Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS support_doubt_attachments (
      id TEXT PRIMARY KEY,
      doubt_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_type TEXT,
      file_size INTEGER,
      file_data TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 22. Support Answer Attachments Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS support_answer_attachments (
      id TEXT PRIMARY KEY,
      answer_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_type TEXT,
      file_size INTEGER,
      file_data TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 23. Login History Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS login_history (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      email TEXT,
      role TEXT,
      ip_address TEXT,
      user_agent TEXT,
      status TEXT,
      failure_reason TEXT,
      auth_method TEXT,
      login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 24. Certificate Verifications Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS certificate_verifications (
      id TEXT PRIMARY KEY,
      certificate_id TEXT NOT NULL,
      verified_by TEXT NOT NULL,
      status TEXT NOT NULL,
      verified_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 25. Rejected Certificates Table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS rejected_certificates (
      id TEXT PRIMARY KEY,
      certificate_id TEXT,
      user_id TEXT,
      skill_name TEXT,
      authority TEXT,
      title TEXT,
      credential_id TEXT,
      score_or_grade TEXT,
      file_name TEXT,
      reason TEXT,
      rejection_reason TEXT,
      ai_report_json TEXT,
      attempt_count INTEGER DEFAULT 1,
      rejected_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 26. Subjects Table for Swap Session Booking
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      icon TEXT,
      topics_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const existingSubj = await db.getAsync(`SELECT COUNT(*) as count FROM subjects`);
  if (!existingSubj || existingSubj.count === 0) {
    const defaultSubjects = [
      ['subj_1', 'UI/UX Design & Figma', 'Design', '🎨', JSON.stringify(["Figma Auto-layout & Design Tokens", "Wireframing & Low-fi Sketches", "User Research & Personas", "High-Fidelity Prototyping", "Usability Testing & Design Systems"])],
      ['subj_2', 'Python Core & OOP', 'Development', '🐍', JSON.stringify(["Variables & Control Flow", "Object-Oriented Programming (OOP)", "Data Structures (Lists, Dicts, Sets)", "File I/O & Exception Handling", "Modules & Package Management"])],
      ['subj_3', 'React.js Frontend', 'Development', '⚛️', JSON.stringify(["JSX & Component Lifecycle", "React Hooks (useState, useEffect)", "State Management & Context API", "React Router Navigation", "REST API & Async Fetching"])],
      ['subj_4', 'Data Structures & Algorithms', 'Computer Science', '⚡', JSON.stringify(["Arrays & String Manipulation", "Linked Lists & Doubly Linked Lists", "Binary Trees & BST Traversals", "Stacks, Queues & Priority Queues", "Dynamic Programming & Recursion"])],
      ['subj_5', 'SQL & Database Design', 'Data Science', '🗄️', JSON.stringify(["Relational Schema & Normalization", "Complex Joins & Subqueries", "Indexing & Query Optimization", "Transactions & ACID Properties", "Stored Procedures & Views"])],
      ['subj_6', 'Machine Learning Basics', 'Data Science', '🤖', JSON.stringify(["NumPy & Pandas Data Processing", "Supervised Learning & Regression", "Classification & Decision Trees", "Model Evaluation & Cross-Validation", "Scikit-Learn Pipelines"])],
      ['subj_7', 'Cyber Security & Ethical Hacking', 'Security', '🛡️', JSON.stringify(["Network Reconnaissance & Nmap", "Vulnerability Scanning & Wireshark", "OWASP Top 10 Web Security", "Penetration Testing Fundamentals", "Cryptography & Security Protocols"])],
      ['subj_8', 'Tailwind & Design Systems', 'Design', '🎨', JSON.stringify(["Responsive Grid & Flexbox Utilities", "Design Token Configuration", "Custom Utility Classes", "Component Libraries & UI Kits", "Dark Mode & Theme Switching"])],
      ['subj_9', 'Node.js & Express APIs', 'Development', '🟢', JSON.stringify(["RESTful API Route Architecture", "Middleware & Error Handling", "JWT Authentication & Security", "Database Connection & ORM", "File Uploads & Streaming"])]
    ];
    for (const item of defaultSubjects) {
      await db.runAsync(
        `INSERT INTO subjects (id, name, category, icon, topics_json) VALUES (?, ?, ?, ?, ?)`,
        item
      );
    }
  }

  // =========================================================
  // Automatic Safe Migrations for Existing Tables on Turso
  // =========================================================
  const tableMigrations = [
    // users
    `ALTER TABLE users ADD COLUMN last_login_at DATETIME`,
    `ALTER TABLE users ADD COLUMN login_count INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`,

    // sessions
    `ALTER TABLE sessions ADD COLUMN session_type TEXT DEFAULT 'ONE_ON_ONE'`,
    `ALTER TABLE sessions ADD COLUMN max_capacity INTEGER DEFAULT 1`,
    `ALTER TABLE sessions ADD COLUMN rate_per_student REAL DEFAULT 1.0`,
    `ALTER TABLE sessions ADD COLUMN enrolled_count INTEGER DEFAULT 0`,
    `ALTER TABLE sessions ADD COLUMN total_earned_credits REAL DEFAULT 0.0`,
    `ALTER TABLE sessions ADD COLUMN category TEXT`,
    `ALTER TABLE sessions ADD COLUMN description TEXT`,
    `ALTER TABLE sessions ADD COLUMN learning_details TEXT`,
    `ALTER TABLE sessions ADD COLUMN tags TEXT`,
    `ALTER TABLE sessions ADD COLUMN minimum_academic_level TEXT`,
    `ALTER TABLE sessions ADD COLUMN prerequisites TEXT`,
    `ALTER TABLE sessions ADD COLUMN platform TEXT DEFAULT 'Google Meet'`,
    `ALTER TABLE sessions ADD COLUMN meeting_platform TEXT DEFAULT 'Google Meet'`,
    `ALTER TABLE sessions ADD COLUMN session_series_type TEXT`,
    `ALTER TABLE sessions ADD COLUMN zoom_meeting_id TEXT`,
    `ALTER TABLE sessions ADD COLUMN zoom_meeting_password TEXT`,
    `ALTER TABLE sessions ADD COLUMN zoom_join_url TEXT`,
    `ALTER TABLE sessions ADD COLUMN zoom_start_url TEXT`,
    `ALTER TABLE sessions ADD COLUMN zoom_meeting_created INTEGER DEFAULT 0`,
    `ALTER TABLE sessions ADD COLUMN teacher_joined_at DATETIME`,
    `ALTER TABLE sessions ADD COLUMN student_joined_at DATETIME`,
    `ALTER TABLE sessions ADD COLUMN meeting_started_at DATETIME`,
    `ALTER TABLE sessions ADD COLUMN meeting_ended_at DATETIME`,
    `ALTER TABLE sessions ADD COLUMN payment_status TEXT DEFAULT 'PENDING'`,
    `ALTER TABLE sessions ADD COLUMN halfway_paid INTEGER DEFAULT 0`,
    `ALTER TABLE sessions ADD COLUMN halfway_paid_at DATETIME`,
    `ALTER TABLE sessions ADD COLUMN cancellation_reason TEXT`,
    `ALTER TABLE sessions ADD COLUMN cancelled_by TEXT`,
    `ALTER TABLE sessions ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE sessions ADD COLUMN payment_released_at DATETIME`,
    `ALTER TABLE sessions ADD COLUMN attendance_status TEXT`,
    `ALTER TABLE sessions ADD COLUMN attendance_finalized_at DATETIME`,
    `ALTER TABLE sessions ADD COLUMN completed_at DATETIME`,

    // session_attendees
    `ALTER TABLE session_attendees ADD COLUMN student_name TEXT`,
    `ALTER TABLE session_attendees ADD COLUMN credits_locked REAL DEFAULT 0.0`,
    `ALTER TABLE session_attendees ADD COLUMN status TEXT DEFAULT 'ENROLLED'`,
    `ALTER TABLE session_attendees ADD COLUMN left_at DATETIME`,
    `ALTER TABLE session_attendees ADD COLUMN attended_duration_minutes INTEGER DEFAULT 0`,

    // certificates
    `ALTER TABLE certificates ADD COLUMN credential_id TEXT`,
    `ALTER TABLE users ADD COLUMN is_verified INTEGER DEFAULT 0`,
    `ALTER TABLE certificates ADD COLUMN credential_url TEXT`,
    `ALTER TABLE certificates ADD COLUMN score_or_grade TEXT`,
    `ALTER TABLE certificates ADD COLUMN certificate_status TEXT DEFAULT 'PENDING_VERIFICATION'`,
    `ALTER TABLE certificates ADD COLUMN verification_status TEXT DEFAULT 'PENDING_VERIFICATION'`,
    `ALTER TABLE certificates ADD COLUMN tutor_eligible INTEGER DEFAULT 0`,
    `ALTER TABLE certificates ADD COLUMN verification_method TEXT`,
    `ALTER TABLE certificates ADD COLUMN verification_reason TEXT`,
    `ALTER TABLE certificates ADD COLUMN verification_evidence TEXT`,
    `ALTER TABLE certificates ADD COLUMN certificate_file_hash TEXT`,
    `ALTER TABLE certificates ADD COLUMN verified_at DATETIME`,

    // rejected_certificates
    `ALTER TABLE rejected_certificates ADD COLUMN user_id TEXT`,
    `ALTER TABLE rejected_certificates ADD COLUMN skill_name TEXT`,
    `ALTER TABLE rejected_certificates ADD COLUMN authority TEXT`,
    `ALTER TABLE rejected_certificates ADD COLUMN title TEXT`,
    `ALTER TABLE rejected_certificates ADD COLUMN credential_id TEXT`,
    `ALTER TABLE rejected_certificates ADD COLUMN score_or_grade TEXT`,
    `ALTER TABLE rejected_certificates ADD COLUMN file_name TEXT`,
    `ALTER TABLE rejected_certificates ADD COLUMN rejection_reason TEXT`,
    `ALTER TABLE rejected_certificates ADD COLUMN ai_report_json TEXT`,
    `ALTER TABLE rejected_certificates ADD COLUMN attempt_count INTEGER DEFAULT 1`,

    // login_history
    `ALTER TABLE login_history ADD COLUMN email TEXT`,
    `ALTER TABLE login_history ADD COLUMN role TEXT`,
    `ALTER TABLE login_history ADD COLUMN status TEXT`,
    `ALTER TABLE login_history ADD COLUMN failure_reason TEXT`,
    `ALTER TABLE login_history ADD COLUMN auth_method TEXT`,
    `ALTER TABLE login_history ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,

    // support_doubts
    `ALTER TABLE support_doubts ADD COLUMN attachment_name TEXT`,
    `ALTER TABLE support_doubts ADD COLUMN attachment_data TEXT`,
    `ALTER TABLE support_doubts ADD COLUMN resolved_at DATETIME`,
    `ALTER TABLE support_doubts ADD COLUMN rating INTEGER`,
    `ALTER TABLE support_doubts ADD COLUMN feedback TEXT`,

    // support_answers
    `ALTER TABLE support_answers ADD COLUMN attachment_name TEXT`,
    `ALTER TABLE support_answers ADD COLUMN attachment_data TEXT`,

    // support_tickets
    `ALTER TABLE support_tickets ADD COLUMN attachment_name TEXT`,
    `ALTER TABLE support_tickets ADD COLUMN attachment_data TEXT`,
    `ALTER TABLE support_tickets ADD COLUMN resolved_at DATETIME`,
    `ALTER TABLE support_tickets ADD COLUMN rating INTEGER`,
    `ALTER TABLE support_tickets ADD COLUMN feedback TEXT`,

    // messages
    `ALTER TABLE messages ADD COLUMN is_read INTEGER DEFAULT 0`,
    `ALTER TABLE messages ADD COLUMN status TEXT DEFAULT 'SENT'`,
    `ALTER TABLE messages ADD COLUMN read_at DATETIME`,
    `ALTER TABLE messages ADD COLUMN message_type TEXT DEFAULT 'text'`,
    `ALTER TABLE messages ADD COLUMN audio_data TEXT`,
    `ALTER TABLE messages ADD COLUMN audio_url TEXT`,
    `ALTER TABLE messages ADD COLUMN audio_duration REAL DEFAULT 0`,
    `ALTER TABLE messages ADD COLUMN audio_waveform TEXT`,

    // transactions
    `ALTER TABLE transactions ADD COLUMN reference_type TEXT`,
    `ALTER TABLE transactions ADD COLUMN reference_id TEXT`,

    // coding platform
    `ALTER TABLE coding_problems ADD COLUMN topic_id TEXT`,
    `ALTER TABLE coding_problems ADD COLUMN is_active INTEGER DEFAULT 1`,
    `ALTER TABLE coding_test_cases ADD COLUMN is_sample INTEGER DEFAULT 0`,
    `ALTER TABLE coding_test_cases ADD COLUMN is_hidden INTEGER DEFAULT 0`,
    `ALTER TABLE coding_test_cases ADD COLUMN explanation TEXT`,
    `ALTER TABLE coding_test_cases ADD COLUMN test_order INTEGER DEFAULT 1`,
    `ALTER TABLE coding_problem_solutions ADD COLUMN official_code TEXT`,
    `ALTER TABLE coding_batches ADD COLUMN solved_problems INTEGER DEFAULT 0`,
    `ALTER TABLE coding_batch_problems ADD COLUMN attempts_count INTEGER DEFAULT 0`,
    `ALTER TABLE coding_batch_problems ADD COLUMN best_score INTEGER DEFAULT 0`,
    `ALTER TABLE coding_batch_problems ADD COLUMN last_submission_id TEXT`,
    `ALTER TABLE coding_batch_problems ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE coding_submissions ADD COLUMN verdict TEXT`,
    `ALTER TABLE coding_submissions ADD COLUMN passed_test_cases INTEGER DEFAULT 0`,
    `ALTER TABLE coding_submissions ADD COLUMN total_test_cases INTEGER DEFAULT 0`,
    `ALTER TABLE coding_submissions ADD COLUMN source_code TEXT`,
    `ALTER TABLE coding_submissions ADD COLUMN execution_time_ms REAL`,
    `ALTER TABLE coding_submissions ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE coding_user_progress ADD COLUMN problem_id TEXT`,
    `ALTER TABLE coding_user_progress ADD COLUMN status TEXT DEFAULT 'UNSOLVED'`,
    `ALTER TABLE coding_user_progress ADD COLUMN best_score INTEGER DEFAULT 0`,
    `ALTER TABLE coding_user_progress ADD COLUMN attempts_count INTEGER DEFAULT 0`,
    `ALTER TABLE coding_user_progress ADD COLUMN last_attempted_at DATETIME`,
    `ALTER TABLE coding_user_progress ADD COLUMN solved_at DATETIME`,
    `ALTER TABLE sessions ADD COLUMN additional_notes TEXT`
  ];

  for (const sql of tableMigrations) {
    try {
      await db.runAsync(sql);
    } catch (e) {
      // Ignore if column already exists or table was freshly created
    }
  }
}

module.exports = {
  db,
  initSchema
};