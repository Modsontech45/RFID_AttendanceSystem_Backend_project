const express = require("express");
const pool = require("../db");
const router = express.Router();
const verifyApiKey = require("../middleware/verifyApiKey");
const nodemailer = require('nodemailer');
const getMessage = require("../utils/messages");

// GET all students
router.get("/", verifyApiKey, async (req, res) => {
  const lang = req.headers['accept-language']?.toLowerCase().split(',')[0] || 'en';

  try {
    const requesterApiKey = req.user.api_key;

    if (!requesterApiKey) {
      return res.status(403).json({ message: getMessage(lang, 'students.noApiKey') });
    }

    const studentsResult = await pool.query(
      "SELECT * FROM students WHERE api_key = $1",
      [requesterApiKey]
    );

    if (studentsResult.rows.length === 0) {
      return res.status(403).json({ message: getMessage(lang, 'students.noStudentsFound') });
    }

    res.status(200).json(studentsResult.rows);

  } catch (err) {
    console.error("Error fetching students:", err);
    res.status(500).json({ error: getMessage(lang, 'common.internalError') });
  }
});

// PATCH: Update UID and notify
router.patch("/:oldUid/update-uid", async (req, res) => {
  const { oldUid } = req.params;
  const { newUid } = req.body;
  const lang = req.headers['accept-language']?.toLowerCase().split(',')[0] || 'en';

  if (!oldUid || !newUid || oldUid === newUid) {
    return res.status(400).json({ error: getMessage(lang, 'students.invalidUidUpdate') });
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
    if (!studentEmail) throw new Error(getMessage(lang, 'students.studentNotFound'));

    const updateStudent = await client.query(
      "UPDATE students SET uid = $1 WHERE uid = $2",
      [newUid, oldUid]
    );
    if (updateStudent.rowCount === 0) throw new Error(getMessage(lang, 'students.studentNotFound'));

    await transporter.sendMail({
      from: `"Attendance App SyncTuario" <${process.env.EMAIL_USER}>`,
      to: studentEmail,
      subject: getMessage(lang, 'students.uidUpdateSubject'),
      text: `${getMessage(lang, 'students.uidUpdateText', oldUid, newUid)}

${getMessage(lang, 'students.contactSupport')}
`,
    });

    await client.query(
      "UPDATE attendance SET uid = $1 WHERE uid = $2",
      [newUid, oldUid]
    );

    await client.query("COMMIT");
    res.status(200).json({
      message: getMessage(lang, 'students.uidUpdateSuccess', studentEmail)
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("UID update failed:", error.message);
    res.status(500).json({ error: getMessage(lang, 'students.uidUpdateFailed') + ": " + error.message });
  } finally {
    client.release();
  }
});

module.exports = router;
