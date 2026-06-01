import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const request = require('supertest');
const app = require('../app');
const pool = require('../db');

beforeAll(async () => {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
});

beforeEach(async () => {
  // Only delete the specific users we create to avoid race conditions with other tests
  await pool.query("DELETE FROM users WHERE email IN ('test@test.com', 'dup@test.com', 'login@test.com', 'wrong@test.com', 'me@test.com')");
});

afterAll(async () => {
  await pool.query("DELETE FROM users WHERE email IN ('test@test.com', 'dup@test.com', 'login@test.com', 'wrong@test.com', 'me@test.com')").catch(() => {});
});

describe('Auth routes', () => {
  it('registers a new user and sets a cookie', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'test@test.com',
      password: 'password123',
    });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe('test@test.com');
    expect(res.body.id).toBeDefined();
    
    // Cookie should be set
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies[0]).toMatch(/token=/);
  });

  it('fails to register duplicate email', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'dup@test.com',
      password: 'password123',
    });

    const res = await request(app).post('/api/auth/register').send({
      email: 'dup@test.com',
      password: 'password123',
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Email already in use');
  });

  it('logs in an existing user', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'login@test.com',
      password: 'password123',
    });

    const res = await request(app).post('/api/auth/login').send({
      email: 'login@test.com',
      password: 'password123',
    });

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('login@test.com');
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies[0]).toMatch(/token=/);
  });

  it('fails login with wrong password', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'wrong@test.com',
      password: 'password123',
    });

    const res = await request(app).post('/api/auth/login').send({
      email: 'wrong@test.com',
      password: 'wrongpassword',
    });

    expect(res.status).toBe(401);
  });

  it('fetches /me with valid cookie', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      email: 'me@test.com',
      password: 'password123',
    });

    const cookie = reg.headers['set-cookie'][0];

    const res = await request(app).get('/api/auth/me').set('Cookie', cookie);
    
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('me@test.com');
  });

  it('fails /me without cookie', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('logs out by clearing cookie', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    // Cookie should be cleared (e.g. Expires=Thu, 01 Jan 1970)
    expect(cookies[0]).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});
