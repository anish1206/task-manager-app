const { Client } = require('pg');

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://test:test@127.0.0.1:5432/taskmanager_test';

async function connectWithRetry() {
  let lastError;

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const client = new Client({ connectionString, ssl: false });

    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw lastError;
}

async function prepareDatabase() {
  const client = await connectWithRetry();

  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        completed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
  } finally {
    await client.end().catch(() => {});
  }
}

prepareDatabase().catch((error) => {
  console.error('Failed to prepare test database:', error);
  process.exit(1);
});
