const jwt = require('jsonwebtoken');
const getMessage = require('../utils/messages');
require('dotenv').config();

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

    console.log('Admin decoded token:', decoded);

    if (decoded.role !== 'admin') {
      console.log('Access denied: role is not admin:', decoded.role);
      return res.status(403).json({ message: getMessage(lang, 'auth.accessDenied') });
    }

    req.admin = decoded;
    next();
  });
};

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

    console.log('Teacher decoded token:', decoded);

    if (!decoded || decoded.role !== 'teacher') {
      console.log('Access denied: role is not teacher:', decoded ? decoded.role : decoded);
      return res.status(403).json({ message: getMessage(lang, 'auth.accessDenied') });
    }

    req.teacher = decoded;
    next();
  });
};





module.exports = {
  authenticateAdmin,
  authenticateTeacher,
  
};
