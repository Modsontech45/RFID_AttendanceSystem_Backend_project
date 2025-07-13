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
  'http://localhost:5173', // ✅ Added correct local dev origin
  'https://localhost:5173', // optional, only if using HTTPS locally
  'https://rfid-attendance-synctuario-theta.vercel.app',
  'https://rfid-attendancesystem-backend-project.onrender.com'
];


app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // Allow non-browser requests
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed for this origin'), false);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
}));


app.options('*', cors(corsOptions));// was not here


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
