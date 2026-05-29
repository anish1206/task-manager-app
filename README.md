# Task Manager App

A task manager app built with **Node.js + Express** on the backend and **React (Vite)** on the frontend. Tasks persist to a local JSON file so they survive server restarts.

---

# Screenshots

<img width="940" height="600" alt="Screenshot 2026-04-10 130700" src="https://github.com/user-attachments/assets/b193580c-7b4d-4922-83c3-12f9194f67eb" />
<img width="871" height="520" alt="Screenshot 2026-04-10 130822" src="https://github.com/user-attachments/assets/f0de37f6-1ec7-4ee0-9946-9645d524e8d8" />
<img width="871" height="557" alt="Screenshot 2026-04-10 130809" src="https://github.com/user-attachments/assets/1fba4880-b96f-4cd0-a47f-de1b48f46071" />
<img width="911" height="581" alt="Screenshot 2026-04-10 130755" src="https://github.com/user-attachments/assets/81574fe1-db62-4e78-b01f-7e8d9f9e5874" />
<img width="879" height="561" alt="Screenshot 2026-04-10 130740" src="https://github.com/user-attachments/assets/dbc98148-4b8b-4b8e-97be-5d0cde9f85e0" />

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Running with Docker](#running-with-docker)
- [REST API Reference](#rest-api-reference)
- [Data Storage](#data-storage)
- [Frontend Overview](#frontend-overview)
- [Running Tests](#running-tests)
- [Assumptions & Trade-offs](#assumptions--trade-offs)

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- [Node.js](https://nodejs.org/) v18 or later
- npm v8 or later
- [Docker](https://www.docker.com/) (optional, for containerised setup)

---

## Project Structure

```
.
├── client/                    # React (Vite) frontend
│   ├── src/
│   │   ├── App.jsx            # Root component — state & API calls
│   │   ├── api.js             # fetch wrapper (reads VITE_API_URL for Docker)
│   │   ├── components/
│   │   │   ├── TaskForm.jsx   # Controlled input + submit button
│   │   │   ├── FilterBar.jsx  # All / Active / Done filter tabs
│   │   │   ├── TaskList.jsx   # Renders list of TaskItems
│   │   │   ├── TaskItem.jsx   # Checkbox, inline edit, delete button
│   │   │   └── StatusBar.jsx  # Loading spinner + error banner
│   │   └── index.css
│   ├── src/tests/
│   │   └── components.test.jsx
│   ├── Dockerfile
│   └── vite.config.js         # Dev proxy: /tasks → localhost:3001
│
├── server/                    # Express API
│   ├── index.js               # Entry point — starts server on port 3001
│   ├── app.js                 # Express app exported for testing
│   ├── store.js               # File-based persistence (tasks.json)
│   ├── routes/
│   │   └── tasks.js           # All /tasks route handlers
│   ├── tests/
│   │   └── tasks.test.mjs
│   ├── tasks.json             # Auto-created on first task
│   └── Dockerfile
│
├── docker-compose.yml
├── .gitignore
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

API server runs on **http://localhost:3001**.

**Terminal 2 — Frontend**

```bash
cd client
npm install
npm run dev
```

Frontend runs on **http://localhost:5173**. Open that URL in your browser.

> Both servers must be running simultaneously. The Vite dev server proxies all `/tasks` requests to the backend automatically — no CORS config needed.

---

## Running with Docker

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/) to be running.

```bash
docker compose up --build
```

| Service  | URL                       |
|----------|---------------------------|
| Frontend | http://localhost:5173     |
| Backend  | http://localhost:3001     |

Tasks are persisted in a named Docker volume (`tasks-data`) so they survive container restarts. To reset: `docker compose down -v`.

---

## REST API Reference

Base URL: `http://localhost:3001`

All request and response bodies use `application/json`.

---

### GET /tasks

Returns all tasks in the store.

**Response `200 OK`**
```json
[
  {
    "id": "a1b2c3d4-e5f6-...",
    "title": "Buy groceries",
    "completed": false,
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
]
```
Returns `[]` if no tasks exist.

---

### POST /tasks

Creates a new task.

**Request body**
```json
{ "title": "Buy groceries" }
```

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

### PUT /tasks/:id

Edits the title of an existing task.

**Request body**
```json
{ "title": "Updated title" }
```

**Response `200 OK`** — returns the full updated task

**Response `400 Bad Request`** — blank title

**Response `404 Not Found`** — unknown id

---

### PATCH /tasks/:id

Toggles the `completed` status of a task.

**Request body**
```json
{ "completed": true }
```

**Response `200 OK`** — returns the full updated task

**Response `404 Not Found`**
```json
{ "error": "Task not found." }
```

---

### DELETE /tasks/:id

Removes a task permanently.

**Response `204 No Content`** — empty body

**Response `404 Not Found`**
```json
{ "error": "Task not found." }
```

---

### Error response shape

All errors share the same shape:
```json
{ "error": "<human-readable message>" }
```

---

## Data Storage

Tasks are persisted to **`server/tasks.json`** using Node's built-in `fs` module — no database or extra dependencies required.

| Function      | Behaviour |
|---------------|-----------|
| `load()`      | Reads `tasks.json` on server startup. Returns `[]` if the file doesn't exist yet. |
| `save(tasks)` | Writes the full tasks array to disk after every POST, PUT, PATCH, and DELETE. |

The file is created automatically the first time a task is added. To start fresh, delete `server/tasks.json` and restart the server.

**Task data model**

| Field       | Type    | Description |
|-------------|---------|-------------|
| `id`        | string  | UUID v4 via `crypto.randomUUID()` |
| `title`     | string  | User-provided, trimmed of whitespace |
| `completed` | boolean | `false` on creation |
| `createdAt` | string  | ISO 8601 timestamp |

---

## Frontend Overview

Single-page React app scaffolded with Vite.

**Component tree**

```
App
├── StatusBar     — loading spinner + error banner
├── TaskForm      — controlled input + submit button
├── FilterBar     — All / Active / Done filter tabs with counts
└── TaskList
    └── TaskItem (×n)
        ├── Checkbox       — toggles completed
        ├── Title          — double-click or Edit button for inline editing
        └── Delete button
```

**State in `App.jsx`**

| State     | Type           | Description |
|-----------|----------------|-------------|
| `tasks`   | array          | Full task list from the API |
| `loading` | boolean        | `true` while any request is in flight |
| `error`   | string \| null | Last error message; cleared on next action |
| `filter`  | string         | Active filter: `'all'`, `'active'`, or `'completed'` |

**Inline editing** — double-click a task title (or click the Edit button) to edit in place. Press **Enter** to save, **Escape** to cancel, or click away to commit.

**API helper** — `client/src/api.js` wraps `fetch` and prepends `VITE_API_URL` when set (used in Docker production builds). In dev, the Vite proxy handles routing so no env var is needed.

---

## Running Tests

### Quick Start

**Backend** — 17 tests covering all endpoints + health check

```bash
cd server
npm test                 # Run once
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage report
```

**Frontend** — 29 tests covering all components + integration

```bash
cd client
npm test                 # Run once
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage report
npm run lint             # Run ESLint
```

### CI/CD Pipeline

Tests run automatically on every push to `master` via GitHub Actions:

- ✅ Server tests (with PostgreSQL)
- ✅ Client tests (with linting)
- ✅ Docker build verification
- ✅ Security vulnerability scanning

View results in the **Actions** tab on GitHub.

### Test Coverage

**Server (17 tests)**
- All CRUD operations (GET, POST, PUT, PATCH, DELETE)
- Health check endpoint
- Input validation
- Error handling
- Database integration

**Client (29 tests)**
- All components (TaskForm, TaskItem, TaskList, FilterBar, StatusBar)
- User interactions (click, type, submit)
- API integration
- State management
- Filtering logic
- Error and loading states

### Documentation

- **[TESTING.md](TESTING.md)** - Comprehensive testing guide
- **[GITHUB_ACTIONS_SETUP.md](GITHUB_ACTIONS_SETUP.md)** - CI/CD setup guide
- **[TESTS_AND_CI_SUMMARY.md](TESTS_AND_CI_SUMMARY.md)** - Detailed test breakdown

---

## Assumptions & Trade-offs

- **File-based persistence** — `server/tasks.json` survives restarts but is not suitable for concurrent multi-process deployments. A proper database (SQLite, PostgreSQL) would be the next step for production.
- **No authentication** — any client with network access to port 3001 can read and modify all tasks. Auth is out of scope.
- **Vite proxy for local dev** — proxies `/tasks` to `localhost:3001`, avoiding CORS config. In production (Docker), `VITE_API_URL` is injected at build time.
- **No TypeScript** — plain JavaScript throughout to keep the codebase approachable.
- **Single-user** — no concept of users or task ownership; all tasks are shared across all connected clients.
