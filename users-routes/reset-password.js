const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const getMessage = require('../utils/messages');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendResetEmail = async (email, token, lang) => {
  const resetLink = `https://rfid-attendance-synctuario-theta.vercel.app/admin/reset-password?token=${encodeURIComponent(token)}`;

  const mailOptions = {
    from: `"Synctuario Support" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: getMessage(lang, 'reset.subject'),
    html: `
      <p>${getMessage(lang, 'reset.requested')}</p>
      <p><a href="${resetLink}">${getMessage(lang, 'reset.clickHere')}</a></p>
      <p><strong>${getMessage(lang, 'reset.expiry')}</strong></p>
    `,
  };

  await transporter.sendMail(mailOptions);
};

// ✅ Request password reset
router.post('/request-reset', async (req, res) => {
  const { email } = req.body;
  const lang = req.headers['accept-language']?.toLowerCase().split(',')[0] || 'en';

  try {
    const { rows } = await pool.query('SELECT * FROM admins WHERE email = $1', [email]);
    if (rows.length === 0) {
      return res.status(404).json({ message: getMessage(lang, 'reset.notFound') });
    }

    const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '15m' });
    await sendResetEmail(email, token, lang);
    res.json({ message: getMessage(lang, 'reset.sent') });
  } catch (err) {
    console.error('Reset error:', err);
    res.status(500).json({ message: getMessage(lang, 'common.internalError') });
  }
});

// ✅ Perform password reset
router.post('/reset-password/:token', async (req, res) => {
  const { token } = req.params;
  const { newPassword } = req.body;
  const lang = req.headers['accept-language']?.toLowerCase().split(',')[0] || 'en';

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const email = decoded.email;

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const result = await pool.query(
      'UPDATE admins SET password = $1 WHERE email = $2',
      [hashedPassword, email]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: getMessage(lang, 'reset.notFound') });
    }

    res.json({ success: true, message: getMessage(lang, 'reset.success') });
  } catch (err) {
    console.error('Token error:', err);
    res.status(400).json({ success: false, message: getMessage(lang, 'reset.invalidToken') });
  }
});

module.exports = router;
