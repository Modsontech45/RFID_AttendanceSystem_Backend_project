require("dotenv").config();
require("./cron");
const path = require("path");
const cron = require("node-cron");
const axios = require("axios");

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");

// Import database connection
const { testConnection, closePool } = require("./db"); // Create this file

const adminRoutes = require("./users-routes/admin");
const teacherRoutes = require("./users-routes/teacher");
const resetPasswordRoutes = require("./users-routes/reset-password");
const deviceRoutes = require("./devices/registerdevice");
const categoryRoutes = require("./category/categories");
const timeSettingsRouter = require("./student-routes/timeSettings");
const paymentRoutes = require("./users-routes/paystack");
const superAdmin = require("./users-routes/superAdmin");

const app = express();
const PORT = process.env.PORT || 3000;

app.use("/app", express.static(path.join(__dirname, "/public/app")));

const allowedOrigins = [
  "http://localhost:8080",
  "capacitor://localhost", 
  "ionic://localhost",
  "http://127.0.0.1:5500",
  "http://localhost:5173",
  "https://bolt.new",
  "http://localhost:3000",
  "http://192.168.1.142:3000",
  "https://rfid-attendance-synctuario-theta.vercel.app",
  "https://super-admin-drab.vercel.app",
  "https://rfid-attendancesystem-backend-project.onrender.com",
  "https://rfid-attendancesystem-backend-project-muay.onrender.com",
  "https://zp1v56uxy8rdx5ypatb0ockcb9tr6a-oci3--5173--96435430.local-credentialless.webcontainer-api.io",
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }

    if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }

    if (
      /^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin) ||
      /^https?:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/.test(origin)
    ) {
      return callback(null, true);
    }

    console.warn("❌ Blocked by CORS:", origin);
    return callback(new Error("CORS not allowed for this origin"), false);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
}));

app.use(bodyParser.json());

// Health check endpoint
app.get("/api/scan/health", async (req, res) => {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    
    res.status(200).json({ 
      status: dbConnected ? "OK" : "DB_ERROR",
      timestamp: new Date().toISOString(),
      port: PORT,
      database: dbConnected ? "connected" : "disconnected",
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    res.status(500).json({
      status: "ERROR",
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

app.get("/download-app", (req, res) => {
  const filePath = path.join(__dirname, "../public/app/afrAttendance.apk");
  res.download(filePath, "Synctuario.apk", (err) => {
    if (err) {
      console.error("Error downloading file:", err);
      res.status(500).send("Failed to download app");
    }
  });
});

// Routes
app.use("/api/categories", categoryRoutes);
app.use("/api/devices", deviceRoutes);
app.use("/api/admins", adminRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/teachers", teacherRoutes);
app.use("/api/reset", resetPasswordRoutes);
app.use("/api", timeSettingsRouter);
app.use("/api/", paymentRoutes);
app.use("/api/super-admin", superAdmin);

app.use("/api/students", require("./student-routes/students"));
app.use("/api/attendance", require("./student-routes/attendance"));
app.use("/api/scan", require("./student-routes/scan"));
app.use("/api/register", require("./student-routes/register"));

// Start server with database connection test
const startServer = async () => {
  try {
    // Test database connection first
    console.log("🔍 Testing database connection...");
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
      console.warn("⚠️ Database connection failed, but starting server anyway...");
    }
    
    const server = app.listen(PORT, () => {
      console.log(`✅ Server running at http://localhost:${PORT}`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📡 CORS origins configured: ${allowedOrigins.length} origins`);
      console.log(`🗄️ Database status: ${dbConnected ? 'Connected' : 'Disconnected'}`);
    });

    // Handle server shutdown
    const gracefulShutdown = async (signal) => {
      console.log(`🛑 ${signal} received, shutting down gracefully...`);
      
      server.close(async () => {
        console.log('🔌 HTTP server closed');
        await closePool();
        process.exit(0);
      });
      
      // Force close after 10 seconds
      setTimeout(() => {
        console.log('⏰ Forcing shutdown after 10 seconds...');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

// Updated cron job with better error handling
const SERVER_URL = process.env.NODE_ENV === 'production' 
  ? "https://rfid-attendance-system-backend-proj.vercel.app/api/scan/health"
  : `http://localhost:${PORT}/api/scan/health`;

// Run every 14 minutes to prevent Render free tier from sleeping
cron.schedule("*/14 * * * *", async () => {
  try {
    const res = await axios.get(SERVER_URL, {
      timeout: 15000, // 15 second timeout
      headers: {
        'User-Agent': 'Render-KeepAlive-Bot',
        'Accept': 'application/json'
      }
    });
    
    const data = res.data;
    console.log(`[CRON] Ping successful: ${res.status} - DB: ${data.database} at ${new Date().toISOString()}`);
    
  } catch (err) {
    console.error(`[CRON] Ping failed at ${new Date().toISOString()}:`, {
      message: err.message,
      code: err.code,
      status: err.response?.status
    });
  }
});