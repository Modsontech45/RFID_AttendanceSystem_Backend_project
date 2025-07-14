const express = require('express');
const router = express.Router();


// GET /time-settings?api_key=your_api_key
router.get('/time-settings', async (req, res) => {
  const api_key = req.query.api_key || req.headers['x-api-key'];
  if (!api_key) {
    return res.status(400).json({ error: 'API key is required' });
  }

  try {
    const result = await pool.query(
      'SELECT sign_in_start, sign_in_end, sign_out_start, sign_out_end FROM time_settings WHERE api_key = $1',
      [api_key]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Time settings not found' });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching time settings:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});



router.put('/time-settings', async (req, res) => {
  const {
    api_key,
    sign_in_start,
    sign_in_end,
    sign_out_start,
    sign_out_end
  } = req.body;

  if (
    !api_key ||
    !sign_in_start ||
    !sign_in_end ||
    !sign_out_start ||
    !sign_out_end
  ) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const result = await pool.query(
      'UPDATE time_settings SET sign_in_start = $1, sign_in_end = $2, sign_out_start = $3, sign_out_end = $4 WHERE api_key = $5 RETURNING *',
      [sign_in_start, sign_in_end, sign_out_start, sign_out_end, api_key]
    );

    if (result.rows.length === 0) {
      // If no existing record, insert new one
      const insertResult = await pool.query(
        'INSERT INTO time_settings (api_key, sign_in_start, sign_in_end, sign_out_start, sign_out_end) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [api_key, sign_in_start, sign_in_end, sign_out_start, sign_out_end]
      );
      return res.json({ message: 'Time settings created', data: insertResult.rows[0] });
    }

    return res.json({ message: 'Time settings updated', data: result.rows[0] });
  } catch (err) {
    console.error('Error updating time settings:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
// ...paste the two route handlers here...

module.exports = router;