const express = require('express');
const pool = require('../db');
const router = express.Router();







let latestScan = null;

router.post('/', async (req, res) => {
  const { uid } = req.body;
  const now = new Date();

  if (!uid) {
    latestScan = { uid: null, exists: false, message: 'UID is required.' };
    return res.status(400).json({ message: 'UID is required.', sign: 0 });
  }

  try {
    const studentRes = await pool.query('SELECT * FROM students WHERE uid = $1', [uid]);

    if (studentRes.rows.length === 0) {
      latestScan = {
        uid,
        exists: false,
        message: 'New UID - Registration required',
        timestamp: now,
      };
      return res.json({ message: 'New UID - Registration required', flag: 'Register now', sign: 2 });
    }

    const student = studentRes.rows[0];
    const dateStr = now.toISOString().slice(0, 10);
    const hour = now.getHours();

    // Check if attendance already initialized for today
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
      console.log('✅ Attendance initialized for all students:', dateStr);
    }

    const isSignInTime = hour >= 1 && hour < 8;
    const isSignOutTime = hour >= 14 && hour < 15;

    if (!isSignInTime && !isSignOutTime) {
      latestScan = {
        uid,
        exists: true,
        name: student.name,
        timestamp: now,
        message: 'Outside allowed sign-in/sign-out time',
      };
      return res.json({ message: 'Outside allowed sign-in/sign-out time', flag: 'Outside Time', sign: 0 });
    }

    // Get attendance record for this uid and date
    const attendanceRes = await pool.query(
      'SELECT * FROM attendance WHERE uid = $1 AND date = $2',
      [uid, dateStr]
    );

    const existing = attendanceRes.rows[0];
    let { sign_in_time, sign_out_time, signed_in, signed_out } = existing;

    if (isSignInTime && !signed_in) {
      sign_in_time = now;
      signed_in = true;
    }

    if (isSignOutTime && !signed_out) {
      if (!signed_in) {
        latestScan = {
          uid,
          exists: true,
          name: student.name,
          timestamp: now,
          message: 'Sign-in required before sign-out',
        };
        return res.json({ message: 'Sign-in required before sign-out', flag: 'SignIn 1st', sign: 3 });
      }
      sign_out_time = now;
      signed_out = true;
    }

    let status = 'absent';
    if (signed_in && signed_out) {
      status = 'present';
    } else if (signed_in) {
      status = 'partial';
    }

    await pool.query(
      `UPDATE attendance
       SET sign_in_time = $1, sign_out_time = $2, signed_in = $3, signed_out = $4, status = $5
       WHERE id = $6`,
      [sign_in_time, sign_out_time, signed_in, signed_out, status, existing.id]
    );

    latestScan = {
      uid,
      exists: true,
      name: student.name,
      timestamp: now,
      message: isSignInTime ? 'Signed in' : 'Signed out',
    };

    return res.json({
      message: isSignInTime ? 'Signed in' : 'Signed out',
      flag: isSignInTime ? 'Signed In' : 'Signed Out',
      sign: 1,
    });

  } catch (err) {
    console.error('❌ Error processing scan:', err.message);
    latestScan = {
      uid,
      exists: false,
      message: 'Error during scan processing',
      error: err.message,
    };
    return res.status(500).json({ message: 'Scan failed', error: err.message, sign: 0 });
  }
});



router.get('/queue', (req, res) => {
  if (latestScan) {
    const scan = latestScan;
    latestScan = null; // Clear after one-time fetch
    return res.json([scan]);
  }
  return res.json([]);
});

module.exports = router;
