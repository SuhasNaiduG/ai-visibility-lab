# Methodology

## Evidence classes

The interface and data model distinguish:

1. **Observed evidence**: public response metadata, DOM text/markup, links, resources, and deterministic counts captured at a time.
2. **Deterministic inference**: rule/analyzer interpretation derived entirely from observed fields.
3. **Editorial heuristic**: a transparent review threshold or lexical pattern, never a ranking law.
4. **Proposal**: a draft implementation artifact that requires factual and professional review.
5. **Manual observation**: user-entered rank/citation context that the lab did not collect or verify.
6. **Optional AI interpretation**: schema-validated downstream commentary citing preserved evidence IDs.

Every finding includes source evidence, stable rule ID/version, interpretation, implementation direction, expected observable outcome, verification, confidence, and limitation. Malformed JSON-LD, unsuccessful resources, redirects, blocked pages, and partial crawls remain visible.

## Acquisition

URLs are normalized before use. The crawler rejects unsafe hosts and redirect targets, enforces time/body/redirect/content-type bounds, and records the final response. Multi-page projects are same-origin breadth-first traversals with deterministic queue order. Fragments and known campaign parameters (`utm_*`, `gclid`, `fbclid`, `msclkid`) do not create duplicate identities; other query parameters remain and are sorted.

The crawl uses `User-agent: *` allow/disallow rules with longest-match precedence and discovers sitemap URLs where practical. This is bounded RFC-informed behavior, not a full search-engine crawler implementation. A `robots.txt` file is not authorization.

## Parsing and normalization

The parser preserves raw response evidence while separately exposing normalized visible text, questions, answer candidates, headings, links, JSON-LD types/errors, image-alt issues, and coverage signals. Markup/entities and whitespace are normalized; navigation/footer noise, malformed fragments, oversized question candidates, and normalized duplicates are bounded by deterministic rules.

Static source is analyzed without executing client JavaScript. Missing evidence can mean the fact is absent from this response, dynamically rendered, inaccessible, differently phrased, outside the page, or unsupported by the extractor.

## Rules and analyzer library

Finding rules are pure functions with version `1.0.0`. The analyzer library version is `1.0.0` and returns `observed`, `partially-observed`, `not-observed`, `needs-human-review`, or `not-applicable`.

Analyzer groups:

- **technical**: retrieval status, indexability, canonical, heading structure, image alternatives, structured data;
- **content-answerability**: visible questions/answers, pricing, insurance, process, risks, alternatives, eligibility, dates;
- **entities**: organization, service, location, contact, provider/author, schema-visible consistency;
- **trust-YMYL**: credentials, medical review, citations, policies, testimonials/cases, associations/publications, financing;
- **retrieval-support**: answer extractability, definitions, section clarity, entity naming, component evidence density.

Lexical presence is not truth, completeness, authority, professional adequacy, ranking impact, or citation likelihood. Trust and YMYL observations frequently require human review even when text is present.

## Comparison eligibility

Each site is `eligible`, `degraded`, or `ineligible`. Transport success alone is insufficient: bounded access-denied, CAPTCHA, security, error, empty, or near-empty evidence can make a 200 response unusable. Normal page signals include title, description, H1/headings, links, and schema.

- Ineligible competitors remain in raw rows but are excluded from every benchmark.
- If the target is ineligible or no eligible/degraded competitor remains, conclusions are unavailable.
- Any degraded/ineligible site makes otherwise available conclusions partial.
- Target remains order 0; competitors preserve submitted order 1–5 regardless of asynchronous completion.

## Comparison metrics and rules

The matrix contains 43 raw/context metrics spanning response/indexability/resources, metadata, headings, content/answerability, structured data, links/media, and lexical coverage. There is no weighted composite.

Boolean rules compare observed presence. Scalar rules use declared thresholds, including 100 words, two headings, three internal links, and one-unit differences for questions, answers, missing alt, heading issues, JSON-LD errors, anchors, services, and locations. Reverse rules make fewer errors/issues favorable. Set rules expose competitor-only schema types, topics, and questions. Each emitted finding carries the exact target/benchmark values and threshold.

Counts are prompts for inspection, not objectives to maximize. In particular, word count is not quality, more schema is not automatically better, and a missing-alt count must be reviewed against total/decorative images.

## Proposals

Artifacts are derived from target gaps and carry this boundary:

> Proposal — requires factual and professional review before publication.

They link the source finding/evidence, proposed artifact, assumptions, facts to confirm, reviewer requirement, and verification steps. The system never invents credentials, reviews, ratings, offices, awards, certifications, medical claims, prices, insurance acceptance, or guarantees.

## History semantics

The newest prior run with the same normalized submitted target URL is the baseline. Redirect destinations are evidence, not identity. Pages pair by normalized submitted URL. Competitor additions/removals are separate from relative reordering.

Tracked changes are grouped as technical, metadata, schema, headings, content, links, and media. Rule IDs become new/resolved/unchanged; when either paired page is ineligible, non-technical content comparison is withheld and differing rules are indeterminate. Manual rank comparison also requires a matching normalized query label and comparable target evidence.

Verification compares `ruleId@ruleVersion` and analyzer ID/version/status, links current findings to prior proposals, summarizes pages/sites, and reports evidence diffs. Every report states:

> Website changes and observed visibility changes occurred during the same interval. This does not establish causation.

## Visibility observations

Manual observations record query, engine, location, device, date, rank and/or citation, optional citation/reference/screenshot locations, and notes. They are not automatically verified. Provider interfaces exist, but the API truthfully returns no active automated providers.

## Research sources

Registry version `1.0.0` separates standards/official guidance/schema/accessibility sources from bounded internal heuristics. Source support applies only to the stated claim; it never converts an observable page signal into a guaranteed visibility outcome. See `docs/research-sources.md`.

## Known blind spots

The system cannot observe private analytics, conversions, revenue, backlinks, Search Console data, actual index state, personalization, proprietary retrieval factors, dynamic-only DOM, authenticated pages, or historical rankings not supplied by a user/provider. Native fetch has a residual DNS-rebinding window. Resource discovery and robots behavior are practical subsets. Multi-page crawl remains bounded and synchronous.
