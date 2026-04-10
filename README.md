# Task Manager App

A task manager app built with **Node.js + Express** on the backend and **React (Vite)** on the frontend. Tasks are persisted to a local JSON file so they survive server restarts.

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- npm v8 or later

---

## Project Structure

```
.
├── client/                  # React (Vite) frontend
│   ├── src/
│   │   ├── App.jsx          # Root component — state & API calls
│   │   ├── components/
│   │   │   ├── TaskForm.jsx
│   │   │   ├── TaskList.jsx
│   │   │   ├── TaskItem.jsx
│   │   │   └── StatusBar.jsx
│   │   └── index.css
│   └── vite.config.js      
│
├── server/                  # Express API
│   ├── index.js             # Entry point — starts server on port 3001
│   ├── app.js               # Express app
│   ├── store.js             # File-based persistence (tasks.json)
│   ├── routes/
│   │   └── tasks.js         # All /tasks route handlers
│   └── tasks.json           # Auto-created on first task (gitignore this if needed)
│
└── README.md
```

---

## Getting Started

Open two terminals.

**Terminal 1 — Backend**

```bash
cd server
npm install
node index.js
```

The API server starts on **http://localhost:3001**.

**Terminal 2 — Frontend**

```bash
cd client
npm install
npm run dev
```

The frontend starts on **http://localhost:5173**. Open that URL in your browser.

> Both servers must be running at the same time. The Vite dev server proxies all `/tasks` requests to the backend automatically.

---

## REST API Reference

Base URL: `http://localhost:3001`

All request and response bodies use `application/json`.

---

### GET /tasks

Returns all tasks currently in the store.

**Response `200 OK`**

```json
[
  {
    "id": "a1b2c3d4-...",
    "title": "Buy groceries",
    "completed": false,
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
]
```

Returns an empty array `[]` if no tasks exist.

---

### POST /tasks

Creates a new task.

**Request body**

```json
{ "title": "Buy groceries" }
```

| Field   | Type   | Required | Notes                          |
|---------|--------|----------|--------------------------------|
| `title` | string | yes      | Must be non-empty, non-whitespace |

**Response `201 Created`**

```json
{
  "id": "a1b2c3d4-e5f6-...",
  "title": "Buy groceries",
  "completed": false,
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

**Response `400 Bad Request`** — missing or blank title

```json
{ "error": "Title is required and must be a non-empty string." }
```

---

### PATCH /tasks/:id

Updates the `completed` status of a task.

**URL parameter**

| Param | Description        |
|-------|--------------------|
| `id`  | UUID of the task   |

**Request body**

```json
{ "completed": true }
```

**Response `200 OK`** — returns the full updated task

```json
{
  "id": "a1b2c3d4-...",
  "title": "Buy groceries",
  "completed": true,
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

**Response `404 Not Found`**

```json
{ "error": "Task not found." }
```

---

### DELETE /tasks/:id

Removes a task permanently.

**URL parameter**

| Param | Description        |
|-------|--------------------|
| `id`  | UUID of the task   |

**Response `204 No Content`** — empty body

**Response `404 Not Found`**

```json
{ "error": "Task not found." }
```

---

### Error response shape

All error responses share the same shape and always include `Content-Type: application/json`:

```json
{ "error": "<human-readable message>" }
```

---

## Data Storage

Tasks are persisted to **`server/tasks.json`** using Node's built-in `fs` module — no database or extra dependencies required.

**How it works (`server/store.js`)**

| Function      | Behaviour                                                                 |
|---------------|---------------------------------------------------------------------------|
| `load()`      | Reads `tasks.json` on server startup. Returns `[]` if the file doesn't exist yet. |
| `save(tasks)` | Writes the full tasks array to `tasks.json` after every mutation (POST, PATCH, DELETE). |

The file is created automatically the first time a task is added. If you want a clean slate, delete `server/tasks.json` and restart the server.

**Task data model**

| Field       | Type    | Description                              |
|-------------|---------|------------------------------------------|
| `id`        | string  | UUID v4, generated via `crypto.randomUUID()` |
| `title`     | string  | User-provided, trimmed of whitespace     |
| `completed` | boolean | `false` on creation                      |
| `createdAt` | string  | ISO 8601 timestamp at creation time      |

---

## Frontend Overview

The frontend is a single-page React app scaffolded with Vite.

**Component tree**

```
App
├── StatusBar   — loading spinner + error banner
├── TaskForm    — controlled input + submit button
└── TaskList
    └── TaskItem (×n) — checkbox, title, delete button
```

**State management** — all state lives in `App.jsx`:

| State     | Type      | Description                              |
|-----------|-----------|------------------------------------------|
| `tasks`   | array     | The current list of tasks from the API   |
| `loading` | boolean   | `true` while any API request is in flight |
| `error`   | string \| null | Last error message, cleared on next action |

**API calls** — all use `fetch()` with the pattern:

```js
setLoading(true);
setError(null);
try {
  const res = await fetch('/tasks', { method, headers, body });
  if (!res.ok) throw new Error((await res.json()).error || 'Request failed');
  // update state optimistically from response
} catch (err) {
  setError(err.message);
} finally {
  setLoading(false);
}
```

Interactive controls (submit button, checkboxes, delete buttons) are disabled while `loading` is `true` to prevent duplicate requests.

---

## Assumptions & Trade-offs

- **File-based persistence** — Tasks are stored in `server/tasks.json`. This survives restarts but is not suitable for concurrent multi-process deployments. A proper database (SQLite, PostgreSQL, etc.) would be the next step for production use.
- **No authentication** — Any client with network access to port 3001 can read and modify all tasks. Auth is out of scope for this implementation.
- **Vite proxy for local development** — The Vite dev server proxies `/tasks` to `localhost:3001`, avoiding CORS configuration during development. In production, both could be served from the same origin or a reverse proxy (e.g. nginx) would handle routing.
- **No TypeScript** — Plain JavaScript is used throughout to keep the codebase approachable and reduce setup overhead.
- **Single-user** — There is no concept of users or task ownership. All tasks are shared across all clients connected to the same server instance.
