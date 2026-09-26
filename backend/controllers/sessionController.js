/**
 * SkillSwap Platform - Session, Escrow & Live Zoom Video Meeting Controller
 */

const { db } = require('../database/db');
const { trusodbService, supabaseService } = require('../database/trusodb');
const { zoomService } = require('../services/zoomService');

const sessionController = {
  async getSessions(req, res, next) {
    try {
      const sessions = await supabaseService.getSessions();
      res.json({ success: true, sessions });
    } catch (err) {
      next(err);
    }
  },

  async bookSession(req, res, next) {
    try {
      const {
        learnerId,
        tutorId,
        mentorId,
        skillName,
        subject,
        topic,
        title,
        sessionDate,
        date,
        time,
        durationHours,
        duration,
        description,
        sessionType,
        meetingPlatform,
        additionalNotes,
        meetingLink,
        credits,
        rate
      } = req.body;
      const result = await supabaseService.bookSessionEscrow({
        learnerId: learnerId || req.currentUserId || req.user?.id || 'sri',
        tutorId: mentorId || tutorId,
        skillName: skillName || subject,
        subject,
        topic: topic || title,
        sessionDate: sessionDate || date,
        date,
        time,
        durationHours: durationHours || duration || 1,
        duration,
        title,
        description,
        sessionType,
        meetingPlatform,
        additionalNotes,
        meetingLink,
        credits,
        rate
      });
      res.status(201).json(result);
    } catch (err) {
      if (err.isConflict || err.status === 409) {
        return res.status(409).json({ success: false, error: err.message });
      }
      next(err);
    }
  },

  async completeSession(req, res, next) {
    try {
      const { sessionId, rating, comment, tags } = req.body;
      const result = await supabaseService.completeSessionAndReleaseEscrow({
        sessionId,
        rating: Number(rating) || 5.0,
        comment: comment || 'Productive skill swap session!',
        tags: tags || []
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async createCohort(req, res, next) {
    try {
      const tutorId = req.user?.id || req.currentUserId;
      if (!tutorId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const {
        skillName,
        subject,
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
        platform,
        meetingPlatform,
        maxCapacity,
        maxParticipants,
        max_capacity,
        sessionSeriesType,
        learningDetails,
        tags,
        creditsPerAttendee,
        minimumAcademicLevel,
        prerequisites,
        meetingLink,
        status
      } = req.body;

      const result = await supabaseService.createGroupCohortSession({
        tutorId,
        skillName: skillName || subject || title || 'Group Masterclass',
        title: title || topic || skillName,
        topic: topic || title || skillName,
        category,
        shortDescription,
        description,
        sessionDate: sessionDate || date,
        date,
        time: time || startTime,
        startTime,
        durationHours: durationHours || duration,
        duration,
        platform: platform || meetingPlatform,
        meetingPlatform,
        maxCapacity: maxCapacity || maxParticipants || max_capacity,
        sessionSeriesType,
        learningDetails,
        tags,
        creditsPerAttendee,
        minimumAcademicLevel,
        prerequisites,
        meetingLink,
        status
      });

      res.status(201).json(result);
    } catch (err) {
      if (err.code === 'TUTOR_NOT_VERIFIED' || err.status === 403 || (err.message && err.message.toLowerCase().includes('verify'))) {
        return res.status(403).json({
          success: false,
          error: 'TUTOR_NOT_VERIFIED',
          message: 'Please verify your certificate before creating a Masterclass.'
        });
      }
      next(err);
    }
  },

  async enrollInCohort(req, res, next) {
    try {
      const sessionId = req.body.sessionId || req.body.cohortSessionId || req.body.masterclassId || req.params.id;
      const studentId = req.user?.id || req.currentUserId || 'pujitha';
      if (!sessionId) {
        return res.status(400).json({ success: false, error: 'Session ID is required to enroll in cohort' });
      }
      const result = await supabaseService.enrollInCohortSession({
        sessionId,
        studentId
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async getCohortAttendees(req, res, next) {
    try {
      const { id } = req.params;
      const attendees = await supabaseService.getCohortAttendees(id);
      res.json({ success: true, attendees });
    } catch (err) {
      next(err);
    }
  },

  async recordAttendance(req, res, next) {
    try {
      const sessionId = req.params.id || req.body.sessionId;
      const userId = req.user?.id || req.currentUserId;
      const result = await supabaseService.recordLiveAttendance({ sessionId, userId });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async recordLeave(req, res, next) {
    try {
      const sessionId = req.params.id || req.body.sessionId;
      const userId = req.user?.id || req.currentUserId;
      const result = await supabaseService.recordLiveLeave({ sessionId, userId });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async finalizeAttendance(req, res, next) {
    try {
      const sessionId = req.params.id || req.body.sessionId;
      const tutorId = req.user?.id || req.currentUserId;
      const session = await db.getAsync(`SELECT * FROM sessions WHERE id = ?`, [sessionId]);
      if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

      if (session.session_type === 'GROUP_COHORT') {
        const result = await supabaseService.finalizeMasterclassAttendance({ sessionId, tutorId });
        return res.json(result);
      } else {
        const attendanceStatus = req.body?.attendanceStatus || req.body?.attendance || 'Attended';
        const result = await supabaseService.finalizeSessionAttendance({
          sessionId,
          userId: tutorId,
          attendanceStatus
        });
        return res.json(result);
      }
    } catch (err) {
      next(err);
    }
  },

  async acceptSession(req, res, next) {
    try {
      const sessionId = req.params.id || req.body.sessionId;
      const userId = req.user?.id || req.currentUserId;
      if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

      const result = await supabaseService.acceptSessionRequest({ sessionId, userId });
      res.json(result);
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({ success: false, error: err.message });
      }
      next(err);
    }
  },

  async declineSession(req, res, next) {
    try {
      const sessionId = req.params.id || req.body.sessionId;
      const userId = req.user?.id || req.currentUserId;
      const { reason } = req.body || {};
      if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

      const result = await supabaseService.declineSessionRequest({ sessionId, userId, reason });
      res.json(result);
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({ success: false, error: err.message });
      }
      next(err);
    }
  },

  async completeCohort(req, res, next) {
    try {
      const { id } = req.params;
      const tutorId = req.user?.id || req.currentUserId || 'sri';
      const result = await supabaseService.finalizeMasterclassAttendance({
        sessionId: id,
        tutorId
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async cancelSession(req, res, next) {
    try {
      const sessionId = req.params.id || req.body.sessionId || req.body.id;
      const { reason } = req.body;
      const userId = req.user?.id || req.currentUserId;
      const result = await supabaseService.cancelSessionAndRefundEscrow({
        sessionId,
        reason: reason || 'Learner requested cancellation',
        userId
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * Real-Time Live Video Session Endpoint
   * GET/POST /api/sessions/:id/live-meeting
   * Handles 1-on-1 and Group Masterclass meetings with deterministic single-meeting locking
   */
  async getOrCreateLiveMeeting(req, res, next) {
    try {
      const { id } = req.params;
      const currentUserId = req.user?.id || req.currentUserId;

      if (!currentUserId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required to join live video meeting.'
        });
      }

      // 1. Fetch Session Record from Database
      const session = await db.getAsync(`SELECT * FROM sessions WHERE id = ?`, [id]);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: `Skill Swap session with ID "${id}" was not found.`
        });
      }

      // Block unaccepted, declined, cancelled, or ended sessions from starting live meeting
      const isExpired = supabaseService.isSessionExpired(session);
      if (isExpired) {
        if (session.status !== 'ENDED' && session.status !== 'Completed') {
          await db.runAsync(`UPDATE sessions SET status = 'ENDED', meeting_ended_at = COALESCE(meeting_ended_at, CURRENT_TIMESTAMP) WHERE id = ?`, [id]);
        }
        return res.status(400).json({
          success: false,
          error: 'This session has ended and is no longer available.',
          isEnded: true
        });
      }

      const st = (session.status || '').toUpperCase();
      if (st === 'ENDED' || st === 'COMPLETED') {
        return res.status(400).json({
          success: false,
          error: 'This session has ended and is no longer available.',
          isEnded: true
        });
      }
      if (st === 'PENDING') {
        return res.status(400).json({
          success: false,
          error: 'Cannot join live meeting: Session request is still pending mentor response.'
        });
      }
      if (st === 'DECLINED') {
        return res.status(400).json({
          success: false,
          error: 'Cannot join live meeting: Session request was declined.'
        });
      }
      if (st === 'CANCELLED') {
        return res.status(400).json({
          success: false,
          error: 'Cannot join live meeting: This session has been cancelled.'
        });
      }

      // 2. Authorize User against Session
      const isTeacher = session.teacher_id === currentUserId;
      const isStudent = session.student_id === currentUserId;
      const isCohort = session.session_type === 'GROUP_COHORT';

      let isEnrolled = false;
      if (isCohort) {
        const attendeeRecord = await db.getAsync(
          `SELECT * FROM session_attendees WHERE session_id = ? AND student_id = ?`,
          [id, currentUserId]
        );
        isEnrolled = !!attendeeRecord;
      }

      // Deny unauthorized third-party users
      if (!isTeacher && !isStudent && !isEnrolled && req.user?.role !== 'FACULTY_ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
        return res.status(403).json({
          success: false,
          error: 'Forbidden: You are not authorized to join this meeting. Only the assigned mentor and enrolled student(s) can enter.'
        });
      }

      // Record live attendance for participants entering the room
      if (isCohort && (isTeacher || isEnrolled)) {
        try {
          await supabaseService.recordLiveAttendance({ sessionId: id, userId: currentUserId });
        } catch (e) {}
      } else if (!isCohort) {
        // Record joins for 1-on-1 Swaps
        if (isTeacher) {
          await db.runAsync(`UPDATE sessions SET teacher_joined_at = COALESCE(teacher_joined_at, CURRENT_TIMESTAMP) WHERE id = ?`, [id]);
        }
        if (isStudent) {
          await db.runAsync(`UPDATE sessions SET student_joined_at = COALESCE(student_joined_at, CURRENT_TIMESTAMP) WHERE id = ?`, [id]);
        }

        // When BOTH User A and User B have joined, start live meeting timer and mark status 'LIVE'
        const updatedJoinStatus = await db.getAsync(`SELECT student_joined_at, teacher_joined_at, meeting_started_at FROM sessions WHERE id = ?`, [id]);
        if (updatedJoinStatus && updatedJoinStatus.student_joined_at && updatedJoinStatus.teacher_joined_at && !updatedJoinStatus.meeting_started_at) {
          await db.runAsync(
            `UPDATE sessions SET meeting_started_at = CURRENT_TIMESTAMP, status = 'LIVE' WHERE id = ? AND meeting_started_at IS NULL`,
            [id]
          );
        }
      }

      // 3. Atomically Retrieve or Create Meeting (PREVENTS DUPLICATE MEETINGS)
      let meetingId = session.zoom_meeting_id;
      let password = session.zoom_meeting_password;
      let joinUrl = session.zoom_join_url;
      let startUrl = session.zoom_start_url;

      if (!meetingId) {
        // Create new meeting using Zoom API or high-performance WebRTC room generator
        const newMeeting = await zoomService.createMeeting({
          topic: `${session.skill} • ${session.topic || 'Skill Swap Live Session'}`,
          durationHours: session.hours || 1,
          startTime: session.date
        });

        meetingId = newMeeting.meetingId;
        password = newMeeting.password;
        joinUrl = newMeeting.joinUrl;
        startUrl = newMeeting.startUrl;

        // Persist meeting details to database with atomic update
        await db.runAsync(
          `UPDATE sessions 
           SET zoom_meeting_id = ?, zoom_meeting_password = ?, zoom_join_url = ?, zoom_start_url = ?, zoom_meeting_created = 1
           WHERE id = ?`,
          [meetingId, password, joinUrl, startUrl, id]
        );
      }

      // 4. Generate Zoom Web SDK Signature for Current User
      const isHost = isTeacher;
      const role = isHost ? 1 : 0; // 1 = Host, 0 = Participant
      const sigData = zoomService.generateSignature({ meetingNumber: meetingId, role });

      // 5. Fetch Full Real Participant Database Details
      const teacher = await db.getAsync(
        `SELECT id, name, email, avatar, role, college, major, rating, credits FROM users WHERE id = ?`,
        [session.teacher_id]
      );

      let learner = null;
      if (session.student_id && session.student_id !== 'GROUP_COHORT') {
        learner = await db.getAsync(
          `SELECT id, name, email, avatar, role, college, major, rating, credits FROM users WHERE id = ?`,
          [session.student_id]
        );
      }

      const attendees = isCohort
        ? await db.allAsync(
            `SELECT sa.*, u.avatar, u.major, u.role FROM session_attendees sa JOIN users u ON sa.student_id = u.id WHERE sa.session_id = ?`,
            [id]
          )
        : [];

      const freshSession = await db.getAsync(`SELECT * FROM sessions WHERE id = ?`, [id]) || session;

      return res.json({
        success: true,
        sessionId: freshSession.id,
        session: {
          id: freshSession.id,
          skill: freshSession.skill,
          topic: freshSession.topic || `${freshSession.skill} Live Exchange`,
          hours: freshSession.hours,
          rate: freshSession.rate,
          credits: freshSession.credits,
          date: freshSession.date,
          time: freshSession.time,
          status: freshSession.status,
          session_type: freshSession.session_type,
          payment_status: freshSession.payment_status || 'PENDING',
          student_joined_at: freshSession.student_joined_at,
          teacher_joined_at: freshSession.teacher_joined_at,
          meeting_started_at: freshSession.meeting_started_at,
          teacher: teacher || { id: freshSession.teacher_id, name: freshSession.teacher_id },
          learner: learner || (isCohort ? { id: 'cohort', name: `${attendees.length} Students Enrolled` } : { id: freshSession.student_id, name: freshSession.student_id }),
          attendees
        },
        meeting: {
          meetingId,
          password,
          signature: sigData.signature,
          sdkKey: sigData.sdkKey,
          role,
          userName: req.user?.name || (isHost ? teacher?.name : learner?.name) || 'User',
          userEmail: req.user?.email || 'student@vignan.ac.in',
          isHost,
          joinUrl,
          startUrl,
          provider: zoomService.isConfigured() ? 'ZOOM_MEETING_SDK' : 'EMBEDDED_RTC_MESH'
        }
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Conclude and mark live meeting completed
   */
  async endLiveMeeting(req, res, next) {
    try {
      const { id } = req.params;
      const currentUserId = req.user?.id || req.currentUserId;

      const session = await db.getAsync(`SELECT * FROM sessions WHERE id = ?`, [id]);
      if (!session) {
        return res.status(404).json({ success: false, error: 'Session not found' });
      }

      // Verify host authorization (only host teacher or admin can permanently end)
      const isTeacher = session.teacher_id === currentUserId;
      const isAdmin = req.user?.role === 'FACULTY_ADMIN' || req.user?.role === 'SUPER_ADMIN';
      if (!isTeacher && !isAdmin) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden: Only the session host can permanently end this session.'
        });
      }

      await db.runAsync(
        `UPDATE sessions SET status = 'ENDED', meeting_ended_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [id]
      );

      if (currentUserId) {
        try {
          await supabaseService.recordLiveLeave({ sessionId: id, userId: currentUserId });
        } catch (e) {}
      }
      res.json({ success: true, message: 'This session has been permanently ended by the host.', isEnded: true });
    } catch (err) {
      next(err);
    }
  },

  async getMySessions(req, res, next) {
    try {
      const userId = req.user?.id || req.currentUserId;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }
      const data = await supabaseService.getUserSessionsCategorized(userId);
      res.json({ success: true, ...data });
    } catch (err) {
      next(err);
    }
  },

  async getSessionById(req, res, next) {
    try {
      const { id } = req.params;
      const session = await db.getAsync(`SELECT * FROM sessions WHERE id = ?`, [id]);
      if (!session) {
        return res.status(404).json({ success: false, error: 'Session not found' });
      }
      const teacher = await db.getAsync(`SELECT id, name, email, avatar, rating, role, college, major FROM users WHERE id = ?`, [session.teacher_id]);
      const student = session.student_id ? await db.getAsync(`SELECT id, name, email, avatar, rating, role, college, major FROM users WHERE id = ?`, [session.student_id]) : null;
      const attendees = await db.allAsync(`SELECT sa.*, u.avatar, u.major, u.name FROM session_attendees sa JOIN users u ON sa.student_id = u.id WHERE sa.session_id = ?`, [id]);
      const registrations = await db.allAsync(`SELECT mr.*, u.avatar, u.major, u.name FROM masterclass_registrations mr JOIN users u ON mr.user_id = u.id WHERE mr.masterclass_id = ?`, [id]);
      const review = await db.getAsync(`SELECT * FROM reviews WHERE session_id = ?`, [id]);

      const currentUserId = req.user?.id || req.currentUserId;
      const isHost = currentUserId ? session.teacher_id === currentUserId : false;
      const isRegistered = currentUserId ? (
        attendees.some(a => a.student_id === currentUserId) || 
        registrations.some(r => r.user_id === currentUserId && r.status !== 'CANCELLED')
      ) : false;

      const enrolledCount = Math.max(attendees.length, registrations.filter(r => r.status !== 'CANCELLED').length, session.enrolled_count || 0);

      let parsedTags = [];
      if (session.tags) {
        try {
          parsedTags = typeof session.tags === 'string' ? JSON.parse(session.tags) : session.tags;
        } catch (e) {
          parsedTags = session.tags.split(',').map(t => t.trim()).filter(Boolean);
        }
      }

      res.json({
        success: true,
        session: {
          ...session,
          title: session.topic || session.skill,
          subject: session.skill,
          requester_id: session.student_id,
          tutor_id: session.teacher_id,
          mentor_id: session.teacher_id,
          parsedTags,
          enrolled_count: enrolledCount,
          teacher,
          student,
          attendees,
          registrations,
          isHost,
          isRegistered,
          feedback: review ? {
            rating: review.rating,
            comment: review.comment,
            tags: JSON.parse(review.tags_json || '[]'),
            reviewerName: review.reviewer_name
          } : null
        }
      });
    } catch (err) {
      next(err);
    }
  },

  async rescheduleSession(req, res, next) {
    try {
      const { id } = req.params;
      const { newDate, newTime } = req.body;
      const userId = req.user?.id || req.currentUserId;

      if (!newDate || !newTime) {
        return res.status(400).json({ success: false, error: 'New date and time are required' });
      }

      const result = await supabaseService.rescheduleSessionRecord({
        sessionId: id,
        userId,
        newDate,
        newTime
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async cancelCohortEnrollment(req, res, next) {
    try {
      const { id } = req.params;
      const studentId = req.user?.id || req.currentUserId;

      const result = await supabaseService.cancelCohortEnrollment({
        sessionId: id,
        studentId
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async updateSession(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user?.id || req.currentUserId;
      const updates = req.body || {};

      const result = await supabaseService.updateSessionDetails({
        sessionId: id,
        userId,
        updates
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async reportSession(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user?.id || req.currentUserId;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }
      const { issueType, issue_type, category, description, priority } = req.body;
      const finalType = issueType || issue_type || category || 'Other';
      const finalDesc = description || '';

      const result = await supabaseService.createMasterclassReport({
        masterclassId: id,
        userId,
        issueType: finalType,
        description: finalDesc,
        priority: priority || 'Medium'
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * Check or trigger the 50% scheduled duration payment milestone
   * POST /api/sessions/:id/check-halfway-payment
   */
  async checkOrProcessHalfwayPayment(req, res, next) {
    try {
      const sessionId = req.params.id || req.body.sessionId;
      const userId = req.user?.id || req.currentUserId;
      const { force } = req.body || {};

      const result = await supabaseService.releaseSessionPaymentAtHalfDuration({
        sessionId,
        userId,
        forceTestThreshold: !!force
      });

      res.json(result);
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({ success: false, error: err.message });
      }
      next(err);
    }
  },

  /**
   * Host / Mentor Accepts Pending Session Request
   * POST /api/sessions/:id/accept
   */
  async acceptSession(req, res, next) {
    try {
      const { id } = req.params;
      const currentUserId = req.user?.id || req.currentUserId;

      if (!currentUserId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const session = await db.getAsync(`SELECT * FROM sessions WHERE id = ?`, [id]);
      if (!session) {
        return res.status(404).json({ success: false, error: 'Session not found' });
      }

      // Security check: Only the assigned mentor/host (teacher_id) can accept
      if (session.teacher_id !== currentUserId && req.user?.role !== 'FACULTY_ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
        return res.status(403).json({
          success: false,
          error: 'Forbidden: Only the assigned mentor can accept this session request.'
        });
      }

      // Conflict / idempotency check
      const currentStatus = (session.status || '').toUpperCase();
      if (currentStatus === 'ACCEPTED' || currentStatus === 'CONFIRMED' || currentStatus === 'SCHEDULED' || currentStatus === 'LIVE') {
        return res.status(409).json({
          success: false,
          error: 'This session request has already been accepted.'
        });
      }
      if (currentStatus === 'DECLINED' || currentStatus === 'CANCELLED' || currentStatus === 'ENDED') {
        return res.status(409).json({
          success: false,
          error: `Cannot accept: Session is ${currentStatus.toLowerCase()}.`
        });
      }

      // Update status to ACCEPTED
      try {
        await db.runAsync(
          `UPDATE sessions SET status = 'ACCEPTED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [id]
        );
      } catch (e) {
        await db.runAsync(
          `UPDATE sessions SET status = 'ACCEPTED' WHERE id = ?`,
          [id]
        );
      }

      // Create notification for requester
      try {
        const notifId = 'notif_acc_' + Date.now();
        const teacher = await db.getAsync(`SELECT name FROM users WHERE id = ?`, [session.teacher_id]);
        const teacherName = teacher ? teacher.name : 'Mentor';
        await db.runAsync(
          `INSERT INTO notifications (id, user_id, title, message, time, is_unread, type)
           VALUES (?, ?, 'Swap Request Accepted!', ?, 'Just now', 1, 'session')`,
          [notifId, session.student_id, `${teacherName} accepted your swap request for ${session.skill}.`]
        );
      } catch (e) {}

      res.json({
        success: true,
        message: 'Session request accepted successfully',
        sessionId: id,
        status: 'ACCEPTED'
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Host / Mentor Declines Pending Session Request
   * POST /api/sessions/:id/decline
   */
  async declineSession(req, res, next) {
    try {
      const { id } = req.params;
      const currentUserId = req.user?.id || req.currentUserId;
      const { reason } = req.body || {};

      if (!currentUserId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const session = await db.getAsync(`SELECT * FROM sessions WHERE id = ?`, [id]);
      if (!session) {
        return res.status(404).json({ success: false, error: 'Session not found' });
      }

      // Security check: Only the assigned mentor/host (teacher_id) can decline
      if (session.teacher_id !== currentUserId && req.user?.role !== 'FACULTY_ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
        return res.status(403).json({
          success: false,
          error: 'Forbidden: Only the assigned mentor can decline this session request.'
        });
      }

      // Conflict / idempotency check
      const currentStatus = (session.status || '').toUpperCase();
      if (currentStatus === 'DECLINED') {
        return res.status(409).json({
          success: false,
          error: 'This session request has already been declined.'
        });
      }
      if (currentStatus === 'CANCELLED' || currentStatus === 'ENDED') {
        return res.status(409).json({
          success: false,
          error: `Cannot decline: Session is already ${currentStatus.toLowerCase()}.`
        });
      }

      // Update status to DECLINED
      try {
        await db.runAsync(
          `UPDATE sessions SET status = 'DECLINED', cancellation_reason = ?, cancelled_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [reason || 'Mentor declined the request', currentUserId, id]
        );
      } catch (e) {
        await db.runAsync(
          `UPDATE sessions SET status = 'DECLINED', cancellation_reason = ?, cancelled_by = ? WHERE id = ?`,
          [reason || 'Mentor declined the request', currentUserId, id]
        );
      }

      // Create notification for requester
      try {
        const notifId = 'notif_dec_' + Date.now();
        const teacher = await db.getAsync(`SELECT name FROM users WHERE id = ?`, [session.teacher_id]);
        const teacherName = teacher ? teacher.name : 'Mentor';
        await db.runAsync(
          `INSERT INTO notifications (id, user_id, title, message, time, is_unread, type)
           VALUES (?, ?, 'Swap Request Declined', ?, 'Just now', 1, 'session')`,
          [notifId, session.student_id, `${teacherName} declined your swap request for ${session.skill}.`]
        );
      } catch (e) {}

      res.json({
        success: true,
        message: 'Session request declined',
        sessionId: id,
        status: 'DECLINED'
      });
    } catch (err) {
      next(err);
    }
  },

  async checkSessionStatus(req, res, next) {
    try {
      const { id } = req.params;
      const session = await db.getAsync(`SELECT * FROM sessions WHERE id = ?`, [id]);
      if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

      const isExpired = supabaseService.isSessionExpired(session);
      if (isExpired) {
        if (session.status !== 'ENDED' && session.status !== 'Completed') {
          await db.runAsync(`UPDATE sessions SET status = 'ENDED', meeting_ended_at = COALESCE(meeting_ended_at, CURRENT_TIMESTAMP) WHERE id = ?`, [id]);
        }
        return res.json({ success: true, isEnded: true, status: 'ENDED', remainingSeconds: 0 });
      }

      const durationHours = Number(session.hours || 1);
      const durationMs = durationHours * 60 * 60 * 1000;
      let scheduledEndMs = Date.now() + durationMs;

      if (session.meeting_started_at) {
        const startStr = String(session.meeting_started_at);
        const normalizedStart = (startStr.endsWith('Z') || startStr.includes('+')) ? startStr : startStr.replace(' ', 'T') + 'Z';
        const startTime = new Date(normalizedStart).getTime();
        if (!isNaN(startTime)) {
          scheduledEndMs = startTime + durationMs;
        }
      }

      const remainingMs = Math.max(0, scheduledEndMs - Date.now());
      const remainingSeconds = Math.floor(remainingMs / 1000);

      res.json({
        success: true,
        isEnded: remainingSeconds <= 0,
        status: remainingSeconds <= 0 ? 'ENDED' : session.status,
        remainingSeconds
      });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = sessionController;
