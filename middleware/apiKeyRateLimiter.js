

const rateLimit = require('express-rate-limit');

const apiKeyRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1000,           // max 1000 requests per API key per minute
  keyGenerator: (req) => req.headers['x-api-key'] || req.query.api_key || req.body.api_key,
  handler: (req, res) => {
    res.status(429).json({ message: "Too many requests, please try again later." });
  },
});

module.exports = apiKeyRateLimiter;
