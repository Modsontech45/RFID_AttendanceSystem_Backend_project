
require("dotenv").config();

const express = require("express");
const axios = require("axios");
const pool = require("../db"); // Adjust this path to your database config

const router = express.Router();

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





const plans = {
    enterprise: {
      code: "PLN_hffe5wh7gl9bqt4",
      amount: 10000 // Custom amount in kobo
    },
    professional: {
      code: "PLN_er7em0l3kt9e4aa", 
      amount: 6000 // $60 in kobo (GHS 60.00 * 100)
    },
  starter: {
   
     code: "PLN_qfc9wlvxfcfjetp",
    amount: 3000 // $30 in kobo (GHS 30.00 * 100)
  }
};

router.post("/paystack/initialize", async (req, res) => {
  const { email, plan } = req.body;

  if (!plans[plan]) {
    return res.status(400).json({ message: "Invalid plan" });
  }

  try {
    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount: plans[plan].amount, // Add the amount in kobo
        currency: "GHS",
        plan: plans[plan].code,     // Use the plan code
        callback_url: "https://rfid-attendance-synctuario-theta.vercel.app/admin/verify-payment/:reference",
        channels: ["card", "bank", "ussd", "qr", "mobile_money", "bank_transfer"],
        metadata: {
          plan_name: plan
        }
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
      reference: response.data.data.reference
    });
  } catch (error) {
    const errData = error.response?.data || error.message;
    console.error("Paystack Init Error:", errData);
    res.status(500).json({ 
      message: "Paystack initialization failed", 
      error: errData 
    });
  }
});

router.get("/paystack/verify/:reference", async (req, res) => {
  const { reference } = req.params;

  try {
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const data = response.data.data;

    if (data.status === "success") {
      const email = data.customer.email;

      const planName =
        data.plan?.name?.toLowerCase() || data.metadata?.plan_name?.toLowerCase() || "unknown";

      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1);

      await pool.query(
        `UPDATE admins 
         SET subscription_plan = $1,
             subscription_status = 'active',
             subscription_start_date = $2,
             subscription_end_date = $3
         WHERE email = $4`,
        [planName, startDate, endDate, email]
      );

      return res.redirect("https://rfid-attendance-synctuario-theta.vercel.app/admin/paymentsuccess");
    } else {
      return res.redirect("https://rfid-attendance-synctuario-theta.vercel.app/admin/paymentfailed");
    }
  } catch (err) {
    console.error("Paystack verification failed:", err.message);
    return res.status(500).json({ message: "Verification failed" });
  }
});


module.exports = router;
