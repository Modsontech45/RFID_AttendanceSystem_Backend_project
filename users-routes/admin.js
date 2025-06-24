const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
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
  const { firstname, lastname, email, password } = req.body;

  if (!firstname || !lastname || !email || !password) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    const existing = await pool.query('SELECT * FROM admins WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'Admin already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const apiKey = crypto.randomBytes(32).toString('hex'); // ✅ Generate API Key

    const result = await pool.query(
      `INSERT INTO admins (firstname, lastname, email, password, api_key, verified, verification_token)
       VALUES ($1, $2, $3, $4, $5, false, $6) RETURNING *`,
      [firstname, lastname, email, hashedPassword, apiKey, verificationToken]
    );

    const verifyLink = `https://rfid-attendance-synctuario-theta.vercel.app/pages/users/reset/verify.html?token=${encodeURIComponent(verificationToken)}`;

    const emailTemplate = `
      <div style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 20px;">
        <div style="background: white; padding: 20px; border-radius: 10px; max-width: 600px; margin: auto;">
          <h2>Hello ${firstname},</h2>
          <p>Thank you for signing up. Please click the button below to verify your email:</p>
          <a href="${verifyLink}" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verify Email</a>
          <p style="margin-top: 20px;">If you didn’t sign up, you can safely ignore this email.</p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: '"Admin System" SYNCTUARIO',
      to: email,
      subject: 'Verify Your Email Address',
      html: emailTemplate,
    });

    console.log(`✅ Signup success. Verification email sent to: ${email}`);
    res.status(201).json({
      message: 'Admin created. Please check your email to verify your account.',
      redirect: '/pages/users/reset/email-sent.html',
    });

  } catch (err) {
    console.error('❌ Signup error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ✅ Email Verification
router.get('/verify/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const result = await pool.query(
      `UPDATE admins SET verified = true, verification_token = NULL
       WHERE verification_token = $1 RETURNING *`,
      [token]
    );

    if (result.rowCount === 0) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    console.log(`✅ Email verified for: ${result.rows[0].email}`);
    res.json({ message: 'Email verified successfully. You can now log in.' });

  } catch (err) {
    console.error('❌ Verification error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ✅ Admin Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const result = await pool.query('SELECT * FROM admins WHERE email = $1', [email]);
    const admin = result.rows[0];

    if (!admin) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!admin.verified) {
      return res.status(403).json({ message: 'Please verify your email before logging in.' });
    }

    const match = await bcrypt.compare(password, admin.password);
    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // ✅ Ensure API key exists
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

    console.log(`✅ Admin logged in: ${email}`);
    res.status(200).json({
      message: 'Login successful',
      token,
      admin: {
        id: admin.id,
        firstname: admin.firstname,
        lastname: admin.lastname,
        email: admin.email,
        role: admin.role,
        api_key: apiKey,
        created_at: admin.created_at,
      },
    });

  } catch (err) {
    console.error("❌ Error during admin login:", err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
