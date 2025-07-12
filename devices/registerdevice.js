const express = require('express');
const router = express.Router();
const pool = require('../db');
const getMessage = require('../utils/messages');

// Register a device
router.post('/register', async (req, res) => {
  const { device_uid, device_name, api_key } = req.body;
  const lang = req.headers['accept-language'] || 'en';

  if (!device_uid || !device_name || !api_key) {
    return res.status(400).json({ error: getMessage(lang, 'device.missing_fields') });
  }

  try {
    const existing = await pool.query(
      'SELECT * FROM devices WHERE device_uid = $1 AND api_key = $2',
      [device_uid, api_key]
    );

    if (existing.rows.length > 0) {
      return res.status(200).json({ message: getMessage(lang, 'device.already_registered') });
    }

    await pool.query(
      'INSERT INTO devices (device_uid, device_name, api_key) VALUES ($1, $2, $3)',
      [device_uid, device_name, api_key]
    );

    res.status(201).json({ message: getMessage(lang, 'device.created') });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: getMessage(lang, 'errors.internal_server') });
  }
});

// Get devices
router.get('/', async (req, res) => {
  const { api_key } = req.query;
  const lang = req.headers['accept-language'] || 'en';

  if (!api_key) {
    return res.status(400).json({ error: getMessage(lang, 'device.missing_api_key') });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM devices WHERE api_key = $1',
      [api_key]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: getMessage(lang, 'device.fetch_failed') });
  }
});

// Delete a device
router.delete('/:device_uid', async (req, res) => {
  const { device_uid } = req.params;
  const { api_key } = req.body;
  const lang = req.headers['accept-language'] || 'en';

  if (!api_key || !device_uid) {
    return res.status(400).json({ error: getMessage(lang, 'device.missing_uid_or_api') });
  }

  try {
    const result = await pool.query(
      'DELETE FROM devices WHERE device_uid = $1 AND api_key = $2 RETURNING *',
      [device_uid, api_key]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: getMessage(lang, 'device.not_found_or_unauthorized') });
    }

    res.json({ message: getMessage(lang, 'device.deleted') });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: getMessage(lang, 'device.delete_failed') });
  }
});

// Mark device as online
router.post('/online', async (req, res) => {
  const { device_uid, api_key } = req.body;
  const lang = req.headers['accept-language'] || 'en';

  if (!device_uid || !api_key) {
    return res.status(400).json({ error: getMessage(lang, 'device.missing_uid_or_api') });
  }

  try {
    const result = await pool.query(`
      UPDATE devices
      SET last_seen = NOW()
      WHERE device_uid = $1 AND api_key = $2
      RETURNING last_seen
    `, [device_uid, api_key]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: getMessage(lang, 'device.not_found_or_invalid_api') });
    }

    const lastSeen = result.rows[0].last_seen;
    res.json({
      message: getMessage(lang, 'device.marked_online'),
      last_seen: lastSeen
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: getMessage(lang, 'device.update_failed') });
  }
});

module.exports = router;
