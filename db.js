// db/connection.js
const { Pool } = require('pg');

// Parse the DATABASE_URL
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false // Required for Neon and most cloud databases
  },
  // Connection pool settings
  max: 10, // Maximum number of connections
  min: 2,  // Minimum number of connections
  idleTimeoutMillis: 30000, // 30 seconds
  connectionTimeoutMillis: 10000, // 10 seconds timeout
  acquireTimeoutMillis: 10000, // 10 seconds to get connection from pool
  // Keep alive settings
  keepAlive: true,
  keepAliveInitialDelayMillis: 0,
});

// Test connection on startup
pool.on('connect', (client) => {
  console.log('✅ New database connection established');
});

pool.on('error', (err) => {
  console.error('❌ Database connection error:', err);
});

// Test the connection
const testConnection = async () => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time');
    console.log('✅ Database connected successfully at:', result.rows[0].current_time);
    client.release();
    return true;
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    return false;
  }
};

// Graceful shutdown
const closePool = async () => {
  try {
    await pool.end();
    console.log('✅ Database pool closed');
  } catch (err) {
    console.error('❌ Error closing database pool:', err);
  }
};

module.exports = {
  pool,
  testConnection,
  closePool,
  query: (text, params) => pool.query(text, params)
};