const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db'); // PostgreSQL connection
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');


const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

// Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'tandemodson41@gmail.com',
    pass: 'akpfigxajjzpqmzi' // Use an app password, not your real password
  }
});

const sendResetEmail = async (email, token) => {
 const resetLink = `https://rfid-attendance-synctuario-theta.vercel.app/pages/users/reset/reset-password.html?token=${encodeURIComponent(token)}`;


  const mailOptions = {
    from: '"Synctuario Support" <tandemodson41@gmail.com>',
    to: email,
    subject: 'Password Reset Request',
    html: `
      <p>You requested a password reset.</p>
      <p>Click <a href="${resetLink}">here</a> to reset your password.</p>
      <p><strong>This link expires in 15 minutes.</strong></p>
    `
  };

  await transporter.sendMail(mailOptions);
};
// Request reset link
router.post('/request-reset', async (req, res) => {
  const { email } = req.body;
  try {
    const { rows } = await pool.query('SELECT * FROM admins WHERE email = $1', [email]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'No user found with that email' });
    }

    const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '15m' });
    await sendResetEmail(email, token);
    res.json({ message: 'Reset link sent to your email' });
  } catch (err) {
    console.error('Reset error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/reset-password/:token', async (req, res) => {
  const { token } = req.params;
  const { newPassword } = req.body;

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const email = decoded.email;

    // Hash the new password before saving
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password in DB
    const result = await pool.query(
      'UPDATE admins SET password = $1 WHERE email = $2',
      [hashedPassword, email]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ success: true, message: 'Password reset successful' });
  } catch (err) {
    console.error('Token error:', err);
    res.status(400).json({ success: false, message: 'Invalid or expired token' });
  }
});


module.exports = router;
