import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const request = require('supertest');
const app = require('../app');
const pool = require('../db');
const jwt = require('jsonwebtoken');

const BASE = '/api/v1/tasks';

let authCookie;
let testUserId;

// ── DB bootstrap ──────────────────────────────────────────────────────────────
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID,
      title TEXT NOT NULL,
      completed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  
  const userRes = await pool.query(`
    INSERT INTO users (email, password_hash)
    VALUES ('test@example.com', 'hash')
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
    RETURNING id
  `);
  testUserId = userRes.rows[0].id;
  const token = jwt.sign({ sub: testUserId, email: 'test@example.com' }, process.env.JWT_SECRET || 'testsecret');
  authCookie = `token=${token}`;
});

beforeEach(async () => {
  await pool.query('DELETE FROM tasks');
});

afterAll(async () => {
  await pool.query('DELETE FROM tasks').catch(() => {});
});

// ── Helpers ───────────────────────────────────────────────────────────────────
async function insertTask(title = 'Test task', completed = false, createdAt = null) {
  if (createdAt) {
    const r = await pool.query(
      `INSERT INTO tasks (title, completed, created_at, user_id) VALUES ($1, $2, $3, $4) RETURNING *`,
      [title, completed, createdAt, testUserId]
    );
    return r.rows[0];
  }
  const r = await pool.query(
    `INSERT INTO tasks (title, completed, user_id) VALUES ($1, $2, $3) RETURNING *`,
    [title, completed, testUserId]
  );
  return r.rows[0];
}

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/v1/tasks', () => {
  it('returns empty data array when no tasks', async () => {
    const res = await request(app).get(BASE).set('Cookie', authCookie);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination).toMatchObject({ hasMore: false, nextCursor: null });
  });

  it('returns all tasks with pagination envelope', async () => {
    await insertTask('Buy milk', false);
    // Insert second task a little later so ordering is deterministic
    await pool.query(
      `INSERT INTO tasks (title, completed, created_at, user_id) VALUES ('Walk dog', true, NOW() + interval '1 second', $1)`,
      [testUserId]
    );

    const res = await request(app).get(BASE).set('Cookie', authCookie);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    // Default sort: createdAt DESC → Walk dog first
    expect(res.body.data[0].title).toBe('Walk dog');
    expect(res.body.data[1].title).toBe('Buy milk');
    expect(res.body.pagination.hasMore).toBe(false);
  });

  // ── Filtering ───────────────────────────────────────────────────────────────
  it('filters by completed=true', async () => {
    await insertTask('Done task', true);
    await insertTask('Todo task', false);

    const res = await request(app).get(`${BASE}?completed=true`).set('Cookie', authCookie);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Done task');
    expect(res.body.data[0].completed).toBe(true);
  });

  it('filters by completed=false', async () => {
    await insertTask('Done task', true);
    await insertTask('Todo task', false);

    const res = await request(app).get(`${BASE}?completed=false`).set('Cookie', authCookie);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Todo task');
    expect(res.body.data[0].completed).toBe(false);
  });

  // ── Sorting ─────────────────────────────────────────────────────────────────
  it('sorts by title ASC', async () => {
    await insertTask('Zebra');
    await insertTask('Apple');
    await insertTask('Mango');

    const res = await request(app).get(`${BASE}?sort=title&order=asc`).set('Cookie', authCookie);

    expect(res.status).toBe(200);
    const titles = res.body.data.map((t) => t.title);
    expect(titles).toEqual(['Apple', 'Mango', 'Zebra']);
  });

  it('sorts by title DESC', async () => {
    await insertTask('Zebra');
    await insertTask('Apple');
    await insertTask('Mango');

    const res = await request(app).get(`${BASE}?sort=title&order=desc`).set('Cookie', authCookie);

    const titles = res.body.data.map((t) => t.title);
    expect(titles).toEqual(['Zebra', 'Mango', 'Apple']);
  });

  // ── Pagination ───────────────────────────────────────────────────────────────
  it('returns hasMore:true and a nextCursor when there are more pages', async () => {
    await insertTask('Task 1');
    await pool.query(
      `INSERT INTO tasks (title, created_at, user_id) VALUES ('Task 2', NOW() + interval '1 second', $1)`,
      [testUserId]
    );

    const res = await request(app).get(`${BASE}?limit=1`).set('Cookie', authCookie);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination.hasMore).toBe(true);
    expect(res.body.pagination.nextCursor).toBeTruthy();
    expect(res.body.pagination.limit).toBe(1);
  });

  it('follows cursor to fetch next page without overlap', async () => {
    // Insert 3 tasks with distinct timestamps
    for (let i = 1; i <= 3; i++) {
      await pool.query(
        `INSERT INTO tasks (title, created_at, user_id) VALUES ($1, NOW() + interval '${i} seconds', $2)`,
        [`Task ${i}`, testUserId]
      );
    }

    const page1 = await request(app).get(`${BASE}?limit=2`).set('Cookie', authCookie);
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.pagination.hasMore).toBe(true);

    const cursor = page1.body.pagination.nextCursor;
    const page2 = await request(app)
      .get(`${BASE}?limit=2&cursor=${encodeURIComponent(cursor)}`)
      .set('Cookie', authCookie);
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.pagination.hasMore).toBe(false);

    // No overlap
    const page1Ids = page1.body.data.map((t) => t.id);
    const page2Ids = page2.body.data.map((t) => t.id);
    expect(page1Ids.some((id) => page2Ids.includes(id))).toBe(false);
  });

  it('clamps limit to maximum of 100', async () => {
    const res = await request(app).get(`${BASE}?limit=9999`).set('Cookie', authCookie);
    expect(res.body.pagination.limit).toBe(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/v1/tasks', () => {
  it('creates a task and returns 201', async () => {
    const res = await request(app).post(BASE).set('Cookie', authCookie).send({ title: 'Walk the dog' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Walk the dog');
    expect(res.body.completed).toBe(false);
    expect(res.body.id).toBeDefined();
    expect(res.body.created_at).toBeDefined();
  });

  it('returns 400 for empty title', async () => {
    const res = await request(app).post(BASE).set('Cookie', authCookie).send({ title: '' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 for missing title', async () => {
    const res = await request(app).post(BASE).set('Cookie', authCookie).send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 for whitespace-only title', async () => {
    const res = await request(app).post(BASE).set('Cookie', authCookie).send({ title: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it('returns 400 for title exceeding 500 characters', async () => {
    const longTitle = 'a'.repeat(501);
    const res = await request(app).post(BASE).set('Cookie', authCookie).send({ title: longTitle });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/500/);
  });

  it('accepts a title of exactly 500 characters', async () => {
    const maxTitle = 'a'.repeat(500);
    const res = await request(app).post(BASE).set('Cookie', authCookie).send({ title: maxTitle });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe(maxTitle);
  });

  it('trims leading and trailing whitespace from title', async () => {
    const res = await request(app).post(BASE).set('Cookie', authCookie).send({ title: '  Trimmed task  ' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Trimmed task');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('PUT /api/v1/tasks/:id', () => {
  it('updates task title and returns 200', async () => {
    const task = await insertTask('Original');

    const res = await request(app).put(`${BASE}/${task.id}`).set('Cookie', authCookie).send({ title: 'Updated title' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated title');
    expect(res.body.id).toBe(task.id);
  });

  it('returns 404 for non-existent task', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app).put(`${BASE}/${fakeId}`).set('Cookie', authCookie).send({ title: 'New title' });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Task not found');
  });

  it('returns 400 for empty title', async () => {
    const task = await insertTask('Original');

    const res = await request(app).put(`${BASE}/${task.id}`).set('Cookie', authCookie).send({ title: '' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 for whitespace-only title', async () => {
    const task = await insertTask('Original');

    const res = await request(app).put(`${BASE}/${task.id}`).set('Cookie', authCookie).send({ title: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it('returns 400 for title exceeding 500 characters', async () => {
    const task = await insertTask('Original');
    const longTitle = 'x'.repeat(501);

    const res = await request(app).put(`${BASE}/${task.id}`).set('Cookie', authCookie).send({ title: longTitle });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/500/);
  });

  it('trims whitespace on update', async () => {
    const task = await insertTask('Original');

    const res = await request(app).put(`${BASE}/${task.id}`).set('Cookie', authCookie).send({ title: '  Spaced  ' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Spaced');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('PATCH /api/v1/tasks/:id', () => {
  it('sets completed to true', async () => {
    const task = await insertTask('Task', false);

    const res = await request(app).patch(`${BASE}/${task.id}`).set('Cookie', authCookie).send({ completed: true });

    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(true);
  });

  it('toggles completed when no value provided', async () => {
    const task = await insertTask('Task', false);

    const res = await request(app).patch(`${BASE}/${task.id}`).set('Cookie', authCookie).send({});

    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(true); // toggled false → true
  });

  it('returns 404 for non-existent task', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app).patch(`${BASE}/${fakeId}`).set('Cookie', authCookie).send({ completed: true });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Task not found');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('DELETE /api/v1/tasks/:id', () => {
  it('removes the task and returns 204', async () => {
    const task = await insertTask('To delete');

    const res = await request(app).delete(`${BASE}/${task.id}`).set('Cookie', authCookie);

    expect(res.status).toBe(204);

    const check = await pool.query('SELECT * FROM tasks WHERE id = $1', [task.id]);
    expect(check.rows).toHaveLength(0);
  });

  it('returns 404 for non-existent task', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app).delete(`${BASE}/${fakeId}`).set('Cookie', authCookie);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Task not found');
  });
});
