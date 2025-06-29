const express = require('express');
const router = express.Router();
const pool = require('../db');

// Register device
router.post('/register', async (req, res) => {
  const { device_uid, device_name, api_key } = req.body;
  if (!device_uid || !device_name || !api_key) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    const existing = await pool.query(
      `SELECT * FROM devices WHERE device_uid = $1 AND api_key = $2`,
      [device_uid, api_key]
    );

    if (existing.rows.length > 0) {
      return res.status(200).json({ message: "Device already registered." });
    }

    const result = await pool.query(
      `INSERT INTO devices (device_uid, device_name, api_key) VALUES ($1, $2, $3) RETURNING *`,
      [device_uid, device_name, api_key]
    );

    res.status(201).json({ message: "Device registered successfully.", device: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Fetch all devices for the API key
router.get('/', async (req, res) => {
  const { api_key } = req.query;
  if (!api_key) return res.status(400).json({ error: "API key required" });

  try {
    const result = await pool.query(`SELECT * FROM devices WHERE api_key = $1`, [api_key]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error fetching devices" });
  }
});

module.exports = router;
