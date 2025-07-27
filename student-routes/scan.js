const express = require('express');
const pool = require('../db');
const router = express.Router();
const getMessage = require('../utils/messages');

const latestScans = {};

// POST /scan
router.post('/', async (req, res) => {
  const { uid, device_uid } = req.body;
  const lang = req.headers['accept-language']?.toLowerCase().split(',')[0] || 'en';
  const now = new Date();

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
const requestApiKey = req.headers['x-api-key'] || req.query.api_key || req.body.api_key;

console.log("🔐 Incoming request:");
console.log("→ device_uid:", device_uid);
console.log("→ uid:", uid);
console.log("→ API key from request:", requestApiKey);
console.log("→ Student's API key in database:", student.api_key);

// If API keys don't match, investigate deeper
if (requestApiKey && requestApiKey !== student.api_key) {
  console.log("⚠️ API key mismatch detected. Checking if UID belongs to the requesting school...");

  // Check if UID exists under the requesting API key (same UID in different school)
  const sameUidSameSchool = await pool.query(
    'SELECT * FROM students WHERE uid = $1 AND api_key = $2 LIMIT 1',
    [uid, requestApiKey]
  );

  if (sameUidSameSchool.rows.length > 0) {
    console.log("✅ UID found under the requesting API key. Proceeding with this student.");

    // Override student to match the school associated with the current request
    student = sameUidSameSchool.rows[0];
  } else {
    console.log("🚫 UID does not belong to the current school.");

    const schoolRes = await pool.query(
      'SELECT schoolname FROM admins WHERE api_key = $1 LIMIT 1',
      [student.api_key]
    );
    const otherSchool = schoolRes.rows[0]?.schoolname || 'another school';
    const mismatch = {
       message:getMessage(lang, 'scan.mismatch',otherSchool),
      student_uid: uid,
      device_uid,
      student_name: student.name,
      sign: 0,
      timestamp: new Date(),
      flag: getMessage(lang, 'scan.mismatch',otherSchool)

    }
    console.log(`🚨 Cross-school access attempt: Student from "${otherSchool}" tried to sign in to a different school.`);
      console.log(mismatch)
    return res.json(mismatch);
   
  }
} else {
  console.log("✅ API key matches or no conflict detected.");
}


    const dateStr = now.toISOString().slice(0, 10);

    // 2. Ensure daily attendance records exist
    const attendanceCheck = await pool.query(
      'SELECT COUNT(*) FROM attendance WHERE date = $1',
      [dateStr]
    );

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

    // 3. Fetch time settings
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

    const {
      sign_in_start,
      sign_in_end,
      sign_out_start,
      sign_out_end
    } = timeSettingsRes.rows[0];

    // 4. Compare current time with sign-in/out windows
    const nowStr = now.toTimeString().split(" ")[0]; // "HH:MM:SS"
    const isBetween = (start, end, current) => current >= start && current <= end;

    const isSignInTime = isBetween(sign_in_start, sign_in_end, nowStr);
    const isSignOutTime = isBetween(sign_out_start, sign_out_end, nowStr);

    if (!isSignInTime && !isSignOutTime) {
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

    // 5. Fetch today's attendance record
    const attendanceRes = await pool.query(
      'SELECT * FROM attendance WHERE uid = $1 AND date = $2',
      [uid, dateStr]
    );

    const existing = attendanceRes.rows[0];
    let { sign_in_time, sign_out_time, signed_in, signed_out } = existing;

    // 6. Handle sign-in
    if (isSignInTime && !signed_in) {
      sign_in_time = now;
      signed_in = true;
    }

    // 7. Handle sign-out
    if (isSignOutTime && !signed_out) {
      if (!signed_in) {
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

    // 8. Determine final status
    let status = 'absent';
    if (signed_in && signed_out) status = 'present';
    else if (signed_in) status = 'partial';

    await pool.query(
      `UPDATE attendance
       SET sign_in_time = $1, sign_out_time = $2, signed_in = $3, signed_out = $4, status = $5
       WHERE id = $6`,
      [sign_in_time, sign_out_time, signed_in, signed_out, status, existing.id]
    );

    const signedMessage = isSignInTime
      ? getMessage(lang, 'scan.signedIn')
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
    return res.status(400).json({
      error: getMessage(lang, 'scan.deviceRequired')
    });
  }

  const scan = latestScans[device_uid];
  if (scan) {
    delete latestScans[device_uid];
    return res.json([scan]);
  }

  return res.json([]);
});

module.exports = router;
