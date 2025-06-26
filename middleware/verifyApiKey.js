const pool = require("../db");

module.exports = async function verifyApiKey(req, res, next) {
  try {
    const apiKey =
      (req.body && req.body.api_key) || // safe check req.body
      req.query.api_key ||
      req.headers["x-api-key"];

    console.log("🔑 Received API Key:", apiKey);

    if (!apiKey) {
      return res.status(400).json({ message: "API key required" });
    }

    // Check admins
    const adminCheck = await pool.query(
      "SELECT id, email, api_key FROM admins WHERE api_key = $1",
      [apiKey]
    );

    if (adminCheck.rows.length > 0) {
      req.user = { ...adminCheck.rows[0], role: "admin" };
      return next();
    }

    // Check teachers
    const teacherCheck = await pool.query(
      "SELECT id, email, api_key FROM teachers WHERE api_key = $1",
      [apiKey]
    );

    if (teacherCheck.rows.length > 0) {
      req.user = { ...teacherCheck.rows[0], role: "teacher" };
      return next();
    }

    return res.status(403).json({ message: "Invalid API key" });

  } catch (err) {
    console.error("❌ API Key validation failed:", err);
    res.status(500).json({ message: "Server error validating API key" });
  }
};
