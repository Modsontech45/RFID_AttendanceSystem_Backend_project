require("dotenv").config();

const express = require("express");
const axios = require("axios");
const pool = require("../db");

const router = express.Router();

const plans = {
  starter: "PLN_x6kb1kh4122bm3q",
  professional: "PLN_td9knl16tw6lp1l",
  enterprise: "PLN_x6kb1kh4122bm3q",
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

router.get("/paystack/verify/:reference", async (req, res) => {
  const { reference } = req.params;
  console.log(`[Verify] Starting verification for reference: ${reference}`);

  if (!reference) {
    console.log("[Verify] Missing reference param");
    return res.status(400).json({ message: "Missing reference parameter" });
  }

  const axiosConfig = {
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    },
    timeout: 10000, // 10 seconds timeout
  };

  let response;
  let attempt = 0;
  const maxRetries = 2;

  while (attempt <= maxRetries) {
    try {
      console.log(`[Verify] Attempt ${attempt + 1} to verify payment`);
      response = await axios.get(
        `https://api.paystack.co/transaction/verify/${reference}`,
        axiosConfig
      );
      break; // success, exit retry loop
    } catch (error) {
      attempt++;
      console.error(`[Verify] Attempt ${attempt} failed:`, error.message);
      if (attempt > maxRetries) {
        const errData = error.response?.data || error.message;
        console.error("[Verify] All retries failed, returning error to client:", errData);
        return res.status(500).json({
          message: "Verification failed after multiple attempts",
          error: errData,
        });
      }
      // wait 1 second before retrying
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  const data = response.data.data;
  console.log("[Verify] Paystack response data:", data);

  if (data.status === "success") {
    const email = data.customer.email;
    const planName =
      data.plan?.name?.toLowerCase() ||
      data.metadata?.plan_name?.toLowerCase() ||
      "unknown";

    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1);

    try {
      await pool.query(
        `UPDATE admins 
         SET subscription_plan = $1,
             subscription_status = 'active',
             subscription_start_date = $2,
             subscription_end_date = $3
         WHERE email = $4`,
        [planName, startDate, endDate, email]
      );
      console.log(`[Verify] Updated subscription for ${email}`);
    } catch (dbError) {
      console.error("[Verify] DB update failed:", dbError.message);
      // You might want to handle this error or continue anyway
    }

    // Instead of redirecting, respond with JSON so frontend can handle it
    return res.json({ status: "success", message: "Payment verified successfully." });
  } else {
    console.log("[Verify] Payment status not successful:", data.status);
    return res.status(400).json({ status: "failed", message: "Payment verification failed." });
  }
});

module.exports = router;
