require("dotenv").config();

const express = require("express");
const axios = require("axios");
const pool = require("../db");

const router = express.Router();

const plans = {
  starter: "300",
  professional: "222",
  enterprise: "600",
};

// 🔁 Initialize Payment
router.post("/paystack/initialize", async (req, res) => {
  const { email, plan } = req.body;

  if (!plans[plan]) {
    return res.status(400).json({ message: "Invalid plan" });
  }

  const amountInPesewas = Number(plans[plan]) * 100;

  if (isNaN(amountInPesewas) || amountInPesewas <= 0) {
    return res.status(400).json({ message: "Invalid amount for the selected plan" });
  }

  try {
    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount: amountInPesewas,
        currency: "GHS",
        callback_url: "https://rfid-attendance-synctuario-theta.vercel.app/admin/verify-payment",
        metadata: {
          plan_name: plan,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return res.status(200).json({
      message: "Payment initiated",
      authorization_url: response.data.data.authorization_url,
      reference: response.data.data.reference,
    });
  } catch (error) {
    const errData = error?.response?.data || error.message;
    console.error("Paystack Init Error:", errData);
    return res.status(500).json({
      message: "Paystack initialization failed",
      error: errData,
    });
  }
});

router.get("/paystack/verify", async (req, res) => {
  const { reference } = req.query;

  if (!reference) {
    return res.status(400).json({ message: "Missing reference in query" });
  }

  try {
    // Call Paystack to verify transaction by reference
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
        data.plan?.name?.toLowerCase() ||
        data.metadata?.plan_name?.toLowerCase() ||
        "unknown";

      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1);

      // Update user subscription in DB
      await pool.query(
        `UPDATE admins 
         SET subscription_plan = $1,
             subscription_status = 'active',
             subscription_start_date = $2,
             subscription_end_date = $3
         WHERE email = $4`,
        [planName, startDate, endDate, email]
      );

      // Redirect on success
      return res.redirect(
        "https://rfid-attendance-synctuario-theta.vercel.app/admin/paymentsuccess"
      );
    } else {
      // Redirect on failure
      return res.redirect(
        "https://rfid-attendance-synctuario-theta.vercel.app/admin/paymentfailed"
      );
    }
  } catch (error) {
    const errData = error?.response?.data || error.message;
    console.error("Paystack verification failed:", errData);

    // Return JSON error (or you could redirect to failure page)
    return res.status(500).json({
      message: "Verification failed",
      error: errData,
    });
  }
});


module.exports = router;
