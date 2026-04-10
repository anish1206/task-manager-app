import { describe, it, beforeEach, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const request = require('supertest');
const app = require('../app');
const { resetTasks } = require('../routes/tasks');

function makeTask(overrides = {}) {
  return {
    id:        overrides.id        ?? crypto.randomUUID(),
    title:     overrides.title     ?? 'Test task',
    completed: overrides.completed ?? false,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
  };
}

beforeEach(() => resetTasks([]));

it('GET /tasks returns all tasks', async () => {
  const task = makeTask({ title: 'Buy milk' });
  resetTasks([task]);
  const res = await request(app).get('/tasks');
  expect(res.status).toBe(200);
  expect(res.body).toEqual([task]);
});

it('POST /tasks creates a task and returns 201', async () => {
  const res = await request(app).post('/tasks').send({ title: 'Walk the dog' });
  expect(res.status).toBe(201);
  expect(res.body.title).toBe('Walk the dog');
  expect(res.body.completed).toBe(false);
  expect(typeof res.body.id).toBe('string');
});

it('POST /tasks returns 400 for empty title', async () => {
  const res = await request(app).post('/tasks').send({ title: '' });
  expect(res.status).toBe(400);
  expect(res.body).toHaveProperty('error');
});

it('PATCH /tasks/:id toggles completed', async () => {
  const task = makeTask({ completed: false });
  resetTasks([task]);
  const res = await request(app).patch(`/tasks/${task.id}`).send({ completed: true });
  expect(res.status).toBe(200);
  expect(res.body.completed).toBe(true);
});

it('DELETE /tasks/:id removes the task', async () => {
  const task = makeTask();
  resetTasks([task]);
  const del = await request(app).delete(`/tasks/${task.id}`);
  expect(del.status).toBe(204);
  const get = await request(app).get('/tasks');
  expect(get.body.find(t => t.id === task.id)).toBeUndefined();
});
