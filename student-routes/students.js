const express = require("express");
const pool = require("../db");
const router = express.Router();
const verifyApiKey = require("../middleware/verifyApiKey");
const nodemailer = require('nodemailer');

router.get("/", verifyApiKey, async (req, res) => {
  try {
    // Get the api_key from the logged in user
    const requesterApiKey = req.user.api_key;
    const requesterRole = req.user.role;

    if (!requesterApiKey) {
      return res.status(403).json({ message: "No API key found for user" });
    }

    // Fetch students where api_key matches the requester’s api_key
    const studentsResult = await pool.query(
      "SELECT * FROM students WHERE api_key = $1",
      [requesterApiKey]
    );

    if (studentsResult.rows.length === 0) {
      return res.status(403).json({ message: "No students found with your API key" });
    }

    res.status(200).json(studentsResult.rows);

  } catch (err) {
    console.error("Error fetching students:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


// Update UID
router.patch("/:oldUid/update-uid", async (req, res) => {
  const { oldUid } = req.params;
  const { newUid } = req.body;

  if (!oldUid || !newUid || oldUid === newUid) {
    return res.status(400).json({ error: "Invalid UID update request." });
  }

  const client = await pool.connect();
 const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

  try {
    await client.query("BEGIN");

    const userEmail = await client.query(
      "SELECT email FROM students WHERE UPPER(uid) = UPPER($1)",
      [oldUid]
    );
    const studentEmail = userEmail.rows[0]?.email;
    if (!studentEmail) throw new Error("Student not found");

    const updateStudent = await client.query(
      "UPDATE students SET uid = $1 WHERE uid = $2",
      [newUid, oldUid]
    );
    if (updateStudent.rowCount === 0) throw new Error("Student not found");

    await transporter.sendMail({
      from: `"Attendance App SyncTuario" <${process.env.EMAIL_USER}>`,
      to: studentEmail,
      subject: "UID Update Confirmation",
      text: `Your UID has been successfully updated from ${oldUid} to ${newUid}.

If you did not authorize this change or believe it was made in error, please contact your school immediately. You can reach us at **rocklegacy@gmail.com** or call **+228 93 94 60 43** for assistance.
`,
    });

    const updateAttendance = await client.query(
      "UPDATE attendance SET uid = $1 WHERE uid = $2",
      [newUid, oldUid]
    );

    await client.query("COMMIT");
    res
      .status(200)
      .json({ message: `UID updated and attendance records cascaded email sent to . ${studentEmail }` });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("UID update failed:", error.message);
    res.status(500).json({ error: "Update failed: " + error.message });
  } finally {
    client.release();
  }
});

module.exports = router;
