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
