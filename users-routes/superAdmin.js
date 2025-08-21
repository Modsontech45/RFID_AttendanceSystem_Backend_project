const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { authenticateSuperAdmin } = require("../middleware/auth");

require("dotenv").config();
const router = express.Router();

// ================== Helper: Log & send response ==================
function sendResponse(res, status, payload) {
  console.log("Response:", payload);
  return res.status(status).json(payload);
}

// ================== Email Transporter ==================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ================== Middleware ==================
function requireSuperAdmin(req, res, next) {
  if (req.superAdmin?.role !== "super_admin") {
    return sendResponse(res, 403, { success: false, message: "Access denied: Super Admins only" });
  }
  next();
}

// ================== Super Admin Sign Up ==================
router.post("/signup", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return sendResponse(res, 400, { success: false, message: "All fields are required" });

  try {
    const countResult = await pool.query("SELECT COUNT(*) FROM super_admins");
    const count = parseInt(countResult.rows[0].count);

    if (count >= 3) return sendResponse(res, 400, { success: false, message: "Only 3 super admins allowed" });

    if (count > 0) {
      if (!req.headers.authorization)
        return sendResponse(res, 401, { success: false, message: "Authorization required" });

      try {
        const token = req.headers.authorization.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.role !== "super_admin")
          return sendResponse(res, 403, { success: false, message: "Only a super-admin can add another" });
      } catch (err) {
        return sendResponse(res, 401, { success: false, message: "Invalid token" });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString("hex");

    const insertResult = await pool.query(
      `INSERT INTO super_admins (username, email, password, verification_token, verified)
       VALUES ($1, $2, $3, $4, false)
       RETURNING id, username, email, verified, created_at`,
      [username, email, hashedPassword, verificationToken]
    );

    const verifyLink = `http://localhost:5173/super-admin/verify/${verificationToken}`;
    await transporter.sendMail({
      from: `"System" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Verify your Super Admin account",
      html: `<p>Welcome ${username},</p>
             <p>Click the link below to verify your account:</p>
             <a href="${verifyLink}" target="_blank">${verifyLink}</a>`,
    });

    sendResponse(res, 201, { success: true, message: "Super Admin registered. Please verify your email.", superAdmin: insertResult.rows[0] });
  } catch (err) {
    console.error("❌ Error signing up super admin:", err.message);
    sendResponse(res, 500, { success: false, message: "Internal Server Error" });
  }
});

// ================== Super Admin Login ==================
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) return sendResponse(res, 400, { success: false, message: "Email and password are required" });

  try {
    const result = await pool.query("SELECT * FROM super_admins WHERE email = $1", [email]);
    const superAdmin = result.rows[0];

    if (!superAdmin) return sendResponse(res, 401, { success: false, message: "Invalid credentials: email not found" });
    if (!superAdmin.verified) return sendResponse(res, 403, { success: false, message: "Email not verified. Please check your inbox." });

    const isMatch = await bcrypt.compare(password, superAdmin.password);
    if (!isMatch) return sendResponse(res, 401, { success: false, message: "Invalid credentials: wrong password" });

    const token = jwt.sign({ id: superAdmin.id, role: "super_admin" }, process.env.JWT_SECRET, { expiresIn: "1d" });

    sendResponse(res, 200, {
      success: true,
      message: "Super Admin login successful",
      token,
      superAdmin: { id: superAdmin.id, username: superAdmin.username, email: superAdmin.email },
    });
  } catch (err) {
    console.error("❌ Super Admin login error:", err.message);
    sendResponse(res, 500, { success: false, message: "Internal Server Error" });
  }
});

// ================== Request Password Reset ==================
router.post("/request-password-reset", async (req, res) => {
  const { email } = req.body;
  if (!email) return sendResponse(res, 400, { success: false, message: "Email is required" });

  try {
    const result = await pool.query("SELECT * FROM super_admins WHERE email = $1", [email]);
    const superAdmin = result.rows[0];
    if (!superAdmin) return sendResponse(res, 404, { success: false, message: "Super Admin not found" });

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetExpiry = new Date(Date.now() + 1000 * 60 * 30);

    await pool.query("UPDATE super_admins SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3", [resetToken, resetExpiry, superAdmin.id]);

    const resetLink = `http://localhost:5173/super-admin/reset-password?token=${resetToken}`;
    await transporter.sendMail({ from: `"System" <${process.env.EMAIL_USER}>`, to: email, subject: "Password Reset", html: `<p>Click to reset your password:</p><a href="${resetLink}">${resetLink}</a>` });

    sendResponse(res, 200, { success: true, message: "Password reset email sent" });
  } catch (err) {
    console.error("❌ Error requesting password reset:", err.message);
    sendResponse(res, 500, { success: false, message: "Internal Server Error" });
  }
});

// ================== Reset Password ==================
router.post("/reset-password/:token", async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;
  if (!password) return sendResponse(res, 400, { success: false, message: "Password is required" });

  try {
    const result = await pool.query("SELECT * FROM super_admins WHERE reset_token = $1 AND reset_token_expiry > NOW()", [token]);
    const superAdmin = result.rows[0];
    if (!superAdmin) return sendResponse(res, 400, { success: false, message: "Invalid or expired token" });

    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query("UPDATE super_admins SET password = $1, reset_token = NULL, reset_token_expiry = NULL WHERE id = $2", [hashedPassword, superAdmin.id]);

    sendResponse(res, 200, { success: true, message: "Password has been reset successfully" });
  } catch (err) {
    console.error("❌ Error resetting password:", err.message);
    sendResponse(res, 500, { success: false, message: "Internal Server Error" });
  }
});

// ================== Verify Email ==================
router.get("/verify/:token", async (req, res) => {
  const { token } = req.params;
  try {
    const result = await pool.query(
      "UPDATE super_admins SET verified = true, verification_token = NULL WHERE verification_token = $1 RETURNING *",
      [token]
    );
    if (result.rowCount === 0) return sendResponse(res, 400, { success: false, message: "Invalid or expired token" });
    sendResponse(res, 200, { success: true, message: "Email verified successfully", superAdmin: result.rows[0] });
  } catch (err) {
    console.error("❌ Error verifying email:", err.message);
    sendResponse(res, 500, { success: false, message: "Internal Server Error" });
  }
});

// ================== Fetch Users ==================
router.get("/admins", authenticateSuperAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT id, username, email, schoolname, type, active, created_at FROM admins");
    sendResponse(res, 200, { success: true, admins: result.rows });
  } catch (err) {
    console.error("❌ Fetch admins error:", err.message);
    sendResponse(res, 500, { success: false, message: "Internal Server Error" });
  }
});

router.get("/teachers", async (req, res) => {
  try {
    const teachersResult = await pool.query("SELECT * FROM teachers ORDER BY created_at DESC");
    res.status(200).json({ teachers: teachersResult.rows });
  } catch (err) {
    console.error("Error fetching teachers:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


router.get("/students", async (req, res) => {
  try {
    const studentsResult = await pool.query("SELECT * FROM students ORDER BY id DESC");
    res.status(200).json(studentsResult.rows);
  } catch (err) {
    console.error("Error fetching students:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});




// ================== Manage Users ==================
async function updateUserStatus(table, id, action) {
  switch (action) {
    case "deactivate": await pool.query(`UPDATE ${table} SET active = false WHERE id = $1`, [id]); break;
    case "activate": await pool.query(`UPDATE ${table} SET active = true WHERE id = $1`, [id]); break;
    case "delete": await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]); break;
    default: throw new Error("Invalid action");
  }
}

["admins", "teachers", "students"].forEach(table => {
  router.patch(`/${table}/:id/status`, authenticateSuperAdmin, requireSuperAdmin, async (req, res) => {
    const { id } = req.params;
    const { action } = req.body;

    try {
      await updateUserStatus(table, id, action);
      sendResponse(res, 200, { success: true, message: `${table.slice(0,-1)} ${action} successful` });
    } catch (err) {
      console.error(`❌ Manage ${table} error:`, err.message);
      sendResponse(res, err.message === "Invalid action" ? 400 : 500, { success: false, message: err.message });
    }
  });
});

// ================== Send Emails / Broadcast ==================
router.post("/send-email", authenticateSuperAdmin, requireSuperAdmin, async (req, res) => {
  const { toGroup, subject, body } = req.body;
  if (!toGroup || !subject || !body) return sendResponse(res, 400, { success: false, message: "All fields required" });

  try {
    let recipientsQuery = "";
    let queryParams = [];

    switch (toGroup) {
      case "all":
        recipientsQuery = "SELECT email FROM admins UNION SELECT email FROM teachers UNION SELECT email FROM students";
        break;
      case "admins":
      case "teachers":
      case "students":
        recipientsQuery = `SELECT email FROM ${toGroup}`;
        break;
      default:
        if (toGroup.startsWith("school:")) {
          const schoolname = toGroup.split(":")[1];
          recipientsQuery = `
            SELECT email FROM admins WHERE schoolname=$1
            UNION
            SELECT email FROM teachers WHERE school_id IN (SELECT id FROM admins WHERE schoolname=$1)
            UNION
            SELECT email FROM students WHERE school_id IN (SELECT id FROM admins WHERE schoolname=$1)
          `;
          queryParams = [schoolname];
        }
        break;
    }

    const result = await pool.query(recipientsQuery, queryParams);
    const recipients = result.rows.map(r => r.email);

    for (const email of recipients) {
      await transporter.sendMail({ from: process.env.EMAIL_USER, to: email, subject, html: body });
    }

    await pool.query("INSERT INTO emails_logs (to_group, subject, body) VALUES ($1, $2, $3)", [toGroup, subject, body]);

    sendResponse(res, 200, { success: true, message: "Emails sent successfully", sentTo: recipients.length });
  } catch (err) {
    console.error("❌ Send emails error:", err.message);
    sendResponse(res, 500, { success: false, message: "Internal Server Error" });
  }
});

// ================== Ads Management ==================
router.post("/ads", authenticateSuperAdmin, requireSuperAdmin, async (req, res) => {
  const { title, body, targetGroup } = req.body;
  if (!title || !body || !targetGroup) return sendResponse(res, 400, { success: false, message: "All fields required" });

  try {
    const result = await pool.query("INSERT INTO ads (title, body, target_group) VALUES ($1, $2, $3) RETURNING *", [title, body, targetGroup]);
    sendResponse(res, 201, { success: true, message: "Ad created successfully", ad: result.rows[0] });
  } catch (err) {
    console.error("❌ Ads creation error:", err.message);
    sendResponse(res, 500, { success: false, message: "Internal Server Error" });
  }
});

router.get("/ads", authenticateSuperAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM ads ORDER BY created_at DESC");
    sendResponse(res, 200, { success: true, ads: result.rows });
  } catch (err) {
    console.error("❌ Fetch ads error:", err.message);
    sendResponse(res, 500, { success: false, message: "Internal Server Error" });
  }
});

router.delete("/ads/:id", authenticateSuperAdmin, requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM ads WHERE id=$1", [id]);
    sendResponse(res, 200, { success: true, message: "Ad deleted successfully" });
  } catch (err) {
    console.error("❌ Delete ad error:", err.message);
    sendResponse(res, 500, { success: false, message: "Internal Server Error" });
  }
});

// ================== System Statistics ==================
router.get("/stats", authenticateSuperAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const [admins, teachers, students, superAdmins, ads, emails] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM admins"),
      pool.query("SELECT COUNT(*) FROM teachers"),
      pool.query("SELECT COUNT(*) FROM students"),
      pool.query("SELECT COUNT(*) FROM super_admins"),
      pool.query("SELECT COUNT(*) FROM ads"),
      pool.query("SELECT COUNT(*) FROM emails_logs"),
    ]);

    sendResponse(res, 200, {
      success: true,
      stats: {
        totalAdmins: admins.rows[0].count,
        totalTeachers: teachers.rows[0].count,
        totalStudents: students.rows[0].count,
        totalSuperAdmins: superAdmins.rows[0].count,
        totalAds: ads.rows[0].count,
        totalEmails: emails.rows[0].count,
      },
    });
  } catch (err) {
    console.error("❌ Stats error:", err.message);
    sendResponse(res, 500, { success: false, message: "Internal Server Error" });
  }
});

module.exports = router;
