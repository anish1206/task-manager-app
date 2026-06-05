const express = require('express');
const router = express.Router();
const pool = require('../db');
const cache = require('../cache');
const { body, validationResult } = require('express-validator');

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

    const sortFieldMap = {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      title: 'title',
    };
    const sortField = sortFieldMap[req.query.sort] || 'created_at';
    const order = req.query.order === 'asc' ? 'ASC' : 'DESC';

    let completedFilter = null;
    if (req.query.completed === 'true') completedFilter = true;
    else if (req.query.completed === 'false') completedFilter = false;

    let cursorCreatedAt = null;
    let cursorId = null;
    if (req.query.cursor) {
      const parts = req.query.cursor.split('__');
      if (parts.length === 2) {
        cursorCreatedAt = parts[0];
        cursorId = parts[1];
      }
    }

    // ── Cache read-through ────────────────────────────────────────────────────
    const cacheKey = cache.taskListKey(req.user.id, req.query);
    const cached = await cache.get(cacheKey);
    if (cached) {
      // Serve from Redis — skip the DB entirely
      return res
        .status(200)
        .set('X-Cache', 'HIT')
        .set('Cache-Control', 'private, max-age=60')
        .json(cached);
    }

    // ── Build parameterized query ─────────────────────────────────────────────
    const params = [];
    const conditions = [];

    params.push(req.user.id);
    conditions.push(`user_id = $${params.length}`);

    if (completedFilter !== null) {
      params.push(completedFilter);
      conditions.push(`completed = $${params.length}`);
    }

    if (cursorCreatedAt && cursorId) {
      params.push(cursorCreatedAt);
      params.push(cursorId);
      const cmp = order === 'DESC' ? '<' : '>';
      conditions.push(
        `(${sortField}, id::text) ${cmp} ($${params.length - 1}, $${params.length})`
      );
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

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

    let nextCursor = null;
    if (hasMore && rows.length > 0) {
      const last = rows[rows.length - 1];
      const cursorVal = sortField === 'title' ? last.title : last[sortField].toISOString();
      nextCursor = `${cursorVal}__${last.id}`;
    }

    const responseBody = {
      data: rows,
      pagination: { hasMore, nextCursor, limit },
    };

    // ── Cache write ───────────────────────────────────────────────────────────
    await cache.set(cacheKey, responseBody);

    res
      .status(200)
      .set('X-Cache', 'MISS')
      .set('Cache-Control', 'private, max-age=60')
      .json(responseBody);

  } catch (err) {
    console.error('GET /tasks error:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// ── POST /api/v1/tasks ────────────────────────────────────────────────────────
router.post('/', titleRules, handleValidation, async (req, res) => {
  try {
    const title = req.body.title.trim();

    const result = await pool.query(
      `INSERT INTO tasks (user_id, title)
       VALUES ($1, $2)
       RETURNING id, title, completed, created_at, updated_at`,
      [req.user.id, title]
    );

    // Invalidate all cached pages for this user so the next GET is fresh
    await cache.invalidateUser(req.user.id);

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
       WHERE id = $2 AND user_id = $3
       RETURNING id, title, completed, created_at, updated_at`,
      [title, req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    await cache.invalidateUser(req.user.id);

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
         WHERE id = $2 AND user_id = $3
         RETURNING id, title, completed, created_at, updated_at`,
        [req.body.completed, req.params.id, req.user.id]
      );
    } else {
      result = await pool.query(
        `UPDATE tasks
         SET completed = NOT completed, updated_at = NOW()
         WHERE id = $1 AND user_id = $2
         RETURNING id, title, completed, created_at, updated_at`,
        [req.params.id, req.user.id]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    await cache.invalidateUser(req.user.id);

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
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    await cache.invalidateUser(req.user.id);

    res.status(204).send();
  } catch (err) {
    console.error('DELETE /tasks/:id error:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

module.exports = router;
