const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const { db } = require('./db');
const { generateDynamicAssessment, generate20DynamicQuestions } = require('../services/aiQuizGenerator');
const { analyzeAndVerifyCertificate, verifyCertificateAuthenticity } = require('../services/certificateVerifier');
require('dotenv').config();

let supabaseUrl = process.env.SUPABASE_URL || '';
let supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

let supabaseClient = null;
let isConnectedToSupabase = false;

function initSupabase() {
  if (supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http')) {
    try {
      supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
      isConnectedToSupabase = true;
      console.log('⚡ Connected to TrusoDB Data Engine:', supabaseUrl);
    } catch (e) {
      console.warn('⚠️ TrusoDB cloud connection fallback, using local database adapter:', e.message);
      supabaseClient = null;
      isConnectedToSupabase = false;
    }
  } else {
    console.log('📦 Using Local TrusoDB Adapter');
    supabaseClient = null;
    isConnectedToSupabase = false;
  }
}

initSupabase();

// 4 Exact Tutor Categories Formula:
// 1. Bronze: Passed Quiz (70-89%) + No Certificate -> 1.0 Credit/hr
// 2. Silver: Quiz Score >= 90% + No Certificate -> 1.5 Credits/hr
// 3. Advanced: Passed Quiz (70-89%) + NPTEL / Other Certificate -> 2.0 Credits/hr
// 4. Elite Master: Quiz Score >= 90% + NPTEL / Other Certificate -> 2.5 Credits/hr
function determineTutorTier(quizScore = 0, hasCertificate = false) {
  const isHighQuiz = quizScore >= 90;
  const isPassed = quizScore >= 70;

  if (isHighQuiz && hasCertificate) {
    return { tier: 'Elite Master', badge: '🥇 Elite Master Tutor', rate: 2.5 };
  } else if (isPassed && hasCertificate) {
    return { tier: 'Advanced', badge: '🎖️ Advanced Tutor', rate: 2.0 };
  } else if (isHighQuiz && !hasCertificate) {
    return { tier: 'Silver', badge: '🥈 Silver Tutor', rate: 1.5 };
  } else if (isPassed) {
    return { tier: 'Bronze', badge: '🥉 Bronze Tutor', rate: 1.0 };
  } else {
    return { tier: 'Unverified', badge: 'Unverified', rate: 1.0 };
  }
}

// In-memory cache of active dynamic 20-question quizzes by session/skill
const activeDynamicQuizzes = new Map();

const dbProvider = {
  getStatus() {
    return {
      isSupabase: isConnectedToSupabase,
      url: supabaseUrl ? supabaseUrl.replace(/^(https:\/\/[^.]+).*/, '$1.supabase.co') : 'Local Database',
      mode: isConnectedToSupabase ? 'Supabase PostgreSQL' : 'Local Hybrid Engine'
    };
  },

  setCredentials(url, key) {
    supabaseUrl = url;
    supabaseAnonKey = key;
    initSupabase();
    return this.getStatus();
  },

  determineTutorTier,

  async getUsers(filter = {}) {
    let users = [];
    if (isConnectedToSupabase && supabaseClient) {
      try {
        const { data, error } = await supabaseClient.from('users').select('*').eq('is_admin', 0);
        if (!error && data && data.length > 0) {
          for (const u of data) {
            const { data: so } = await supabaseClient.from('skills_offered').select('*').eq('user_id', u.id);
            const { data: sw } = await supabaseClient.from('skills_wanted').select('*').eq('user_id', u.id);
            const { data: certs } = await supabaseClient.from('certificates').select('*').eq('user_id', u.id);
            u.badges = typeof u.badges_json === 'string' ? JSON.parse(u.badges_json) : (u.badges_json || []);
            u.skillsOffered = so || [];
            u.skillsWanted = sw || [];
            u.certificates = certs || [];
          }
          users = data;
        }
      } catch (e) {
        console.warn('⚠️ Supabase getUsers notice, falling back to Turso DB:', e.message);
      }
    }
    
    if (users.length === 0) {
      users = await db.allAsync(`SELECT * FROM users WHERE is_admin = 0`);
      for (const u of users) {
        u.badges = JSON.parse(u.badges_json || '[]');
        u.skillsOffered = await db.allAsync(`SELECT * FROM skills_offered WHERE user_id = ?`, [u.id]);
        u.skillsWanted = await db.allAsync(`SELECT * FROM skills_wanted WHERE user_id = ?`, [u.id]);
        u.certificates = await db.allAsync(`SELECT * FROM certificates WHERE user_id = ?`, [u.id]);
      }
    }

    // Filter by search keyword
    if (filter.search) {
      const q = filter.search.toLowerCase().trim();
      users = users.filter(u =>
        u.name.toLowerCase().includes(q) ||
        (u.skillsOffered || []).some(s => s.name.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q)) ||
        (u.major || '').toLowerCase().includes(q)
      );
    }

    // Filter by skill category
    if (filter.category && filter.category !== 'all') {
      users = users.filter(u => (u.skillsOffered || []).some(s => s.category === filter.category));
    }

    // Sort by credits or rating
    const getMentorRate = (u) => (u.skillsOffered && u.skillsOffered.length > 0) ? (Number(u.skillsOffered[0].rate) || 1.0) : 1.0;

    if (filter.sortBy === 'credits' || filter.sortBy === 'rate') {
      const isAsc = filter.order === 'asc' || filter.order === 'low_to_high' || filter.sortBy === 'credits_asc';
      users.sort((a, b) => isAsc ? (getMentorRate(a) - getMentorRate(b)) : (getMentorRate(b) - getMentorRate(a)));
    } else if (filter.sortBy === 'credits_asc') {
      users.sort((a, b) => getMentorRate(a) - getMentorRate(b));
    } else if (filter.sortBy === 'credits_desc') {
      users.sort((a, b) => getMentorRate(b) - getMentorRate(a));
    } else if (filter.sortBy === 'rating') {
      users.sort((a, b) => (Number(b.rating) || 5.0) - (Number(a.rating) || 5.0));
    }

    return users;
  },

  async getUserById(id) {
    if (isConnectedToSupabase && supabaseClient) {
      try {
        const { data: user, error } = await supabaseClient.from('users').select('*').eq('id', id).single();
        if (!error && user) {
          const { data: so } = await supabaseClient.from('skills_offered').select('*').eq('user_id', id);
          const { data: sw } = await supabaseClient.from('skills_wanted').select('*').eq('user_id', id);
          const { data: certs } = await supabaseClient.from('certificates').select('*').eq('user_id', id);
          const { data: rev } = await supabaseClient.from('reviews').select('*').eq('target_user_id', id).order('created_at', { ascending: false });
          const { data: txs } = await supabaseClient.from('transactions').select('*').eq('user_id', id).order('created_at', { ascending: false });
          const { data: attempts } = await supabaseClient.from('quiz_attempts').select('*').eq('user_id', id).order('attempted_at', { ascending: false });

          user.badges = typeof user.badges_json === 'string' ? JSON.parse(user.badges_json) : (user.badges_json || []);
          user.skillsOffered = so || [];
          user.skillsWanted = sw || [];
          user.certificates = certs || [];
          user.transactions = txs || [];
          user.quizAttempts = attempts || [];
          user.reviews = (rev || []).map(r => ({
            ...r,
            tags: typeof r.tags_json === 'string' ? JSON.parse(r.tags_json) : (r.tags_json || [])
          }));
          return user;
        }
      } catch (e) {
        console.warn('⚠️ Supabase getUserById notice, falling back to Turso DB:', e.message);
      }
    }

    const user = await db.getAsync(`SELECT * FROM users WHERE id = ?`, [id]);
    if (!user) return null;
    user.badges = JSON.parse(user.badges_json || '[]');
    user.skillsOffered = await db.allAsync(`SELECT * FROM skills_offered WHERE user_id = ?`, [user.id]);
    user.skillsWanted = await db.allAsync(`SELECT * FROM skills_wanted WHERE user_id = ?`, [user.id]);
    user.certificates = await db.allAsync(`SELECT * FROM certificates WHERE user_id = ?`, [user.id]);
    user.reviews = await db.allAsync(`SELECT * FROM reviews WHERE target_user_id = ? ORDER BY id DESC`, [user.id]);
    user.transactions = await db.allAsync(`SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC, id DESC`, [user.id]);
    user.quizAttempts = await db.allAsync(`SELECT * FROM quiz_attempts WHERE user_id = ? ORDER BY attempted_at DESC, id DESC`, [user.id]);
    for (const r of user.reviews) {
      r.tags = JSON.parse(r.tags_json || '[]');
    }
    return user;
  },

  async updateUser(id, data) {
    const existing = await this.getUserById(id);
    if (!existing) {
      throw new Error(`User with ID '${id}' not found in database.`);
    }

    const updates = {};
    if (data.name !== undefined && data.name !== null) updates.name = String(data.name).trim();
    if (data.email !== undefined && data.email !== null) updates.email = String(data.email).trim().toLowerCase();
    if (data.college !== undefined && data.college !== null) updates.college = String(data.college).trim();
    if (data.major !== undefined && data.major !== null) updates.major = String(data.major).trim();
    if (data.bio !== undefined && data.bio !== null) updates.bio = String(data.bio).trim();
    if (data.avatar !== undefined && data.avatar !== null) updates.avatar = String(data.avatar);
    if (data.role !== undefined && data.role !== null) updates.role = String(data.role);
    if (data.badges !== undefined && data.badges !== null) {
      updates.badges_json = Array.isArray(data.badges) ? JSON.stringify(data.badges) : String(data.badges);
    }
    if (data.credits !== undefined && data.credits !== null) updates.credits = Number(data.credits);
    if (data.password) {
      const pwd = String(data.password).trim();
      if (!/^[A-Z]/.test(pwd)) {
        throw new Error('Password rule violation: Password must start with a capital letter (A-Z).');
      }
      if (pwd.length < 6) {
        throw new Error('Password rule violation: Password must be at least 6 characters long.');
      }
      updates.password_hash = await bcrypt.hash(pwd, 10);
    }

    // Update SQLite database
    const fields = Object.keys(updates);
    if (fields.length > 0) {
      const setClause = fields.map(f => `${f} = ?`).join(', ');
      const values = [...Object.values(updates), id];
      await db.runAsync(`UPDATE users SET ${setClause} WHERE id = ?`, values);
    }

    // Update Supabase PostgreSQL database if connected
    if (isConnectedToSupabase && supabaseClient && fields.length > 0) {
      try {
        await supabaseClient.from('users').update(updates).eq('id', id);
      } catch (err) {
        console.warn('Supabase profile update notice:', err.message);
      }
    }

    return await this.getUserById(id);
  },

  async getMatches(userId) {
    const current = await this.getUserById(userId);
    if (!current) return [];

    const allUsers = await this.getUsers();
    const peers = allUsers.filter(u => u.id !== current.id);
    const matches = [];

    for (const peer of peers) {
      const canTeachMe = (peer.skillsOffered || []).filter(so =>
        (current.skillsWanted || []).some(sw =>
          so.name.toLowerCase().includes(sw.name.toLowerCase()) ||
          sw.name.toLowerCase().includes(so.name.toLowerCase()) ||
          so.category === sw.category
        )
      );

      const canLearnFromMe = (peer.skillsWanted || []).filter(sw =>
        (current.skillsOffered || []).some(so =>
          so.name.toLowerCase().includes(sw.name.toLowerCase()) ||
          sw.name.toLowerCase().includes(so.name.toLowerCase()) ||
          so.category === sw.category
        )
      );

      const isTwoWay = canTeachMe.length > 0 && canLearnFromMe.length > 0;
      let matchScore = isTwoWay ? 98 : canTeachMe.length > 0 ? 88 : 72;

      matches.push({
        peer,
        isTwoWay,
        matchScore,
        canTeachMe,
        canLearnFromMe
      });
    }

    return matches.sort((a, b) => b.matchScore - a.matchScore);
  },

  async getQuizzes() {
    let quizzes = await db.allAsync(`SELECT * FROM quizzes`);
    const dsaExists = (quizzes || []).some(q => q.skill_name.toLowerCase().includes('data structure') || q.skill_name.toLowerCase().includes('algorithm'));
    if (!dsaExists) {
      await db.runAsync(
        `INSERT OR IGNORE INTO quizzes (id, skill_name, category, title, passing_score, time_limit_minutes) VALUES (?, ?, ?, ?, ?, ?)`,
        ['quiz_dsa', 'Data Structures & Algorithms', 'Tech', 'Data Structures & Algorithms Mentor Certification', 70, 15]
      );
      quizzes = await db.allAsync(`SELECT * FROM quizzes`);
    }
    for (const q of quizzes) {
      q.questionsCount = 20; // 20 AI dynamic questions
      q.time_limit_minutes = 15;
    }
    return quizzes;
  },

  /**
   * Generates a fresh, subject-pure Dynamic Assessment with configurable question count & difficulty
   */
  async generateDynamicAssessment({ skillName, questionCount = 20, difficulty = 'Mixed', assessmentType = 'Complete Mentor Assessment' }) {
    let normalized = (skillName || 'Python Programming & DSA').trim();
    try {
      normalized = decodeURIComponent(normalized).trim();
    } catch (e) {}
    const count = Math.max(10, Math.min(50, Number(questionCount) || 20));
    const questions = await generateDynamicAssessment({
      skillName: normalized,
      questionCount: count,
      difficulty,
      assessmentType
    });

    const quizId = 'quiz_dyn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const maxMarks = count * 3;
    const passMarks = Math.ceil(maxMarks * 0.70);
    const distinctionMarks = Math.ceil(maxMarks * 0.90);
    const timeLimitMinutes = Math.max(10, Math.round(count * 0.75));

    const quizObj = {
      id: quizId,
      skill_name: normalized,
      title: `${normalized} Mentor Skill Assessment`,
      category: normalized.toLowerCase().includes('design') ? 'Design' : 'Tech',
      assessment_type: assessmentType,
      difficulty: difficulty,
      passing_score: 70,
      pass_marks: passMarks,
      distinction_marks: distinctionMarks,
      max_marks: maxMarks,
      time_limit_minutes: timeLimitMinutes,
      questionsCount: questions.length,
      questions
    };

    activeDynamicQuizzes.set(quizId, quizObj);
    return quizObj;
  },

  /**
   * Backward-compatible alias for 20-question calls
   */
  async get20DynamicQuiz(skillName) {
    return await this.generateDynamicAssessment({
      skillName,
      questionCount: 20,
      difficulty: 'Mixed'
    });
  },

  /**
   * Evaluates questions with Negative Marking (+3 for Correct, -1 for Wrong, 0 for Unattempted),
   * stores student responses & evaluation in DB, and updates subject-specific qualification
   */
  async submit20Quiz(userId, quizId, skillName, userAnswers) {
    let quiz = activeDynamicQuizzes.get(quizId);
    if (!quiz) {
      // If not in cache, generate baseline reference
      const questions = await generateDynamicAssessment({
        skillName: skillName || 'Python Programming & DSA',
        questionCount: 20,
        difficulty: 'Mixed'
      });
      quiz = {
        id: quizId,
        skill_name: skillName || 'Python Programming & DSA',
        passing_score: 70,
        questions
      };
    }

    const totalQuestions = quiz.questions?.length || 20;
    const maxMarks = totalQuestions * 3;
    let correctCount = 0;
    let wrongCount = 0;
    let unattemptedCount = 0;
    const detailedResults = [];

    quiz.questions.forEach((q, idx) => {
      const qKey = q.id || `q_${idx + 1}`;
      let userSelected = userAnswers[qKey];
      if (userSelected === undefined || userSelected === null) {
        userSelected = userAnswers[idx] !== undefined ? userAnswers[idx] : userAnswers[String(idx)];
      }

      const isUnattempted = userSelected === undefined || userSelected === null || userSelected === '';
      const isCorrect = !isUnattempted && Number(userSelected) === Number(q.correct_option_index);
      const isWrong = !isUnattempted && !isCorrect;

      let marksAwarded = 0;
      if (isCorrect) {
        correctCount++;
        marksAwarded = 3;
      } else if (isWrong) {
        wrongCount++;
        marksAwarded = -1;
      } else {
        unattemptedCount++;
        marksAwarded = 0;
      }

      detailedResults.push({
        questionId: qKey,
        question: q.question,
        code_snippet: q.code_snippet || '',
        userSelected: isUnattempted ? null : Number(userSelected),
        correctIndex: q.correct_option_index,
        isCorrect,
        isWrong,
        isUnattempted,
        marksAwarded,
        explanation: q.explanation || 'Academic domain concept.',
        options: q.options || [],
        difficulty: q.difficulty || 'Medium'
      });
    });

    // Negative Marking Arithmetic: (+3 * Correct) - (1 * Wrong)
    const marksObtained = (correctCount * 3) - (wrongCount * 1);
    const scorePercent = Math.max(0, Math.round((marksObtained / maxMarks) * 100));
    const passed = scorePercent >= (quiz.passing_score || 70);

    // Check external verified certificates for this student and subject
    const certs = await db.allAsync(
      `SELECT * FROM certificates WHERE user_id = ? AND is_verified = 1 AND (LOWER(skill_name) LIKE ? OR LOWER(?) LIKE '%' || LOWER(skill_name) || '%')`,
      [userId, `%${quiz.skill_name.toLowerCase().split(' ')[0]}%`, quiz.skill_name.toLowerCase()]
    );
    const hasCert = certs.length > 0;
    const tierInfo = determineTutorTier(scorePercent, hasCert);

    // Save full response, negative marking results, and evaluation to quiz_attempts table
    const attemptId = 'att_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    await db.runAsync(
      `INSERT INTO quiz_attempts (id, user_id, quiz_id, skill_name, total_questions, correct_count, wrong_count, unattempted_count, marks_obtained, max_marks, score_percent, passed, tier_awarded, user_answers_json, detailed_results_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        attemptId,
        userId,
        quizId,
        quiz.skill_name,
        totalQuestions,
        correctCount,
        wrongCount,
        unattemptedCount,
        marksObtained,
        maxMarks,
        scorePercent,
        passed ? 1 : 0,
        tierInfo.tier,
        JSON.stringify(userAnswers),
        JSON.stringify(detailedResults)
      ]
    );

    // Update the user's specific skill in skills_offered with this subject's score & tier
    try {
      let existingSkill = await db.getAsync(
        `SELECT * FROM skills_offered WHERE user_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?))`,
        [userId, quiz.skill_name]
      );
      if (!existingSkill) {
        existingSkill = await db.getAsync(
          `SELECT * FROM skills_offered WHERE user_id = ? AND (LOWER(name) LIKE ? OR LOWER(?) LIKE '%' || LOWER(name) || '%')`,
          [userId, `%${quiz.skill_name.toLowerCase()}%`, quiz.skill_name.toLowerCase()]
        );
      }

      if (existingSkill) {
        const newBestScore = Math.max(Number(existingSkill.quiz_score || 0), scorePercent);
        await db.runAsync(
          `UPDATE skills_offered 
           SET quiz_score = ?, tier = ?, rate = ?, is_verified = ? 
           WHERE id = ?`,
          [newBestScore, tierInfo.tier, tierInfo.rate, newBestScore >= 70 ? 1 : 0, existingSkill.id]
        );
      } else {
        const newSkillId = 'sk_' + userId + '_' + Date.now().toString(36);
        await db.runAsync(
          `INSERT INTO skills_offered (id, user_id, name, level, category, rate, tier, description, is_verified, quiz_score, cert_count, qualification_bonus_awarded)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [newSkillId, userId, quiz.skill_name, 'Intermediate', 'Tech', tierInfo.rate, tierInfo.tier, `${quiz.skill_name} validated via AI Skill Assessment`, scorePercent >= 70 ? 1 : 0, scorePercent, hasCert ? 1 : 0, 0]
        );
      }
    } catch (err) {
      console.warn('Could not update skills_offered record:', err.message);
    }

    if (isConnectedToSupabase && supabaseClient) {
      try {
        await supabaseClient.from('quiz_attempts').insert({
          id: attemptId,
          user_id: userId,
          quiz_id: quizId,
          skill_name: quiz.skill_name,
          total_questions: totalQuestions,
          correct_count: correctCount,
          wrong_count: wrongCount,
          unattempted_count: unattemptedCount,
          marks_obtained: marksObtained,
          max_marks: maxMarks,
          score_percent: scorePercent,
          passed: passed ? 1 : 0,
          tier_awarded: tierInfo.tier,
          user_answers_json: userAnswers,
          detailed_results_json: detailedResults
        });
      } catch (err) {
        console.warn('Supabase quiz attempt insert notice:', err.message);
      }
    }

    // If passed, run qualification check and bonus payout (+2.0 Credits)
    let qualificationResult = null;
    if (passed) {
      qualificationResult = await this.checkAndAwardCourseQualificationBonus(userId, quiz.skill_name);
    }

    return {
      success: true,
      attemptId,
      skillName: quiz.skill_name,
      totalQuestions,
      maxMarks,
      marksObtained,
      correctCount,
      wrongCount,
      unattemptedCount,
      scorePercent,
      passed,
      passingScore: quiz.passing_score || 70,
      tierInfo: qualificationResult?.tierInfo || tierInfo,
      hasCert,
      qualificationResult,
      qualificationBonusAwarded: qualificationResult?.bonusAwarded || false,
      bonusCredits: qualificationResult?.bonusAmount || 0,
      detailedResults
    };
  },

  /**
   * Get eligible subjects for assessment for a specific user
   */
  async getAssessmentSubjects(userId) {
    // 1. Fetch user's registered skills in skills_offered
    const userSkills = await db.allAsync(
      `SELECT * FROM skills_offered WHERE user_id = ? ORDER BY created_at DESC`,
      [userId]
    );

    // 2. Fetch past attempts for each skill to get best scores
    const enriched = [];
    for (const s of userSkills) {
      const bestAttempt = await db.getAsync(
        `SELECT MAX(score_percent) as max_score, MAX(attempted_at) as last_attempt_at 
         FROM quiz_attempts 
         WHERE user_id = ? AND (LOWER(TRIM(skill_name)) = LOWER(TRIM(?)) OR LOWER(skill_name) LIKE ? OR LOWER(?) LIKE '%' || LOWER(skill_name) || '%')`,
        [userId, s.name, `%${s.name.toLowerCase()}%`, s.name.toLowerCase()]
      );

      const cert = await db.getAsync(
        `SELECT * FROM certificates WHERE user_id = ? AND is_verified = 1 AND (LOWER(TRIM(skill_name)) = LOWER(TRIM(?)) OR LOWER(skill_name) LIKE ? OR LOWER(?) LIKE '%' || LOWER(skill_name) || '%')`,
        [userId, s.name, `%${s.name.toLowerCase()}%`, s.name.toLowerCase()]
      );

      const norm = s.name.toLowerCase();
      let icon = 'fa-solid fa-code';
      if (norm.includes('python')) icon = 'fa-brands fa-python';
      else if (norm.includes('react')) icon = 'fa-brands fa-react';
      else if (norm.includes('sql') || norm.includes('database')) icon = 'fa-solid fa-database';
      else if (norm.includes('security') || norm.includes('cyber')) icon = 'fa-solid fa-shield-halved';
      else if (norm.includes('design') || norm.includes('figma') || norm.includes('ui')) icon = 'fa-brands fa-figma';
      else if (norm.includes('java')) icon = 'fa-brands fa-java';
      else if (norm.includes('spring')) icon = 'fa-solid fa-leaf';
      else if (norm.includes('js') || norm.includes('javascript')) icon = 'fa-brands fa-js';
      else if (norm.includes('ml') || norm.includes('ai') || norm.includes('data science') || norm.includes('machine learning')) icon = 'fa-solid fa-brain';
      else if (norm.includes('cloud') || norm.includes('devops') || norm.includes('docker') || norm.includes('kubernetes')) icon = 'fa-solid fa-cloud';
      else if (norm.includes('full stack') || norm.includes('fullstack')) icon = 'fa-solid fa-layer-group';

      enriched.push({
        id: s.id,
        user_id: s.user_id,
        name: s.name,
        skill_name: s.name,
        category: s.category || 'Tech',
        level: s.level || 'Intermediate',
        rate: s.rate || 1.5,
        tier: s.tier || 'Standard',
        description: s.description || '',
        is_verified: s.is_verified || (s.quiz_score >= 70 ? 1 : 0),
        quiz_score: s.quiz_score || bestAttempt?.max_score || 0,
        has_certificate: Boolean(cert),
        last_attempt_at: bestAttempt?.last_attempt_at || null,
        icon: icon,
        eligible: true
      });
    }

    return enriched;
  },

  async getOfferedSkills() {
    return await db.allAsync(`SELECT * FROM skills_offered ORDER BY created_at DESC`);
  },

  async getWantedSkills() {
    return await db.allAsync(`SELECT * FROM skills_wanted ORDER BY created_at DESC`);
  },

  async addSkillOffered(userId, data) {
    const id = 'sk_off_' + Date.now();
    const rate = Number(data.rate) || 1.0;
    const skillRoot = data.name.trim().toLowerCase().split(' ')[0];

    const bestAttempt = await db.getAsync(
      `SELECT MAX(score_percent) as max_score FROM quiz_attempts WHERE user_id = ? AND (LOWER(skill_name) LIKE ? OR LOWER(?) LIKE '%' || LOWER(skill_name) || '%') AND passed = 1`,
      [userId, `%${skillRoot}%`, data.name.trim().toLowerCase()]
    );
    const quizScore = bestAttempt?.max_score || 0;

    const cert = await db.getAsync(
      `SELECT * FROM certificates WHERE user_id = ? AND is_verified = 1 AND (LOWER(skill_name) LIKE ? OR LOWER(?) LIKE '%' || LOWER(skill_name) || '%')`,
      [userId, `%${skillRoot}%`, data.name.trim().toLowerCase()]
    );
    const hasCert = !!cert;
    const tierInfo = determineTutorTier(quizScore, hasCert);
    const effectiveRate = tierInfo.rate || rate;
    const effectiveTier = tierInfo.tier !== 'Unverified' ? tierInfo.tier : 'Standard';

    await db.runAsync(
      `INSERT INTO skills_offered (id, user_id, name, level, category, rate, tier, description, is_verified, quiz_score, cert_count, qualification_bonus_awarded)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [id, userId, data.name, data.level || 'Intermediate', data.category || 'Tech', effectiveRate, effectiveTier, data.description || '', quizScore >= 70 ? 1 : 0, quizScore, hasCert ? 1 : 0]
    );

    // Evaluate qualification bonus (+2.0 Credits)
    const qualResult = await this.checkAndAwardCourseQualificationBonus(userId, data.name);

    return {
      id,
      user_id: userId,
      ...data,
      rate: qualResult?.tierInfo?.rate || effectiveRate,
      tier: qualResult?.tierInfo?.tier || effectiveTier,
      is_verified: quizScore >= 70 ? 1 : 0,
      quiz_score: quizScore,
      qualificationResult: qualResult,
      qualificationBonusAwarded: qualResult?.bonusAwarded || false,
      bonusCredits: qualResult?.bonusAmount || 0
    };
  },

  async addSkillWanted(userId, data) {
    const id = 'sk_want_' + Date.now();
    await db.runAsync(
      `INSERT INTO skills_wanted (id, user_id, name, level, category, goal)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, userId, data.name, data.level || 'Beginner', data.category || 'Tech', data.goal || '']
    );
    return { id, user_id: userId, ...data };
  },

  async getSessions() {
    const sessions = await db.allAsync(`SELECT * FROM sessions ORDER BY created_at DESC`);
    const attendees = await db.allAsync(`SELECT * FROM session_attendees ORDER BY joined_at ASC`);
    const users = await db.allAsync(`SELECT id, name, avatar FROM users`);
    const userMap = {};
    users.forEach(u => userMap[u.id] = u);

    return sessions.map(s => {
      const sessAttendees = attendees.filter(a => a.session_id === s.id);
      const teacher = userMap[s.teacher_id];
      const student = userMap[s.student_id];
      const isGroup = s.session_type === 'GROUP_COHORT';
      return {
        ...s,
        teacherName: teacher ? teacher.name : s.teacher_id,
        teacherAvatar: teacher ? (teacher.avatar || s.teacher_id) : s.teacher_id,
        studentName: isGroup ? `${sessAttendees.length} Students Enrolled` : (student ? student.name : s.student_id),
        enrolled_count: sessAttendees.length,
        attendees: sessAttendees
      };
    });
  },

  async createGroupCohortSession({
    tutorId,
    skillName,
    title,
    topic,
    category,
    shortDescription,
    description,
    sessionDate,
    date,
    time,
    startTime,
    durationHours,
    duration,
    maxCapacity,
    maxParticipants,
    sessionSeriesType,
    learningDetails,
    tags,
    creditsPerAttendee,
    minimumAcademicLevel,
    prerequisites,
    platform,
    meetingPlatform,
    meetingLink,
    status
  }) {
    const finalHours = Number(durationHours || duration || 1);
    const finalCapacity = Number(maxCapacity || maxParticipants || 30);
    let tutor = await db.getAsync(`SELECT * FROM users WHERE id = ? OR LOWER(email) = ?`, [tutorId, String(tutorId).toLowerCase()]);
    if (!tutor) {
      tutor = { id: tutorId, email: tutorId };
    }

    const tutorEmail = (tutor?.email || String(tutorId)).toLowerCase();

    // Strict Backend Protection Rule: Check tutor's verified certificate status in DB
    let verifiedCert = await db.getAsync(
      `SELECT * FROM certificates 
       WHERE (user_id = ? OR LOWER(user_id) = ?) 
         AND (certificate_status = 'VERIFIED' OR is_verified = 1)
       LIMIT 1`,
      [tutorId, tutorEmail]
    );

    if (!verifiedCert && tutorEmail.includes('@')) {
      verifiedCert = await db.getAsync(
        `SELECT c.* FROM certificates c
         JOIN users u ON (c.user_id = u.id OR LOWER(c.user_id) = LOWER(u.email))
         WHERE LOWER(u.email) = ?
           AND (c.certificate_status = 'VERIFIED' OR c.is_verified = 1)
         LIMIT 1`,
        [tutorEmail]
      );
    }

    if (!verifiedCert && (tutor.is_admin === 1 || tutor.is_verified === 1 || (tutor.badges_json && (tutor.badges_json.includes('Verified') || tutor.badges_json.includes('Tutor'))))) {
      verifiedCert = { id: 'cert_auto_' + tutorId, is_verified: 1 };
    }

    if (!verifiedCert) {
      const err = new Error('Certificate verification is required before you can create a Master Class.');
      err.status = 403;
      err.code = 'TUTOR_NOT_VERIFIED';
      throw err;
    }

    const finalTitle = (title || topic || skillName || 'Group Masterclass').trim();
    const finalSkill = (skillName || 'General Tech').trim();
    const finalCategory = (category || 'Tech & Programming').trim();
    const finalDesc = (shortDescription || description || '').trim();
    const finalDate = sessionDate || date || new Date().toISOString().split('T')[0];
    const finalTime = time || startTime || '05:00 PM';
    const finalPlatform = platform || meetingPlatform || 'Google Meet';
    const finalSeriesType = sessionSeriesType || 'One-time Masterclass';
    const finalLearning = (learningDetails || '').trim();
    const finalTags = typeof tags === 'string' ? tags : JSON.stringify(tags || []);
    const finalRate = Number(creditsPerAttendee || 0.0);
    const finalMinLevel = minimumAcademicLevel || 'Any';
    const finalPrereq = (prerequisites || '').trim();
    const finalStatus = status === 'DRAFT' ? 'DRAFT' : 'Confirmed';
    const finalMeetingLink = meetingLink || (finalPlatform === 'Google Meet' ? `https://meet.google.com/skillswap-${Date.now().toString(36)}` : `https://meet.skillswap.edu/live-cohort-${Date.now()}`);

    const sessionId = 'cohort_' + Date.now();
    await db.runAsync(
      `INSERT INTO sessions (
        id, teacher_id, student_id, skill, hours, rate, credits, session_type, max_capacity,
        rate_per_student, enrolled_count, total_earned_credits, date, time, status, topic,
        category, description, learning_details, tags, minimum_academic_level, prerequisites,
        platform, meeting_platform, session_series_type, code_workspace
      ) VALUES (?, ?, ?, ?, ?, ?, 0.0, 'GROUP_COHORT', ?, ?, 0, 0.0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId,
        tutorId,
        tutorId,
        finalSkill,
        finalHours,
        finalRate,
        finalCapacity,
        finalRate,
        finalDate,
        finalTime,
        finalStatus,
        finalTitle,
        finalCategory,
        finalDesc,
        finalLearning,
        finalTags,
        finalMinLevel,
        finalPrereq,
        finalPlatform,
        finalPlatform,
        finalSeriesType,
        finalMeetingLink
      ]
    );

    return {
      success: true,
      sessionId,
      session: {
        id: sessionId,
        teacher_id: tutorId,
        teacherName: tutor.name,
        skill: finalSkill,
        title: finalTitle,
        topic: finalTitle,
        category: finalCategory,
        description: finalDesc,
        hours: finalHours,
        rate: finalRate,
        rate_per_student: finalRate,
        credits: 0.0,
        max_capacity: finalCapacity,
        enrolled_count: 0,
        session_type: 'GROUP_COHORT',
        date: finalDate,
        time: finalTime,
        platform: finalPlatform,
        status: finalStatus
      }
    };
  },

  async enrollInCohortSession({ sessionId, studentId }) {
    if (!sessionId) throw new Error('Session ID is required to enroll');
    const session = await db.getAsync(`SELECT * FROM sessions WHERE id = ?`, [sessionId]);
    if (!session) throw new Error('Live cohort session not found');
    const currentStatus = (session.status || '').toLowerCase();
    if (currentStatus === 'completed' || currentStatus === 'cancelled' || currentStatus === 'attendance_finalized') {
      throw new Error(`Cannot enroll: Session is ${session.status.toLowerCase()}`);
    }

    if (session.teacher_id === studentId) {
      throw new Error('Tutor cannot enroll as a student in their own masterclass');
    }

    // Check existing enrollment
    const existing = await db.getAsync(`SELECT * FROM session_attendees WHERE session_id = ? AND student_id = ?`, [sessionId, studentId]);
    if (existing) {
      return { success: true, message: 'Already registered for this masterclass', alreadyEnrolled: true, attendee: existing };
    }

    // Check capacity atomically
    const currentAttendees = await db.allAsync(`SELECT * FROM session_attendees WHERE session_id = ?`, [sessionId]);
    if (currentAttendees.length >= (session.max_capacity || 10)) {
      throw new Error(`Cohort capacity reached (Max ${session.max_capacity} students)`);
    }

    const student = await db.getAsync(`SELECT * FROM users WHERE id = ?`, [studentId]);
    if (!student) throw new Error('Student user not found');

    // Free Registration: 0 Credits deducted, 0 Credits locked in escrow!
    const attendeeId = 'att_' + Date.now() + '_' + Math.random().toString(36).substring(7);
    await db.runAsync(
      `INSERT INTO session_attendees (id, session_id, student_id, student_name, credits_locked, status)
       VALUES (?, ?, ?, ?, 0.0, 'ENROLLED')`,
      [attendeeId, sessionId, studentId, student.name]
    );

    // Also persist into masterclass_registrations table
    const regId = 'reg_' + Date.now() + '_' + Math.random().toString(36).substring(7);
    await db.runAsync(
      `INSERT INTO masterclass_registrations (id, masterclass_id, user_id, status)
       VALUES (?, ?, ?, 'REGISTERED')
       ON CONFLICT(masterclass_id, user_id) DO NOTHING`,
      [regId, sessionId, studentId]
    );

    // Update session enrolled_count
    const newCount = currentAttendees.length + 1;
    await db.runAsync(
      `UPDATE sessions SET enrolled_count = ? WHERE id = ?`,
      [newCount, sessionId]
    );

    return {
      success: true,
      sessionId,
      studentId,
      creditsLocked: 0.0,
      enrolledCount: newCount,
      remainingCredits: student.credits,
      message: 'Successfully registered for public masterclass (0 credits)'
    };
  },

  async recordLiveAttendance({ sessionId, userId }) {
    const session = await db.getAsync(`SELECT * FROM sessions WHERE id = ?`, [sessionId]);
    if (!session) throw new Error('Session not found');

    const attId = 'mc_att_' + sessionId + '_' + userId;
    await db.runAsync(
      `INSERT INTO masterclass_attendance (id, masterclass_id, user_id, joined_at, attendance_status)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'ATTENDED')
       ON CONFLICT(masterclass_id, user_id) DO UPDATE SET attendance_status = 'ATTENDED', updated_at = CURRENT_TIMESTAMP`,
      [attId, sessionId, userId]
    );

    // Also update session_attendees status to ATTENDED if present
    await db.runAsync(
      `UPDATE session_attendees SET status = 'ATTENDED' WHERE session_id = ? AND student_id = ?`,
      [sessionId, userId]
    );

    return { success: true, sessionId, userId, status: 'ATTENDED' };
  },

  async recordLiveLeave({ sessionId, userId }) {
    await db.runAsync(
      `UPDATE masterclass_attendance 
       SET left_at = CURRENT_TIMESTAMP, 
           attendance_duration = ROUND(MAX(0, (julianday('now') - julianday(joined_at)) * 86400)),
           updated_at = CURRENT_TIMESTAMP
       WHERE masterclass_id = ? AND user_id = ?`,
      [sessionId, userId]
    );
    return { success: true, sessionId, userId };
  },

  async getCohortAttendees(sessionId) {
    const attendees = await db.allAsync(
      `SELECT sa.*, u.avatar, u.major, u.role, u.college 
       FROM session_attendees sa
       JOIN users u ON sa.student_id = u.id
       WHERE sa.session_id = ?
       ORDER BY sa.joined_at ASC`,
      [sessionId]
    );
    return attendees;
  },

  async finalizeMasterclassAttendance({ sessionId, tutorId }) {
    const session = await db.getAsync(`SELECT * FROM sessions WHERE id = ?`, [sessionId]);
    if (!session) throw new Error('Live masterclass session not found');
    if (session.teacher_id !== tutorId) {
      throw new Error('Only the host tutor can finalize attendance and claim credits for this masterclass');
    }

    // 1. Check idempotency: Has a reward already been issued for this masterclass?
    const existingTx = await db.getAsync(
      `SELECT * FROM transactions WHERE reference_type = 'MASTERCLASS' AND reference_id = ? AND type = 'MASTERCLASS_REWARD'`,
      [sessionId]
    );

    if (existingTx || session.status === 'ATTENDANCE_FINALIZED') {
      const actualAttRows = await db.allAsync(
        `SELECT DISTINCT user_id FROM masterclass_attendance WHERE masterclass_id = ? AND attendance_status = 'ATTENDED'`,
        [sessionId]
      );
      const totalUsersRow = await db.getAsync(`SELECT COUNT(*) as count FROM users WHERE role != 'ADMIN' OR role IS NULL`);
      const totalUsers = Math.max(1, totalUsersRow?.count || 1);
      const attPct = Math.round(((actualAttRows.length / totalUsers) * 100) * 100) / 100;
      return {
        success: true,
        message: 'Masterclass attendance has already been finalized. Duplicate reward prevented.',
        alreadyFinalized: true,
        sessionId,
        actualAttendees: actualAttRows.length,
        totalUsers,
        attendancePercentage: attPct,
        rewardCredits: existingTx ? Number(existingTx.amount) : 0
      };
    }

    // 2. Count actual attendees who entered the live room
    const attendeesRows = await db.allAsync(
      `SELECT DISTINCT user_id FROM masterclass_attendance WHERE masterclass_id = ? AND attendance_status = 'ATTENDED'`,
      [sessionId]
    );
    const actualAttendees = attendeesRows.length;

    // 3. Count total registered website users (the agreed denominator)
    const totalUsersRow = await db.getAsync(`SELECT COUNT(*) as count FROM users WHERE role != 'ADMIN' OR role IS NULL`);
    const totalUsers = Math.max(1, totalUsersRow?.count || 1);

    // 4. Calculate attendance percentage
    const attendancePercentage = Math.round(((actualAttendees / totalUsers) * 100) * 100) / 100;

    // 5. Look up reward credits from configurable reward rules
    const tierRule = await db.getAsync(
      `SELECT * FROM masterclass_reward_rules 
       WHERE ? >= min_attendance_percentage 
       ORDER BY min_attendance_percentage DESC LIMIT 1`,
      [attendancePercentage]
    );
    const rewardCredits = tierRule ? Number(tierRule.reward_credits) : 0.0;

    // 6. Award creator credit if rewardCredits > 0
    if (rewardCredits > 0) {
      await db.runAsync(
        `UPDATE users SET credits = ROUND(credits + ?, 2), lifetime_earned = ROUND(lifetime_earned + ?, 2) WHERE id = ?`,
        [rewardCredits, rewardCredits, tutorId]
      );

      const txId = 'tx_mc_reward_' + sessionId;
      await db.runAsync(
        `INSERT INTO transactions (id, user_id, date, type, description, amount, status, student_name, reference_type, reference_id)
         VALUES (?, ?, ?, 'MASTERCLASS_REWARD', ?, ?, 'Completed', 'Group Masterclass Attendees', 'MASTERCLASS', ?)`,
        [
          txId,
          tutorId,
          new Date().toISOString().split('T')[0],
          `${Math.round(attendancePercentage)}% attendance reward for ${session.skill || session.topic} (${actualAttendees}/${totalUsers} attendees)`,
          rewardCredits,
          sessionId
        ]
      );
    }

    // 7. Mark session ATTENDANCE_FINALIZED
    await db.runAsync(
      `UPDATE sessions 
       SET status = 'ATTENDANCE_FINALIZED', total_earned_credits = ?, credits = ?, meeting_ended_at = COALESCE(meeting_ended_at, CURRENT_TIMESTAMP)
       WHERE id = ?`,
      [rewardCredits, rewardCredits, sessionId]
    );

    return {
      success: true,
      sessionId,
      actualAttendees,
      totalUsers,
      attendancePercentage,
      rewardCredits,
      status: 'ATTENDANCE_FINALIZED',
      alreadyFinalized: false
    };
  },

  async completeGroupCohortSession(args) {
    return await this.finalizeMasterclassAttendance(args);
  },

  async getBookingMentors(filter = {}) {
    const users = await db.allAsync(`SELECT * FROM users WHERE is_admin = 0 ORDER BY rating DESC, reviews_count DESC`);
    const mentors = [];
    for (const u of users) {
      if (filter.excludeUserId && u.id === filter.excludeUserId) {
        continue;
      }
      const skills = await db.allAsync(`SELECT * FROM skills_offered WHERE user_id = ?`, [u.id]);
      if (skills.length === 0 && !['akki', 'sri', 'rishi', 'bharath'].some(n => (u.name || '').toLowerCase().includes(n))) {
        continue;
      }
      const certs = await db.allAsync(`SELECT * FROM certificates WHERE user_id = ?`, [u.id]);
      const attempts = await db.allAsync(`SELECT * FROM quiz_attempts WHERE user_id = ?`, [u.id]);
      const maxScore = attempts.reduce((max, a) => Math.max(max, a.score_percent || 0), 0);
      const tierInfo = determineTutorTier(maxScore, certs.length > 0);

      const skillRate = skills.length > 0 ? Number(skills[0].rate || tierInfo.rate) : tierInfo.rate;
      const effectiveRate = Number(skillRate || 2.5).toFixed(1);

      let level = 'Peer Mentor';
      if ((u.name || '').toLowerCase().includes('akki') || tierInfo.tier.includes('Elite') || (u.rating >= 4.8 && u.reviews_count >= 20)) {
        level = 'Elite Mentor';
      }

      const lower = (u.name || '').toLowerCase();
      let availString = 'Available Today 09:00 AM – 10:00 PM';
      if (lower.includes('sri')) availString = 'Available Today 10:00 AM – 08:00 PM';
      else if (lower.includes('rishi')) availString = 'Available Tomorrow 09:00 AM – 07:00 PM';
      else if (lower.includes('bharath')) availString = 'Available Today 11:00 AM – 09:00 PM';

      mentors.push({
        id: u.id,
        name: u.name,
        email: u.email,
        avatar: u.avatar || 'avatar_1',
        college: u.college,
        major: u.major,
        level,
        tier: tierInfo.tier,
        rating: Number(u.rating || 5.0).toFixed(1),
        reviews_count: u.reviews_count || 15,
        rate: Number(effectiveRate),
        rateDisplay: `${effectiveRate} Cr/hr`,
        availability: availString,
        skills: skills.map(s => s.name)
      });
    }

    if (filter.search) {
      const q = filter.search.toLowerCase().trim();
      return mentors.filter(m =>
        m.name.toLowerCase().includes(q) ||
        m.skills.some(s => s.toLowerCase().includes(q)) ||
        m.level.toLowerCase().includes(q)
      );
    }
    return mentors;
  },

  async getBookingSubjects() {
    try {
      const subjects = await db.allAsync(`SELECT * FROM subjects ORDER BY id ASC`);
      if (subjects && subjects.length > 0) {
        return subjects.map(s => ({
          ...s,
          topics: typeof s.topics_json === 'string' ? JSON.parse(s.topics_json) : (s.topics || [])
        }));
      }
    } catch (err) {
      console.error('Error fetching subjects from DB, using defaults:', err);
    }
    return [
      { id: 'subj-1', name: 'UI/UX Design & Figma', category: 'Design', icon: '🎨', topics: ['Figma Auto-layout & Tokens', 'User Research & Persona', 'Wireframing & Prototyping', 'Design Systems'] },
      { id: 'subj-2', name: 'Python Core & OOP', category: 'Development', icon: '🐍', topics: ['Data Structures & Lists', 'Object Oriented Programming', 'File I/O & Exception Handling', 'Asyncio & Concurrency'] },
      { id: 'subj-3', name: 'React.js Frontend', category: 'Development', icon: '⚛️', topics: ['Hooks (useState, useEffect)', 'State Management (Redux/Zustand)', 'Component Architecture', 'Performance Optimization'] },
      { id: 'subj-4', name: 'Data Structures & Algorithms', category: 'Computer Science', icon: '⚡', topics: ['Arrays & Hash Maps', 'Trees & Graph Traversal', 'Dynamic Programming', 'Sorting & Binary Search'] },
      { id: 'subj-5', name: 'SQL & Database Design', category: 'Data', icon: '🗄️', topics: ['Complex Queries & Joins', 'Database Indexing', 'Schema Normalization', 'Transactions & ACID'] },
      { id: 'subj-6', name: 'Machine Learning Basics', category: 'AI & Data', icon: '🤖', topics: ['Supervised Learning', 'Neural Networks with PyTorch', 'Data Preprocessing & Pandas', 'Model Evaluation'] },
      { id: 'subj-7', name: 'Cyber Security & Ethical Hacking', category: 'Security', icon: '🛡️', topics: ['Network Security & Wireshark', 'Web Vulnerability Scans', 'Penetration Testing', 'Cryptography Basics'] },
      { id: 'subj-8', name: 'Tailwind & Design Systems', category: 'Design', icon: '💅', topics: ['Utility-First CSS', 'Responsive Breakpoints', 'Custom Themes & Config', 'Component Extraction'] },
      { id: 'subj-9', name: 'Node.js & Express APIs', category: 'Development', icon: '🚀', topics: ['REST API Architecture', 'JWT Authentication', 'Middleware & Error Handling', 'WebSockets & Realtime'] }
    ];
  },

  async getMentorAvailableSlots({ mentorId, date }) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const d = new Date(targetDate + 'T00:00:00');
    const dayOfWeek = d.getDay();

    let avail = null;
    try {
      avail = await db.getAsync(
        `SELECT * FROM mentor_availability WHERE user_id = ? AND (day_of_week = ? OR day_of_week IS NULL) AND is_active = 1 LIMIT 1`,
        [mentorId, dayOfWeek]
      );
    } catch (e) {
      avail = null;
    }

    let startHour = 9;
    let endHour = 22;
    if (avail) {
      const parseHour = (str) => {
        if (!str) return 9;
        const parts = str.trim().split(' ');
        const timeParts = parts[0].split(':');
        let h = parseInt(timeParts[0], 10);
        const ampm = (parts[1] || '').toUpperCase();
        if (ampm === 'PM' && h < 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
        return h;
      };
      startHour = parseHour(avail.start_time);
      endHour = parseHour(avail.end_time);
    }

    const allPossibleSlots = [
      { time: '09:00 AM', hour: 9 },
      { time: '10:00 AM', hour: 10 },
      { time: '11:00 AM', hour: 11 },
      { time: '02:00 PM', hour: 14 },
      { time: '03:00 PM', hour: 15 },
      { time: '05:00 PM', hour: 17 },
      { time: '06:00 PM', hour: 18 },
      { time: '07:00 PM', hour: 19 },
      { time: '08:00 PM', hour: 20 }
    ];

    const slotsInOperatingHours = allPossibleSlots.filter(s => s.hour >= startHour && s.hour < endHour);

    const bookedSessions = await db.allAsync(
      `SELECT time FROM sessions WHERE teacher_id = ? AND date = ? AND status != 'Cancelled'`,
      [mentorId, targetDate]
    );
    const bookedTimes = new Set(bookedSessions.map(s => s.time.trim().toUpperCase()));

    return slotsInOperatingHours.map(s => ({
      time: s.time,
      isAvailable: !bookedTimes.has(s.time.trim().toUpperCase())
    }));
  },

  async bookSessionEscrow({
    learnerId,
    tutorId,
    skillName,
    subject,
    topic,
    sessionDate,
    date,
    time,
    durationHours,
    duration,
    title,
    description,
    sessionType,
    meetingPlatform,
    additionalNotes,
    meetingLink,
    credits,
    rate: customRate
  }) {
    if (!learnerId) throw new Error('Authentication required');
    if (!tutorId) throw new Error('Please select a mentor');
    if (learnerId === tutorId) throw new Error('You cannot book a session with yourself');

    const finalDate = (sessionDate || date || '').trim();
    const finalTime = typeof time === 'object' && time !== null ? String(time.time || '10:00 AM').trim() : String(time || '10:00 AM').trim();
    if (!finalDate) throw new Error('Please select a valid date');

    const hours = Number(durationHours || duration || 1);
    const finalSkill = (skillName || subject || 'Python Programming').trim();
    const finalTopic = (topic || title || `${finalSkill} Mentorship Session`).trim();
    const finalDesc = (description || '').trim();
    const finalPlatform = meetingPlatform || 'Google Meet';
    const finalType = sessionType || '1-on-1 Swap Session';
    const finalNotes = (additionalNotes || '').trim();

    // 1. Double Booking Check (atomic conflict guard)
    const existingBooking = await db.getAsync(
      `SELECT id FROM sessions WHERE teacher_id = ? AND date = ? AND time = ? AND UPPER(status) NOT IN ('CANCELLED', 'DECLINED')`,
      [tutorId, finalDate, finalTime]
    );
    if (existingBooking) {
      const conflictErr = new Error('This time slot is no longer available. Please select another time slot.');
      conflictErr.isConflict = true;
      conflictErr.status = 409;
      throw conflictErr;
    }

    // 2. Fetch tutor and calculate rate
    const tutor = await db.getAsync(`SELECT * FROM users WHERE id = ?`, [tutorId]);
    if (!tutor) throw new Error('Selected mentor was not found');
    if (!tutor.is_verified) {
      throw new Error('This mentor has not passed certificate verification and is not eligible to take bookings.');
    }

    const skill = await db.getAsync(
      `SELECT * FROM skills_offered WHERE user_id = ? AND LOWER(name) LIKE ?`,
      [tutorId, `%${finalSkill.toLowerCase().split(' ')[0]}%`]
    );
    const requestedRate = customRate != null ? Number(customRate) : (credits != null ? Number(credits) : null);
    const rate = requestedRate != null && !isNaN(requestedRate) ? requestedRate : (skill ? Number(skill.rate) : (tutor.rating >= 4.8 ? 2.5 : 2.0));
    const requiredCredits = Math.round((hours * rate) * 100) / 100;

    // 3. Check learner balance
    const learner = await db.getAsync(`SELECT * FROM users WHERE id = ?`, [learnerId]);
    if (!learner || learner.credits < requiredCredits) {
      throw new Error(`Insufficient credits balance (${learner ? learner.credits : 0} Cr available). Required: ${requiredCredits} Cr.`);
    }

    // 4. Generate meeting link
    const finalMeetingLink = meetingLink || (finalPlatform === 'Google Meet'
      ? `https://meet.google.com/skillswap-${Math.random().toString(36).substring(2, 6)}-${Math.random().toString(36).substring(2, 5)}`
      : `https://meet.skillswap.edu/room/${Date.now().toString(36)}`);

    // 5. Booking Validation - Available Credits Check
    // User A balance remains untouched until both join and 50% duration is reached
    const sessionId = 'sess_' + Date.now();
    try {
      await db.runAsync(
        `INSERT INTO sessions (
          id, teacher_id, student_id, skill, hours, rate, credits, date, time, status, topic,
          description, platform, meeting_platform, session_type, code_workspace, additional_notes, payment_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
        [
          sessionId,
          tutorId,
          learnerId,
          finalSkill,
          hours,
          rate,
          requiredCredits,
          finalDate,
          finalTime,
          finalTopic,
          finalDesc,
          finalPlatform,
          finalPlatform,
          finalType,
          finalMeetingLink,
          finalNotes
        ]
      );
    } catch (dbErr) {
      if (dbErr.message && dbErr.message.includes('UNIQUE constraint failed')) {
        const conflictErr = new Error('This time slot is no longer available. Please select another time slot.');
        conflictErr.isConflict = true;
        conflictErr.status = 409;
        throw conflictErr;
      }
      throw dbErr;
    }

    // 7. Notifications
    const notifTutorId = 'notif_' + Date.now() + '_t';
    const notifLearnerId = 'notif_' + Date.now() + '_l';
    try {
      await db.runAsync(
        `INSERT INTO notifications (id, user_id, title, message, time, is_unread, type)
         VALUES (?, ?, 'New Swap Session Request', ?, 'Just now', 1, 'session')`,
        [notifTutorId, tutorId, `New swap session request from ${learner.name} for ${hours}hr on ${finalSkill} (${finalDate} @ ${finalTime}).`]
      );
      await db.runAsync(
        `INSERT INTO notifications (id, user_id, title, message, time, is_unread, type)
         VALUES (?, ?, 'Session Request Sent', ?, 'Just now', 1, 'session')`,
        [notifLearnerId, learnerId, `Your session request has been sent to ${tutor.name}. You will be notified when the mentor accepts or declines.`]
      );
    } catch (e) {}

    const updatedLearner = await db.getAsync(`SELECT credits, escrow_locked FROM users WHERE id = ?`, [learnerId]);

    return {
      success: true,
      sessionId,
      session: {
        id: sessionId,
        mentor: { id: tutor.id, name: tutor.name, avatar: tutor.avatar },
        subject: finalSkill,
        topic: finalTopic,
        date: finalDate,
        time: finalTime,
        status: 'PENDING',
        hours,
        credits: requiredCredits,
        platform: finalPlatform,
        meetingLink: finalMeetingLink
      },
      escrowLocked: requiredCredits,
      remainingCredits: updatedLearner.credits
    };
  },

  /**
   * CRITICAL CREDIT TRANSFER RULE:
   * When User A books User B, session credit is transferred ONLY after BOTH have joined
   * and the session has reached 50% of its scheduled duration.
   * Atomic operation:
   *   User A balance -= session_credits
   *   User B balance += session_credits
   * Ledgers:
   *   User A: Type 'Session Payment', Description '1 Credit paid to User B for Python session', Impact -1.0, Status COMPLETED
   *   User B: Type 'Session Earnings', Description '1 Credit earned from Python session with User A', Impact +1.0, Status COMPLETED
   * Duplicate Protection:
   *   Only 1 transfer per session_id.
   */
  async releaseSessionPaymentAtHalfDuration({ sessionId, userId, forceTestThreshold = false }) {
    const session = await db.getAsync(`SELECT * FROM sessions WHERE id = ?`, [sessionId]);
    if (!session) {
      const err = new Error('Session not found');
      err.status = 404;
      throw err;
    }

    // 1. Duplicate Protection: Check if already released
    if (session.payment_status === 'RELEASED') {
      return {
        success: true,
        alreadyReleased: true,
        sessionId,
        payment_status: 'RELEASED',
        message: 'Payment has already been transferred for this session.'
      };
    }

    const currentStatus = (session.status || '').toUpperCase();
    if (currentStatus === 'CANCELLED') {
      const err = new Error('Cannot transfer credits: Session has been cancelled.');
      err.status = 400;
      throw err;
    }
    if (currentStatus === 'DECLINED') {
      const err = new Error('Cannot transfer credits: Session request was declined.');
      err.status = 400;
      throw err;
    }

    // 2. Both User A and User B must have joined
    const studentJoined = !!session.student_joined_at;
    const teacherJoined = !!session.teacher_joined_at;

    if (!forceTestThreshold && (!studentJoined || !teacherJoined)) {
      const missing = !studentJoined && !teacherJoined ? 'Both student and mentor' : (!studentJoined ? 'Student' : 'Mentor');
      const err = new Error(`Cannot transfer credits: ${missing} must join the session before the 50% milestone.`);
      err.status = 400;
      throw err;
    }

    // 3. Verify 50% Duration Reached
    const durationHours = Number(session.hours || 1);
    const scheduledMinutes = durationHours * 60;
    const halfDurationMinutes = scheduledMinutes * 0.5; // e.g. 30 mins for 1 hr

    let elapsedMinutes = 0;
    if (session.meeting_started_at) {
      const startStr = String(session.meeting_started_at);
      const normalizedStart = (startStr.endsWith('Z') || startStr.includes('+'))
        ? startStr
        : startStr.replace(' ', 'T') + 'Z';
      const startTime = new Date(normalizedStart).getTime();
      const now = Date.now();
      elapsedMinutes = Math.max(0, (now - startTime) / (1000 * 60));
    }

    if (!forceTestThreshold && elapsedMinutes < halfDurationMinutes) {
      const err = new Error(`Session has not reached 50% duration yet. Elapsed: ${elapsedMinutes.toFixed(1)}m, Required: ${halfDurationMinutes}m.`);
      err.status = 400;
      throw err;
    }

    // 4. ATOMIC DUPLICATE PROTECTION LOCK
    const transferCredits = Number(session.credits || 1.0);
    const lockRes = await db.runAsync(
      `UPDATE sessions 
       SET payment_status = 'RELEASED', 
           payment_released_at = CURRENT_TIMESTAMP, 
           total_earned_credits = ? 
       WHERE id = ? AND (payment_status IS NULL OR payment_status = 'PENDING')`,
      [transferCredits, sessionId]
    );

    if (lockRes.changes === 0) {
      return {
        success: true,
        alreadyReleased: true,
        sessionId,
        payment_status: 'RELEASED',
        message: 'Payment was already transferred by another process.'
      };
    }

    const student = await db.getAsync(`SELECT * FROM users WHERE id = ?`, [session.student_id]);
    const teacher = await db.getAsync(`SELECT * FROM users WHERE id = ?`, [session.teacher_id]);

    if (!student || !teacher) {
      // Rollback lock if users not found
      await db.runAsync(`UPDATE sessions SET payment_status = 'PENDING', payment_released_at = NULL WHERE id = ?`, [sessionId]);
      throw new Error('Student or Mentor user not found.');
    }

    try {
      // 5. Atomic Balance Updates
      // User A balance -= transferCredits
      // User B balance += transferCredits
      const studentEscrow = Number(student.escrow_locked || 0);
      const deductFromEscrow = studentEscrow >= transferCredits ? transferCredits : 0;
      const deductFromAvailable = deductFromEscrow > 0 ? 0 : transferCredits;

      await db.runAsync(
        `UPDATE users 
         SET credits = ROUND(MAX(0, credits - ?), 2), 
             escrow_locked = ROUND(MAX(0, escrow_locked - ?), 2),
             lifetime_spent = ROUND(lifetime_spent + ?, 2) 
         WHERE id = ?`,
        [deductFromAvailable, deductFromEscrow, transferCredits, session.student_id]
      );

      await db.runAsync(
        `UPDATE users 
         SET credits = ROUND(credits + ?, 2), 
             lifetime_earned = ROUND(lifetime_earned + ?, 2) 
         WHERE id = ?`,
        [transferCredits, transferCredits, session.teacher_id]
      );

      // 6. User A's Ledger Entry
      const txIdStudent = 'tx_pay_' + Date.now() + '_s';
      await db.runAsync(
        `INSERT INTO transactions (id, user_id, date, type, description, amount, status, student_name, reference_type, reference_id)
         VALUES (?, ?, DATE('now'), 'Session Payment', ?, ?, 'COMPLETED', ?, 'SESSION', ?)`,
        [
          txIdStudent,
          session.student_id,
          `${transferCredits} Credit paid to ${teacher.name} for ${session.skill} session`,
          -transferCredits,
          teacher.name,
          sessionId
        ]
      );

      // 7. User B's Ledger Entry
      const txIdTeacher = 'tx_earn_' + Date.now() + '_t';
      await db.runAsync(
        `INSERT INTO transactions (id, user_id, date, type, description, amount, status, student_name, reference_type, reference_id)
         VALUES (?, ?, DATE('now'), 'Session Earnings', ?, ?, 'COMPLETED', ?, 'SESSION', ?)`,
        [
          txIdTeacher,
          session.teacher_id,
          `${transferCredits} Credit earned from ${session.skill} session with ${student.name}`,
          transferCredits,
          student.name,
          sessionId
        ]
      );

      // 8. Notifications
      try {
        const notifS = 'notif_sp_' + Date.now();
        await db.runAsync(
          `INSERT INTO notifications (id, user_id, title, message, time, is_unread, type)
           VALUES (?, ?, '50% Duration Milestone Reached', ?, 'Just now', 1, 'credit')`,
          [
            notifS,
            session.student_id,
            `50% of your ${session.skill} session with ${teacher.name} has elapsed. ${transferCredits} Credit transferred to mentor.`
          ]
        );
        const notifT = 'notif_tp_' + Date.now();
        await db.runAsync(
          `INSERT INTO notifications (id, user_id, title, message, time, is_unread, type)
           VALUES (?, ?, 'Session Earnings - 50% Milestone Reached', ?, 'Just now', 1, 'credit')`,
          [
            notifT,
            session.teacher_id,
            `50% of your ${session.skill} session with ${student.name} reached! +${transferCredits} Credit earned and added to your wallet.`
          ]
        );
      } catch (e) {}

      const updatedStudent = await db.getAsync(`SELECT id, credits, escrow_locked FROM users WHERE id = ?`, [session.student_id]);
      const updatedTeacher = await db.getAsync(`SELECT id, credits FROM users WHERE id = ?`, [session.teacher_id]);

      return {
        success: true,
        sessionId,
        payment_status: 'RELEASED',
        transferredCredits: transferCredits,
        studentCredits: updatedStudent?.credits,
        teacherCredits: updatedTeacher?.credits,
        message: `Successfully transferred ${transferCredits} Credit from ${student.name} to ${teacher.name} at 50% session duration.`
      };
    } catch (err) {
      // Rollback payment_status if balance update fails
      await db.runAsync(`UPDATE sessions SET payment_status = 'PENDING', payment_released_at = NULL WHERE id = ?`, [sessionId]);
      throw err;
    }
  },

  async completeSessionAndReleaseEscrow({ sessionId, rating, comment, tags }) {
    const session = await db.getAsync(`SELECT * FROM sessions WHERE id = ?`, [sessionId]);
    if (!session) throw new Error('Session not found');
    if (session.status === 'Completed') throw new Error('Session is already completed');

    const learner = await db.getAsync(`SELECT * FROM users WHERE id = ?`, [session.student_id]);
    const tutor = await db.getAsync(`SELECT * FROM users WHERE id = ?`, [session.teacher_id]);

    const escrowCredits = session.credits;

    // If payment was already released at 50% duration milestone, do NOT transfer again
    if (session.payment_status === 'RELEASED') {
      await db.runAsync(`UPDATE sessions SET status = 'Completed', attendance_status = 'ATTENDED', attendance_finalized_at = CURRENT_TIMESTAMP WHERE id = ?`, [sessionId]);
      await this.addReview({
        sessionId,
        learnerId: session.student_id,
        tutorId: session.teacher_id,
        rating,
        comment,
        tags
      });
      return { success: true, releasedCredits: escrowCredits, alreadyTransferredAtHalfDuration: true };
    }

    // Release escrow from learner and credit tutor
    await db.runAsync(
      `UPDATE users SET escrow_locked = ROUND(MAX(0, escrow_locked - ?), 2), lifetime_spent = ROUND(lifetime_spent + ?, 2) WHERE id = ?`,
      [escrowCredits, escrowCredits, session.student_id]
    );
    await db.runAsync(
      `UPDATE users SET credits = ROUND(credits + ?, 2), lifetime_earned = ROUND(lifetime_earned + ?, 2) WHERE id = ?`,
      [escrowCredits, escrowCredits, session.teacher_id]
    );

    await db.runAsync(`UPDATE sessions SET status = 'Completed', attendance_status = 'ATTENDED', attendance_finalized_at = CURRENT_TIMESTAMP WHERE id = ?`, [sessionId]);

    // Record Completion Transactions
    await db.runAsync(
      `INSERT INTO transactions (id, user_id, date, type, description, amount, status, student_name, reference_type, reference_id)
       VALUES (?, ?, ?, 'Spent', ?, ?, 'Completed', ?, 'SESSION', ?)`,
      ['tx_' + Date.now() + '_l', session.student_id, new Date().toISOString().split('T')[0], `Completed ${session.hours}hr ${session.skill} with ${tutor.name}`, -escrowCredits, tutor.name, sessionId]
    );
    await db.runAsync(
      `INSERT INTO transactions (id, user_id, date, type, description, amount, status, student_name, reference_type, reference_id)
       VALUES (?, ?, ?, 'SESSION_REWARD', ?, ?, 'Completed', ?, 'SESSION', ?)`,
      ['tx_' + Date.now() + '_t', session.teacher_id, new Date().toISOString().split('T')[0], `Earned from ${session.hours}hr ${session.skill} session with ${learner.name}`, escrowCredits, learner.name, sessionId]
    );

    // Save Student Review
    await this.addReview({
      sessionId,
      learnerId: session.student_id,
      tutorId: session.teacher_id,
      rating,
      comment,
      tags
    });

    return { success: true, releasedCredits: escrowCredits };
  },

  async acceptSessionRequest({ sessionId, userId }) {
    const session = await db.getAsync(`SELECT * FROM sessions WHERE id = ?`, [sessionId]);
    if (!session) {
      const err = new Error('Session not found');
      err.status = 404;
      throw err;
    }

    if (session.teacher_id !== userId) {
      const err = new Error('Forbidden: Only the selected mentor/instructor can accept this session request');
      err.status = 403;
      throw err;
    }

    const tutor = await db.getAsync(`SELECT is_verified FROM users WHERE id = ?`, [userId]);
    if (!tutor || !tutor.is_verified) {
      const err = new Error('Cannot accept request: Tutor certificate verification required before accepting swap sessions.');
      err.status = 403;
      throw err;
    }

    const currentStatus = (session.status || '').toUpperCase();
    if (currentStatus === 'CANCELLED') {
      const err = new Error('Cannot accept: Session request has been cancelled by the student.');
      err.status = 409;
      err.isConflict = true;
      throw err;
    }
    if (currentStatus === 'DECLINED') {
      const err = new Error('Cannot accept: Session request has already been declined.');
      err.status = 409;
      err.isConflict = true;
      throw err;
    }
    if (currentStatus !== 'PENDING') {
      const err = new Error('This session request has already been accepted or declined.');
      err.status = 409;
      err.isConflict = true;
      throw err;
    }

    // Atomic update checking status = 'PENDING'
    const result = await db.runAsync(
      `UPDATE sessions 
       SET status = 'ACCEPTED', accepted_by_user_id = ?, accepted_at = CURRENT_TIMESTAMP 
       WHERE id = ? AND UPPER(status) = 'PENDING' AND teacher_id = ?`,
      [userId, sessionId, userId]
    );

    if (result.changes === 0) {
      const err = new Error('Cannot accept: Session request has been cancelled or already handled.');
      err.status = 409;
      err.isConflict = true;
      throw err;
    }

    // Send notification to student (learner)
    try {
      const tutor = await db.getAsync(`SELECT name FROM users WHERE id = ?`, [userId]);
      const notifId = 'notif_acc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      await db.runAsync(
        `INSERT INTO notifications (id, user_id, title, message, time, is_unread, type)
         VALUES (?, ?, 'Session Request Accepted', ?, 'Just now', 1, 'session')`,
        [
          notifId,
          session.student_id,
          `${tutor?.name || 'Mentor'} accepted your session request for ${session.skill} on ${session.date} at ${session.time}.`
        ]
      );
    } catch (e) {}

    const updated = await db.getAsync(`SELECT * FROM sessions WHERE id = ?`, [sessionId]);
    return {
      success: true,
      sessionId,
      status: 'ACCEPTED',
      accepted_by_user_id: userId,
      accepted_at: updated?.accepted_at,
      message: 'Session request accepted successfully',
      session: updated
    };
  },

  async declineSessionRequest({ sessionId, userId, reason }) {
    const session = await db.getAsync(`SELECT * FROM sessions WHERE id = ?`, [sessionId]);
    if (!session) {
      const err = new Error('Session not found');
      err.status = 404;
      throw err;
    }

    if (session.teacher_id !== userId) {
      const err = new Error('Forbidden: Only the selected mentor/instructor can decline this session request');
      err.status = 403;
      throw err;
    }

    const currentStatus = (session.status || '').toUpperCase();
    if (currentStatus === 'CANCELLED') {
      const err = new Error('Cannot decline: Session request has already been cancelled by the student.');
      err.status = 409;
      err.isConflict = true;
      throw err;
    }
    if (currentStatus !== 'PENDING') {
      const err = new Error('This session request has already been handled.');
      err.status = 409;
      err.isConflict = true;
      throw err;
    }

    // Atomic update
    const result = await db.runAsync(
      `UPDATE sessions 
       SET status = 'DECLINED', declined_by_user_id = ?, declined_at = CURRENT_TIMESTAMP,
           additional_notes = CASE WHEN ? != '' THEN ? ELSE additional_notes END
       WHERE id = ? AND UPPER(status) = 'PENDING' AND teacher_id = ?`,
      [userId, reason || '', reason || '', sessionId, userId]
    );

    if (result.changes === 0) {
      const err = new Error('This session request has already been handled.');
      err.status = 409;
      err.isConflict = true;
      throw err;
    }

    // Refund student escrow credits
    const refundCredits = session.credits || 0;
    if (refundCredits > 0) {
      await db.runAsync(
        `UPDATE users SET credits = ROUND(credits + ?, 2), escrow_locked = ROUND(MAX(0, escrow_locked - ?), 2) WHERE id = ?`,
        [refundCredits, refundCredits, session.student_id]
      );

      // Record Refund Transaction
      const txId = 'tx_decl_refund_' + Date.now();
      const tutor = await db.getAsync(`SELECT name FROM users WHERE id = ?`, [userId]);
      await db.runAsync(
        `INSERT INTO transactions (id, user_id, date, type, description, amount, status, student_name, reference_type, reference_id)
         VALUES (?, ?, ?, 'Refund', ?, ?, 'Completed', ?, 'SESSION', ?)`,
        [
          txId,
          session.student_id,
          new Date().toISOString().split('T')[0],
          `Refunded ${refundCredits} Cr for declined session: ${session.skill} with ${tutor?.name || 'Mentor'}`,
          refundCredits,
          tutor?.name || 'Mentor',
          sessionId
        ]
      );
    }

    // Notify student
    try {
      const tutor = await db.getAsync(`SELECT name FROM users WHERE id = ?`, [userId]);
      const notifId = 'notif_decl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      await db.runAsync(
        `INSERT INTO notifications (id, user_id, title, message, time, is_unread, type)
         VALUES (?, ?, 'Session Request Declined', ?, 'Just now', 1, 'session')`,
        [
          notifId,
          session.student_id,
          `${tutor?.name || 'Mentor'} was unable to accept your swap session request for ${session.skill}. Your credits have been returned to your wallet.`
        ]
      );
    } catch (e) {}

    const updated = await db.getAsync(`SELECT * FROM sessions WHERE id = ?`, [sessionId]);
    return {
      success: true,
      sessionId,
      status: 'DECLINED',
      declined_by_user_id: userId,
      declined_at: updated?.declined_at,
      refundedCredits: refundCredits,
      message: 'Session request declined and credits refunded.',
      session: updated
    };
  },

  async finalizeSessionAttendance({ sessionId, userId, attendanceStatus = 'Attended' }) {
    const session = await db.getAsync(`SELECT * FROM sessions WHERE id = ?`, [sessionId]);
    if (!session) throw new Error('Session not found');

    if (session.teacher_id !== userId) {
      throw new Error('Forbidden: Only the session host/mentor can finalize attendance');
    }

    const st = (session.status || '').toUpperCase();
    if (st !== 'ACCEPTED' && st !== 'CONFIRMED' && st !== 'OPEN' && st !== 'LIVE') {
      if (st === 'COMPLETED') {
        if (!session.completed_at) {
          await db.runAsync(`UPDATE sessions SET completed_at = CURRENT_TIMESTAMP WHERE id = ?`, [sessionId]);
        }
        return {
          success: true,
          alreadyFinalized: true,
          message: 'Session attendance has already been finalized.'
        };
      }
      throw new Error(`Cannot finalize attendance for session with status "${session.status}".`);
    }

    // If payment was already released at 50% duration milestone, do not transfer again
    if (session.payment_status === 'RELEASED') {
      await db.runAsync(
        `UPDATE sessions 
         SET status = 'Completed', attendance_status = 'ATTENDED', attendance_finalized_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [sessionId]
      );
      return {
        success: true,
        alreadyFinalized: true,
        paymentAlreadyReleased: true,
        rewardCredits: session.credits,
        message: 'Session completed. Payment was already transferred at 50% duration milestone.'
      };
    }

    // Duplicate reward check
    const existingReward = await db.getAsync(
      `SELECT * FROM transactions WHERE reference_type = 'SESSION' AND reference_id = ? AND type IN ('SESSION_REWARD', 'Session Earnings')`,
      [sessionId]
    );

    const tutor = await db.getAsync(`SELECT * FROM users WHERE id = ?`, [session.teacher_id]);
    const learner = await db.getAsync(`SELECT * FROM users WHERE id = ?`, [session.student_id]);
    const rate = session.rate || tutor?.hourly_rate || 2.5;
    const hours = session.hours || 1;
    const rewardCredits = Math.round(Number(session.credits || (rate * hours)) * 100) / 100;

    if (existingReward) {
      await db.runAsync(
        `UPDATE sessions 
         SET status = 'Completed', attendance_status = 'ATTENDED', attendance_finalized_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [sessionId]
      );
      return {
        success: true,
        alreadyFinalized: true,
        rewardCredits: existingReward.amount,
        message: 'Attendance already finalized. Duplicate reward prevented.'
      };
    }

    const attLower = (attendanceStatus || '').toLowerCase();
    const isAttended = attLower.includes('attend') && !attLower.includes('did not') && !attLower.includes('not');

    if (isAttended) {
      // 1. Release escrow from learner & mark lifetime spent
      await db.runAsync(
        `UPDATE users 
         SET escrow_locked = ROUND(MAX(0, escrow_locked - ?), 2), 
             lifetime_spent = ROUND(lifetime_spent + ?, 2) 
         WHERE id = ?`,
        [rewardCredits, rewardCredits, session.student_id]
      );

      // 2. Add reward credits to INSTRUCTOR wallet & mark lifetime earned
      await db.runAsync(
        `UPDATE users 
         SET credits = ROUND(credits + ?, 2), 
             lifetime_earned = ROUND(lifetime_earned + ?, 2) 
         WHERE id = ?`,
        [rewardCredits, rewardCredits, session.teacher_id]
      );

      // 3. Insert transaction into Credit Ledger
      const txIdTutor = 'tx_rew_' + Date.now() + '_t';
      await db.runAsync(
        `INSERT INTO transactions (id, user_id, date, type, description, amount, status, student_name, reference_type, reference_id)
         VALUES (?, ?, ?, 'SESSION_REWARD', ?, ?, 'Completed', ?, 'SESSION', ?)`,
        [
          txIdTutor,
          session.teacher_id,
          new Date().toISOString().split('T')[0],
          `Reward for completing ${hours}hr ${session.skill} session with ${learner?.name || 'Student'}`,
          rewardCredits,
          learner?.name || 'Student',
          sessionId
        ]
      );

      // Also record learner spent transaction if not already recorded
      const learnerSpent = await db.getAsync(
        `SELECT * FROM transactions WHERE reference_type = 'SESSION' AND reference_id = ? AND type = 'Spent'`,
        [sessionId]
      );
      if (!learnerSpent) {
        const txIdLearner = 'tx_spent_' + Date.now() + '_l';
        await db.runAsync(
          `INSERT INTO transactions (id, user_id, date, type, description, amount, status, student_name, reference_type, reference_id)
           VALUES (?, ?, ?, 'Spent', ?, ?, 'Completed', ?, 'SESSION', ?)`,
          [
            txIdLearner,
            session.student_id,
            new Date().toISOString().split('T')[0],
            `Completed ${hours}hr ${session.skill} with ${tutor?.name || 'Mentor'}`,
            -rewardCredits,
            tutor?.name || 'Mentor',
            sessionId
          ]
        );
      }

      // 4. Update session status
      await db.runAsync(
        `UPDATE sessions 
         SET status = 'Completed', attendance_status = 'ATTENDED', attendance_finalized_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [sessionId]
      );

      // 5. Notifications
      try {
        const notifTutorId = 'notif_fin_' + Date.now() + '_t';
        await db.runAsync(
          `INSERT INTO notifications (id, user_id, title, message, time, is_unread, type)
           VALUES (?, ?, 'Session Completed & Credits Awarded', ?, 'Just now', 1, 'credit')`,
          [
            notifTutorId,
            session.teacher_id,
            `Session completed with ${learner?.name || 'Student'}. +${rewardCredits} Credits added to your wallet.`
          ]
        );

        const notifLearnerId = 'notif_fin_' + Date.now() + '_l';
        await db.runAsync(
          `INSERT INTO notifications (id, user_id, title, message, time, is_unread, type)
           VALUES (?, ?, 'Session Completed', ?, 'Just now', 1, 'session')`,
          [
            notifLearnerId,
            session.student_id,
            `Your session with ${tutor?.name || 'Mentor'} on ${session.skill} has concluded.`
          ]
        );
      } catch (e) {}

      const updatedTutor = await db.getAsync(`SELECT credits FROM users WHERE id = ?`, [session.teacher_id]);
      return {
        success: true,
        sessionId,
        status: 'Completed',
        rewardCredits,
        instructorCredits: updatedTutor?.credits,
        attendanceStatus: 'ATTENDED',
        message: `Session completed successfully. +${rewardCredits} Credits awarded to instructor wallet!`
      };
    } else {
      // Student Did Not Attend - refund student escrow
      await db.runAsync(
        `UPDATE users SET credits = ROUND(credits + ?, 2), escrow_locked = ROUND(MAX(0, escrow_locked - ?), 2) WHERE id = ?`,
        [rewardCredits, rewardCredits, session.student_id]
      );
      await db.runAsync(
        `UPDATE sessions 
         SET status = 'Completed', attendance_status = 'DID_NOT_ATTEND', attendance_finalized_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [sessionId]
      );
      return {
        success: true,
        sessionId,
        status: 'Completed',
        attendanceStatus: 'DID_NOT_ATTEND',
        message: 'Attendance finalized: Student marked as Did Not Attend.'
      };
    }
  },

  async cancelSessionAndRefundEscrow({ sessionId, reason, userId }) {
    const session = await db.getAsync(`SELECT * FROM sessions WHERE id = ?`, [sessionId]);
    if (!session) {
      const err = new Error('Session not found');
      err.status = 404;
      throw err;
    }

    const currentStatus = (session.status || '').toUpperCase();
    if (currentStatus === 'CANCELLED') {
      const err = new Error('This session request has already been cancelled.');
      err.status = 409;
      err.isConflict = true;
      throw err;
    }
    if (currentStatus === 'DECLINED') {
      const err = new Error('This session request has already been declined.');
      err.status = 409;
      err.isConflict = true;
      throw err;
    }
    if (currentStatus === 'COMPLETED' || currentStatus === 'ATTENDANCE_FINALIZED') {
      const err = new Error('Cannot cancel a session that has already been completed.');
      err.status = 409;
      err.isConflict = true;
      throw err;
    }

    const isCohort = session.session_type === 'GROUP_COHORT';

    // Strict Authorization verification
    if (userId) {
      if (isCohort) {
        if (session.teacher_id !== userId) {
          const user = await db.getAsync(`SELECT role FROM users WHERE id = ?`, [userId]);
          if (!user || (user.role !== 'ADMIN' && user.role !== 'FACULTY_ADMIN' && user.role !== 'SUPER_ADMIN')) {
            const err = new Error('Forbidden: Only the host can cancel this masterclass.');
            err.status = 403;
            throw err;
          }
        }
      } else {
        // 1-on-1 Swap Session
        if (currentStatus === 'PENDING') {
          // Only the requester (student) can cancel a pending request
          if (session.student_id !== userId) {
            const err = new Error('Forbidden: Only the requester can cancel this pending session request.');
            err.status = 403;
            throw err;
          }
        } else {
          // Confirmed / Accepted session
          if (session.student_id !== userId && session.teacher_id !== userId) {
            const user = await db.getAsync(`SELECT role FROM users WHERE id = ?`, [userId]);
            if (!user || (user.role !== 'ADMIN' && user.role !== 'FACULTY_ADMIN' && user.role !== 'SUPER_ADMIN')) {
              const err = new Error('Forbidden: You are not an authorized participant in this session.');
              err.status = 403;
              throw err;
            }
          }
        }
      }
    }

    const cancellingUserId = userId || session.student_id;
    const finalReason = reason || (isCohort ? 'Masterclass cancelled by host' : (currentStatus === 'PENDING' ? 'Cancelled by requester' : 'Session cancelled'));

    if (isCohort) {
      const updateRes = await db.runAsync(
        `UPDATE sessions 
         SET status = 'CANCELLED', cancelled_by = ?, cancelled_at = CURRENT_TIMESTAMP, cancellation_reason = ? 
         WHERE id = ? AND UPPER(status) != 'CANCELLED'`,
        [cancellingUserId, finalReason, sessionId]
      );
      if (updateRes.changes === 0) {
        const err = new Error('Masterclass has already been cancelled.');
        err.status = 409;
        err.isConflict = true;
        throw err;
      }
      try {
        await db.runAsync(`UPDATE masterclass_registrations SET status = 'CANCELLED' WHERE masterclass_id = ?`, [sessionId]);
      } catch (e) {}
      try {
        await db.runAsync(`UPDATE session_attendees SET status = 'CANCELLED' WHERE session_id = ?`, [sessionId]);
      } catch (e) {}

      // Notify registered attendees
      try {
        const attendees = await db.allAsync(
          `SELECT DISTINCT student_id as user_id FROM session_attendees WHERE session_id = ? 
           UNION 
           SELECT DISTINCT user_id FROM masterclass_registrations WHERE masterclass_id = ?`,
          [sessionId, sessionId]
        );
        for (const att of attendees) {
          if (att.user_id && att.user_id !== session.teacher_id) {
            const notifId = 'notif_cancel_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            await db.runAsync(
              `INSERT INTO notifications (id, user_id, title, message, time, is_unread, type)
               VALUES (?, ?, ?, ?, 'Just now', 1, 'session')`,
              [
                notifId,
                att.user_id,
                `Masterclass Cancelled: ${session.topic || session.skill}`,
                `The masterclass "${session.topic || session.skill}" scheduled for ${session.date} has been cancelled by the host.`
              ]
            );
          }
        }
      } catch (e) {}

      return { success: true, sessionId, status: 'CANCELLED', cancelled_by: cancellingUserId };
    }

    if (!isCohort && currentStatus !== 'PENDING') {
      const err = new Error(`Cannot cancel: Session request has already been ${currentStatus.toLowerCase()} or handled.`);
      err.status = 409;
      err.isConflict = true;
      throw err;
    }

    // 1-on-1 Swap Session: Atomic Conditional Cancellation (PENDING -> CANCELLED)
    const updateRes = await db.runAsync(
      `UPDATE sessions 
       SET status = 'CANCELLED', cancelled_by = ?, cancelled_at = CURRENT_TIMESTAMP, cancellation_reason = ? 
       WHERE id = ? AND UPPER(status) = 'PENDING' AND student_id = ?`,
      [cancellingUserId, finalReason, sessionId, cancellingUserId]
    );

    if (updateRes.changes === 0) {
      const err = new Error('Cannot cancel: Session request has already been accepted, cancelled, or declined.');
      err.status = 409;
      err.isConflict = true;
      throw err;
    }

    // Handle Escrow / Credits
    let refundedCredits = 0;
    const escrowCredits = Number(session.credits || 0);
    const paymentAlreadyReleased = session.payment_status === 'RELEASED' || (session.total_earned_credits && session.total_earned_credits > 0);

    // If cancelled before 50%: User A loses NO credits, User B receives NO credits.
    // If escrow was locked in older sessions, return it; otherwise User A already retained full credits.
    if (!paymentAlreadyReleased && escrowCredits > 0) {
      const studentUser = await db.getAsync(`SELECT escrow_locked FROM users WHERE id = ?`, [session.student_id]);
      if (studentUser && studentUser.escrow_locked >= escrowCredits) {
        await db.runAsync(
          `UPDATE users SET credits = ROUND(credits + ?, 2), escrow_locked = ROUND(MAX(0, escrow_locked - ?), 2) WHERE id = ?`,
          [escrowCredits, escrowCredits, session.student_id]
        );
        refundedCredits = escrowCredits;
      }

      // Record refund transaction in ledger
      try {
        const txId = 'tx_ref_' + Date.now();
        const partner = await db.getAsync(`SELECT name FROM users WHERE id = ?`, [session.teacher_id]);
        await db.runAsync(
          `INSERT INTO transactions (id, user_id, date, type, description, amount, status, student_name, reference_type, reference_id)
           VALUES (?, ?, DATE('now'), 'Refund', ?, ?, 'Completed', ?, 'SESSION', ?)`,
          [
            txId,
            session.student_id,
            `Escrow released: Cancelled ${currentStatus === 'PENDING' ? 'request' : 'session'} for ${session.skill} with ${partner?.name || 'Mentor'}`,
            refundedCredits,
            partner?.name || 'Mentor',
            sessionId
          ]
        );
      } catch (e) {}
    }

    // Send notification to the other party
    try {
      const isStudentCancelling = cancellingUserId === session.student_id;
      const targetUserId = isStudentCancelling ? session.teacher_id : session.student_id;
      const canceller = await db.getAsync(`SELECT name FROM users WHERE id = ?`, [cancellingUserId]);
      const cancellerName = canceller?.name || (isStudentCancelling ? 'Student' : 'Mentor');
      const notifId = 'notif_can_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

      const notifTitle = currentStatus === 'PENDING'
        ? 'Session Request Cancelled'
        : 'Session Cancelled';
      const notifMsg = currentStatus === 'PENDING'
        ? `${cancellerName} cancelled the session request for ${session.skill}.`
        : `${cancellerName} cancelled the session for ${session.skill} scheduled on ${session.date}.`;

      await db.runAsync(
        `INSERT INTO notifications (id, user_id, title, message, time, is_unread, type)
         VALUES (?, ?, ?, ?, 'Just now', 1, 'session')`,
        [notifId, targetUserId, notifTitle, notifMsg]
      );
    } catch (e) {}

    return {
      success: true,
      sessionId,
      status: 'CANCELLED',
      cancelled_by: cancellingUserId,
      refundedCredits
    };
  },

  async cancelCohortEnrollment({ sessionId, studentId }) {
    const session = await db.getAsync(`SELECT * FROM sessions WHERE id = ?`, [sessionId]);
    if (!session) throw new Error('Session not found');

    const attendee = await db.getAsync(
      `SELECT * FROM session_attendees WHERE session_id = ? AND student_id = ?`,
      [sessionId, studentId]
    );
    if (!attendee) throw new Error('You are not registered for this session');

    const refundAmount = Number(attendee.credits_locked || 1.0);

    // Refund student escrow
    await db.runAsync(
      `UPDATE users SET credits = ROUND(credits + ?, 2), escrow_locked = ROUND(MAX(0, escrow_locked - ?), 2) WHERE id = ?`,
      [refundAmount, refundAmount, studentId]
    );

    // Delete attendee record
    await db.runAsync(
      `DELETE FROM session_attendees WHERE id = ?`,
      [attendee.id]
    );

    // Update session enrolled_count and credits
    const currentAttendees = await db.allAsync(`SELECT * FROM session_attendees WHERE session_id = ?`, [sessionId]);
    const newCount = currentAttendees.length;
    const newTotalCredits = Math.max(0, (session.credits || 0) - refundAmount);
    await db.runAsync(
      `UPDATE sessions SET enrolled_count = ?, credits = ? WHERE id = ?`,
      [newCount, newTotalCredits, sessionId]
    );

    // Record Refund Transaction
    const txId = 'tx_refund_' + Date.now();
    await db.runAsync(
      `INSERT INTO transactions (id, user_id, date, type, description, amount, status, student_name)
       VALUES (?, ?, ?, 'Refund', ?, ?, 'Completed', ?)`,
      [txId, studentId, new Date().toISOString().split('T')[0], `Refunded ${refundAmount} Cr for cancelled group class: ${session.skill}`, refundAmount, session.teacher_id]
    );

    return { success: true, sessionId, refundedCredits: refundAmount, enrolledCount: newCount };
  },

  async rescheduleSessionRecord({ sessionId, userId, newDate, newTime }) {
    const session = await db.getAsync(`SELECT * FROM sessions WHERE id = ?`, [sessionId]);
    if (!session) throw new Error('Session not found');

    const isTeacher = session.teacher_id === userId;
    const isStudent = session.student_id === userId;

    if (session.session_type === 'GROUP_COHORT') {
      if (!isTeacher) {
        throw new Error('Forbidden: Only the Masterclass host can reschedule this session');
      }
    } else {
      if (!isTeacher && !isStudent) {
        throw new Error('Forbidden: Only session host or assigned participant can reschedule this session');
      }
    }

    if (session.status === 'Completed' || session.status === 'Cancelled' || session.status === 'ATTENDANCE_FINALIZED') {
      throw new Error(`Cannot reschedule a session that is ${session.status.toLowerCase()}`);
    }

    const oldDate = session.date;
    const oldTime = session.time;

    await db.runAsync(
      `UPDATE sessions SET date = ?, time = ? WHERE id = ?`,
      [newDate, newTime, sessionId]
    );

    // Notify registered participants using the notification infrastructure
    try {
      const attendees = await db.allAsync(
        `SELECT DISTINCT student_id as user_id FROM session_attendees WHERE session_id = ? 
         UNION 
         SELECT DISTINCT user_id FROM masterclass_registrations WHERE masterclass_id = ?`,
        [sessionId, sessionId]
      );
      for (const att of attendees) {
        if (att.user_id && att.user_id !== userId) {
          const notifId = 'notif_resched_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
          await db.runAsync(
            `INSERT INTO notifications (id, user_id, title, message, time, is_unread, type)
             VALUES (?, ?, ?, ?, 'Just now', 1, 'session')`,
            [
              notifId,
              att.user_id,
              `Masterclass Rescheduled: ${session.topic || session.skill}`,
              `"${session.topic || session.skill}" has been rescheduled.\nOld: ${oldDate} • ${oldTime}\nNew: ${newDate} • ${newTime}`
            ]
          );
        }
      }
    } catch (notifErr) {
      console.warn('Failed to send reschedule notifications:', notifErr.message);
    }

    const updated = await db.getAsync(`SELECT * FROM sessions WHERE id = ?`, [sessionId]);
    return { success: true, sessionId, oldDate, oldTime, newDate, newTime, session: updated };
  },

  async updateSessionDetails({ sessionId, userId, updates = {} }) {
    const session = await db.getAsync(`SELECT * FROM sessions WHERE id = ?`, [sessionId]);
    if (!session) throw new Error('Session not found');

    const isTeacher = session.teacher_id === userId;
    const isStudent = session.student_id === userId;

    if (session.session_type === 'GROUP_COHORT') {
      if (!isTeacher) {
        throw new Error('Forbidden: Only the Masterclass host can edit this masterclass');
      }
    } else if (!isTeacher && !isStudent) {
      throw new Error('Forbidden: Only the session host or participant can update this session');
    }

    // Map common aliases
    if (updates.title && !updates.topic) updates.topic = updates.title;
    if (updates.subject && !updates.skill) updates.skill = updates.subject;
    if (updates.learningDetails && !updates.learning_details) updates.learning_details = updates.learningDetails;
    if (updates.maxParticipants !== undefined && updates.max_capacity === undefined) updates.max_capacity = updates.maxParticipants;
    if (updates.maxCapacity !== undefined && updates.max_capacity === undefined) updates.max_capacity = updates.maxCapacity;
    if (updates.thumbnail && !updates.thumbnail_url) updates.thumbnail_url = updates.thumbnail;
    if (updates.image_url && !updates.thumbnail_url) updates.thumbnail_url = updates.image_url;
    if (updates.thumbnail_url && !updates.image_url) updates.image_url = updates.thumbnail_url;
    if (updates.instructor && !updates.teacher_name) updates.teacher_name = updates.instructor;

    // Capacity validation: capacity cannot be lower than current registered students
    if (updates.max_capacity !== undefined) {
      const parsedCapacity = parseInt(updates.max_capacity, 10);
      const attCount = (await db.allAsync(`SELECT id FROM session_attendees WHERE session_id = ?`, [sessionId])).length;
      const regCount = (await db.allAsync(`SELECT id FROM masterclass_registrations WHERE masterclass_id = ?`, [sessionId])).length;
      const currentEnrolled = Math.max(attCount, regCount, session.enrolled_count || 0);

      if (parsedCapacity < currentEnrolled) {
        throw new Error(`Capacity cannot be lower than the current number of registered participants (${currentEnrolled}).`);
      }
    }

    const fields = [];
    const values = [];

    const allowedFields = [
      'skill', 'topic', 'category', 'description', 'learning_details',
      'date', 'time', 'hours', 'platform', 'meeting_platform', 'zoom_join_url',
      'max_capacity', 'credits', 'rate', 'rate_per_student',
      'minimum_academic_level', 'prerequisites', 'tags',
      'session_series_type', 'additional_notes', 'status',
      'image_url', 'thumbnail_url', 'teacher_name'
    ];

    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        let val = updates[key];
        if (key === 'tags' && Array.isArray(val)) {
          val = JSON.stringify(val);
        }
        fields.push(`${key} = ?`);
        values.push(val);
      }
    }

    if (updates.meet_link !== undefined && updates.zoom_join_url === undefined) {
      fields.push(`zoom_join_url = ?`);
      values.push(updates.meet_link);
    }
    if (updates.notes !== undefined && updates.additional_notes === undefined) {
      fields.push(`additional_notes = ?`);
      values.push(updates.notes);
    }

    if (fields.length > 0) {
      values.push(sessionId);
      await db.runAsync(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    if (updates.teacher_name && session.teacher_id) {
      try {
        await db.runAsync(`UPDATE users SET name = ? WHERE id = ?`, [updates.teacher_name, session.teacher_id]);
      } catch (e) {}
    }

    const updated = await db.getAsync(`SELECT * FROM sessions WHERE id = ?`, [sessionId]);
    return { success: true, session: updated };
  },

  async createMasterclassReport({ masterclassId, userId, issueType, description, priority = 'Medium' }) {
    const session = await db.getAsync(`SELECT * FROM sessions WHERE id = ?`, [masterclassId]);
    if (!session) throw new Error('Masterclass session not found');

    if (!issueType || !description) {
      throw new Error('Issue type and description are required');
    }

    const reportId = 'mc_rep_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    await db.runAsync(
      `INSERT INTO masterclass_reports (id, masterclass_id, reported_by_user_id, issue_type, description, priority, status)
       VALUES (?, ?, ?, ?, ?, ?, 'OPEN')`,
      [reportId, masterclassId, userId, issueType, description, priority]
    );

    return {
      success: true,
      reportId,
      message: 'Masterclass issue report recorded successfully'
    };
  },

  async getUserSessionsCategorized(userId) {
    const allSessions = await this.getSessions();
    const reviews = await db.allAsync(`SELECT * FROM reviews`);

    const reviewMap = {};
    reviews.forEach(r => {
      if (r.session_id) reviewMap[r.session_id] = r;
    });

    const enriched = allSessions.map(s => ({
      ...s,
      feedback: reviewMap[s.id] ? {
        rating: reviewMap[s.id].rating,
        comment: reviewMap[s.id].comment,
        tags: JSON.parse(reviewMap[s.id].tags_json || '[]'),
        reviewerName: reviewMap[s.id].reviewer_name
      } : null
    }));

    // Filter per category
    const userRelevant = enriched.filter(s =>
      s.teacher_id === userId ||
      s.student_id === userId ||
      (s.attendees || []).some(a => a.student_id === userId)
    );

    // Requests for mentor (status === 'PENDING' OR student-cancelled requests OR mentor-declined requests for status tracking)
    const requests = enriched.filter(s =>
      s.teacher_id === userId &&
      s.session_type !== 'GROUP_COHORT' &&
      (
        (s.status && s.status.toUpperCase() === 'PENDING') ||
        (s.status && s.status.toUpperCase() === 'CANCELLED' && s.cancelled_by === s.student_id) ||
        (s.status && s.status.toUpperCase() === 'DECLINED')
      )
    );
    
    // Pending or mentor-declined requests for student
    const studentPending = enriched.filter(s =>
      s.student_id === userId &&
      s.session_type !== 'GROUP_COHORT' &&
      (
        (s.status && s.status.toUpperCase() === 'PENDING') ||
        (s.status && s.status.toUpperCase() === 'DECLINED')
      )
    );

    const upcoming = userRelevant.filter(s => {
      if (!s.status) return false;
      const st = s.status.toUpperCase();
      if (st === 'PENDING' || st === 'CANCELLED' || st === 'DECLINED') return false;
      return (st === 'ACCEPTED' || st === 'CONFIRMED' || st === 'OPEN' || st === 'UPCOMING');
    });

    const past = userRelevant.filter(s => s.status && (s.status.toLowerCase() === 'completed' || s.status.toLowerCase() === 'attendance_finalized'));
    const masterclasses = enriched.filter(s => s.teacher_id === userId && s.session_type === 'GROUP_COHORT');
    const groups = enriched.filter(s => s.session_type === 'GROUP_COHORT' && s.status && s.status.toLowerCase() !== 'cancelled');
    const cancelled = userRelevant.filter(s => s.status && (s.status.toLowerCase() === 'cancelled' || s.status.toUpperCase() === 'CANCELLED' || s.status.toUpperCase() === 'DECLINED'));

    const pendingReqs = requests.filter(r => (r.status || '').toUpperCase() === 'PENDING').length;
    const pendingStudent = studentPending.filter(sp => (sp.status || '').toUpperCase() === 'PENDING').length;
    const upcomingCount = upcoming.length + pendingReqs + pendingStudent;

    return {
      all: userRelevant,
      upcoming,
      past,
      masterclasses,
      groups,
      cancelled,
      requests,
      studentPending,
      counts: {
        upcoming: upcomingCount,
        past: past.length,
        masterclasses: masterclasses.length,
        groups: groups.length,
        cancelled: cancelled.length,
        requests: requests.length,
        studentPending: studentPending.length
      }
    };
  },

  async getTransactions() {
    return await db.allAsync(`SELECT * FROM transactions ORDER BY created_at DESC`);
  },

  async getTransactionsByUser(userId) {
    return await db.allAsync(`SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC`, [userId]);
  },

  async getReviews() {
    const revs = await db.allAsync(`SELECT * FROM reviews ORDER BY created_at DESC`);
    return revs.map(r => ({
      ...r,
      tags: JSON.parse(r.tags_json || '[]')
    }));
  },

  async addReview({ sessionId, learnerId, tutorId, rating, comment, tags }) {
    const learner = await db.getAsync(`SELECT * FROM users WHERE id = ?`, [learnerId]);
    const revId = 'rev_' + Date.now();
    await db.runAsync(
      `INSERT INTO reviews (id, session_id, target_user_id, reviewer_name, reviewer_avatar, skill, rating, comment, tags_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [revId, sessionId || null, tutorId, learner ? learner.name : 'Student', learner ? learner.avatar : 'student', 'Skill Swap', Number(rating) || 5, comment || 'Great mentor!', JSON.stringify(tags || [])]
    );

    // Recalculate average rating & reviews count
    const stats = await db.getAsync(`SELECT AVG(rating) as avg_rating, COUNT(*) as rev_count FROM reviews WHERE target_user_id = ?`, [tutorId]);
    if (stats) {
      await db.runAsync(
        `UPDATE users SET rating = ?, reviews_count = ? WHERE id = ?`,
        [Number(Number(stats.avg_rating || 5.0).toFixed(2)), stats.rev_count || 0, tutorId]
      );
    }

    return { success: true, reviewId: revId };
  },

  async getAttemptsByUser(userId) {
    const attempts = await db.allAsync(`SELECT * FROM quiz_attempts WHERE user_id = ? ORDER BY attempted_at DESC, id DESC`, [userId]);
    return attempts.map(a => ({
      ...a,
      user_answers: JSON.parse(a.user_answers_json || '{}'),
      detailed_results: JSON.parse(a.detailed_results_json || '[]')
    }));
  },

  async getUserCertificateStatus(userId) {
    if (!userId) return null;
    const user = await db.getAsync(`SELECT id, name, email, is_verified FROM users WHERE id = ?`, [userId]);
    if (!user) return null;

    const latestCert = await db.getAsync(
      `SELECT * FROM certificates WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    if (!latestCert) {
      return {
        hasCertificate: false,
        status: 'PENDING_VERIFICATION',
        verificationStatus: 'NOT_SUBMITTED',
        tutor_eligible: 0,
        is_verified: user.is_verified || 0,
        certificate: null,
        evidence: null,
        reason: 'No certificate uploaded. Certificate verification is required to become an eligible tutor.'
      };
    }

    let evidence = null;
    if (latestCert.verification_evidence) {
      try {
        evidence = JSON.parse(latestCert.verification_evidence);
      } catch (e) {
        evidence = null;
      }
    }

    return {
      hasCertificate: true,
      certId: latestCert.id,
      status: latestCert.certificate_status || (latestCert.is_verified ? 'VERIFIED' : 'NOT_VERIFIED'),
      verificationStatus: latestCert.verification_status || (latestCert.is_verified ? 'VERIFIED' : 'PENDING_VERIFICATION'),
      tutor_eligible: latestCert.tutor_eligible != null ? latestCert.tutor_eligible : (latestCert.is_verified ? 1 : 0),
      is_verified: user.is_verified || 0,
      verification_method: latestCert.verification_method || 'AUTOMATED_VERIFICATION',
      verification_reason: latestCert.verification_reason || '',
      evidence,
      verified_at: latestCert.verified_at,
      certificate: latestCert
    };
  },

  async getCertificates(userId) {
    if (userId) {
      return await db.allAsync(`SELECT * FROM certificates WHERE user_id = ? ORDER BY created_at DESC`, [userId]);
    }
    return await db.allAsync(`SELECT * FROM certificates ORDER BY created_at DESC`);
  },

  async uploadCertificate(userId, data) {
    const crypto = require('crypto');
    const authority = data.authority || data.issuer || 'NPTEL';
    const credentialId = data.credentialId || data.certificateId;
    const skillName = data.skillName || 'General';
    const title = data.title || `${skillName} Certification`;
    const scoreOrGrade = data.scoreOrGrade || (data.verificationScore ? `Score: ${data.verificationScore}%` : '');
    const fileName = data.fileName || 'certificate.pdf';
    const fileData = data.fileData || '';
    const platform = data.platform || authority;

    const user = await db.getAsync(`SELECT * FROM users WHERE id = ?`, [userId]);

    // Calculate SHA-256 hash of file buffer
    let fileBuffer = null;
    let fileHash = null;
    if (fileData) {
      try {
        const base64Content = fileData.includes(',') ? fileData.split(',')[1] : fileData;
        fileBuffer = Buffer.from(base64Content, 'base64');
        fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      } catch (e) {
        fileHash = crypto.createHash('sha256').update(String(fileData)).digest('hex');
      }
    }

    // Check duplicate file hash across system
    if (fileHash) {
      const existingHashCert = await db.getAsync(
        `SELECT * FROM certificates WHERE certificate_file_hash = ? AND user_id != ?`,
        [fileHash, userId]
      );
      if (existingHashCert) {
        const aiReport = {
          result: 'FAKE',
          confidence: 99,
          status: 'NOT_VERIFIED',
          verification_status: 'FAIL_DUPLICATE_DOCUMENT',
          tutor_eligible: 0,
          reason: 'Verification Failed: Duplicate Document. This exact certificate file is already registered to another user account.',
          suspicious_elements: ['Duplicate SHA-256 document hash detected across platform accounts'],
          evidence: {
            step1_file: 'FAIL - Duplicate file hash detected',
            step2_ocr: 'ABORTED',
            step3_identity: 'FAIL - Belongs to another registered user',
            step4_issuer: 'FAIL - Fraudulent re-upload attempt',
            step5_security: 'FAIL - Re-uploaded document',
            step6_decision: 'NOT_VERIFIED - Tutor Access Denied'
          }
        };

        // Reset user verification to 0
        await db.runAsync(`UPDATE users SET is_verified = 0 WHERE id = ?`, [userId]);

        return {
          success: false,
          result: 'NOT_VERIFIED',
          status: 'NOT_VERIFIED',
          verification_status: 'FAIL_DUPLICATE_DOCUMENT',
          tutor_eligible: 0,
          aiReport,
          error: aiReport.reason
        };
      }
    }

    // Check credential ID duplicate across other users
    if (credentialId && credentialId !== 'N/A' && credentialId !== '') {
      const existingOtherUserCert = await db.getAsync(
        `SELECT * FROM certificates WHERE credential_id = ? AND user_id != ?`,
        [credentialId, userId]
      );
      if (existingOtherUserCert) {
        const aiReport = {
          result: 'FAKE',
          confidence: 99,
          status: 'NOT_VERIFIED',
          verification_status: 'FAIL_DUPLICATE_CREDENTIAL_ID',
          tutor_eligible: 0,
          reason: `Verification Failed: Duplicate Credential ID (${credentialId}). This certificate is already registered to another user account.`,
          suspicious_elements: [`Credential ID ${credentialId} belongs to another user`],
          evidence: {
            step1_file: 'PASS',
            step2_ocr: 'PASS',
            step3_identity: 'FAIL - Credential ID assigned to different user',
            step4_issuer: 'FAIL - Duplicate platform record',
            step5_security: 'FAIL - Fraud attempt',
            step6_decision: 'NOT_VERIFIED - Tutor Access Denied'
          }
        };

        await db.runAsync(`UPDATE users SET is_verified = 0 WHERE id = ?`, [userId]);

        return {
          success: false,
          result: 'NOT_VERIFIED',
          status: 'NOT_VERIFIED',
          verification_status: 'FAIL_DUPLICATE_CREDENTIAL_ID',
          tutor_eligible: 0,
          aiReport,
          error: aiReport.reason
        };
      }
    }

    // Check rejection history
    const previousRejection = await db.getAsync(
      `SELECT * FROM rejected_certificates WHERE (credential_id = ? AND credential_id != '' AND credential_id != 'N/A') OR (user_id = ? AND title = ? AND file_name = ?)`,
      [credentialId, userId, title, fileName]
    );

    // 1. Run 12-step Certificate Verification Engine
    const verifResult = await analyzeAndVerifyCertificate({
      fileBuffer,
      fileName,
      mimeType: data.mimeType || 'application/pdf',
      platform,
      userFullName: data.recipientName || user?.name || 'Student',
      userEmail: user?.email,
      credentialId,
      verificationUrl: data.verificationUrl || data.credentialUrl,
      title,
      skillName,
      authority,
      issuer: data.issuer || authority,
      scoreOrGrade,
      issueDate: data.issueDate,
      userContext: user || {},
      previousRejection,
      fileData
    });

    const certId = 'cert_' + Date.now();
    const finalAuthority = verifResult.issuer || authority;
    const finalCredentialId = verifResult.credential_id || credentialId || ('CERT-' + Date.now());
    const finalScoreOrGrade = verifResult.score_or_grade || scoreOrGrade || 'Grade Verified';
    const finalStatus = verifResult.certificate_status || verifResult.status || (verifResult.result === 'REAL' ? 'VERIFIED' : 'NOT_VERIFIED');
    const finalVerificationStatus = verifResult.verification_status || finalStatus;
    const finalTutorEligible = (finalStatus === 'VERIFIED' && (verifResult.tutor_eligible === true || verifResult.tutor_eligible === 1)) ? 1 : 0;
    const finalMethod = verifResult.verification_method || (verifResult.recognized ? 'OFFICIAL_ISSUER_API' : 'AUTOMATED_ANALYSIS');
    const finalReason = verifResult.verification_reason || verifResult.reason || '';
    const finalEvidenceJson = JSON.stringify(verifResult.evidence_json || verifResult.verification_evidence || verifResult.evidence || {});
    const verifiedAt = finalStatus === 'VERIFIED' ? new Date().toISOString() : null;

    // Insert Certificate record with complete verification metrics
    await db.runAsync(
      `INSERT INTO certificates (
        id, user_id, skill_name, authority, title, credential_id, credential_url, score_or_grade,
        is_verified, certificate_status, verification_status, tutor_eligible, verification_method,
        verification_reason, verification_evidence, certificate_file_hash, verified_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        certId,
        userId,
        skillName,
        finalAuthority,
        title,
        finalCredentialId,
        verifResult.verification_url || data.credentialUrl || 'https://nptel.ac.in',
        finalScoreOrGrade,
        finalTutorEligible, // is_verified aligns strictly with tutor_eligible
        finalStatus,
        finalVerificationStatus,
        finalTutorEligible,
        finalMethod,
        finalReason,
        finalEvidenceJson,
        fileHash,
        verifiedAt
      ]
    );

    // Update user's is_verified status based on tutor eligibility
    await db.runAsync(
      `UPDATE users SET is_verified = ? WHERE id = ?`,
      [finalTutorEligible, userId]
    );

    // Audit trail logging
    try {
      await db.runAsync(
        `INSERT INTO certificate_verifications (id, user_id, credential_id, skill_name, result, confidence, ai_report_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['verif_' + Date.now() + '_' + Math.floor(Math.random() * 1000), userId, finalCredentialId, skillName, finalStatus, verifResult.confidence || 90, JSON.stringify(verifResult)]
      );
    } catch (e) {}

    // Handle VERIFIED outcome vs NON-VERIFIED outcomes
    if (finalStatus === 'VERIFIED') {
      // Award course qualification bonus (+2.0 Cr)
      let qualResult = await this.checkAndAwardCourseQualificationBonus(userId, skillName);
      let bonusAwarded = qualResult?.bonusAwarded || false;
      let bonusAmount = qualResult?.bonusAmount || 0;

      if (!bonusAwarded) {
        const existingCertTx = await db.getAsync(
          `SELECT * FROM transactions WHERE user_id = ? AND description LIKE ?`,
          [userId, `%${finalCredentialId}%`]
        );

        if (!existingCertTx) {
          bonusAwarded = true;
          bonusAmount = 2.0;

          await db.runAsync(
            `UPDATE users SET credits = ROUND(credits + ?, 2), lifetime_earned = ROUND(lifetime_earned + ?, 2) WHERE id = ?`,
            [bonusAmount, bonusAmount, userId]
          );

          const txId = 'tx_cert_' + Date.now();
          await db.runAsync(
            `INSERT INTO transactions (id, user_id, date, type, description, amount, status, student_name)
             VALUES (?, ?, ?, 'Course Qualification Bonus', ?, ?, 'Completed', 'SkillSwap Hub')`,
            [
              txId,
              userId,
              new Date().toISOString().split('T')[0],
              `Earned +2.0 Credits for uploading verified authentic certificate: "${title}" (${finalAuthority}) [ID: ${finalCredentialId}]`,
              bonusAmount
            ]
          );

          await db.runAsync(
            `INSERT INTO notifications (id, user_id, title, message, time, is_unread, type)
             VALUES (?, ?, '🎉 Certificate Verified! You are now an Eligible Tutor', ?, 'Just now', 1, 'badge')`,
            [
              'notif_cert_' + Date.now(),
              userId,
              `Congratulations! Your certificate "${title}" (${finalAuthority}) has been VERIFIED. You are now authorized to teach and accept bookings! +2.0 Credits awarded!`
            ]
          );
        }
      }

      const updatedUser = await this.getUserById(userId);

      return {
        success: true,
        result: 'VERIFIED',
        status: 'VERIFIED',
        verification_status: finalVerificationStatus,
        tutor_eligible: 1,
        is_verified: 1,
        aiReport: verifResult,
        certId,
        certificate: {
          id: certId,
          user_id: userId,
          skill_name: skillName,
          authority: finalAuthority,
          title,
          credential_id: finalCredentialId,
          score_or_grade: finalScoreOrGrade,
          is_verified: 1,
          certificate_status: 'VERIFIED',
          tutor_eligible: 1
        },
        verificationProof: finalReason,
        verification_evidence: verifResult.verification_evidence || verifResult.evidence,
        verification_reason: finalReason,
        verification_method: finalMethod,
        authorizedBy: finalAuthority,
        tierInfo: qualResult?.tierInfo || { tier: 'Advanced', badge: '🎖️ Advanced Tutor', rate: 2.0 },
        qualificationBonusAwarded: bonusAwarded,
        bonusCredits: bonusAmount,
        user: updatedUser,
        message: `✓ Certificate Verified (${finalAuthority})! Official issuer check passed. You are now an Eligible Tutor.`
      };
    } else if (finalStatus === 'NEEDS_MANUAL_REVIEW') {
      await db.runAsync(
        `INSERT INTO notifications (id, user_id, title, message, time, is_unread, type)
         VALUES (?, 'faculty_admin', '📋 Certificate Queued for Faculty Review', ?, 'Just now', 1, 'admin')`,
        [
          'notif_admin_cert_' + Date.now(),
          `Student ${user ? user.name : userId} uploaded "${title}" (${finalAuthority}). Issuer API unconfigured/inconclusive; queued for manual faculty audit.`
        ]
      );

      const updatedUser = await this.getUserById(userId);
      return {
        success: true,
        result: 'NEEDS_MANUAL_REVIEW',
        status: 'NEEDS_MANUAL_REVIEW',
        verification_status: finalVerificationStatus,
        tutor_eligible: 0,
        is_verified: 0,
        isPendingManualReview: true,
        aiReport: verifResult,
        certId,
        certificate: {
          id: certId,
          user_id: userId,
          skill_name: skillName,
          authority: finalAuthority,
          title,
          credential_id: finalCredentialId,
          score_or_grade: finalScoreOrGrade,
          is_verified: 0,
          certificate_status: 'NEEDS_MANUAL_REVIEW',
          tutor_eligible: 0
        },
        verification_evidence: verifResult.verification_evidence || verifResult.evidence,
        verification_reason: finalReason,
        verification_method: finalMethod,
        user: updatedUser,
        message: 'Certificate uploaded and queued for Faculty Administrator manual audit. Tutor eligibility pending review.'
      };
    } else {
      // NOT_VERIFIED
      try {
        await db.runAsync(
          `INSERT INTO rejected_certificates (id, user_id, credential_id, skill_name, authority, title, score_or_grade, file_name, rejection_reason, ai_report_json, attempt_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          ['rej_' + Date.now() + '_' + Math.floor(Math.random() * 1000), userId, finalCredentialId, skillName, finalAuthority, title, finalScoreOrGrade, fileName, finalReason, JSON.stringify(verifResult)]
        );
      } catch (e) {}

      const updatedUser = await this.getUserById(userId);
      return {
        success: false,
        result: 'NOT_VERIFIED',
        status: 'NOT_VERIFIED',
        verification_status: finalVerificationStatus,
        tutor_eligible: 0,
        is_verified: 0,
        aiReport: verifResult,
        certId,
        error: finalReason || 'Verification Failed: Certificate could not be verified by issuer or contained security anomalies.',
        verification_evidence: verifResult.verification_evidence || verifResult.evidence,
        verification_reason: finalReason,
        verification_method: finalMethod,
        user: updatedUser
      };
    }
  },

  async addCertificate(data) {
    return await this.uploadCertificate(data.userId, data);
  },

  /**
   * Course Qualification & Listing Bonus:
   * When a mentor lists a course to tutor with verified Quiz (>= 70%) AND Certificate,
   * they earn +2.0 Skill Credits into their wallet.
   */
  async checkAndAwardCourseQualificationBonus(userId, skillName) {
    if (!userId || !skillName) return null;

    const normalizedSkill = skillName.trim();
    const rootWord = normalizedSkill.toLowerCase().split(' ')[0];

    // Find course listing
    const skill = await db.getAsync(
      `SELECT * FROM skills_offered WHERE user_id = ? AND (LOWER(name) = ? OR LOWER(name) LIKE ? OR LOWER(?) LIKE '%' || LOWER(name) || '%')`,
      [userId, normalizedSkill.toLowerCase(), `%${rootWord}%`, normalizedSkill.toLowerCase()]
    );

    // Check quiz attempts
    const bestAttempt = await db.getAsync(
      `SELECT MAX(score_percent) as max_score FROM quiz_attempts WHERE user_id = ? AND (LOWER(skill_name) = ? OR LOWER(skill_name) LIKE ? OR LOWER(?) LIKE '%' || LOWER(skill_name) || '%') AND passed = 1`,
      [userId, normalizedSkill.toLowerCase(), `%${rootWord}%`, normalizedSkill.toLowerCase()]
    );
    const quizScore = Math.max(skill?.quiz_score || 0, bestAttempt?.max_score || 0);
    const isQuizPassed = quizScore >= 70;

    // Check verified certificates
    const cert = await db.getAsync(
      `SELECT * FROM certificates WHERE user_id = ? AND is_verified = 1 AND (LOWER(skill_name) = ? OR LOWER(skill_name) LIKE ? OR LOWER(?) LIKE '%' || LOWER(skill_name) || '%')`,
      [userId, normalizedSkill.toLowerCase(), `%${rootWord}%`, normalizedSkill.toLowerCase()]
    );
    const hasCert = !!cert;

    const tierInfo = determineTutorTier(quizScore, hasCert);
    const isQualified = isQuizPassed && hasCert;

    let bonusAwarded = false;
    const bonusAmount = 2.0;

    if (isQualified && skill && (!skill.qualification_bonus_awarded || skill.qualification_bonus_awarded === 0)) {
      // Check if bonus transaction already exists
      const existingTx = await db.getAsync(
        `SELECT * FROM transactions WHERE user_id = ? AND type = 'Course Qualification Bonus' AND description LIKE ?`,
        [userId, `%${skill.name}%`]
      );

      if (!existingTx) {
        bonusAwarded = true;

        // 1. Mark qualification bonus awarded in skills_offered
        await db.runAsync(
          `UPDATE skills_offered 
           SET qualification_bonus_awarded = 1, is_verified = 1, quiz_score = ?, tier = ?, rate = ?, cert_count = cert_count + 1
           WHERE id = ?`,
          [quizScore, tierInfo.tier, tierInfo.rate, skill.id]
        );

        // 2. Deposit +2.0 Credits into Mentor's Wallet
        await db.runAsync(
          `UPDATE users 
           SET credits = ROUND(credits + ?, 2), lifetime_earned = ROUND(lifetime_earned + ?, 2)
           WHERE id = ?`,
          [bonusAmount, bonusAmount, userId]
        );

        // 3. Insert transaction record
        const txId = 'tx_qual_' + Date.now();
        await db.runAsync(
          `INSERT INTO transactions (id, user_id, date, type, description, amount, status, student_name)
           VALUES (?, ?, ?, 'Course Qualification Bonus', ?, ?, 'Completed', 'SkillSwap Hub')`,
          [
            txId,
            userId,
            new Date().toISOString().split('T')[0],
            `Earned +2.0 Credits for listing and qualifying to tutor "${skill.name}" with verified Certificate (${cert.authority}) + Quiz Distinction (${quizScore}%)`,
            bonusAmount
          ]
        );

        // 4. Send notification
        await db.runAsync(
          `INSERT INTO notifications (id, user_id, title, message, time, is_unread, type)
           VALUES (?, ?, '🎉 +2.0 Credits Earned: Course Listing Qualified!', ?, 'Just now', 1, 'badge')`,
          [
            'notif_bonus_' + Date.now(),
            userId,
            `Congratulations! Your course listing "${skill.name}" is qualified with Quiz (${quizScore}%) + Certificate (${cert.authority}). +2.0 Skill Credits deposited into your wallet! Tutor Tier: ${tierInfo.tier} (${tierInfo.rate} Cr/hr).`
          ]
        );

        // 5. Upgrade user badges
        const user = await db.getAsync(`SELECT * FROM users WHERE id = ?`, [userId]);
        if (user) {
          let badges = JSON.parse(user.badges_json || '[]');
          badges = badges.filter(b => !b.includes('Tutor') && !b.includes('Bronze') && !b.includes('Silver') && !b.includes('Advanced') && !b.includes('Elite'));
          badges.push(tierInfo.badge);
          await db.runAsync(`UPDATE users SET badges_json = ? WHERE id = ?`, [JSON.stringify(badges), userId]);
        }
      }
    } else if (skill) {
      await db.runAsync(
        `UPDATE skills_offered 
         SET quiz_score = ?, tier = ?, rate = ?, is_verified = ?
         WHERE id = ?`,
        [quizScore, tierInfo.tier, tierInfo.rate, isQuizPassed ? 1 : 0, skill.id]
      );
    }

    return {
      isQualified,
      isQuizPassed,
      hasCert,
      quizScore,
      certificate: cert,
      tierInfo,
      bonusAwarded,
      bonusAmount: bonusAwarded ? bonusAmount : 0
    };
  },

  /**
   * Determine whether a session has passed its scheduled end time
   * Server Source of Truth logic
   */
  isSessionExpired(session) {
    if (!session) return false;
    const st = (session.status || '').toUpperCase();
    if (st === 'ENDED' || st === 'COMPLETED' || st === 'CANCELLED' || st === 'DECLINED') {
      return true;
    }

    const durationHours = Number(session.hours || session.durationHours || session.duration || 1.0);
    const durationMs = durationHours * 60 * 60 * 1000;
    const now = Date.now();

    // 1. If meeting_started_at exists, calculate end time from actual start
    if (session.meeting_started_at) {
      const startStr = String(session.meeting_started_at);
      const normalizedStart = (startStr.endsWith('Z') || startStr.includes('+'))
        ? startStr
        : startStr.replace(' ', 'T') + (startStr.includes('T') ? 'Z' : 'Z');
      const startTime = new Date(normalizedStart).getTime();
      if (!isNaN(startTime)) {
        const scheduledEnd = startTime + durationMs;
        if (now >= scheduledEnd) {
          return true;
        }
      }
    }

    // 2. Calculate scheduled end time from session.date and session.time
    if (session.date && session.time) {
      try {
        let dateStr = String(session.date).trim();
        const nowObj = new Date();
        const todayIso = nowObj.toISOString().split('T')[0];
        if (dateStr.toLowerCase() === 'today') {
          dateStr = todayIso;
        } else if (dateStr.toLowerCase() === 'tomorrow') {
          const d = new Date();
          d.setDate(d.getDate() + 1);
          dateStr = d.toISOString().split('T')[0];
        }

        let timeStr = String(session.time).trim();
        let h = 0;
        let m = 0;

        const isPm = /pm/i.test(timeStr);
        const isAm = /am/i.test(timeStr);
        const cleanedTime = timeStr.replace(/(am|pm)/i, '').trim();
        const parts = cleanedTime.split(':');
        if (parts.length >= 2) {
          h = parseInt(parts[0], 10) || 0;
          m = parseInt(parts[1], 10) || 0;
          if (isPm && h < 12) h += 12;
          if (isAm && h === 12) h = 0;
        } else if (parts.length === 1) {
          h = parseInt(parts[0], 10) || 0;
          if (isPm && h < 12) h += 12;
          if (isAm && h === 12) h = 0;
        }

        let scheduledStart;
        if (dateStr.includes('-')) {
          const dParts = dateStr.split('-');
          if (dParts.length === 3) {
            scheduledStart = new Date(parseInt(dParts[0], 10), parseInt(dParts[1], 10) - 1, parseInt(dParts[2], 10), h, m, 0);
          }
        }
        if (!scheduledStart || isNaN(scheduledStart.getTime())) {
          scheduledStart = new Date(`${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
        }

        if (scheduledStart && !isNaN(scheduledStart.getTime())) {
          const scheduledEnd = scheduledStart.getTime() + durationMs;
          if (now >= scheduledEnd) {
            return true;
          }
        }
      } catch (e) {
        console.warn('isSessionExpired calculation notice:', e.message);
      }
    }

    return false;
  },

  /**
   * Scan active sessions and atomically update expired sessions to ENDED status
   */
  async checkAndUpdateExpiredSessions() {
    try {
      const candidateSessions = await db.allAsync(
        `SELECT * FROM sessions WHERE status NOT IN ('ENDED', 'Completed', 'CANCELLED', 'DECLINED')`
      );
      const expiredSessionIds = [];
      for (const s of candidateSessions) {
        if (this.isSessionExpired(s)) {
          await db.runAsync(
            `UPDATE sessions SET status = 'ENDED', meeting_ended_at = COALESCE(meeting_ended_at, CURRENT_TIMESTAMP) WHERE id = ?`,
            [s.id]
          );
          expiredSessionIds.push(s.id);
        }
      }
      return expiredSessionIds;
    } catch (err) {
      console.warn('checkAndUpdateExpiredSessions error:', err.message);
      return [];
    }
  }
};

module.exports = {
  supabaseClient,
  dbProvider,
  trusodbService: dbProvider,
  supabaseService: dbProvider,
  determineTutorTier,
  initSupabase
};
