const express = require("express");
const pool = require("../db");
const router = express.Router();
const verifyApiKey = require("../middleware/verifyApiKey");
const getMessage = require("../utils/messages");

// GET time settings for the given API key
router.get("/time-settings", verifyApiKey, async (req, res) => {
  const lang = req.headers["accept-language"]?.toLowerCase().split(",")[0] || "en";
  const apiKey = req.user.api_key;

  try {
    const result = await pool.query(
      "SELECT sign_in_start, sign_in_end, sign_out_start, sign_out_end FROM time_settings WHERE api_key = $1",
      [apiKey]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: getMessage(lang, "timeSettings.notFound") });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching time settings:", err);
    res.status(500).json({ error: getMessage(lang, "common.internalError") });
  }
});

// PUT update (or create) time settings
router.put("/time-settings", verifyApiKey, async (req, res) => {
  const lang = req.headers["accept-language"]?.toLowerCase().split(",")[0] || "en";
  const apiKey = req.user.api_key;
  const { sign_in_start, sign_in_end, sign_out_start, sign_out_end } = req.body;

  if (!sign_in_start || !sign_in_end || !sign_out_start || !sign_out_end) {
    return res.status(400).json({ error: getMessage(lang, "timeSettings.missingFields") });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const updateResult = await client.query(
      `UPDATE time_settings
       SET sign_in_start = $1, sign_in_end = $2, sign_out_start = $3, sign_out_end = $4
       WHERE api_key = $5
       RETURNING *`,
      [sign_in_start, sign_in_end, sign_out_start, sign_out_end, apiKey]
    );

    let responseMessage;
    let data;

    if (updateResult.rowCount === 0) {
      // Insert new record if not exists
      const insertResult = await client.query(
        `INSERT INTO time_settings (api_key, sign_in_start, sign_in_end, sign_out_start, sign_out_end)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [apiKey, sign_in_start, sign_in_end, sign_out_start, sign_out_end]
      );
      responseMessage = getMessage(lang, "timeSettings.created");
      data = insertResult.rows[0];
    } else {
      responseMessage = getMessage(lang, "timeSettings.updated");
      data = updateResult.rows[0];
    }

    await client.query("COMMIT");

    res.json({ message: responseMessage, data });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error updating time settings:", error);
    res.status(500).json({ error: getMessage(lang, "common.internalError") });
  } finally {
    client.release();
  }
});

module.exports = router;
