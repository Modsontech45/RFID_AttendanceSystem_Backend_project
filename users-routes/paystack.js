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

// 🔁 Verify Payment
router.get("/paystack/verify/:reference", async (req, res) => {
  const { reference } = req.params;
  console.log(`[Verify] Received verification request for reference: ${reference}`);

  try {
    console.log(`[Verify] Sending request to Paystack for transaction verification...`);
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    console.log(`[Verify] Received response from Paystack:`, response.data);

    const data = response.data.data;

    if (!data) {
      console.warn(`[Verify] No data found in Paystack response.`);
      return res.status(500).json({ message: "No data from Paystack" });
    }

    console.log(`[Verify] Transaction status: ${data.status}`);

    if (data.status === "success") {
      const email = data.customer?.email;
      const planName =
        data.plan?.name?.toLowerCase() ||
        data.metadata?.plan_name?.toLowerCase() ||
        "unknown";

      console.log(`[Verify] Successful payment for email: ${email}, plan: ${planName}`);

      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1);

      console.log(
        `[Verify] Updating subscription in DB for ${email}: plan=${planName}, start=${startDate}, end=${endDate}`
      );

      await pool.query(
        `UPDATE admins 
         SET subscription_plan = $1,
             subscription_status = 'active',
             subscription_start_date = $2,
             subscription_end_date = $3
         WHERE email = $4`,
        [planName, startDate, endDate, email]
      );

      console.log(`[Verify] Database updated successfully for ${email}. Redirecting to success page.`);
      return res.redirect(
        "https://rfid-attendance-synctuario-theta.vercel.app/admin/paymentsuccess"
      );
    } else {
      console.log(`[Verify] Payment status not successful. Redirecting to failure page.`);
      return res.redirect(
        "https://rfid-attendance-synctuario-theta.vercel.app/admin/paymentfailed"
      );
    }
  } catch (error) {
    const errData = error?.response?.data || error.message;
    console.error("[Verify] Paystack verification failed:", errData);
    return res.status(500).json({
      message: "Verification failed",
      error: errData,
    });
  }
});

module.exports = router;
