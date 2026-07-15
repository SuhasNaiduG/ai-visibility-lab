# AI Visibility Engineering Lab — Build Journal

## Milestone 1 — Foundation

### Goal

Build a deterministic technical analysis engine before introducing any AI interpretation.

The philosophy is:

```
Observe
→ Measure
→ Analyze
→ Implement
→ Verify
→ Monitor
```

AI should only assist where human interpretation is valuable.

Deterministic engineering always comes first.

---

# Step 1 — Repository Initialization

### Objective

Create a clean engineering repository.

### Accomplishments

* Initialized Git repository.
* Created Node.js project.
* Generated `package.json`.
* Established the repository as the single source of truth.

### Why it matters

Every engineering project should begin with version control. Small, focused commits make changes easy to review, test, and revert.

---

# Step 2 — TypeScript Foundation

### Objective

Configure a strict TypeScript environment.

### Accomplishments

* Added TypeScript configuration.
* Enabled strict compiler settings.
* Configured build output.
* Verified the project builds successfully.

### Why it matters

Strict TypeScript catches many mistakes before code reaches production and provides a solid foundation for a growing codebase.

---

# Step 3 — Build Pipeline

### Objective

Ensure the project can be built consistently.

### Accomplishments

* Configured build script.
* Configured development script.
* Configured testing script.
* Successfully executed:

```
npm run build
```

### Why it matters

A working build pipeline is the first proof that the project is reproducible and ready for continuous development.

---

# Step 4 — URL Normalization

### Objective

Create the first deterministic component.

Implemented:

```
normalizeUrl()
```

Responsibilities:

* Trim whitespace.
* Add HTTPS when missing.
* Reject empty URLs.
* Reject unsupported protocols.
* Remove URL fragments.
* Return a normalized URL object.

### Why it matters

Every later analyzer depends on receiving a valid canonical URL. Fixing bad input early prevents cascading errors.

---

# Step 5 — Test-Driven Development

### Objective

Validate URL normalization with automated tests.

Tests created:

* Missing protocol
* Existing HTTPS
* Whitespace trimming
* Fragment removal
* Empty URL
* Unsupported protocol
* Malformed URL

Result:

```
7/7 tests passing
```

### Important Lesson

A bug was discovered during testing.

Originally, the protocol detection only recognized HTTP and HTTPS.

This caused:

```
ftp://example.com
```

to become

```
https://ftp://example.com
```

instead of being rejected.

The tests exposed this defect before it could affect later components.

The implementation was corrected by detecting any URI scheme first, then explicitly allowing only HTTP and HTTPS.

### Why it matters

This demonstrates the value of deterministic testing:

* Tests verify behavior.
* Tests reveal defects.
* Code is improved based on evidence rather than assumptions.

---

# Current Engineering Status

Completed:

* Git repository initialized
* Node project initialized
* TypeScript configured
* Build pipeline working
* URL normalization implemented
* Automated tests written
* First production bug discovered
* Bug fixed through testing
* Build passes
* Test suite passes

---

# Engineering Principles Followed

* Execution before presentation.
* Deterministic logic before AI.
* Evidence before recommendations.
* Small verified milestones.
* Test-driven improvements.
* Focused Git commits.
* Build verification after each milestone.

---

# Next Milestone

Implement the first real crawler.

The analyzer will fetch a webpage and return:

* HTTP status
* Final resolved URL
* Response time
* Fetch timestamp

This establishes the foundation for deterministic HTML analysis before extracting metadata, headings, schema, links, and technical SEO signals.

📖 Build Journal — Step 7

Add this section to docs/build-journal.md:

Step 7 — Implement the HTML Fetcher

Objective

Create the first deterministic crawler capable of retrieving webpage content and crawl metadata.

Accomplishments

Implemented fetchHtml().
Configured automatic redirect handling.
Added a custom User-Agent.
Measured response time.
Recorded the fetch timestamp.
Captured the final resolved URL and HTTP status code.

Why it matters

The crawler is intentionally separated from parsing logic. Its responsibility is to reliably retrieve webpage content and metadata. Keeping fetching independent from analysis makes the system easier to test, extend, and reuse in future analyzers.

Engineering principle

Separate data acquisition from data interpretation.

This distinction will become the foundation of the entire AI Visibility Engineering Lab.


**"Up to this point, you've built real production infrastructure"**

---

# Milestone 2 — Verified Foundation Review

### Objective

Continue from checkpoint `354df4c` without discarding working behavior.

### Accomplishments

* Read the repository, tests, documentation, attached master specification, and complete Git history.
* Confirmed the worktree matched the checkpoint before implementation.
* Ran the checkpoint suite: 3 test files and 18 tests passed.
* Ran the strict TypeScript build successfully.
* Restored dependency declarations in `package.json` from the versions already locked in `package-lock.json`.

### Engineering principle

Preserve verified behavior and extend it through focused, reviewable changes.

---

# Milestone 3 — Hardened Public-Page Acquisition

### Objective

Make every outbound request deterministic, bounded, and subject to the same public-network policy.

### Accomplishments

* Added stable crawler error codes and safe API mappings.
* Rejected loopback, private, link-local, reserved, multicast, and mixed public/private DNS targets.
* Revalidated every redirect hop and recorded redirect/network evidence.
* Enforced a 10-second end-to-end deadline, five-hop redirect limit, and 2,000,000-byte HTML limit.
* Routed HTML, `robots.txt`, and `sitemap.xml` through the shared request policy.
* Added injectable DNS/fetch seams so tests remain offline and repeatable.

### Commit

`58d9885 feat: harden crawler request policy`

---

# Milestone 4 — Comparison Contracts, Persistence, and History

### Objective

Create typed comparison/history boundaries and durable local run storage before wiring the complete analyzer.

### Accomplishments

* Added the normalized comparison, historical diff, ranking, finding, and storage contracts.
* Added raw matrix projections and evidence-backed gap/advantage boundaries.
* Accepted optional normalized manual rank observations from 1 through 1,000 and defined a future provider interface without implementing one.
* Added a runtime-validated JSON store with serialized writes, temporary-file cleanup, and atomic replacement.
* Matched historical runs by normalized target URL and established technical/content/finding/competitor/rank change contracts.

### Commit

`74958ac feat: add comparison history and run storage`

---

# Milestone 5 — Evidence, Rules, Analyzer Integration, and Audit

### Objective

Expand observable evidence, generate explainable guidance, wire the complete API flow, and close final evidence-audit gaps.

### Accomplishments

* Added canonical raw/resolved relationship evidence, robots/indexability interpretation, language, viewport, complete heading structure, visible-text counts, questions, FAQs, direct answers, and breadcrumbs.
* Preserved raw JSON-LD and parse failures, schema types, social metadata, link destinations/domains/anchors, and image/alt evidence.
* Added inspectable entity, service, location, trust, contact, and content-section coverage signals.
* Added 34 stable deterministic rules and original/corrected verification fixtures.
* Exposed the analyzer, comparison, persistence, and history flows through strict safe APIs.
* Completed the 43-metric matrix, structured scalar/boolean deltas, expanded historical inventory, schema normalization, multi-competitor benchmark tests, and no-causation safeguards.

### Commits

* `8360a8e feat: expose evidence rules and analyzer APIs`
* `00f35e3 fix: close final evidence audit gaps`

---

# Milestone 6 — Minimal Evidence Interface

### Objective

Make the complete deterministic workflow usable without moving analysis logic into the browser.

### Accomplishments

* Added single-site, competitor-comparison, and run-history workflows.
* Added progress and error states, summary cards, metric tables, findings, raw evidence details, comparison gaps/advantages, limitations, and historical changes.
* Verified a live analysis against `https://425clearaligners.com` and a comparison against `https://example.com`.
* Saved a second matching run, rendered the historical diff, listed both runs, and reopened the newest saved record.
* Confirmed the browser console contained no warnings or errors during the verified workflow.
* Corrected optional competitor-slot rank pairing found during the final audit.

### Commit

`8ceb833 feat: add minimal analysis interface`

---

# Milestone 7 — Final Verification and Handoff

### Objective

Leave a reproducible, inspectable MVP and an exact map for the next engineer.

### Verification gate at this checkpoint

* `npm test`: 16 test files passed; 83 tests passed at the prior handoff checkpoint.
* `npm run build`: strict TypeScript compilation passed.
* `npm run dev`: local service startup and `GET /health` were verified.
* Live browser workflow: analysis, comparison, persistence, historical diff, run listing, and saved-run reopening passed with no console warnings/errors.
* `git diff --check`: passed.

### Handoff documents

* `README.md`
* `docs/architecture.md`
* `docs/api.md`
* `docs/methodology.md`
* `docs/decision-log.md`
* `docs/file-map.md`
* `docs/change-report.md`

The deterministic MVP remains intentionally bounded: one submitted page per site, public evidence only, no automatic rank provider, no private analytics, no AI API, no aggregate visibility score, and no causation claims.

### Commit

`abe3b16 docs: document architecture methodology and handoff`

---

# Milestone 8 — Comparison Eligibility, Identity, and History Integrity

### Objective

Prevent unusable retrievals from becoming competitor conclusions while preserving raw evidence, submitted identity, and honest historical uncertainty.

### Accomplishments

* Added evidence-backed `eligible`, `degraded`, and `ineligible` page classification, including non-2xx, HTTP 200 access-denied/challenge/error, empty, and near-empty response handling.
* Kept every site in the raw matrix while excluding ineligible competitors from scalar, boolean, and set benchmarks.
* Added `complete`, `partial`, and `unavailable` conclusion states plus one exact user-visible incomplete message.
* Preserved stable target-first submitted identities (`inputOrder` 0 through 3) across parallel analysis, comparison rows, storage, summaries, and history.
* Added visible side-by-side target/competitor evidence bundles with observed values and benchmark markers.
* Matched historical snapshots by normalized submitted URL, separated competitor membership from reordering, and made non-technical/finding/rank history indeterminate when retrieval eligibility prevents a valid comparison.
* Added bounded normalization for compatible schema-version-1 local records, followed by current-contract and identity-alignment validation.
* Expanded focused eligibility, comparison, history, orchestration, storage, API, and interface regressions.

### Verification status

* `npm test`: 17 test files and 116 tests passed.
* `npm run build`: strict TypeScript build passed with no emitted diagnostic.
* `node --check apps/web/public/app.js` and `git diff --check`: passed.
* Compiled-service `/health` smoke test on `127.0.0.1:3117`: passed; the temporary process was stopped.
* Existing 3.4 MB `data/runs.json`: 5 records loaded read-only and the file remained unchanged.
* Live mixed-eligibility browser verification preserved target-first order, showed raw evidence for all four sites, excluded 403/405 responses from 11 gaps and 4 advantages, rendered the exact incomplete message, and produced no browser warnings/errors.
* Live verification exposed an overly broad numeric-error-title match for `425 Clear Aligners...`; the pattern was narrowed and a regression was added. A final audit also bounded error-body matching by normal page evidence so legitimate troubleshooting articles remain usable.
* Target advantages now reuse the same visible side-by-side evidence panels as gaps. Current stored comparisons and histories are semantically checked against deterministic `compareAnalyses`/`diffRuns` recomputation so fabricated values, benchmark flags, deltas, conclusion sets, observed changes, findings, ranks, membership/order, or correlation summaries are rejected.
* Focused commit subject: `fix: validate comparison eligibility and preserve site order`; the exact hash is reported in the completion handoff because a commit cannot contain its own hash.

### Engineering principle

Retrieval evidence may be incomplete without being hidden. Preserve it for inspection, but do not turn an unusable page into a benchmark, a resolved finding, or a rank-correlation claim.

---

## Milestone 9 — Rooz prototype stabilization

### Accomplishments

* Fixed comparison persistence validation without weakening semantic storage checks.
* Normalized visible question evidence and excluded obvious placeholder or sentence-fragment topics.
* Exposed the reviewed implementation artifact and existing deterministic fixture verification in the browser comparison workflow.
* Added a clear Working Now versus Planned roadmap and a short video guide.

### Verification

* 18 test files / 122 tests passed.
* Strict TypeScript build and browser JavaScript syntax check passed.

### Commits

* `ba9df8b fix: resolve comparison run validation failure`
* `2d1212b fix: normalize visible question and topic evidence`
* `4a005d2 feat: complete evidence implementation verification demo`
