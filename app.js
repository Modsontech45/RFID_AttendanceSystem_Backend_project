require("dotenv").config();
require("./cron");
const path = require("path"); // <- add this
const cron = require("node-cron");
const axios = require("axios");

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");

const adminRoutes = require("./users-routes/admin");
const teacherRoutes = require("./users-routes/teacher");
const resetPasswordRoutes = require("./users-routes/reset-password");
const deviceRoutes = require("./devices/registerdevice"); // adjust path as needed
const categoryRoutes = require("./category/categories");
const timeSettingsRouter = require("./student-routes/timeSettings");
const paymentRoutes = require("./users-routes/paystack");
const superAdmin = require("./users-routes/superAdmin");

const app = express();
const PORT = process.env.PORT || 3000;

// app.listen(PORT, () => {
//   console.log(`✅ Server running on port ${PORT}`);
// });

app.use("/app", express.static(path.join(__dirname, "/public/app"))); // <- serve static files
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
  "https://zp1v56uxy8rdx5ypatb0ockcb9tr6a-oci3--5173--96435430.local-credentialless.webcontainer-api.io",
  // ✅ ADD THIS
];



app.use(cors({
  origin: function (origin, callback) {
    if (!origin) {
      // No origin (native apps, curl, server-to-server)
      return callback(null, true);
    }

    // ✅ Always allow production + capacitor origins
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // ✅ Allow localhost on http/https with any port
    if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }

    // ✅ Allow 127.0.0.1 on http/https with any port
    if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }

    // ✅ Allow LAN devices (192.168.x.x and 10.x.x.x ranges)
    if (
      /^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin) ||
      /^https?:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/.test(origin)
    ) {
      return callback(null, true);
    }

    // ❌ Anything else is blocked
    console.warn("❌ Blocked by CORS:", origin);
    return callback(new Error("CORS not allowed for this origin"), false);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
}));
// app.options("*", cors());
app.use(bodyParser.json());



app.get("/download-app", (req, res) => {
  const filePath = path.join(__dirname, "../public/app/afrAttendance.apk");
  res.download(filePath, "Synctuario.apk", (err) => {
    if (err) {
      console.error("Error downloading file:", err);
      res.status(500).send("Failed to download app");
    }
  });
});




app.use("/api/categories", categoryRoutes); // ✅ REGISTER the route here

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

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});

// Replace with your deployed Render URL
const SERVER_URL = "https://rfid-attendancesystem-backend-project.onrender.com/api/scan/health";

// Run every 5 minutes
cron.schedule("*/5 * * * *", async () => {
  try {
    const res = await axios.get(SERVER_URL);
    console.log(`[CRON] Ping successful: ${res.status}`);
  } catch (err) {
    console.error("[CRON] Ping failed:", err.message);
  }
});
