# API

The Express service accepts JSON request bodies up to 100 KB. URL strings are trimmed and limited to 2,048 characters. Unknown request fields are rejected by strict Zod schemas.

## Error envelope

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Request validation failed",
    "details": {}
  }
}
```

Expected statuses include 400 for invalid input/JSON/rank context, 404 for absent runs/routes, 413 for large request bodies, 422 for invalid AI output, 502/504 for provider failure/timeout, 503 when AI is not configured, and 500 for storage or unexpected failures. Storage diagnostics expose the validation path and rejected value in structured details without returning stack traces.

## Health

### `GET /health`

Returns `200 { "status": "ok" }`. This confirms the process can serve HTTP; it is not a live outbound-network probe.

## Analysis and crawl

### `POST /api/analyze`

```json
{ "url": "https://example.com/page" }
```

Returns the fetched page evidence, redirect/network/resource records, parsed fields, normalized evidence, rule findings, raw evidence, and versioned analyzer observations. It does not save a run.

### `POST /api/projects/crawl`

```json
{
  "targetUrl": "https://example.com/",
  "maxPages": 10,
  "maxDepth": 2,
  "minimumDelayMs": 250
}
```

Bounds: pages 1–50, depth 0–5, delay 0–60000 ms. Returns a project ID/time/config, `complete` or `partial` status, truncation flag, ordered page records (`analyzed`, `blocked`, `skipped`, `error`), aggregate totals, and limitations. A supporting store may archive the project.

## Comparison and history

### `POST /api/compare`

```json
{
  "targetUrl": "https://target.example/",
  "competitorUrls": [
    "https://one.example/",
    "https://two.example/"
  ],
  "queryLabel": "optional normalized context",
  "rankObservations": {
    "https://target.example/": 8
  }
}
```

Requires one target and one-to-five unique competitors. The target cannot also be a competitor. Rank positions are integers 1–1000 and may reference only submitted URLs after normalization.

Returns and saves a strict `RunRecord`:

- durable identity/time/schema/application versions;
- normalized target/competitor identities and ordered sites;
- manual query/rank context;
- page analyses and eligibility;
- metric definitions and target-first matrix;
- target gaps/advantages, competitor advantages, shared gaps, and excluded competitors;
- implementation artifacts and limitations;
- history and verification when a prior matching run exists.

### `GET /api/runs`

Returns newest-first summaries with ID/time, target/competitors/sites, query, finding/gap counts, and prior-run flag.

### `GET /api/runs/latest?targetUrl=https%3A%2F%2Ftarget.example%2F`

Normalizes the target and returns the newest matching complete run. Returns `RUN_NOT_FOUND` when absent.

### `GET /api/runs/:id`

Returns the validated saved run. IDs must be non-empty and at most 200 characters.

### `GET /api/runs/:id/export?format=json|markdown|csv`

Builds a complete report from the saved run and matching manual visibility observations. Returns an attachment named `ai-visibility-{id}.{json|md|csv}`. PDF is not implemented.

## Research registry

### `GET /api/research-sources`

Returns:

```json
{
  "registryVersion": "1.0.0",
  "sources": []
}
```

Each source records publisher/title/URL/date/type, supported claim, mapped analyzers, confidence, and limitation notes.

## Optional AI interpretation

### `GET /api/ai/status`

Returns whether a provider is genuinely active, configured provider/model labels, and `deterministicAnalysisAvailable: true`. Environment values alone cannot create an adapter; the shipped app returns `enabled: false`.

### `POST /api/runs/:id/interpretations`

```json
{ "focus": "Optional evidence-grounded research focus" }
```

`focus` is optional, trimmed, and limited to 1,000 characters. The route reopens the saved run, builds allowlisted evidence IDs, invokes the configured provider under timeout/item/character/token bounds, validates the response shape and every citation, and persists the interpretation where supported. Deterministic evidence is unchanged. Without an adapter it returns `AI_NOT_CONFIGURED` (503).

## Manual visibility observations

### `GET /api/visibility-providers`

Returns:

```json
{ "manualEntryEnabled": true, "providers": [] }
```

### `POST /api/visibility-observations`

```json
{
  "targetUrl": "https://target.example/",
  "query": "example query",
  "engine": "User-observed engine",
  "location": "Bellevue, WA",
  "device": "desktop",
  "observationDate": "2026-07-16",
  "observedRank": 8,
  "observedCitation": false,
  "citationUrl": "https://example.com/optional-citation",
  "referenceUrl": "https://example.com/optional-reference",
  "screenshotReference": "optional storage reference",
  "notes": "Manual context"
}
```

Requires rank, citation, or both. Device is `desktop`, `mobile`, `tablet`, or `other`; rank is 1–10000. Returns the stored observation with ID and creation time (201).

### `GET /api/visibility-observations?targetUrl=...`

Returns newest-first observations, optionally filtered by normalized target URL.

## Static interface and unknown routes

The root serves `apps/web/public/index.html` plus static JavaScript/CSS. Unknown `/api/*` routes return `ENDPOINT_NOT_FOUND`; other unknown paths follow Express static behavior.

## Persistence validation behavior

Every saved/reopened run must satisfy:

- `runRecordSchema` shape and bounds;
- target-first site/analysis ordering and URL identity;
- comparison rows, eligibility, metrics, evidence, and proposal alignment;
- recomputed comparison equality;
- persisted history equality against a recomputed semantic diff;
- verification equality against recomputation when a baseline exists.

Object equality is recursive and key-order independent; arrays remain order-sensitive. Validation is not weakened to accept malformed records.

## Release 1 analytics connectors and imports

### `GET /api/connectors`

Returns the four offline definitions, their canonical fields/limitations, `release: 1`, and `liveProviderAccess: false`.

### `GET /api/growth/projects`

Returns existing crawl/comparison research project references available to analytics. No analytics-specific project-creation endpoint exists.

### `POST /api/imports/preview`

```json
{
  "connectorId": "search-console-csv",
  "file": { "fileName": "search.csv", "mimeType": "text/csv", "content": "Query,Page,..." }
}
```

Returns headers, up to five safe sample rows, total rows, SHA-256 fingerprint, mapping suggestions, and warnings. It rejects malformed/bounded/prohibited-sensitive files before storage.

### `POST /api/imports`

Accepts `projectId`, `connectorId`, `sourceLabel`, optional account/property labels, the transient file object, and a canonical-to-header `mapping`. Returns 201 with the stored job summary, redacted rejections, and generated-opportunity count. It never returns or stores a copy of the original CSV.

### Import/source reads and deletion

```http
GET    /api/data-sources?projectId=...
GET    /api/imports?projectId=...
GET    /api/imports/:id?projectId=...
DELETE /api/imports/:id?projectId=...
```

Delete removes only import-owned metrics/rejections and metric evidence links. Opportunities, project, unrelated records, and redacted audit history remain.

## Analytics records and Search Performance

`GET /api/metrics?projectId=...` accepts optional `metricType`, `page`, `query`, `dateFrom`, `dateTo`, `device`, and `country` filters.

`GET /api/search-performance?projectId=...` applies the same filters and forces `search-performance` metrics. Rows include query, page, date/range, clicks, impressions, decimal CTR, average position, device, country, source/import IDs, and full lineage.

`GET /api/search-performance/:id?projectId=...` returns imported metrics, matching saved public-page evidence, related public competitor evidence, the deterministic opportunity, exact calculation, action, success metric, and limitations. Missing evidence stays null/empty.

## Opportunity workflow and growth exports

```http
GET   /api/opportunities?projectId=...
GET   /api/opportunities/:id?projectId=...
PATCH /api/opportunities/:id/status?projectId=...
GET   /api/growth/export?projectId=...&format=json|markdown|csv
```

The PATCH body is `{ "status": "reviewed" }`, where status is one of `new`, `reviewed`, `approved`, `rejected`, `implemented`, `monitoring`, or `verified`. Exports contain normalized records, lineage, opportunities, audit summaries, and limitations; CSV output is spreadsheet-formula safe.

Analytics errors use the standard envelope. Expected codes include `INVALID_CSV_FILE`, `CSV_TOO_LARGE`, `CSV_PARSE_ERROR`, `SENSITIVE_DATA_PROHIBITED`, `UNSUPPORTED_CONNECTOR`, `INVALID_ANALYTICS_RECORD`, `DUPLICATE_RECORD`, `PROJECT_NOT_FOUND`, `IMPORT_NOT_FOUND`, `SEARCH_RECORD_NOT_FOUND`, and `OPPORTUNITY_NOT_FOUND`.
