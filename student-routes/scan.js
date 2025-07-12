const express = require('express');
const pool = require('../db');
const router = express.Router();
const getMessage = require('../utils/messages');

// Store latest scans per device_uid
const latestScans = {};

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
    const studentRes = await pool.query('SELECT * FROM students WHERE uid = $1', [uid]);

    if (studentRes.rows.length === 0) {
      latestScans[device_uid] = {
        uid,
        device_uid,
        exists: false,
        message: getMessage(lang, 'scan.uidNotRegistered'),
        timestamp: now,
        sign: 2,
        flag: getMessage(lang, 'scan.registerNow')
      };
      return res.json({
        message: getMessage(lang, 'scan.uidNotRegistered'),
        flag: getMessage(lang, 'scan.registerNow'),
        sign: 2
      });
    }

    const student = studentRes.rows[0];
    const dateStr = now.toISOString().slice(0, 10);
    const hour = now.getHours();

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

    const isSignInTime = hour >= 0 && hour < 10;
    const isSignOutTime = hour >= 11 && hour < 17;

    if (!isSignInTime && !isSignOutTime) {
      latestScans[device_uid] = {
        uid,
        device_uid,
        exists: true,
        name: student.name,
        timestamp: now,
        message: getMessage(lang, 'scan.outsideTime'),
        sign: 0,
        flag: getMessage(lang, 'scan.outsideFlag')
      };
      return res.json({
        message: getMessage(lang, 'scan.outsideTime'),
        flag: getMessage(lang, 'scan.outsideFlag'),
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
        latestScans[device_uid] = {
          uid,
          device_uid,
          exists: true,
          name: student.name,
          timestamp: now,
          message: getMessage(lang, 'scan.signInFirst'),
          sign: 3,
          flag: getMessage(lang, 'scan.signInFlag')
        };
        return res.json({
          message: getMessage(lang, 'scan.signInFirst'),
          flag: getMessage(lang, 'scan.signInFlag'),
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

    const signedMessage = isSignInTime
      ? getMessage(lang, 'scan.signedIn')
      : getMessage(lang, 'scan.signedOut');

    latestScans[device_uid] = {
      uid,
      device_uid,
      exists: true,
      name: student.name,
      timestamp: now,
      message: signedMessage,
      sign: 1,
      flag: signedMessage
    };

    return res.json({
      message: signedMessage,
      flag: signedMessage,
      sign: 1
    });

  } catch (err) {
    console.error('❌ Error processing scan:', err);
    latestScans[req.body.device_uid || 'unknown'] = {
      uid: req.body.uid || null,
      device_uid: req.body.device_uid || null,
      exists: false,
      timestamp: new Date(),
      message: getMessage(lang, 'scan.error'),
      error: err.message,
      sign: 0,
      flag: 'Error'
    };
    return res.status(500).json({
      message: getMessage(lang, 'scan.failed'),
      error: err.message,
      sign: 0
    });
  }
});

router.get('/queue', (req, res) => {
  const { device_uid } = req.query;
  const lang = req.headers['accept-language']?.toLowerCase().split(',')[0] || 'en';

  if (!device_uid) {
    return res.status(400).json({ error: getMessage(lang, 'scan.deviceRequired') });
  }

  const scan = latestScans[device_uid];
  if (scan) {
    delete latestScans[device_uid];
    return res.json([scan]);
  }

  return res.json([]);
});

module.exports = router;
