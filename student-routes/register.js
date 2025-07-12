const express = require('express');
const pool = require('../db');
const router = express.Router();
const getMessage = require('../utils/messages');

router.post('/', async (req, res) => {
  const { name, student_id, uid, email, telephone, form, gender, api_key } = req.body;
  const lang = req.headers['accept-language']?.toLowerCase().split(',')[0] || 'en';

  // ✅ Validate required fields
  if (!name || !student_id || !uid || !email || !telephone || !form || !gender || !api_key) {
    return res.status(400).json({ message: getMessage(lang, 'register.allFieldsRequired') });
  }

  try {
    // ✅ Check if API key is valid
    const adminRes = await pool.query(
      'SELECT * FROM admins WHERE api_key = $1 AND verified = true',
      [api_key]
    );
    if (adminRes.rowCount === 0) {
      return res.status(403).json({ message: getMessage(lang, 'register.invalidApiKey') });
    }

    // ✅ Check if UID is already registered
    const existing = await pool.query('SELECT 1 FROM students WHERE uid = $1', [uid]);
    if (existing.rowCount > 0) {
      return res.status(409).json({ message: getMessage(lang, 'register.uidExists') });
    }

    // ✅ Insert new student
    await pool.query(
      `INSERT INTO students (name, student_id, uid, email, telephone, form, gender, api_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [name, student_id, uid, email, telephone, form, gender, api_key]
    );

    res.status(201).json({ message: getMessage(lang, 'register.success'), sign: 3 });
  } catch (err) {
    console.error('❌ Registration error:', err.message);
    res.status(500).json({ message: getMessage(lang, 'register.failed') });
  }
});

module.exports = router;
