const express = require("express");
const pool = require("../db");
const {
  authenticateAdmin,
  authenticateTeacher,
} = require("../middleware/auth");
const { sendAcceptanceEmail } = require("../mailer");
const jwt = require("jsonwebtoken");
const SECRET_KEY = process.env.JWT_SECRET || "Fj7k_8sR3pB!gD2eMZrXqLp6vNwT0zC";

const router = express.Router();

// Admin adds a new teacher by email, sends acceptance email
router.post("/add", authenticateAdmin, async (req, res) => {
  const { email } = req.body;
  const adminId = req.admin.id;

  try {
    const exists = await pool.query("SELECT 1 FROM teachers WHERE email = $1", [
      email,
    ]);
    if (exists.rows.length > 0)
      return res.status(409).json({ message: "Teacher already exists" });

    const result = await pool.query(
      "INSERT INTO teachers (email, added_by) VALUES ($1, $2) RETURNING *",
      [email, adminId]
    );
    const subject = "Welcome to the Team";
    const message = `Hello! You have been added to the system as a teacher.
You can now log in using your email.
We're happy to have you here!
Login link: https://www.rfid-attendance-synctuario-theta.vercel.app`;

    await sendAcceptanceEmail(email, subject, message);

    res
      .status(201)
      .json({ message: "Teacher added and notified", teacher: result.rows[0] });
  } catch (err) {
    console.error("Error adding teacher:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Teacher login (generate JWT token)
router.post("/login", async (req, res) => {
  const { email } = req.body;

  try {
    const result = await pool.query("SELECT * FROM teachers WHERE email = $1", [
      email,
    ]);
    if (result.rows.length === 0)
      return res.status(401).json({ message: "Email not found" });

    const teacher = result.rows[0];

    const token = jwt.sign(
      { id: teacher.id, role: teacher.role || "teacher" },
      SECRET_KEY,
      { expiresIn: "7d" }
    );

    res.status(200).json({ message: "Login successful", token, teacher });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


router.get("/all", authenticateAdmin, async (req, res) => {
  const adminId = req.admin.id;

  try {
    const result = await pool.query(
      "SELECT * FROM teachers WHERE added_by = $1 ORDER BY created_at DESC",
      [adminId]
    );

    res.status(200).json({ teachers: result.rows });
  } catch (err) {
    console.error("Error fetching teachers:", err);
    res.status(500).json({ message: "Server error" });
  }
});


router.delete("/:id", authenticateAdmin, async (req, res) => {
  const teacherId = req.params.id;
  const adminId = req.admin.id;

  try {

    const result = await pool.query(
      "SELECT email FROM teachers WHERE id = $1 AND added_by = $2",
      [teacherId, adminId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Teacher not found or unauthorized action." });
    }

    const { email } = result.rows[0];


    await pool.query("DELETE FROM teachers WHERE id = $1", [teacherId]);


    const subject = "Teacher Account Removal";
    const message = "You have been removed from the system by your admin. If you believe this is a mistake, please contact them.";

    await sendEmail(email, subject, message);

    res.status(200).json({ message: "Teacher deleted successfully." });
  } catch (err) {
    console.error("Error deleting teacher:", err);
    res.status(500).json({ message: "An error occurred while deleting the teacher." });
  }
});


router.get("/me", authenticateTeacher, async (req, res) => {
  const teacherId = req.teacher.id;

  try {
    const result = await pool.query("SELECT * FROM teachers WHERE id = $1", [
      teacherId,
    ]);
    if (result.rows.length === 0)
      return res.status(404).json({ message: "Teacher not found" });

    res.status(200).json({ teacher: result.rows[0] });
  } catch (err) {
    console.error("Error fetching teacher profile:", err);
    res.status(500).json({ message: "Server error" });
  }
});


router.patch("/me", authenticateTeacher, async (req, res) => {
  const teacherId = req.teacher.id;
  const { full_name, bio, picture } = req.body;

  if (!full_name && !bio && !picture) {
    return res.status(400).json({ message: "Nothing to update" });
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

    res
      .status(200)
      .json({ message: "Profile updated", teacher: result.rows[0] });
  } catch (err) {
    console.error("Error updating teacher profile:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Admin gets teacher by id (must come after /me)
router.get("/:id", authenticateAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query("SELECT * FROM teachers WHERE id = $1", [
      id,
    ]);
    if (result.rows.length === 0)
      return res.status(404).json({ message: "Teacher not found" });

    res.status(200).json({ teacher: result.rows[0] });
  } catch (err) {
    console.error("Error fetching teacher:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
