const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const getMessage = require('../utils/messages');
require('dotenv').config();

const router = express.Router();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

if (!process.env.JWT_SECRET) {
  console.error("❌ JWT_SECRET is missing in environment variables.");
  process.exit(1);
}

// ✅ Admin Signup
router.post('/signup', async (req, res) => {
  const { schoolname, username, email, password } = req.body;
  const lang = req.headers['accept-language']?.toLowerCase().split(',')[0] || 'en';

  // Validate required fields
  if (!schoolname || !username || !email || !password) {
    return res.status(400).json({ message: getMessage(lang, 'admin.requiredFields') });
  }

  try {
    // Check for existing email
    const existing = await pool.query('SELECT * FROM admins WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: getMessage(lang, 'admin.alreadyExists') });
    }

    // Generate credentials
    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const apiKey = crypto.randomBytes(32).toString('hex');

    // Insert new admin
    const result = await pool.query(
      `INSERT INTO admins (schoolname, username, email, password, api_key, verified, verification_token)
       VALUES ($1, $2, $3, $4, $5, false, $6) RETURNING *`,
      [schoolname, username, email, hashedPassword, apiKey, verificationToken]
    );

    // Create verification link
const verifyLink = `https://rfid-attendance-synctuario-theta.vercel.app/admin/verify?token=${encodeURIComponent(verificationToken)}`;


    // Email template
    const emailTemplate = `
      <div style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 20px;">
        <div style="background: white; padding: 20px; border-radius: 10px; max-width: 600px; margin: auto;">
          <h2>Welcome to ${schoolname}, ${username}</h2>
          <p>${getMessage(lang, 'admin.verifyInstruction')}</p>
          <a href="${verifyLink}" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
            ${getMessage(lang, 'admin.verifyEmail')}
          </a>
          <p style="margin-top: 20px;">${getMessage(lang, 'admin.ignoreEmail')}</p>
        </div>
      </div>
    `;

    // Send verification email
    await transporter.sendMail({
      from: '"Admin System" SYNCTUARIO',
      to: email,
      subject: getMessage(lang, 'admin.verifySubject'),
      html: emailTemplate,
    });

    // Respond to client
    res.status(201).json({
      message: getMessage(lang, 'admin.signupSuccess'),
      redirect: 'https://rfid-attendance-synctuario-theta.vercel.app/admin/email-sent',
    });

  } catch (err) {
    console.error('❌ Signup error:', err.message);
    res.status(500).json({ message: getMessage(lang, 'common.internalError'), error: err.message });
  }
});


// ✅ Email Verification
router.get('/verify/:token', async (req, res) => {
  const { token } = req.params;
  const lang = req.headers['accept-language']?.toLowerCase().split(',')[0] || 'en';

  try {
    const result = await pool.query(
      `UPDATE admins SET verified = true, verification_token = NULL
       WHERE verification_token = $1 RETURNING *`,
      [token]
    );

    if (result.rowCount === 0) {
      return res.status(400).json({ message: getMessage(lang, 'admin.invalidToken') });
    }

    res.json({ message: getMessage(lang, 'admin.verifiedSuccess') });

  } catch (err) {
    console.error('❌ Verification error:', err.message);
    res.status(500).json({ message: getMessage(lang, 'common.internalError'), error: err.message });
  }
});

// ✅ Admin Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
    if (!req.body) {
    return res.status(400).json({ error: true, message: 'Missing request body' });
  }
  const lang = req.headers['accept-language']?.toLowerCase().split(',')[0] || 'en';

  if (!email || !password) {
    return res.status(400).json({ message: getMessage(lang, 'admin.emailPasswordRequired') });
  }

  try {
    const result = await pool.query('SELECT * FROM admins WHERE email = $1', [email]);
    const admin = result.rows[0];

    if (!admin) {
      return res.status(401).json({ message: getMessage(lang, 'admin.invalidCredentials') });
    }

    if (!admin.verified) {
      return res.status(403).json({ message: getMessage(lang, 'admin.notVerified') });
    }

    const match = await bcrypt.compare(password, admin.password);
    if (!match) {
      return res.status(401).json({ message: getMessage(lang, 'admin.invalidCredentials') });
    }

    let apiKey = admin.api_key;
    if (!apiKey) {
      apiKey = crypto.randomBytes(32).toString('hex');
      await pool.query('UPDATE admins SET api_key = $1 WHERE id = $2', [apiKey, admin.id]);
    }

    const token = jwt.sign(
      { id: admin.id, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.status(200).json({
      message: getMessage(lang, 'admin.loginSuccess'),
      token,
      admin: {
        id: admin.id,
        schoolname: admin.schoolname,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        api_key: apiKey,
        created_at: admin.created_at,
      },
    });

  } catch (err) {
    console.error("❌ Error during admin login:", err.message);
    res.status(500).json({ message: getMessage(lang, 'common.internalError'), error: err.message });
  }
});

module.exports = router;
