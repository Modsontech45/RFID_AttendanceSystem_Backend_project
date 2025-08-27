const express = require('express');
const pool = require('../db');
const router = express.Router();
const getMessage = require('../utils/messages');
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const latestScans = {};

// Helper: convert HH:MM:SS → seconds
const toSeconds = (t) => {
  const [h, m, s] = t.split(":").map(Number);
  return h * 3600 + m * 60 + s;
};

// Helper: punctuality checker
const getPunctuality = (now, start, end, type) => {
  const nowStr = now.toTimeString().split(" ")[0];
  const nowSec = toSeconds(nowStr);
  const startSec = toSeconds(start);
  const endSec = toSeconds(end);
  const gracePeriodSec = 60 * 60; // 1 hour

  if (type === "sign_in") {
    if (nowSec >= startSec && nowSec <= endSec) return "on_time";
    if (nowSec > endSec && nowSec <= startSec + gracePeriodSec) return "late";
    return null;
  }

  if (type === "sign_out") {
    if (nowSec < startSec) return "leave_early";
    if (nowSec >= startSec && nowSec <= endSec) return "on_time";
    return null;
  }

  return null;
};

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

    let student = studentRes.rows[0];
    const requestApiKey = req.headers['x-api-key'] || req.query.api_key || req.body.api_key;

    // API key validation
    if (requestApiKey && requestApiKey !== student.api_key) {
      const sameUidSameSchool = await pool.query(
        'SELECT * FROM students WHERE uid = $1 AND api_key = $2 LIMIT 1',
        [uid, requestApiKey]
      );

      if (sameUidSameSchool.rows.length > 0) {
        student = sameUidSameSchool.rows[0];
      } else {
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
          timestamp: new Date(),
          flag: getMessage(lang, 'scan.mismatch', otherSchool)
        };
        return res.json(mismatch);
      }
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

    const { sign_in_start, sign_in_end, sign_out_start, sign_out_end } = timeSettingsRes.rows[0];

    // 4. Fetch today's attendance record
    const attendanceRes = await pool.query(
      'SELECT * FROM attendance WHERE uid = $1 AND date = $2',
      [uid, dateStr]
    );

    const existing = attendanceRes.rows[0];
    let { sign_in_time, sign_out_time, signed_in, signed_out, punctuality } = existing;

    // 5. Handle sign-in
    if (!signed_in) {
      const punctualityResult = getPunctuality(now, sign_in_start, sign_in_end, "sign_in");
      if (punctualityResult) {
        sign_in_time = now;
        punctuality = punctualityResult;
        signed_in = true;
      } else {
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

    // 6. Handle sign-out
    if (!signed_out) {
      const punctualityResult = getPunctuality(now, sign_out_start, sign_out_end, "sign_out");
      if (punctualityResult) {
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
        punctuality = punctualityResult;
      }
    }

    // 7. Determine final status
    let status = 'absent';
    if (signed_in && signed_out) status = 'present';
    else if (signed_in) status = 'partial';

    await pool.query(
      `UPDATE attendance
       SET sign_in_time = $1, sign_out_time = $2, signed_in = $3, signed_out = $4, status = $5, punctuality = $6
       WHERE id = $7`,
      [sign_in_time, sign_out_time, signed_in, signed_out, status, punctuality, existing.id]
    );

    let signedMessage = "";
    if (signed_in && !signed_out) {
      signedMessage = punctuality === "late" ? getMessage(lang, 'scan.late') : getMessage(lang, 'scan.signedIn');
    } else if (signed_out) {
      signedMessage = punctuality === "leave_early" ? getMessage(lang, 'scan.leaveEarly') : getMessage(lang, 'scan.signedOut');
    }

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
