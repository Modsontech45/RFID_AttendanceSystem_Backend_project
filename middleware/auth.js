const jwt = require('jsonwebtoken');
const getMessage = require('../utils/messages');
require('dotenv').config();

/**
 * Middleware to authenticate admin users
 */
const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const lang = req.headers['accept-language'] || 'en';

  if (!authHeader)
    return res.status(401).json({ message: getMessage(lang, 'auth.noToken') });

  const token = authHeader.split(' ')[1];

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.log('Admin JWT verification error:', err);
      return res.status(403).json({ message: getMessage(lang, 'auth.invalidToken') });
    }

    if (decoded.role !== 'admin') {
      console.log('Access denied: role is not admin:', decoded.role);
      return res.status(403).json({ message: getMessage(lang, 'auth.accessDenied') });
    }

    req.admin = decoded;
    next();
  });
};

/**
 * Middleware to authenticate teacher users
 */
const authenticateTeacher = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const lang = req.headers['accept-language'] || 'en';

  if (!authHeader)
    return res.status(401).json({ message: getMessage(lang, 'auth.noToken') });

  const token = authHeader.split(' ')[1];

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.log('Teacher JWT verification error:', err);
      return res.status(403).json({ message: getMessage(lang, 'auth.invalidToken') });
    }

    if (!decoded || decoded.role !== 'teacher') {
      console.log('Access denied: role is not teacher:', decoded ? decoded.role : 'undefined');
      return res.status(403).json({ message: getMessage(lang, 'auth.accessDenied') });
    }

    req.teacher = decoded;
    next();
  });
};

/**
 * Checks if the admin's subscription is active, trial, or expired
 */
async function checkSubscription(admin) {
  const now = new Date();
  console.log("🕒 Current time:", now);
  console.log("🧾 Admin subscription status:", admin.subscription_status);

  const subscriptionEnd = new Date("2025-07-20");

  if (admin.subscription_status === "trial") {
    if (now > subscriptionEnd) {
      console.log("🚫 Trial expired");
      return "expired";
    }
    console.log("✅ Trial active");
    return "trial";
  }

  if (admin.subscription_status === "active") {
    if (now > subscriptionEnd) {
      console.log("🚫 Subscription expired");
      return "expired";
    }
    console.log("✅ Subscription active");
    return "active";
  }

  console.log("❓ No valid subscription found");
  return "none";
}

module.exports = {
  authenticateAdmin,
  authenticateTeacher,
  checkSubscription,
};
