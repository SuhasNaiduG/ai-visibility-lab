# API Reference

The service exposes a local JSON API and the static browser interface on the same origin. The default base URL is `http://localhost:3000`. Requests and responses use UTF-8 JSON unless noted otherwise.

## Shared behavior

- JSON request bodies are limited to 100 KB.
- Request objects are strict: unknown properties are rejected.
- Submitted URLs must be non-empty HTTP or HTTPS values no longer than 2,048 characters.
- URL fragments are removed during normalization. Missing schemes receive `https://`.
- Public-network validation runs before every outbound request and redirect hop.
- Successful analysis and comparison calls return HTTP 200.
- The API does not require an AI key and does not call an AI service.
- The MVP has no authentication or rate limiting and is intended for trusted local use, not direct public exposure.

## Error envelope

Every handled API error has the same shape:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Request validation failed",
    "details": {}
  }
}
```

Stack traces and internal causes are never returned. `details` contains safe validation or crawl evidence when available.

| HTTP | Code | Meaning |
|---:|---|---|
| 400 | `INVALID_REQUEST` | The strict request body/query contract failed. |
| 400 | `INVALID_JSON` | The request body is not valid JSON. |
| 400 | `INVALID_URL` | The URL is empty, malformed, or uses a non-HTTP(S) scheme. |
| 400 | `PRIVATE_NETWORK_TARGET` | A literal or DNS-resolved address is local, private, link-local, reserved, multicast, or otherwise unsafe. |
| 404 | `RUN_NOT_FOUND` | No saved run matches the requested ID or normalized target URL. |
| 404 | `ENDPOINT_NOT_FOUND` | The `/api` route does not exist. |
| 413 | `REQUEST_TOO_LARGE` | The JSON request body exceeds 100 KB. |
| 500 | `RUN_STORE_ERROR` | Run history is corrupt, unsupported, or unavailable. |
| 500 | `INTERNAL_ERROR` | An unexpected internal error crossed the safe API boundary. |
| 502 | `UPSTREAM_FETCH_FAILED` | The public upstream request failed or returned an unusable redirect. |
| 502 | `RESPONSE_TOO_LARGE` | The streamed HTML exceeded the configured byte limit. |
| 502 | `TOO_MANY_REDIRECTS` | The request exceeded the redirect-hop limit. |
| 504 | `FETCH_TIMEOUT` | DNS, headers, redirects, or body streaming exceeded the request deadline. |

## `GET /health`

Checks whether the local Express service is running.

Response:

```json
{
  "status": "ok"
}
```

This is a process-health check. It does not crawl a page or validate the run store.

## `POST /api/analyze`

Fetches and analyzes one public page, checks the conventional root `robots.txt` and `sitemap.xml` URLs, applies deterministic rules, and returns raw evidence.

Request:

```json
{
  "url": "https://425clearaligners.com"
}
```

`url` is required. No other request field is accepted.

The response is an `AnalysisResult` with these groups:

| Group | Important fields |
|---|---|
| Request and fetch | `requestedUrl`, `normalizedUrl`, `statusCode`, `finalUrl`, `responseTimeMs`, `fetchedAt`, `redirectCount`, `redirectObserved`, `redirectChain`, `networkChecks` |
| Root resources | `robotsTxtUrl`, `sitemapXmlUrl`, `robotsTxtAvailable`, `robotsTxtStatusCode`, `sitemapXmlAvailable`, `sitemapXmlStatusCode`, `siteResources` |
| Metadata | `title`, `titleLength`, `metaDescription`, `metaDescriptionLength`, canonical raw/resolved/status/error/count fields, robots fields, `indexability`, language and viewport fields |
| Headings | `h1Count`, `h1Text`, `headingHierarchy`, `totalHeadingCount`, `headingLevelJumps`, `emptyHeadingCount`, `repeatedHeadings` |
| Content | `visibleText`, word/sentence/question counts, `detectedQuestions`, `faqIndicators`, `breadcrumbIndicators`, `directAnswers` |
| Structured data | parsed and raw JSON-LD blocks, `jsonLdParseErrors`, `schemaTypes`, `openGraph`, `twitterCards` |
| Links and media | link counts and records, unique URLs/domains, anchor summaries, empty anchors, images, alt counts and issue evidence |
| Coverage | `coverage.entity`, `service`, `location`, `trust`, `contact`, and `contentSection`, each with terms and source-linked signals |
| Guidance | `findings` with stable rule IDs and `rawEvidence` with field/source/fetch-time provenance |

Every finding contains:

```json
{
  "ruleId": "CANONICAL_MISMATCH",
  "category": "crawl-indexability",
  "problem": "...",
  "evidence": [],
  "whyItMatters": "...",
  "exactImplementation": "...",
  "expectedOutcome": "...",
  "verificationMethod": "...",
  "priority": "high",
  "effort": "low",
  "classification": "observation"
}
```

`classification` is either `observation` or `editorial-heuristic`.

## `POST /api/compare`

Runs the same analyzer against one target and one to three competitors, builds a normalized raw-value matrix, finds transparent differences, compares with the newest prior matching target run, and saves the result.

Request:

```json
{
  "targetUrl": "https://425clearaligners.com",
  "competitorUrls": [
    "https://competitor-one.example",
    "https://competitor-two.example"
  ],
  "queryLabel": "clear aligners Bellevue",
  "rankObservations": {
    "https://425clearaligners.com": 8,
    "https://competitor-one.example": 4
  }
}
```

Validation rules:

- `targetUrl` is required.
- `competitorUrls` must contain one to three values.
- Competitors must be unique after URL normalization.
- The normalized target cannot also be a competitor.
- `queryLabel` is optional, trimmed, and limited to 200 characters.
- `rankObservations` is optional. Keys must normalize to a submitted target or competitor and values must be integer positions from 1 through 1,000.
- Rank observations are labeled manual; the MVP does not collect rankings automatically.

The service creates one stable ordered identity for every submitted URL before analysis starts. The target is input order `0`; competitors remain in request order `1` through `3` even when parallel analysis promises resolve in another order. Each identity contains:

```json
{
  "role": "competitor",
  "inputOrder": 1,
  "inputUrl": "https://competitor-one.example",
  "normalizedUrl": "https://competitor-one.example/",
  "finalUrl": "https://www.competitor-one.example/landing",
  "eligibility": {
    "status": "eligible",
    "usableAsBenchmark": true,
    "reasons": []
  }
}
```

`normalizedUrl` is the normalized submitted identity. `finalUrl` is retrieval evidence and may differ after redirects.

The response is the saved `RunRecord`:

| Field | Meaning |
|---|---|
| `id` | Generated UUID for the run. |
| `createdAt` | ISO timestamp generated by the store. |
| `schemaVersion` | Storage contract version, currently `1`. |
| `applicationVersion` | Application version that wrote the record. |
| `targetUrl`, `competitorUrls` | Normalized submitted site URLs. |
| `sites` | Target-first ordered submitted identities, final URLs, and eligibility; persisted with the run. |
| `queryLabel` | Trimmed label or `null`. |
| `rankObservations` | Normalized manual observations, or an empty object. |
| `analyses` | Complete target and competitor analysis results. |
| `comparison` | Ordered sites, conclusion availability, exclusions, metric definitions, matrix rows, side-by-side evidence, gaps, advantages, competitor-only sets, and limitations. |
| `history` | Identity-aware diff against the newest prior normalized-submitted-target match, or `null` for the first run. |

The comparison intentionally has no aggregate score. A gap or advantage is an observed delta, not a ranking or citation prediction.

### Comparison eligibility and conclusion fields

`comparison.sites` and every matrix row expose `eligibility.status` (`eligible`, `degraded`, or `ineligible`), `usableAsBenchmark`, and evidence-backed reasons. Stable reason codes are `NON_SUCCESS_HTTP`, `ACCESS_DENIED`, `BOT_CHALLENGE`, `CAPTCHA`, `SECURITY_CHECK`, `ERROR_PAGE`, `EMPTY_CONTENT`, `NEAR_EMPTY_CONTENT`, and `MISSING_PAGE_EVIDENCE`.

The classifier treats transport and page usability separately. Non-2xx responses are ineligible. A 2xx response may also be ineligible when its title or bounded visible content is an access-denied, bot/CAPTCHA/security, or error response, or when extracted page evidence is empty/insufficient. Evidence-rich pages under 50 words and certain limited-evidence pages are `degraded` but remain usable.

| Comparison field | Meaning |
|---|---|
| `conclusionStatus` | `complete` when every site is eligible; `partial` when usable conclusions remain but at least one site is degraded/ineligible; `unavailable` when the target or every competitor is unusable. |
| `incompleteMessage` | The exact user-visible message below when any site is ineligible; otherwise `null`. |
| `excludedCompetitorUrls` | Normalized submitted competitor identities retained as raw rows but excluded from all competitive conclusions. |

The exact incomplete message is:

> Comparison incomplete: this website did not return a usable page to the analyzer. Raw retrieval evidence is shown, but it was excluded from competitive conclusions.

All sites remain in `comparison.sites`, `analyses`, and `comparison.matrix`. Ineligible competitors never contribute to scalar/boolean benchmarks, competitor-only sets, gaps, or advantages. If conclusions are `unavailable`, the gap, advantage, and competitor-only arrays are empty.

### Gap and advantage evidence

Every emitted gap/advantage contains non-empty `targetEvidence` and `competitorEvidence`. A competitor evidence bundle adds `normalizedUrl`, `inputOrder`, `observedValue`, `benchmark`, and nested `evidence` to the existing source URL. Nested records contain `sourceUrl`, `field`, `observedValue`, and `fetchedAt`, plus selector/snippet when available. `benchmark: true` identifies the competitor value that satisfies the relevant strongest/lowest/set-membership condition; other usable competitor values remain visible with `benchmark: false`.

### History fields and semantics

History matches the newest prior run by normalized submitted target URL, not by redirected final URL. Per-site changes add `siteKey`, `inputOrder`, `previousSourceUrl`, and `currentSourceUrl` so a final-URL change or competitor reorder does not cross-wire analyses.

`history.competitorChanges.addedUrls` and `removedUrls` describe normalized identity membership. `history.competitorChanges.ordering` contains `previousOrder`, `currentOrder`, `orderChanged`, and `moves`. Reordering is calculated only across identities common to both runs; additions/removals alone do not set `orderChanged`.

When either snapshot for a site is ineligible, only technical retrieval/eligibility changes are compared. Finding differences are placed in `indeterminateRuleIds` instead of `newRuleIds` or `resolvedRuleIds`. If either target snapshot is ineligible, `rankObservationChanges` is empty and `rankComparisonSkippedReason` is `Manual rank changes were not compared because target page eligibility made content correlation indeterminate.`

These identity, eligibility, evidence, and history fields are additive fields on newly saved records and are runtime validated by the JSON store. Existing schema-version-1 local records that predate them are first validated against a bounded legacy shape and normalized from their submitted URL/analysis evidence. When the current comparison or history contract is absent, the store deterministically recomputes it with the current `compareAnalyses` and `diffRuns` behavior before checking identity alignment and validating the current contract. For current comparisons, matrix metrics, target and competitor evidence values, benchmark flags, gap/advantage IDs, missing values, and deltas must agree with a deterministic in-memory recomputation. Current histories must likewise agree with `diffRuns` for the referenced prior record, including observations, findings, membership/order, rank changes, skipped reason, and correlation summary. Current-contract records are preserved unchanged, and reads never rewrite the store. A record that cannot be normalized safely remains a store error; corruption is never silently accepted or overwritten.

## `GET /api/runs`

Lists saved comparison runs newest first. The response is an array of summaries:

```json
[
  {
    "id": "e408eca6-3db7-4158-b8c5-49e1607d6ad9",
    "createdAt": "2026-07-15T02:52:38.000Z",
    "targetUrl": "https://425clearaligners.com/",
    "competitorUrls": ["https://example.com/"],
    "sites": [
      {
        "role": "target",
        "inputOrder": 0,
        "inputUrl": "https://425clearaligners.com",
        "normalizedUrl": "https://425clearaligners.com/",
        "finalUrl": "https://425clearaligners.com/",
        "eligibility": { "status": "eligible", "usableAsBenchmark": true, "reasons": [] }
      },
      {
        "role": "competitor",
        "inputOrder": 1,
        "inputUrl": "https://example.com",
        "normalizedUrl": "https://example.com/",
        "finalUrl": "https://example.com/",
        "eligibility": { "status": "eligible", "usableAsBenchmark": true, "reasons": [] }
      }
    ],
    "queryLabel": null,
    "findingCount": 11,
    "gapCount": 4,
    "hasPreviousRun": true
  }
]
```

The default local file is `data/runs.json`; generated data is ignored by Git.

The summary `sites` array preserves the same target-first identities and eligibility used by the full stored record.

## `GET /api/runs/latest?targetUrl=...`

Returns the newest saved run whose normalized submitted target URL matches the query.

Example:

```http
GET /api/runs/latest?targetUrl=https%3A%2F%2F425clearaligners.com
```

`targetUrl` is required and follows the same 2,048-character URL input boundary. A missing match returns `RUN_NOT_FOUND` with HTTP 404.

## `GET /api/runs/:id`

Returns one complete saved `RunRecord`. The trimmed ID must be non-empty and at most 200 characters. An unknown ID returns `RUN_NOT_FOUND` with HTTP 404.

## Static interface

`GET /` serves `apps/web/public/index.html`; supporting JavaScript and CSS are served from the same directory with a one-hour static cache header. Unmatched `/api` paths use the JSON error envelope. The static interface is a client of the documented API and contains no analyzer rules.

## Operational limits

Default crawler limits are a 10-second end-to-end deadline, five redirects, and 2,000,000 HTML bytes. `REQUEST_TIMEOUT_MS`, `MAX_HTML_BYTES`, `USER_AGENT`, `DATA_DIR`, and `PORT` can be supplied as process environment variables. `.env.example` is a reference file; the application does not load it automatically.
