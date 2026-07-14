# Deterministic MVP Change Report

## Report basis

- Repository: `ai-visibility-lab` (the existing repository; no duplicate repository was created)
- Foundation checkpoint: `354df4c feat: establish deterministic analyzer foundation`
- Final code checkpoint before documentation: `00f35e3 fix: close final evidence audit gaps`
- Report date: 2026-07-15
- Master handoff archive: `AI_Visibility_Lab_GPT_Work_Handoff.zip`
- Archive SHA-256: `0E4BBA1FA072113E27B58D6A10F7A9B9CC046FB7336A41BFB27A18A84F7E7202`
- Implementation policy: deterministic public evidence first; no AI API, synthetic visibility score, automatic ranking collection, or causation claim

The repository, all foundation source/tests/documentation, the two specification documents in the handoff archive, and the complete Git history were reviewed before implementation. The checkpoint was clean and the foundation suite passed before changes began.

## Outcome

The checkpoint is now a locally runnable deterministic MVP that:

1. validates and safely fetches a public page;
2. extracts structured, source-linked technical/content evidence;
3. applies 34 stable explainable rules;
4. compares one target with one to three competitors through the identical analyzer;
5. exposes 43 raw comparison metrics and structured threshold deltas;
6. accepts optional manual rank observations without pretending to collect rankings;
7. persists full comparison runs in a validated atomic local JSON store;
8. diffs a later run against the newest matching target run;
9. exposes health, analysis, comparison, and history APIs;
10. provides a responsive browser workflow for analysis, comparison, evidence, limitations, and saved history.

No new repository, duplicate README, AI provider, SERP provider, database service, or external analytics connector was introduced.

## Architecture flow

```text
Browser (static HTML/CSS/JS)
  → strict Express request boundary
    → single-site orchestration
      → URL normalization
      → literal/DNS public-network validation
      → bounded request + per-hop redirect validation
      → deterministic HTML parsing
      → conventional robots.txt / sitemap.xml checks
      → inspectable coverage extraction
      → pure deterministic rule evaluation
    → optional equal-path target/competitor projection
      → 43-metric raw matrix
      → structured threshold deltas, gaps, and advantages
      → newest prior target lookup
      → explicit historical field/finding/rank diff
      → validated temporary write + atomic JSON rename
  ← structured JSON with raw evidence and limitations
```

Layer ownership:

- `packages/crawler/`: URL/network acquisition policy and evidence
- `packages/parser/`: page, text, link, markup, and media extraction
- `packages/entities/`: conservative source-linked coverage patterns
- `packages/rules/`: stable findings and evidence contracts
- `packages/comparison/`: metrics, deltas, gaps, advantages, and historical diff
- `packages/ranking/`: manual validation and an unimplemented future-provider contract
- `packages/storage/`: persistence port and local JSON adapter
- `packages/schemas/`: strict HTTP input contracts
- `services/analyzer/`: orchestration and HTTP presentation
- `apps/web/public/`: presentation only; no analysis rules

## Endpoints

| Method | Path | Contract and result |
|---|---|---|
| `GET` | `/health` | Returns `{ "status": "ok" }`. |
| `POST` | `/api/analyze` | Strict body `{ url }`; returns the complete analysis, findings, raw evidence, request/resource evidence, and limitations implicit in the fields. |
| `POST` | `/api/compare` | Strict target + one-to-three unique competitors, optional 200-character query label, and optional manual positions 1–1,000; returns and saves a full `RunRecord`. |
| `GET` | `/api/runs` | Returns newest-first run summaries. |
| `GET` | `/api/runs/latest?targetUrl=...` | Returns the newest saved run matching the normalized target URL. |
| `GET` | `/api/runs/:id` | Returns one full saved run. |
| `GET` | `/` | Serves the local browser interface. |

Handled failures use `{ error: { code, message, details } }`. Statuses are 400 for validation/unsafe target, 404 for unknown run/endpoint, 413 for an oversized JSON body, 500 for store/internal failures, 502 for upstream/size/redirect failures, and 504 for timeout. No stack trace or internal cause is serialized. The complete contract is in `docs/api.md`.

## Acquisition and evidence rules

### Network policy

- HTTP/HTTPS only; fragments are removed and missing schemes receive HTTPS.
- Literal and DNS-resolved loopback, private, link-local, reserved, multicast, unspecified, and mixed public/non-public answers are rejected.
- Every redirect `Location` is resolved and revalidated before following.
- Default end-to-end deadline: 10,000 ms.
- Default redirect limit: five hops.
- Default HTML limit: 2,000,000 streamed bytes.
- Default user agent: `AI-Visibility-Lab/1.0`.
- HTML, `robots.txt`, and `sitemap.xml` use the same policy and injectable fetch/DNS seams.
- Stable crawler codes: `INVALID_URL`, `PRIVATE_NETWORK_TARGET`, `FETCH_TIMEOUT`, `RESPONSE_TOO_LARGE`, `TOO_MANY_REDIRECTS`, and `UPSTREAM_FETCH_FAILED`.

### Extracted evidence

- request/final URL, HTTP status, response time, timestamp, redirect chain, and network checks;
- title/description values and lengths;
- canonical raw value, resolved URL, relationship, error, and element count;
- robots directives and an explicit indexability interpretation;
- document language and viewport;
- every H1–H6 item, empty headings, level jumps, and normalized repetition;
- normalized static visible text, word/sentence/question counts, question text, FAQ/breadcrumb indicators, and direct-answer pairs;
- parsed JSON-LD, raw blocks, parse errors, recursive schema types, Open Graph, and Twitter card data;
- resolved links, exact-host classification, unique destinations/domains, anchor summaries, and empty anchors;
- images, resolved sources, alt values, and missing/empty-alt issues;
- entity, service, location, trust, contact, and content-section terms with source fields, selectors/snippets, method, and heuristic flags;
- conventional root robots/sitemap availability, status, redirect, network, and failure evidence.

### Stable deterministic rules (34)

| Rule ID | Trigger | Classification |
|---|---|---|
| `HTTP_NON_2XX` | Page status is outside 200–299. | observation |
| `REDIRECT_OBSERVED` | One or more redirect hops were recorded. | observation |
| `ROBOTS_TXT_MISSING` | Conventional root robots check is not available. | observation |
| `SITEMAP_XML_MISSING` | Conventional root sitemap check is not available. | observation |
| `INDEXABILITY_NOINDEX` | Parsed robots directives explicitly contain `noindex`. | observation |
| `CANONICAL_MISSING` | No canonical element is observed. | observation |
| `CANONICAL_MISMATCH` | Resolved canonical differs from final URL. | observation |
| `CANONICAL_INVALID` | Canonical is empty, malformed, or unsupported. | observation |
| `TITLE_MISSING` | No non-empty title. | observation |
| `TITLE_LENGTH_SHORT` | Title is shorter than the transparent 30-character review range. | editorial heuristic |
| `TITLE_LENGTH_LONG` | Title exceeds the transparent 60-character review range. | editorial heuristic |
| `META_DESCRIPTION_MISSING` | No non-empty description. | observation |
| `META_DESCRIPTION_LENGTH_SHORT` | Description is shorter than the transparent 70-character review range. | editorial heuristic |
| `META_DESCRIPTION_LENGTH_LONG` | Description exceeds the transparent 160-character review range. | editorial heuristic |
| `DOCUMENT_LANGUAGE_MISSING` | Root HTML has no non-empty language value. | observation |
| `VIEWPORT_MISSING` | No viewport meta element. | observation |
| `HEADING_MISSING_H1` | H1 count is zero. | observation |
| `HEADING_MULTIPLE_H1` | More than one H1 is observed; responsive intent must be reviewed. | observation |
| `HEADING_EMPTY` | At least one heading has no normalized text. | observation |
| `HEADING_LEVEL_JUMP` | Adjacent heading levels increase by more than one. | observation |
| `HEADING_REPEATED_TEXT` | Normalized heading text repeats. | observation |
| `JSONLD_MISSING` | No JSON-LD block. | observation |
| `JSONLD_INVALID` | At least one JSON-LD block fails parsing. | observation |
| `IDENTITY_SCHEMA_MISSING` | An identity-relevant home page lacks an Organization/LocalBusiness-style type. | editorial heuristic |
| `BREADCRUMB_SCHEMA_MISSING` | A non-home page has visible breadcrumb evidence but no `BreadcrumbList`. | editorial heuristic |
| `INTERNAL_LINKS_MISSING` | No crawlable internal HTTP(S) link. | observation |
| `INTERNAL_LINKS_LOW` | One or two internal links; transparent review threshold. | editorial heuristic |
| `IMAGE_ALT_MISSING` | One or more image alt values are missing or empty; decorative intent must be reviewed. | observation |
| `EMPTY_ANCHOR_TEXT` | A crawlable link has no text content; accessible-name context must be reviewed. | observation |
| `DIRECT_ANSWER_MISSING` | Questions exist but no detected nearby/direct answer. | editorial heuristic |
| `ENTITY_COVERAGE_MISSING` | Business-relevant signals exist without a supported explicit entity signal. | editorial heuristic |
| `SERVICE_COVERAGE_MISSING` | A content-rich relevant home page lacks supported explicit service terms. | editorial heuristic |
| `LOCATION_COVERAGE_MISSING` | Local-business schema exists without an extracted location. | editorial heuristic |
| `CONTACT_SIGNALS_MISSING` | Local-business schema exists without an extracted contact signal. | editorial heuristic |

Every finding includes `ruleId`, category, problem, structured evidence, context, exact implementation direction, expected outcome, verification method, priority, effort, and classification.

## Comparison model

### Raw matrix metrics (43)

| Group | Metrics |
|---|---|
| Retrieval (8) | `statusCode`, `redirectCount`, `indexable`, `indexabilityStatus`, `robotsTxtAvailable`, `robotsTxtStatusCode`, `sitemapXmlAvailable`, `sitemapXmlStatusCode` |
| Metadata (9) | `hasTitle`, `titleLength`, `hasMetaDescription`, `descriptionLength`, `canonicalMatches`, `canonicalStatus`, `hasLanguage`, `documentLanguage`, `viewportPresent` |
| Headings (6) | `h1Count`, `h1StructureValid`, `totalHeadingCount`, `headingJumpCount`, `emptyHeadingCount`, `repeatedHeadingCount` |
| Content/answerability (4) | `wordCount`, `questionCount`, `faqIndicatorCount`, `directAnswerCount` |
| Structured data (2) | `schemaTypeCount`, `jsonLdParseErrorCount` |
| Links/media (7) | `internalLinkCount`, `externalLinkCount`, `uniqueInternalUrlCount`, `uniqueExternalDomainCount`, `imageCount`, `imagesMissingAltCount`, `emptyAnchorCount` |
| Coverage (7) | `topicTermCount`, `serviceTermCount`, `locationTermCount`, `hasIdentitySignals`, `hasTrustSignals`, `hasContactSignals`, `hasLocationSignals` |

`topicTermCount` is explicitly defined as the union of inspected content-section, service, entity, and location terms. It is not a semantic topic model.

### Transparent delta logic

Scalar gaps/advantages return a structured `delta` containing target value, strongest relevant competitor benchmark, positive difference magnitude, threshold, and direction. Boolean gaps/advantages return target/benchmark booleans and an explicit present/absent direction. Set gaps preserve the observed missing values and evidence rather than forcing a numeric delta.

| Scalar rule | Minimum difference | Direction treated as a target gap |
|---|---:|---|
| `GAP_HEADING_COVERAGE` | 2 | target lower |
| `GAP_CONTENT_BREADTH` | 100 | target lower |
| `GAP_QUESTION_COVERAGE` | 1 | target lower |
| `GAP_DIRECT_ANSWERS` | 1 | target lower |
| `GAP_INTERNAL_LINKS` | 3 | target lower |
| `GAP_IMAGE_ALT` | 1 | target higher |
| `GAP_HEADING_JUMPS` | 1 | target higher |
| `GAP_EMPTY_HEADINGS` | 1 | target higher |
| `GAP_REPEATED_HEADINGS` | 1 | target higher |
| `GAP_JSONLD_ERRORS` | 1 | target higher |
| `GAP_EMPTY_ANCHORS` | 1 | target higher |
| `GAP_SERVICE_CLARITY` | 1 | target lower |
| `GAP_LOCATION_CLARITY` | 1 | target lower |

Boolean gap IDs are `GAP_INDEXABILITY`, `GAP_TITLE_MISSING`, `GAP_DESCRIPTION_MISSING`, `GAP_CANONICAL_MISMATCH`, `GAP_LANGUAGE_MISSING`, `GAP_VIEWPORT_MISSING`, `GAP_H1_STRUCTURE`, `GAP_FAQ_STRUCTURE`, `GAP_IDENTITY_SIGNALS`, `GAP_TRUST_SIGNALS`, `GAP_CONTACT_SIGNALS`, and `GAP_LOCATION_SIGNALS`.

Set gap IDs are `GAP_COMPETITOR_ONLY_SCHEMA`, `GAP_COMPETITOR_ONLY_TOPICS`, and `GAP_COMPETITOR_ONLY_QUESTIONS`. Case-normalized comparisons prevent schema casing alone from being treated as a historical addition/removal. Recommendations say to validate relevance, write original content, and never fabricate claims, reviews, ratings, credentials, addresses, or locations.

No metric is weighted into an overall score. Every result repeats that observed differences do not prove ranking, citation eligibility, or causation.

## Run storage and history logic

### Persistence

- Contract: `RunStore` in `packages/storage/types.ts`.
- Adapter: `JsonRunStore` in `packages/storage/json-run-store.ts`.
- Default file: `data/runs.json`; schema version `1`; application version `1.0.0`.
- Every saved/read record is runtime validated, including URLs, findings/evidence, analyses, comparison, history, and manual rank range.
- Corrupt JSON, structurally invalid records, unsupported schema, invalid new records, and I/O failure produce stable store errors; corrupt data is not silently overwritten.
- Writes are serialized per adapter instance, written to a unique temporary file, renamed atomically, and cleaned after failure.
- Newest-first ordering uses timestamp and append index, so equal timestamps select the later record.

### Prior-run matching and changes

The newest saved run with the same normalized target URL is the baseline. A different competitor set does not prevent target history; added and removed competitor URLs are reported.

Tracked technical fields: status, final URL, redirects, robots/sitemap availability and status, and indexability interpretation.

Tracked metadata fields: title/length, description/length, canonical value/status, robots meta, language, and viewport.

Tracked schema/structure/content fields: JSON-LD parse errors; case-insensitive schema additions/removals; H1 text/count, complete heading hierarchy/count, jumps, empty/repeated headings; word/sentence/question counts and question text; FAQ/breadcrumb/direct-answer evidence; and complete coverage dimensions.

Tracked links/media fields: internal/external counts, unique internal/external destinations and counts, external domains/count, anchor summaries, empty anchors, image count, missing-alt count, and alt-issue evidence.

Stable finding IDs are separated into new, resolved, and unchanged sets. Manual rank observations are separated into added, removed, and changed; `delta = current - previous`, so a negative value is movement toward position 1.

Rank changes are compared only when normalized query labels match. If they differ, technical history remains available and the rank comparison is explicitly skipped. When both a site change and manual rank change occur, the correlation summary says only that they co-occurred and never attributes cause.

## Verification results

### Foundation checkpoint

- Worktree: clean at `354df4c`.
- Tests: 3 test files, 18 tests passed.
- Strict TypeScript build: passed.

### Final automated gate

- `npm test`: 16 test files passed; 83 tests passed.
- `npm run build`: passed with strict `tsc` and no emitted diagnostic.
- `node --check apps/web/public/app.js`: passed.
- `git diff --check`: passed.
- `npm run dev`: service started successfully.
- `GET http://127.0.0.1:3000/health`: returned `{"status":"ok"}`.
- The temporary development service was stopped after verification.

Test coverage spans URL normalization, address/DNS safety, redirect validation, timeout, body size, site resources, page/coverage evidence, rules, fixture before/after resolved and unchanged findings, multi-competitor benchmarking, structured deltas, query-aware rank history, rank additions/removals, schema casing, store validation/ordering/cleanup, service orchestration, strict API validation, error statuses, 100 KB payload rejection, and static-interface delivery.

### Live browser verification

A local compiled service was exercised through the browser interface:

- `https://425clearaligners.com` single-site analysis completed and rendered metadata, retrieval, headings, content, structured data, links/media, findings, and raw evidence.
- Target `https://425clearaligners.com` versus competitor `https://example.com` completed through the same analyzer and rendered the full matrix, gaps, advantages, coverage differences, and limitations.
- A second matching comparison was saved; the prior run ID and categorized historical diff rendered.
- Run history listed both records and the newest saved run reopened successfully.
- Browser warning/error log: empty.

The optional-slot rank-pairing edge case found in final code review was corrected afterward and is protected by the strict request/rank regression suite plus JavaScript syntax validation. The project does not yet include an automated DOM/browser test harness.

## Focused commits

| Commit | Purpose | Gate before commit |
|---|---|---|
| `354df4c` | Verified deterministic foundation checkpoint. | 18 tests and build passed at review. |
| `58d9885` | Harden shared crawler request policy and reproducibility. | Full then-current tests and build passed. |
| `74958ac` | Add comparison, historical diff, rank contract, and JSON storage. | Full then-current tests and build passed. |
| `8360a8e` | Add expanded evidence, coverage, rules, schemas, APIs, services, and verification fixtures. | 16 files / 79 tests and build passed. |
| `8ceb833` | Add the minimal analysis/comparison/history interface. | 16 files / 79 tests and build passed. |
| `00f35e3` | Close final audit gaps: slot/rank pairing, structured deltas, expanded history, validation accuracy, schema normalization, UI evidence, and regressions. | 16 files / 83 tests and build passed. |
| documentation commit | Add README and complete architecture/API/methodology/decision/file-map/change handoff; append the existing journal. | Full final tests and build are rerun immediately before commit. The exact hash is reported in the completion response because a commit cannot contain its own hash. |

## All created files

### Configuration, presentation, data marker, and docs

- `.env.example` — environment-variable reference
- `README.md` — single project overview/setup/capabilities/limits/roadmap
- `apps/web/public/index.html` — workflow forms and accessible result regions
- `apps/web/public/app.js` — API client, progress/errors, structured rendering, history interaction
- `apps/web/public/styles.css` — responsive visual system
- `data/.gitkeep` — tracks the generated-data directory only
- `docs/architecture.md` — boundaries and runtime flow
- `docs/api.md` — route, request, response, error, and limit reference
- `docs/change-report.md` — this checkpoint-to-MVP handoff
- `docs/decision-log.md` — architecture decisions and trade-offs
- `docs/file-map.md` — exact ownership and future-edit locations
- `docs/methodology.md` — evidence classes, heuristics, comparison/history method, unknowns

### Verification fixtures

- `fixtures/verification/original.html`
- `fixtures/verification/corrected.html`

### Packages and services

- `packages/comparison/compare.ts`
- `packages/comparison/diff.ts`
- `packages/comparison/types.ts`
- `packages/crawler/errors.ts`
- `packages/crawler/request.ts`
- `packages/crawler/safety.ts`
- `packages/entities/extract.ts`
- `packages/entities/types.ts`
- `packages/parser/links.ts`
- `packages/parser/text.ts`
- `packages/ranking/types.ts`
- `packages/rules/evaluate.ts`
- `packages/rules/index.ts`
- `packages/rules/types.ts`
- `packages/schemas/api.ts`
- `packages/storage/json-run-store.ts`
- `packages/storage/types.ts`
- `services/analyzer/compare.ts`

### Tests and helpers

- `tests/analyzer/analyze.test.ts`
- `tests/analyzer/compare.test.ts`
- `tests/comparison/compare.test.ts`
- `tests/comparison/diff.test.ts`
- `tests/crawler/fetch.test.ts`
- `tests/crawler/resources.test.ts`
- `tests/crawler/safety.test.ts`
- `tests/entities/extract.test.ts`
- `tests/helpers/analysis.ts`
- `tests/parser/evidence.test.ts`
- `tests/ranking/types.test.ts`
- `tests/rules/evaluate.test.ts`
- `tests/storage/json-run-store.test.ts`
- `tests/verification/before-after.test.ts`

## All modified foundation files

- `docs/build-journal.md` — preserved the complete foundation journal and appended verified MVP milestones
- `package.json` — restored locked dependency declarations, scripts, and Node engine
- `package-lock.json` — synchronized manifest metadata
- `packages/crawler/fetch.ts` — bounded shared request result and redirect/network evidence
- `packages/crawler/resources.ts` — shared policy and resource evidence
- `packages/parser/page.ts` — expanded deterministic page evidence
- `services/analyzer/analyze.ts` — complete analysis orchestration and raw evidence
- `services/analyzer/app.ts` — API routes, validation, static serving, and error boundary
- `tests/analyzer/app.test.ts` — expanded API, error, payload, history, and static-interface verification
- `tsconfig.json` — includes all package/service/test TypeScript in strict build

The foundation `.gitignore`, `packages/crawler/url.ts`, `services/analyzer/index.ts`, `tests/crawler/url.test.ts`, `tests/parser/page.test.ts`, and `vitest.config.ts` remain present and were not modified.

## Complete, partial, and deferred inventory

### Complete in this MVP

- public URL normalization and bounded same-policy acquisition;
- material SSRF controls and redirect-hop validation;
- expanded direct evidence extraction and source provenance;
- stable deterministic findings with executable verification guidance;
- equal-path one-to-three competitor comparison;
- raw matrix, structured deltas, evidence-backed gaps/advantages, and explicit limitations;
- optional manual rank observations and future provider interface;
- validated atomic local run persistence and query-aware history;
- safe API, local browser interface, documentation, fixtures, and 83-test gate;
- no AI API and no aggregate visibility score.

### Partial by explicit design

- The crawler analyzes one submitted page per site plus two root resources, not an entire site.
- Visible text is a deterministic static-source approximation; it cannot fully model CSS/layout visibility, JavaScript rendering, shadow DOM, or client hydration.
- Relative URL resolution does not currently apply an HTML `<base>` element.
- Any bounded response body can reach the HTML parser; upstream `Content-Type` is not yet gated.
- Robots/sitemap availability means a 2xx response at the conventional root path; content is not validated and robots-declared sitemap locations are not discovered.
- Internal links use exact hostname equality; apex, `www`, and subdomains are distinct.
- Indexability covers response success plus parsed meta directives, not `X-Robots-Tag`, full robots policy, authentication, or actual external-index state.
- Coverage is conservative lexical/structured evidence, not semantic interpretation. Phone-like text is explicitly marked heuristic.
- Comparison uses transparent raw counts. Missing-alt direction is a count rather than a ratio, so image volume must be reviewed alongside it.
- Ranks are optional, manual, and unverified. Historical correlation remains observational.
- History tracks the explicit inventory above, not every raw response byte or social field.
- Browser behavior was verified manually; there is no automated DOM/browser test suite.
- JSON persistence is appropriate for a local single-process demonstration only.

### Deferred

- JavaScript-rendering browser crawler and robots-aware multi-page/site crawl budgets;
- response content-type enforcement, `<base>` support, robots parsing, and sitemap discovery/validation;
- connection pinning plus deployment-level egress rules to close DNS-rebinding TOCTOU;
- authentication, authorization, rate limits, queues, and production hosting controls;
- SQLite/PostgreSQL adapter, transaction-safe prior lookup/save, migrations, pagination, retention, recovery, and size limits;
- verified automatic rank/SERP provider and owned-site Search Console integration;
- first-party analytics, backlink/off-page sources, conversions, and revenue;
- optional AI interpretation layer after deterministic maturity;
- any claim of ranking/citation causation or a proprietary visibility score.

## Security, operational, and data limitations

- DNS answers are validated immediately before native fetch, but native fetch resolves again; a residual DNS-rebinding time-of-check/time-of-use window remains. Production needs connection pinning and egress controls.
- The API has no auth or rate limit and must remain on a trusted local interface unless those controls are added.
- Per-instance store serialization does not coordinate multiple processes/adapters. Prior lookup and save are not one transaction, so concurrent comparisons can share a prior baseline.
- There is no run pagination, retention, migration, or production recovery workflow.
- Saved runs contain complete public-page evidence, including visible text. Although sourced publicly, generated history should still be treated as local application data.
- Live public pages can change between runs; results describe the fetched response at `fetchedAt` only.

## Exact future-edit locations

- Network/SSRF/redirect/timeout policy: `packages/crawler/request.ts`, `safety.ts`, `fetch.ts`, `errors.ts`
- Resource parsing/discovery: `packages/crawler/resources.ts`
- New observed page fields: `packages/parser/page.ts`; text rules in `text.ts`; link/base-host behavior in `links.ts`
- Coverage heuristics: `packages/entities/extract.ts` plus `types.ts`
- Finding contracts/triggers: `packages/rules/types.ts` and `evaluate.ts`
- Metric definitions/thresholds/deltas: `packages/comparison/compare.ts` and `types.ts`
- Historical field inventory/query/rank correlation: `packages/comparison/diff.ts`
- Rank provider: implement `RankObservationProvider` from `packages/ranking/types.ts` in a new adapter
- Storage replacement: implement `RunStore` from `packages/storage/types.ts`; inject through `services/analyzer/app.ts`/`compare.ts`
- Request contract/routes: `packages/schemas/api.ts` and `services/analyzer/app.ts`
- Single-site orchestration/raw evidence: `services/analyzer/analyze.ts`
- Comparison/save orchestration: `services/analyzer/compare.ts`
- Browser fields/rendering: `apps/web/public/index.html`, `app.js`, and `styles.css`
- Future AI interpretation: create `packages/interpretation/` after deterministic outputs, call it only after analysis/comparison, preserve evidence unchanged, and expose it as a separately labeled opt-in response. Exact contract/test/doc guidance is in `docs/file-map.md`.

`docs/file-map.md` is the maintained ownership map and should be updated whenever a boundary moves.
