const jwt = require('jsonwebtoken');
const getMessage = require('../utils/messages');
require('dotenv').config();

const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const lang = req.headers['accept-language'] || 'en';

  if (!authHeader)
    return res.status(401).json({ message: getMessage(lang, 'auth.noToken') });

  const token = authHeader.split(' ')[1];

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.log('Admin JWT verification error:', err);
      return res.status(403).json({ message: getMessage(lang, 'auth.invalidToken') });
    }

    console.log('Admin decoded token:', decoded);

    if (decoded.role !== 'admin') {
      console.log('Access denied: role is not admin:', decoded.role);
      return res.status(403).json({ message: getMessage(lang, 'auth.accessDenied') });
    }

    req.admin = decoded;
    next();
  });
};

const authenticateTeacher = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const lang = req.headers['accept-language'] || 'en';

  if (!authHeader)
    return res.status(401).json({ message: getMessage(lang, 'auth.noToken') });

  const token = authHeader.split(' ')[1];

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.log('Teacher JWT verification error:', err);
      return res.status(403).json({ message: getMessage(lang, 'auth.invalidToken') });
    }

    console.log('Teacher decoded token:', decoded);

    if (!decoded || decoded.role !== 'teacher') {
      console.log('Access denied: role is not teacher:', decoded ? decoded.role : decoded);
      return res.status(403).json({ message: getMessage(lang, 'auth.accessDenied') });
    }

    req.teacher = decoded;
    next();
  });
};

async function checkSubscription(admin) {
  const now = new Date();
  console.log("🕒 Current time:", now);
  console.log("🧾 Admin subscription status:", admin.subscription_status);

  if (admin.subscription_status === "trial") {
    const trialEnd = new Date(admin.trial_end_date);
    console.log("⏳ Trial ends at:", trialEnd);
    if (now > trialEnd) {
      console.log("🚫 Trial expired");
      return "expired";
    }
    console.log("✅ Trial active");
    return "trial";  // Return "trial" if still in trial period
  }

  if (admin.subscription_status === "active") {
    const endDate = new Date(admin.subscription_end_date);
    console.log("📆 Subscription ends at:", endDate);
    if (now > endDate) {
      console.log("🚫 Subscription expired");
      return "expired";
    }
    console.log("✅ Subscription active");
    return "active"; // Return "active" if subscription is still valid
  }

  console.log("❓ No subscription found");
  return "none";
}




module.exports = {
  authenticateAdmin,
  authenticateTeacher,
  checkSubscription,
  
};









const express = require("express");
const pool = require("../db");
const router = express.Router();
const getMessage = require("../utils/messages");
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const latestScans = {};

// Helper to check if time is between start and end
const isBetween = (start, end, current) => current >= start && current <= end;

// POST /scan
router.post("/", async (req, res) => {
  const { uid, device_uid } = req.body;
  const lang =
    req.headers["accept-language"]?.split(",")[0]?.toLowerCase() || "en";
  const now = new Date();

  if (!uid || !device_uid) {
    return res.status(400).json({
      message: getMessage(lang, "scan.missingFields"),
      sign: 0,
    });
  }

  try {
    // 1. Fetch student
    let studentRes = await pool.query("SELECT * FROM students WHERE uid = $1", [
      uid,
    ]);
    if (!studentRes.rows.length) {
      const notFound = {
        uid,
        device_uid,
        exists: false,
        message: getMessage(lang, "scan.uidNotRegistered"),
        timestamp: now,
        sign: 2,
        flag: getMessage(lang, "scan.registerNow"),
      };
      latestScans[device_uid] = notFound;
      return res.json(notFound);
    }

    let student = studentRes.rows[0];
    const requestApiKey =
      req.headers["x-api-key"] || req.query.api_key || req.body.api_key;

    // 2. Verify API key matches
    if (requestApiKey && requestApiKey !== student.api_key) {
      const sameUidSchool = await pool.query(
        "SELECT * FROM students WHERE uid = $1 AND api_key = $2 LIMIT 1",
        [uid, requestApiKey]
      );

      if (sameUidSchool.rows.length) student = sameUidSchool.rows[0];
      else {
        const otherSchoolRes = await pool.query(
          "SELECT schoolname FROM admins WHERE api_key = $1 LIMIT 1",
          [student.api_key]
        );
        const otherSchool =
          otherSchoolRes.rows[0]?.schoolname || "another school";
        const mismatch = {
          message: getMessage(lang, "scan.mismatch", otherSchool),
          student_uid: uid,
          device_uid,
          student_name: student.name,
          sign: 0,
          timestamp: now,
          flag: getMessage(lang, "scan.mismatch", otherSchool),
        };
        latestScans[device_uid] = mismatch;
        return res.json(mismatch);
      }
    }

    const dateStr = now.toISOString().slice(0, 10);

    // 3. Ensure attendance records exist
    const attendanceCheck = await pool.query(
      "SELECT COUNT(*) FROM attendance WHERE date = $1",
      [dateStr]
    );
    if (parseInt(attendanceCheck.rows[0].count) === 0) {
      const allStudents = await pool.query(
        "SELECT uid, name, form, api_key FROM students"
      );
      for (const s of allStudents.rows) {
        await pool.query(
          `INSERT INTO attendance (uid, name, form, date, signed_in, signed_out, status, api_key)
           VALUES ($1, $2, $3, $4, false, false, 'absent', $5)`,
          [s.uid, s.name, s.form, dateStr, s.api_key]
        );
      }
    }

    // 4. Fetch time settings
    const timeRes = await pool.query(
      "SELECT sign_in_start, sign_in_end, sign_out_start, sign_out_end FROM time_settings WHERE api_key = $1 LIMIT 1",
      [student.api_key]
    );
    if (!timeRes.rows.length) {
      return res
        .status(400)
        .json({ message: getMessage(lang, "timeSettings.notFound"), sign: 0 });
    }
    const { sign_in_start, sign_in_end, sign_out_start, sign_out_end } =
      timeRes.rows[0];
    const nowStr = now.toTimeString().split(" ")[0];

    const isSignInTime = isBetween(sign_in_start, sign_in_end, nowStr);
    const isSignOutTime = isBetween(sign_out_start, sign_out_end, nowStr);

    if (!isSignInTime && !isSignOutTime) {
      const outsideTime = {
        uid,
        device_uid,
        exists: true,
        name: student.name,
        timestamp: now,
        message: getMessage(lang, "scan.outsideTime"),
        sign: 0,
        flag: getMessage(lang, "scan.outsideFlag"),
      };
      latestScans[device_uid] = outsideTime;
      return res.json(outsideTime);
    }

    // 5. Fetch today's attendance record
    const attendanceRes = await pool.query(
      "SELECT * FROM attendance WHERE uid = $1 AND date = $2",
      [uid, dateStr]
    );
    const existing = attendanceRes.rows[0];
    let { sign_in_time, sign_out_time, signed_in, signed_out, punctuality } =
      existing;

    // 6. Handle sign-in
    if (isSignInTime && !signed_in) {
      sign_in_time = now;
      signed_in = true;

      // Use cutoff_time from frontend or time settings
      const cutoffTime = req.body.cutoff_time || sign_in_end; // fallback if frontend doesn't send
      punctuality = nowStr > cutoffTime ? "late" : "on_time";
    }

    // 7. Handle sign-out
    if (isSignOutTime && !signed_out) {
      if (!signed_in) {
        const mustSignInFirst = {
          uid,
          device_uid,
          exists: true,
          name: student.name,
          timestamp: now,
          message: getMessage(lang, "scan.signInFirst"),
          sign: 3,
          flag: getMessage(lang, "scan.signInFlag"),
        };
        latestScans[device_uid] = mustSignInFirst;
        return res.json(mustSignInFirst);
      }

      sign_out_time = now;
      signed_out = true;

      // Keep punctuality from sign-in, optionally mark early leave
      if (nowStr < sign_out_end) {
        punctuality =
          punctuality === "late" ? "late_early_leave" : "early_leave";
      }
    }
    // 8. Determine final status
    let status = "absent";
    if (signed_in && signed_out) status = "present";
    else if (signed_in) status = "partial";

    await pool.query(
      `UPDATE attendance
       SET sign_in_time=$1, sign_out_time=$2, signed_in=$3, signed_out=$4,
           status=$5, punctuality=$6
       WHERE id=$7`,
      [
        sign_in_time,
        sign_out_time,
        signed_in,
        signed_out,
        status,
        punctuality,
        existing.id,
      ]
    );

    const signedMessage = isSignInTime
      ? getMessage(lang, "scan.signedIn")
      : getMessage(lang, "scan.signedOut");
    const scanSuccess = {
      uid,
      device_uid,
      exists: true,
      name: student.name,
      timestamp: now,
      message: signedMessage,
      sign: 1,
      flag: signedMessage,
    };
    latestScans[device_uid] = scanSuccess;

    return res.json(scanSuccess);
  } catch (err) {
    console.error("❌ Error processing scan:", err.message);
    const errorResponse = {
      uid: req.body.uid || null,
      device_uid: req.body.device_uid || null,
      exists: false,
      timestamp: new Date(),
      message: getMessage(lang, "scan.error"),
      error: err.message,
      sign: 0,
      flag: "Error",
    };
    latestScans[device_uid || "unknown"] = errorResponse;
    return res
      .status(500)
      .json({
        message: getMessage(lang, "scan.failed"),
        error: err.message,
        sign: 0,
      });
  }
});

// GET /scan/queue
router.get("/queue", (req, res) => {
  const { device_uid } = req.query;
  const lang =
    req.headers["accept-language"]?.split(",")[0]?.toLowerCase() || "en";

  if (!device_uid)
    return res
      .status(400)
      .json({ error: getMessage(lang, "scan.deviceRequired") });

  const scan = latestScans[device_uid];
  if (scan) {
    delete latestScans[device_uid];
    return res.json([scan]);
  }
  return res.json([]);
});

module.exports = router;

























 const express = require('express');
const pool = require('../db');
const router = express.Router();
const getMessage = require('../utils/messages');
const nodemailer = require("nodemailer");


const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const latestScans = {};

// POST /scan
router.post('/', async (req, res) => {
  const { uid, device_uid } = req.body;
  const lang = req.headers['accept-language']?.toLowerCase().split(',')[0] || 'en';
  const now = new Date();

  if (!uid || !device_uid) {
    return res.status(400).json({
      message: getMessage(lang, 'scan.missingFields'),
      sign: 0
    });
  }

  try {
    // 1. Check if student exists
    const studentRes = await pool.query('SELECT * FROM students WHERE uid = $1', [uid]);

    if (studentRes.rows.length === 0) {
      const notFound = {
        uid,
        device_uid,
        exists: false,
        message: getMessage(lang, 'scan.uidNotRegistered'),
        timestamp: now,
        sign: 2,
        flag: getMessage(lang, 'scan.registerNow')
      };
      latestScans[device_uid] = notFound;
      return res.json(notFound);
    }

    const student = studentRes.rows[0];
const requestApiKey = req.headers['x-api-key'] || req.query.api_key || req.body.api_key;

console.log("🔐 Incoming request:");
console.log("→ device_uid:", device_uid);
console.log("→ uid:", uid);
console.log("→ API key from request:", requestApiKey);
console.log("→ Student's API key in database:", student.api_key);

// If API keys don't match, investigate deeper
if (requestApiKey && requestApiKey !== student.api_key) {
  console.log("⚠️ API key mismatch detected. Checking if UID belongs to the requesting school...");

  // Check if UID exists under the requesting API key (same UID in different school)
  const sameUidSameSchool = await pool.query(
    'SELECT * FROM students WHERE uid = $1 AND api_key = $2 LIMIT 1',
    [uid, requestApiKey]
  );

  if (sameUidSameSchool.rows.length > 0) {
    console.log("✅ UID found under the requesting API key. Proceeding with this student.");

    // Override student to match the school associated with the current request
    student = sameUidSameSchool.rows[0];
  } else {
    console.log("🚫 UID does not belong to the current school.");

    const schoolRes = await pool.query(
      'SELECT schoolname FROM admins WHERE api_key = $1 LIMIT 1',
      [student.api_key]
    );
    const otherSchool = schoolRes.rows[0]?.schoolname || 'another school';
    const mismatch = {
       message:getMessage(lang, 'scan.mismatch',otherSchool),
      student_uid: uid,
      device_uid,
      student_name: student.name,
      sign: 0,
      timestamp: new Date(),
      flag: getMessage(lang, 'scan.mismatch',otherSchool)

    }
    console.log(`🚨 Cross-school access attempt: Student from "${otherSchool}" tried to sign in to a different school.`);
      console.log(mismatch)
    return res.json(mismatch);
   
  }
} else {
  console.log("✅ API key matches or no conflict detected.");
}


    const dateStr = now.toISOString().slice(0, 10);

    // 2. Ensure daily attendance records exist
    const attendanceCheck = await pool.query(
      'SELECT COUNT(*) FROM attendance WHERE date = $1',
      [dateStr]
    );

    if (parseInt(attendanceCheck.rows[0].count) === 0) {
      const allStudents = await pool.query('SELECT uid, name, form, api_key FROM students');
      for (const s of allStudents.rows) {
        await pool.query(
          `INSERT INTO attendance (uid, name, form, date, signed_in, signed_out, status, api_key)
           VALUES ($1, $2, $3, $4, false, false, 'absent', $5)`,
          [s.uid, s.name, s.form, dateStr, s.api_key]
        );
      }
    }

    // 3. Fetch time settings
    const timeSettingsRes = await pool.query(
      `SELECT sign_in_start, sign_in_end, sign_out_start, sign_out_end
       FROM time_settings WHERE api_key = $1 LIMIT 1`,
      [student.api_key]
    );

    if (timeSettingsRes.rows.length === 0) {
      return res.status(400).json({
        message: getMessage(lang, 'timeSettings.notFound'),
        sign: 0
      });
    }

    const {
      sign_in_start,
      sign_in_end,
      sign_out_start,
      sign_out_end
    } = timeSettingsRes.rows[0];

    // 4. Compare current time with sign-in/out windows
    const nowStr = now.toTimeString().split(" ")[0]; // "HH:MM:SS"
    const isBetween = (start, end, current) => current >= start && current <= end;

    const isSignInTime = isBetween(sign_in_start, sign_in_end, nowStr);
    const isSignOutTime = isBetween(sign_out_start, sign_out_end, nowStr);

    if (!isSignInTime && !isSignOutTime) {
      // late comers
      //check if now is greater than the sign in time but less than sign in time plus one hour then punctuality is equal to late
      const outsideTime = {
        uid,
        device_uid,
        exists: true,
        name: student.name,
        timestamp: now,
        message: getMessage(lang, 'scan.outsideTime'),
        sign: 0,
        flag: getMessage(lang, 'scan.outsideFlag')
      };
      latestScans[device_uid] = outsideTime;
      return res.json(outsideTime);
    }

    // 5. Fetch today's attendance record
    const attendanceRes = await pool.query(
      'SELECT * FROM attendance WHERE uid = $1 AND date = $2',
      [uid, dateStr]
    );

    const existing = attendanceRes.rows[0];
    let { sign_in_time, sign_out_time, signed_in, signed_out } = existing;

    // 6. Handle sign-in
    if (isSignInTime && !signed_in) {
      sign_in_time = now;
      signed_in = true;
    }

    // 7. Handle sign-out
    if (isSignOutTime && !signed_out) {
      if (!signed_in) {
        const mustSignInFirst = {
          uid,
          device_uid,
          exists: true,
          name: student.name,
          timestamp: now,
          message: getMessage(lang, 'scan.signInFirst'),
          sign: 3,
          flag: getMessage(lang, 'scan.signInFlag')
        };
        latestScans[device_uid] = mustSignInFirst;
        return res.json(mustSignInFirst);
      }
      sign_out_time = now;
      signed_out = true;
    }

    // 8. Determine final status
    let status = 'absent';
    if (signed_in && signed_out) status = 'present';
    else if (signed_in) status = 'partial';

    await pool.query(
      `UPDATE attendance
       SET sign_in_time = $1, sign_out_time = $2, signed_in = $3, signed_out = $4, status = $5
       WHERE id = $6`,
      [sign_in_time, sign_out_time, signed_in, signed_out, status, existing.id]
    );

    const signedMessage = isSignInTime
      ? getMessage(lang, 'scan.signedIn')
      : getMessage(lang, 'scan.signedOut');

    const scanSuccess = {
      uid,
      device_uid,
      exists: true,
      name: student.name,
      timestamp: now,
      message: signedMessage,
      sign: 1,
      flag: signedMessage
    };

    latestScans[device_uid] = scanSuccess;
    return res.json(scanSuccess);

  } catch (err) {
    console.error('❌ Error processing scan:', err.message);
    const errorResponse = {
      uid: req.body.uid || null,
      device_uid: req.body.device_uid || null,
      exists: false,
      timestamp: new Date(),
      message: getMessage(lang, 'scan.error'),
      error: err.message,
      sign: 0,
      flag: 'Error'
    };
    latestScans[device_uid || 'unknown'] = errorResponse;
    return res.status(500).json({
      message: getMessage(lang, 'scan.failed'),
      error: err.message,
      sign: 0
    });
  }
});

// GET /scan/queue
router.get('/queue', (req, res) => {
  const { device_uid } = req.query;
  const lang = req.headers['accept-language']?.toLowerCase().split(',')[0] || 'en';

  if (!device_uid) {
    return res.status(400).json({
      error: getMessage(lang, 'scan.deviceRequired')
    });
  }

  const scan = latestScans[device_uid];
  if (scan) {
    delete latestScans[device_uid];
    return res.json([scan]);
  }

  return res.json([]);
});

module.exports = router;




const express = require('express');
const pool = require('../db'); // PostgreSQL connection pool
const router = express.Router();
const getMessage = require('../utils/messages'); // function for multilingual messages
const nodemailer = require("nodemailer");

// Setup nodemailer transporter for email notifications (currently not used)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Object to store the latest scan result per device (used for /queue endpoint)
const latestScans = {};

// POST /scan
router.post('/', async (req, res) => {
  const { uid, device_uid } = req.body;
  const lang = req.headers['accept-language']?.toLowerCase().split(',')[0] || 'en';
  const now = new Date();

  // Validate request body
  if (!uid || !device_uid) {
    return res.status(400).json({
      message: getMessage(lang, 'scan.missingFields'),
      sign: 0
    });
  }

  try {
    // 1. Check if student exists in the database
    const studentRes = await pool.query('SELECT * FROM students WHERE uid = $1', [uid]);

    if (studentRes.rows.length === 0) {
      const notFound = {
        uid,
        device_uid,
        exists: false,
        message: getMessage(lang, 'scan.uidNotRegistered'),
        timestamp: now,
        sign: 2,
        flag: getMessage(lang, 'scan.registerNow')
      };
      latestScans[device_uid] = notFound;
      return res.json(notFound);
    }

    let student = studentRes.rows[0]; // student record
    const requestApiKey = req.headers['x-api-key'] || req.query.api_key || req.body.api_key;

    console.log("🔐 Incoming request:");
    console.log("→ device_uid:", device_uid);
    console.log("→ uid:", uid);
    console.log("→ API key from request:", requestApiKey);
    console.log("→ Student's API key in database:", student.api_key);

    // 2. Handle cross-school API key mismatch
    if (requestApiKey && requestApiKey !== student.api_key) {
      console.log("⚠️ API key mismatch detected. Checking if UID belongs to the requesting school...");

      // Check if UID exists under the requested API key (same UID, different school)
      const sameUidSameSchool = await pool.query(
        'SELECT * FROM students WHERE uid = $1 AND api_key = $2 LIMIT 1',
        [uid, requestApiKey]
      );

      if (sameUidSameSchool.rows.length > 0) {
        console.log("✅ UID found under the requesting API key. Proceeding with this student.");
        student = sameUidSameSchool.rows[0]; // override student to match API key
      } else {
        console.log("🚫 UID does not belong to the current school.");
        const schoolRes = await pool.query(
          'SELECT schoolname FROM admins WHERE api_key = $1 LIMIT 1',
          [student.api_key]
        );
        const otherSchool = schoolRes.rows[0]?.schoolname || 'another school';
        const mismatch = {
          message: getMessage(lang, 'scan.mismatch', otherSchool),
          student_uid: uid,
          device_uid,
          student_name: student.name,
          sign: 0,
          timestamp: now,
          flag: getMessage(lang, 'scan.mismatch', otherSchool)
        };
        console.log(`🚨 Cross-school access attempt: Student from "${otherSchool}" tried to sign in to a different school.`);
        return res.json(mismatch);
      }
    } else {
      console.log("✅ API key matches or no conflict detected.");
    }

    const dateStr = now.toISOString().slice(0, 10); // Get current date in YYYY-MM-DD

    // 3. Ensure daily attendance records exist for all students
    const attendanceCheck = await pool.query('SELECT COUNT(*) FROM attendance WHERE date = $1', [dateStr]);
    if (parseInt(attendanceCheck.rows[0].count) === 0) {
      const allStudents = await pool.query('SELECT uid, name, form, api_key FROM students');
      for (const s of allStudents.rows) {
        await pool.query(
          `INSERT INTO attendance (uid, name, form, date, signed_in, signed_out, status, api_key)
           VALUES ($1, $2, $3, $4, false, false, 'absent', $5)`,
          [s.uid, s.name, s.form, dateStr, s.api_key]
        );
      }
    }

    // 4. Fetch the school's time settings for sign-in/out
    const timeSettingsRes = await pool.query(
      `SELECT sign_in_start, sign_in_end, sign_out_start, sign_out_end
       FROM time_settings WHERE api_key = $1 LIMIT 1`,
      [student.api_key]
    );

    if (timeSettingsRes.rows.length === 0) {
      return res.status(400).json({
        message: getMessage(lang, 'timeSettings.notFound'),
        sign: 0
      });
    }

    const { sign_in_start, sign_in_end, sign_out_start, sign_out_end } = timeSettingsRes.rows[0];


    // 4. Hardcoded sign-in/sign-out times for testing
// Format: "HH:MM:SS" (24-hour format)
   const sign_in_start = "08:00:00";   // official sign-in start
   const sign_in_end   = "11:00:00";   // official sign-in end
   const sign_out_start = "15:00:00";  // official sign-out start
   const sign_out_end   = "16:00:00";  // official sign-out end


    // 5. Compare current time with sign-in/out windows
    const nowStr = now.toTimeString().split(" ")[0]; // "HH:MM:SS"
    const isBetween = (start, end, current) => current >= start && current <= end;
    const isSignInTime = isBetween(sign_in_start, sign_in_end, nowStr);
    const isSignOutTime = isBetween(sign_out_start, sign_out_end, nowStr);

    // If student is outside both sign-in and sign-out times, allow sign-in within 1 hour after start
    if (!isSignInTime && !isSignOutTime) {
      const signInLimit = new Date(`${dateStr}T${sign_in_start}`);
      signInLimit.setHours(signInLimit.getHours() + 1); // 1 hour after official sign-in

      if (now > signInLimit) {
        const outsideTime = {
          uid,
          device_uid,
          exists: true,
          name: student.name,
          timestamp: now,
          message: getMessage(lang, 'scan.outsideTime'),
          sign: 0,
          flag: getMessage(lang, 'scan.outsideFlag')
        };
        latestScans[device_uid] = outsideTime;
        return res.json(outsideTime);
      }
    }

    // 6. Fetch today's attendance record
    const attendanceRes = await pool.query('SELECT * FROM attendance WHERE uid = $1 AND date = $2', [uid, dateStr]);
    const existing = attendanceRes.rows[0];
    let { sign_in_time, sign_out_time, signed_in, signed_out, punctuality } = existing;

    // 7. Handle sign-in logic
    if (!signed_in) {
      sign_in_time = now;
      signed_in = true;

      // Determine punctuality: "on_time" if within official sign-in, "late" if within 1 hour after
      const signInDeadline = new Date(`${dateStr}T${sign_in_start}`);
      const signInLimit = new Date(signInDeadline);
      signInLimit.setHours(signInLimit.getHours() + 1);

      punctuality = now <= new Date(`${dateStr}T${sign_in_end}`) ? 'on_time' : 'late';

    }

    // 8. Handle sign-out logic
    if (isSignOutTime && !signed_out) {
      if (!signed_in) {
        // Prevent sign-out without signing in first
        const mustSignInFirst = {
          uid,
          device_uid,
          exists: true,
          name: student.name,
          timestamp: now,
          message: getMessage(lang, 'scan.signInFirst'),
          sign: 3,
          flag: getMessage(lang, 'scan.signInFlag')
        };
        latestScans[device_uid] = mustSignInFirst;
        return res.json(mustSignInFirst);
      }
      sign_out_time = now;
      signed_out = true;
      // No leave early logic, punctuality is only for sign-in
    }

    // 9. Determine final attendance status
    let status = 'absent';
    if (signed_in && signed_out) status = 'present';
    else if (signed_in && (punctuality === 'late' || punctuality === 'on_time')) status = 'partial';


    // 10. Update attendance record in the database
    await pool.query(
      `UPDATE attendance
       SET sign_in_time = $1, sign_out_time = $2, signed_in = $3, signed_out = $4, status = $5, punctuality = $6
       WHERE id = $7`,
      [sign_in_time, sign_out_time, signed_in, signed_out, status, punctuality, existing.id]
    );

    // 11. Prepare response message
    const signedMessage = signed_in && punctuality === 'on_time' ? getMessage(lang, 'scan.signedIn') : signed_in && punctuality === 'late' ? getMessage(lang, 'scan.late') : getMessage(lang, 'scan.signedOut');

    const scanSuccess = {
      uid,
      device_uid,
      exists: true,
      name: student.name,
      timestamp: now,
      message: signedMessage,
      sign: 1,
      flag: signedMessage
    };

    latestScans[device_uid] = scanSuccess;
    return res.json(scanSuccess);

  } catch (err) {
    console.error('❌ Error processing scan:', err.message);
    const errorResponse = {
      uid: req.body.uid || null,
      device_uid: req.body.device_uid || null,
      exists: false,
      timestamp: new Date(),
      message: getMessage(lang, 'scan.error'),
      error: err.message,
      sign: 0,
      flag: 'Error'
    };
    latestScans[device_uid || 'unknown'] = errorResponse;
    return res.status(500).json({
      message: getMessage(lang, 'scan.failed'),
      error: err.message,
      sign: 0
    });
  }
});

// GET /scan/queue
router.get('/queue', (req, res) => {
  const { device_uid } = req.query;
  const lang = req.headers['accept-language']?.toLowerCase().split(',')[0] || 'en';

  if (!device_uid) {
    return res.status(400).json({
      error: getMessage(lang, 'scan.deviceRequired')
    });
  }

  const scan = latestScans[device_uid];
  if (scan) {
    delete latestScans[device_uid]; // clear queue after reading
    return res.json([scan]);
  }

  return res.json([]);
});

module.exports = router;




require("dotenv").config();

const express = require("express");
const axios = require("axios");
const pool = require("../db");

const router = express.Router();

const plans = {
  starter: "PLN_x6kb1kh4122bm3q",
  professional: "PLN_td9knl16tw6lp1l",
  enterprise: "PLN_x6kb1kh4122bm3q",
};

// 🔁 Initialize Payment
router.post("/paystack/initialize", async (req, res) => {
  const { email, plan } = req.body;

  if (!plans[plan]) {
    return res.status(400).json({ message: "Invalid plan" });
  }

  const amountInPesewas = Number(plans[plan]) * 100;

  if (isNaN(amountInPesewas) || amountInPesewas <= 0) {
    return res.status(400).json({ message: "Invalid amount for the selected plan" });
  }

  try {
    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount: amountInPesewas,
        currency: "GHS",
        callback_url: "https://rfid-attendance-synctuario-theta.vercel.app/admin/verify-payment",
        metadata: {
          plan_name: plan,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return res.status(200).json({
      message: "Payment initiated",
      authorization_url: response.data.data.authorization_url,
      reference: response.data.data.reference,
    });
  } catch (error) {
    const errData = error?.response?.data || error.message;
    console.error("Paystack Init Error:", errData);
    return res.status(500).json({
      message: "Paystack initialization failed",
      error: errData,
    });
  }
});

router.get("/paystack/verify/:reference", async (req, res) => {
  const { reference } = req.params;
  console.log(`[Verify] Starting verification for reference: ${reference}`);

  if (!reference) {
    console.log("[Verify] Missing reference param");
    return res.status(400).json({ message: "Missing reference parameter" });
  }

  const axiosConfig = {
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    },
    timeout: 10000, // 10 seconds timeout
  };

  let response;
  let attempt = 0;
  const maxRetries = 2;

  while (attempt <= maxRetries) {
    try {
      console.log(`[Verify] Attempt ${attempt + 1} to verify payment`);
      response = await axios.get(
        `https://api.paystack.co/transaction/verify/${reference}`,
        axiosConfig
      );
      break; // success, exit retry loop
    } catch (error) {
      attempt++;
      console.error(`[Verify] Attempt ${attempt} failed:`, error.message);
      if (attempt > maxRetries) {
        const errData = error.response?.data || error.message;
        console.error("[Verify] All retries failed, returning error to client:", errData);
        return res.status(500).json({
          message: "Verification failed after multiple attempts",
          error: errData,
        });
      }
      // wait 1 second before retrying
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  const data = response.data.data;
  console.log("[Verify] Paystack response data:", data);

  if (data.status === "success") {
    const email = data.customer.email;
    const planName =
      data.plan?.name?.toLowerCase() ||
      data.metadata?.plan_name?.toLowerCase() ||
      "unknown";

    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1);

    try {
      await pool.query(
        `UPDATE admins 
         SET subscription_plan = $1,
             subscription_status = 'active',
             subscription_start_date = $2,
             subscription_end_date = $3
         WHERE email = $4`,
        [planName, startDate, endDate, email]
      );
      console.log(`[Verify] Updated subscription for ${email}`);
    } catch (dbError) {
      console.error("[Verify] DB update failed:", dbError.message);
      // You might want to handle this error or continue anyway
    }

    // Instead of redirecting, respond with JSON so frontend can handle it
    return res.json({ status: "success", message: "Payment verified successfully." });
  } else {
    console.log("[Verify] Payment status not successful:", data.status);
    return res.status(400).json({ status: "failed", message: "Payment verification failed." });
  }
});

module.exports = router;
