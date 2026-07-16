# Build Journal

## Foundation and stable core

- Verified foundation checkpoint: `354df4c feat: establish deterministic analyzer foundation`.
- Existing repository, branch, remote, tests, documentation, fixtures, history, and `stash@{0}` were inspected. The stash was never applied, popped, deleted, or modified.
- Stale frontend history errors were fixed earlier in `dc70454` with a fail-then-success regression.
- The remaining comparison save failure was reproduced and fixed in `e8d946a`. It was a history-semantic object-key-order mismatch, not schema shape, record alignment, persisted alignment, or a true value difference.
- Strict validation remained active and began returning the exact validation path/rejected value in storage error details.
- No baseline test/build failures remained when the research-platform releases began.

## Release 2 — deterministic research tool

### Multi-page projects

- Added same-origin deterministic BFS, page/depth/delay bounds, fragment/tracking normalization, redirect duplicate detection, `User-agent: *` robots rules, sitemap discovery, partial/truncated status, and page aggregation.
- Added offline regressions for duplicates, redirects, robots, limits, discovery, and partial failure.
- Commit: `4c570f3`.

### Analyzer library and sources

- Added versioned technical, content/answerability, entity, trust/YMYL, and retrieval-support observations with evidence/status/limitation.
- Added the primary-source versus internal-heuristic registry and documentation.
- Commits: `90a3832`, `d2be132`.

### Comparison, workspace, proposals, verification

- Expanded from up to three to up to five competitors.
- Added 43 target-first matrix metrics; complete/partial/unavailable eligibility; excluded benchmark handling; exact gap/advantage/shared-gap explanations; and evidence-linked proposals.
- Added later-run rule/analyzer/proposal/evidence verification and explicit non-causation language.
- Added Projects/Crawl/Evidence/Comparison/Implementation/History/Sources/Roadmap workspace views.
- Commits: `746eb6c`, `bdba40b`, `1be9521`, `5582372`, `2eea926`.

## Release 3 — research intelligence

- Added optional provider-neutral AI contracts, prompt versioning, evidence-ID allowlist, schema/citation validation, time/item/character/token bounds, model/usage metadata, and mock-only tests. No provider was installed or activated.
- Added manual rank/citation observations and truthful empty future-provider interface.
- Commits: `1c10c07`, `be657c5`.

## Release 4 — production, reports, and deployment

- Added migration-backed SQLite storage for one durable persistent-disk instance; JSON remains local/test default.
- Added JSON, Markdown, and CSV complete reports; PDF intentionally deferred.
- Refined filters, drill-down, accessibility, responsive layout, errors, empty states, evidence inspection, and export/AI controls.
- Added environment validation, structured safe logs, graceful shutdown, Render blueprint, persistent disk, health check, and background-job plan.
- Commits: `053c85c`, `cf331df`, `cf9ee20`, `d465e73`.

## Final source audit corrections

- Corrected the proposal label's stored em dash and added an exact literal test: `7411c71`.
- Corrected three HTML workflow arrows and replaced stale roadmap copy about database delivery: `8fb23bd`.
- Browser verification exposed a legacy verification-chain compatibility gap in the untouched 11.8 MB JSON history file. Recursive read-only normalization now propagates recomputed prior verification into dependent runs without weakening current-record checks or rewriting the file: `585a5dc`.

## Verification checkpoints

## Release 1 — growth intelligence connectors (2026-07-17)

- Inspected the existing schema before designing analytics persistence. Reused `research_projects`; no parallel project table was created.
- Added migration 002 plus strict JSON/SQLite analytics adapters with foreign-key enforcement, project-leading indexes, controlled cascades, duplicate uniqueness, retained redacted audits, and adapter parity.
- Added bounded CSV preview/mapping/import for four aggregate connectors, sensitive-column/formula rejection, redacted row failures, stable normalization hashes, and original-file non-retention.
- Added Search Performance filters/detail evidence linkage, deterministic opportunity rules/workflow, Data Sources, Imports, Data Explorer, backlog, deletion controls, and safe exports.
- No dependency, AI API, OAuth flow, live provider access, credential/token storage, persistent database migration, or original CSV fixture was introduced.
- Focused commits: `25445cf`, `a1825aa`, `819e99e`, `3f9b00e`, `811ad7b`.
- Pre-documentation full gate: 31 files and 183 tests passed; TypeScript build, browser `node --check`, and `git diff --check` passed.
- Browser verification is recorded in the final Release 1 checkpoint after the documentation and final source gate.

### Release 1 browser checkpoint

- Used a disposable JSON directory and local port 3002; the existing persistent local/deployed database was never opened. The disposable server and files were removed after verification; an unrelated existing port-3000 process was left untouched.
- Service-ready header and all five analytics workspaces rendered.
- Data Sources showed the CSV-only/live-access-disabled boundary and one project-scoped Search Console source/import.
- CSV Imports showed the four connectors, original-file non-retention copy, disabled pre-preview commit action, and import history/deletion control. Selecting a project now refreshes history immediately.
- Data Explorer showed one accepted normalized record plus project/source/import IDs, both SHA-256 hashes, transformation version, confidence, and limitation.
- Search Performance filters returned exactly one matching row with all required columns and imported values. Row detail rendered matching target evidence, public competitor question/gap evidence, rule ID, exact `4 / 200 = 2.00%` arithmetic, action, success metric, and combined limitations.
- Opportunity Backlog showed two high-priority rules, three export links, and persisted `new -> reviewed` workflow movement.
- Browser verification caught and fixed analytics-card mobile overflow. At a 375 px document viewport, document/body widths were 375 px, the active panel stayed within bounds, and only the tab strip retained intentional internal scrolling.
- Browser console warning/error log was empty after the final reload.

### Deployment checkpoint (`d465e73`)

- `npm test`: 28 files, 164 tests passed.
- `npm run build`: passed.
- `node --check apps/web/public/app.js`: passed.
- `git diff --check`: passed.

### Final source corrections and legacy compatibility (`585a5dc`)

- `npm test`: 28 files, 166 tests passed.
- `npm run build`: passed.
- `node --check apps/web/public/app.js`: passed.
- `git diff --check`: passed.
- Real history read: 13 existing runs loaded from the untouched 11.8 MB `data/runs.json`.
- Compiled API: health, run list, latest, reopen, source registry, and JSON/Markdown/CSV exports passed on port 3001.
- Browser: service ready; Projects/Research Sources/Roadmap/History rendered; 13 runs listed; newest run reopened; exact proposal/non-causation labels and three export links appeared; no console warning/error; 390 px panel had no document/panel overflow (tab strip scrolls intentionally).

### Final handoff gate

The final documentation commit is followed by another complete test/build/syntax/diff gate. Exact final outputs and Git state are reported in the completion response; no unrun external deployment is claimed.

## Network discipline

Automated tests use fixture HTML, injected fetch/DNS, temporary directories, in-memory SQLite, or mock AI providers. No required test depends on an uncontrolled live website. Official Node and Render documentation were checked for runtime/deployment decisions; product analysis does not require web search.
