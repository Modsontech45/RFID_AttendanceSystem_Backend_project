const express = require('express');
const pool = require('../db');
const router = express.Router();

let latestScan = null;

router.post('/', async (req, res) => {
  const { uid } = req.body;
  const now = new Date();

  if (!uid) {
    return res.status(400).json({ message: 'UID is required.' });
  }

  try {
    const studentRes = await pool.query('SELECT * FROM students WHERE uid = $1', [uid]);

    if (studentRes.rows.length === 0) {
      latestScan = {
        uid,
        exists: false,
        message: 'New UID - Registration required',
      };
      return res.json({ message: 'Scan processed', flag:'Register now', sign:2 });
    }

    const student = studentRes.rows[0];
    const dateStr = now.toISOString().slice(0, 10);
    const hour = now.getHours();

    // ✅ Ensure attendance is initialized for all students once a day
    const attendanceCheck = await pool.query('SELECT COUNT(*) FROM attendance WHERE date = $1', [dateStr]);
    if (parseInt(attendanceCheck.rows[0].count) === 0) {
      const allStudents = await pool.query('SELECT uid, name, form FROM students');
      for (const s of allStudents.rows) {
        await pool.query(
          `INSERT INTO attendance (uid, name, form, date, signed_in, signed_out, status)
           VALUES ($1, $2, $3, $4, false, false, 'absent')`,
          [s.uid, s.name, s.form, dateStr]
        );
      }
      console.log('Attendance initialized for all students for date:', dateStr);
    }

    const isSignInTime = hour >= 12 && hour < 21;
    const isSignOutTime = hour >= 22 && hour < 24;

    if (!isSignInTime && !isSignOutTime) {
      latestScan = {
        uid,
        exists: true,
        name: student.name,
        timestamp: now,
        message: 'Outside allowed sign-in/sign-out time',
      };
      return res.json({ message: 'Sign-in required before sign-out', flag: 'Outside Time', sign:0 });

    }

    const attendanceRes = await pool.query(
      'SELECT * FROM attendance WHERE uid = $1 AND date = $2',
      [uid, dateStr]
    );

    const existing = attendanceRes.rows[0];
    let updated_sign_in_time = existing.sign_in_time;
    let updated_sign_out_time = existing.sign_out_time;
    let updated_signed_in = existing.signed_in;
    let updated_signed_out = existing.signed_out;

    if (isSignInTime && !existing.signed_in) {
      updated_sign_in_time = now;
      updated_signed_in = true;
    }

    if (isSignOutTime && !existing.signed_out) {
      if (!existing.signed_in) {
        return res.json({ message: 'Sign-in required before sign-out' ,flag: 'SignIn 1st', sign: 3});
      }
      updated_sign_out_time = now;
      updated_signed_out = true;
    }
let updated_status = 'absent';
    if (updated_signed_in && updated_signed_out) {
  updated_status = 'present';
    } else if (updated_signed_in && !updated_signed_out) {
  updated_status = 'partial';
    }

    await pool.query(
      `UPDATE attendance
       SET sign_in_time = $1, sign_out_time = $2, signed_in = $3, signed_out = $4, status = $5
       WHERE id = $6`,
      [
        updated_sign_in_time,
        updated_sign_out_time,
        updated_signed_in,
        updated_signed_out,
        updated_status,
        existing.id
      ]
    );

    latestScan = {
      uid,
      exists: true,
      name: student.name,
      timestamp: now,
      message: isSignInTime ? 'Signed in' : 'Signed out',
    };

    res.json({ message: isSignInTime ? 'Signed in' : 'Signed out', sign:1 });

  } catch (err) {
    console.error('Error processing scan:', err.message);
    res.status(500).json({ message: 'Scan failed', sign: 0 });
  }
});



router.get('/queue', (req, res) => {
  if (latestScan) {
    const scan = latestScan;
    latestScan = null; // Clear the scan after sending once
    return res.json([scan]);
  }
  return res.json([]);
});

module.exports = router;




// ✅ Admin Signup Route
router.post('/signup', async (req, res) => {
  const { firstname, lastname, email, password } = req.body;

  if (!firstname || !lastname || !email || !password) {
    console.log("❌ Signup failed: Missing fields");
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    const existing = await pool.query('SELECT * FROM admins WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      console.log(`⚠️ Admin already exists: ${email}`);
      return res.status(409).json({ message: 'Admin already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO admins (firstname, lastname, email, password) VALUES ($1, $2, $3, $4) RETURNING *',
      [firstname, lastname, email, hashedPassword]
    );

    const newAdmin = result.rows[0];
    console.log(`✅ Admin created: ${newAdmin.email}`);
    res.status(201).json({ message: 'Admin created successfully', admin: newAdmin });

  } catch (err) {
    console.error("❌ Error during admin signup:", err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});