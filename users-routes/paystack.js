
require("dotenv").config();

const express = require("express");
const axios = require("axios");
const pool = require("../db"); // Adjust this path to your database config

const router = express.Router();

const plans = {
  starter: "PLN_x6kb1kh4122bm3q",
  professional: "PLN_td9knl16tw6lp1l",
  enterprise: "PLN_ebucle4ojvpl5hk",
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
        plan: plans[plan],        // ONLY the plan code here, NO amount
        currency: "GHS",
        callback_url: "https://yourfrontend.com/payment/callback",
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


// Verify transaction
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
      const planCode = data.plan.plan_code;
      const planName = data.plan.name.toLowerCase();

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

      res.redirect("https://yourfrontend.com/payment-success");
    } else {
      res.redirect("https://yourfrontend.com/payment-failed");
    }
  } catch (err) {
    console.error("Paystack verification failed:", err.message);
    res.status(500).json({ message: "Verification failed" });
  }
});

module.exports = router;
