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

## History and correlation

A prior run matches when its normalized target URL equals the new run's normalized target URL. Competitor sets may change; added/removed competitors are reported. The newest matching saved run is the baseline.

Stable rule IDs allow findings to be classified as new, resolved, or unchanged. Technical/metadata/schema/heading/content/link/media values are compared separately. Manual rank delta is `current position - previous position`, so a negative number represents movement toward position 1.

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
