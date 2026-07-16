# Deployment

## Supported deployment shape

The production-ready MVP is designed for one Node.js web-service instance with one persistent disk. JSON storage remains the local/test default. A production deployment should set `STORAGE_ADAPTER=sqlite` and mount persistent storage at `DATA_DIR` (the supplied Render blueprint uses `/var/data`). The application validates its server, request-bound, and storage environment before listening.

Node.js 24.18.0 LTS is pinned in `render.yaml`. The minimum supported runtime is Node.js 22.13 because the durable adapter uses the built-in `node:sqlite` module. The Node documentation still labels that API release-candidate stability; validate it again before a high-scale or multi-instance deployment.

## Render

1. Push this repository and create a Render Blueprint from `render.yaml`.
2. Confirm the one-gigabyte disk is mounted at `/var/data`.
3. Deploy. Render runs `npm ci && npm run build`, starts `npm start`, and checks `/health`.
4. Keep the instance count at one. SQLite on a mounted disk is not a multi-instance coordination mechanism.
5. Back up `/var/data/research.sqlite` and `/var/data/visibility-observations.json` according to the environment's recovery objectives.

Render only preserves files written beneath the configured disk mount. A deployment using JSON storage without a disk will lose run history during rebuilds or instance replacement.

## Environment

Copy `.env.example` for local configuration. Never commit a populated `.env` file.

| Variable | Purpose | Bounds/default |
| --- | --- | --- |
| `HOST` / `PORT` | Listening address | `0.0.0.0` / `3000`; port 1–65535 |
| `STORAGE_ADAPTER` | Run-store implementation | `json` or `sqlite`; local default `json` |
| `DATA_DIR` | JSON files and default SQLite path | `./data` |
| `SQLITE_PATH` | Optional SQLite path override | unset |
| `REQUEST_TIMEOUT_MS` | Per outbound request timeout | 100–120000; default 10000 |
| `MAX_HTML_BYTES` | Maximum HTML response body | 1024–20000000; default 2000000 |
| `USER_AGENT` | Public crawler identity | printable, at most 200 characters |
| `SHUTDOWN_TIMEOUT_MS` | Graceful drain window | 1000–60000; default 25000 |
| `AI_INTERPRETATION_ENABLED` | Optional interpretation gate | `false` by default |

The crawl API independently enforces at most 50 pages, depth 5, and a delay from 0 through 60 seconds. Requests remain same-origin by default and retain SSRF, redirect, content-type, timeout, and response-size protections.

## Operations and failure behavior

- Startup logs contain event names, time, port, environment, and adapter only. Paths, request bodies, evidence, and secrets are not logged.
- `SIGTERM` and `SIGINT` stop new connections and allow active requests up to the configured drain window.
- A failed page does not erase successful crawl pages; the crawl records explicit blocked, skipped, and error states.
- Storage writes use atomic replacement in the JSON adapter and transactions in SQLite.
- Optional AI interpretation is unavailable until a reviewed adapter is supplied; deterministic analysis is unaffected.

## Long-crawl job plan

The current MVP intentionally runs bounded crawls in the web request. This is suitable for the enforced 50-page ceiling but is not a background-job system. Before raising that limit, add a durable job table and worker with leases, retry limits, idempotency keys, per-project cancellation, progress events, and recovery after process restart. Keep the current crawl bounds until that worker is implemented and tested.

## Deterministic demo fallback

When a deployment cannot reach an external site, use the bundled verification fixtures as the no-network demonstration path:

```powershell
npm test -- tests/verification tests/comparison tests/reports tests/analyzer/app.test.ts
```

Those fixtures exercise evidence extraction, comparison, persistence, reopening, history, verification, and export without uncontrolled network access. They are test/demo evidence only and are never inserted automatically into production storage. The browser's live crawl and compare forms do not silently substitute fixture data for a failed public URL.

## Verification before deployment

```powershell
npm ci
npm test
npm run build
node --check apps/web/public/app.js
git diff --check
npm start
```

Confirm `GET /health` returns `{"status":"ok"}` and perform the demo workflow in `docs/demo-guide.md` before promoting a deployment.

### Migration 002 hold point

Release 1 analytics migration 002 has passed only fresh/existing temporary-database tests. Do not start this revision with `STORAGE_ADAPTER=sqlite` against an important existing local or deployed database until separate migration approval is granted. At that point, stop the writer, take and verify a backup, inspect schema version/table counts, run migration once, confirm `PRAGMA foreign_keys = 1`, exercise project/import/search/opportunity reads, and retain rollback/restore instructions.

JSON analytics uses `DATA_DIR/analytics.json`; it stores normalized records and lineage only. Original CSV files are never written to disk by the application.

## Deferred production scale work

- Managed PostgreSQL and object storage for multiple instances.
- Durable background workers for crawls beyond the current bound.
- Authentication, authorization, tenant isolation, quotas, and audit-log retention.
- A reviewed AI provider adapter and secret-manager integration.
- Reviewed OAuth/provider adapters for Search Console, analytics, campaigns, or CRM; Release 1 is CSV-only.
- PDF generation; JSON, Markdown, and CSV exports are available now.

Deployment configuration references the official [Node.js release schedule](https://nodejs.org/en/about/previous-releases), [Render Blueprint specification](https://render.com/docs/blueprint-spec), and [Render persistent-disk guidance](https://render.com/docs/disks).
