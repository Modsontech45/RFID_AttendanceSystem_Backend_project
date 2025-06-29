const express = require('express');
const pool = require('../db');
const router = express.Router();

// POST /scans
router.post('/', async (req, res) => {
  const { uid, device_uid, api_key } = req.body;
  const now = new Date();

  if (!uid || !device_uid || !api_key) {
    return res.status(400).json({ message: 'Missing uid, device_uid, or api_key.', sign: 0 });
  }

  try {
    // Check if UID belongs to a registered student
    const studentRes = await pool.query(
      'SELECT * FROM students WHERE uid = $1 AND api_key = $2',
      [uid, api_key]
    );

    // If not found, add to pending_scans
    if (studentRes.rows.length === 0) {
      const existingPending = await pool.query(
        'SELECT * FROM pending_scans WHERE uid = $1 AND device_uid = $2 AND api_key = $3',
        [uid, device_uid, api_key]
      );

      if (existingPending.rows.length === 0) {
        await pool.query(
          `INSERT INTO pending_scans (uid, device_uid, api_key)
           VALUES ($1, $2, $3)`,
          [uid, device_uid, api_key]
        );
      }

      return res.json({
        message: 'New UID - Registration required',
        flag: 'Register now',
        sign: 2
      });
    }

    // Attendance logic
    const student = studentRes.rows[0];
    const dateStr = now.toISOString().slice(0, 10);
    const hour = now.getHours();

    const attendanceCheck = await pool.query(
      'SELECT COUNT(*) FROM attendance WHERE date = $1',
      [dateStr]
    );

    if (parseInt(attendanceCheck.rows[0].count) === 0) {
      const allStudents = await pool.query(
        'SELECT uid, name, form, api_key FROM students'
      );

      for (const s of allStudents.rows) {
        await pool.query(
          `INSERT INTO attendance (uid, name, form, date, signed_in, signed_out, status, api_key)
           VALUES ($1, $2, $3, $4, false, false, 'absent', $5)`,
          [s.uid, s.name, s.form, dateStr, s.api_key]
        );
      }
    }

    const isSignInTime = hour >= 17 && hour < 19;
    const isSignOutTime = hour >= 20 && hour < 22;

    if (!isSignInTime && !isSignOutTime) {
      return res.json({
        message: 'Outside allowed sign-in/sign-out time',
        flag: 'Outside Time',
        sign: 0
      });
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
    }

    if (isSignOutTime && !signed_out) {
      if (!signed_in) {
        return res.json({
          message: 'Sign-in required before sign-out',
          flag: 'SignIn 1st',
          sign: 3
        });
      }
      sign_out_time = now;
      signed_out = true;
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

    return res.json({
      message: isSignInTime ? 'Signed in' : 'Signed out',
      flag: isSignInTime ? 'Signed In' : 'Signed Out',
      sign: 1
    });

  } catch (err) {
    console.error('❌ Error processing scan:', err.message);
    return res.status(500).json({ message: 'Scan failed', error: err.message, sign: 0 });
  }
});

// GET /pending-scans
router.get('/pending-scans', async (req, res) => {
  const { api_key } = req.query;
  if (!api_key) return res.status(400).json({ error: 'api_key required' });

  try {
    const scans = await pool.query(
      `SELECT * FROM pending_scans WHERE api_key = $1 ORDER BY scanned_at DESC`,
      [api_key]
    );

    res.json(scans.rows);
  } catch (err) {
    console.error("❌ Error fetching pending scans:", err.message);
    res.status(500).json({ error: "Failed to retrieve scans." });
  }
});

// 👇 Export this router
module.exports = router;
