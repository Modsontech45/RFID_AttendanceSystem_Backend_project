const express = require('express');
const pool = require('../db');
const router = express.Router();

// POST /api/scan
router.post('/', async (req, res) => {
  const { uid, device_uid, api_key } = req.body;
  const now = new Date();

  if (!uid || !device_uid || !api_key) {
    return res.status(400).json({ message: 'Missing uid, device_uid, or api_key.', sign: 0 });
  }

  try {
    // 1. Ensure device is registered
    const deviceRes = await pool.query(
      'SELECT * FROM devices WHERE device_uid = $1 AND api_key = $2',
      [device_uid, api_key]
    );
    if (deviceRes.rowCount === 0) {
      return res.status(403).json({
        message: 'Unregistered device',
        flag: device_uid,
        sign: 0
      });
    }

    // 2. Check if UID is a registered student
    const studentRes = await pool.query(
      'SELECT * FROM students WHERE uid = $1 AND api_key = $2',
      [uid, api_key]
    );

    // 3. If student not found, add to pending_scans
    if (studentRes.rowCount === 0) {
      const exists = await pool.query(
        'SELECT 1 FROM pending_scans WHERE uid = $1 AND device_uid = $2 AND api_key = $3',
        [uid, device_uid, api_key]
      );

      if (exists.rowCount === 0) {
        await pool.query(
          'INSERT INTO pending_scans (uid, device_uid, api_key) VALUES ($1, $2, $3)',
          [uid, device_uid, api_key]
        );
      }

      return res.status(200).json({
        message: 'New UID - Registration required',
        flag: 'Register now',
        sign: 2
      });
    }

    const student = studentRes.rows[0];
    const dateStr = now.toISOString().slice(0, 10);
    const hour = now.getHours();

    // 4. Auto-create attendance records if none exist for today
    const attCountRes = await pool.query('SELECT COUNT(*) FROM attendance WHERE date = $1 AND api_key = $2', [dateStr, api_key]);
    if (parseInt(attCountRes.rows[0].count) === 0) {
      const students = await pool.query('SELECT uid, name, form, api_key FROM students WHERE api_key = $1', [api_key]);
      for (const s of students.rows) {
        await pool.query(
          `INSERT INTO attendance (uid, name, form, date, signed_in, signed_out, status, api_key)
           VALUES ($1, $2, $3, $4, false, false, 'absent', $5)`,
          [s.uid, s.name, s.form, dateStr, s.api_key]
        );
      }
    }

    // 5. Time-based check
    const isSignInTime = hour >= 17 && hour < 19;
    const isSignOutTime = hour >= 20 && hour < 22;

    if (!isSignInTime && !isSignOutTime) {
      return res.status(200).json({
        message: 'Outside allowed time',
        flag: 'Invalid time',
        sign: 0
      });
    }

    // 6. Proceed to update attendance
    const attendanceRes = await pool.query(
      'SELECT * FROM attendance WHERE uid = $1 AND date = $2 AND api_key = $3',
      [uid, dateStr, api_key]
    );

    if (attendanceRes.rowCount === 0) {
      return res.status(500).json({
        message: 'Attendance record missing',
        sign: 0
      });
    }

    const record = attendanceRes.rows[0];
    let { sign_in_time, sign_out_time, signed_in, signed_out } = record;

    if (isSignInTime && !signed_in) {
      sign_in_time = now;
      signed_in = true;
    }

    if (isSignOutTime && !signed_out) {
      if (!signed_in) {
        return res.status(200).json({
          message: 'Sign-in first',
          flag: 'Missing sign-in',
          sign: 3
        });
      }
      sign_out_time = now;
      signed_out = true;
    }

    const status = signed_in && signed_out ? 'present' : signed_in ? 'partial' : 'absent';

    await pool.query(
      `UPDATE attendance
       SET sign_in_time = $1, sign_out_time = $2, signed_in = $3, signed_out = $4, status = $5
       WHERE id = $6`,
      [sign_in_time, sign_out_time, signed_in, signed_out, status, record.id]
    );

    return res.status(200).json({
      message: isSignInTime ? 'Signed in' : 'Signed out',
      flag: isSignInTime ? 'Signed In' : 'Signed Out',
      sign: 1
    });

  } catch (err) {
    console.error('❌ Error processing scan:', err.message);
    return res.status(500).json({ message: 'Server error', sign: 0 });
  }
});

// GET /api/pending-scans
router.get('/pending-scans', async (req, res) => {
  const { api_key } = req.query;
  if (!api_key) return res.status(400).json({ error: 'api_key required' });

  try {
    const scans = await pool.query(
      'SELECT * FROM pending_scans WHERE api_key = $1 ORDER BY scanned_at DESC',
      [api_key]
    );
    return res.json(scans.rows);
  } catch (err) {
    console.error('❌ Error fetching pending scans:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve pending scans' });
  }
});

module.exports = router;
