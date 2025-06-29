const express = require('express');
const router = express.Router();
const pool = require('../db'); // PostgreSQL pool setup

// POST /devices/register
router.post('/devices/register', async (req, res) => {
  const { device_uid, device_name, api_key } = req.body;

  if (!device_uid || !device_name || !api_key) {
    return res.status(400).json({ error: "Missing device_uid, device_name, or api_key." });
  }

  try {
    const existing = await pool.query(
      `SELECT * FROM devices WHERE device_uid = $1 AND api_key = $2`,
      [device_uid, api_key]
    );

    if (existing.rows.length > 0) {
      return res.status(200).json({ message: "Device already registered.", device: existing.rows[0] });
    }

    const result = await pool.query(
      `INSERT INTO devices (device_uid, device_name, api_key)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [device_uid, device_name, api_key]
    );

    res.status(201).json({ message: "Device registered successfully.", device: result.rows[0] });
  } catch (err) {
    console.error("Device registration error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

// 👇 Export the router so it can be used in app.js
module.exports = router;
