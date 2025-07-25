require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const apiKeyRateLimiter = require('./middleware/apiKeyRateLimiter');
const verifyApiKey = require('./middleware/verifyApiKey');

const adminRoutes = require('./users-routes/admin');
const teacherRoutes = require('./users-routes/teacher');
const resetPasswordRoutes = require('./users-routes/reset-password')
const deviceRoutes = require('./devices/registerdevice'); // adjust path as needed
const categoryRoutes = require('./category/categories');
const timeSettingsRouter = require('./student-routes/timeSettings');
const paymentRoutes = require('./users-routes/paystack');




const app = express();
const port = 3000;




const allowedOrigins = [
  'http://localhost:8080',
  'http://127.0.0.1:5500',
  'http://localhost:5173',
    'https://bolt.new' ,
  'https://rfid-attendance-synctuario-theta.vercel.app',
  'https://rfid-attendancesystem-backend-project.onrender.com',
  'https://zp1v56uxy8rdx5ypatb0ockcb9tr6a-oci3--5173--96435430.local-credentialless.webcontainer-api.io' // ✅ ADD THIS
];

app.use(cors({
  origin: function (origin, callback) {
    console.log("🌐 Incoming Origin:", origin);
    if (!origin) return callback(null, true); // Allow non-browser requests
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      console.error(`❌ CORS blocked: ${origin}`);
      return callback(new Error('CORS not allowed for this origin'), false);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
}));





app.use(bodyParser.json());

app.use('/api/categories',verifyApiKey, apiKeyRateLimiter, categoryRoutes); // ✅ REGISTER the route here

app.use('/api/devices',verifyApiKey, apiKeyRateLimiter, deviceRoutes);
app.use('/api/admins', verifyApiKey, apiKeyRateLimiter, adminRoutes);
app.use('/api/admin',verifyApiKey, apiKeyRateLimiter, adminRoutes);
app.use('/api/teachers',verifyApiKey, apiKeyRateLimiter, teacherRoutes);
app.use('/api/reset',verifyApiKey, apiKeyRateLimiter, resetPasswordRoutes);
app.use('/api',verifyApiKey, apiKeyRateLimiter, timeSettingsRouter);
app.use('/api/',verifyApiKey, apiKeyRateLimiter, paymentRoutes);


app.use('/api/students',verifyApiKey, apiKeyRateLimiter, require('./student-routes/students'));
app.use('/api/attendance',verifyApiKey, apiKeyRateLimiter, require('./student-routes/attendance'));
app.use('/api/scan', require('./student-routes/scan'));
app.use('/api/register', require('./student-routes/register'));

app.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});
