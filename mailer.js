const nodemailer = require('nodemailer');

require('dotenv').config();
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});


const sendAcceptanceEmail = async (to) => {
  try {
    await transporter.sendMail({
      from: `"School Admin" <tandemodson41@gmail.com>`,
      to,
      subject: "You've been added as a Teacher",
      text: `Hello! You have been added to the system as a teacher. You can now log in using your email.`,
    });
    console.log(`✅ Acceptance email sent to ${to}`);
  } catch (error) {
    console.error(`❌ Failed to send email to ${to}:`, error);
  }
};


module.exports = { sendAcceptanceEmail };
