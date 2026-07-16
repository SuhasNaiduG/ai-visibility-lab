# Research source registry

Registry version: `1.0.0`  
Registry access date: 2026-07-16

AI Visibility Lab separates directly observed page evidence, documented external guidance, and internal research heuristics. A source mapping explains why an observation is collected; it does not turn that observation into a search ranking factor, an AI-citation prediction, or a guarantee of any platform outcome.

The machine-readable registry is in `packages/research/sources.ts`. Each record includes a stable source ID, publisher, title, URL when external, publication and access dates, source type, supported claim, applicable analyzer IDs, confidence, and limitations.

## Primary standards and official documentation

| Source ID | Publisher | Scope used by the tool | URL |
| --- | --- | --- | --- |
| `RFC-9309` | IETF / RFC Editor | robots.txt behavior and its limits | https://www.rfc-editor.org/rfc/rfc9309 |
| `GOOGLE-ROBOTS-META` | Google Search Central | page-level robots directives for Google | https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag |
| `GOOGLE-STRUCTURED-DATA` | Google Search Central | structured-data interpretation and eligibility limits | https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data |
| `SCHEMA-ORG-ORGANIZATION` | Schema.org | organization, location, and contact vocabulary | https://schema.org/Organization |
| `SCHEMA-ORG-FAQPAGE` | Schema.org | question-and-answer vocabulary | https://schema.org/FAQPage |
| `WCAG-22-NON-TEXT` | W3C Web Accessibility Initiative | alternative-text context and exceptions | https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html |

## Internal deterministic heuristics

The `AILAB-*` records have no external URL and use `bounded` confidence. They document reproducible implementation choices for:

- technical response inspection;
- question, answer, pricing, insurance, process, risk, alternatives, eligibility, and freshness language;
- visible trust-signal inventory;
- retrieval-supporting structure and component counts.

These checks only report `observed`, `partially-observed`, `not-observed`, `needs-human-review`, or `not-applicable`. In particular:

- not observed means the fetched page did not expose supported evidence;
- lexical presence does not establish truth, completeness, quality, or regulatory sufficiency;
- structured markup does not verify the marked-up fact;
- no check predicts ranking, retrieval, citation, or model behavior;
- medical, legal, financial, credential, testimonial, and professional claims require qualified human review.

## Maintenance protocol

1. Never overwrite the meaning of an existing source ID or registry version.
2. Add a new version when a source, claim mapping, or analyzer interpretation changes materially.
3. Record the actual access date and retain product-specific scope in `notes`.
4. Map every new analyzer to one or more source records. If no defensible external source applies, create an explicitly bounded internal heuristic record.
5. Verify links and current wording before a release; external documentation can change independently of this repository.
6. Keep analyzer evidence and limitations in the saved result even when a source is later revised.
