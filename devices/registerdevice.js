const express = require('express');
const router = express.Router();
const pool = require('../db');

// Register a device
router.post('/register', async (req, res) => {
  const { device_uid, device_name, api_key } = req.body;
  if (!device_uid || !device_name || !api_key) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const existing = await pool.query(
      'SELECT * FROM devices WHERE device_uid = $1 AND api_key = $2',
      [device_uid, api_key]
    );

    if (existing.rows.length > 0) {
      return res.status(200).json({ message: 'Device already registered.' });
    }

    await pool.query(
      'INSERT INTO devices (device_uid, device_name, api_key) VALUES ($1, $2, $3)',
      [device_uid, device_name, api_key]
    );

    res.status(201).json({ message: 'Device registered successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get devices for an API key
router.get('/', async (req, res) => {
  const { api_key } = req.query;
  if (!api_key) return res.status(400).json({ error: 'Missing API key' });

  try {
    const result = await pool.query(
      'SELECT * FROM devices WHERE api_key = $1',
      [api_key]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});


// Delete a device by UID and API key
router.delete('/:device_uid', async (req, res) => {
  const { device_uid } = req.params;
  const { api_key } = req.body;

  if (!api_key || !device_uid) {
    return res.status(400).json({ error: 'Missing device UID or API key' });
  }

  try {
    const result = await pool.query(
      'DELETE FROM devices WHERE device_uid = $1 AND api_key = $2 RETURNING *',
      [device_uid, api_key]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Device not found or unauthorized' });
    }

    res.json({ message: 'Device deleted successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete device' });
  }
});

module.exports = router;
