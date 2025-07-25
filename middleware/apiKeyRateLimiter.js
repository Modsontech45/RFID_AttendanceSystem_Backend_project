const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit'); // ✅ Required for IPv6-safe fallback

const apiKeyRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1000,
  keyGenerator: (req) =>
    req.headers?.['x-api-key'] ||
    req.query?.api_key ||
    req.body?.api_key ||
    ipKeyGenerator(req), // ✅ IPv6-safe fallback
  handler: (req, res) => {
    res.status(429).json({ message: "Too many requests, please try again later." });
  },
});

module.exports = apiKeyRateLimiter;
