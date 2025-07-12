const express = require("express");
const pool = require("../db");
const verifyApiKey = require("../middleware/verifyApiKey");
const { authenticateAdmin, authenticateTeacher } = require("../middleware/auth");
const { sendAcceptanceEmail, sendEmail } = require("../mailer");
const jwt = require("jsonwebtoken");
const getMessage = require("../utils/messages");

const SECRET_KEY = process.env.JWT_SECRET || "Fj7k_8sR3pB!gD2eMZrXqLp6vNwT0zC";
const router = express.Router();

// Admin adds a new teacher
router.post("/add", authenticateAdmin, async (req, res) => {
  const { email } = req.body;
  const adminId = req.admin.id;
  const lang = req.headers['accept-language']?.toLowerCase().split(',')[0] || 'en';

  try {
    const exists = await pool.query("SELECT 1 FROM teachers WHERE email = $1", [email]);
    if (exists.rows.length > 0)
      return res.status(409).json({ message: getMessage(lang, 'teacher.exists') });

    const adminData = await pool.query("SELECT api_key FROM admins WHERE id = $1", [adminId]);
    const adminApiKey = adminData.rows[0]?.api_key;
    if (!adminApiKey) return res.status(400).json({ message: getMessage(lang, 'teacher.noApiKey') });

    const result = await pool.query(
      "INSERT INTO teachers (email, added_by, api_key) VALUES ($1, $2, $3) RETURNING *",
      [email, adminId, adminApiKey]
    );

    const subject = getMessage(lang, 'teacher.welcomeSubject');
    const message = getMessage(lang, 'teacher.welcomeBody');

    await sendAcceptanceEmail(email, subject, message);

    res.status(201).json({
      message: getMessage(lang, 'teacher.added'),
      teacher: result.rows[0]
    });

  } catch (err) {
    console.error("❌ Error adding teacher:", err);
    res.status(500).json({ message: getMessage(lang, 'common.internalError') });
  }
});

// Teacher login
router.post("/login", async (req, res) => {
  const { email } = req.body;
  const lang = req.headers['accept-language']?.toLowerCase().split(',')[0] || 'en';

  try {
    const result = await pool.query("SELECT * FROM teachers WHERE email = $1", [email]);
    if (result.rows.length === 0)
      return res.status(401).json({ message: getMessage(lang, 'teacher.notFound') });

    const teacher = result.rows[0];
    const token = jwt.sign(
      { id: teacher.id, role: teacher.role || "teacher" },
      SECRET_KEY,
      { expiresIn: "7d" }
    );

    res.status(200).json({
      message: getMessage(lang, 'teacher.loginSuccess'),
      token,
      teacher
    });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: getMessage(lang, 'common.internalError') });
  }
});

// Get all teachers (admin only)
router.get("/all", verifyApiKey, async (req, res) => {
  const requester = req.user;
  const lang = req.headers['accept-language']?.toLowerCase().split(',')[0] || 'en';

  if (requester.role !== "admin") {
    return res.status(403).json({ message: getMessage(lang, 'teacher.adminOnly') });
  }

  try {
    const result = await pool.query(
      `SELECT * FROM teachers WHERE added_by = $1 AND api_key = $2 ORDER BY created_at DESC`,
      [requester.id, requester.api_key]
    );
    res.status(200).json({ teachers: result.rows });
  } catch (err) {
    console.error("Error fetching teachers:", err);
    res.status(500).json({ message: getMessage(lang, 'common.internalError') });
  }
});

// Delete a teacher
router.delete("/:id", authenticateAdmin, async (req, res) => {
  const teacherId = req.params.id;
  const adminId = req.admin.id;
  const lang = req.headers['accept-language']?.toLowerCase().split(',')[0] || 'en';

  try {
    const result = await pool.query(
      "SELECT email FROM teachers WHERE id = $1 AND added_by = $2",
      [teacherId, adminId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: getMessage(lang, 'teacher.notFoundOrUnauthorized') });
    }

    const { email } = result.rows[0];
    await pool.query("DELETE FROM teachers WHERE id = $1", [teacherId]);

    try {
      const subject = getMessage(lang, 'teacher.removalSubject');
      const message = getMessage(lang, 'teacher.removalBody');
      await sendEmail(email, subject, message);
    } catch (emailErr) {
      console.error("Email failed:", emailErr);
    }

    res.status(200).json({ message: getMessage(lang, 'teacher.deleted') });
  } catch (err) {
    console.error("Error deleting teacher:", err);
    res.status(500).json({ message: getMessage(lang, 'common.internalError') });
  }
});

// Get current teacher profile
router.get("/me", authenticateTeacher, async (req, res) => {
  const teacherId = req.teacher.id;
  const lang = req.headers['accept-language']?.toLowerCase().split(',')[0] || 'en';

  try {
    const result = await pool.query("SELECT * FROM teachers WHERE id = $1", [teacherId]);
    if (result.rows.length === 0)
      return res.status(404).json({ message: getMessage(lang, 'teacher.notFound') });

    res.status(200).json({ teacher: result.rows[0] });
  } catch (err) {
    console.error("Error fetching profile:", err);
    res.status(500).json({ message: getMessage(lang, 'common.internalError') });
  }
});

// Update teacher profile
router.patch("/me", authenticateTeacher, async (req, res) => {
  const teacherId = req.teacher.id;
  const { full_name, bio, picture } = req.body;
  const lang = req.headers['accept-language']?.toLowerCase().split(',')[0] || 'en';

  if (!full_name && !bio && !picture) {
    return res.status(400).json({ message: getMessage(lang, 'teacher.nothingToUpdate') });
  }

  try {
    const fields = [];
    const values = [];
    let index = 1;

    if (full_name !== undefined) {
      fields.push(`full_name = $${index++}`);
      values.push(full_name);
    }
    if (bio !== undefined) {
      fields.push(`bio = $${index++}`);
      values.push(bio);
    }
    if (picture !== undefined) {
      fields.push(`picture = $${index++}`);
      values.push(picture);
    }

    values.push(teacherId);

    const query = `
      UPDATE teachers SET ${fields.join(", ")}
      WHERE id = $${index}
      RETURNING *;
    `;

    const result = await pool.query(query, values);
    res.status(200).json({
      message: getMessage(lang, 'teacher.updated'),
      teacher: result.rows[0]
    });
  } catch (err) {
    console.error("Error updating profile:", err);
    res.status(500).json({ message: getMessage(lang, 'common.internalError') });
  }
});

// Get specific teacher by ID (admin only)
router.get("/:id", authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const lang = req.headers['accept-language']?.toLowerCase().split(',')[0] || 'en';

  try {
    const result = await pool.query("SELECT * FROM teachers WHERE id = $1", [id]);
    if (result.rows.length === 0)
      return res.status(404).json({ message: getMessage(lang, 'teacher.notFound') });

    res.status(200).json({ teacher: result.rows[0] });
  } catch (err) {
    console.error("Error fetching teacher:", err);
    res.status(500).json({ message: getMessage(lang, 'common.internalError') });
  }
});

module.exports = router;
