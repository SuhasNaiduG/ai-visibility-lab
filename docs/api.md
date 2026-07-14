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

The response is the saved `RunRecord`:

| Field | Meaning |
|---|---|
| `id` | Generated UUID for the run. |
| `createdAt` | ISO timestamp generated by the store. |
| `schemaVersion` | Storage contract version, currently `1`. |
| `applicationVersion` | Application version that wrote the record. |
| `targetUrl`, `competitorUrls` | Normalized submitted site URLs. |
| `queryLabel` | Trimmed label or `null`. |
| `rankObservations` | Normalized manual observations, or an empty object. |
| `analyses` | Complete target and competitor analysis results. |
| `comparison` | Metric definitions, matrix rows, gaps, advantages, competitor-only sets, and limitations. |
| `history` | Diff against the newest prior matching target run, or `null` for the first run. |

The comparison intentionally has no aggregate score. A gap or advantage is an observed delta, not a ranking or citation prediction.

## `GET /api/runs`

Lists saved comparison runs newest first. The response is an array of summaries:

```json
[
  {
    "id": "e408eca6-3db7-4158-b8c5-49e1607d6ad9",
    "createdAt": "2026-07-15T02:52:38.000Z",
    "targetUrl": "https://425clearaligners.com/",
    "competitorUrls": ["https://example.com/"],
    "queryLabel": null,
    "findingCount": 11,
    "gapCount": 4,
    "hasPreviousRun": true
  }
]
```

The default local file is `data/runs.json`; generated data is ignored by Git.

## `GET /api/runs/latest?targetUrl=...`

Returns the newest saved run whose normalized target URL matches the query.

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
