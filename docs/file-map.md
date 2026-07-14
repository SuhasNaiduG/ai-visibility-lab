# File Map and Future-Edit Guide

This map identifies the exact ownership boundary for each feature. Keep deterministic acquisition, interpretation, comparison, and presentation separate when extending the lab.

## Runtime entry points

| Location | Responsibility | Edit here when… |
|---|---|---|
| `services/analyzer/index.ts` | Reads `PORT` and starts Express. | Changing process startup or adding graceful shutdown. |
| `services/analyzer/app.ts` | HTTP routes, strict request validation, static hosting, dependency injection, and safe error mapping. | Adding an endpoint, changing status behavior, or composing a new service. |
| `apps/web/public/index.html` | Accessible forms, workflow tabs, and result containers. | Adding a user input or a new result section. |
| `apps/web/public/app.js` | API calls, progress/error states, and structured result rendering. | Changing browser interaction or rendering a new API field. |
| `apps/web/public/styles.css` | Responsive visual presentation. | Changing layout, typography, tables, cards, or mobile behavior. |

## Deterministic analysis path

| Location | Responsibility | Edit here when… |
|---|---|---|
| `packages/crawler/url.ts` | Basic URL normalization and supported-scheme checks. | Changing normalization behavior. Preserve its existing regression tests. |
| `packages/crawler/safety.ts` | Literal-IP and DNS-answer public-network policy. | Supporting a new address family/classification or strengthening SSRF defense. |
| `packages/crawler/request.ts` | Shared DNS check, timeout, user agent, redirect loop, and request evidence. | Changing outbound policy or replacing native fetch with a connection-pinned transport. |
| `packages/crawler/fetch.ts` | Bounded HTML body streaming and crawl result projection. | Changing the HTML byte limit, body decoding, or upstream response acceptance. |
| `packages/crawler/resources.ts` | Root `robots.txt` and conventional `sitemap.xml` checks. | Adding content validation, robots-declared sitemap discovery, or resource-specific parsing. |
| `packages/crawler/errors.ts` | Stable crawler error codes and HTTP mappings. | Adding a safe, externally visible acquisition failure type. |
| `packages/parser/page.ts` | Coordinates metadata, canonical, robots, headings, JSON-LD, media, social, and page-level extraction. | Adding a directly observed page field. Extend `ParsedPage` and its tests together. |
| `packages/parser/text.ts` | Visible-text normalization, sentence/word/question helpers. | Changing deterministic text visibility or counting rules. |
| `packages/parser/links.ts` | Link resolution, exact-host internal/external classification, destinations, domains, and anchor summaries. | Changing link classification or link evidence. |
| `packages/entities/extract.ts` | Inspectable entity/service/location/trust/contact/content-section patterns and sources. | Adding a transparent retrieval/coverage heuristic. Do not hide semantic weights here. |
| `packages/entities/types.ts` | Coverage input, signal, source, and dimension contracts. | Adding a coverage dimension or provenance field. |
| `services/analyzer/analyze.ts` | One-page orchestration: fetch, parse, resources, coverage/rules, and raw evidence. | Adding an analysis stage or changing environment option wiring. |

## Findings and rules

| Location | Responsibility | Edit here when… |
|---|---|---|
| `packages/rules/types.ts` | Evidence, finding, classification, priority, effort, and analysis-input contracts. | Changing the public finding/evidence shape. Treat this as a versioned contract. |
| `packages/rules/evaluate.ts` | Pure deterministic rule triggers and implementation guidance. | Adding or changing a rule. Keep stable IDs and add fixture/test coverage. |
| `packages/rules/index.ts` | Rule-engine export surface. | Exposing an additional evaluator. |

For a new rule, add the input evidence first, add one stable ID and full finding text in `evaluate.ts`, then add positive and negative cases in `tests/rules/evaluate.test.ts` or `tests/verification/before-after.test.ts`.

## Comparison, rankings, and history

| Location | Responsibility | Edit here when… |
|---|---|---|
| `packages/comparison/types.ts` | Comparable analysis, matrix, metric, gap, and advantage contracts. | Adding a comparison field or changing a result contract. |
| `packages/comparison/compare.ts` | 43 metric definitions, row projection, thresholds, gap/advantage logic, and explicit limitations. | Adding a comparison metric or changing a visible delta. Keep explanation and threshold adjacent. |
| `packages/comparison/diff.ts` | Prior/current field groups, schema/finding/competitor/rank changes, and correlation disclaimer. | Tracking an additional historical field or changing matching semantics. |
| `packages/ranking/types.ts` | Optional provider seam and manual rank normalization/validation. | Implementing a verified rank adapter. Put the adapter in a new module; keep manual data provenance explicit. |
| `services/analyzer/compare.ts` | Equal-path analysis, comparison, prior-run lookup, diff, and save. | Changing comparison orchestration, not metric formulas. |

Automatic rankings are deliberately absent. A future provider should implement `RankObservationProvider`, identify its source as `provider:<id>`, and remain optional. Never substitute estimated positions for observed data.

### Where a future AI interpretation layer belongs

Create a new `packages/interpretation/` boundary only after the deterministic output contracts are stable. Put provider-neutral input/output types in `packages/interpretation/types.ts`, keep any vendor adapter in a separate file such as `packages/interpretation/providers/<provider>.ts`, and call it from a new orchestration service after `analyzeUrl()` or `compareAnalyses()` has completed. It must consume immutable deterministic evidence, preserve source IDs/URLs/timestamps, return a separately labeled `interpretation` object, and never replace findings, raw evidence, comparison deltas, or limitations.

Wire an opt-in route in `services/analyzer/app.ts` and validate its request in `packages/schemas/api.ts`. Add contract tests under `tests/interpretation/`, route/error tests in `tests/analyzer/app.test.ts`, and update `docs/api.md`, `docs/architecture.md`, `docs/methodology.md`, and this map. Keep the feature disabled without explicit configuration and record provider/model/version provenance. No AI provider or API is implemented in this MVP.

## Persistence

| Location | Responsibility | Edit here when… |
|---|---|---|
| `packages/storage/types.ts` | `RunStore`, record/summary contracts, schema version, and application version. | Adding a storage adapter or intentionally versioning stored data. |
| `packages/storage/json-run-store.ts` | Runtime validation, serialized local writes, temporary-file cleanup, atomic rename, retrieval, and latest-run matching. | Changing JSON persistence or validation. Do not silently repair corrupt history. |
| `data/.gitkeep` | Keeps the generated-data directory in Git. | Normally never; `data/runs.json` is runtime output and ignored. |

To replace JSON storage, implement `RunStore` in a new adapter and inject it through `createApp()`/`compareAndSaveRun()`. Keep storage-version migration explicit.

## Request contracts

| Location | Responsibility | Edit here when… |
|---|---|---|
| `packages/schemas/api.ts` | Strict Zod request/query schemas and cross-field URL/rank validation. | Adding or changing accepted API inputs. |
| `docs/api.md` | Human-readable endpoint, response, and error reference. | Any route or request/response contract changes. |

## Verification assets and tests

| Location | Coverage |
|---|---|
| `fixtures/verification/original.html` | Known canonical, heading, JSON-LD, and image-alt defects. |
| `fixtures/verification/corrected.html` | Deterministically corrected version used to prove resolution. |
| `tests/crawler/url.test.ts` | Foundation URL normalization. |
| `tests/crawler/safety.test.ts` | Literal IP, DNS answer, mixed-answer, and public-host safety behavior. |
| `tests/crawler/fetch.test.ts` | Redirects, timeout, body limit, redirect safety, and fetch evidence. |
| `tests/crawler/resources.test.ts` | Shared policy and resource evidence. |
| `tests/parser/page.test.ts` | Foundation parsing behavior. |
| `tests/parser/evidence.test.ts` | Expanded canonical, headings, questions, JSON-LD, links, media, and coverage evidence. |
| `tests/entities/extract.test.ts` | Coverage dimensions and source-linked signals. |
| `tests/rules/evaluate.test.ts` | Rule stability and classification. |
| `tests/verification/before-after.test.ts` | Fixture-based new/resolved/unchanged rule proof. |
| `tests/comparison/compare.test.ts` | Matrix projection, multi-competitor gaps, evidence, and manual ranks. |
| `tests/comparison/diff.test.ts` | Field groups, findings, competitor changes, query matching, and rank additions/removals/changes. |
| `tests/ranking/types.test.ts` | Manual rank range and URL normalization. |
| `tests/storage/json-run-store.test.ts` | Atomic persistence, validation failures, ordering, and cleanup. |
| `tests/analyzer/analyze.test.ts` | Real orchestration with injected acquisition seams. |
| `tests/analyzer/compare.test.ts` | Equal-path compare/save/history orchestration. |
| `tests/analyzer/app.test.ts` | Route validation, error envelope/statuses, payload limit, and static interface. |
| `tests/helpers/analysis.ts` | Complete deterministic analysis fixture builder shared by comparison/storage tests. |

When a public contract changes, update the closest unit test and an integration-level test. The required local gate is `npm test` followed by `npm run build`.

## Project and documentation files

| Location | Responsibility |
|---|---|
| `package.json` / `package-lock.json` | Reproducible scripts and exact dependency graph. |
| `tsconfig.json` | Strict TypeScript compilation for packages, services, and tests. |
| `vitest.config.ts` | Test discovery/runtime configuration. |
| `.env.example` | Environment-variable reference; values must be supplied to the process explicitly. |
| `.gitignore` | Excludes dependencies, build output, real environment files, and generated run data. |
| `README.md` | Setup, current capability boundary, and roadmap. |
| `docs/architecture.md` | Layer boundaries and request flow. |
| `docs/methodology.md` | Evidence classes, heuristic labeling, comparison method, and unknowns. |
| `docs/decision-log.md` | Important design decisions and trade-offs. |
| `docs/build-journal.md` | Preserved chronological foundation plus completed MVP milestones. |
| `docs/change-report.md` | Exact checkpoint-to-MVP handoff, verification, commits, limitations, and changed files. |

## Generated and build paths

- `dist/` is TypeScript build output and is never hand-edited.
- `node_modules/` is installed dependency content and is never committed.
- `data/runs.json` is local generated history and is never committed.
- `data/runs.json.tmp` may exist only transiently during a write; the store cleans it after failures.
- A real `.env` file is ignored and is not read automatically by this MVP.
