# 09 — Infrastructure, Deployment & Operations

## 1. Environments

| | local | staging | prod |
|---|---|---|---|
| Compose | `docker-compose.yml` (PG+Redis+API+FE+worker) | Docker images on Railway | same as staging, bigger |
| DB/Redis | compose containers | Neon/Supabase branch · Upstash dev | Neon/Supabase prod · Upstash |
| Payments | Razorpay **test** keys | test | **live** |
| FE | `localhost:3000` | `staging.<domain>` (Vercel preview/prod URL) | `<domain>` |

## 2. Local Development

```
docker compose up -d postgres redis        # or make infra
backend:      uv run uvicorn app.main:app --reload
worker:       uv run arq workers.arq_settings.WorkerSettings
frontend:     pnpm dev
seed:         uv run python -m scripts.seed --with-demo-orders
open: FE http://localhost:3000 · API http://localhost:8000/docs
```
- `make setup` (or `scripts/setup.sh`): copies `.env.example`s, creates venvs,
  installs deps, runs `alembic upgrade head`.
- Hot reload on both sides; static media stored locally under `backend/media/`.

## 3. Docker

- `backend/Dockerfile`: multi-stage (uv wheels → slim runtime);
  targets: `web` (uvicorn), `worker` (arq); non-root user; healthcheck `/readyz`.
- `frontend/Dockerfile`: standalone Next.js output; only used if self-hosting
  (Vercel path skips it).
- `docker-compose.yml` (dev) / `docker-compose.prod.yml` (optional self-host):
  postgres:16-alpine (volume), redis:7-alpine (AOF), api, worker, web.
  Prod compose variant: TLS via Caddy labels, `restart: always`, resource limits.

## 4. CI/CD (GitHub Actions)

```
push/PR ─▶ ci.yml
  ├ backend job: ruff, mypy --strict, pytest (-n auto, real PG+Redis services),
  │             pip-audit, alembic upgrade head against throwaway PG
  ├ frontend job: pnpm i --frozen, eslint, tsc --noEmit, vitest, next build (typed), npm audit
  └ e2e job (PRs to main only): compose up full stack → Playwright suite
main  ─▶ deploy.yml
  ├ build backend image → GHCR (sha tag) → deploy Railway ( Railway webhook) →
  │  run migrations job (alembic upgrade head) → health-check gate → rollback-on-fail
  └ frontend → Vercel deploy (hero build w/ NEXT_PUBLIC_API_URL per env)
tags/v* ─▶ release.yml: changelog + image tags prod
```

Deployment order matters: **migrate → deploy for zero-downtime**
(additive-first migrations; destructive changes in a follow-up after rollout).

## 5. Envs / Secrets via deployment platforms

`ENVIRONMENT, DATABASE_URL, REDIS_URL, JWT_SECRET, RAZORPAY_KEY_ID,
RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, FRONTEND_ORIGIN,
RESEND_API_KEY, EMAIL_FROM, S3_* (R2 endpoint/keys/bucket),
SLOWAPI/LOG_LEVEL, NEXT_PUBLIC_* on Vercel`.
Rotation runbook: Razorpay secrets via Dashboard → new keys; JWT_SECRET forces
re-login (daily-window maintenance).

## 6. Observability

| Signal | Tooling |
|---|---|
| Logs | structlog JSON (stdout) → platform log drain; request_id/user_id bound |
| Errors | Sentry (both sides) + release tagging + alert rules (error spike > 1% over 5 min) |
| Metrics | `/readyz` scrape → uptime monitor (UptimeRobot/BetterStack); API p95 via middleware → exported to Sentry/Grafana Cloud free tier |
| Tracing (optional) | OpenTelemetry → Grafana Tempo after launch |
| Product analytics | GA4 + optional PostHog (FE events: view_item, add_to_cart, begin_checkout, purchase) |
| Payment ops | reconciliation job failures → Sentry + support email |

Alert conditions: 5xx rate > 2% over 5 min · PENDING orders > threshold stuck ·
worker queue lag > 5 min · DB CPU > 80% 10 min.

## 7. Data Safety

- Postgres: PITR (backups + WAL) on Neon/Supabase; quarterly restore drill.
- Redis: AOF persistent; contents treated as cache anyway.
- Object storage: versioning + lifecycle on bucket.
- Retention: audit logs 2 years; webhook payloads 90 d; logs 30 d drain.

## 8. Scaling Plan (as traffic grows)

| Bottleneck | Trigger | Fix |
|---|---|---|
| FE traffic | always | Vercel autoscales (ISR keeps API load flat) |
| API CPU | p95 latency rising | horizontal replicas behind LB (already stateless) |
| Catalog reads | hot PDPs | Redis cache + ISR absorb; raise TTL when stable |
| Stock hot rows | flash sale writes | keep short txn; if contention, queue-per-variant or `UPDATE … WHERE stock >= qty` atomic path |
| Analytics | > 100k orders | rollup table (doc 08) + read replica for admin queries |
| Search relevance | catalog > 5k | Postgres FTS first; Meilisearch service later (drop-in `/search`) |
| Emails | campaigns | move marketing to dedicated ESP; transactional stays Resend |
| Multi-region | latency complaint | FE edge is global; API region split + Neon read replicas |

## 9. Go-Live Checklist

- [ ] Live Razorpay keys + webhook (signature) configured & test-verified with a ₹1 real payment
- [ ] Live keys stored only in prod env (not Vercel preview), test keys used elsewhere
- [ ] `alembic upgrade head` in prod; seed `--with-demo-orders` NOT run in prod
- [ ] First admin created from env or invite; delete seeded admin if used
- [ ] Domain + TLS + HSTS; CORS pinned; security headers verified (securityheaders.com)
- [ ] Sentry DSNs wired; log drain on; uptime monitor on /readyz
- [ ] Backup restore verified once on prod snapshot
- [ ] GA4 + webhooks + emails (Resend domain DKIM verified)
- [ ] Legal pages (/terms, /privacy, /refund-policy), company contact
- [ ] Runbook: deploy, rollback, rotate JWT, re-run reconciliation
