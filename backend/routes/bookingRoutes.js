/**
 * SkillSwap Platform - Multi-Step 1-on-1 Swap Session Booking Routes
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { trusodbService, supabaseService } = require('../database/trusodb');
const { db } = require('../database/db');

// All booking routes require authentication
router.use(authenticateToken);

/**
 * GET /api/booking/mentors
 * Returns list of mentors with level, rating, reviews, skills, availability, and credit rate
 */
router.get('/mentors', async (req, res, next) => {
  try {
    const search = req.query.search || '';
    const excludeUserId = req.user?.id;
    const mentors = await supabaseService.getBookingMentors({ search, excludeUserId });
    res.json({ success: true, mentors, count: mentors.length });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/booking/subjects
 * Returns curated subjects list with category, icon, and dynamic topic tags
 */
router.get('/subjects', async (req, res, next) => {
  try {
    const subjects = await supabaseService.getBookingSubjects();
    res.json({ success: true, subjects, count: subjects.length });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/booking/availability
 * Returns available time slots for a mentor on a specific date
 */
router.get('/availability', async (req, res, next) => {
  try {
    const { mentorId, date } = req.query;
    if (!mentorId) {
      return res.status(400).json({ success: false, error: 'mentorId is required' });
    }
    const rawSlots = await supabaseService.getMentorAvailableSlots({ mentorId, date });
    const slotList = (rawSlots || []).map(s => (typeof s === 'string' ? s : s.time));
    const availableSlots = (rawSlots || []).filter(s => typeof s === 'string' || s.isAvailable).map(s => (typeof s === 'string' ? s : s.time));
    const bookedSlots = (rawSlots || []).filter(s => typeof s === 'object' && !s.isAvailable).map(s => s.time);
    res.json({ success: true, mentorId, date, slots: availableSlots, allSlots: slotList, availableSlots, bookedSlots });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/booking/confirm
 * Final confirmation and booking with double-booking prevention and wallet escrow deduction
 */
router.post('/confirm', async (req, res, next) => {
  try {
    const learnerId = req.user.id;
    const {
      mentorId,
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
      additionalNotes
    } = req.body;

    const result = await supabaseService.bookSessionEscrow({
      learnerId,
      tutorId: mentorId || tutorId,
      skillName: skillName || subject,
      subject,
      topic: topic || title,
      sessionDate: sessionDate || date,
      date,
      time,
      durationHours: durationHours || duration,
      duration,
      title,
      description,
      sessionType,
      meetingPlatform,
      additionalNotes
    });

    res.status(201).json(result);
  } catch (err) {
    if (err.isConflict || err.status === 409) {
      return res.status(409).json({
        success: false,
        error: err.message || 'This time slot is no longer available. Please select another time slot.'
      });
    }
    next(err);
  }
});

/**
 * GET /api/booking/calendar/:sessionId.ics
 * Returns real RFC 5545 iCalendar (.ics) file for Google Calendar, Apple Calendar, and Outlook
 */
router.get('/calendar/:sessionId.ics', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const session = await db.getAsync(`SELECT * FROM sessions WHERE id = ?`, [sessionId]);
    if (!session) {
      return res.status(404).send('Session not found');
    }

    const teacher = await db.getAsync(`SELECT name, email FROM users WHERE id = ?`, [session.teacher_id]);
    const student = await db.getAsync(`SELECT name, email FROM users WHERE id = ?`, [session.student_id]);

    // Parse date and time e.g. "2026-09-20", "05:00 PM"
    const dateStr = session.date || new Date().toISOString().split('T')[0];
    const timeStr = session.time || '10:00 AM';
    const hoursDuration = Number(session.hours || 1);

    // Format DTSTART / DTEND in UTC or local YYYYMMDDTHHMMSS
    const cleanDate = dateStr.replace(/-/g, '');
    let h = 10;
    let m = 0;
    const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
    if (match) {
      h = parseInt(match[1], 10);
      m = parseInt(match[2], 10);
      const ampm = (match[3] || '').toUpperCase();
      if (ampm === 'PM' && h < 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
    }
    const pad = (n) => String(n).padStart(2, '0');
    const startStr = `${cleanDate}T${pad(h)}${pad(m)}00`;
    const endH = h + hoursDuration;
    const endStr = `${cleanDate}T${pad(endH)}${pad(m)}00`;

    const summary = `${session.skill} Swap Session with ${teacher ? teacher.name : 'Mentor'}`;
    const desc = `${session.topic || session.skill}\\nPlatform: ${session.meeting_platform || 'Google Meet'}\\nLink: ${session.code_workspace || 'https://meet.skillswap.edu'}`;

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//SkillSwap University Hub//NONSGML v1.0//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${session.id}@skillswap.edu`,
      `DTSTAMP:${cleanDate}T000000Z`,
      `DTSTART:${startStr}`,
      `DTEND:${endStr}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${desc}`,
      `LOCATION:${session.meeting_platform || 'Google Meet'}`,
      `STATUS:CONFIRMED`,
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="SkillSwap-Session-${sessionId}.ics"`);
    res.send(icsContent);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
