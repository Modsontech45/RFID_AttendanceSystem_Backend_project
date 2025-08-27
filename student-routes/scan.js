const express = require('express');
const pool = require('../db'); // PostgreSQL connection pool
const router = express.Router();
const getMessage = require('../utils/messages'); // function for multilingual messages
const nodemailer = require("nodemailer");

// Setup nodemailer transporter for email notifications (currently not used)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

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
    // 1. Check if student exists in the database
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

    let student = studentRes.rows[0]; // student record
    const requestApiKey = req.headers['x-api-key'] || req.query.api_key || req.body.api_key;

    console.log("🔐 Incoming request:");
    console.log("→ device_uid:", device_uid);
    console.log("→ uid:", uid);
    console.log("→ API key from request:", requestApiKey);
    console.log("→ Student's API key in database:", student.api_key);

    // 2. Handle cross-school API key mismatch
    if (requestApiKey && requestApiKey !== student.api_key) {
      console.log("⚠️ API key mismatch detected. Checking if UID belongs to the requesting school...");

      // Check if UID exists under the requested API key (same UID, different school)
      const sameUidSameSchool = await pool.query(
        'SELECT * FROM students WHERE uid = $1 AND api_key = $2 LIMIT 1',
        [uid, requestApiKey]
      );

      if (sameUidSameSchool.rows.length > 0) {
        console.log("✅ UID found under the requesting API key. Proceeding with this student.");
        student = sameUidSameSchool.rows[0]; // override student to match API key
      } else {
        console.log("🚫 UID does not belong to the current school.");
        const schoolRes = await pool.query(
          'SELECT schoolname FROM admins WHERE api_key = $1 LIMIT 1',
          [student.api_key]
        );
        const otherSchool = schoolRes.rows[0]?.schoolname || 'another school';
        const mismatch = {
          message: getMessage(lang, 'scan.mismatch', otherSchool),
          student_uid: uid,
          device_uid,
          student_name: student.name,
          sign: 0,
          timestamp: now,
          flag: getMessage(lang, 'scan.mismatch', otherSchool)
        };
        console.log(`🚨 Cross-school access attempt: Student from "${otherSchool}" tried to sign in to a different school.`);
        return res.json(mismatch);
      }
    } else {
      console.log("✅ API key matches or no conflict detected.");
    }

    const dateStr = now.toISOString().slice(0, 10); // Get current date in YYYY-MM-DD

    // 3. Ensure daily attendance records exist for all students
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

    // 5. Compare current time with sign-in/out windows
    const nowStr = now.toTimeString().split(" ")[0]; // "HH:MM:SS"
    const isBetween = (start, end, current) => current >= start && current <= end;
    const isSignInTime = isBetween(sign_in_start, sign_in_end, nowStr);
    const isSignOutTime = isBetween(sign_out_start, sign_out_end, nowStr);

    // If student is outside both sign-in and sign-out times, allow sign-in within 1 hour after start
    if (!isSignInTime && !isSignOutTime) {
      const signInLimit = new Date(`${dateStr}T${sign_in_start}`);
      signInLimit.setHours(signInLimit.getHours() + 1); // 1 hour after official sign-in

      if (now > signInLimit) {
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
    }

    // 6. Fetch today's attendance record
    const attendanceRes = await pool.query('SELECT * FROM attendance WHERE uid = $1 AND date = $2', [uid, dateStr]);
    const existing = attendanceRes.rows[0];
    let { sign_in_time, sign_out_time, signed_in, signed_out, punctuality } = existing;

    // 7. Handle sign-in logic
    if (!signed_in) {
      sign_in_time = now;
      signed_in = true;

      // Determine punctuality: "on_time" if within official sign-in, "late" if within 1 hour after
      const signInDeadline = new Date(`${dateStr}T${sign_in_start}`);
      const signInLimit = new Date(signInDeadline);
      signInLimit.setHours(signInLimit.getHours() + 1);

      punctuality = now <= new Date(`${dateStr}T${sign_in_end}`) ? 'on_time' : (now <= signInLimit ? 'late' : 'late');
    }

    // 8. Handle sign-out logic
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
      // No leave early logic, punctuality is only for sign-in
    }

    // 9. Determine final attendance status
    let status = 'absent';
    if (signed_in && signed_out) status = 'present';
    else if (signed_in) status = 'partial';

    // 10. Update attendance record in the database
    await pool.query(
      `UPDATE attendance
       SET sign_in_time = $1, sign_out_time = $2, signed_in = $3, signed_out = $4, status = $5, punctuality = $6
       WHERE id = $7`,
      [sign_in_time, sign_out_time, signed_in, signed_out, status, punctuality, existing.id]
    );

    // 11. Prepare response message
    const signedMessage = signed_in ? getMessage(lang, 'scan.signedIn') : getMessage(lang, 'scan.signedOut');

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
    return res.status(400).json({
      error: getMessage(lang, 'scan.deviceRequired')
    });
  }

  const scan = latestScans[device_uid];
  if (scan) {
    delete latestScans[device_uid]; // clear queue after reading
    return res.json([scan]);
  }

  return res.json([]);
});

module.exports = router;
