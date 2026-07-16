# Architecture

## Boundary and invariants

The system observes public HTTP/HTTPS responses and user-entered visibility observations. It does not have access to private analytics, an external index, proprietary ranking/retrieval logic, or an AI provider by default.

The architectural invariants are:

1. Raw acquisition evidence is preserved before interpretation.
2. One analyzer path is used for targets and competitors.
3. Findings, analyzers, proposals, and verification records carry stable versions or IDs.
4. Comparison conclusions exclude ineligible pages but retain their retrieval evidence.
5. Persistence parses, aligns, recomputes, and semantically validates records before accepting them.
6. AI output cannot overwrite deterministic evidence.

## Component flow

```text
apps/web/public
  Browser workspace, filters, evidence drill-down, history, exports
        |
        v
services/analyzer/app.ts + packages/schemas/api.ts
  HTTP boundary, strict payload validation, safe error envelope
        |
        +-------------------------+---------------------------+
        |                         |                           |
        v                         v                           v
services/analyzer/analyze.ts  services/analyzer/crawl.ts  services/analyzer/compare.ts
        |                         |                           |
        v                         v                           v
packages/crawler ----------> packages/parser/entities ---> rules/analyzers
  safety, request, fetch,       DOM evidence, normalized      stable observations
  resources, discovery,         text, links, questions        and limitations
  site crawl                         |                           |
                                     +-------------+-------------+
                                                   v
                                      packages/comparison
                                      eligibility + 43 metrics
                                                   |
                                  +----------------+----------------+
                                  v                                 v
                         packages/proposals                packages/verification
                                  |                                 |
                                  +----------------+----------------+
                                                   v
                                         packages/storage
                                      JSON / SQLite adapters
                                                   |
                              +--------------------+--------------------+
                              v                    v                    v
                       packages/reports     packages/visibility   packages/ai
                       JSON/MD/CSV          manual observations   optional only
```

## Runtime flows

### Single analysis

`POST /api/analyze` validates one URL. `analyzeUrl` normalizes it, applies the crawler request policy, records redirect/network evidence, parses the final HTML response, checks root resources, runs deterministic rules, and runs analyzer library version `1.0.0`. No persistence occurs.

### Crawl project

`POST /api/projects/crawl` discovers root resource evidence and sitemap URLs, then runs a same-origin breadth-first crawl. URL identity removes fragments and known tracking parameters and sorts remaining parameters. The queue is deterministic; final redirect identities prevent duplicate analysis. Each page is `analyzed`, `blocked`, `skipped`, or `error`. SQLite optionally archives the project and pages; the JSON RunStore interface currently treats crawl archival as optional.

### Comparison and save

`POST /api/compare` accepts one target and one-to-five unique competitors. Submitted order becomes durable site identity (`target` order 0). All analyses run concurrently but are realigned to submission order. Eligibility is computed before benchmarks. The comparison emits raw rows, gaps, advantages, shared gaps, set differences, limitations, and proposals. The service loads the newest normalized-target run, builds history and verification when present, and saves the whole record.

### Reopen, history, and verification

`GET /api/runs`, `/api/runs/:id`, and `/api/runs/latest` decode through the same strict storage validator. History keys on normalized submitted target URL, not redirect destination. Sites pair by normalized submitted URL; competitor membership and ordering are tracked separately. Verification adds analyzer-version/status changes and proposal links. The frontend clears obsolete history errors before each request and again on success.

### Reports and optional interpretation

Exports build a complete report from a validated saved run plus matching manual visibility observations. Optional interpretation first converts the saved run into allowlisted evidence IDs, applies character/item/output/time bounds, validates the provider response schema and citations, and stores it only when the adapter supports that extension.

## Security and operational model

- URL normalization admits HTTP/HTTPS only.
- Literal and DNS-resolved loopback, private, link-local, multicast, reserved, and mixed answers are rejected.
- Every redirect target is revalidated.
- Fetches use time, byte, redirect, and content-type bounds.
- Crawl requests are same-origin, at most 50 pages and depth 5, with an explicit per-host delay.
- Express limits JSON bodies to 100 KB and never returns a stack trace.
- Structured startup/shutdown logs omit paths, payloads, evidence, and secrets.
- JSON writes are serialized and atomically renamed; SQLite writes are transactional with foreign keys and WAL.

Native fetch retains a narrow DNS-rebinding time-of-check/time-of-use window. Production egress controls remain advisable.

## Persistence model

`RunStore` is the port. `JsonRunStore` is local/test storage. `SqliteRunStore` is the single-instance durable adapter. Migration 001 creates projects, runs, ordered sites/pages, evidence, findings, comparisons, proposals, verifications, research sources, AI interpretations, and a reserved visibility table. The complete validated run remains stored as JSON alongside normalized relational records, allowing strict round-trip validation while keeping queryable extension points.

Manual visibility observations currently use a separate atomic JSON store. That boundary is intentional and documented as a future consolidation task.

## Extension points

- Add analyzers in `packages/analyzers/evaluate.ts`, then register their sources.
- Add deterministic findings in `packages/rules/evaluate.ts` and align storage validation.
- Add comparison metrics and thresholds in `packages/comparison/compare.ts` and types.
- Add persistence migrations under `packages/storage/migrations/` and `sqlite-migrations.ts`.
- Implement an AI provider against `packages/ai/types.ts`; do not modify deterministic records.
- Implement approved visibility providers against `packages/visibility/types.ts`.
- Add durable background work before increasing crawl bounds.

## Deliberate non-features

There is no aggregate score, browser rendering, automatic SERP scraping, ranking guarantee, causal attribution, authentication system, multi-tenant database, distributed job queue, bundled AI adapter, or PDF generator.
