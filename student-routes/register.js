const express = require('express');
const pool = require('../db');
const router = express.Router();

router.post('/', async (req, res) => {
  const { name, student_id, uid, email, telephone, form, gender } = req.body;
  if (!name || !student_id || !uid || !email || !telephone || !form || !gender) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  try {
    const existing = await pool.query('SELECT * FROM students WHERE uid = $1', [uid]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'UID already registered' });
    }

    await pool.query(
      `INSERT INTO students (name, student_id, uid, email, telephone, form, gender)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [name, student_id, uid, email, telephone, form, gender]
    );

    res.json({ message: 'Student registered successfully.', sign: 3 });
  } catch (err) {
    console.error('Registration error:', err.message);
    res.status(500).json({ message: 'Registration failed.' });
  }
});

module.exports = router;
