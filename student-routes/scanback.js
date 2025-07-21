const express = require('express');
const pool = require('../db');
const router = express.Router();
const getMessage = require('../utils/messages');

const latestScans = {};

// POST /scan
router.post('/', async (req, res) => {
  const { uid, device_uid } = req.body;
  const lang = req.headers['accept-language']?.toLowerCase().split(',')[0] || 'en';
  const now = new Date();

  if (!uid || !device_uid) {
    return res.status(400).json({
      message: getMessage(lang, 'scan.missingFields'),
      sign: 0
    });
  }

  try {
    // 1. Check if student exists
    const studentRes = await pool.query('SELECT * FROM students WHERE uid = $1', [uid]);

    if (studentRes.rows.length === 0) {
      const notFound = {
        uid,
        device_uid,
        exists: false,
        message: getMessage(lang, 'scan.uidNotRegistered'),
        timestamp: now,
        sign: 2,
        flag: getMessage(lang, 'scan.registerNow')
      };
      latestScans[device_uid] = notFound;
      return res.json(notFound);
    }

    const student = studentRes.rows[0];
    const dateStr = now.toISOString().slice(0, 10);

    // 2. Ensure daily attendance records exist
    const attendanceCheck = await pool.query(
      'SELECT COUNT(*) FROM attendance WHERE date = $1',
      [dateStr]
    );

    if (parseInt(attendanceCheck.rows[0].count) === 0) {
      const allStudents = await pool.query('SELECT uid, name, form, api_key FROM students');
      for (const s of allStudents.rows) {
        await pool.query(
          `INSERT INTO attendance (uid, name, form, date, signed_in, signed_out, status, api_key)
           VALUES ($1, $2, $3, $4, false, false, 'absent', $5)`,
          [s.uid, s.name, s.form, dateStr, s.api_key]
        );
      }
    }

    // 3. Fetch time settings
    const timeSettingsRes = await pool.query(
      `SELECT sign_in_start, sign_in_end, sign_out_start, sign_out_end
       FROM time_settings WHERE api_key = $1 LIMIT 1`,
      [student.api_key]
    );

    if (timeSettingsRes.rows.length === 0) {
      return res.status(400).json({
        message: getMessage(lang, 'timeSettings.notFound'),
        sign: 0
      });
    }

    const {
      sign_in_start,
      sign_in_end,
      sign_out_start,
      sign_out_end
    } = timeSettingsRes.rows[0];

    // 4. Compare current time with sign-in/out windows
    const nowStr = now.toTimeString().split(" ")[0]; // "HH:MM:SS"
    const isBetween = (start, end, current) => current >= start && current <= end;

    const isSignInTime = isBetween(sign_in_start, sign_in_end, nowStr);
    const isSignOutTime = isBetween(sign_out_start, sign_out_end, nowStr);

    if (!isSignInTime && !isSignOutTime) {
      const outsideTime = {
        uid,
        device_uid,
        exists: true,
        name: student.name,
        timestamp: now,
        message: getMessage(lang, 'scan.outsideTime'),
        sign: 0,
        flag: getMessage(lang, 'scan.outsideFlag')
      };
      latestScans[device_uid] = outsideTime;
      return res.json(outsideTime);
    }

    // 5. Fetch today's attendance record
    const attendanceRes = await pool.query(
      'SELECT * FROM attendance WHERE uid = $1 AND date = $2',
      [uid, dateStr]
    );

    const existing = attendanceRes.rows[0];
    let { sign_in_time, sign_out_time, signed_in, signed_out } = existing;

    // 6. Handle sign-in
    if (isSignInTime && !signed_in) {
      sign_in_time = now;
      signed_in = true;
    }

    // 7. Handle sign-out
    if (isSignOutTime && !signed_out) {
      if (!signed_in) {
        const mustSignInFirst = {
          uid,
          device_uid,
          exists: true,
          name: student.name,
          timestamp: now,
          message: getMessage(lang, 'scan.signInFirst'),
          sign: 3,
          flag: getMessage(lang, 'scan.signInFlag')
        };
        latestScans[device_uid] = mustSignInFirst;
        return res.json(mustSignInFirst);
      }
      sign_out_time = now;
      signed_out = true;
    }

    // 8. Determine final status
    let status = 'absent';
    if (signed_in && signed_out) status = 'present';
    else if (signed_in) status = 'partial';

    await pool.query(
      `UPDATE attendance
       SET sign_in_time = $1, sign_out_time = $2, signed_in = $3, signed_out = $4, status = $5
       WHERE id = $6`,
      [sign_in_time, sign_out_time, signed_in, signed_out, status, existing.id]
    );

    const signedMessage = isSignInTime
      ? getMessage(lang, 'scan.signedIn')
      : getMessage(lang, 'scan.signedOut');

    const scanSuccess = {
      uid,
      device_uid,
      exists: true,
      name: student.name,
      timestamp: now,
      message: signedMessage,
      sign: 1,
      flag: signedMessage
    };

    latestScans[device_uid] = scanSuccess;
    return res.json(scanSuccess);

  } catch (err) {
    console.error('❌ Error processing scan:', err.message);
    const errorResponse = {
      uid: req.body.uid || null,
      device_uid: req.body.device_uid || null,
      exists: false,
      timestamp: new Date(),
      message: getMessage(lang, 'scan.error'),
      error: err.message,
      sign: 0,
      flag: 'Error'
    };
    latestScans[device_uid || 'unknown'] = errorResponse;
    return res.status(500).json({
      message: getMessage(lang, 'scan.failed'),
      error: err.message,
      sign: 0
    });
  }
});

// GET /scan/queue
router.get('/queue', (req, res) => {
  const { device_uid } = req.query;
  const lang = req.headers['accept-language']?.toLowerCase().split(',')[0] || 'en';

  if (!device_uid) {
    return res.status(400).json({
      error: getMessage(lang, 'scan.deviceRequired')
    });
  }

  const scan = latestScans[device_uid];
  if (scan) {
    delete latestScans[device_uid];
    return res.json([scan]);
  }

  return res.json([]);
});

module.exports = router;



router.post('/login', async (req, res) => {
  const { email, password } = req.body;
    if (!req.body) {
    return res.status(400).json({ error: true, message: 'Missing request body' });
  }
  const lang = req.headers['accept-language']?.toLowerCase().split(',')[0] || 'en';

  if (!email || !password) {
    return res.status(400).json({ message: getMessage(lang, 'admin.emailPasswordRequired') });
  }

  try {
    const result = await pool.query('SELECT * FROM admins WHERE email = $1', [email]);
    const admin = result.rows[0];

    if (!admin) {
      return res.status(401).json({ message: getMessage(lang, 'admin.invalidCredentials') });
    }

    if (!admin.verified) {
      return res.status(403).json({ message: getMessage(lang, 'admin.notVerified') });
    }

    const match = await bcrypt.compare(password, admin.password);
    if (!match) {
      return res.status(401).json({ message: getMessage(lang, 'admin.invalidCredentials') });
    }

    let apiKey = admin.api_key;
    if (!apiKey) {
      apiKey = crypto.randomBytes(32).toString('hex');
      await pool.query('UPDATE admins SET api_key = $1 WHERE id = $2', [apiKey, admin.id]);
    }

    const token = jwt.sign(
      { id: admin.id, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.status(200).json({
      message: getMessage(lang, 'admin.loginSuccess'),
      token,
      admin: {
        id: admin.id,
        schoolname: admin.schoolname,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        api_key: apiKey,
        created_at: admin.created_at,
      },
    });

  } catch (err) {
    console.error("❌ Error during admin login:", err.message);
    res.status(500).json({ message: getMessage(lang, 'common.internalError'), error: err.message });
  }
});


const plans = {
  starter: "300",       // These look like amounts, NOT Paystack plan codes
  professional: "222",
  enterprise: "600",
};

router.post("/paystack/initialize", async (req, res) => {
  const { email, plan } = req.body;

  if (!plans[plan]) {
    return res.status(400).json({ message: "Invalid plan" });
  }

  // If you want to use Paystack subscription plans, plans[plan] must be plan codes like "PLN_xxx"
  // But here they are amounts (strings), so you CANNOT send them as `plan: plans[plan]`

  // Convert amount string to number of pesewas (smallest unit)
  const amountInPesewas = Number(plans[plan]) * 100;

  if (isNaN(amountInPesewas) || amountInPesewas <= 0) {
    return res.status(400).json({ message: "Invalid amount for the selected plan" });
  }

  try {
    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount: amountInPesewas,  // send amount (number in pesewas) here
        currency: "GHS",
        callback_url: "https://yourdomain.com/paystack/callback",
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.status(200).json({
      message: "Payment initiated",
      authorization_url: response.data.data.authorization_url,
    });
  } catch (error) {
    const errData = error.response?.data || error.message;
    console.error("Paystack Init Error:", errData);
    res.status(500).json({ message: "Paystack initialization failed", error: errData });
  }
});



// const plans = {
//     enterprise: {
//       code: "PLN_x6kb1kh4122bm3q",
//       amount: 10000 // Custom amount in kobo
//     },
//     professional: {
//       code: "PLN_td9knl16tw6lp1l", 
//       amount: 6000 // $60 in kobo (GHS 60.00 * 100)
//     },
//   starter: {
   
//      code: "PLN_ebucle4ojvpl5hk",
//     amount: 3000 // $30 in kobo (GHS 30.00 * 100)
//   }
// };

// router.post("/paystack/initialize", async (req, res) => {
//   const { email, plan } = req.body;

//   if (!plans[plan]) {
//     return res.status(400).json({ message: "Invalid plan" });
//   }

//   try {
//     const response = await axios.post(
//       "https://api.paystack.co/transaction/initialize",
//       {
//         email,
//         amount: plans[plan].amount, // Add the amount in kobo
//         currency: "GHS",
//         plan: plans[plan].code,     // Use the plan code
//         callback_url: "https://rfid-attendance-synctuario-theta.vercel.app/admin/verify-payment",
//         channels: ["card", "bank", "ussd", "qr", "mobile_money", "bank_transfer"],
//         metadata: {
//           plan_name: plan
//         }
//       },
//       {
//         headers: {
//           Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
//           "Content-Type": "application/json",
//         },
//       }
//     );

//     res.status(200).json({
//       message: "Payment initiated",
//       authorization_url: response.data.data.authorization_url,
//       reference: response.data.data.reference
//     });
//   } catch (error) {
//     const errData = error.response?.data || error.message;
//     console.error("Paystack Init Error:", errData);
//     res.status(500).json({ 
//       message: "Paystack initialization failed", 
//       error: errData 
//     });
//   }
// });


