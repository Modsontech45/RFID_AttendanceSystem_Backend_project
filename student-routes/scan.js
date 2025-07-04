const express = require('express');
const pool = require('../db');
const router = express.Router();

// Store latest scans per device_uid
const latestScans = {};

// POST /api/scan
router.post('/', async (req, res) => {
  const { uid, device_uid } = req.body;
  const now = new Date();

  if (!uid || !device_uid) {
    console.warn(`[POST /api/scan] Missing uid or device_uid:`, req.body);
    return res.status(400).json({ message: 'uid and device_uid are required.', sign: 0 });
  }

  try {
    console.log(`[POST /api/scan] Received scan from device_uid=${device_uid}, uid=${uid}`);

    const studentRes = await pool.query('SELECT * FROM students WHERE uid = $1', [uid]);

    if (studentRes.rows.length === 0) {
      console.log(`[POST /api/scan] UID not registered: ${uid}`);
      latestScans[device_uid] = {
        uid,
        device_uid,
        exists: false,
        message: 'New UID - Registration required',
        timestamp: now,
        sign: 2,
        flag: 'Register now',
      };
      return res.json({
        message: 'New UID - Registration required',
        flag: 'Register now',
        sign: 2,
      });
    }

    const student = studentRes.rows[0];
    const dateStr = now.toISOString().slice(0, 10);
    const hour = now.getHours();

    // Initialize attendance if not done
    const attendanceCheck = await pool.query('SELECT COUNT(*) FROM attendance WHERE date = $1', [dateStr]);

    if (parseInt(attendanceCheck.rows[0].count) === 0) {
      console.log(`[POST /api/scan] Initializing attendance for date ${dateStr}`);
      const allStudents = await pool.query('SELECT uid, name, form, api_key FROM students');
      for (const s of allStudents.rows) {
        await pool.query(
          `INSERT INTO attendance (uid, name, form, date, signed_in, signed_out, status, api_key)
           VALUES ($1, $2, $3, $4, false, false, 'absent', $5)`,
          [s.uid, s.name, s.form, dateStr, s.api_key]
        );
      }
      console.log('✅ Attendance initialized for:', dateStr);
    }

    const isSignInTime = hour >= 0 && hour < 10;
    const isSignOutTime = hour >= 11 && hour < 17;

    if (!isSignInTime && !isSignOutTime) {
      console.log(`[POST /api/scan] Scan outside allowed time for uid=${uid}, device_uid=${device_uid}`);
      latestScans[device_uid] = {
        uid,
        device_uid,
        exists: true,
        name: student.name,
        timestamp: now,
        message: 'Outside allowed sign-in/sign-out time',
        sign: 0,
        flag: 'Outside Time',
      };
      return res.json({ message: 'Outside allowed sign-in/sign-out time', flag: 'Outside Time', sign: 0 });
    }

    const attendanceRes = await pool.query(
      'SELECT * FROM attendance WHERE uid = $1 AND date = $2',
      [uid, dateStr]
    );

    const existing = attendanceRes.rows[0];
    let { sign_in_time, sign_out_time, signed_in, signed_out } = existing;

    if (isSignInTime && !signed_in) {
      sign_in_time = now;
      signed_in = true;
      console.log(`[POST /api/scan] User signed in: uid=${uid}, device_uid=${device_uid}`);
    }

    if (isSignOutTime && !signed_out) {
      if (!signed_in) {
        console.log(`[POST /api/scan] Sign-out attempted before sign-in for uid=${uid}`);
        latestScans[device_uid] = {
          uid,
          device_uid,
          exists: true,
          name: student.name,
          timestamp: now,
          message: 'Sign-in required before sign-out',
          sign: 3,
          flag: 'SignIn 1st',
        };
        return res.json({ message: 'Sign-in required before sign-out', flag: 'SignIn 1st', sign: 3 });
      }
      sign_out_time = now;
      signed_out = true;
      console.log(`[POST /api/scan] User signed out: uid=${uid}, device_uid=${device_uid}`);
    }

    let status = 'absent';
    if (signed_in && signed_out) status = 'present';
    else if (signed_in) status = 'partial';

    await pool.query(
      `UPDATE attendance
       SET sign_in_time = $1, sign_out_time = $2, signed_in = $3, signed_out = $4, status = $5
       WHERE id = $6`,
      [sign_in_time, sign_out_time, signed_in, signed_out, status, existing.id]
    );

    latestScans[device_uid] = {
      uid,
      device_uid,
      exists: true,
      name: student.name,
      timestamp: now,
      message: isSignInTime ? 'Signed in' : 'Signed out',
      sign: 1,
      flag: isSignInTime ? 'Signed In' : 'Signed Out',
    };

    return res.json({
      message: isSignInTime ? 'Signed in' : 'Signed out',
      flag: isSignInTime ? 'Signed In' : 'Signed Out',
      sign: 1,
    });

  } catch (err) {
    console.error('❌ Error processing scan:', err);
    latestScans[req.body.device_uid || 'unknown'] = {
      uid: req.body.uid || null,
      device_uid: req.body.device_uid || null,
      exists: false,
      timestamp: new Date(),
      message: 'Error during scan processing',
      error: err.message,
      sign: 0,
      flag: 'Error',
    };
    return res.status(500).json({ message: 'Scan failed', error: err.message, sign: 0 });
  }
});

// GET /api/scan/queue?device_uid=abc123
router.get('/queue', (req, res) => {
  const { device_uid } = req.query;

  if (!device_uid) {
    console.warn('[GET /api/scan/queue] Missing device_uid in query');
    return res.status(400).json({ error: 'device_uid is required' });
  }

  console.log(`[GET /api/scan/queue] Polling scan for device_uid=${device_uid}`);

  const scan = latestScans[device_uid];
  if (scan) {
    console.log(`[GET /api/scan/queue] Returning scan for device_uid=${device_uid}`, scan);
    delete latestScans[device_uid];
    return res.json([scan]);
  }

  console.log(`[GET /api/scan/queue] No scan found for device_uid=${device_uid}`);
  return res.json([]);
});

module.exports = router;
