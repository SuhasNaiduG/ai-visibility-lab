# File Map

## Entrypoints and configuration

| Location | Responsibility | Future edits |
| --- | --- | --- |
| `package.json` | Node engine and dev/build/test/start scripts | Add only reviewed dependencies/scripts |
| `.env.example` | Complete non-secret environment reference | Add validated variables here and in config |
| `render.yaml` | Render build/start/health/disk/runtime configuration | Change deployment size/runtime/disk |
| `services/analyzer/index.ts` | Production listener, structured logs, graceful shutdown | Process lifecycle only |
| `services/analyzer/server-config.ts` | Fail-fast server/request/storage environment validation | Add operational variables and bounds |

## HTTP and orchestration

| Location | Responsibility | Future edits |
| --- | --- | --- |
| `services/analyzer/app.ts` | Routes, validation, dependency injection, static UI, safe error mapping | Add endpoints/adapters |
| `services/analyzer/analyze.ts` | Compose fetch, resources, parser, rules, analyzers, evidence | Single-page pipeline |
| `services/analyzer/crawl.ts` | Resource/sitemap discovery plus bounded project crawl | Project orchestration |
| `services/analyzer/compare.ts` | Equal-path analyses, comparison, baseline, history, verification, save | Comparison workflow |
| `packages/schemas/api.ts` | Strict public request/query schemas | Public input contracts |

## Acquisition and parsing

| Location | Responsibility | Future edits |
| --- | --- | --- |
| `packages/crawler/url.ts` | HTTP(S) normalization | URL identity policy |
| `packages/crawler/safety.ts` | Literal/DNS public-address enforcement | SSRF classifications |
| `packages/crawler/request.ts` | Redirect/time/network policy | Transport policy |
| `packages/crawler/fetch.ts` | Bounded HTML and content-type acquisition | Body/media handling |
| `packages/crawler/resources.ts` | `robots.txt`/sitemap availability evidence | Resource checks |
| `packages/crawler/discovery.ts` | Root resources, robots body, sitemap URL discovery | Discovery policy |
| `packages/crawler/site-crawl.ts` | Same-origin BFS, pacing, robots rules, statuses, aggregation | Crawl limits/queue/jobs |
| `packages/parser/page.ts` | DOM extraction coordinator | Add page fields |
| `packages/parser/text.ts` | Visible text, headings, questions, answers, normalization | Evidence noise rules |
| `packages/parser/links.ts` | Link/anchor/internal-external extraction | Link semantics |
| `packages/entities/*` | Entity/service/location/trust/contact coverage signals | Lexical/structured dictionaries |

## Deterministic analysis and research

| Location | Responsibility | Future edits |
| --- | --- | --- |
| `packages/rules/types.ts` | Evidence/finding contracts | Finding fields/versioning |
| `packages/rules/evaluate.ts` | Stable actionable findings | Rule thresholds/logic |
| `packages/analyzers/types.ts` | Versioned analyzer observation contracts | Status/group types |
| `packages/analyzers/evaluate.ts` | Technical/content/entity/trust/retrieval analyzer library | Analyzer IDs/heuristics |
| `packages/research/sources.ts` | Versioned source registry and analyzer mapping | Add primary sources/mappings |
| `docs/research-sources.md` | Human-readable source rationale | Source review notes |

## Comparison, proposals, and verification

| Location | Responsibility | Future edits |
| --- | --- | --- |
| `packages/comparison/types.ts` | 43-metric matrix and finding contracts | Comparison output model |
| `packages/comparison/eligibility.ts` | Eligible/degraded/ineligible classification | Challenge/thin-page policy |
| `packages/comparison/compare.ts` | Rows, benchmarks, thresholds, gaps/advantages/shared gaps | Metrics and rule thresholds |
| `packages/comparison/diff.ts` | Semantic history and correlation boundary | Tracked fields/history rules |
| `packages/proposals/types.ts` | Reviewable artifact contract/label | Artifact types |
| `packages/proposals/generate.ts` | Deterministic artifacts from target gaps | Proposal templates |
| `packages/verification/types.ts` | Verification report contract | Verification classifications |
| `packages/verification/verify.ts` | Rule/analyzer/proposal/evidence before-after checks | Recrawl verification logic |

## Persistence, observations, AI, reports

| Location | Responsibility | Future edits |
| --- | --- | --- |
| `packages/storage/types.ts` | RunStore port and durable run identity | Adapter-neutral storage API |
| `packages/storage/json-run-store.ts` | Atomic JSON, strict schema/alignment/semantic validation | Record schema/migrations/diagnostics |
| `packages/storage/sqlite-run-store.ts` | Transactional SQLite implementation | Durable queries/close/backup behavior |
| `packages/storage/sqlite-migrations.ts` | Executable migration list | Register every migration |
| `packages/storage/migrations/001_initial.sql` | Reviewed SQL reference | Schema review |
| `packages/visibility/types.ts` | Manual observation/provider interfaces | Approved provider contract |
| `packages/visibility/json-observation-store.ts` | Atomic manual observation persistence | Move to unified DB later |
| `packages/ai/types.ts` | Provider/request/result contracts | Reviewed provider adapters |
| `packages/ai/config.ts` | Optional AI bounds/config | AI environment bounds |
| `packages/ai/run-evidence.ts` | Saved-run evidence ID projection | Evidence allowlist |
| `packages/ai/interpret.ts` | Prompt, timeout, schema/citation guardrails | Prompt/provider validation |
| `packages/reports/report.ts` | Complete report model and JSON/Markdown/CSV renderers | PDF/new formats |

## Browser workspace

| Location | Responsibility | Future edits |
| --- | --- | --- |
| `apps/web/public/index.html` | Accessible tabs, forms, result containers, roadmap labels | Workspace structure/copy |
| `apps/web/public/app.js` | API calls, filters, evidence rendering, history, exports | Browser behavior; keep deterministic logic server-side |
| `apps/web/public/styles.css` | Responsive layout, states, evidence cards, accessibility | Visual/system styles |

## Tests and fixtures

- `tests/crawler/`: URL, safety, fetch, resources, bounded multi-page crawl.
- `tests/parser/`, `tests/entities/`, `tests/rules/`, `tests/analyzers/`: extraction, evidence, stable rule/analyzer behavior.
- `tests/comparison/`: ordering, eligibility, metrics, gaps, history.
- `tests/storage/`: JSON corruption/alignment/history semantics and SQLite migration/round-trip behavior.
- `tests/proposals/`, `tests/verification/`, `tests/reports/`: artifact, recrawl, and export contracts.
- `tests/ai/`, `tests/visibility/`: mock-only AI validation and isolated manual observation persistence.
- `tests/analyzer/`: API integration, comparison persistence/reopen/history, frontend source regression, environment validation.
- `fixtures/verification/original.html` and `corrected.html`: deterministic no-network before/after pages.

## Documentation

- `README.md`: product/setup/workflow summary.
- `docs/architecture.md`: boundaries and data flow.
- `docs/methodology.md`: evidence, comparison, history, non-causation method.
- `docs/api.md`: route/input/output behavior.
- `docs/storage.md`: adapter and migration details.
- `docs/deployment.md`: Render/operations/fixture fallback.
- `docs/demo-guide.md`: exact operator walkthrough.
- `docs/decision-log.md`: consequential choices.
- `docs/build-journal.md`: verified execution record.
- `docs/change-report.md`: final acceptance handoff.

Generated locations: `dist/` contains TypeScript output; `data/` contains ignored runtime data. Neither should be hand-edited.
