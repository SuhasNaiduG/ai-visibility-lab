# Change Report

Date: 2026-07-17

Repository: `C:\Users\User_2\Documents\Projects\ai-visibility-lab`

Branch: `rooz-final-demo`

Verified foundation: `354df4c`

## Outcome

The repository is now a deterministic AI visibility research and comparison MVP covering:

```text
Observe -> Measure -> Analyze -> Compare -> Propose -> Verify -> Monitor
```

Users can run bounded site projects, inspect page/site evidence, compare a target with up to five competitors, review exact differences and implementation artifacts, reopen/export saved work, verify a later run, record manual visibility observations, inspect a versioned research registry, and deploy one durable SQLite-backed instance. No AI API, rank provider, synthetic visibility score, ranking guarantee, fabricated production record, or weakened validation was introduced.

## Release 1 growth intelligence completion

Release 1 adds offline aggregate analytics connectors while preserving every existing research feature. It implements CSV preview/mapping, normalized metrics, end-to-end lineage, Search Performance, public/competitor evidence linkage, deterministic opportunities, review workflow, controlled deletion, and growth exports. No dependency, live network connector, OAuth flow, credential/token store, original-file retention, generated analytics value, or persistent database migration was introduced.

### Architecture flow

```text
existing crawl/comparison -> research_projects.id
  -> offline connector definition (`liveAccess: false`)
    -> bounded CSV preview + canonical mapping
      -> row validation + redacted rejection
        -> normalized metric + lineage + stable duplicate hashes
          -> strict atomic JSON OR migration-002 SQLite transaction
            -> Data Explorer / Search Performance filters
              -> latest saved public-page + public competitor evidence
                -> versioned deterministic opportunity
                  -> persisted workflow status + JSON/Markdown/CSV export
```

`research_projects` remains canonical. Migration 002 does not add `growth_projects` or any parallel identity. SQLite references the existing project foreign key directly. JSON stores validated references to IDs created by the existing crawl/comparison flow and generates no analytics project ID.

### Connector and lineage contracts

| Connector | Normalized record | Required fields |
| --- | --- | --- |
| Search Console CSV | `search-performance` | query, page, date, clicks, impressions, ctr, averagePosition |
| Web Analytics CSV | `web-analytics` | page, date, sessions |
| Campaign CSV | `campaign-performance` | campaign, date, spend, clicks, conversions |
| Lead Summary CSV | `lead-summary` | source, date, leads, qualifiedLeads |

Each accepted record keeps project/source/import IDs, connector/version, `csv` method, source-record and normalized SHA-256 hashes, imported/source dates, transformation version, validation status, confidence, and limitations. Original CSV content and rejected values never reach either store.

### Schema and deletion behavior

Migration 002 adds `connector_sources`, `import_jobs`, `import_rejections`, `metric_records`, `opportunities`, `opportunity_evidence`, and `analytics_audit_events`. Tables and indexes are project-scoped. SQLite foreign-key enforcement is enabled and asserted.

Deleting an import removes its rejections, exclusively owned metrics, and metric-backed opportunity link rows. It does not delete the project, source, opportunity, unrelated metric, or audit event. The retained deletion audit contains only safe IDs/counts. JSON performs the same relationship checks and deletion algorithm.

### CSV and privacy controls

- `.csv` plus allowlisted MIME type; 2 MB, 10,000-row, 100-column, and 10,000-character cell limits;
- quoted fields/commas/CRLF/BOM support and strict header/column validation;
- manual mapping with connector-specific required/optional canonical fields;
- strict ISO dates, HTTP(S) pages, finite non-negative values, whole counts, and rate/cross-field checks;
- formula-like cell rejection and spreadsheet-safe CSV export escaping;
- whole-file rejection for credential/token, direct-identifier, patient/health, form/free-text, or call-data columns;
- row rejections retain only row number, code, canonical field, and generic reason;
- deterministic within-file/across-import duplicate protection plus database uniqueness race protection.

### Search Performance and evidence detail

The table visibly includes Query, Page, Date/range, Clicks, Impressions, CTR, Average position, Device, Country, and Import source. Filters cover page, query, date-from/date-to, device, and country.

Opening a row shows, in order: imported Search Console metrics; matching public website evidence; related public competitor evidence; deterministic opportunity; exact calculation; proposed action; success metric; and limitation. Exact normalized URL is used for page matching against the latest saved target run. Query-term overlap selects only actually observed competitor topics/questions/gap IDs. Missing evidence remains null/empty and explicit.

### Opportunity rules and comparison metrics

Release 1 adds nine transparent rules:

- `SEARCH_HIGH_IMPRESSIONS_LOW_CTR`: impressions >= 100 and CTR < 3%;
- `SEARCH_STRONG_POSITION_LOW_CTR`: impressions >= 50, position <= 5, CTR < 3%;
- `SEARCH_PAGE_TWO_DEMAND`: impressions >= 50 and 10 < position <= 20;
- `SEARCH_QUERY_MULTIPLE_PAGES`: same query/date/device/country on >1 page and total impressions >= 100;
- `ENGAGEMENT_HIGH_TRAFFIC_WEAK_ENGAGEMENT`: sessions >= 100 and engagement < 40%;
- `ENGAGEMENT_HIGH_TRAFFIC_LOW_CONVERSION`: sessions >= 100 and conversions/sessions < 1%;
- `ENGAGEMENT_LOW_TRAFFIC_STRONG_CONVERSION`: 0 < sessions < 50 and conversions/sessions >= 5%;
- `CAMPAIGN_SPEND_WITHOUT_CONVERSION`: spend >= 100 source-currency units and zero conversions;
- `LEAD_VOLUME_LOW_QUALIFICATION`: leads >= 20 and qualified/leads < 25%.

Every opportunity stores observation, exact calculation/threshold, action, later comparable-import success metric, limitation, source metric IDs, priority/category, stable group key, rule version `1.0.0`, and workflow status. These are review flags—not a composite score, forecast, attribution, or causal claim. The existing 43 public-page comparison metrics and history/verification logic are unchanged.

### New endpoints

```text
GET    /api/connectors
GET    /api/growth/projects
POST   /api/imports/preview
POST   /api/imports
GET    /api/imports?projectId=...
GET    /api/imports/:id?projectId=...
DELETE /api/imports/:id?projectId=...
GET    /api/data-sources?projectId=...
GET    /api/metrics?projectId=...&metricType=...&page=...&query=...&dateFrom=...&dateTo=...&device=...&country=...
GET    /api/search-performance?projectId=...&page=...&query=...&dateFrom=...&dateTo=...&device=...&country=...
GET    /api/search-performance/:id?projectId=...
GET    /api/opportunities?projectId=...
GET    /api/opportunities/:id?projectId=...
PATCH  /api/opportunities/:id/status?projectId=...
GET    /api/growth/export?projectId=...&format=json|markdown|csv
```

### Release 1 files created

```text
docs/csv-imports.md
docs/data-connectors.md
docs/opportunity-model.md
docs/privacy-and-security.md
packages/analytics/api-schemas.ts
packages/analytics/connectors.ts
packages/analytics/csv.ts
packages/analytics/detail.ts
packages/analytics/import-service.ts
packages/analytics/json-analytics-store.ts
packages/analytics/migrations/002_analytics_connectors.sql
packages/analytics/opportunities.ts
packages/analytics/report.ts
packages/analytics/schemas.ts
packages/analytics/sqlite-analytics-store.ts
packages/analytics/sqlite-migration.ts
packages/analytics/store-utils.ts
packages/analytics/types.ts
packages/analytics/validation.ts
tests/analytics/api.test.ts
tests/analytics/import.test.ts
tests/analytics/storage.test.ts
```

### Release 1 files modified

```text
README.md
apps/web/public/app.js
apps/web/public/index.html
apps/web/public/styles.css
docs/api.md
docs/architecture.md
docs/build-journal.md
docs/change-report.md
docs/decision-log.md
docs/demo-guide.md
docs/deployment.md
docs/file-map.md
docs/methodology.md
docs/storage.md
services/analyzer/app.ts
tests/analyzer/frontend-history.test.ts
```

### Release 1 commits

```text
25445cf feat: add analytics connector storage foundation
a1825aa feat: add validated analytics CSV imports
819e99e feat: expose project scoped growth analytics APIs
3f9b00e feat: add growth intelligence workspace
811ad7b fix: harden growth workspace browser behavior
```

The documentation commit containing this report follows those feature/fix commits.

### Release 1 limitations and future edit locations

- CSV only; future reviewed provider/OAuth definitions begin in `packages/analytics/connectors.ts` and must emit `packages/analytics/types.ts` contracts through the same validation/store boundary.
- Normalization and mapping changes belong in `packages/analytics/csv.ts` and `import-service.ts`; increment `TRANSFORMATION_VERSION` for semantic changes.
- Rule/threshold/version changes belong only in `packages/analytics/opportunities.ts` plus `docs/opportunity-model.md` and deterministic tests.
- Search page/competitor matching belongs in `packages/analytics/detail.ts`; do not infer absent evidence.
- SQLite schema changes require a new additive migration beside `packages/analytics/migrations/002_analytics_connectors.sql`; do not edit an applied migration.
- Browser Search Performance/backlog behavior is in `apps/web/public/app.js`; HTTP contracts remain in `packages/analytics/api-schemas.ts` and `services/analyzer/app.ts`.
- No currency, attribution window, consent state, sampling/privacy threshold, instrumentation quality, or provider aggregation semantics are independently known.
- Opportunities generated for one import do not aggregate evidence across separate imports. Workflow status is preserved on deterministic opportunity reappearance.
- Import deletion retains now-unlinked opportunities and audit history by design.
- Migration 002 has not been applied to the current persistent local or deployed database. Separate approval, backup, and migration verification are required.
- Live OAuth/provider access remains unstarted and requires separate approval.

### Release 1 verification

- Automated pre-documentation gate: 31 test files, 183 tests passed.
- TypeScript: `npm run build` passed.
- Browser JavaScript: `node --check apps/web/public/app.js` passed.
- Whitespace: `git diff --check` passed.
- Interactive disposable-data browser pass: Data Sources, Imports, Data Explorer, filtered Search Performance, eight-part evidence detail, backlog workflow, and export links passed.
- Responsive browser pass: document/body width equaled the 375 px viewport after the scoped fix; analytics panels did not overflow, while the tab strip remained intentionally horizontally scrollable.
- Browser console: zero warnings/errors after the final reload.
- Final post-documentation gate is recorded in the completion response and final Git history.

## Original comparison persistence root cause

The failing component was **history semantic comparison**. It was not `runRecordSchema`, target/site `recordAlignmentIssues`, persisted-order alignment, URL identity, or an actual value mismatch.

The exact first rejected field was:

```text
history.technicalChanges[0].currentValue
```

Its tracked `field` was `indexability`. The rejected value in the deterministic reproduction was semantically:

```json
{
  "reason": "Second observed reason.",
  "isIndexable": true,
  "status": "explicit-index"
}
```

After Zod normalized the enclosing analysis, the recomputed equivalent object used schema insertion order:

```json
{
  "status": "explicit-index",
  "isIndexable": true,
  "reason": "Second observed reason."
}
```

The previous `equalJson()` used `JSON.stringify(left) === JSON.stringify(right)`, so identical nested object values with different property insertion order were rejected as `INVALID_RECORD`. Arrays were not the problem.

Fix `e8d946a` replaced that equality with recursive stable object-key serialization while retaining array order and strict value comparison. The API also forwards structured `RunStoreError.details`, and a temporary isolated-store API regression covers compare, save, second run, history, list, reopen, and latest. Validation remains strict against fabricated values.

## Architecture changes

1. **Acquisition** — shared URL/redirect/DNS/body/time/content-type policy plus resource discovery and same-origin BFS project crawling.
2. **Evidence** — normalized/static DOM extraction with raw source values, selectors/snippets/methods, JSON-LD errors, links/media, questions/answers, and lexical/structured coverage.
3. **Analysis** — stable findings plus analyzer library version `1.0.0` across technical, content, entity, trust/YMYL, and retrieval-support groups.
4. **Research provenance** — registry version `1.0.0` separates official/standards/schema/accessibility guidance from bounded internal heuristics.
5. **Comparison** — ordered target + up to five competitors, eligibility before benchmarks, 43 raw metrics, exact deltas/thresholds/evidence, advantages/shared gaps, and no composite score.
6. **Proposals** — deterministic, evidence-linked, review-gated artifacts with assumptions/facts/reviewer/verification.
7. **Verification/history** — normalized submitted-URL identity, semantic field diffs, rule/analyzer version awareness, proposal linkage, evidence diffs, and non-causation boundary.
8. **Intelligence seams** — optional AI contracts/guards with no adapter; manual observation store/provider interface with no automated provider.
9. **Persistence** — unchanged `RunStore` port, atomic JSON, migration-backed transactional SQLite, strict recomputation on save/read.
10. **Reporting/UI/deployment** — JSON/Markdown/CSV reports, accessible browser workspace, validated server config, safe structured logs, graceful shutdown, Render persistent disk.

See `docs/architecture.md` for the full flow and `docs/file-map.md` for edit ownership.

## Completed features

- Safe single-page analysis and conventional root resource checks.
- Bounded multi-page projects (1–50 pages, depth 0–5, delay 0–60000 ms).
- Deterministic page statuses and aggregates, sitemap discovery, robots awareness, duplicate/redirect handling, partial results.
- Versioned rules/analyzers/evidence/limitations.
- One-to-five competitor comparison with stable order and exclusion policy.
- Target gaps, target advantages, competitor advantages, shared gaps, competitor-only topics/questions/schema.
- Reviewable title/description/canonical/heading/FAQ/schema/provider/reference/risk/contact/link/brief/table/alt artifacts.
- First/second-run history, verification, proposal links, analyzer changes, and evidence diffs.
- Saved list/reopen/latest and stale browser-history-error clearing.
- Manual rank/citation observations and inactive provider truthfulness.
- Optional AI interpretation boundary with mocked validation only.
- Atomic JSON and durable single-instance SQLite storage/migrations.
- JSON, Markdown, CSV complete exports.
- Projects, Crawl Explorer, Evidence Explorer, matrix, findings filters, implementation, verification, history, observations, sources, roadmap.
- Production start, health, environment validation, bounded settings, structured logs, graceful shutdown, Render blueprint, persistent disk, fixture-only demo fallback.

## API endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Process health |
| POST | `/api/analyze` | Unsaved page evidence/rules/analyzers |
| POST | `/api/projects/crawl` | Bounded site research project |
| POST | `/api/compare` | Analyze, compare, history/verify, save |
| GET | `/api/runs` | Run summaries |
| GET | `/api/runs/latest?targetUrl=...` | Latest normalized-target run |
| GET | `/api/runs/:id` | Reopen validated run |
| GET | `/api/runs/:id/export?format=json|markdown|csv` | Complete export |
| GET | `/api/research-sources` | Versioned source registry |
| GET | `/api/ai/status` | Truthful adapter status |
| POST | `/api/runs/:id/interpretations` | Optional saved-evidence interpretation |
| GET | `/api/visibility-providers` | Manual/approved provider status |
| POST | `/api/visibility-observations` | Save manual context |
| GET | `/api/visibility-observations?targetUrl=...` | List/filter observations |

## Deterministic rule and analyzer coverage

Stable finding rules cover non-2xx, redirects, resources, noindex, canonical states, metadata/language/viewport, heading structure, JSON-LD/identity/breadcrumb schema, internal links, image alternatives, empty anchors, and direct-answer structure. Each has rule version, classification/confidence, evidence, exact implementation, outcome, verification, priority, effort, and limitation.

Analyzer observations cover 33 versioned checks: 6 technical, 9 content/answerability, 6 entity, 7 trust/YMYL, and 5 retrieval-support. Statuses are observed, partially observed, not observed, needs human review, or not applicable. “Not observed” is page-scoped only.

## Comparison metrics and thresholds

The 43 matrix metrics include:

- status, redirects, indexability and root resources;
- title/description/canonical/language/viewport;
- H1 validity, headings, jumps, empty/repeated headings;
- words, questions, FAQ signals, direct answers;
- schema types and JSON-LD errors;
- internal/external/unique links/domains;
- images, missing alt, empty anchors;
- topic/service/location counts and identity/trust/contact/location presence.

Scalar comparison thresholds are explicit: two headings, 100 words, three internal links, and one for question/answer, missing-alt, heading-error, JSON-LD-error, empty-anchor, service, and location deltas. Reverse metrics treat fewer errors/issues as favorable. Boolean rules compare presence/status. Set rules expose competitor-only schema, topics, and questions. All conclusions include exact target/benchmark values; counts are review context rather than optimization targets.

Eligibility rules prevent non-2xx, access-denied, bot/CAPTCHA/security/error, empty, and bounded near-empty pages from becoming benchmarks. Degraded pages remain usable with warnings. Ineligible pages remain visible as raw retrieval evidence.

## History and verification logic

- Baseline: newest stored run with the same normalized submitted target URL.
- Pairing: normalized submitted URL, never final redirect URL or array position alone.
- Membership: competitor added/removed tracked separately from relative reordering.
- Fields: technical, metadata, schema, headings, content, links, and media.
- Findings: stable IDs become new/resolved/unchanged; incomparable retrieval makes differences indeterminate.
- Rank context: compared only with matching query label and comparable target evidence; delta is current position minus previous position.
- Verification: `ruleId@ruleVersion`, analyzer ID/version/status, proposal links, page/site summaries, evidence diffs.
- Semantic validation: saved comparison/history/verification is recomputed; object keys are order-insensitive, arrays/order remain strict.
- Causation: concurrent website/visibility changes are never reported as causal.

## Persistence and database status

- JSON is default for local/test, atomic, serialized, and strictly validated.
- SQLite is opt-in with `STORAGE_ADAPTER=sqlite`; default path is `DATA_DIR/research.sqlite`.
- Migration 001 creates projects/pages, runs/sites/pages, evidence, findings, comparisons, proposals, verifications, sources, AI interpretations, and reserved visibility observations.
- SQLite uses strict tables, WAL, normal synchronization, foreign keys, busy timeout, and transactions.
- No dependency was installed; Node's built-in `node:sqlite` is used.
- Production shape is one service instance plus one persistent disk. Multi-instance managed DB is deferred.
- Manual visibility observations currently remain in their own atomic JSON file.

## AI interpretation status

The deterministic application is complete without AI. Provider interfaces, environment configuration, prompt version, evidence-ID allowlist, schema/citation checks, invention/YMYL warnings, time/item/character/output-token bounds, provider/model/usage metadata, and regenerate-from-run API are implemented. No live adapter, secret, or AI dependency ships, so `/api/ai/status` reports disabled and requests return a truthful not-configured error.

## Reports

JSON, Markdown, and CSV include run identity/time, target/competitors, page inventory/eligibility, matrix/findings, topics/trust, proposals, history/verification, matching manual observations, research sources, methodology, and limitations. PDF is explicitly deferred.

## Files created

```text
docs/deployment.md
docs/research-sources.md
docs/storage.md
packages/ai/config.ts
packages/ai/index.ts
packages/ai/interpret.ts
packages/ai/run-evidence.ts
packages/ai/types.ts
packages/analyzers/evaluate.ts
packages/analyzers/index.ts
packages/analyzers/types.ts
packages/crawler/discovery.ts
packages/crawler/site-crawl.ts
packages/proposals/generate.ts
packages/proposals/index.ts
packages/proposals/types.ts
packages/reports/index.ts
packages/reports/report.ts
packages/research/index.ts
packages/research/sources.ts
packages/storage/migrations/001_initial.sql
packages/storage/sqlite-migrations.ts
packages/storage/sqlite-run-store.ts
packages/verification/index.ts
packages/verification/types.ts
packages/verification/verify.ts
packages/visibility/index.ts
packages/visibility/json-observation-store.ts
packages/visibility/types.ts
render.yaml
services/analyzer/crawl.ts
services/analyzer/server-config.ts
tests/ai/interpret.test.ts
tests/analyzer/server-config.test.ts
tests/analyzers/evaluate.test.ts
tests/crawler/site-crawl.test.ts
tests/proposals/generate.test.ts
tests/reports/report.test.ts
tests/research/sources.test.ts
tests/storage/sqlite-run-store.test.ts
tests/verification/verify.test.ts
tests/visibility/json-observation-store.test.ts
```

## Files modified

```text
.env.example
README.md
apps/web/public/app.js
apps/web/public/index.html
apps/web/public/styles.css
docs/api.md
docs/architecture.md
docs/build-journal.md
docs/change-report.md
docs/decision-log.md
docs/demo-guide.md
docs/file-map.md
docs/methodology.md
package-lock.json
package.json
packages/comparison/compare.ts
packages/comparison/types.ts
packages/crawler/errors.ts
packages/crawler/fetch.ts
packages/rules/evaluate.ts
packages/rules/types.ts
packages/schemas/api.ts
packages/storage/json-run-store.ts
packages/storage/types.ts
services/analyzer/analyze.ts
services/analyzer/app.ts
services/analyzer/compare.ts
services/analyzer/index.ts
tests/analyzer/analyze.test.ts
tests/analyzer/app.test.ts
tests/analyzer/compare.test.ts
tests/analyzer/frontend-history.test.ts
tests/comparison/compare.test.ts
tests/comparison/diff.test.ts
tests/crawler/fetch.test.ts
tests/rules/evaluate.test.ts
tests/storage/json-run-store.test.ts
```

No repository, README duplicate, dependency install, or generated production data was added. The existing stash was not changed.

## Commits

```text
e8d946a fix: resolve remaining comparison persistence validation
4c570f3 feat: add bounded multi page crawl research projects
90a3832 feat: add versioned deterministic analyzer library
d2be132 docs: add versioned AI visibility research source registry
746eb6c feat: compare up to five competitors
bdba40b feat: expand evidence based site and competitor comparison
1be9521 feat: build AI visibility research workspace
5582372 feat: generate reviewable evidence backed implementation artifacts
2eea926 feat: verify implementation changes across research runs
1c10c07 feat: add optional evidence grounded AI interpretation
be657c5 feat: add manual visibility observations and provider interfaces
053c85c feat: add durable project and research run storage
cf331df feat: export complete AI visibility research reports
cf9ee20 feat: redesign interface for AI visibility research workflows
d465e73 chore: prepare AI visibility lab for production deployment
7411c71 fix: preserve proposal review label encoding
8fb23bd fix: align research workspace copy and encoding
585a5dc fix: normalize chained legacy run verification
docs: complete AI visibility research platform handoff (this document's commit; final hash is reported by git log and in the completion response)
```

## Verification results

Latest completed source gate before the documentation-only commit:

```text
npm test                              PASS — 28 files, 166 tests
npm run build                         PASS — strict TypeScript
node --check apps/web/public/app.js   PASS
git diff --check                      PASS
```

Read-only compatibility and compiled API smoke:

```text
Untouched data/runs.json              PASS — 13 runs loaded from 11.8 MB
GET /health                           PASS — 200
GET /api/runs                         PASS — 13 summaries
GET /api/runs/latest                  PASS — matching newest run
GET /api/runs/:id                     PASS — reopened newest run with history
GET /api/research-sources             PASS — registry 1.0.0, 10 sources
JSON / Markdown / CSV exports         PASS — 200, non-empty
GET /api/ai/status                    PASS — disabled, deterministic available
GET /api/visibility-providers         PASS — manual enabled, zero providers
```

Browser verification against compiled port 3001 passed: service ready; Projects, Research Sources, Roadmap, and History rendered; all 13 runs listed; the newest saved run reopened; the exact proposal review and non-causation labels appeared; three export links appeared; console warnings/errors were empty. At a 390×844 viewport the document and project panel did not overflow; the tab strip scrolls horizontally by design.

Final post-documentation test/build, push status, and exact clean Git status are completed after this report is staged. The completion response reports those results without claiming an external deployment.

## Deployment status and commands

Render-compatible configuration is committed but an external Render deployment was not created from this workspace. The blueprint uses Node 24.18.0 LTS, `npm ci && npm run build`, `npm start`, `/health`, SQLite, `/var/data`, a one-GB disk, and a 30-second shutdown allowance.

Local:

```powershell
npm install
npm test
npm run build
npm run dev
```

Compiled durable mode:

```powershell
$env:STORAGE_ADAPTER='sqlite'
$env:DATA_DIR='./data'
npm run build
npm start
```

## Deferred items and known limitations

- JavaScript rendering, authenticated crawls, CSS/rendered visibility, full search-engine robots behavior.
- Durable background jobs, progress streaming, retries/cancellation, and crawls above the enforced bound.
- Authentication, authorization, tenant isolation, quotas, audit retention, and abuse controls.
- Multi-instance managed PostgreSQL/object storage/backups/failover.
- Approved search/rank/citation/Search Console/analytics/backlink providers.
- Bundled live AI provider, secret-manager integration, and enforceable dollar budget (token/input/time bounds and returned cost metadata exist).
- PDF export.
- Consolidating manual observations into SQLite.
- Native-fetch DNS pinning; network egress control remains advisable.
- Browser/static analysis does not prove index state, ranking, citation, traffic, conversion, or causation.

## Exact future edit locations

- Crawl limits/robots/queue/background transition: `packages/crawler/site-crawl.ts`, `services/analyzer/crawl.ts`.
- Fetch/SSRF/transport: `packages/crawler/request.ts`, `safety.ts`, `fetch.ts`, `discovery.ts`.
- Extraction normalization: `packages/parser/page.ts`, `text.ts`, `links.ts`, `packages/entities/`.
- Stable finding rules: `packages/rules/evaluate.ts` and `types.ts`.
- Analyzer IDs/versions: `packages/analyzers/evaluate.ts`; source mapping: `packages/research/sources.ts`.
- Eligibility/metrics/thresholds: `packages/comparison/eligibility.ts`, `compare.ts`, `types.ts`.
- History fields/semantics: `packages/comparison/diff.ts`; verification: `packages/verification/verify.ts`.
- Proposal templates/review label: `packages/proposals/generate.ts`, `types.ts`.
- Public API schemas/routes/errors: `packages/schemas/api.ts`, `services/analyzer/app.ts`.
- Strict record schema/alignment/diagnostics: `packages/storage/json-run-store.ts`.
- SQLite schema/transactions: `packages/storage/sqlite-migrations.ts`, `migrations/`, `sqlite-run-store.ts`.
- AI provider: implement `packages/ai/types.ts`, wire explicitly in `services/analyzer/app.ts`.
- Visibility provider/unified storage: `packages/visibility/types.ts`, `json-observation-store.ts`, storage migrations.
- Report formats: `packages/reports/report.ts`.
- Browser structure/behavior/styles: `apps/web/public/index.html`, `app.js`, `styles.css`.
- Environment/lifecycle/deployment: `services/analyzer/server-config.ts`, `index.ts`, `.env.example`, `render.yaml`.

## Final status contract

The completed code is deterministic-first, evidence-linked, strict, offline-testable, and deployable as one durable instance. Any future capability must preserve raw evidence, stable identity/versioning, explicit limitations, truthful provider state, and the non-causation boundary.
