# ðŸ—ºï¸ Deployment Phases â€” Task Manager App

## A Stage-by-Stage Execution Roadmap

> **Companion to:** `deploy.md`
> **Purpose:** While `deploy.md` explains the *concepts*, this document gives you the **exact, ordered steps** to execute at each growth stage. Treat each phase as a checklist â€” finish a phase before moving to the next.
>
> **Your starting point:** React 19 + Vite 8 frontend Â· Express 5 + JSON file storage Â· Docker Compose Â· 10 tests Â· Localhost only.

---

## How to Use This Document

- Each **Phase** maps to a user-growth milestone.
- Each phase has an **Entry Condition** (when to start), **Goal**, **Sub-Tasks** (the work), an **Exit Checklist** (when you're done), and **Bottlenecks Solved**.
- Sub-tasks are ordered. Do them top-to-bottom.
- âœ… = recommended for everyone Â· âš™ï¸ = infrastructure Â· ðŸ”’ = security Â· ðŸ“Š = observability Â· ðŸ§ª = testing

---

## Phase Overview at a Glance

| Phase | Users | Theme | Est. Effort | Monthly Cost |
|-------|-------|-------|-------------|-------------|
| **Phase 0** | Pre-launch | Get production-ready & deployed | 1-2 weeks | $0 |
| **Phase 1** | 0 â†’ 1,000 | Real database + CI/CD + basics | 1-2 weeks | $0 |
| **Phase 2** | 1K â†’ 10K | Caching, auth, monitoring, optimization | 2-3 weeks | ~$10-15 |
| **Phase 3** | 10K â†’ 100K | Horizontal scaling + read replicas + queues | 3-4 weeks | ~$50-100 |
| **Phase 4** | 100K â†’ 1M+ | Distributed systems & multi-region | Ongoing | ~$500+ |

---

# ðŸ”§ Phase 0 â€” Production Readiness (Before You Launch)

**Entry Condition:** App works on localhost with Docker Compose.
**Goal:** Get a deployable, secure-by-default version of the app live on the internet at $0 cost.

### Sub-Tasks

#### 0.1 Harden Docker Setup âš™ï¸
- [x] Convert the client Dockerfile to a **multi-stage build** (Vite build â†’ NGINX Alpine). Target image size < 30 MB.
- [x] Add a **non-root user** to the server Dockerfile.
- [x] Add a **`HEALTHCHECK`** instruction to the server Dockerfile.
- [x] Add `restart: unless-stopped` to all services in `docker-compose.yml`.
- [x] Verify the full stack builds cleanly: `docker compose up --build`.

#### 0.2 Environment & Secrets Hygiene ðŸ”’
- [x] Create `.env.example` (committed) and `.env` (gitignored).
- [x] Confirm `.env`, `node_modules`, `dist`, and `tasks.json` are in `.gitignore`.
- [x] Move `PORT`, `NODE_ENV` and any URLs into environment variables.
- [x] Generate a strong `JWT_SECRET` placeholder for later auth work.

#### 0.3 Add a Health Check Endpoint ðŸ“Š
- [x] Add `GET /health` that returns `200` with `{ status, uptime, timestamp }`.
- [x] (For now it just confirms the server is up; you'll add DB checks in Phase 1.)

#### 0.4 Graceful Shutdown âš™ï¸
- [x] Add `SIGTERM` handler in `index.js` so in-flight requests finish before exit.
- [x] Add a 10-second force-kill timeout as a fallback.

#### 0.5 First Deployment âœ…
- [x] Push code to a **GitHub repository** (public, to unlock free CI/CD minutes).
- [x] Deploy the **frontend to Vercel** (connect GitHub repo, set `VITE_API_URL`).
- [x] Deploy the **backend to Render** (free web service, connect GitHub).
- [x] Verify the deployed frontend can reach the deployed backend.
- [x] Confirm **HTTPS is active** (automatic on both platforms).

### Exit Checklist
- âœ… App is reachable at a public HTTPS URL.
- âœ… Frontend and backend deploy independently from GitHub.
- âœ… `/health` returns 200.
- âœ… No secrets committed to git.

### Bottlenecks Solved
- Going from "works on my machine" to "works on the internet."

---

# ðŸŒ± Phase 1 â€” Grow to 1,000 Users

**Entry Condition:** App is live (Phase 0 complete). Expecting first real users.
**Goal:** Replace fragile file storage with a real database, automate deploys, and add foundational safeguards.

> **Expected load at this stage:** ~2 requests/second, DB < 10 MB, response time target < 100ms.

### Sub-Tasks

#### 1.1 Migrate from JSON File to PostgreSQL âš™ï¸ *(highest priority)*
- [x] Provision a free **PostgreSQL database on Neon** (0.5 GB tier).
- [x] Design the schema: `tasks` table now, `users` table prepared for Phase 2.
- [x] Add the `pgcrypto` extension for UUID generation.
- [x] Install `node-pg-migrate` and write migration `001_create_tasks`.
- [x] Set up a **connection pool** with `pg` (`max: 20` connections).
- [x] Rewrite the routes' data layer to use **parameterized SQL queries** instead of `fs.readFileSync`.
- [x] Add core **indexes**: `idx_tasks_created` (sorting), and prepare for `user_id` indexing in Phase 2.
- [x] Add an **auto-update trigger** for the `updated_at` column.
- [x] Update `/health` to run `SELECT 1` against the DB.
- [x] Run a one-time data migration of existing `tasks.json` records (if any).

#### 1.2 Set Up CI/CD with GitHub Actions âš™ï¸âœ…
- [x] Create `.github/workflows/ci.yml`.
- [x] Add **parallel jobs**: `test-server`, `test-client` (lint + test + build).
- [x] Add a **deploy job** that runs only on `main` push and after tests pass.
- [ ] Wire the backend deploy to a **Render deploy hook**; frontend auto-deploys via Vercel's GitHub integration.
- [ ] Store the deploy hook URL in **GitHub repository secrets**.
- [ ] Confirm a push to `main` triggers a full green pipeline.

#### 1.3 API Improvements âœ…
- [ ] Add **API versioning** prefix (`/api/v1/tasks`).
- [ ] Add **pagination** to `GET /tasks` (start with cursor-based on `created_at, id`).
- [ ] Add **filtering** (`?completed=true`) and **sorting** (`?sort=createdAt&order=desc`) â€” push filtering down to the DB.
- [ ] Return correct status codes consistently (`201`, `400`, `404`, `204`).

#### 1.4 Baseline Security ðŸ”’
- [ ] Lock down **CORS** to your Vercel frontend origin + localhost (remove wildcard).
- [ ] Add **Helmet** middleware for security headers.
- [ ] Add **input validation** with `express-validator` on write endpoints (title required, max 500 chars, trim, escape).
- [ ] Add basic **rate limiting** (`express-rate-limit`, 100 req / 15 min per IP).
- [ ] Confirm **all queries are parameterized** (no string interpolation).

#### 1.5 Expand Tests ðŸ§ª
- [ ] Grow backend tests to cover: empty title, oversized title, whitespace trimming, 404 on missing ID.
- [ ] Add integration tests that hit the real (test) database.


#### 1.6 Handle Cold Starts âš™ï¸
- [ ] Set up a free **cron ping** (cron-job.org) hitting `/health` every ~14 minutes to keep Render warm.
- [ ] Document the cold-start tradeoff (note it for interviews).

### Exit Checklist
- âœ… PostgreSQL is the source of truth; `tasks.json` is gone.
- âœ… Every push to `main` auto-tests and auto-deploys.
- âœ… CORS restricted, Helmet active, inputs validated, rate limiting on.
- âœ… `GET /tasks` supports pagination, filtering, sorting.
- âœ… `/health` checks DB connectivity.

### Bottlenecks Solved
- **JSON file concurrency/corruption** â†’ solved by PostgreSQL.
- **Manual deploys** â†’ solved by CI/CD.
- **Open API surface** â†’ solved by CORS, validation, rate limiting.

---

# ðŸš€ Phase 2 â€” Grow from 1,000 to 10,000 Users

**Entry Condition:** Phase 1 complete; you have a stable DB-backed app with CI/CD.
**Goal:** Add caching to cut DB load, introduce authentication, and gain visibility through monitoring. Eliminate cold starts.

> **Expected load at this stage:** ~20-200 requests/second, DB ~10-100 MB, target cache hit rate 70-85%, response time < 50ms (cache hit).

### Sub-Tasks

#### 2.1 Add Redis Caching âš™ï¸
- [ ] Provision **Upstash Redis** (free serverless tier).
- [ ] Implement a **read-through cache** for `GET /tasks` (TTL ~30-60s).
- [ ] Implement **cache invalidation** â€” delete the user's cache key on any create/update/delete.
- [ ] Add `Cache-Control` headers for static assets (long TTL with versioned filenames).
- [ ] Measure cache hit rate; aim for 70%+.

#### 2.2 Add Authentication ðŸ”’
- [ ] Create the `users` table migration (`002_create_users`) with `email`, `password_hash`, `display_name`.
- [ ] Add `user_id` foreign key to `tasks` (with `ON DELETE CASCADE`).
- [ ] Add indexes: `idx_users_email`, `idx_tasks_user_id`, `idx_tasks_user_completed`, `idx_tasks_user_created`.
- [ ] Implement **register/login** with `bcrypt` (12 rounds) for password hashing.
- [ ] Issue **JWT in an HTTP-only, secure, SameSite=strict cookie**.
- [ ] Add an **`authenticate` middleware** and protect all `/tasks` routes.
- [ ] Scope every query to `req.userId` (users only see their own tasks).
- [ ] Add a **stricter rate limit** on `/login` (e.g., 5 attempts / 15 min).

#### 2.3 Set Up Observability ðŸ“Š
- [ ] Replace `console.log` with **structured logging using Pino** (pretty in dev, JSON in prod).
- [ ] Add **request metrics middleware** (method, path, status, duration).
- [ ] Add an **error-logging middleware**.
- [ ] Integrate **Sentry** for error tracking (free 5K events/month).
- [ ] Set up **uptime monitoring** (Checkly or Better Stack) pinging `/health` with alerts to email/Slack.
- [ ] Define initial **SLOs**: 99.5% uptime, p95 < 200ms, error rate < 1%.

#### 2.4 Performance Optimization âœ…
- [ ] Enable **gzip/brotli compression** (`compression` middleware) on the backend.
- [ ] Confirm **cursor-based pagination** is in use (not offset).
- [ ] Run **`EXPLAIN ANALYZE`** on the main queries; confirm indexes are used.
- [ ] Frontend: add **`React.lazy()` + `Suspense`** for code-splitting.
- [ ] Frontend: wrap `TaskItem` in **`React.memo()`** to avoid re-renders.
- [ ] Enable PgBouncer-style **connection pooling** on Neon.

#### 2.5 Eliminate Cold Starts âš™ï¸
- [ ] Upgrade Render backend to a **paid always-on tier** (~$7/month) â€” removes the 30s cold-start penalty.

#### 2.6 Expand Testing ðŸ§ª
- [ ] Add **component tests** for FilterBar, TaskItem edit/save/cancel, empty state.
- [ ] Add **E2E tests with Playwright** for the full create â†’ toggle â†’ delete flow.
- [ ] Add a **k6 load test** (`load-test.js`) ramping to 100 concurrent users; thresholds: p95 < 200ms, error rate < 1%.
- [ ] Run the load test against staging before each major release.

### Exit Checklist
- âœ… Redis cache live with working invalidation; DB load measurably reduced.
- âœ… Users can register/log in; tasks are user-scoped and protected by JWT auth.
- âœ… Structured logs, error tracking, and uptime alerts are operational.
- âœ… Compression and code-splitting reduce payload sizes.
- âœ… No cold starts; load test passes at 100 VUs.

### Bottlenecks Solved
- **Repeated DB reads** â†’ solved by Redis caching.
- **No auth / shared data** â†’ solved by JWT auth + user scoping.
- **Blindness to issues** â†’ solved by logging, Sentry, uptime monitoring.
- **Cold-start latency** â†’ solved by always-on tier.

---

# ðŸ“ˆ Phase 3 â€” Grow from 10,000 to 100,000 Users

**Entry Condition:** Phase 2 complete; caching + auth + monitoring in place. A single Express instance is starting to max out.
**Goal:** Scale horizontally, offload reads to a replica, and move slow work to background jobs.

> **Expected load at this stage:** ~200-2,000 requests/second, DB ~100 MB-1 GB, target cache hit rate 85-90%, response time p50 < 20ms / p99 < 100ms.

### Sub-Tasks

#### 3.1 Horizontal Scaling âš™ï¸
- [ ] Run **multiple Express instances** (start with 2-4) â€” the API is stateless thanks to JWT, so any instance handles any request.
- [ ] Put **NGINX (or the platform's LB)** in front as a reverse proxy / load balancer with SSL termination.
- [ ] Configure **auto-scaling** rules (scale on CPU / request rate) where the platform supports it.
- [ ] Confirm sessions/caching are **fully externalized** (Redis), not in-process memory.

#### 3.2 Database Read Scaling âš™ï¸
- [ ] Add a **PostgreSQL read replica**.
- [ ] Route **read queries to the replica**, **writes to the primary**.
- [ ] Account for **replication lag** (read-after-write: serve fresh writes from primary/cache).
- [ ] Re-tune connection pool sizes across the now-multiple instances (stay under Neon's connection cap).

#### 3.3 Distributed Caching âš™ï¸
- [ ] Ensure Redis is shared across all instances (it already is with Upstash).
- [ ] Consider a **Redis cluster** if cache throughput becomes a bottleneck.
- [ ] Review TTLs and invalidation correctness now that multiple writers exist.

#### 3.4 Background Jobs & Queues âš™ï¸
- [ ] Introduce a **job queue (BullMQ + Redis)** for non-critical async work.
- [ ] Move work like **email notifications, report generation, bulk imports** off the request path.
- [ ] Run a **separate worker process** to consume the queue.
- [ ] Add **scheduled jobs (node-cron)** for cleanup (e.g., purge tasks completed > 30 days).

#### 3.5 Reliability Engineering ðŸ”’ðŸ“Š
- [ ] Implement the **circuit breaker pattern** (`opossum`) around DB calls â€” fail fast when the DB is down.
- [ ] Add **client-side retries with exponential backoff** for transient failures.
- [ ] Make `POST /tasks` **idempotent** via an `Idempotency-Key` header (stored in Redis).
- [ ] Define **rollback strategies** (redeploy previous build, feature flags).
- [ ] Introduce **feature flags** (env-based now, Unleash later) for safe rollouts.

#### 3.6 Advanced Observability ðŸ“Š
- [ ] Build **dashboards** (Grafana Cloud free tier) for latency, error rate, throughput.
- [ ] Set **alerting thresholds** tied to your SLOs.
- [ ] Add **distributed tracing** to find slow spans across instances.

#### 3.7 Load & Stress Testing ðŸ§ª
- [ ] Run a **k6 stress test** ramping to 500-1,000 VUs to find the breaking point.
- [ ] Document where response times spike and error rates climb.
- [ ] Validate auto-scaling triggers correctly under load.

### Exit Checklist
- âœ… Multiple Express instances behind a load balancer; stateless and auto-scaling.
- âœ… Reads served from a replica; writes isolated to primary.
- âœ… Background jobs offloaded to a queue + worker.
- âœ… Circuit breaker, retries, and idempotency keys protect against failures.
- âœ… Dashboards + alerts tied to SLOs; stress test passes at target load.

### Bottlenecks Solved
- **Single server saturation** â†’ solved by horizontal scaling + LB.
- **Read-heavy DB load** â†’ solved by read replica.
- **Slow synchronous work** â†’ solved by job queue + workers.
- **Cascading failures** â†’ solved by circuit breaker, retries, idempotency.

---

# ðŸŒ Phase 4 â€” Grow from 100,000 to 1M+ Requests

**Entry Condition:** Phase 3 complete; horizontally scaled with replicas and queues. Hitting write throughput and geographic latency limits.
**Goal:** Distributed-systems maturity â€” partition data, go global, move toward event-driven and real-time.

> **Reality check:** A Todo app will almost certainly never need this. This phase is for knowledge depth and career growth.

### Sub-Tasks

#### 4.1 Database Sharding / Partitioning âš™ï¸
- [ ] **Partition the `tasks` table by `user_id`** to spread write load.
- [ ] Evaluate **sharding users across multiple databases** if a single primary can't keep up with writes.
- [ ] Plan a **shard key strategy** and routing layer.

#### 4.2 Multi-Region Deployment ðŸŒ
- [ ] Deploy API instances in **multiple regions** (e.g., US, EU, Asia).
- [ ] Use **global CDN routing** to send users to the nearest edge (the React SPA already benefits from this).
- [ ] Plan **cross-region data replication** and consistency tradeoffs.

#### 4.3 Event-Driven Architecture âš™ï¸
- [ ] Publish **task events** (created/updated/deleted) to a message bus.
- [ ] Let **consumers react** (analytics, notifications, search indexing) independently.
- [ ] Embrace **eventual consistency** where appropriate.

#### 4.4 Real-Time Updates âš™ï¸
- [ ] Add **WebSocket connections** for live task updates across devices/users.
- [ ] Scale the WebSocket layer with a Redis pub/sub backplane.

#### 4.5 Organizational & Process Maturity âœ…
- [ ] Formalize **SLAs** (with consequences) on top of internal SLOs.
- [ ] Establish **on-call / incident response** runbooks.
- [ ] Maintain **Architecture Decision Records (ADRs)** for every major choice.
- [ ] Consider **service extraction** (e.g., a notification service) only if a clear, independently-scaling domain emerges.

### Exit Checklist
- âœ… Write load distributed via partitioning/sharding.
- âœ… Users served from the nearest region with acceptable latency.
- âœ… Event-driven consumers decoupled from the request path.
- âœ… Real-time updates working at scale.

### Bottlenecks Solved
- **Single-primary write ceiling** â†’ sharding/partitioning.
- **Geographic latency** â†’ multi-region + global CDN.
- **Tight coupling** â†’ event-driven architecture.

---

# ðŸ“Œ Master Execution Checklist (Condensed)

Use this as your top-level tracker.

| Stage | Must-Do Headlines | Done? |
|-------|-------------------|-------|
| **Phase 0** | Multi-stage Docker Â· secrets hygiene Â· `/health` Â· graceful shutdown Â· first deploy (Vercel + Render) | â˜ |
| **Phase 1** | PostgreSQL migration Â· CI/CD Â· pagination/filtering Â· CORS+Helmet+validation+rate limit Â· cron ping | â˜ |
| **Phase 2** | Redis cache + invalidation Â· JWT auth Â· Pino logs + Sentry + uptime Â· compression + code-split Â· always-on tier | â˜ |
| **Phase 3** | Horizontal scaling + LB Â· read replica Â· BullMQ queue + worker Â· circuit breaker + retries + idempotency Â· dashboards | â˜ |
| **Phase 4** | Sharding/partitioning Â· multi-region Â· event-driven Â· WebSockets Â· SLAs + incident process | â˜ |

---

# âš ï¸ Golden Rules Across All Phases

1. **Never skip a phase's exit checklist** before moving on â€” each phase assumes the previous one is solid.
2. **Never deploy without tests passing.**
3. **Never commit secrets** â€” always use environment variables.
4. **Always have a rollback plan** before each production deploy.
5. **Measure before optimizing** â€” use `EXPLAIN ANALYZE`, load tests, and dashboards to find the *real* bottleneck.
6. **Solve the current bottleneck, not the imaginary one** â€” don't build Phase 4 infrastructure for a Phase 1 problem.

---

*Companion roadmap to `deploy.md` â€” Task Manager App (React 19 + Vite 8 + Express 5)*
*Generated: May 2026*