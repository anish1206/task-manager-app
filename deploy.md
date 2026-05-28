# 🚀 Production Deployment & Scaling Plan

## Task Manager App — From Localhost to 1 Million Requests

> **Your stack today:** React 19 + Vite 8 (frontend) · Express 5 + JSON file storage (backend) · Docker Compose  
> **Your stack at scale:** React on CDN · Express cluster behind NGINX · PostgreSQL + Redis · CI/CD · Monitoring

This document is your complete roadmap. Each section builds on the last — read it top-to-bottom the first time, then use it as a reference.

---

## Table of Contents

1. [Architecture Planning](#1-architecture-planning)
2. [Deployment Strategy](#2-deployment-strategy)
3. [Hosting & Infra Choices (Zero Cost)](#3-hosting--infra-choices-zero-cost)
4. [Database Engineering](#4-database-engineering)
5. [Scalability Engineering](#5-scalability-engineering)
6. [Security Engineering](#6-security-engineering)
7. [Observability & Monitoring](#7-observability--monitoring)
8. [Testing Strategy](#8-testing-strategy)
9. [DevOps & Reliability](#9-devops--reliability)
10. [Interview Preparation](#10-interview-preparation)

---

# 1. Architecture Planning

## 1.1 Where You Are Today

Your current app runs like this:

```mermaid
graph LR
    Browser["🖥️ Browser<br/>React + Vite"]
    Express["⚙️ Express Server<br/>Port 3001"]
    JSON["📄 tasks.json<br/>File on Disk"]

    Browser -->|"HTTP REST"| Express
    Express -->|"fs.readFileSync"| JSON
```

**What works:** Simple, easy to understand, zero config.  
**What breaks at scale:** The JSON file can't handle concurrent writes, there's no caching, no auth, and a single server crash loses everything.

## 1.2 Where You Need to Be

```mermaid
graph TB
    subgraph "Users"
        U1["👤 User 1"]
        U2["👤 User 2"]
        U3["👤 User N"]
    end

    subgraph "CDN Edge"
        CDN["☁️ Cloudflare CDN<br/>Serves React static files"]
    end

    subgraph "Load Balancer"
        LB["⚖️ NGINX<br/>Reverse Proxy + SSL"]
    end

    subgraph "Application Tier"
        API1["⚙️ Express #1"]
        API2["⚙️ Express #2"]
    end

    subgraph "Cache Layer"
        Redis["🔴 Redis<br/>Session + Query Cache"]
    end

    subgraph "Database"
        PG["🐘 PostgreSQL<br/>Primary"]
        PGR["🐘 PostgreSQL<br/>Read Replica"]
    end

    U1 & U2 & U3 --> CDN
    CDN -->|"API calls only"| LB
    LB --> API1 & API2
    API1 & API2 --> Redis
    API1 & API2 --> PG
    PG -->|"Replication"| PGR
    API1 & API2 -.->|"Read queries"| PGR
```

Don't panic — you won't build all of this on day one. We'll evolve step by step.

## 1.3 Key Architecture Concepts

### Frontend Architecture

Your React app is a **Single Page Application (SPA)**. In production, Vite builds it into static HTML/CSS/JS files. These files don't need a Node server — any static file host (Vercel, Netlify, Cloudflare Pages) can serve them.

**Why this matters:** Your frontend and backend can be deployed independently. The frontend is "just files" — cheap to host and easy to put behind a CDN.

```
client/dist/
├── index.html        ← Entry point
├── assets/
│   ├── index-abc123.js   ← Your React app (bundled + minified)
│   └── index-def456.css  ← Your styles (bundled + minified)
```

### Backend Architecture

Your Express server is a **stateless REST API** (almost). Right now it reads/writes `tasks.json`, which makes it stateful. Once you switch to a database, the server becomes truly stateless — any instance can handle any request.

**Stateless = Scalable.** If the server holds no data in memory, you can run 10 copies behind a load balancer and they all behave identically.

### API Design — What You Already Have (and it's good)

| Method   | Endpoint       | Purpose            | Status Codes     |
|----------|----------------|---------------------|------------------|
| `GET`    | `/tasks`       | List all tasks      | `200`            |
| `POST`   | `/tasks`       | Create a task       | `201`, `400`     |
| `PUT`    | `/tasks/:id`   | Edit task title     | `200`, `400`, `404` |
| `PATCH`  | `/tasks/:id`   | Toggle completed    | `200`, `404`     |
| `DELETE` | `/tasks/:id`   | Remove a task       | `204`, `404`     |

This is textbook REST. For production, you'd add:

- **Pagination:** `GET /tasks?page=1&limit=20` — don't return 100K tasks at once
- **Filtering:** `GET /tasks?completed=true` — let the database do the filtering
- **Sorting:** `GET /tasks?sort=createdAt&order=desc`
- **Versioning:** `/api/v1/tasks` — lets you change the API without breaking old clients

### Reverse Proxy & Load Balancer

**NGINX** sits in front of your Express servers. It does three jobs:

1. **SSL Termination** — handles HTTPS so Express doesn't have to
2. **Load Balancing** — distributes requests across multiple Express instances
3. **Static File Serving** — can serve your React build files directly

```nginx
# Simplified NGINX config for your app
upstream api_servers {
    server express1:3001;
    server express2:3001;
}

server {
    listen 443 ssl;
    server_name taskmanager.example.com;

    ssl_certificate     /etc/ssl/cert.pem;
    ssl_certificate_key /etc/ssl/key.pem;

    # Serve React static files
    location / {
        root /var/www/client/dist;
        try_files $uri $uri/ /index.html;
    }

    # Proxy API calls to Express
    location /api/ {
        proxy_pass http://api_servers;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Monolith vs Microservices — Keep It Simple

| Approach | When to Use | Your App |
|----------|-------------|----------|
| **Monolith** | < 10 developers, single domain | ✅ **Use this** |
| **Microservices** | Large teams, complex domains | ❌ Overkill |

**Your app is a monolith and should stay one.** A Todo app has one domain (tasks). Splitting it into microservices adds network latency, deployment complexity, and debugging headaches with zero benefit.

> **Interview tip:** "I chose a monolith because the domain is simple. If we added users, teams, notifications, and billing, I'd consider extracting a notification service first because it's independently deployable and has different scaling needs."

### Horizontal vs Vertical Scaling

| Type | What It Means | Example | Cost |
|------|--------------|---------|------|
| **Vertical** | Bigger machine | 1 CPU → 4 CPU | Expensive, has a ceiling |
| **Horizontal** | More machines | 1 server → 4 servers | Cheaper, nearly unlimited |

**Your strategy:** Start vertical (it's simpler). Go horizontal when a single server can't keep up.

### CDN (Content Delivery Network)

A CDN copies your React files to servers worldwide. A user in India gets files from a server in Mumbai, not your server in the US.

```mermaid
graph LR
    User_IN["👤 User in India"] --> Edge_IN["🌐 CDN Edge<br/>Mumbai"]
    User_US["👤 User in US"] --> Edge_US["🌐 CDN Edge<br/>Virginia"]
    Edge_IN & Edge_US -.->|"Cache miss"| Origin["🏠 Origin Server"]
```

**Free CDN options:** Cloudflare (unlimited bandwidth), Vercel, Netlify.

### Caching Strategy

Caching means storing results so you don't recompute them. Three levels:

```mermaid
graph LR
    Browser["🖥️ Browser Cache<br/>Cache-Control headers"] --> CDN_C["☁️ CDN Cache<br/>Static assets"] --> Redis_C["🔴 Redis Cache<br/>API responses"] --> DB["🐘 Database"]
```

| Layer | What to Cache | TTL (Time to Live) |
|-------|--------------|---------------------|
| **Browser** | JS/CSS bundles, images | 1 year (versioned filenames) |
| **CDN** | Static files | 1 year |
| **Redis** | `GET /tasks` response for a user | 30 seconds |
| **Database** | Query result cache | Built-in |

**Cache invalidation** (the hard part): When a user creates/updates/deletes a task, you must clear their cached task list from Redis.

```javascript
// Example: Invalidate cache on write
router.post('/', async (req, res) => {
    const task = await db.createTask(req.body.title, req.user.id);
    await redis.del(`tasks:${req.user.id}`);  // Clear cache
    res.status(201).json(task);
});
```

### Queue Systems & Background Jobs

Some work shouldn't happen during an API request. Examples:

- Sending email notifications ("Task assigned to you")
- Generating reports
- Processing bulk imports

```mermaid
graph LR
    API["⚙️ Express API"] -->|"Add job"| Queue["📬 Job Queue<br/>(BullMQ + Redis)"]
    Queue --> Worker["🔧 Worker Process<br/>(Separate Node.js)"]
    Worker --> Email["📧 Send Email"]
```

For your Todo app, queues are overkill right now. But mentioning them in interviews shows you understand async processing.

### Session Management

**Your app today:** No auth, no sessions.  
**Production:** Use JWTs (JSON Web Tokens) stored in HTTP-only cookies.

```
Client → Login request → Server creates JWT → Sets cookie → Client
Client → GET /tasks → Cookie sent automatically → Server validates JWT → Returns tasks
```

JWTs are **stateless** — the server doesn't need to store session data. The token itself contains the user ID and expiration.

### Rate Limiting

Prevents abuse. Without it, someone could hit your API 1 million times per second.

```javascript
// Using express-rate-limit (free, simple)
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 100,                   // 100 requests per window per IP
    message: { error: 'Too many requests, try again later.' }
});

app.use('/tasks', limiter);
```

---

# 2. Deployment Strategy

## 2.1 Environment Overview

You need three environments:

```mermaid
graph LR
    Dev["💻 Local Dev<br/>Your machine"] -->|"git push"| Staging["🧪 Staging<br/>Test before release"]
    Staging -->|"Manual approval"| Prod["🚀 Production<br/>Real users"]
```

| Environment | Purpose | Database | URL |
|-------------|---------|----------|-----|
| **Local Dev** | Writing code | JSON file / local PG | `localhost:5173` |
| **Staging** | Testing before release | Free-tier PG | `staging.yourapp.com` |
| **Production** | Real users | Free-tier PG | `yourapp.com` |

## 2.2 Dockerization (You Already Have This!)

Your Dockerfiles are solid. Here are improvements for production:

**Improved Server Dockerfile:**

```dockerfile
# server/Dockerfile (production-ready)
FROM node:20-alpine AS base

# Security: don't run as root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Install dependencies first (Docker layer caching)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy application code
COPY . .

# Switch to non-root user
USER appuser

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/tasks || exit 1

EXPOSE 3001

CMD ["node", "index.js"]
```

**Improved Client Dockerfile (multi-stage):**

```dockerfile
# client/Dockerfile (production-ready)
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Use NGINX instead of 'serve' for better performance
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Improved Docker Compose:**

```yaml
# docker-compose.yml (production-ready)
version: '3.9'

services:
  server:
    build: ./server
    ports:
      - '3001:3001'
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:password@db:5432/tasks
      - REDIS_URL=redis://redis:6379
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  client:
    build:
      context: ./client
      args:
        VITE_API_URL: http://localhost:3001
    ports:
      - '80:80'
    depends_on:
      - server
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: tasks
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 5

  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data

volumes:
  pgdata:
  redisdata:
```

## 2.3 CI/CD Pipeline with GitHub Actions

CI/CD automates testing and deployment every time you push code.

```mermaid
graph LR
    Push["📝 git push"] --> Lint["🔍 Lint"] --> Test["🧪 Test"] --> Build["🔨 Build"] --> Deploy["🚀 Deploy"]
```

**Create `.github/workflows/ci.yml`:**

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  # ──────────────────────────────────────────
  # Job 1: Lint & Test the Backend
  # ──────────────────────────────────────────
  test-server:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
          cache-dependency-path: server/package-lock.json

      - name: Install dependencies
        working-directory: server
        run: npm ci

      - name: Run tests
        working-directory: server
        run: npm test

  # ──────────────────────────────────────────
  # Job 2: Lint & Test the Frontend
  # ──────────────────────────────────────────
  test-client:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
          cache-dependency-path: client/package-lock.json

      - name: Install dependencies
        working-directory: client
        run: npm ci

      - name: Lint
        working-directory: client
        run: npm run lint

      - name: Run tests
        working-directory: client
        run: npm test

      - name: Build
        working-directory: client
        run: npm run build

  # ──────────────────────────────────────────
  # Job 3: Deploy (only on main branch push)
  # ──────────────────────────────────────────
  deploy:
    needs: [test-server, test-client]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Deploy to Render (free tier)
      - name: Deploy Backend to Render
        run: |
          curl -X POST "${{ secrets.RENDER_DEPLOY_HOOK_URL }}"

      # Frontend auto-deploys on Vercel via GitHub integration
```

**Why GitHub Actions?** Free for public repos (2,000 minutes/month for private). It's the industry standard.

## 2.4 Environment Variables & Secrets

**Never commit secrets to git.** Use environment variables.

```bash
# .env.example (commit this — it's a template)
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://postgres:password@localhost:5432/tasks
REDIS_URL=redis://localhost:6379
JWT_SECRET=change-me-in-production

# .env (DO NOT commit — add to .gitignore)
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://user:real_password@db-host:5432/tasks
REDIS_URL=redis://redis-host:6379
JWT_SECRET=a-very-long-random-string-here
```

**Where to store secrets in production:**

| Platform | How to Set Secrets |
|----------|--------------------|
| **GitHub Actions** | Repository → Settings → Secrets |
| **Render** | Dashboard → Environment tab |
| **Vercel** | Project → Settings → Environment Variables |
| **Railway** | Variables tab in dashboard |

## 2.5 SSL/TLS & Domain Setup

**HTTPS is mandatory in production.** Here's the simplest path:

1. **Buy a domain** — Namecheap (~$9/year) or get a free `.tech` domain from GitHub Student Pack
2. **Point DNS to your host** — Add an A record or CNAME in your domain registrar
3. **SSL is automatic** — Render, Vercel, Railway, and Cloudflare all provision free SSL certificates via Let's Encrypt

```
Browser → HTTPS (port 443) → Cloudflare → Your Server
         ↑ Encrypted end-to-end
```

## 2.6 Zero-Downtime Deployments

When you push a new version, users should never see an error page.

### Rolling Deployment (Recommended for your app)

```mermaid
graph LR
    subgraph "Step 1: Deploy new version alongside old"
        V1a["v1 ✅ serving traffic"]
        V2a["v2 🔄 starting up"]
    end

    subgraph "Step 2: Health check passes"
        V1b["v1 ✅ serving traffic"]
        V2b["v2 ✅ healthy"]
    end

    subgraph "Step 3: Switch traffic"
        V1c["v1 ❌ shutting down"]
        V2c["v2 ✅ serving traffic"]
    end
```

**Render does this automatically** on their free tier — no config needed.

### Blue-Green Deployment (For reference)

You maintain two identical environments. "Blue" is live, "Green" is the new version. Once Green is tested, you swap the DNS/load balancer to point to Green.

- **Pro:** Instant rollback (just swap back)
- **Con:** You pay for two environments simultaneously

### Graceful Shutdown in Express

Add this to your `index.js` so in-flight requests complete before the old server dies:

```javascript
const app = require('./app');

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('All connections closed. Exiting.');
        process.exit(0);
    });

    // Force kill after 10 seconds if connections don't close
    setTimeout(() => {
        console.error('Forcing shutdown after timeout.');
        process.exit(1);
    }, 10000);
});
```

---

# 3. Hosting & Infra Choices (Zero Cost)

## 3.1 Free Tier Comparison

| Service | What It Hosts | Free Tier Limits | Cold Start? | Best For |
|---------|--------------|------------------|-------------|----------|
| **Render** | Backend + DB | 750 hrs/month, spins down after 15 min | ⚠️ Yes, ~30s | Backend API |
| **Vercel** | Frontend | 100 GB bandwidth, unlimited deploys | ❌ No | React SPA |
| **Railway** | Full stack | $5 free credits/month | ❌ No | Quick prototypes |
| **Fly.io** | Backend | 3 shared VMs, 3 GB storage | ❌ No | Low-latency API |
| **Cloudflare Pages** | Frontend | Unlimited bandwidth | ❌ No | React SPA (alt to Vercel) |
| **Neon** | PostgreSQL | 0.5 GB storage, 1 branch | ⚠️ Yes, ~2s | PostgreSQL DB |
| **Supabase** | PostgreSQL + Auth | 500 MB DB, 50K auth users | ❌ No | DB + built-in auth |
| **MongoDB Atlas** | MongoDB | 512 MB storage | ❌ No | NoSQL DB |
| **Upstash** | Redis | 10K commands/day | ❌ No | Caching |

## 3.2 Recommended Free Stack

Here's the stack I recommend — all zero cost:

```mermaid
graph TB
    subgraph "Free Tier Production Stack"
        Vercel["☁️ Vercel<br/>React Frontend<br/>Free: Unlimited"]
        Render["⚙️ Render<br/>Express Backend<br/>Free: 750 hrs/mo"]
        Neon["🐘 Neon<br/>PostgreSQL<br/>Free: 0.5 GB"]
        Upstash["🔴 Upstash<br/>Redis Cache<br/>Free: 10K cmds/day"]
        GHA["🔧 GitHub Actions<br/>CI/CD<br/>Free: 2000 min/mo"]
    end

    Vercel -->|"API calls"| Render
    Render --> Neon
    Render --> Upstash
    GHA -->|"Deploy"| Vercel & Render
```

### Why This Stack?

| Choice | Reason |
|--------|--------|
| **Vercel for frontend** | Instant deploys from GitHub, global CDN, zero config for React/Vite |
| **Render for backend** | Easiest free backend hosting, auto-deploys from GitHub, free SSL |
| **Neon for PostgreSQL** | Serverless Postgres, generous free tier, instant branching for staging |
| **Upstash for Redis** | Serverless Redis, pay-per-request (free tier is enough for a portfolio) |
| **GitHub Actions for CI/CD** | Free for public repos, tight GitHub integration |

### Cost Estimate: $0/month

| Service | Monthly Cost |
|---------|-------------|
| Vercel (frontend) | $0 |
| Render (backend) | $0 |
| Neon (PostgreSQL) | $0 |
| Upstash (Redis) | $0 |
| GitHub Actions (CI/CD) | $0 |
| Cloudflare (DNS + SSL) | $0 |
| **Total** | **$0** |

## 3.3 The Cold Start Problem

Render's free tier **spins down your server after 15 minutes of inactivity**. The first request after that takes ~30 seconds.

**Mitigation strategies:**
1. **Accept it** — it's a portfolio project, not a business
2. **Cron ping** — use a free cron service (cron-job.org) to ping your API every 14 minutes
3. **Upgrade** — Render's paid tier ($7/month) keeps the server always on

> **Interview tip:** "I'm aware of cold start latency on serverless/free-tier platforms. In production, I'd use always-on instances or implement connection warming."

---

# 4. Database Engineering

## 4.1 Why You Need a Real Database

Your current `tasks.json` file storage has these problems:

| Problem | Why It Breaks |
|---------|---------------|
| **No concurrent access** | Two requests writing at the same time = data corruption |
| **No indexing** | Finding a task by ID requires scanning every task |
| **No querying** | Want tasks created this week? You'd parse every record |
| **No transactions** | If the write fails halfway, you get corrupted JSON |
| **No backups** | Server dies = data dies |

## 4.2 SQL vs NoSQL — The Decision

| Factor | PostgreSQL (SQL) | MongoDB (NoSQL) |
|--------|-----------------|-----------------|
| **Data structure** | Fixed schema, relations | Flexible documents |
| **Querying** | Powerful (JOIN, GROUP BY, window functions) | Good for simple lookups |
| **Transactions** | Full ACID | Limited multi-document |
| **Scaling reads** | Read replicas | Built-in sharding |
| **Best for** | Structured data with relationships | Rapidly changing schemas |
| **Free tier** | Neon (0.5 GB), Supabase (500 MB) | Atlas (512 MB) |

### Verdict: **PostgreSQL**

Your tasks have a clear, fixed structure (`id`, `title`, `completed`, `createdAt`). When you add users, you'll need relationships (a user *has many* tasks). SQL handles this naturally with JOINs. MongoDB would require embedding or manual reference management.

## 4.3 Database Schema Design

### ER Diagram

```mermaid
erDiagram
    users {
        uuid id PK "Primary Key"
        varchar email "UNIQUE, NOT NULL"
        varchar password_hash "NOT NULL"
        varchar display_name "NOT NULL"
        timestamp created_at "DEFAULT NOW()"
        timestamp updated_at "DEFAULT NOW()"
    }

    tasks {
        uuid id PK "Primary Key"
        uuid user_id FK "References users(id)"
        varchar title "NOT NULL, max 500 chars"
        boolean completed "DEFAULT false"
        integer position "For drag-and-drop ordering"
        timestamp created_at "DEFAULT NOW()"
        timestamp updated_at "DEFAULT NOW()"
    }

    users ||--o{ tasks : "has many"
```

### SQL Schema

```sql
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ──────────────────────────────────────────
-- Users table
-- ──────────────────────────────────────────
CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name  VARCHAR(100) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- Tasks table
-- ──────────────────────────────────────────
CREATE TABLE tasks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       VARCHAR(500) NOT NULL CHECK (char_length(trim(title)) > 0),
    completed   BOOLEAN NOT NULL DEFAULT false,
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- Indexes (these make queries fast)
-- ──────────────────────────────────────────

-- Most common query: "Get all tasks for a user, ordered by position"
CREATE INDEX idx_tasks_user_id ON tasks(user_id);

-- Filter by completion status
CREATE INDEX idx_tasks_user_completed ON tasks(user_id, completed);

-- Sort by creation date
CREATE INDEX idx_tasks_user_created ON tasks(user_id, created_at DESC);

-- Fast user lookup by email (for login)
CREATE INDEX idx_users_email ON users(email);

-- ──────────────────────────────────────────
-- Auto-update the updated_at timestamp
-- ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_users
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_tasks
    BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

## 4.4 Indexing Strategy Explained

Think of a database index like a book's index page. Without it, the database scans every row (like reading every page to find a topic).

```
WITHOUT index: Scan 1,000,000 rows → O(n) → ~500ms
WITH index:    B-tree lookup         → O(log n) → ~2ms
```

**Rules of thumb:**
- Index every column you filter by (`WHERE user_id = ?`)
- Index every column you sort by (`ORDER BY created_at`)
- Index every foreign key (`user_id`)
- Don't over-index — each index slows down writes

### What Each Index Does

| Index | Query It Speeds Up | Why |
|-------|-------------------|-----|
| `idx_tasks_user_id` | `SELECT * FROM tasks WHERE user_id = ?` | Every page load |
| `idx_tasks_user_completed` | `SELECT * FROM tasks WHERE user_id = ? AND completed = true` | Filter bar |
| `idx_tasks_user_created` | `SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC` | Newest first |
| `idx_users_email` | `SELECT * FROM users WHERE email = ?` | Every login |

## 4.5 Query Optimization & Pagination

### Cursor-Based Pagination (Recommended)

Offset pagination (`LIMIT 20 OFFSET 1000`) gets slower as the offset increases because the database still scans skipped rows. Cursor pagination uses the last item's ID:

```sql
-- Page 1: Get first 20 tasks
SELECT id, title, completed, created_at
FROM tasks
WHERE user_id = $1
ORDER BY created_at DESC, id DESC
LIMIT 20;

-- Page 2: Get next 20 tasks after the last item from page 1
SELECT id, title, completed, created_at
FROM tasks
WHERE user_id = $1
  AND (created_at, id) < ($2, $3)  -- cursor: last item's created_at and id
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

**Why cursor > offset:**

| Users | Offset Speed | Cursor Speed |
|-------|-------------|-------------|
| Page 1 | 2ms | 2ms |
| Page 100 | 50ms | 2ms |
| Page 10,000 | 2,000ms | 2ms |

## 4.6 Transactions & ACID

**ACID** = Atomicity, Consistency, Isolation, Durability. It means your data is always in a valid state.

```javascript
// Example: Moving a task between users (must update two rows atomically)
const client = await pool.connect();
try {
    await client.query('BEGIN');

    await client.query(
        'UPDATE tasks SET user_id = $1 WHERE id = $2',
        [newUserId, taskId]
    );

    await client.query(
        'UPDATE users SET task_count = task_count + 1 WHERE id = $1',
        [newUserId]
    );

    await client.query('COMMIT');
} catch (err) {
    await client.query('ROLLBACK');
    throw err;
} finally {
    client.release();
}
```

If the second query fails, the `ROLLBACK` undoes the first query. Without transactions, you'd have a task belonging to a new user but the old user's count still not decremented.

## 4.7 Connection Pooling

Opening a database connection takes ~20–50ms. Connection pooling keeps connections open and reuses them.

```javascript
// Using 'pg' package with built-in pooling
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,              // Maximum 20 connections in the pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Every query automatically gets a connection from the pool
const result = await pool.query('SELECT * FROM tasks WHERE user_id = $1', [userId]);
```

**Why 20 connections?** Neon free tier allows up to 100 concurrent connections. With 2 Express instances, 20 each keeps you well under the limit.

## 4.8 ORM vs Raw SQL

| Approach | Pros | Cons |
|----------|------|------|
| **Raw SQL** (pg) | Full control, best performance, learn real SQL | More boilerplate |
| **Query Builder** (Knex.js) | Less boilerplate, migrations built-in | Another dependency |
| **ORM** (Prisma, Drizzle) | Type-safe, auto-generated queries | Magic, slower for complex queries |

**Recommendation for learning: Start with raw SQL using the `pg` package.** You'll understand what's actually happening. Later, consider Drizzle ORM — it's lightweight and type-safe.

```javascript
// Raw SQL with 'pg' — simple and transparent
async function getTasksByUser(userId) {
    const { rows } = await pool.query(
        'SELECT * FROM tasks WHERE user_id = $1 ORDER BY position ASC',
        [userId]
    );
    return rows;
}
```

## 4.9 Database Migrations

Migrations are version-controlled changes to your schema. Never modify production databases by hand.

```bash
# Using node-pg-migrate (simple, free)
npm install node-pg-migrate
```

```javascript
// migrations/001_create_users.js
exports.up = (pgm) => {
    pgm.createTable('users', {
        id:            { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
        email:         { type: 'varchar(255)', notNull: true, unique: true },
        password_hash: { type: 'varchar(255)', notNull: true },
        display_name:  { type: 'varchar(100)', notNull: true },
        created_at:    { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    });
};

exports.down = (pgm) => {
    pgm.dropTable('users');
};
```

```bash
# Run migrations
DATABASE_URL=postgres://... npx node-pg-migrate up

# Rollback last migration
DATABASE_URL=postgres://... npx node-pg-migrate down
```

## 4.10 Caching with Redis

Redis is an in-memory key-value store. It's ~100x faster than PostgreSQL for simple lookups.

```javascript
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);

async function getTasksByUser(userId) {
    // 1. Check cache first
    const cached = await redis.get(`tasks:${userId}`);
    if (cached) return JSON.parse(cached);

    // 2. Cache miss — query database
    const { rows } = await pool.query(
        'SELECT * FROM tasks WHERE user_id = $1 ORDER BY position',
        [userId]
    );

    // 3. Store in cache for 60 seconds
    await redis.setex(`tasks:${userId}`, 60, JSON.stringify(rows));

    return rows;
}

// Invalidate cache when data changes
async function createTask(userId, title) {
    const { rows } = await pool.query(
        'INSERT INTO tasks (user_id, title) VALUES ($1, $2) RETURNING *',
        [userId, title]
    );
    await redis.del(`tasks:${userId}`);  // Clear stale cache
    return rows[0];
}
```

## 4.11 Optimistic vs Pessimistic Locking

What happens when two users update the same task at the same time?

**Optimistic Locking** (recommended for web apps):

```sql
-- Add a version column
ALTER TABLE tasks ADD COLUMN version INTEGER DEFAULT 1;

-- Update only if version matches
UPDATE tasks
SET title = 'New Title', version = version + 1
WHERE id = $1 AND version = $2;
-- If 0 rows affected → someone else updated first → return 409 Conflict
```

**Pessimistic Locking:** `SELECT ... FOR UPDATE` — locks the row until the transaction completes. Use only for critical financial operations, not a Todo app.

## 4.12 Backup & Disaster Recovery

| Strategy | How | Frequency |
|----------|-----|-----------|
| **Automated backups** | Neon/Supabase do this automatically | Daily |
| **Point-in-time recovery** | Restore to any second (Neon supports this) | Continuous |
| **Manual export** | `pg_dump` before major changes | Before migrations |

```bash
# Manual backup
pg_dump $DATABASE_URL > backup_2026_05_28.sql

# Restore
psql $DATABASE_URL < backup_2026_05_28.sql
```

---

# 5. Scalability Engineering

## 5.1 Scaling Roadmap

Here's how your architecture evolves as users grow:

### Stage 1: 100 Users — "It Just Works"

```mermaid
graph LR
    Users["👥 100 Users"] --> Vercel["☁️ Vercel<br/>React SPA"]
    Users --> Render["⚙️ Render<br/>Express API"]
    Render --> Neon["🐘 Neon<br/>PostgreSQL"]
```

**What to do:** Deploy exactly as described in Section 3. Your free tier handles this easily.

| Metric | Value |
|--------|-------|
| Requests/second | ~2 |
| Database size | < 1 MB |
| Response time | < 100ms |
| Monthly cost | $0 |

### Stage 2: 1,000 Users — "Add Caching"

```mermaid
graph LR
    Users["👥 1K Users"] --> CDN["☁️ CDN<br/>Static Assets"]
    CDN --> LB["⚖️ Render<br/>Express API"]
    LB --> Redis["🔴 Upstash Redis<br/>Cache"]
    LB --> PG["🐘 Neon PG"]
```

**What changes:**
- Add Redis caching for `GET /tasks` (reduces DB load by ~80%)
- Add `Cache-Control` headers for static assets
- Add database indexes (you should already have these)

| Metric | Value |
|--------|-------|
| Requests/second | ~20 |
| Database size | ~10 MB |
| Cache hit rate | ~70% |
| Response time | < 50ms (cache hit), < 100ms (cache miss) |
| Monthly cost | $0 |

### Stage 3: 10,000 Users — "Optimize & Monitor"

```mermaid
graph LR
    Users["👥 10K Users"] --> CDN["☁️ CDN"]
    CDN --> LB["⚖️ NGINX LB"]
    LB --> API1["⚙️ Express #1"]
    LB --> API2["⚙️ Express #2"]
    API1 & API2 --> Redis["🔴 Redis"]
    API1 & API2 --> PG["🐘 PostgreSQL"]
```

**What changes:**
- Run 2 Express instances behind a load balancer
- Add pagination to `GET /tasks`
- Add structured logging and monitoring
- Add rate limiting
- Move to a paid tier ($7–14/month) to eliminate cold starts

| Metric | Value |
|--------|-------|
| Requests/second | ~200 |
| Database size | ~100 MB |
| Cache hit rate | ~85% |
| Response time | < 30ms average |
| Monthly cost | ~$10 |

### Stage 4: 100,000 Users — "Scale Seriously"

```mermaid
graph TB
    Users["👥 100K Users"]
    CDN["☁️ Global CDN"]
    LB["⚖️ Load Balancer"]

    subgraph "API Cluster (Auto-scaling)"
        API1["⚙️ Express #1"]
        API2["⚙️ Express #2"]
        API3["⚙️ Express #3"]
        API4["⚙️ Express #4"]
    end

    RedisCluster["🔴 Redis Cluster"]

    subgraph "Database"
        PGPrimary["🐘 PG Primary<br/>Writes"]
        PGReplica["🐘 PG Replica<br/>Reads"]
    end

    Queue["📬 Job Queue"]
    Worker["🔧 Worker"]

    Users --> CDN --> LB
    LB --> API1 & API2 & API3 & API4
    API1 & API2 & API3 & API4 --> RedisCluster
    API1 & API2 & API3 & API4 -->|"Writes"| PGPrimary
    API1 & API2 & API3 & API4 -->|"Reads"| PGReplica
    PGPrimary --> PGReplica
    API1 & API2 & API3 & API4 --> Queue --> Worker
```

**What changes:**
- Auto-scaling API servers (4+ instances)
- Read replica for database (offloads read queries)
- Redis cluster for distributed caching
- Background job queue for non-critical operations
- Full monitoring stack

| Metric | Value |
|--------|-------|
| Requests/second | ~2,000 |
| Database size | ~1 GB |
| Cache hit rate | ~90% |
| Response time | < 20ms (p50), < 100ms (p99) |
| Monthly cost | ~$50–100 |

### Stage 5: 1M Requests — "Distributed Systems"

At this scale, you'd also consider:
- **Database sharding** (split users across multiple databases)
- **Multi-region deployment** (servers in US, EU, Asia)
- **Event-driven architecture** (publish task events, consumers react)
- **WebSocket connections** (real-time updates when a task changes)

> **Reality check:** A Todo app will almost certainly never reach 1M requests. But understanding these concepts makes you a stronger engineer.

## 5.2 Bottleneck Identification

Where things break first at each stage:

```mermaid
graph TD
    B1["🔴 Stage 1: Cold starts<br/>Render spins down after 15min"]
    B2["🔴 Stage 2: Database queries<br/>No caching, full table scans"]
    B3["🔴 Stage 3: Single server<br/>One Express instance maxes out"]
    B4["🔴 Stage 4: Database writes<br/>Single PG primary bottleneck"]
    B5["🔴 Stage 5: Network latency<br/>Users far from server location"]

    B1 -->|"Fix: Cron ping / paid tier"| B2
    B2 -->|"Fix: Redis cache + indexes"| B3
    B3 -->|"Fix: Horizontal scaling"| B4
    B4 -->|"Fix: Read replicas + queue"| B5
    B5 -->|"Fix: Multi-region"| Done["✅ Globally scaled"]
```

## 5.3 Performance Optimization Checklist

**Frontend:**
- [x] Vite bundles and minifies JS/CSS *(you already have this)*
- [ ] Enable gzip/brotli compression on CDN
- [ ] Lazy-load components with `React.lazy()` and `Suspense`
- [ ] Use `React.memo()` for TaskItem to avoid re-renders
- [ ] Add `loading="lazy"` to images

**Backend:**
- [ ] Enable gzip compression (`compression` middleware)
- [ ] Use connection pooling for PostgreSQL
- [ ] Add Redis caching for read-heavy endpoints
- [ ] Use cursor-based pagination
- [ ] Set proper `Cache-Control` headers

**Database:**
- [ ] Add indexes on frequently queried columns
- [ ] Use `EXPLAIN ANALYZE` to find slow queries
- [ ] Enable connection pooling (PgBouncer on Neon)

```javascript
// Compression middleware — reduces response size by ~70%
const compression = require('compression');
app.use(compression());
```

---

# 6. Security Engineering

## 6.1 Security Checklist for Your App

```mermaid
graph TD
    subgraph "Network Layer"
        HTTPS["🔒 HTTPS<br/>All traffic encrypted"]
        CORS_S["🌐 CORS<br/>Only allow your frontend"]
        Rate["⏱️ Rate Limiting<br/>100 req/15min per IP"]
    end

    subgraph "Application Layer"
        Auth["🔑 Authentication<br/>JWT in HTTP-only cookie"]
        Validate["✅ Input Validation<br/>Sanitize all inputs"]
        Headers["🛡️ Security Headers<br/>CSP, HSTS, X-Frame"]
    end

    subgraph "Data Layer"
        Hash["#️⃣ Password Hashing<br/>bcrypt, 12 rounds"]
        SQL_P["💉 SQL Injection<br/>Parameterized queries"]
        Encrypt["🔐 Encryption<br/>Sensitive data at rest"]
    end
```

## 6.2 CORS — Fix Your Current Setup

Your current `app.use(cors())` allows **any website** to call your API. Fix it:

```javascript
// BEFORE (insecure — allows any origin)
app.use(cors());

// AFTER (secure — only your frontend can call the API)
app.use(cors({
    origin: [
        'https://your-app.vercel.app',
        'http://localhost:5173'  // Dev only
    ],
    credentials: true,  // Allow cookies
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}));
```

## 6.3 Security Headers

```javascript
const helmet = require('helmet');

// Sets 11 security headers in one line
app.use(helmet());

// What helmet sets (automatically):
// X-Content-Type-Options: nosniff
// X-Frame-Options: DENY
// X-XSS-Protection: 0  (deprecated, CSP is better)
// Strict-Transport-Security: max-age=15552000
// Content-Security-Policy: ...
```

## 6.4 Authentication with JWT

```javascript
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

// Registration
router.post('/register', async (req, res) => {
    const { email, password, displayName } = req.body;

    // Hash password with bcrypt (12 rounds — takes ~250ms, very secure)
    const passwordHash = await bcrypt.hash(password, 12);

    const { rows } = await pool.query(
        'INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id, email, display_name',
        [email, passwordHash, displayName]
    );

    const token = jwt.sign(
        { userId: rows[0].id },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );

    res.cookie('token', token, {
        httpOnly: true,     // JavaScript can't access it (prevents XSS)
        secure: true,       // Only sent over HTTPS
        sameSite: 'strict', // Prevents CSRF
        maxAge: 7 * 24 * 60 * 60 * 1000  // 7 days
    });

    res.status(201).json(rows[0]);
});

// Auth middleware — protects routes
function authenticate(req, res, next) {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = payload.userId;
        next();
    } catch {
        res.status(401).json({ error: 'Invalid token' });
    }
}

// Protected route
router.get('/tasks', authenticate, async (req, res) => {
    const tasks = await getTasksByUser(req.userId);
    res.json(tasks);
});
```

## 6.5 SQL Injection Prevention

Your current code is safe from SQL injection because you use file-based storage. When you switch to PostgreSQL, **always use parameterized queries:**

```javascript
// ❌ VULNERABLE — Never do this
const query = `SELECT * FROM tasks WHERE id = '${req.params.id}'`;

// ✅ SAFE — Always use parameterized queries ($1, $2, etc.)
const { rows } = await pool.query(
    'SELECT * FROM tasks WHERE id = $1',
    [req.params.id]
);
```

**Why?** If `req.params.id` is `'; DROP TABLE tasks; --`, the vulnerable version executes `DROP TABLE tasks`. The safe version treats it as a literal string value.

## 6.6 XSS Prevention

React already prevents XSS by escaping all content rendered in JSX. But be careful:

```javascript
// ✅ SAFE — React escapes this automatically
<p>{task.title}</p>

// ❌ DANGEROUS — Never use dangerouslySetInnerHTML with user input
<p dangerouslySetInnerHTML={{ __html: task.title }} />
```

## 6.7 Input Validation

Validate on both the frontend AND backend. Never trust the client.

```javascript
// Backend validation example (using express-validator)
const { body, validationResult } = require('express-validator');

router.post('/tasks',
    authenticate,
    body('title')
        .trim()
        .notEmpty().withMessage('Title is required')
        .isLength({ max: 500 }).withMessage('Title must be under 500 characters')
        .escape(),  // Sanitize HTML entities
    (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        // ... create task
    }
);
```

## 6.8 Rate Limiting Implementation

```javascript
const rateLimit = require('express-rate-limit');

// General API limit
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 100,
    standardHeaders: true,     // Return rate limit info in headers
    legacyHeaders: false,
});

// Stricter limit for auth endpoints (prevents brute force)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,  // Only 5 login attempts per 15 minutes
    message: { error: 'Too many login attempts, try again later.' },
});

app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
```

---

# 7. Observability & Monitoring

## 7.1 The Three Pillars

```mermaid
graph LR
    Logs["📝 Logs<br/>What happened?"]
    Metrics["📊 Metrics<br/>How is it performing?"]
    Traces["🔍 Traces<br/>Where is it slow?"]

    Logs & Metrics & Traces --> Dashboard["📺 Dashboard<br/>Grafana"]
```

## 7.2 Structured Logging

Replace `console.log` with structured JSON logs:

```javascript
// Using pino (fastest Node.js logger — free, open source)
const pino = require('pino');

const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty' }  // Pretty-print in dev
        : undefined                    // JSON in production
});

// Usage in routes
router.post('/', authenticate, async (req, res) => {
    const task = await createTask(req.userId, req.body.title);

    logger.info({
        event: 'task_created',
        taskId: task.id,
        userId: req.userId,
        title: task.title,
    });

    res.status(201).json(task);
});

// Error logging
app.use((err, req, res, next) => {
    logger.error({
        event: 'unhandled_error',
        error: err.message,
        stack: err.stack,
        method: req.method,
        path: req.path,
    });
    res.status(500).json({ error: 'Internal server error' });
});
```

**Output in production (JSON — machine-readable):**
```json
{"level":"info","time":1716800000,"event":"task_created","taskId":"abc-123","userId":"user-456","title":"Buy groceries"}
```

## 7.3 Health Check Endpoint

Every production app needs a health check that monitoring tools can ping:

```javascript
// Add to app.js
app.get('/health', async (req, res) => {
    try {
        // Check database connectivity
        await pool.query('SELECT 1');
        res.status(200).json({
            status: 'healthy',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        res.status(503).json({
            status: 'unhealthy',
            error: err.message,
        });
    }
});
```

## 7.4 Free Monitoring Tools

| Tool | What It Does | Free Tier |
|------|-------------|-----------|
| **Better Stack (Logtail)** | Log aggregation + search | 1 GB/month |
| **Better Stack (Uptime)** | Uptime monitoring + alerts | 10 monitors |
| **Grafana Cloud** | Dashboards + alerting | 10K metrics, 50 GB logs |
| **Sentry** | Error tracking + stack traces | 5K events/month |
| **Checkly** | API monitoring + synthetic checks | 5 checks |

### Recommended Setup

```mermaid
graph LR
    Express["⚙️ Express API"] -->|"Logs"| BetterStack["📝 Better Stack<br/>Log Search"]
    Express -->|"Errors"| Sentry["🐛 Sentry<br/>Error Tracking"]
    Checkly["🔍 Checkly<br/>Uptime Monitor"] -->|"Pings /health"| Express
    Checkly -->|"Alert"| Email["📧 Email/Slack"]
```

### Sentry Integration (5 minutes to set up)

```javascript
const Sentry = require('@sentry/node');

Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,  // Sample 10% of transactions
});

// Add Sentry middleware (must be first)
app.use(Sentry.Handlers.requestHandler());

// ... your routes ...

// Sentry error handler (must be before your error handler)
app.use(Sentry.Handlers.errorHandler());
```

## 7.5 Request Metrics Middleware

Track response times and status codes:

```javascript
// Simple metrics middleware
app.use((req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info({
            event: 'http_request',
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            durationMs: duration,
            userAgent: req.headers['user-agent'],
        });
    });

    next();
});
```

---

# 8. Testing Strategy

## 8.1 Testing Pyramid

```mermaid
graph TB
    E2E["🔺 E2E Tests<br/>5-10 tests<br/>Slow but realistic"]
    Integration["🔷 Integration Tests<br/>20-30 tests<br/>API + Database"]
    Unit["🟩 Unit Tests<br/>50+ tests<br/>Fast, isolated"]

    E2E --- Integration --- Unit

    style Unit fill:#4ade80
    style Integration fill:#60a5fa
    style E2E fill:#f87171
```

**You already have 10 tests** (5 backend + 5 frontend). Here's how to expand.

## 8.2 Backend Test Expansion

You have tests using **Vitest + Supertest**. Here are additional test cases:

```javascript
// server/tests/tasks.test.mjs (expanded)
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';

describe('POST /tasks', () => {
    // You already have: creates a task, rejects empty title

    it('rejects title longer than 500 characters', async () => {
        const res = await request(app)
            .post('/tasks')
            .send({ title: 'x'.repeat(501) });
        expect(res.status).toBe(400);
    });

    it('trims whitespace from title', async () => {
        const res = await request(app)
            .post('/tasks')
            .send({ title: '  Buy milk  ' });
        expect(res.status).toBe(201);
        expect(res.body.title).toBe('Buy milk');
    });

    it('rejects missing body', async () => {
        const res = await request(app)
            .post('/tasks')
            .send({});
        expect(res.status).toBe(400);
    });
});

describe('PUT /tasks/:id', () => {
    it('returns 404 for non-existent ID', async () => {
        const res = await request(app)
            .put('/tasks/non-existent-id')
            .send({ title: 'Updated' });
        expect(res.status).toBe(404);
    });
});

describe('Edge cases', () => {
    it('handles concurrent requests safely', async () => {
        // Create a task first
        const { body: task } = await request(app)
            .post('/tasks')
            .send({ title: 'Original' });

        // Send 10 concurrent updates
        const promises = Array.from({ length: 10 }, (_, i) =>
            request(app)
                .put(`/tasks/${task.id}`)
                .send({ title: `Update ${i}` })
        );

        const results = await Promise.all(promises);
        results.forEach(res => expect(res.status).toBe(200));
    });
});
```

## 8.3 Frontend Test Expansion

Using **Vitest + Testing Library + jsdom**:

```javascript
// client/src/tests/components.test.jsx (expanded ideas)

// Test: FilterBar changes active filter
// Test: TaskItem enters edit mode on double-click
// Test: TaskItem saves on Enter key
// Test: TaskItem cancels edit on Escape key
// Test: Empty state renders when no tasks
// Test: Error message disappears on next action
```

## 8.4 API Testing with REST Client

Create a file to test your API manually:

```bash
# test-api.http (works in VS Code with REST Client extension)

### Get all tasks
GET http://localhost:3001/tasks

### Create a task
POST http://localhost:3001/tasks
Content-Type: application/json

{
    "title": "Buy groceries"
}

### Toggle a task (replace :id)
PATCH http://localhost:3001/tasks/{{taskId}}
Content-Type: application/json

{
    "completed": true
}

### Delete a task
DELETE http://localhost:3001/tasks/{{taskId}}
```

## 8.5 Load Testing with k6

[k6](https://k6.io/) is free, open-source, and runs locally. It simulates thousands of concurrent users.

```javascript
// load-test.js — Run with: k6 run load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

// Simulate traffic ramping up to 100 concurrent users
export const options = {
    stages: [
        { duration: '30s', target: 20 },   // Ramp up to 20 users
        { duration: '1m',  target: 100 },  // Ramp up to 100 users
        { duration: '30s', target: 100 },  // Hold at 100 users
        { duration: '30s', target: 0 },    // Ramp down
    ],
    thresholds: {
        http_req_duration: ['p(95)<200'],   // 95% of requests under 200ms
        http_req_failed:   ['rate<0.01'],   // Less than 1% error rate
    },
};

const BASE = 'http://localhost:3001';

export default function () {
    // Simulate a typical user session
    // 1. List tasks
    const listRes = http.get(`${BASE}/tasks`);
    check(listRes, { 'list status 200': (r) => r.status === 200 });

    sleep(1);

    // 2. Create a task
    const createRes = http.post(`${BASE}/tasks`,
        JSON.stringify({ title: `Task ${Date.now()}` }),
        { headers: { 'Content-Type': 'application/json' } }
    );
    check(createRes, { 'create status 201': (r) => r.status === 201 });

    const taskId = JSON.parse(createRes.body).id;

    sleep(0.5);

    // 3. Toggle the task
    http.patch(`${BASE}/tasks/${taskId}`,
        JSON.stringify({ completed: true }),
        { headers: { 'Content-Type': 'application/json' } }
    );

    sleep(0.5);

    // 4. Delete the task
    http.del(`${BASE}/tasks/${taskId}`);

    sleep(1);
}
```

**Run it:**

```bash
# Install k6 (https://k6.io/docs/getting-started/installation/)
# Windows:
winget install k6

# Run the test
k6 run load-test.js
```

**Expected output:**

```
scenarios: (100.00%) 1 scenario, 100 max VUs, 3m0s max duration

     ✓ list status 200
     ✓ create status 201

     http_req_duration..............: avg=12ms   min=2ms   p(95)=45ms  p(99)=120ms
     http_req_failed................: 0.00%
     http_reqs......................: 8432   46.8/s
     vus............................: 100    min=0     max=100
```

## 8.6 Simulating 100K+ Traffic Locally

```javascript
// stress-test.js — simulates extreme load
export const options = {
    stages: [
        { duration: '2m', target: 500 },    // Ramp to 500 users
        { duration: '5m', target: 1000 },   // Push to 1000 users
        { duration: '2m', target: 0 },      // Cool down
    ],
};
```

**What you'll learn:** Your Express server handling ~200-500 requests/second on a single process. When it breaks, you'll see:
- Response times spike above 1 second
- Error rate increases
- Connection timeouts

This is when you'd add horizontal scaling.

## 8.7 E2E Testing with Playwright

```javascript
// e2e/tasks.spec.js
import { test, expect } from '@playwright/test';

test('full task lifecycle', async ({ page }) => {
    await page.goto('http://localhost:5173');

    // Create a task
    await page.fill('input[placeholder*="task"]', 'Buy groceries');
    await page.click('button[type="submit"]');

    // Verify it appears
    await expect(page.locator('text=Buy groceries')).toBeVisible();

    // Toggle completion
    await page.click('input[type="checkbox"]');

    // Delete the task
    await page.click('button[aria-label="Delete"]');

    // Verify it's gone
    await expect(page.locator('text=Buy groceries')).not.toBeVisible();
});
```

## 8.8 Testing Tool Summary

| Test Type | Tool | What It Tests | How Many |
|-----------|------|--------------|----------|
| **Unit** | Vitest | Individual functions | 50+ |
| **Integration** | Vitest + Supertest | API endpoints + DB | 20-30 |
| **Component** | Vitest + Testing Library | React components | 20+ |
| **E2E** | Playwright | Full user flows | 5-10 |
| **Load** | k6 | Performance under load | 3-5 scenarios |
| **API** | REST Client / Postman | Manual API testing | Ad-hoc |

---

# 9. DevOps & Reliability

## 9.1 CI/CD Best Practices

```mermaid
graph LR
    PR["🔀 Pull Request"] --> Lint["🔍 Lint"] --> Test["🧪 Test"] --> Build["🔨 Build"]
    Build --> Preview["👀 Preview Deploy"]
    Preview -->|"Approved"| Merge["✅ Merge to main"]
    Merge --> Prod["🚀 Production Deploy"]
    Prod -->|"Health check fails"| Rollback["⏪ Auto Rollback"]
```

**Golden rules:**
1. Never deploy without tests passing
2. Every PR gets a preview deployment (Vercel does this automatically)
3. Production deploys are automated (no manual SSH)
4. Always have a rollback plan

## 9.2 Rollback Strategies

| Strategy | How It Works | Speed |
|----------|-------------|-------|
| **Git revert** | `git revert HEAD && git push` | 3-5 minutes |
| **Redeploy previous** | Click "Redeploy" in Render/Vercel dashboard | 1-2 minutes |
| **Blue-green swap** | Switch load balancer to old version | 10 seconds |
| **Feature flag** | Disable the broken feature without redeploying | Instant |

### Feature Flags

Feature flags let you turn features on/off without deploying:

```javascript
// Simple feature flags (for a portfolio project)
const FEATURES = {
    TASK_SHARING: process.env.FEATURE_TASK_SHARING === 'true',
    DARK_MODE: process.env.FEATURE_DARK_MODE === 'true',
};

// Usage in routes
router.post('/tasks/:id/share', authenticate, (req, res) => {
    if (!FEATURES.TASK_SHARING) {
        return res.status(404).json({ error: 'Not found' });
    }
    // ... sharing logic
});
```

For real production: use [Unleash](https://www.getunleash.io/) (free, open-source).

## 9.3 SLA / SLO / SLI — Explained Simply

These are how companies measure reliability:

| Term | Meaning | Your App Example |
|------|---------|-----------------|
| **SLI** (Indicator) | A measurable metric | "99.2% of requests complete in < 200ms" |
| **SLO** (Objective) | A target for the SLI | "We aim for 99.5% of requests under 200ms" |
| **SLA** (Agreement) | A contract with consequences | "If uptime drops below 99.9%, we refund customers" |

**Your portfolio app's SLOs:**

| SLO | Target | Measurement |
|-----|--------|-------------|
| Availability | 99.5% uptime | Checkly uptime monitor |
| Latency | p95 < 200ms | API response time logs |
| Error rate | < 1% | 5xx errors / total requests |

## 9.4 Retry Mechanisms & Idempotency

**Retries:** When a request fails (network blip, server restart), the client retries automatically.

```javascript
// Client-side retry with exponential backoff
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const res = await fetch(url, options);
            if (res.ok) return res;
            if (res.status < 500) return res;  // Don't retry client errors
        } catch (err) {
            if (attempt === maxRetries - 1) throw err;
        }
        // Wait: 1s, 2s, 4s (exponential backoff)
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
}
```

**Idempotency:** A request is idempotent if calling it multiple times produces the same result. This is critical when retries happen.

| Method | Idempotent? | Why |
|--------|-------------|-----|
| `GET /tasks` | ✅ Yes | Reading doesn't change state |
| `PUT /tasks/:id` | ✅ Yes | Setting title to "X" twice = same result |
| `DELETE /tasks/:id` | ✅ Yes | Deleting twice = same result (second returns 404) |
| `POST /tasks` | ❌ No | Creating twice = two tasks |
| `PATCH /tasks/:id` | ✅ Yes | Setting completed=true twice = same result |

**Making POST idempotent:** Use an idempotency key.

```javascript
router.post('/tasks', authenticate, async (req, res) => {
    const idempotencyKey = req.headers['idempotency-key'];

    if (idempotencyKey) {
        const existing = await redis.get(`idempotency:${idempotencyKey}`);
        if (existing) return res.status(201).json(JSON.parse(existing));
    }

    const task = await createTask(req.userId, req.body.title);

    if (idempotencyKey) {
        await redis.setex(`idempotency:${idempotencyKey}`, 3600, JSON.stringify(task));
    }

    res.status(201).json(task);
});
```

## 9.5 Circuit Breaker Pattern

If the database goes down, don't keep hammering it with requests. A circuit breaker "trips" after a threshold of failures and returns errors immediately:

```
Closed (normal) → Too many failures → Open (reject all requests)
                                         ↓ (after cooldown)
                                    Half-Open (try one request)
                                         ↓
                              Success → Closed / Failure → Open
```

```javascript
// Using 'opossum' library (free, open-source)
const CircuitBreaker = require('opossum');

const dbCall = async (userId) => {
    return pool.query('SELECT * FROM tasks WHERE user_id = $1', [userId]);
};

const breaker = new CircuitBreaker(dbCall, {
    timeout: 3000,         // If DB doesn't respond in 3s, count as failure
    errorThresholdPercentage: 50,  // Trip after 50% failures
    resetTimeout: 10000,   // Try again after 10 seconds
});

breaker.on('open', () => logger.warn('Circuit breaker OPENED — DB might be down'));
breaker.on('close', () => logger.info('Circuit breaker closed — DB recovered'));

// Usage
router.get('/tasks', authenticate, async (req, res) => {
    try {
        const result = await breaker.fire(req.userId);
        res.json(result.rows);
    } catch (err) {
        res.status(503).json({ error: 'Service temporarily unavailable' });
    }
});
```

## 9.6 Cron Jobs & Background Workers

For scheduled tasks (daily cleanup, weekly reports):

```javascript
// Using node-cron (free, runs inside your Express process)
const cron = require('node-cron');

// Delete tasks that have been completed for more than 30 days
cron.schedule('0 3 * * *', async () => {  // Every day at 3 AM
    logger.info('Running daily cleanup job');
    const { rowCount } = await pool.query(
        `DELETE FROM tasks
         WHERE completed = true
           AND updated_at < NOW() - INTERVAL '30 days'`
    );
    logger.info({ event: 'cleanup_complete', deletedCount: rowCount });
});
```

---

# 10. Interview Preparation

## 10.1 How to Present This Project

When an interviewer asks "Tell me about a project you've built," structure your answer like this:

### The 2-Minute Pitch

> "I built a full-stack task management application using React and Express. What started as a simple CRUD app became a deep dive into production engineering — I containerized it with Docker, set up a CI/CD pipeline with GitHub Actions, designed a normalized PostgreSQL schema with proper indexing, and wrote a comprehensive scaling plan covering everything from caching strategies to load testing.
>
> The most interesting technical challenge was designing the system to evolve from a single-server setup to a horizontally scalable architecture. I documented the exact bottlenecks that would appear at 100, 1K, 10K, and 100K users, and the specific solutions for each stage."

### Key Talking Points

| Topic | What to Say |
|-------|-------------|
| **Architecture** | "I chose a monolith because the domain is simple, but I designed the code so it could be decomposed into services if needed." |
| **Database** | "I migrated from file-based storage to PostgreSQL, added proper indexes, and implemented cursor-based pagination for performance." |
| **Caching** | "I use a read-through cache with Redis for the task list endpoint, with cache invalidation on writes." |
| **Security** | "JWT auth in HTTP-only cookies, bcrypt password hashing, parameterized queries, rate limiting, and Helmet for security headers." |
| **CI/CD** | "GitHub Actions runs lint, tests, and builds on every PR. Merging to main auto-deploys to Render and Vercel." |
| **Monitoring** | "Structured logging with Pino, error tracking with Sentry, and uptime monitoring with health checks." |

## 10.2 Common Interview Questions & Strong Answers

### Q: "How would you scale this to handle 1 million requests?"

> **Strong answer:** "I'd start by identifying the bottleneck. For read-heavy workloads like a task list, the first step is adding a Redis cache in front of PostgreSQL — that alone handles 80% of the load. Next, I'd horizontally scale the Express API behind an NGINX load balancer — since the API is stateless, any instance can handle any request.
>
> For the database, I'd add a read replica for query offloading and connection pooling with PgBouncer. If we hit write bottlenecks, I'd look at partitioning the tasks table by user_id.
>
> On the frontend, the React SPA is already served via CDN, so it scales automatically."

### Q: "Why PostgreSQL over MongoDB?"

> **Strong answer:** "The task data has a clear, relational structure — users have tasks, each with fixed fields. PostgreSQL gives me ACID transactions, powerful querying with JOINs, and strict data integrity with constraints and foreign keys.
>
> MongoDB would work, but I'd lose referential integrity and need to handle consistency manually. For an app where data correctness matters — users don't want to lose tasks — PostgreSQL's guarantees are worth it.
>
> That said, if the schema were highly dynamic — like a content management system where each document has different fields — I'd consider MongoDB."

### Q: "How do you ensure zero data loss?"

> **Strong answer:** "Three layers. First, PostgreSQL's WAL (Write-Ahead Log) ensures committed transactions survive crashes. Second, Neon provides automated daily backups and point-in-time recovery. Third, I'd set up database migrations with version control so every schema change is tracked and reversible."

### Q: "How does your CI/CD pipeline work?"

> **Strong answer:** "Every pull request triggers GitHub Actions, which runs three parallel jobs: backend tests with Vitest, frontend tests with Vitest and Testing Library, and a production build to catch build errors.
>
> When a PR is merged to main, a deploy job runs — it triggers a webhook on Render for the backend, and Vercel auto-deploys the frontend via its GitHub integration. Both platforms do rolling deployments, so there's zero downtime. If the health check fails, Render automatically rolls back."

### Q: "What happens when your database goes down?"

> **Strong answer:** "First, the health check endpoint at `/health` starts returning 503, which triggers an alert via our uptime monitor. The circuit breaker pattern I implemented using Opossum detects repeated failures and starts returning 503 immediately instead of hanging on database timeouts.
>
> For the client, I implement retry logic with exponential backoff — the first retry after 1 second, then 2, then 4. The user sees a 'temporarily unavailable' message instead of a blank screen.
>
> For recovery, Neon provides automated failover and point-in-time recovery. Once the database is back, the circuit breaker's half-open state sends a test query, and if it succeeds, traffic resumes normally."

### Q: "How do you prevent security vulnerabilities?"

> **Strong answer:** "I follow a defense-in-depth approach. At the network layer: HTTPS everywhere and restrictive CORS. At the application layer: JWT tokens in HTTP-only secure cookies prevent XSS token theft. Passwords are hashed with bcrypt at 12 rounds. All database queries use parameterized statements to prevent SQL injection. I use Helmet middleware for security headers including CSP and HSTS. Finally, rate limiting prevents brute-force attacks on login endpoints."

### Q: "Explain the tradeoff between REST and GraphQL."

> **Strong answer:** "I chose REST because the data model is simple — tasks are a flat resource with CRUD operations. REST maps naturally to HTTP methods and is universally understood.
>
> GraphQL would add value if the frontend needed to fetch multiple related resources in a single request — like a task with its comments, assignee, and project — to avoid multiple round trips. For a simple task list, GraphQL adds schema complexity and a learning curve without meaningful benefit."

### Q: "What's the hardest bug you've had to debug in this project?"

> **Good structure for any answer:**
> 1. What was the symptom?
> 2. How did you narrow down the cause?
> 3. What was the root cause?
> 4. How did you fix it?
> 5. How did you prevent it from happening again?

### Q: "Describe your experience with Docker."

> **Strong answer:** "I containerized both the frontend and backend. The client uses a multi-stage build — the first stage runs `npm run build` with Vite to generate static assets, and the second stage copies those into an NGINX Alpine image. This reduces the image size from ~500 MB to ~25 MB.
>
> The backend Dockerfile uses layer caching — `package*.json` is copied and `npm ci` runs before the source code is copied. This means dependency installation is cached unless `package.json` changes, which speeds up builds significantly.
>
> I also added a health check in the Dockerfile and configured a non-root user for security."

## 10.3 Architecture Decision Records (ADRs)

ADRs document WHY you made each decision. Interviewers love seeing this level of thinking.

| Decision | Options Considered | Chosen | Why |
|----------|-------------------|--------|-----|
| Database | PostgreSQL, MongoDB, SQLite | PostgreSQL | Relational data, ACID, free tier on Neon |
| Frontend hosting | Vercel, Netlify, Cloudflare Pages | Vercel | Best Vite integration, instant preview deploys |
| Backend hosting | Render, Railway, Fly.io | Render | Simplest free tier, auto-deploy from GitHub |
| Auth strategy | JWT, Sessions, OAuth | JWT in cookies | Stateless, works with horizontal scaling |
| Caching | Redis, Memcached, In-memory | Redis (Upstash) | Persistent cache, free serverless tier |
| Testing | Jest, Vitest, Mocha | Vitest | Native ESM, fast, compatible with Vite |
| CI/CD | GitHub Actions, GitLab CI, CircleCI | GitHub Actions | Free for public repos, tight GitHub integration |
| Logging | Winston, Pino, Console | Pino | Fastest Node.js logger, structured JSON |
| Container | Docker, Podman | Docker | Industry standard, great ecosystem |

## 10.4 System Design Vocabulary

Use these terms naturally in interviews to demonstrate depth:

| Term | Meaning | Your App Context |
|------|---------|-----------------|
| **Horizontal scaling** | Adding more servers | Running multiple Express instances |
| **Vertical scaling** | Bigger server | Upgrading from 1 CPU to 4 CPU |
| **Stateless** | Server stores no session data | JWT means no server-side sessions |
| **Idempotent** | Same request, same result | PUT and DELETE are naturally idempotent |
| **Cache invalidation** | Clearing stale cache | Delete Redis key when task is updated |
| **Connection pooling** | Reusing database connections | `pg.Pool` with max 20 connections |
| **N+1 query** | Fetching related data in a loop | Fetch user + tasks in one query, not N |
| **Cold start** | Slow first request after idle | Render free tier spins down after 15 min |
| **Circuit breaker** | Stop calling a failing service | Don't keep querying a dead database |
| **Backpressure** | Slowing down when overwhelmed | Rate limiting incoming requests |
| **Eventual consistency** | Data syncs "eventually" | Cache may be 60s stale |

---

# Appendix A: Quick Reference Commands

```bash
# ──────────────────────────────────────────
# Local Development
# ──────────────────────────────────────────
cd server && npm install && node index.js      # Start backend
cd client && npm install && npm run dev        # Start frontend

# ──────────────────────────────────────────
# Docker
# ──────────────────────────────────────────
docker compose up --build                      # Build & run both services
docker compose down -v                         # Stop & remove volumes
docker compose logs -f server                  # Tail server logs

# ──────────────────────────────────────────
# Testing
# ──────────────────────────────────────────
cd server && npm test                          # Backend tests
cd client && npm test                          # Frontend tests
cd client && npm run lint                      # Lint frontend
k6 run load-test.js                            # Load test

# ──────────────────────────────────────────
# Database (after migration to PostgreSQL)
# ──────────────────────────────────────────
npx node-pg-migrate up                         # Run migrations
npx node-pg-migrate down                       # Rollback last migration
pg_dump $DATABASE_URL > backup.sql             # Backup database

# ──────────────────────────────────────────
# Deployment
# ──────────────────────────────────────────
git push origin main                           # Triggers CI/CD → auto deploy
```

---

# Appendix B: File Structure (Production-Ready)

```
task-manager/
├── .github/
│   └── workflows/
│       └── ci.yml                  # CI/CD pipeline
│
├── client/                         # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── FilterBar.jsx
│   │   │   ├── StatusBar.jsx
│   │   │   ├── TaskForm.jsx
│   │   │   ├── TaskItem.jsx
│   │   │   └── TaskList.jsx
│   │   ├── api.js
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.jsx
│   ├── src/tests/
│   │   └── components.test.jsx
│   ├── Dockerfile
│   ├── nginx.conf                  # NEW: NGINX config for SPA
│   ├── package.json
│   └── vite.config.js
│
├── server/                         # Express backend
│   ├── routes/
│   │   └── tasks.js
│   ├── middleware/
│   │   ├── auth.js                 # NEW: JWT authentication
│   │   ├── rateLimiter.js          # NEW: Rate limiting
│   │   └── errorHandler.js         # NEW: Error handling
│   ├── migrations/                 # NEW: Database migrations
│   │   ├── 001_create_users.js
│   │   └── 002_create_tasks.js
│   ├── tests/
│   │   └── tasks.test.mjs
│   ├── app.js
│   ├── index.js
│   ├── db.js                       # NEW: PostgreSQL connection pool
│   ├── Dockerfile
│   └── package.json
│
├── e2e/                            # NEW: End-to-end tests
│   └── tasks.spec.js
│
├── docker-compose.yml
├── load-test.js                    # NEW: k6 load test
├── deploy.md                       # This document
├── README.md
└── .gitignore
```

---

# Appendix C: Evolution Cheat Sheet

A quick reference for what to add at each stage:

| Stage | Users | Add This | Monthly Cost |
|-------|-------|----------|-------------|
| **MVP** | 1-100 | Deploy to Render + Vercel | $0 |
| **v1.1** | 100-1K | PostgreSQL (Neon), CI/CD | $0 |
| **v1.2** | 1K-5K | Redis cache (Upstash), monitoring | $0 |
| **v2.0** | 5K-10K | Auth (JWT), rate limiting, paid hosting | ~$15 |
| **v2.1** | 10K-50K | Horizontal scaling, read replica | ~$50 |
| **v3.0** | 50K-100K | Auto-scaling, CDN, job queue | ~$100 |
| **v4.0** | 100K+ | Multi-region, sharding, dedicated DevOps | ~$500+ |

> **Remember:** Your portfolio project only needs the MVP stage. Everything else in this document is knowledge for interviews and your career growth as an engineer.

---

*Document written for the Task Manager App — React 19 + Vite 8 + Express 5*
*Last updated: May 2026*
