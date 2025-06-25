const pool = require("../db");

module.exports = async function verifyApiKey(req, res, next) {
  try {
    const apiKey = req.body.api_key || req.query.api_key || req.headers["x-api-key"];
    if (!apiKey) {
      return res.status(400).json({ message: "API key required" });
    }

    // Check if this api_key exists in admins or teachers
    const userCheck = await pool.query(
      `SELECT * FROM admins WHERE api_key = $1
       UNION
       SELECT * FROM teachers WHERE api_key = $1`,
      [apiKey]
    );

    if (userCheck.rows.length === 0) {
      return res.status(403).json({ message: "Invalid API key" });
    }

    req.user = userCheck.rows[0]; // attach user info to request
    next();
  } catch (err) {
    console.error("API Key validation failed:", err);
    res.status(500).json({ message: "Server error validating API key" });
  }
};
