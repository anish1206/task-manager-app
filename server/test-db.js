const pool = require('./db');

async function test() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('Database connected:', result.rows[0]);
  } catch (err) {
    console.error('Database connection failed:', err);
  } finally {
    await pool.end();
  }
}

test();
