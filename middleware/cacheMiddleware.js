const Redis = require('ioredis');
const redis = new Redis();

async function cacheMiddleware(req, res, next) {
  const key = `cache:${req.originalUrl}`;
  try {
    const cachedData = await redis.get(key);
    if (cachedData) {
      return res.json(JSON.parse(cachedData));
    }
    // Override res.json to cache the response before sending
    res.sendResponse = res.json;
    res.json = (body) => {
      redis.set(key, JSON.stringify(body), 'EX', 60); // Cache expires in 60 seconds
      res.sendResponse(body);
    };
    next();
  } catch (err) {
    console.error('Redis cache error:', err);
    next(); // On error, just proceed without caching
  }
}

module.exports = cacheMiddleware;
