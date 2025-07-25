const memoryCache = new Map();

function cacheMiddleware(req, res, next) {
  const key = req.originalUrl;
  if (memoryCache.has(key)) {
    return res.json(memoryCache.get(key));
  }

  res.sendResponse = res.json;
  res.json = (body) => {
    memoryCache.set(key, body);
    setTimeout(() => memoryCache.delete(key), 60 * 1000); // expires in 60s
    res.sendResponse(body);
  };

  next();
}

module.exports = cacheMiddleware;
