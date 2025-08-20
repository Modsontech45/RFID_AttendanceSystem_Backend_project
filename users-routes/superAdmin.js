const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { authenticateSuperAdmin } = require("../middleware/auth");

require("dotenv").config();
const router = express.Router();

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
    return res.status(403).json({ success: false, message: "Access denied: Super Admins only" });
  }
  next();
}

// ================== Super Admin Sign Up ==================
router.post("/signup", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ success: false, message: "All fields are required" });

  try {
    const countResult = await pool.query("SELECT COUNT(*) FROM super_admins");
    const count = parseInt(countResult.rows[0].count);

    if (count >= 3) return res.status(400).json({ success: false, message: "Only 3 super admins allowed" });

    // Require auth if not first super-admin
    if (count > 0) {
      if (!req.headers.authorization)
        return res.status(401).json({ success: false, message: "Authorization required" });

      try {
        const token = req.headers.authorization.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.role !== "super_admin")
          return res.status(403).json({ success: false, message: "Only a super-admin can add another" });
      } catch (err) {
        return res.status(401).json({ success: false, message: "Invalid token" });
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

    const verifyLink = `https://rfid-attendance-synctuario-theta.vercel.app/super-admin/verify/${verificationToken}`;
    await transporter.sendMail({
      from: `"System" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Verify your Super Admin account",
      html: `<p>Welcome ${username},</p>
             <p>Click the link below to verify your account:</p>
             <a href="${verifyLink}" target="_blank">${verifyLink}</a>`,
    });

    res.status(201).json({ success: true, message: "Super Admin registered. Please verify your email.", superAdmin: insertResult.rows[0] });
  } catch (err) {
    console.error("❌ Error signing up super admin:", err.message);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

// ================== Super Admin Login ==================
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, message: "Email and password required" });

  try {
    const result = await pool.query("SELECT * FROM super_admins WHERE email = $1", [email]);
    const superAdmin = result.rows[0];

    if (!superAdmin) return res.status(401).json({ success: false, message: "Invalid credentials" });
    if (!superAdmin.verified) return res.status(403).json({ success: false, message: "Please verify your email first" });

    const match = await bcrypt.compare(password, superAdmin.password);
    if (!match) return res.status(401).json({ success: false, message: "Invalid credentials" });

    const token = jwt.sign({ id: superAdmin.id, role: "super_admin" }, process.env.JWT_SECRET, { expiresIn: "1d" });

    res.json({ success: true, message: "Login successful", token, superAdmin: { id: superAdmin.id, email: superAdmin.email, username: superAdmin.username } });
  } catch (err) {
    console.error("❌ Super Admin login error:", err.message);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

// ================== Request Password Reset ==================
router.post("/request-password-reset", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: "Email is required" });

  try {
    const result = await pool.query("SELECT * FROM super_admins WHERE email = $1", [email]);
    const superAdmin = result.rows[0];
    if (!superAdmin) return res.status(404).json({ success: false, message: "Super Admin not found" });

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetExpiry = new Date(Date.now() + 1000 * 60 * 30); // 30 min

    await pool.query("UPDATE super_admins SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3", [resetToken, resetExpiry, superAdmin.id]);

    const resetLink = `https://rfid-attendance-synctuario-theta.vercel.app/super-admin/reset-password?token=${resetToken}`;
    await transporter.sendMail({ from: `"System" <${process.env.EMAIL_USER}>`, to: email, subject: "Password Reset", html: `<p>Click to reset your password:</p><a href="${resetLink}">${resetLink}</a>` });

    res.json({ success: true, message: "Password reset email sent" });
  } catch (err) {
    console.error("❌ Error requesting password reset:", err.message);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

// ================== Reset Password ==================
router.post("/reset-password/:token", async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;
  if (!password) return res.status(400).json({ success: false, message: "Password is required" });

  try {
    const result = await pool.query("SELECT * FROM super_admins WHERE reset_token = $1 AND reset_token_expiry > NOW()", [token]);
    const superAdmin = result.rows[0];
    if (!superAdmin) return res.status(400).json({ success: false, message: "Invalid or expired token" });

    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query("UPDATE super_admins SET password = $1, reset_token = NULL, reset_token_expiry = NULL WHERE id = $2", [hashedPassword, superAdmin.id]);

    res.json({ success: true, message: "Password has been reset successfully" });
  } catch (err) {
    console.error("❌ Error resetting password:", err.message);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

// ================== Verify Email ==================
router.get("/verify/:token", async (req, res) => {
  const { token } = req.params;
  try {
    const result = await pool.query("UPDATE super_admins SET verified = true, verification_token = NULL WHERE verification_token = $1 RETURNING *", [token]);
    if (result.rowCount === 0) return res.status(400).json({ success: false, message: "Invalid or expired token" });
    res.json({ success: true, message: "Email verified successfully", superAdmin: result.rows[0] });
  } catch (err) {
    console.error("❌ Error verifying email:", err.message);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});


// ================== Fetch All Users ==================
router.get("/admins", authenticateSuperAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT id, username, email, schoolname, type, active, created_at FROM admins");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/teachers", authenticateSuperAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT id, name, email, school_id, active, created_at FROM teachers");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/students", authenticateSuperAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT id, name, email, class, school_id, active, created_at FROM students");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ================== Manage Users ==================
router.patch("/admins/:id/status", authenticateSuperAdmin, requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { action } = req.body;

  try {
    if (action === "deactivate") await pool.query("UPDATE admins SET active = false WHERE id = $1", [id]);
    else if (action === "activate") await pool.query("UPDATE admins SET active = true WHERE id = $1", [id]);
    else if (action === "delete") await pool.query("DELETE FROM admins WHERE id = $1", [id]);
    else return res.status(400).json({ message: "Invalid action" });

    res.json({ message: `Admin ${action} successful` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ================== Send Emails / Broadcast ==================
router.post("/send-email", authenticateSuperAdmin, requireSuperAdmin, async (req, res) => {
  const { toGroup, subject, body } = req.body; // toGroup: "all", "admins", "teachers", "students", "school:<schoolname>"
  if (!toGroup || !subject || !body) return res.status(400).json({ message: "All fields required" });

  try {
    let recipientsQuery = "";
    switch (toGroup) {
      case "all": recipientsQuery = "SELECT email FROM admins UNION SELECT email FROM teachers UNION SELECT email FROM students"; break;
      case "admins": recipientsQuery = "SELECT email FROM admins"; break;
      case "teachers": recipientsQuery = "SELECT email FROM teachers"; break;
      case "students": recipientsQuery = "SELECT email FROM students"; break;
      default:
        if (toGroup.startsWith("school:")) {
          const schoolname = toGroup.split(":")[1];
          recipientsQuery = `SELECT email FROM admins WHERE schoolname=$1 UNION SELECT email FROM teachers WHERE school_id IN (SELECT id FROM admins WHERE schoolname=$1) UNION SELECT email FROM students WHERE school_id IN (SELECT id FROM admins WHERE schoolname=$1)`;
        }
    }

    let recipients = [];
    if (toGroup.startsWith("school:")) {
      const schoolname = toGroup.split(":")[1];
      const result = await pool.query(recipientsQuery, [schoolname]);
      recipients = result.rows.map(r => r.email);
    } else {
      const result = await pool.query(recipientsQuery);
      recipients = result.rows.map(r => r.email);
    }

    for (const email of recipients) {
      await transporter.sendMail({ from: process.env.EMAIL_USER, to: email, subject, html: body });
    }

    await pool.query("INSERT INTO emails_logs (to_group, subject, body) VALUES ($1, $2, $3)", [toGroup, subject, body]);
    res.json({ message: "Emails sent successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ================== Ads Management ==================
router.post("/ads", authenticateSuperAdmin, requireSuperAdmin, async (req, res) => {
  const { title, body, targetGroup } = req.body;
  if (!title || !body || !targetGroup) return res.status(400).json({ message: "All fields required" });

  try {
    await pool.query("INSERT INTO ads (title, body, target_group) VALUES ($1, $2, $3)", [title, body, targetGroup]);
    res.json({ message: "Ad created successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ================== System Statistics ==================
router.get("/stats", authenticateSuperAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const admins = await pool.query("SELECT COUNT(*) FROM admins");
    const teachers = await pool.query("SELECT COUNT(*) FROM teachers");
    const students = await pool.query("SELECT COUNT(*) FROM students");
    const superAdmins = await pool.query("SELECT COUNT(*) FROM super_admins");

    res.json({
      totalAdmins: admins.rows[0].count,
      totalTeachers: teachers.rows[0].count,
      totalStudents: students.rows[0].count,
      totalSuperAdmins: superAdmins.rows[0].count
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

module.exports = router;
