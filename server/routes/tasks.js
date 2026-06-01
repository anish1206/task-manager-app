const express = require('express');
const router = express.Router();
const pool = require('../db');
const { body, query, validationResult } = require('express-validator');

const DEV_USER_ID =
  process.env.NODE_ENV === 'test' ? null : (process.env.DEV_USER_ID || null);

// ── Validation middleware ─────────────────────────────────────────────────────

/** Shared title validation rules (POST + PUT) */
const titleRules = [
  body('title')
    .exists({ checkNull: true })
    .withMessage('Title is required')
    .bail()
    .isString()
    .withMessage('Title must be a string')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ max: 500 })
    .withMessage('Title must be 500 characters or fewer'),
];

/** Respond 400 if there are validation errors */
function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Surface the first error's message as the primary `error` field
    // (keeps backwards-compat) plus a full `errors` array for clients that want detail
    const firstMsg = errors.array()[0].msg;
    return res.status(400).json({ error: firstMsg, errors: errors.array() });
  }
  next();
}

// ── GET /api/v1/tasks ─────────────────────────────────────────────────────────
// Query params:
//   completed=true|false     — filter by completion status
//   sort=createdAt|updatedAt|title   — field to sort by (default: createdAt)
//   order=asc|desc           — sort direction (default: desc)
//   limit=<n>                — page size, 1-100 (default: 20)
//   cursor=<created_at_iso>__<id>    — cursor for next page
router.get('/', async (req, res) => {
  try {
    // ── Parse & validate query params ────────────────────────────────────────
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

    // Sort field whitelist
    const sortFieldMap = {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      title: 'title',
    };
    const sortField = sortFieldMap[req.query.sort] || 'created_at';

    const order = req.query.order === 'asc' ? 'ASC' : 'DESC';

    // completed filter: only apply when the param is explicitly 'true' or 'false'
    let completedFilter = null;
    if (req.query.completed === 'true') completedFilter = true;
    else if (req.query.completed === 'false') completedFilter = false;

    // Cursor decoding: "<created_at_iso>__<id>"
    let cursorCreatedAt = null;
    let cursorId = null;
    if (req.query.cursor) {
      const parts = req.query.cursor.split('__');
      if (parts.length === 2) {
        cursorCreatedAt = parts[0];
        cursorId = parts[1];
      }
    }

    // ── Build parameterized query ─────────────────────────────────────────────
    const params = [];

    const conditions = [];

    // User filter (dev mode only)
    if (DEV_USER_ID) {
      params.push(DEV_USER_ID);
      conditions.push(`user_id = $${params.length}`);
    }

    // Completed filter
    if (completedFilter !== null) {
      params.push(completedFilter);
      conditions.push(`completed = $${params.length}`);
    }

    // Cursor condition — fetch rows that come *after* the cursor position
    // Using (sort_field, id) tuple comparison for stable pagination
    if (cursorCreatedAt && cursorId) {
      params.push(cursorCreatedAt);
      params.push(cursorId);
      // For DESC: rows where (col, id) < (cursor_col, cursor_id)
      // For ASC:  rows where (col, id) > (cursor_col, cursor_id)
      const cmp = order === 'DESC' ? '<' : '>';
      conditions.push(
        `(${sortField}, id::text) ${cmp} ($${params.length - 1}, $${params.length})`
      );
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Fetch limit+1 to determine if there's a next page
    params.push(limit + 1);
    const limitParam = `$${params.length}`;

    const sql = `
      SELECT id, title, completed, created_at, updated_at
      FROM tasks
      ${whereClause}
      ORDER BY ${sortField} ${order}, id ${order}
      LIMIT ${limitParam}
    `;

    const result = await pool.query(sql, params);

    const hasMore = result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;

    // Build next cursor from the last row in the result set
    let nextCursor = null;
    if (hasMore && rows.length > 0) {
      const last = rows[rows.length - 1];
      const cursorVal = sortField === 'title' ? last.title : last[sortField].toISOString();
      nextCursor = `${cursorVal}__${last.id}`;
    }

    res.status(200).json({
      data: rows,
      pagination: {
        hasMore,
        nextCursor,
        limit,
      },
    });
  } catch (err) {
    console.error('GET /tasks error:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// ── POST /api/v1/tasks ────────────────────────────────────────────────────────
router.post('/', titleRules, handleValidation, async (req, res) => {
  try {
    const title = req.body.title.trim();

    let result;
    if (DEV_USER_ID) {
      result = await pool.query(
        `INSERT INTO tasks (user_id, title)
         VALUES ($1, $2)
         RETURNING id, title, completed, created_at, updated_at`,
        [DEV_USER_ID, title]
      );
    } else {
      result = await pool.query(
        `INSERT INTO tasks (title)
         VALUES ($1)
         RETURNING id, title, completed, created_at, updated_at`,
        [title]
      );
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /tasks error:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// ── PUT /api/v1/tasks/:id ─────────────────────────────────────────────────────
router.put('/:id', titleRules, handleValidation, async (req, res) => {
  try {
    const title = req.body.title.trim();

    const result = await pool.query(
      `UPDATE tasks
       SET title = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, title, completed, created_at, updated_at`,
      [title, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('PUT /tasks/:id error:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// ── PATCH /api/v1/tasks/:id ───────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    let result;

    if (typeof req.body.completed === 'boolean') {
      result = await pool.query(
        `UPDATE tasks
         SET completed = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, title, completed, created_at, updated_at`,
        [req.body.completed, req.params.id]
      );
    } else {
      result = await pool.query(
        `UPDATE tasks
         SET completed = NOT completed, updated_at = NOW()
         WHERE id = $1
         RETURNING id, title, completed, created_at, updated_at`,
        [req.params.id]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('PATCH /tasks/:id error:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// ── DELETE /api/v1/tasks/:id ──────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM tasks
       WHERE id = $1
       RETURNING id`,
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
