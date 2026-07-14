# Methodology

## Evidence classes

The application separates three data classes:

1. **Observed website data** — response metadata, final URL, page markup/text, links, resources, and deterministic values captured at a timestamp.
2. **Estimated or manually entered rank data** — optional user-supplied positions labeled `source: manual`. The MVP does not verify or collect them.
3. **First-party analytics data** — traffic, impressions, clicks, conversions, and revenue. This class is not available or represented by the MVP.

Every finding points to structured evidence containing a source URL, field, observed value, and fetch time, plus selector/snippet details when practical. Malformed JSON-LD is preserved as parse-error evidence instead of discarded.

## Direct observations

Direct observations include HTTP/resource status, redirects, canonical values, robots directives, document language, viewport markup, heading counts/text, JSON-LD/schema types, links/domains/anchors, images/alt attributes, normalized visible text, and deterministic counts. These facts describe what the crawler received, not what a search engine necessarily indexed.

## Editorial heuristics

Title/description length, very low internal-link counts, content breadth, and some coverage comparisons are editorial heuristics. Their thresholds are transparent and their findings are labeled accordingly. They are review prompts, not ranking laws.

Question, FAQ, direct-answer, entity, service, location, trust, and contact signals use inspectable patterns and source locations. This is retrieval-readiness and answerability evidence, not advanced semantic understanding or an LLM prediction.

## Comparison method

All sites use the identical analyzer. The comparison matrix exposes raw values and short explanations. Gaps are emitted only by documented boolean, set, or numeric-delta logic. A gap says a competitor has a different observed signal and gives a truthful implementation direction; it never says to copy wording.

Competitor-only topics or schema types require human validation. A competitor implementation may be inaccurate, irrelevant, or unrelated to its performance. Structured data should be added only when it accurately represents visible target content. The system never recommends fabricating reviews, ratings, credentials, addresses, locations, medical claims, or guarantees.

### Eligibility and benchmark policy

Comparison eligibility is deterministic and evidence-backed. Body challenge/error phrases require bounded weak-page evidence so a normal article discussing CAPTCHA, security, or service errors is not treated as the challenge/error itself. A response is:

- `ineligible` when it is non-2xx, presents access-denied/bot/CAPTCHA/security/error language in the title or a short/low-evidence body, contains no extracted content, contains under 100 words with no normal page evidence, or is extremely short (under 20 words) with fewer than two normal page signals;
- `degraded` but still usable when no ineligible condition applies and it contains under 50 words, contains at least 100 words but no normal page signal, or contains under 100 words with exactly one normal page signal; or
- `eligible` when none of those conditions applies.

Normal page signals are title, description, H1, headings, links, and schema types. The classifier can therefore reject an HTTP 200 response whose visible result is an access-denied page instead of treating transport success as page success. Every reason includes a stable code and structured retrieval evidence.

All submitted sites remain visible in the raw matrix. An ineligible competitor is excluded from every scalar, boolean, and set benchmark calculation and appears in `excludedCompetitorUrls`. If the target is ineligible, or no competitor remains usable, `conclusionStatus` is `unavailable` and the comparison emits no gaps, advantages, or competitor-only sets. If at least one benchmark remains usable but any site is degraded or ineligible, the status is `partial`; otherwise it is `complete`.

Whenever any site is ineligible, `incompleteMessage` is exactly:

> Comparison incomplete: this website did not return a usable page to the analyzer. Raw retrieval evidence is shown, but it was excluded from competitive conclusions.

`incompleteMessage` is `null` when no site is ineligible, including a partial comparison caused only by degraded evidence.

### Ordered identity and side-by-side evidence

The target is always input order `0`; competitors retain submitted order `1` through `3`, regardless of asynchronous completion. Each stored `site` keeps the role, trimmed submitted URL, normalized submitted URL, final fetched URL, and eligibility. The normalized submitted URL is the stable identity; a redirect or changed final URL remains observable evidence and does not silently turn one submitted site into another.

Every emitted gap has non-empty `targetEvidence` and competitor evidence bundles. Each competitor bundle exposes its normalized identity, input order, observed value, whether it supplied the relevant benchmark, and nested evidence with source URL, field, fetch time, and selector/snippet when available. This supports a visible target-versus-competitor review without relying on positional inference or a prose-only conclusion.

## History and correlation

A prior run matches when its normalized submitted target URL equals the new run's normalized submitted target URL. The final redirected URL is evidence, not the history key. Analyses and changes are paired by normalized submitted site identity rather than final URL or array position. The newest matching saved run is the baseline.

Competitor membership and order are separate facts. `addedUrls` and `removedUrls` compare normalized submitted competitor identities. Reordering compares only competitors common to both runs, so an addition or removal alone is not mislabeled as a reorder. `ordering.previousOrder` and `currentOrder` preserve the complete normalized sequences, while `moves` records previous/current input positions for common competitors whose relative order changed.

Stable rule IDs allow findings to be classified as new, resolved, or unchanged. Technical/metadata/schema/heading/content/link/media values are compared separately. Manual rank delta is `current position - previous position`, so a negative number represents movement toward position 1.

Non-technical history is comparable only when both snapshots for that site are usable benchmarks. If either snapshot is ineligible, technical retrieval and eligibility changes remain visible, metadata/content/schema/heading/link/media differences are withheld, and differing finding IDs are reported as `indeterminateRuleIds` rather than new or resolved. If either target snapshot is ineligible, manual-rank comparison is skipped with the reason `Manual rank changes were not compared because target page eligibility made content correlation indeterminate.`

When a page change and manual rank change occur in the same interval, the report explicitly says both were observed and does not claim one caused the other. Many unobserved variables can affect discovery or ranking.

## Why there is no overall score

An aggregate “AI visibility score” would require arbitrary weights and could hide important raw differences. It could also imply a proprietary ranking or citation prediction the evidence cannot support. The lab therefore returns raw metrics, stable rules, evidence coverage, and transparent comparison gaps.

No single metric proves search ranking, visibility, conversion performance, or eligibility for citation by an AI system.

## Unknowns and blind spots

Public-page comparison cannot reveal:

- private analytics, conversions, or revenue;
- Search Console impressions/clicks unless an owned-site connector is added;
- backlinks or off-page authority;
- the page version actually retained by an external index;
- personalization, location, device, or query-specific result variation;
- proprietary search or AI retrieval/ranking factors;
- true historical rank without a verified provider or first-party record.

The crawler observes one submitted page plus two root resources. It is not yet a robots-policy-aware multi-page site crawler. Native fetch also leaves a narrow DNS-rebinding window after validation.

Static-source extraction does not execute client JavaScript or fully determine rendered CSS visibility. Relative URL resolution currently ignores an HTML `base` element, and exact hostname equality defines the internal-link boundary. A successful conventional `robots.txt` or `sitemap.xml` check means only that the checked root path returned 2xx; the MVP does not validate resource content or discover declared sitemap locations. Upstream body parsing is bounded but not gated by response content type.

Numeric comparison rules use raw count differences. In particular, missing image alt values are compared as counts rather than a ratio to total images, so the raw image volume must be reviewed alongside the gap. Coverage terms are inspectable lexical/structured signals, not a semantic topic model.

Eligibility detection is intentionally bounded. A novel challenge page may evade the known patterns, and a legitimate very short page may be degraded or excluded until a human reviews the raw response. Degraded pages remain usable benchmarks with an explicit caution; the status does not certify content quality or relevance.
