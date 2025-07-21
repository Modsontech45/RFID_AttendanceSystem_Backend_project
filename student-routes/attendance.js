const express = require('express');
const pool = require('../db');
const router = express.Router();
const verifyApiKey = require('../middleware/verifyApiKey');
const getMessage = require('../utils/messages');
const { checkSubscription } = require('../middleware/auth');
// GET attendance records filtered by API key
router.get('/', verifyApiKey, async (req, res) => {
  const lang = req.headers["accept-language"]?.toLowerCase().split(",")[0] || "en";
 const admin = req.admin;
  try {
    const requesterApiKey = req.user.api_key;

    if (!requesterApiKey) {
      return res.status(403).json({ message: getMessage(lang, "attendance.noApiKey") });
    }
    // Check subscription status
async function checkSubscription(admin) {
  if (!admin || !admin.subscription_status || !admin.subscription_expires_at) {
    console.error("Invalid admin object passed to checkSubscription:", admin);
    return "expired"; // or throw error, based on logic
  }

  const currentDate = new Date();
  const expiryDate = new Date(admin.subscription_expires_at);

  if (admin.subscription_status === "active" && expiryDate > currentDate) {
    return "active";
  } else {
    return "expired";
  }
}


    const attendances = await pool.query(
      `SELECT * FROM attendance WHERE api_key = $1`,
      [requesterApiKey]
    );

    if (attendances.rows.length === 0) {
      return res.status(403).json({ message: getMessage(lang, "attendance.noneForKey") });
    }

    res.json(attendances.rows);
  } catch (err) {
    console.error("Error fetching attendances:", err);
    res.status(500).json({ error: getMessage(lang, "attendance.serverError") });
  }
});

module.exports = router;
