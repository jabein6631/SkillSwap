/**
 * SkillSwap Platform - Shared Doubt & Support System Controller
 * 
 * Core Architectural Rules:
 * 1. ONE COMMON SUPPORT HUB: All registered users share the same doubt database.
 * 2. FIRST-COME-FIRST-SERVED ACCEPTANCE: Atomic database update ensures exactly 
 *    ONE user can accept an open doubt. All other race contenders receive 409 Conflict.
 * 3. AUTHOR PROTECTION: The student who raised the doubt cannot accept their own doubt.
 * 4. PERMISSION ENFORCEMENT: Only the accepted user can submit an answer (403 Forbidden otherwise).
 * 5. PERSISTENT REWARDS: Solving doubts deposits platform bounty credits into the solver's wallet.
 */

const { db } = require('../database/db');

function safeBroadcast(event, data) {
  try {
    const serverModule = require('../server');
    if (serverModule && typeof serverModule.broadcastSupportEvent === 'function') {
      serverModule.broadcastSupportEvent({ event, ...data });
    }
  } catch (e) {
    // Silently ignore if server module is still initializing
  }
}

const ALLOWED_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'svg',
  'pdf', 'txt', 'log', 'md', 'json', 'sql', 'csv',
  'py', 'js', 'jsx', 'ts', 'tsx', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rs', 'php', 'rb', 'swift', 'kt',
  'html', 'css', 'scss', 'xml', 'yaml', 'yml'
]);

function sanitizeFileName(name) {
  if (!name) return 'attachment';
  // Remove directory traversals and dangerous chars
  const base = name.replace(/^.*[\\\/]/, '').replace(/[^a-zA-Z0-9._-]/g, '_');
  return base || 'attachment';
}

function validateAndProcessAttachment(att) {
  if (!att || !att.data) return null;
  const fileName = sanitizeFileName(att.name || 'file');
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  
  // Calculate approximate size if not provided
  let size = att.size;
  if (!size && typeof att.data === 'string') {
    const base64Str = att.data.includes(',') ? att.data.split(',')[1] : att.data;
    size = Math.round((base64Str.length * 3) / 4);
  }

  // 5MB Limit
  if (size > 5 * 1024 * 1024) {
    throw new Error(`File "${fileName}" exceeds the 5MB maximum limit.`);
  }

  // Detect MIME type
  let mimeType = att.type || 'application/octet-stream';
  if (att.data.startsWith('data:')) {
    const match = att.data.match(/^data:([^;]+);/);
    if (match) mimeType = match[1];
  }

  return {
    name: fileName,
    type: mimeType,
    size: Number(size) || 0,
    data: att.data
  };
}

/**
 * Helper to check prior session/quiz/certificate course attendance
 */
async function checkEligibility(userId, skillName) {
  if (!skillName) return { eligible: true, proof: 'Verified Peer Member', type: 'GENERAL' };

  const skillLower = `%${skillName.trim().toLowerCase()}%`;

  // 1. Check peer sessions
  const session = await db.getAsync(
    `SELECT s.* FROM sessions s 
     LEFT JOIN session_attendees sa ON sa.session_id = s.id
     WHERE (s.student_id = ? OR sa.student_id = ?) AND LOWER(s.skill) LIKE ? 
     ORDER BY s.created_at DESC LIMIT 1`,
    [userId, userId, skillLower]
  );
  if (session) {
    return {
      eligible: true,
      proof: `✓ Attended Course Session on "${session.skill}"`,
      type: 'SESSION_ATTENDED'
    };
  }

  // 2. Check certificates
  const cert = await db.getAsync(
    `SELECT * FROM certificates WHERE user_id = ? AND LOWER(skill_name) LIKE ? LIMIT 1`,
    [userId, skillLower]
  );
  if (cert) {
    return {
      eligible: true,
      proof: `✓ Verified Academic Certificate (${cert.authority})`,
      type: 'CERTIFIED'
    };
  }

  // 3. Check portfolio skills
  const portfolio = await db.getAsync(
    `SELECT * FROM skills_offered WHERE user_id = ? AND LOWER(name) LIKE ? LIMIT 1`,
    [userId, skillLower]
  );
  if (portfolio) {
    return {
      eligible: true,
      proof: `✓ Prior Knowledge in Portfolio (${portfolio.level || 'Intermediate'})`,
      type: 'PORTFOLIO_KNOWLEDGE'
    };
  }

  // 4. Check quiz attempts
  const quiz = await db.getAsync(
    `SELECT * FROM quiz_attempts WHERE user_id = ? AND LOWER(skill_name) LIKE ? LIMIT 1`,
    [userId, skillLower]
  );
  if (quiz) {
    return {
      eligible: true,
      proof: `✓ Completed Course Assessment (${quiz.score_percent}%)`,
      type: 'QUIZ_ATTEMPT'
    };
  }

  // Default: All registered users have basic learner eligibility
  return {
    eligible: true,
    proof: '✓ Registered Vignan Student Learner',
    type: 'GENERAL_MEMBER'
  };
}

const supportController = {
  /**
   * Check Student Eligibility
   * GET /api/support/eligibility
   */
  async getEligibilityStatus(req, res, next) {
    try {
      const { skillName } = req.query;
      const user = req.user;
      const result = await checkEligibility(user.id, skillName);
      res.json({
        success: true,
        user: { id: user.id, name: user.name },
        skillName,
        ...result
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Get Support Dynamic Statistics
   * GET /api/support/stats
   */
  async getSupportStats(req, res, next) {
    try {
      const stats = await db.getAsync(`
        SELECT 
          COUNT(CASE WHEN status = 'OPEN' THEN 1 END) AS openCount,
          COUNT(CASE WHEN status = 'ACCEPTED' THEN 1 END) AS acceptedCount,
          COUNT(CASE WHEN status = 'RESOLVED' THEN 1 END) AS resolvedCount,
          COALESCE(SUM(CASE WHEN status = 'RESOLVED' THEN reward_credits ELSE 0 END), 0) AS totalRewardsDistributed
        FROM support_doubts
      `);

      res.json({
        success: true,
        stats: {
          openDoubts: stats?.openCount || 0,
          inProgressDoubts: stats?.acceptedCount || 0,
          resolvedDoubts: stats?.resolvedCount || 0,
          totalRewardsCredits: Number((stats?.totalRewardsDistributed || 0).toFixed(1)),
          studentCost: '0.0 Cr (Free)'
        }
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Get All Known Platform Subjects / Courses (Dynamically aggregated from doubts, skills, quizzes)
   * GET /api/support/subjects
   */
  async getSupportSubjects(req, res, next) {
    try {
      const defaultSubjects = [
        'Python Programming & DSA',
        'UI/UX Design & Figma',
        'React.js Frontend & State Architecture',
        'Database Systems & Composite Indexing',
        'Machine Learning & Deep Learning',
        'Cyber Security & Ethical Hacking'
      ];

      const [offeredRows, wantedRows, quizRows, doubtRows] = await Promise.all([
        db.allAsync(`SELECT DISTINCT name FROM skills_offered WHERE name IS NOT NULL`).catch(() => []),
        db.allAsync(`SELECT DISTINCT name FROM skills_wanted WHERE name IS NOT NULL`).catch(() => []),
        db.allAsync(`SELECT DISTINCT skill_name AS name FROM quizzes WHERE skill_name IS NOT NULL`).catch(() => []),
        db.allAsync(`SELECT DISTINCT course AS name FROM support_doubts WHERE course IS NOT NULL`).catch(() => [])
      ]);

      const subjectSet = new Set(defaultSubjects);
      [...offeredRows, ...wantedRows, ...quizRows, ...doubtRows].forEach(r => {
        if (r?.name && typeof r.name === 'string' && r.name.trim()) {
          subjectSet.add(r.name.trim());
        }
      });

      const subjects = Array.from(subjectSet);

      res.json({
        success: true,
        subjects
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Get All Shared Support Doubts
   * GET /api/support/doubts
   */
  async getAllDoubts(req, res, next) {
    try {
      const { status, filter, category, course, search, mine, limit } = req.query;
      const currentUser = req.user;

      let sql = `
        SELECT 
          d.*,
          ru.name AS raised_by_name,
          ru.email AS raised_by_email,
          ru.avatar AS raised_by_avatar,
          au.name AS accepted_by_name,
          au.email AS accepted_by_email,
          au.avatar AS accepted_by_avatar
        FROM support_doubts d
        LEFT JOIN users ru ON ru.id = d.raised_by_user_id
        LEFT JOIN users au ON au.id = d.accepted_by_user_id
        WHERE 1=1
      `;
      const params = [];

      // User-specific filtering (My Doubts / Tasks)
      const isMine = (mine === 'my_doubts' || mine === 'true' || mine === 'MINE' || mine === 'my' || filter === 'my' || filter === 'MINE' || filter === 'my_doubts');
      if (isMine && currentUser?.id) {
        sql += ` AND (
          d.raised_by_user_id = ? 
          OR d.accepted_by_user_id = ? 
          OR EXISTS (SELECT 1 FROM support_answers sa WHERE sa.doubt_id = d.id AND sa.answered_by_user_id = ?)
        )`;
        params.push(currentUser.id, currentUser.id, currentUser.id);
      }

      if (status && status !== 'ALL') {
        const s = status.toUpperCase();
        if (s === 'OPEN') {
          sql += ` AND d.status = 'OPEN' AND (d.accepted_by_user_id IS NULL OR d.accepted_by_user_id = '')`;
        } else if (s === 'ACCEPTED' || s === 'IN_PROGRESS' || s === 'CLAIMED') {
          sql += ` AND (d.status = 'ACCEPTED' OR d.status = 'CLAIMED')`;
        } else if (s === 'RESOLVED' || s === 'CLOSED') {
          sql += ` AND (d.status = 'RESOLVED' OR d.status = 'CLOSED')`;
        } else {
          sql += ` AND d.status = ?`;
          params.push(s);
        }
      }

      if (category && category !== 'ALL') {
        sql += ` AND (LOWER(d.category) LIKE ? OR LOWER(d.course) LIKE ?)`;
        params.push(`%${category.toLowerCase()}%`, `%${category.toLowerCase()}%`);
      }

      if (course && course !== 'ALL') {
        sql += ` AND LOWER(d.course) LIKE ?`;
        params.push(`%${course.toLowerCase()}%`);
      }

      if (search && search.trim()) {
        const q = `%${search.trim().toLowerCase()}%`;
        sql += ` AND (LOWER(d.title) LIKE ? OR LOWER(d.description) LIKE ? OR LOWER(d.category) LIKE ? OR LOWER(ru.name) LIKE ?)`;
        params.push(q, q, q, q);
      }

      sql += ` ORDER BY CASE d.status WHEN 'OPEN' THEN 1 WHEN 'ACCEPTED' THEN 2 WHEN 'RESOLVED' THEN 3 ELSE 4 END, d.created_at DESC`;

      if (limit) {
        sql += ` LIMIT ?`;
        params.push(Number(limit));
      }

      const doubts = await db.allAsync(sql, params);

      // Fetch doubt attachments and answers for doubts
      const doubtIds = doubts.map(d => d.id);
      let doubtAttachmentsMap = {};
      let answersMap = {};
      let answerAttachmentsMap = {};

      if (doubtIds.length > 0) {
        const placeholders = doubtIds.map(() => '?').join(',');

        // 1. Fetch all doubt attachments
        const doubtAtts = await db.allAsync(`
          SELECT * FROM support_doubt_attachments
          WHERE doubt_id IN (${placeholders})
          ORDER BY created_at ASC
        `, doubtIds);
        doubtAtts.forEach(att => {
          if (!doubtAttachmentsMap[att.doubt_id]) doubtAttachmentsMap[att.doubt_id] = [];
          doubtAttachmentsMap[att.doubt_id].push(att);
        });

        // 2. Fetch all answers
        const answers = await db.allAsync(`
          SELECT a.*, u.name AS answered_by_name, u.avatar AS answered_by_avatar
          FROM support_answers a
          LEFT JOIN users u ON u.id = a.answered_by_user_id
          WHERE a.doubt_id IN (${placeholders})
          ORDER BY a.created_at ASC
        `, doubtIds);

        const answerIds = answers.map(a => a.id);
        if (answerIds.length > 0) {
          const ansPlaceholders = answerIds.map(() => '?').join(',');
          const ansAtts = await db.allAsync(`
            SELECT * FROM support_answer_attachments
            WHERE answer_id IN (${ansPlaceholders})
            ORDER BY created_at ASC
          `, answerIds);
          ansAtts.forEach(att => {
            if (!answerAttachmentsMap[att.answer_id]) answerAttachmentsMap[att.answer_id] = [];
            answerAttachmentsMap[att.answer_id].push(att);
          });
        }

        answers.forEach(ans => {
          ans.attachments = answerAttachmentsMap[ans.id] || [];
          // Backward compatibility fallback for single attachment in answer
          if (ans.attachments.length === 0 && ans.attachment_data) {
            ans.attachments.push({
              id: 'ans_att_' + ans.id,
              answer_id: ans.id,
              doubt_id: ans.doubt_id,
              file_name: ans.attachment_name || 'solution_attachment',
              file_type: ans.attachment_data.startsWith('data:image/') ? 'image/png' : 'text/plain',
              file_size: ans.attachment_data.length,
              file_data: ans.attachment_data
            });
          }
          if (!answersMap[ans.doubt_id]) answersMap[ans.doubt_id] = [];
          answersMap[ans.doubt_id].push(ans);
        });
      }

      const enrichedDoubts = doubts.map(d => {
        let attachments = doubtAttachmentsMap[d.id] || [];
        // Backward compatibility fallback if legacy single attachment exists
        if (attachments.length === 0 && d.attachment_data) {
          attachments.push({
            id: 'dbt_att_' + d.id,
            doubt_id: d.id,
            file_name: d.attachment_name || 'attachment',
            file_type: d.attachment_data.startsWith('data:image/') ? 'image/png' : 'text/plain',
            file_size: d.attachment_data.length,
            file_data: d.attachment_data
          });
        }

        const answers = answersMap[d.id] || [];
        const primaryAnswer = answers[0] || null;
        const answerAttachments = primaryAnswer?.attachments || [];

        return {
          ...d,
          attachments,
          answers,
          answer_attachments: answerAttachments,
          // Compatibility fields with existing UI
          student_id: d.raised_by_user_id,
          student_name: d.raised_by_name || d.raised_by_user_id,
          skill_name: d.category || d.course || 'Technical Doubt',
          issue_type: d.category || 'CODE_BUG',
          support_mentor_id: d.accepted_by_user_id,
          support_mentor_name: d.accepted_by_name,
          mentor_solution: primaryAnswer?.answer_text || null,
          mentor_classification: primaryAnswer?.classification || null,
          recommended_assessment_skill: primaryAnswer?.recommended_assessment_skill || null
        };
      });

      res.json({
        success: true,
        count: enrichedDoubts.length,
        doubts: enrichedDoubts,
        tickets: enrichedDoubts // Backward compatibility alias
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Get Single Doubt By ID
   * GET /api/support/doubts/:id
   */
  async getDoubtById(req, res, next) {
    try {
      const doubt = await db.getAsync(`
        SELECT 
          d.*,
          ru.name AS raised_by_name,
          ru.email AS raised_by_email,
          ru.avatar AS raised_by_avatar,
          au.name AS accepted_by_name,
          au.email AS accepted_by_email,
          au.avatar AS accepted_by_avatar
        FROM support_doubts d
        LEFT JOIN users ru ON ru.id = d.raised_by_user_id
        LEFT JOIN users au ON au.id = d.accepted_by_user_id
        WHERE d.id = ?
      `, [req.params.id]);

      if (!doubt) {
        return res.status(404).json({ success: false, error: 'Support doubt not found' });
      }

      // Fetch doubt attachments
      const doubtAttachments = await db.allAsync(`
        SELECT * FROM support_doubt_attachments WHERE doubt_id = ? ORDER BY created_at ASC
      `, [doubt.id]);

      // Fallback for legacy single attachment
      if (doubtAttachments.length === 0 && doubt.attachment_data) {
        doubtAttachments.push({
          id: 'dbt_att_' + doubt.id,
          doubt_id: doubt.id,
          file_name: doubt.attachment_name || 'attachment',
          file_type: doubt.attachment_data.startsWith('data:image/') ? 'image/png' : 'text/plain',
          file_size: doubt.attachment_data.length,
          file_data: doubt.attachment_data
        });
      }

      // Fetch answers
      const answers = await db.allAsync(`
        SELECT a.*, u.name AS answered_by_name, u.avatar AS answered_by_avatar
        FROM support_answers a
        LEFT JOIN users u ON u.id = a.answered_by_user_id
        WHERE a.doubt_id = ?
        ORDER BY a.created_at ASC
      `, [doubt.id]);

      for (let ans of answers) {
        ans.attachments = await db.allAsync(`
          SELECT * FROM support_answer_attachments WHERE answer_id = ? ORDER BY created_at ASC
        `, [ans.id]);
        if (ans.attachments.length === 0 && ans.attachment_data) {
          ans.attachments.push({
            id: 'ans_att_' + ans.id,
            answer_id: ans.id,
            doubt_id: ans.doubt_id,
            file_name: ans.attachment_name || 'solution_attachment',
            file_type: ans.attachment_data.startsWith('data:image/') ? 'image/png' : 'text/plain',
            file_size: ans.attachment_data.length,
            file_data: ans.attachment_data
          });
        }
      }

      const primaryAnswer = answers[0] || null;

      const enriched = {
        ...doubt,
        attachments: doubtAttachments,
        answers,
        answer_attachments: primaryAnswer?.attachments || [],
        student_id: doubt.raised_by_user_id,
        student_name: doubt.raised_by_name || doubt.raised_by_user_id,
        skill_name: doubt.category || doubt.course || 'Technical Doubt',
        support_mentor_id: doubt.accepted_by_user_id,
        support_mentor_name: doubt.accepted_by_name,
        mentor_solution: primaryAnswer?.answer_text || null,
        mentor_classification: primaryAnswer?.classification || null,
        recommended_assessment_skill: primaryAnswer?.recommended_assessment_skill || null
      };

      res.json({
        success: true,
        doubt: enriched,
        ticket: enriched
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Raise / Create a New Doubt
   * POST /api/support/doubts
   */
  async createDoubt(req, res, next) {
    try {
      const { category, course, skillName, title, description, codeSnippet, attachments, attachmentName, attachmentData, issueType } = req.body;
      const user = req.user;

      if (!title || !description) {
        return res.status(400).json({
          success: false,
          error: 'Please provide a title and detailed description for your doubt.'
        });
      }

      const doubtCategory = category || skillName || issueType || 'Code Bug';
      const doubtCourse = course || skillName || 'General Engineering';

      const eligibility = await checkEligibility(user.id, doubtCategory);

      const doubtId = 'dbt_' + Date.now();
      let rewardCredits = 1.5;
      if (doubtCategory.includes('Architecture') || doubtCategory.includes('Level 3')) rewardCredits = 2.0;
      else if (doubtCategory.includes('Syntax') || doubtCategory.includes('Level 1')) rewardCredits = 1.0;

      // Process and validate attachments
      const rawAttachments = Array.isArray(attachments) ? attachments : [];
      if (rawAttachments.length === 0 && attachmentData) {
        rawAttachments.push({
          name: attachmentName || 'attachment',
          data: attachmentData,
          type: attachmentData.startsWith('data:image/') ? 'image/png' : 'text/plain'
        });
      }

      const processedAttachments = [];
      for (const att of rawAttachments) {
        const processed = validateAndProcessAttachment(att);
        if (processed) processedAttachments.push(processed);
      }

      const firstAtt = processedAttachments[0] || null;

      await db.runAsync(`
        INSERT INTO support_doubts (
          id, raised_by_user_id, category, course, title, description, 
          code_snippet, attachment_name, attachment_data, status, 
          reward_credits, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [
        doubtId,
        user.id,
        doubtCategory,
        doubtCourse,
        title.trim(),
        description.trim(),
        codeSnippet || null,
        firstAtt?.name || null,
        firstAtt?.data || null,
        rewardCredits
      ]);

      // Insert all attachments into support_doubt_attachments
      for (let i = 0; i < processedAttachments.length; i++) {
        const att = processedAttachments[i];
        const attId = `att_dbt_${Date.now()}_${i}`;
        await db.runAsync(`
          INSERT INTO support_doubt_attachments (id, doubt_id, file_name, file_type, file_size, file_data)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [
          attId,
          doubtId,
          att.name,
          att.type,
          att.size,
          att.data
        ]);
      }

      // Mirror to support_tickets for backwards compatibility
      try {
        await db.runAsync(`
          INSERT INTO support_tickets (
            id, student_id, student_name, skill_name, eligibility_proof, 
            title, description, code_snippet, issue_type, reward_credits, 
            attachment_name, attachment_data, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', CURRENT_TIMESTAMP)
        `, [
          doubtId,
          user.id,
          user.name,
          doubtCategory,
          eligibility.proof,
          title.trim(),
          description.trim(),
          codeSnippet || null,
          doubtCategory,
          rewardCredits,
          firstAtt?.name || null,
          firstAtt?.data || null
        ]);
      } catch (e) {}

      const createdDoubt = await db.getAsync(`
        SELECT d.*, ru.name AS raised_by_name, ru.avatar AS raised_by_avatar 
        FROM support_doubts d
        LEFT JOIN users ru ON ru.id = d.raised_by_user_id
        WHERE d.id = ?
      `, [doubtId]);

      const savedAttachments = await db.allAsync(`
        SELECT * FROM support_doubt_attachments WHERE doubt_id = ?
      `, [doubtId]);

      const fullDoubt = {
        ...createdDoubt,
        attachments: savedAttachments
      };

      safeBroadcast('doubt_created', { doubt: fullDoubt, author: user.name });

      res.status(201).json({
        success: true,
        message: 'Doubt successfully submitted to the common Support Team queue! (Cost: 0 Credits)',
        doubt: fullDoubt,
        ticket: fullDoubt
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Accept an Open Doubt (ATOMIC FIRST-COME-FIRST-SERVED)
   * POST /api/support/doubts/:id/accept
   */
  async acceptDoubt(req, res, next) {
    try {
      const doubtId = req.params.id;
      const currentUser = req.user;

      const doubt = await db.getAsync(`SELECT * FROM support_doubts WHERE id = ?`, [doubtId]);
      if (!doubt) {
        return res.status(404).json({ success: false, error: 'Support doubt not found.' });
      }

      // 1. Author cannot accept their own doubt
      if (doubt.raised_by_user_id === currentUser.id) {
        return res.status(400).json({
          success: false,
          error: 'You cannot accept your own doubt. A peer tutor or mentor must accept it.'
        });
      }

      // 2. Check if already resolved
      if (doubt.status === 'RESOLVED') {
        return res.status(400).json({
          success: false,
          error: 'This doubt has already been resolved.'
        });
      }

      // 3. ATOMIC FIRST-COME-FIRST-SERVED UPDATE
      const result = await db.runAsync(`
        UPDATE support_doubts
        SET status = 'ACCEPTED',
            accepted_by_user_id = ?,
            accepted_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'OPEN' AND accepted_by_user_id IS NULL
      `, [currentUser.id, doubtId]);

      // Check if this user won the atomic race
      if (!result || result.changes === 0) {
        // Someone else accepted it first
        const currentClaim = await db.getAsync(`
          SELECT d.*, u.name AS accepted_by_name 
          FROM support_doubts d
          LEFT JOIN users u ON u.id = d.accepted_by_user_id
          WHERE d.id = ?
        `, [doubtId]);

        return res.status(409).json({
          success: false,
          error: 'This doubt has already been accepted by another user.',
          acceptedBy: currentClaim?.accepted_by_name || 'Another user'
        });
      }

      // Mirror to support_tickets
      try {
        await db.runAsync(`
          UPDATE support_tickets
          SET status = 'CLAIMED',
              support_mentor_id = ?,
              support_mentor_name = ?
          WHERE id = ?
        `, [currentUser.id, currentUser.name, doubtId]);
      } catch (e) {}

      const updatedDoubt = await db.getAsync(`
        SELECT 
          d.*,
          ru.name AS raised_by_name,
          au.name AS accepted_by_name
        FROM support_doubts d
        LEFT JOIN users ru ON ru.id = d.raised_by_user_id
        LEFT JOIN users au ON au.id = d.accepted_by_user_id
        WHERE d.id = ?
      `, [doubtId]);

      safeBroadcast('doubt_accepted', { doubt: updatedDoubt, acceptedBy: currentUser.name, doubtId });

      res.json({
        success: true,
        message: '🎉 You successfully accepted this doubt! You are now assigned to write and submit the solution.',
        doubt: updatedDoubt,
        ticket: updatedDoubt
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Submit Answer / Solution for an Accepted Doubt
   * POST /api/support/doubts/:id/answer
   */
  async answerDoubt(req, res, next) {
    try {
      const doubtId = req.params.id;
      const { answerText, solution, classification, attachments, attachmentName, attachmentData, recommendedAssessmentSkill, recommendedQuizSkill } = req.body;
      const currentUser = req.user;

      const finalSolution = answerText || solution;
      if (!finalSolution || !finalSolution.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Please provide a detailed solution/answer for the doubt.'
        });
      }

      const doubt = await db.getAsync(`SELECT * FROM support_doubts WHERE id = ?`, [doubtId]);
      if (!doubt) {
        return res.status(404).json({ success: false, error: 'Support doubt not found.' });
      }

      // Security: ONLY the user who accepted this doubt can answer it
      if (doubt.accepted_by_user_id !== currentUser.id) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden: Only the user who accepted this doubt can submit an answer.'
        });
      }

      if (doubt.status === 'RESOLVED') {
        return res.status(400).json({
          success: false,
          error: 'This doubt has already been resolved.'
        });
      }

      const finalClassification = classification || 'Level 1: Syntax / Typo / Quick Debug';
      let rewardAmount = 0.5;
      if (finalClassification.includes('Level 3') || finalClassification.includes('Architecture')) {
        rewardAmount = 1.5;
      } else if (finalClassification.includes('Level 2') || finalClassification.includes('Logic')) {
        rewardAmount = 1.0;
      } else if (finalClassification.includes('Level 1') || finalClassification.includes('Syntax')) {
        rewardAmount = 0.5;
      }

      const recommendedSkill = recommendedAssessmentSkill || recommendedQuizSkill || doubt.category || 'Programming';

      // Process answer attachments
      const rawAttachments = Array.isArray(attachments) ? attachments : [];
      if (rawAttachments.length === 0 && attachmentData) {
        rawAttachments.push({
          name: attachmentName || 'solution_attachment',
          data: attachmentData,
          type: attachmentData.startsWith('data:image/') ? 'image/png' : 'text/plain'
        });
      }

      const processedAttachments = [];
      for (const att of rawAttachments) {
        const processed = validateAndProcessAttachment(att);
        if (processed) processedAttachments.push(processed);
      }

      const firstAtt = processedAttachments[0] || null;

      // 1. Insert Answer Record
      const answerId = 'ans_' + Date.now();
      await db.runAsync(`
        INSERT INTO support_answers (
          id, doubt_id, answered_by_user_id, answer_text, classification,
          attachment_name, attachment_data, recommended_assessment_skill, 
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [
        answerId,
        doubtId,
        currentUser.id,
        finalSolution.trim(),
        finalClassification,
        firstAtt?.name || null,
        firstAtt?.data || null,
        recommendedSkill
      ]);

      // Insert all answer attachments into support_answer_attachments
      for (let i = 0; i < processedAttachments.length; i++) {
        const att = processedAttachments[i];
        const attId = `att_ans_${Date.now()}_${i}`;
        await db.runAsync(`
          INSERT INTO support_answer_attachments (id, answer_id, doubt_id, file_name, file_type, file_size, file_data)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          attId,
          answerId,
          doubtId,
          att.name,
          att.type,
          att.size,
          att.data
        ]);
      }

      // 2. Mark Doubt as RESOLVED (Bounty held pending student 3★ rating)
      await db.runAsync(`
        UPDATE support_doubts
        SET status = 'RESOLVED',
            reward_credits = ?,
            resolved_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [rewardAmount, doubtId]);

      // 3. Send Notification to Original Question Raiser to Review & Rate
      await db.runAsync(`
        INSERT INTO notifications (id, user_id, title, message, time, is_unread, type)
        VALUES (?, ?, '🛠️ Solution Submitted for Your Doubt!', ?, 'Just now', 1, 'match')
      `, [
        'notif_dbt_' + Date.now(),
        doubt.raised_by_user_id,
        `Mentor ${currentUser.name} submitted a verified solution for "${doubt.title}". Please review and rate (3★ or above) to release their mentor reward (+${rewardAmount} Cr)!`
      ]);

      // Mirror to support_tickets
      try {
        await db.runAsync(`
          UPDATE support_tickets
          SET status = 'RESOLVED',
              reward_credits = ?,
              support_mentor_id = ?,
              support_mentor_name = ?,
              mentor_classification = ?,
              mentor_solution = ?,
              recommended_assessment_skill = ?,
              resolved_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [rewardAmount, currentUser.id, currentUser.name, finalClassification, finalSolution.trim(), recommendedSkill, doubtId]);
      } catch (e) {}

      const resolvedDoubt = await db.getAsync(`
        SELECT 
          d.*,
          ru.name AS raised_by_name,
          au.name AS accepted_by_name
        FROM support_doubts d
        LEFT JOIN users ru ON ru.id = d.raised_by_user_id
        LEFT JOIN users au ON au.id = d.accepted_by_user_id
        WHERE d.id = ?
      `, [doubtId]);

      const savedAnswerAttachments = await db.allAsync(`
        SELECT * FROM support_answer_attachments WHERE answer_id = ?
      `, [answerId]);

      safeBroadcast('doubt_resolved', { doubt: resolvedDoubt, solver: currentUser.name, doubtId });

      res.json({
        success: true,
        message: `Solution submitted successfully! Bounty (+${rewardAmount} Credits) will be credited to your wallet once the student rates your solution 3★ or above.`,
        rewardEarned: 0,
        rewardCredits: rewardAmount,
        doubt: {
          ...resolvedDoubt,
          answer_attachments: savedAnswerAttachments
        },
        ticket: resolvedDoubt
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Secure File Download
   * GET /api/support/attachments/:id/download
   * GET /api/support/doubts/:doubtId/attachments/:attachmentId/download
   */
  async downloadAttachment(req, res, next) {
    try {
      const attId = req.params.attachmentId || req.params.id;
      const currentUser = req.user;

      if (!currentUser) {
        return res.status(401).json({ success: false, error: 'Unauthorized.' });
      }

      // Search in doubt attachments first
      let att = await db.getAsync(`SELECT * FROM support_doubt_attachments WHERE id = ?`, [attId]);
      
      // If not found, search in answer attachments
      if (!att) {
        att = await db.getAsync(`SELECT * FROM support_answer_attachments WHERE id = ?`, [attId]);
      }

      // If still not found, search by doubt_id or legacy id
      if (!att) {
        const doubt = await db.getAsync(`SELECT * FROM support_doubts WHERE id = ? OR attachment_name = ?`, [attId, attId]);
        if (doubt && doubt.attachment_data) {
          att = {
            id: doubt.id,
            file_name: doubt.attachment_name || 'attachment',
            file_type: doubt.attachment_data.startsWith('data:image/') ? 'image/png' : 'text/plain',
            file_data: doubt.attachment_data
          };
        }
      }

      if (!att || !att.file_data) {
        return res.status(404).json({ success: false, error: 'Attachment file not found.' });
      }

      let base64String = att.file_data;
      let contentType = att.file_type || 'application/octet-stream';

      if (base64String.startsWith('data:')) {
        const commaIdx = base64String.indexOf(',');
        if (commaIdx !== -1) {
          const header = base64String.substring(0, commaIdx);
          const match = header.match(/^data:([^;]+);/);
          if (match) contentType = match[1];
          base64String = base64String.substring(commaIdx + 1);
        }
      }

      const fileBuffer = Buffer.from(base64String, 'base64');
      const safeFilename = sanitizeFileName(att.file_name || 'download');

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeFilename)}"`);
      res.setHeader('Content-Length', fileBuffer.length);
      return res.send(fileBuffer);
    } catch (err) {
      next(err);
    }
  },

  /**
   * Rate a Resolved Doubt (Credits released to mentor ONLY if student rates >= 3 Stars)
   * POST /api/support/doubts/:id/rate
   */
  async rateDoubt(req, res, next) {
    try {
      const doubtId = req.params.id;
      const { rating, feedback } = req.body;
      const currentUser = req.user;

      const doubt = await db.getAsync(`
        SELECT d.*, au.name AS accepted_by_name 
        FROM support_doubts d
        LEFT JOIN users au ON au.id = d.accepted_by_user_id
        WHERE d.id = ?
      `, [doubtId]);

      if (!doubt) {
        return res.status(404).json({ success: false, error: 'Support doubt not found.' });
      }

      if (doubt.raised_by_user_id !== currentUser.id) {
        return res.status(403).json({ success: false, error: 'Only the user who raised the doubt can rate the answer.' });
      }

      // Check if rating has ALREADY been submitted (Strict Finality & Lock)
      if ((doubt.rating && doubt.rating > 0) || doubt.reward_granted === 1) {
        return res.status(400).json({ 
          success: false, 
          error: `This doubt has already been rated (${doubt.rating} Stars). Ratings are final and cannot be changed.` 
        });
      }

      const score = Math.max(1, Math.min(5, Number(rating) || 5));
      const rewardAmount = Number(doubt.reward_credits) || 0.5;
      const willGrantReward = score >= 3 ? 1 : 0;

      // ATOMIC COMPARE-AND-SWAP (CAS): Only update if rating IS NULL or 0
      const updateResult = await db.runAsync(`
        UPDATE support_doubts
        SET rating = ?, feedback = ?, reward_granted = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND (rating IS NULL OR rating = 0)
      `, [score, feedback || 'Great solution!', willGrantReward, doubtId]);

      // If changes === 0, another request concurrently updated this row!
      if (!updateResult || updateResult.changes === 0) {
        return res.status(400).json({
          success: false,
          error: 'Rating submission conflict. Rating has already been recorded.'
        });
      }

      // Mirror to support_tickets
      try {
        await db.runAsync(`
          UPDATE support_tickets
          SET rating = ?, feedback = ?, reward_granted = ?, status = 'CLOSED'
          WHERE id = ?
        `, [score, feedback || 'Great solution!', willGrantReward, doubtId]);
      } catch (e) {}

      let rewardReleased = false;

      // RELEASE MENTOR BOUNTY ONLY IF RATING IS 3 STARS OR HIGHER (>= 3)
      if (score >= 3 && doubt.accepted_by_user_id) {
        // DOUBLE CHECK TRANSACTIONS LEDGER to prevent duplicate transactions
        const existingTx = await db.getAsync(`
          SELECT id FROM transactions 
          WHERE user_id = ? AND type = 'Support Reward' AND description LIKE ?
        `, [doubt.accepted_by_user_id, `%${doubt.title}%`]);

        if (!existingTx) {
          rewardReleased = true;

          // 1. Credit Mentor Wallet
          await db.runAsync(`
            UPDATE users 
            SET credits = ROUND(credits + ?, 2), 
                lifetime_earned = ROUND(lifetime_earned + ?, 2) 
            WHERE id = ?
          `, [rewardAmount, rewardAmount, doubt.accepted_by_user_id]);

          // 2. Record in Transactions Ledger
          await db.runAsync(`
            INSERT INTO transactions (id, user_id, date, type, description, amount, status, student_name)
            VALUES (?, ?, ?, 'Support Reward', ?, ?, 'Completed', ?)
          `, [
            'tx_dbt_' + Date.now(),
            doubt.accepted_by_user_id,
            new Date().toISOString().split('T')[0],
            `Doubt Solution Bounty (${score}★ Rating): "${doubt.title}"`,
            rewardAmount,
            currentUser.name
          ]);

          // 3. Send Notification to Mentor
          await db.runAsync(`
            INSERT INTO notifications (id, user_id, title, message, time, is_unread, type)
            VALUES (?, ?, '🏆 Mentor Reward Released!', ?, 'Just now', 1, 'reward')
          `, [
            'notif_rw_' + Date.now(),
            doubt.accepted_by_user_id,
            `Student ${currentUser.name} rated your solution ${score} Stars! +${rewardAmount} Credits have been deposited into your wallet.`
          ]);
        }
      }

      safeBroadcast('doubt_rated', { doubtId, rating: score, rater: currentUser.name, rewardReleased, rewardAmount });

      let responseMessage = `⭐ Rated ${score} Stars!`;
      if (rewardReleased) {
        responseMessage = `🎉 Thank you! You gave ${score} Stars. +${rewardAmount} Credits have been released to mentor ${doubt.accepted_by_name || 'solver'}.`;
      } else if (score < 3) {
        responseMessage = `⭐ Feedback submitted (${score} Stars). Note: Mentor reward is only released for solutions rated 3 Stars or above.`;
      } else {
        responseMessage = `⭐ Rating saved (${score} Stars).`;
      }

      res.json({
        success: true,
        message: responseMessage,
        rewardReleased,
        rewardAmount: rewardReleased ? rewardAmount : 0
      });
    } catch (err) {
      next(err);
    }
  },

  // ==========================================
  // Aliases for Backward Compatibility
  // ==========================================
  getAllTickets(req, res, next) {
    return supportController.getAllDoubts(req, res, next);
  },
  getTicketById(req, res, next) {
    return supportController.getDoubtById(req, res, next);
  },
  createTicket(req, res, next) {
    return supportController.createDoubt(req, res, next);
  },
  claimTicket(req, res, next) {
    return supportController.acceptDoubt(req, res, next);
  },
  resolveTicket(req, res, next) {
    return supportController.answerDoubt(req, res, next);
  },
  rateTicket(req, res, next) {
    return supportController.rateDoubt(req, res, next);
  }
};

module.exports = supportController;
