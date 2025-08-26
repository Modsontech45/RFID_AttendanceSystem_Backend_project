import { verify } from "jsonwebtoken";
import getMessage from "../utils/messages";
require("dotenv").config();

/**
 * 🔹 Middleware: Authenticate Admin
 */
const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const lang = req.headers["accept-language"] || "en";

  if (!authHeader)
    return res.status(401).json({ message: getMessage(lang, "auth.noToken") });

  const token = authHeader.split(" ")[1];

  verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.log("Admin JWT verification error:", err);
      return res.status(403).json({ message: getMessage(lang, "auth.invalidToken") });
    }

    console.log("Admin decoded token:", decoded);

    if (decoded.role !== "admin") {
      console.log("Access denied: role is not admin:", decoded.role);
      return res.status(403).json({ message: getMessage(lang, "auth.accessDenied") });
    }

    req.admin = decoded;
    next();
  });
};

/**
 * 🔹 Middleware: Authenticate Teacher
 */
const authenticateTeacher = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const lang = req.headers["accept-language"] || "en";

  if (!authHeader)
    return res.status(401).json({ message: getMessage(lang, "auth.noToken") });

  const token = authHeader.split(" ")[1];

  verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.log("Teacher JWT verification error:", err);
      return res.status(403).json({ message: getMessage(lang, "auth.invalidToken") });
    }

    console.log("Teacher decoded token:", decoded);

    if (!decoded || decoded.role !== "teacher") {
      console.log("Access denied: role is not teacher:", decoded ? decoded.role : decoded);
      return res.status(403).json({ message: getMessage(lang, "auth.accessDenied") });
    }

    req.teacher = decoded;
    next();
  });
};

/**
 * 🔹 Middleware: Authenticate Super Admin
 */
const authenticateSuperAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const lang = req.headers["accept-language"] || "en";

  if (!authHeader)
    return res.status(401).json({ message: getMessage(lang, "auth.noToken") });

  const token = authHeader.split(" ")[1];

  verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.log("Super Admin JWT verification error:", err);
      return res.status(403).json({ message: getMessage(lang, "auth.invalidToken") });
    }

    console.log("Super Admin decoded token:", decoded);

    if (!decoded || decoded.role !== "super_admin") {
      console.log("Access denied: role is not super_admin:", decoded ? decoded.role : decoded);
      return res.status(403).json({ message: getMessage(lang, "auth.accessDenied") });
    }

    req.superAdmin = decoded;
    next();
  });
};

/**
 * 🔹 Subscription Checker
 */
async function checkSubscription(admin) {
  const now = new Date();
  console.log("🕒 Current time:", now);
  console.log("🧾 Admin subscription status:", admin.subscription_status);

  if (admin.subscription_status === "trial") {
    const trialEnd = new Date(admin.trial_end_date);
    console.log("⏳ Trial ends at:", trialEnd);
    if (now >= trialEnd) {
      console.log("🚫 Trial expired");
      return "expired";
    }
    console.log("✅ Trial active");
    return "trial";
  }

  if (admin.subscription_status === "active") {
    const endDate = new Date(admin.subscription_end_date);
    console.log("📆 Subscription ends at:", endDate);
    if (now >= endDate) {
      console.log("🚫 Subscription expired");
      return "expired";
    }
    console.log("✅ Subscription active");
    return "active";
  }

  console.log("❓ No subscription found");
  return "none";
}

export default {
  authenticateAdmin,
  authenticateTeacher,
  authenticateSuperAdmin, // ✅ new export
  checkSubscription,
};
