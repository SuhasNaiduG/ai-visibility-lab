# AI Visibility Engineering Lab
## Rooz Demo Build Specification — Final Submission Build

### Purpose

This build is intended to prove that the project can:

1. investigate a real public website;
2. collect deterministic technical and content evidence;
3. compare the target with real competitors;
4. explain why observed differences may matter;
5. generate exact implementation guidance;
6. verify before-and-after improvements;
7. preserve historical runs and relate observed website changes to manually recorded ranking changes without claiming causation;
8. demonstrate clean engineering, tests, Git discipline, and room for growth.

The first case-study target remains:

```text
https://425clearaligners.com
```

The final product should be strong enough to demonstrate in a short video without requiring the reviewer to open the repository.

---

# 1. Non-negotiable rules

Work only inside the current repository:

```text
C:\Users\User_2\Documents\Projects\ai-visibility-lab
```

Do not:

- create a second repository;
- rewrite the project from scratch;
- replace deterministic analysis with one AI prompt;
- create fake SEO or AI-visibility scores;
- claim ranking guarantees;
- claim that observed changes caused ranking changes;
- invent credentials, reviews, medical claims, addresses, awards, or certifications;
- silently hide failed crawls;
- treat blocked or empty competitor pages as valid benchmarks;
- make one giant commit.

Preserve:

- current architecture;
- Git history;
- tests;
- existing analyzer;
- comparison engine;
- storage;
- documentation;
- minimal UI;
- current file map and build journal.

---

# 2. Fix all known production issues first

Before adding new analyzers, reproduce and resolve the remaining comparison-save failure:

```text
POST /api/compare
→ 500
→ RUN_STORE_ERROR
→ INVALID_RECORD
```

This has occurred with both clean and tracked competitor URLs, so do not assume URL tracking parameters are the only cause.

Required debugging behavior:

1. reproduce the exact failure using the current live form;
2. log the internal validation path and reason during development;
3. identify whether the failure comes from:
   - RunRecord schema validation,
   - identity alignment,
   - comparison evidence validation,
   - history validation,
   - prior-run linkage,
   - rank mapping,
   - or storage normalization;
4. fix the root cause;
5. preserve strict validation;
6. return a truthful API error if saving genuinely fails;
7. add a regression test using the exact request shape that failed;
8. verify successful save, history listing, reopening, and latest-run lookup.

The UI must distinguish:

```text
Analysis failed
Comparison failed
Comparison completed but save failed
History failed to load
```

Do not reuse “Run history is unavailable” for unrelated failures.

---

# 3. Stable URL identity

Every analyzed page must preserve:

```ts
{
  inputUrl,
  normalizedUrl,
  identityUrl,
  finalUrl
}
```

Definitions:

- inputUrl: exact submitted value;
- normalizedUrl: syntactically normalized submitted URL;
- identityUrl: stable historical identity;
- finalUrl: actual fetched destination after redirects.

identityUrl may remove only known marketing parameters:

```text
utm_*
gclid
dclid
fbclid
msclkid
gad_source
campaignid
adgroupid
creative
keyword
matchtype
device
```

Unknown query parameters remain because they may represent real page content.

Use the same identity consistently for stored sites, prior-run matching, competitor membership, rank observations, added/removed/reordered comparisons, and latest-run lookup.

---

# 4. Comparison eligibility

Every site must be classified:

```text
eligible
degraded
ineligible
```

Exclude ineligible competitors from benchmark conclusions while preserving raw crawl evidence.

Ineligible examples:

- non-2xx response;
- access-denied page;
- CAPTCHA;
- bot challenge;
- empty response;
- error page;
- unusably thin response with no normal page evidence.

A comparison with an ineligible competitor must clearly state:

> This site did not return a usable page to the analyzer. Its raw retrieval evidence is shown, but it was excluded from competitive conclusions.

Do not convert missing data from a failed fetch into target advantages.

---

# 5. Clean evidence extraction

Correct known false positives before submission.

Reject or clean:

- placeholder values such as YOUR_STREET_ADDRESS and YOUR_ZIP;
- HTML-encoded tags inside questions;
- menu and navigation blocks ending with a question mark;
- malformed sentence fragments;
- duplicate questions with different encoding;
- extremely long “questions”;
- location fragments such as Bellevue You or Sammamish. We;
- boilerplate and footer noise;
- repeated responsive markup where appropriate.

Preserve the original raw evidence, but mark cleaned or normalized values separately.

Question extraction should decode HTML entities, strip markup, impose sensible length limits, require question-like syntax, deduplicate normalized text, identify source selector/snippet, and reject navigation-heavy blocks.

Topic extraction should reject placeholders and broken fragments, normalize case and punctuation, preserve source evidence, and avoid presenting token fragments as semantic topics.

---

# 6. High-value analyzer modules for the demo

Do not attempt every possible SEO feature. Prioritize the modules that visibly prove technical SEO and AI-retrieval understanding.

## A. Technical analyzer

Show:

- HTTP status;
- final URL and redirect chain;
- response time;
- indexability;
- robots.txt;
- sitemap.xml;
- title and meta description;
- canonical;
- language;
- viewport;
- heading hierarchy;
- JSON-LD and schema types;
- internal/external links;
- images and alt coverage;
- important response headers where available.

## B. Question and answerability analyzer

Show:

- valid detected questions;
- direct-answer pairs;
- FAQ sections;
- definitions;
- ordered steps;
- lists and tables;
- missing high-value questions compared with competitors.

## C. Topic and intent coverage analyzer

Compare coverage for real dental-aligner intents such as:

- cost;
- financing;
- insurance;
- candidacy;
- pain and discomfort;
- treatment duration;
- wear schedule;
- eating and drinking;
- cleaning;
- attachments;
- refinements;
- retainers;
- alternatives;
- risks;
- consultation;
- emergency guidance;
- doctor supervision;
- local treatment availability.

Classify section intent where defensible:

```text
informational
commercial
transactional
local
pricing
doctor/authority
FAQ
case study
insurance
appointment
```

Do not call simple keyword matching advanced semantic understanding.

## D. Trust, E-E-A-T, and YMYL analyzer

Measure only observable public evidence.

Possible signals:

- doctor name and profile;
- credentials;
- board-certification language;
- author/reviewer attribution;
- provider biography;
- medical review date;
- contact information;
- physical office information;
- privacy policy;
- terms;
- accessibility;
- medical disclaimer;
- treatment risks;
- alternatives;
- transparent pricing;
- insurance and financing;
- original case-study indicators;
- before-and-after evidence;
- reviews/testimonials on the page;
- professional associations;
- publications or teaching evidence.

Important:

- these are observed trust signals, not a Google trust score;
- do not verify credentials unless a reliable public source is integrated;
- do not infer that missing evidence means the provider lacks the credential;
- do not recommend fabricated review or medical schema.

## E. Retrieval-readiness analyzer

Present transparent metrics such as:

- page has a clear primary subject;
- provider identity is explicit;
- location is explicit;
- key questions are answered;
- answers are near their questions;
- sections can stand independently;
- structured data supports the page identity;
- factual claims have visible attribution or context;
- lists, steps, tables, and definitions make extraction easier.

Do not claim to simulate Google, ChatGPT, Gemini, or proprietary retrieval systems.

---

# 7. Side-by-side competitor comparison

Support:

```text
1 target
1–3 competitors
```

Use the exact entered order everywhere:

1. target;
2. competitor 1;
3. competitor 2;
4. competitor 3.

Every important gap must render side by side.

| Target evidence | Competitor evidence |
|---|---|
| observed metric/value | observed metric/value |
| source URL | source URL |
| selector/snippet | selector/snippet |
| fetch time | fetch time |

Below the evidence, show:

- exact difference;
- why it may matter;
- exact implementation direction;
- expected outcome;
- verification method;
- priority;
- effort;
- limitation.

Do not simply say “competitor is better.”

Also show target advantages, but only when competitors are eligible.

---

# 8. Dental-aligner comparison blueprint

The comparison should visibly check whether each site contains public evidence for these page components:

1. clear local/service H1;
2. doctor authority section;
3. provider bio link;
4. treatment process;
5. candidacy;
6. pricing;
7. insurance;
8. financing;
9. before-and-after cases;
10. patient testimonials;
11. risks and limitations;
12. treatment alternatives;
13. FAQ;
14. direct appointment CTA;
15. address and phone;
16. privacy policy;
17. accessibility;
18. terms;
19. author/reviewer information;
20. structured data supporting organization, provider, service, article, breadcrumb, and FAQ content where appropriate.

Mark each as:

```text
observed
partially observed
not observed
not applicable / needs review
```

Do not make medical recommendations. Do not generate claims not supported by the practice.

---

# 9. Implementation workspace

Create a demo-ready implementation workspace for deterministic recommendations.

For selected findings, show:

```text
Current evidence
→ Proposed implementation
→ Code or content artifact
→ Verification checklist
```

Support at minimum:

- title;
- meta description;
- canonical;
- heading hierarchy;
- missing FAQ structure;
- valid FAQ JSON-LD only when visible FAQ content exists;
- image alt guidance;
- provider/author attribution block;
- contact/trust block.

Do not automatically apply changes to live websites.

Generated artifacts must be clearly labeled as proposals requiring factual and medical review.

---

# 10. Before-and-after verification

Include one fixture-based demonstration:

```text
Original fixture
→ analyzer findings
→ corrected fixture
→ rerun
→ resolved findings
→ remaining findings
```

The video must be able to demonstrate:

- a concrete problem;
- exact implementation;
- deterministic re-analysis;
- stable rule IDs that were resolved;
- what still remains.

---

# 11. History and ranking observations

Every successful comparison run must be saved.

Later runs must show:

- new findings;
- resolved findings;
- unchanged findings;
- metadata changes;
- schema additions/removals;
- heading changes;
- question/topic changes;
- trust-signal changes;
- competitor added/removed/reordered;
- eligibility changes.

Manual rank observations are allowed.

The system must state:

> Website changes and rank changes were observed during the same interval. This does not establish causation.

Do not claim automatic ranking data unless a provider is actually configured.

---

# 12. Minimal demo-focused UI

Prioritize these screens:

## Single-site analysis

- summary;
- technical evidence;
- structured data;
- headings;
- answerability;
- trust/YMYL signals;
- findings.

## Competitor comparison

- stable site order;
- eligibility badges;
- metric matrix;
- evidence-backed gaps;
- target advantages;
- missing questions/topics;
- dental-aligner page-component coverage.

## Implementation workspace

- current evidence;
- proposed artifact;
- diff;
- verification steps.

## History

- saved runs;
- previous/current changes;
- manual rank observation changes;
- correlation disclaimer.

Avoid dashboards, animations, decorative charts, and excessive design work.

---

# 13. Export

For the submission build, support at least:

- JSON;
- Markdown.

CSV and PDF are optional only after core behavior is stable.

The Markdown report should include target, competitors, eligibility, technical findings, comparison matrix, evidence-backed gaps, implementation proposals, history changes, and limitations.

---

# 14. Tests

Add meaningful regression coverage for:

- the exact current INVALID_RECORD failure;
- successful comparison save;
- reopen saved run;
- latest matching run;
- clean and tracked URLs;
- identity consistency;
- 403 competitor exclusion;
- valid/degraded/ineligible classification;
- ordered competitors despite parallel completion;
- placeholder rejection;
- HTML-encoded question cleanup;
- navigation-question rejection;
- duplicate-question normalization;
- trust/YMYL evidence extraction;
- topic and intent comparison;
- implementation artifact generation;
- before/after resolved findings;
- history correlation disclaimer.

Run:

```text
npm test
npm run build
node --check apps/web/public/app.js
git diff --check
```

Also verify manually in a browser.

---

# 15. Git commits

Use focused commits, for example:

```text
fix: resolve comparison run validation failure
fix: normalize clean question and topic evidence
feat: add aligner trust and ymyl evidence
feat: compare question topic and intent coverage
feat: add implementation workspace
feat: verify proposed changes against fixtures
feat: export evidence report
docs: update demo architecture and handoff
```

Do not commit failing code.

---

# 16. Documentation

Update:

```text
README.md
docs/architecture.md
docs/methodology.md
docs/decision-log.md
docs/build-journal.md
docs/file-map.md
docs/api.md
docs/change-report.md
```

Create:

```text
docs/demo-guide.md
```

The demo guide must explain the exact video flow:

1. project problem;
2. analyze 425 Clear Aligners;
3. inspect evidence;
4. compare a real competitor;
5. show blocked-competitor handling;
6. inspect dental-aligner topic/trust gaps;
7. open implementation workspace;
8. show before/after verification;
9. show saved history;
10. explain limitations and next architecture step.

---

# 17. Final completion report

At completion, report:

- root cause of the current save failure;
- final commit hash;
- all commits created;
- final test results;
- build result;
- browser verification;
- files created/modified;
- feature status;
- known limitations;
- exact demo steps;
- exact commands to run;
- exact future-edit locations.

---

# Submission standard

The reviewer should understand from the video that this project demonstrates:

- source-code ability;
- technical SEO execution;
- AI retrieval and answerability understanding;
- deterministic engineering;
- evidence-backed recommendations;
- exact implementation artifacts;
- before-and-after verification;
- comparison discipline;
- historical tracking;
- testing;
- Git discipline;
- architecture for growth.

The goal is not to claim the system is finished.

The goal is to prove:

> I can investigate a visibility problem, build a deterministic system, compare real evidence, implement a fix, verify the result, and explain the engineering decisions honestly.
