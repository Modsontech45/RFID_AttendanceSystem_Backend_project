const express = require('express');
const pool = require('../db'); // PostgreSQL connection pool
const router = express.Router();
const getMessage = require('../utils/messages'); // function for multilingual messages

// Object to store the latest scan result per device (used for /queue endpoint)
const latestScans = {};

// POST /scan
router.post('/', async (req, res) => {
  const { uid, device_uid } = req.body;
  const lang = req.headers['accept-language']?.toLowerCase().split(',')[0] || 'en';
  const now = new Date();

  // Validate request body
  if (!uid || !device_uid) {
    return res.status(400).json({
      message: getMessage(lang, 'scan.missingFields'),
      sign: 0
    });
  }

  try {
    // 1. Check if student exists
    const studentRes = await pool.query('SELECT * FROM students WHERE uid = $1', [uid]);
    if (studentRes.rows.length === 0) {
      const notFound = {
        uid,
        device_uid,
        exists: false,
        message: getMessage(lang, 'scan.uidNotRegistered'),
        timestamp: now,
        sign: 2,
        flag: getMessage(lang, 'scan.registerNow')
      };
      latestScans[device_uid] = notFound;
      return res.json(notFound);
    }

    const student = studentRes.rows[0];
    const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

    // 2. Ensure daily attendance records exist for all students
    const attendanceCheck = await pool.query('SELECT COUNT(*) FROM attendance WHERE date = $1', [dateStr]);
    if (parseInt(attendanceCheck.rows[0].count) === 0) {
      const allStudents = await pool.query('SELECT uid, name, form, api_key FROM students');
      for (const s of allStudents.rows) {
        await pool.query(
          `INSERT INTO attendance (uid, name, form, date, signed_in, signed_out, status, api_key)
           VALUES ($1, $2, $3, $4, false, false, 'absent', $5)`,
          [s.uid, s.name, s.form, dateStr, s.api_key]
        );
      }
    }


     // 4. Fetch the school's time settings for sign-in/out
    const timeSettingsRes = await pool.query(
      `SELECT sign_in_start, sign_in_end, sign_out_start, sign_out_end
       FROM time_settings WHERE api_key = $1 LIMIT 1`,
      [student.api_key]
    );

    if (timeSettingsRes.rows.length === 0) {
      return res.status(400).json({
        message: getMessage(lang, 'timeSettings.notFound'),
        sign: 0
      });
    }

    const { sign_in_start, sign_in_end, sign_out_start, sign_out_end } = timeSettingsRes.rows[0];

  
    // Convert to Date objects
    const signInStart = new Date(`${dateStr}T${sign_in_start}`);
    const signInEnd = new Date(`${dateStr}T${sign_in_end}`);
    const signOutStart = new Date(`${dateStr}T${sign_out_start}`);
    const signOutEnd = new Date(`${dateStr}T${sign_out_end}`);

    // Allow 1-hour late sign-in
    const signInLateLimit = new Date(signInEnd);
    signInLateLimit.setHours(signInLateLimit.getHours() + 1);

    // Check if current time is valid for sign-in or sign-out
    const isOfficialSignIn = now >= signInStart && now <= signInEnd;
    const isLateSignIn = now > signInEnd && now <= signInLateLimit;
    const isSignOutTime = now >= signOutStart && now <= signOutEnd;

    // Outside allowed time check
    if (!isOfficialSignIn && !isLateSignIn && !isSignOutTime) {
      const outsideTime = {
        uid,
        device_uid,
        exists: true,
        name: student.name,
        timestamp: now,
        message: getMessage(lang, 'scan.outsideTime'),
        sign: 0,
        flag: getMessage(lang, 'scan.outsideFlag')
      };
      latestScans[device_uid] = outsideTime;
      return res.json(outsideTime);
    }

    // 4. Fetch today's attendance record
    const attendanceRes = await pool.query('SELECT * FROM attendance WHERE uid = $1 AND date = $2', [uid, dateStr]);
    const existing = attendanceRes.rows[0];
    let { sign_in_time, sign_out_time, signed_in, signed_out, punctuality } = existing;

    // 5. Handle sign-in
    if (!signed_in && (isOfficialSignIn || isLateSignIn)) {
      sign_in_time = now;
      signed_in = true;
      punctuality = isOfficialSignIn ? 'on_time' : 'late';
    }

    // 6. Handle sign-out
    if (isSignOutTime && !signed_out) {
      if (!signed_in) {
        // Prevent sign-out without signing in first
        const mustSignInFirst = {
          uid,
          device_uid,
          exists: true,
          name: student.name,
          timestamp: now,
          message: getMessage(lang, 'scan.signInFirst'),
          sign: 3,
          flag: getMessage(lang, 'scan.signInFlag')
        };
        latestScans[device_uid] = mustSignInFirst;
        return res.json(mustSignInFirst);
      }
      sign_out_time = now;
      signed_out = true;
    }

    // 7. Determine final attendance status
    let status = 'absent';
    if (signed_in && signed_out) status = 'present';
    else if (signed_in) status = 'partial';

    // 8. Update attendance record
    await pool.query(
      `UPDATE attendance
       SET sign_in_time = $1, sign_out_time = $2, signed_in = $3, signed_out = $4, status = $5, punctuality = $6
       WHERE id = $7`,
      [sign_in_time, sign_out_time, signed_in, signed_out, status, punctuality, existing.id]
    );

    // 9. Prepare response message
    const signedMessage = signed_in
      ? punctuality === 'on_time' ? getMessage(lang, 'scan.signedIn') : getMessage(lang, 'scan.late')
      : getMessage(lang, 'scan.signedOut');

    const scanSuccess = {
      uid,
      device_uid,
      exists: true,
      name: student.name,
      timestamp: now,
      message: signedMessage,
      sign: 1,
      flag: signedMessage
    };

    latestScans[device_uid] = scanSuccess;
    return res.json(scanSuccess);

  } catch (err) {
    console.error('❌ Error processing scan:', err.message);
    const errorResponse = {
      uid: req.body.uid || null,
      device_uid: req.body.device_uid || null,
      exists: false,
      timestamp: new Date(),
      message: getMessage(lang, 'scan.error'),
      error: err.message,
      sign: 0,
      flag: 'Error'
    };
    latestScans[device_uid || 'unknown'] = errorResponse;
    return res.status(500).json({
      message: getMessage(lang, 'scan.failed'),
      error: err.message,
      sign: 0
    });
  }
});

// GET /scan/queue
router.get('/queue', (req, res) => {
  const { device_uid } = req.query;
  const lang = req.headers['accept-language']?.toLowerCase().split(',')[0] || 'en';

  if (!device_uid) {
    return res.status(400).json({ error: getMessage(lang, 'scan.deviceRequired') });
  }

  const scan = latestScans[device_uid];
  if (scan) {
    delete latestScans[device_uid]; // clear after reading
    return res.json([scan]);
  }

  return res.json([]);
});

module.exports = router;
