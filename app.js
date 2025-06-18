require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const adminRoutes = require('./users-routes/admin');
const teacherRoutes = require('./users-routes/teacher');
const resetPasswordRoutes = require('./users-routes/reset-password')



const app = express();
const port = 3000;




const allowedOrigins = [
  'http://localhost:8080',
  'http://127.0.0.1:5500'
];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // Allow Postman, curl, etc.
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error('CORS not allowed for this origin'), false);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true // Set to true if your frontend will use cookies or auth headers
}));




app.use(bodyParser.json());
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
