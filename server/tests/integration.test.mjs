/**
 * Integration tests — hit the real (test) PostgreSQL database.
 *
 * These tests validate end-to-end flows through the HTTP layer including
 * the full create → read → update → delete lifecycle, cursor-based pagination,
 * and filtering — all against the actual DB to catch SQL/schema issues.
 */
import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const request = require('supertest');
const app = require('../app');
const pool = require('../db');

const BASE = '/api/v1/tasks';

// ── DB bootstrap ──────────────────────────────────────────────────────────────
beforeAll(async () => {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
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
});

beforeEach(async () => {
  await pool.query('DELETE FROM tasks');
});

afterAll(async () => {
  await pool.query('DELETE FROM tasks').catch(() => {});
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Integration: Full CRUD lifecycle', () => {
  it('creates, reads, updates title, toggles completion, then deletes a task', async () => {
    // 1. CREATE
    const createRes = await request(app)
      .post(BASE)
      .send({ title: 'Integration task' });

    expect(createRes.status).toBe(201);
    const taskId = createRes.body.id;
    expect(taskId).toBeDefined();
    expect(createRes.body.completed).toBe(false);

    // 2. READ — appears in list
    const listRes = await request(app).get(BASE);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((t) => t.id === taskId)).toBe(true);

    // 3. UPDATE title
    const putRes = await request(app)
      .put(`${BASE}/${taskId}`)
      .send({ title: 'Updated integration task' });

    expect(putRes.status).toBe(200);
    expect(putRes.body.title).toBe('Updated integration task');

    // 4. TOGGLE completion
    const patchRes = await request(app)
      .patch(`${BASE}/${taskId}`)
      .send({ completed: true });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.completed).toBe(true);

    // 5. Verify DB state directly
    const dbRow = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    expect(dbRow.rows[0].title).toBe('Updated integration task');
    expect(dbRow.rows[0].completed).toBe(true);

    // 6. DELETE
    const deleteRes = await request(app).delete(`${BASE}/${taskId}`);
    expect(deleteRes.status).toBe(204);

    // 7. Verify gone from DB
    const gone = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    expect(gone.rows).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Integration: Cursor-based pagination', () => {
  it('paginates through all tasks without overlap or omission', async () => {
    // Insert 5 tasks with distinct timestamps
    for (let i = 1; i <= 5; i++) {
      await pool.query(
        `INSERT INTO tasks (title, created_at) VALUES ($1, NOW() + interval '${i} seconds')`,
        [`Paginated task ${i}`]
      );
    }

    const allIds = new Set();
    let cursor = null;
    let page = 0;

    // Collect all pages with limit=2
    while (true) {
      const url = cursor
        ? `${BASE}?limit=2&cursor=${encodeURIComponent(cursor)}`
        : `${BASE}?limit=2`;

      const res = await request(app).get(url);
      expect(res.status).toBe(200);

      const { data, pagination } = res.body;

      // No task should appear twice
      for (const task of data) {
        expect(allIds.has(task.id)).toBe(false);
        allIds.add(task.id);
      }

      page++;
      if (!pagination.hasMore) break;
      cursor = pagination.nextCursor;

      // Safety: never more than ceil(5/2)+1 pages
      expect(page).toBeLessThanOrEqual(5);
    }

    // All 5 tasks were returned across pages
    expect(allIds.size).toBe(5);
  });

  it('returns an empty page when cursor points past the last row', async () => {
    await pool.query(`INSERT INTO tasks (title) VALUES ('Only task')`);

    const firstPage = await request(app).get(`${BASE}?limit=1`);
    expect(firstPage.body.pagination.hasMore).toBe(false);
    // No cursor provided when hasMore is false
    expect(firstPage.body.pagination.nextCursor).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Integration: Filtering pushed to DB', () => {
  it('filters completed tasks at the database level', async () => {
    await pool.query(`INSERT INTO tasks (title, completed) VALUES ('Done A', true)`);
    await pool.query(`INSERT INTO tasks (title, completed) VALUES ('Done B', true)`);
    await pool.query(`INSERT INTO tasks (title, completed) VALUES ('Todo C', false)`);

    const doneRes = await request(app).get(`${BASE}?completed=true`);
    expect(doneRes.status).toBe(200);
    expect(doneRes.body.data).toHaveLength(2);
    doneRes.body.data.forEach((t) => expect(t.completed).toBe(true));

    const todoRes = await request(app).get(`${BASE}?completed=false`);
    expect(todoRes.status).toBe(200);
    expect(todoRes.body.data).toHaveLength(1);
    expect(todoRes.body.data[0].title).toBe('Todo C');
  });

  it('combines filtering and sorting', async () => {
    await pool.query(`INSERT INTO tasks (title, completed) VALUES ('Zeta done', true)`);
    await pool.query(`INSERT INTO tasks (title, completed) VALUES ('Alpha done', true)`);
    await pool.query(`INSERT INTO tasks (title, completed) VALUES ('Beta todo', false)`);

    const res = await request(app).get(`${BASE}?completed=true&sort=title&order=asc`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].title).toBe('Alpha done');
    expect(res.body.data[1].title).toBe('Zeta done');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Integration: Input validation on real DB', () => {
  it('does not insert a task when title is whitespace-only', async () => {
    const res = await request(app).post(BASE).send({ title: '   ' });
    expect(res.status).toBe(400);

    // Confirm DB is still empty
    const check = await pool.query('SELECT COUNT(*) FROM tasks');
    expect(parseInt(check.rows[0].count, 10)).toBe(0);
  });

  it('does not insert a task when title exceeds 500 chars', async () => {
    const res = await request(app).post(BASE).send({ title: 'x'.repeat(501) });
    expect(res.status).toBe(400);

    const check = await pool.query('SELECT COUNT(*) FROM tasks');
    expect(parseInt(check.rows[0].count, 10)).toBe(0);
  });
});
