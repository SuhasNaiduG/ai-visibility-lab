# Architecture

## System boundary

The lab observes public HTTP/HTTPS pages and public site resources. It does not ingest private analytics, call AI services, or infer proprietary ranking systems. Each layer receives typed evidence and returns serializable data.

```text
Presentation
  apps/web/public
        ↓ JSON/HTTP
API and service orchestration
  services/analyzer
        ↓
Crawler policy             Parser + coverage
  packages/crawler          packages/parser + packages/entities
        └──────────────┬──────────────┘
                       ↓
              Deterministic rules
                 packages/rules
                       ↓
            Comparison and history
               packages/comparison
                       ↓
             Storage abstraction
                packages/storage
                       ↓
             Structured response
                       ↓
Future optional providers / interpretation (separate boundaries)
  packages/ranking; no AI layer is implemented
```

## Request flow

### Single-page analysis

1. `POST /api/analyze` validates the JSON shape and input limits.
2. `analyzeUrl()` normalizes the submitted URL.
3. The crawler validates the hostname and every redirect target against the public-network policy, enforces timeout/body limits, and records network/redirect evidence.
4. The parser uses the final resolved URL as its base, extracts deterministic page fields, and preserves invalid JSON-LD evidence.
5. Public `robots.txt` and `sitemap.xml` checks run through the same request policy.
6. Coverage extraction records inspectable terms and their source locations.
7. The rule engine evaluates the combined evidence and emits stable finding IDs.
8. Express serializes the result; failures pass through a safe error mapper with no stack trace.

### Comparison and history

1. `POST /api/compare` validates one target, one-to-three unique competitors, an optional query label, and optional manual rank observations.
2. The service calls the same `analyzeUrl()` function for every site. There is no competitor-specific analyzer.
3. The comparison module projects raw analyses into a normalized metric matrix and applies visible delta thresholds.
4. Target gaps and advantages retain target and competitor evidence. Competitor tactics are observations, not causal recommendations.
5. The store finds the newest previous run whose normalized target URL matches.
6. The history module diffs technical, metadata, schema, heading, content, link/media, finding, competitor, and manual-rank fields.
7. The service saves the complete run atomically and returns it with its historical diff.

## Module responsibilities

### Presentation

`apps/web/public/` contains static HTML, CSS, and browser JavaScript. It submits API requests, displays progress/errors, and renders structured results. It contains no crawler, rule, comparison, or persistence logic.

### API and orchestration

`services/analyzer/app.ts` owns HTTP routes, validation boundaries, static hosting, status mapping, and dependency injection used by tests. `services/analyzer/analyze.ts` composes one crawl. `services/analyzer/compare.ts` composes equal-path analyses, comparison, previous-run diff, and save.

### Crawler

`packages/crawler/request.ts` is the shared outbound policy seam. `safety.ts` classifies literal and resolved IP addresses. `fetch.ts` performs bounded HTML acquisition. `resources.ts` checks site resources and records non-success or network evidence instead of hiding it. `url.ts` retains the foundation normalization behavior.

### Parser, retrieval, and coverage

`packages/parser/page.ts` coordinates DOM extraction; `text.ts` and `links.ts` keep non-trivial deterministic helpers isolated. `packages/entities/` records explicit term signals and source locations. This is inspectable keyword/markup evidence, not semantic AI interpretation.

### Rules

`packages/rules/types.ts` defines `Evidence` and `Finding`. `evaluate.ts` is a pure evaluator: identical evidence produces identical rule IDs and content. Rules distinguish direct observations from editorial heuristics.

### Comparison

`packages/comparison/compare.ts` defines metric explanations and visible gap/advantage thresholds. `diff.ts` compares stored runs. No hidden weighting or aggregate score exists.

### Storage

`packages/storage/types.ts` is the persistence port. `json-run-store.ts` is the local adapter. It creates directories, validates the file/schema, serializes writes, writes a temporary file, and renames it into place. Corrupt data is reported and never silently overwritten.

### Future provider seams

`packages/ranking/types.ts` defines an optional rank-provider interface while the MVP accepts manual observations. A future AI interpretation layer must consume deterministic outputs without changing or replacing raw evidence, and must be separately configured and labeled.

## Security and operational choices

- Only HTTP and HTTPS are accepted.
- Localhost, private, loopback, link-local, reserved, multicast, and mixed public/private DNS answers are rejected.
- Redirects are followed manually and each target is revalidated.
- HTML is streamed with a maximum byte limit and timeout.
- JSON request bodies have a practical size limit.
- Browser errors contain stable codes/details, never stack traces or internal causes.
- Generated run data and real `.env` files are ignored by Git.

Native fetch does not expose a supported way to pin a connection to the address just validated by DNS. The policy materially reduces SSRF risk but retains a narrow DNS-rebinding time-of-check/time-of-use limitation. Production deployment should also enforce network egress rules.

The HTTP service has no authentication, authorization, rate limiting, or work queue and is therefore a trusted-local application boundary. Static-source parsing does not execute page JavaScript, apply an HTML `base` element, or fully model CSS/layout visibility. Acquisition currently accepts a bounded upstream body without enforcing `Content-Type`. Root resources are availability checks at conventional paths, not content-validating robots/sitemap parsers. These are explicit extension points, not implied production guarantees.
