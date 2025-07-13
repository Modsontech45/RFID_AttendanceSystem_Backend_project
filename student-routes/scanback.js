require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const adminRoutes = require('./users-routes/admin');
const teacherRoutes = require('./users-routes/teacher');
const resetPasswordRoutes = require('./users-routes/reset-password')
const deviceRoutes = require('./devices/registerdevice'); // adjust path as needed
const categoryRoutes = require('./category/categories');




const app = express();
const port = 3000;




const allowedOrigins = [
  'http://localhost:8080',
  'http://127.0.0.1:5500',
   'http://localhost:5173',
  'https://rfid-attendance-synctuario-theta.vercel.app',
  'https://rfid-attendancesystem-backend-project.onrender.com'
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // Allow non-browser requests like Postman
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed for this origin'), false);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // ✅ Handles OPTIONS preflight




app.use(bodyParser.json());

app.use('/api/categories', categoryRoutes); // ✅ REGISTER the route here

app.use('/api/devices', deviceRoutes);
app.use('/api/admins', adminRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/reset', resetPasswordRoutes);


app.use('/api/students', require('./student-routes/students'));
app.use('/api/attendance', require('./student-routes/attendance'));
app.use('/api/scan', require('./student-routes/scan'));
app.use('/api/register', require('./student-routes/register'));

app.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});




// ✅ Admin Signup
router.post('/signup', async (req, res) => {
  const { firstname, lastname, email, password } = req.body;
  const lang = req.headers['accept-language']?.toLowerCase().split(',')[0] || 'en';

  if (!firstname || !lastname || !email || !password) {
    return res.status(400).json({ message: getMessage(lang, 'admin.requiredFields') });
  }

  try {
    const existing = await pool.query('SELECT * FROM admins WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: getMessage(lang, 'admin.alreadyExists') });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const apiKey = crypto.randomBytes(32).toString('hex');

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
          <p>${getMessage(lang, 'admin.verifyInstruction')}</p>
          <a href="${verifyLink}" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
            ${getMessage(lang, 'admin.verifyEmail')}
          </a>
          <p style="margin-top: 20px;">${getMessage(lang, 'admin.ignoreEmail')}</p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: '"Admin System" SYNCTUARIO',
      to: email,
      subject: getMessage(lang, 'admin.verifySubject'),
      html: emailTemplate,
    });

    res.status(201).json({
      message: getMessage(lang, 'admin.signupSuccess'),
      redirect: '/pages/users/reset/email-sent.html',
    });

  } catch (err) {
    console.error('❌ Signup error:', err.message);
    res.status(500).json({ message: getMessage(lang, 'common.internalError'), error: err.message });
  }
});
