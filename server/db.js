require('dotenv').config({ quiet: true });

const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
const isLocalDb =
  connectionString?.includes('localhost') ||
  connectionString?.includes('127.0.0.1');

const pool = new Pool({
  connectionString,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
});

module.exports = pool;
