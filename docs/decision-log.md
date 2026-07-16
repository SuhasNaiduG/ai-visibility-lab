# Decision Log

## 2026-07-15 — Preserve the verified foundation

**Decision:** Continue in the existing repository and branch from foundation checkpoint `354df4c`; preserve working modules and history.

**Reason:** URL safety, deterministic acquisition/parsing, typed rules, API, storage, and tests were already verified. Rebuilding would reduce evidence and reviewability.

## 2026-07-15 — Deterministic evidence before interpretation

**Decision:** Keep raw evidence, normalized evidence, deterministic rules/analyzers, proposals, manual observations, and optional AI output as separate classes.

**Reason:** A missing page signal cannot establish a missing real-world fact, and a language model must never become the evidence source of record.

## 2026-07-15 — No composite visibility score

**Decision:** Expose raw counts, booleans, sets, ratios/context, thresholds, and exact deltas only.

**Reason:** Hidden weights would imply predictive knowledge of search/AI systems and obscure the evidence that a reviewer needs.

## 2026-07-15 — Stable submitted URL identity

**Decision:** Target is input order 0; competitors retain order 1–5. Normalized submitted URL is the durable history identity; final redirected URL remains evidence.

**Reason:** Redirects and asynchronous analysis must not silently change which submitted site a row or historical page represents.

## 2026-07-15 — Exclude unusable benchmarks, retain evidence

**Decision:** Classify pages as eligible, degraded, or ineligible. Keep every row visible but exclude ineligible competitors from every conclusion.

**Reason:** An HTTP 200 challenge/error page is not a useful content benchmark. Hiding it would also conceal why comparison became partial or unavailable.

## 2026-07-15 — Strict semantic persistence

**Decision:** Parse shape, check alignment, recompute comparison/history/verification, and reject mismatches with exact diagnostic paths.

**Reason:** A saved run must be reproducible, not merely JSON-shaped. Validation remains strict; recursive equality ignores object insertion order but preserves array order.

## 2026-07-16 — Bounded same-origin breadth-first crawl

**Decision:** Maximum 50 pages/depth 5, deterministic BFS, explicit pacing, tracking removal, duplicate prevention, practical robots/sitemap support, and partial states.

**Reason:** It creates useful site research without unbounded crawling, hidden skips, cross-origin expansion, or irresponsible request volume.

**Trade-off:** Crawls are synchronous web requests. A durable job worker is required before raising limits.

## 2026-07-16 — Version analyzers and sources

**Decision:** Analyzer observations use stable IDs/version `1.0.0`; a registry maps them to primary guidance or explicitly bounded internal heuristics.

**Reason:** Historical status changes must distinguish evidence changes from analyzer changes, and heuristics must never be presented as external ranking guidance.

## 2026-07-16 — Generate reviewable proposals, never production claims

**Decision:** Proposals are deterministic templates linked to evidence and labeled `Proposal — requires factual and professional review before publication.`

**Reason:** The system can identify implementation directions but cannot verify credentials, claims, addresses, prices, reviews, medical adequacy, or authorization to publish.

## 2026-07-16 — Optional provider-neutral AI only

**Decision:** Ship interfaces, bounds, prompt/output validation, and citations, but no live provider adapter or dependency.

**Reason:** The deterministic product works without AI; enabling a provider requires an explicit reviewed integration and secrets process.

## 2026-07-16 — Manual observations, no automated result scraping

**Decision:** Store user-observed rank/citation context and expose an empty provider registry.

**Reason:** Result collection varies by engine/location/device and requires approved access. The interface must not imply an inactive provider is working.

## 2026-07-16 — JSON locally, SQLite for one durable instance

**Decision:** Preserve `RunStore`, keep atomic JSON as default, and add a migration-backed built-in SQLite adapter without installing a dependency.

**Reason:** SQLite plus persistent disk is a strong single-instance deployment path. Managed PostgreSQL would require approved dependencies and a separate migration/operations plan.

**Trade-off:** Node's SQLite API remains release-candidate stability; manual visibility observations still use their JSON adapter.

## 2026-07-16 — JSON/Markdown/CSV reports; defer PDF

**Decision:** Export complete evidence in three stable formats and state PDF is deferred.

**Reason:** PDF layout/dependency work must not block verified portable reports.

## 2026-07-16 — Static accessible workspace

**Decision:** Continue with server-served HTML/CSS/JavaScript, accessible tabs, responsive evidence cards, filters, clear errors/empty states, and no decorative scoring widgets.

**Reason:** A framework migration would not improve deterministic correctness and would expand the dependency/build surface.

## 2026-07-16 — Render single-instance production shape

**Decision:** Pin Node 24 LTS, mount `/var/data`, use SQLite, validate all operational inputs before listening, log only safe metadata, and drain on termination.

**Reason:** This is deployable without claiming multi-instance scale. Fixture fallback stays explicit/test-only so failed live requests never silently generate demo records.

## 2026-07-17 — Reuse canonical research project identity

**Decision:** Migration 002 references `research_projects.id` directly and does not add `growth_projects`. The JSON adapter records validated references to crawl/comparison project IDs and never generates analytics project identities.

**Reason:** Parallel identity would make evidence, analytics, deletion, and future authorization ambiguous. Analytics is an extension of existing research work.

## 2026-07-17 — Offline aggregate CSV before live OAuth

**Decision:** Release 1 supports Search Console, web analytics, campaign, and aggregate lead-summary CSV contracts only. Every connector declares `liveAccess: false`.

**Reason:** CSV proves normalization, lineage, privacy, deterministic logic, UX, and storage behavior before provider-specific secrets, scopes, refresh, rate-limit, and deletion concerns are introduced.

## 2026-07-17 — Normalize and discard original files

**Decision:** Persist file metadata/fingerprint, mapping, counts, normalized records, lineage, redacted rejections, and audit summaries; never persist original CSV content or rejected cell values.

**Reason:** The MVP needs reproducible record provenance without expanding retention of direct identifiers or other unnecessary source content.

## 2026-07-17 — Narrow import cascades with retained opportunities and audit

**Decision:** Import deletion cascades only to its rejections and owned metrics; metric removal deletes only matching opportunity-evidence links. Projects, opportunities, unrelated data, sources, and audit events remain.

**Reason:** A deletion control should honor ownership without erasing review history or making unrelated conclusions disappear.

## 2026-07-17 — Transparent opportunity rules, no composite score

**Decision:** Version every opportunity rule and store the observation, threshold arithmetic, action, success metric, limitation, evidence IDs, and review status.

**Reason:** Reviewers can reproduce and reject a threshold-based flag. A hidden weighted score would imply unsupported prediction and make imported values harder to audit.
