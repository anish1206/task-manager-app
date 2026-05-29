const express = require('express');
const router = express.Router();
const pool = require('../db');

const DEV_USER_ID = process.env.NODE_ENV === 'test' ? null : (process.env.DEV_USER_ID || null);

// GET all tasks
router.get('/', async (req, res) => {
  try {
    let result;

    if (DEV_USER_ID) {
      result = await pool.query(
        `
        SELECT id, title, completed, created_at, updated_at
        FROM tasks
        WHERE user_id = $1
        ORDER BY created_at DESC
        `,
        [DEV_USER_ID]
      );
    } else {
      result = await pool.query(
        `
        SELECT id, title, completed, created_at, updated_at
        FROM tasks
        ORDER BY created_at DESC
        `
      );
    }

    res.json(result.rows);
  } catch (err) {
    console.error('GET /tasks error:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// CREATE task
router.post('/', async (req, res) => {
  try {
    const title = req.body.title?.trim();

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    let result;

    if (DEV_USER_ID) {
      result = await pool.query(
        `
        INSERT INTO tasks (user_id, title)
        VALUES ($1, $2)
        RETURNING id, title, completed, created_at, updated_at
        `,
        [DEV_USER_ID, title]
      );
    } else {
      result = await pool.query(
        `
        INSERT INTO tasks (title)
        VALUES ($1)
        RETURNING id, title, completed, created_at, updated_at
        `,
        [title]
      );
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /tasks error:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// UPDATE task title
router.put('/:id', async (req, res) => {
  try {
    const title = req.body.title?.trim();

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const result = await pool.query(
      `
      UPDATE tasks
      SET title = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, title, completed, created_at, updated_at
      `,
      [title, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('PUT /tasks/:id error:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// TOGGLE or SET completed
router.patch('/:id', async (req, res) => {
  try {
    let result;

    if (typeof req.body.completed === 'boolean') {
      result = await pool.query(
        `
        UPDATE tasks
        SET completed = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id, title, completed, created_at, updated_at
        `,
        [req.body.completed, req.params.id]
      );
    } else {
      result = await pool.query(
        `
        UPDATE tasks
        SET completed = NOT completed, updated_at = NOW()
        WHERE id = $1
        RETURNING id, title, completed, created_at, updated_at
        `,
        [req.params.id]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('PATCH /tasks/:id error:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// DELETE task
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `
      DELETE FROM tasks
      WHERE id = $1
      RETURNING id
      `,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.status(204).send();
  } catch (err) {
    console.error('DELETE /tasks/:id error:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

module.exports = router;
