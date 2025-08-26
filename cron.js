// cron.js
const cron = require("node-cron");
const pool = require("./db"); // adjust path to your PostgreSQL connection

// Every hour (change "*/1 * * * *" for every minute while testing)
cron.schedule("0 * * * *", async () => {
  try {
    console.log("🌐 Updating subscription statuses...");
    await pool.query(`
      UPDATE admins
      SET subscription_status = CASE
        WHEN NOW() BETWEEN trial_start_date AND trial_end_date THEN 'trial'
        WHEN subscription_start_date IS NOT NULL 
             AND subscription_end_date IS NOT NULL
             AND NOW() BETWEEN subscription_start_date AND subscription_end_date
          THEN 'active'
        WHEN NOW() > trial_end_date 
             AND (subscription_start_date IS NULL OR subscription_end_date IS NULL)
          THEN 'expired'
        WHEN subscription_end_date IS NOT NULL AND NOW() > subscription_end_date
          THEN 'expired'
        ELSE subscription_status
      END
    `);
    console.log("✅ Subscription statuses updated.");
  } catch (err) {
    console.error("❌ Error updating subscription statuses:", err);
  }
});
