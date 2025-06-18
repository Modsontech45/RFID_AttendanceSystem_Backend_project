
require('dotenv').config();

const { Pool } = require('pg');


const neonConnectionString = process.env.DATABASE_URL;


if (!neonConnectionString) {
    console.error('DATABASE_URL environment variable is not set.');
    console.error('Please make sure you have a .env file with DATABASE_URL="your_neon_connection_string".');
    process.exit(1);
}

const pool = new Pool({
  connectionString: neonConnectionString,

  ssl: {
    rejectUnauthorized: true
  }
});


pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);

  process.exit(-1);
});

module.exports = pool;