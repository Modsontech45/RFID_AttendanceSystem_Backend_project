const nodemailer = require('nodemailer');

require('dotenv').config();
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});


const sendAcceptanceEmail = async (to, subject, message) => {
  try {
    await transporter.sendMail({
      from: `"School Admin" <tandemodson41@gmail.com>`,
      to,
      subject,
      text: message,
    });
    console.log(`✅ Email sent to ${to}`);
  } catch (error) {
    console.error(`❌ Failed to send email to ${to}:`, error);
  }
};



module.exports = { sendAcceptanceEmail };
