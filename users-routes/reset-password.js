const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendResetEmail = async (email, token) => {
  const resetLink = `https://rfid-attendance-synctuario-theta.vercel.app/admin/reset-password?token=${encodeURIComponent(token)}`;

  const mailOptions = {
    from: `"Synctuario Support" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Reset Your Password',
    html: `
      <p>You requested a password reset.</p>
      <p><a href="${resetLink}">Click here to reset your password.</a></p>
      <p><strong>This link will expire in 15 minutes.</strong></p>
    `,
  };

  await transporter.sendMail(mailOptions);
};

// ✅ Request password reset
router.post('/request-reset', async (req, res) => {
  const { email } = req.body;

  try {
    const { rows } = await pool.query('SELECT * FROM admins WHERE email = $1', [email]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Admin not found.' });
    }

    const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '15m' });
    await sendResetEmail(email, token);
    res.json({ message: 'Password reset email sent.' });
  } catch (err) {
    console.error('Reset error:', err);
    res.status(500).json({ message: 'An internal error occurred.' });
  }
});

// ✅ Perform password reset
router.post('/reset-password/:token', async (req, res) => {
  const { token } = req.params;
  const { newPassword } = req.body;

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const email = decoded.email;

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const result = await pool.query(
      'UPDATE admins SET password = $1 WHERE email = $2',
      [hashedPassword, email]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Admin not found.' });
    }

    res.json({ success: true, message: 'Password successfully reset.' });
  } catch (err) {
    console.error('Token error:', err);
    res.status(400).json({ success: false, message: 'Invalid or expired token.' });
  }
});

module.exports = router;
