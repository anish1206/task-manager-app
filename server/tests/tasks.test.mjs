import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const request = require('supertest');
const app = require('../app');
const pool = require('../db');

function makeTask(overrides = {}) {
  return {
    title: overrides.title ?? 'Test task',
    completed: overrides.completed ?? false,
  };
}

// Clean up test data before and after tests
beforeAll(async () => {
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
  // Clean all tasks before each test
  await pool.query('DELETE FROM tasks');
});

afterAll(async () => {
  // Clean up and close connection
  await pool.query('DELETE FROM tasks');
  await pool.end();
});

describe('GET /tasks', () => {
  it('returns empty array when no tasks', async () => {
    const res = await request(app).get('/tasks');
    
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns all tasks', async () => {
    const buyMilk = await pool.query(
      `INSERT INTO tasks (title, completed) VALUES ('Buy milk', false) RETURNING id`
    );
    await pool.query(
      `INSERT INTO tasks (title, completed, created_at) VALUES ('Walk dog', true, NOW() + interval '1 second')`
    );

    const res = await request(app).get('/tasks');
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.map((task) => task.title)).toEqual(['Walk dog', 'Buy milk']);
    expect(res.body.some((task) => task.id === buyMilk.rows[0].id)).toBe(true);
  });
});

describe('POST /tasks', () => {
  it('creates a task and returns 201', async () => {
    const res = await request(app).post('/tasks').send({ title: 'Walk the dog' });
    
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Walk the dog');
    expect(res.body.completed).toBe(false);
    expect(res.body.id).toBeDefined();
    expect(res.body.created_at).toBeDefined();
  });

  it('returns 400 for empty title', async () => {
    const res = await request(app).post('/tasks').send({ title: '' });
    
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Title is required');
  });

  it('returns 400 for missing title', async () => {
    const res = await request(app).post('/tasks').send({});
    
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Title is required');
  });

  it('trims whitespace from title', async () => {
    const res = await request(app).post('/tasks').send({ title: '  Trimmed task  ' });
    
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Trimmed task');
  });
});

describe('PUT /tasks/:id', () => {
  it('updates task title', async () => {
    const created = await pool.query(`INSERT INTO tasks (title) VALUES ('Original') RETURNING *`);
    const taskId = created.rows[0].id;

    const res = await request(app).put(`/tasks/${taskId}`).send({ title: 'Updated title' });
    
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated title');
    expect(res.body.id).toBe(taskId);
  });

  it('returns 404 for non-existent task', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app).put(`/tasks/${fakeId}`).send({ title: 'New title' });
    
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Task not found');
  });

  it('returns 400 for empty title', async () => {
    const created = await pool.query(`INSERT INTO tasks (title) VALUES ('Original') RETURNING *`);
    const taskId = created.rows[0].id;

    const res = await request(app).put(`/tasks/${taskId}`).send({ title: '' });
    
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Title is required');
  });
});

describe('PATCH /tasks/:id', () => {
  it('toggles completed status', async () => {
    const created = await pool.query(`INSERT INTO tasks (title, completed) VALUES ('Task', false) RETURNING *`);
    const taskId = created.rows[0].id;

    const res = await request(app).patch(`/tasks/${taskId}`).send({ completed: true });
    
    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(true);
  });

  it('toggles without explicit value', async () => {
    const created = await pool.query(`INSERT INTO tasks (title, completed) VALUES ('Task', false) RETURNING *`);
    const taskId = created.rows[0].id;

    const res = await request(app).patch(`/tasks/${taskId}`).send({});
    
    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(true); // Toggled from false to true
  });

  it('returns 404 for non-existent task', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app).patch(`/tasks/${fakeId}`).send({ completed: true });
    
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Task not found');
  });
});

describe('DELETE /tasks/:id', () => {
  it('removes the task', async () => {
    const created = await pool.query(`INSERT INTO tasks (title) VALUES ('To delete') RETURNING *`);
    const taskId = created.rows[0].id;

    const res = await request(app).delete(`/tasks/${taskId}`);
    
    expect(res.status).toBe(204);

    // Verify it's deleted
    const check = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    expect(check.rows).toHaveLength(0);
  });

  it('returns 404 for non-existent task', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app).delete(`/tasks/${fakeId}`);
    
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Task not found');
  });
});
