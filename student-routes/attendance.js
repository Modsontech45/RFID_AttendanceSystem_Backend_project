const express = require('express');
const pool = require('../db');
const router = express.Router();
const verifyApiKey = require('../middleware/verifyApiKey'); // ✅ import

// GET attendance records filtered by API key
router.get('/', verifyApiKey, async (req, res) => {
  try {
    const requesterApiKey = req.user.api_key;

    if (!requesterApiKey) {
      return res.status(403).json({ message: "No API key found" });
    }

    // Only return attendance records for students with matching api_key
    const attendances = await pool.query(
      `SELECT * FROM attendance WHERE api_key = $1`,
      [requesterApiKey]
    );

    if (attendances.rows.length === 0) {
      return res.status(403).json({ message: "No attendance data for your API key" });
    }

    res.json(attendances.rows);
  } catch (err) {
    console.error("Error fetching attendances:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
