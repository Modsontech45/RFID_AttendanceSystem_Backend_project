const express = require('express');
const pool = require('../db');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const attendances = await pool.query('SELECT * FROM attendance');
    res.json(attendances.rows);
  } catch (err) {
    console.error("Error fetching attendances", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
