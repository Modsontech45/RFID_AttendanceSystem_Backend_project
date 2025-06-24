const express = require('express');
const pool = require('../db');
const router = express.Router();

router.post('/', async (req, res) => {
  const { name, student_id, uid, email, telephone, form, gender, api_key } = req.body;

  // ✅ Validate required fields
  if (!name || !student_id || !uid || !email || !telephone || !form || !gender || !api_key) {
    return res.status(400).json({ message: 'All fields (including API key) are required.' });
  }

  try {
    // ✅ Check if API key is valid
    const adminRes = await pool.query('SELECT * FROM admins WHERE api_key = $1 AND verified = true', [api_key]);
    if (adminRes.rowCount === 0) {
      return res.status(403).json({ message: 'Invalid or unverified API key.' });
    }

    // ✅ Check if UID is already registered
    const existing = await pool.query('SELECT 1 FROM students WHERE uid = $1', [uid]);
    if (existing.rowCount > 0) {
      return res.status(409).json({ message: 'UID already registered.' });
    }

    // ✅ Insert new student
    await pool.query(
      `INSERT INTO students (name, student_id, uid, email, telephone, form, gender, api_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [name, student_id, uid, email, telephone, form, gender, api_key]
    );

    res.status(201).json({ message: 'Student registered successfully.', sign: 3 });
  } catch (err) {
    console.error('❌ Registration error:', err.message);
    res.status(500).json({ message: 'Registration failed.' });
  }
});

module.exports = router;
