# Decision Log

## 2026-07-15 — Extend the verified checkpoint in place

**Decision:** Keep `354df4c` as the untouched foundation and add focused commits on `main` in the existing repository.

**Why:** The checkpoint already has strict TypeScript, URL normalization, fetching, parsing, resource checks, an Express API, and passing tests. Rebuilding would discard verified behavior and history.

## 2026-07-15 — Restore the dependency manifest

**Decision:** Copy the runtime/dev dependency declarations already present in `package-lock.json` into `package.json`; add a Node 20 engine requirement.

**Why:** The checkpoint worked only because `node_modules` already existed. A fresh install saw every package as extraneous. This restores reproducibility without changing dependency versions or adding a new service.

## 2026-07-15 — Use one outbound request policy

**Decision:** Route HTML, robots, sitemap, and redirect hops through shared timeout, redirect, user-agent, size, and public-network controls.

**Why:** Separate network policies drift and can leave SSRF or hanging-request gaps. Injectable fetch/DNS seams keep normal tests offline and deterministic.

**Trade-off:** DNS is checked immediately before native fetch but the socket cannot be pinned to that exact answer, so production still needs egress controls or a lower-level transport.

## 2026-07-15 — Preserve raw evidence and stable rule IDs

**Decision:** Expand parsing before adding recommendations; keep invalid JSON-LD, empty headings/anchors, missing alt data, and source locations.

**Why:** Historical verification and credible guidance require the raw values that triggered each finding. Stable IDs make before/after resolution deterministic.

## 2026-07-15 — No aggregate visibility score

**Decision:** Return raw metrics, rule findings, metric explanations, and visible deltas.

**Why:** A weighted score would introduce arbitrary hidden assumptions and imply predictive knowledge the application does not possess.

## 2026-07-15 — Analyze competitors through the same path

**Decision:** Call the single-site analyzer for the target and every competitor, then project the same fields into a comparison matrix.

**Why:** A separate competitor parser would make deltas incomparable. Competitor tactics remain observations, not causal prescriptions.

## 2026-07-15 — JSON persistence behind an interface

**Decision:** Use a validated, atomic JSON-file adapter for the local MVP and keep the store contract separate.

**Why:** It requires no account or service and is sufficient for sequential local demonstrations. The interface permits a later SQLite/PostgreSQL adapter.

**Trade-off:** The adapter is intended for a single application process, not multi-host concurrency or large datasets.

## 2026-07-15 — Manual rank observations with a provider seam

**Decision:** Accept optional positions from the request, label them manual, and define a provider interface without implementing a provider.

**Why:** True automatic rankings require external access and vary by context. Manual values enable historical correlation demonstrations without fabricating data.

## 2026-07-15 — Static browser interface

**Decision:** Serve plain HTML, CSS, and JavaScript from Express.

**Why:** The requirement prioritizes evidence, comparison, history, and maintainability. A framework/build pipeline would add cost without improving the deterministic engine.

## 2026-07-15 — Structured deltas and explicit history inventory

**Decision:** Preserve prose explanations but also return typed target/benchmark/difference/threshold values for scalar comparisons and explicit boolean presence deltas. Track a documented field inventory rather than implying that every response byte is historically diffed.

**Why:** Machine-readable deltas make the comparison auditable, while an explicit history list prevents a false promise of complete semantic change detection.

## 2026-07-15 — Trusted-local deployment boundary

**Decision:** Document the absence of authentication, rate limiting, multi-process storage coordination, rendered-page crawling, content-type enforcement, and production egress controls instead of presenting the local MVP as deployment-ready.

**Why:** These are material operational boundaries. Making them explicit preserves the evidence-first contract and identifies the next safe engineering work.
