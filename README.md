# AI Visibility Research Lab

AI Visibility Research Lab is a deterministic-first platform for inspecting public website evidence, comparing one target with up to five competitors, producing reviewable implementation proposals, and verifying observable changes across saved runs.

```text
Observe -> Measure -> Analyze -> Compare -> Propose -> Verify -> Monitor
```

The lab does not generate a synthetic visibility score, predict rankings, scrape result pages, or claim that a website signal is a confirmed ranking factor. Optional AI interpretation is downstream of preserved evidence and is disabled unless a reviewed provider adapter is supplied.

## Principles

- Every finding has a stable rule ID/version, source URL, observed value, limitation, and verification method.
- All sites travel through the same fetch, parse, rule, and comparison path.
- Missing page evidence does not prove the business lacks the underlying fact.
- Competitor differences are research prompts, never instructions to copy or fabricate.
- Medical, professional, credential, testimonial, price, insurance, and other YMYL claims require factual and qualified review.
- Website changes and visibility observations can be concurrent without being causal.

## What works now

- Safe single-page acquisition with URL normalization, SSRF controls, bounded redirects, timeout/body/content-type limits, and explicit resource evidence.
- Same-origin breadth-first crawl projects with configurable page/depth/delay bounds, tracking-parameter removal, canonical duplicate prevention, `robots.txt` awareness, sitemap discovery, deterministic ordering, and partial results.
- Normalized page extraction for metadata, headings, indexability, visible questions/answers, JSON-LD, links, images, entity/service/location/trust/contact evidence, and raw parse errors.
- Versioned analyzer library covering technical, content/answerability, entity, trust/YMYL, and retrieval-support observations.
- One target plus one-to-five competitor comparison with 43 inspectable matrix metrics, per-site eligibility, target/competitor advantages, shared gaps, transparent thresholds, and no aggregate score.
- Evidence-linked implementation proposals for metadata, canonicals, headings, FAQ/schema, provider/reviewer/reference/risk/contact blocks, links, page briefs, tables, and image-alt guidance.
- Strict comparison persistence, reopen/latest/list APIs, semantic history, analyzer-aware verification, evidence diffs, and proposal-resolution links.
- Manual rank/citation observations with query, engine, location, device, date, reference, and notes. No automated provider is presented as active.
- Release 1 growth-intelligence connectors for validated Search Console, web analytics, campaign, and aggregate lead-summary CSV exports; no live provider access.
- Strict normalized analytics records with project isolation, source/import lineage, deterministic duplicate protection, redacted row rejections, JSON/SQLite parity, and controlled import deletion.
- Search Performance table with page/query/date/device/country filters and row detail linking imported values to matching saved public-page and competitor evidence.
- Deterministic opportunity backlog with exact calculations, limitations, actions, success metrics, persisted review statuses, and JSON/Markdown/CSV exports.
- Complete JSON, Markdown, and CSV reports.
- JSON local storage and transactional SQLite durable storage with migrations.
- Optional, schema-validated AI interpretation interfaces with evidence citations, prompt versioning, bounded input/output, timeout handling, and no bundled live provider.
- Accessible responsive research workspace: Projects, Single Analysis, Comparison, History, Visibility Observations, Data Sources, CSV Imports, Data Explorer, Search Performance, Opportunity Backlog, Research Sources, and Roadmap.
- Render deployment blueprint, health check, fail-fast environment validation, structured safe logs, and graceful shutdown.

## Quick start

Requirements: Node.js 22.13 or newer (Node.js 24 LTS is recommended) and npm.

```powershell
npm install
npm test
npm run build
npm run dev
```

Open `http://localhost:3000`.

Production-style local start:

```powershell
$env:STORAGE_ADAPTER='sqlite'
$env:DATA_DIR='./data'
npm run build
npm start
```

The service writes generated data under `data/`, which is ignored by Git. Copy `.env.example` as a reference; the application does not load dotenv files itself, so set variables in the process or deployment platform.

## Workflow

1. Open **Projects** and run a bounded same-origin crawl. Inspect every analyzed, blocked, skipped, and failed page.
2. Open **Single Analysis** for a page-level evidence and rule review.
3. Open **Comparison**, submit a target and one-to-five competitors, then inspect eligibility before interpreting gaps.
4. Review the matrix, evidence, target gaps/advantages, shared gaps, and proposed artifacts.
5. Reopen the saved run from **History** or export it as JSON, Markdown, or CSV.
6. After publishing reviewed changes, run the same normalized target again to generate history and verification.
7. Record manual visibility observations separately. Treat concurrent movement as non-causal.
8. Optionally request AI interpretation only after configuring a reviewed adapter; deterministic findings remain authoritative.
9. For Release 1 analytics, select the crawl/comparison project, preview and map a CSV, review accepted/rejected counts, inspect normalized lineage, then review Search Performance and the opportunity backlog.

See [the demo guide](docs/demo-guide.md) for an exact walkthrough.

## Architecture

```text
Browser workspace
  -> Express routes + strict request schemas
    -> safe single-page acquisition / bounded site crawl
      -> parser + normalized evidence
        -> deterministic rules + analyzer library
          -> eligibility + comparison + proposals
            -> JSON or SQLite run store
              -> history + verification + reports
                -> optional evidence-grounded interpretation

CSV export -> preview/mapping -> strict row normalization -> project-scoped JSON/SQLite analytics store
  -> Search Performance + evidence linkage -> deterministic opportunity backlog -> workflow + exports
```

The browser contains presentation logic only. Fetch policy, parsing, rules, analyzers, comparison, proposals, verification, reports, and persistence are separate typed modules. See [architecture](docs/architecture.md) and the [file map](docs/file-map.md).

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the TypeScript service in watch mode |
| `npm test` | Run all deterministic unit/integration/API/storage/browser-source tests |
| `npm run build` | Compile strict TypeScript into `dist/` |
| `npm start` | Run `dist/services/analyzer/index.js` |
| `npm run test:watch` | Run Vitest interactively |
| `node --check apps/web/public/app.js` | Check browser JavaScript syntax |

## Main API

```http
GET  /health
POST /api/analyze
POST /api/projects/crawl
POST /api/compare
GET  /api/runs
GET  /api/runs/latest?targetUrl=...
GET  /api/runs/:id
GET  /api/runs/:id/export?format=json|markdown|csv
GET  /api/research-sources
GET  /api/ai/status
POST /api/runs/:id/interpretations
GET  /api/visibility-providers
POST /api/visibility-observations
GET  /api/visibility-observations?targetUrl=...
GET  /api/connectors
GET  /api/growth/projects
POST /api/imports/preview
POST /api/imports
GET  /api/imports?projectId=...
GET  /api/imports/:id?projectId=...
DELETE /api/imports/:id?projectId=...
GET  /api/data-sources?projectId=...
GET  /api/metrics?projectId=...
GET  /api/search-performance?projectId=...
GET  /api/search-performance/:id?projectId=...
GET  /api/opportunities?projectId=...
GET  /api/opportunities/:id?projectId=...
PATCH /api/opportunities/:id/status?projectId=...
GET  /api/growth/export?projectId=...&format=json|markdown|csv
```

All API failures use `{ "error": { "code", "message", "details" } }`. Full contracts are in [API documentation](docs/api.md).

## Method and sources

Direct observations are kept separate from internal heuristics, deterministic inferences, proposals, optional AI interpretation, and manual visibility observations. The research registry maps analyzer IDs to official guidance, standards, schema vocabulary, accessibility guidance, or explicitly labeled internal heuristics. See [methodology](docs/methodology.md) and [research sources](docs/research-sources.md).

## Storage and deployment

- `STORAGE_ADAPTER=json` is the local/test default. Run data and analytics data use separate strictly validated, atomically replaced files.
- `STORAGE_ADAPTER=sqlite` uses the built-in `node:sqlite` API, strict tables, migrations, WAL, foreign keys, and transactions. Analytics migration 002 references the existing `research_projects` table directly and has been applied only to temporary test databases in Release 1 verification.
- The Render blueprint mounts `/var/data`; only one web instance should use the SQLite database.
- Manual visibility observations currently use their own atomic JSON store even when comparison runs use SQLite.

See [storage](docs/storage.md) and [deployment](docs/deployment.md).

## Limits and roadmap

- Static HTML only: no browser rendering, JavaScript execution, authenticated crawl, or CSS visibility model.
- Bounded synchronous crawls only; long-running/background jobs are planned before any higher page limit.
- No authentication, tenant isolation, quotas, audit retention, or multi-instance database.
- No live Search Console, analytics, campaign, CRM, backlink, automated rank, or citation provider integrations. Release 1 uses user-supplied aggregate CSV values only.
- No original CSV retention, direct personal identifiers, patient data, form contents, call recordings, credentials, or OAuth tokens.
- No bundled AI adapter. Enabling environment variables alone does not activate AI.
- No PDF export; JSON, Markdown, and CSV are verified.
- No causal or ranking guarantee and no proprietary-system measurement.
- SQLite's Node API remains release-candidate stability; managed PostgreSQL is the future multi-instance path.

The exact implementation inventory, verification results, commits, deferred items, and future edit locations are in [the change report](docs/change-report.md).
