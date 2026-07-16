# Demo Guide

## Launch

Local JSON mode:

```powershell
npm run build
npm start
```

Durable local mode:

```powershell
$env:STORAGE_ADAPTER='sqlite'
$env:DATA_DIR='./data'
npm run build
npm start
```

Open `http://localhost:3000`. Confirm the header reports the service ready.

## Eight-minute workflow

1. **Projects** — submit a public target, keep 10 pages/depth 2/250 ms, and start the crawl. Show config/status, analyzed/blocked/skipped/error pages, Crawl Explorer totals, per-page Evidence Explorer, and limitations. Explain that the crawl is same-origin, static, bounded, and partial states are evidence.
2. **Single-site analysis** — analyze an important target page. Show retrieval, metadata, indexability, headings, schema, links/media, normalized questions/answers, rule IDs, analyzer statuses, raw evidence, and limitations.
3. **Competitor comparison** — enter the target plus one-to-five public competitors. Optional rank fields are manual context only. Run and save.
4. **Eligibility first** — identify eligible/degraded/ineligible rows. Ineligible pages remain visible but are excluded from conclusions.
5. **Matrix and findings** — show target-first order, the 43 raw metrics, exact target/benchmark/difference/threshold values, target gaps, target advantages, competitor advantages, and shared gaps. There is no overall score.
6. **Implementation workspace** — open a proposal and show source rule/evidence, proposed artifact, assumptions, facts to confirm, reviewer requirement, and verification steps. Read the exact factual/professional-review label aloud.
7. **Exports and history** — download JSON, Markdown, or CSV. Open **Run history**, reopen the saved run, and confirm no prior error remains visible. A second run with the same normalized target creates history and later-run verification.
8. **Visibility observations** — record query, engine/surface, location, device, date, rank and/or citation, and a reference. State that the observation is manual and non-causal.
9. **Research sources** — show registry version, source type, supported claim, analyzer mapping, and notes distinguishing official guidance from internal heuristic.
10. **Optional AI** — show status/button. In the shipped application it remains unavailable because no provider adapter is bundled; deterministic analysis continues normally.
11. **Roadmap** — distinguish delivered SQLite durable storage from deferred multi-instance database, background jobs, approved visibility providers, and PDF.

## Deterministic no-network fallback

If external access is unavailable, do not pretend a fixture is a live crawl. Demonstrate the bundled before/after path with:

```powershell
npm test -- tests/verification tests/comparison tests/reports tests/analyzer/app.test.ts
```

The original/corrected fixtures exercise extraction, comparison, save/reopen/latest/history, verification, proposals, and export without inserting demo data into production storage.

## Second-run verification recipe

1. Save an initial comparison for a normalized target and stable competitor set/query label.
2. Publish only reviewed/factually approved website changes.
3. Submit the same target again. Competitors may be added/removed/reordered; those are reported separately.
4. Reopen the second run and inspect technical/metadata/schema/heading/content/link/media changes, rule and analyzer status, proposal links, evidence diffs, and any indeterminate items.
5. If a manual visibility observation also changed, use exactly: “Website changes and observed visibility changes occurred during the same interval. This does not establish causation.”

## Boundaries to state aloud

- Public static evidence only; no private analytics, actual index state, backlink data, or JavaScript rendering.
- No ranking/citation guarantee, proprietary-system simulation, automated SERP scraping, or synthetic visibility score.
- Missing evidence is page-scoped, not proof about the organization.
- Proposals are not published changes and require review, especially for YMYL/professional claims.
- SQLite is one-instance durable storage; manual observations remain in their atomic JSON file.
- JSON/Markdown/CSV are delivered; PDF, distributed jobs, managed multi-instance DB, auth/tenancy, approved providers, and a live AI adapter are deferred.
