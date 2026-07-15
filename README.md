# AI Visibility Engineering Lab

A deterministic-first platform for collecting public website evidence, applying explainable rules, comparing a target page with competitors, and monitoring changes across saved runs.

The project follows:

```text
Observe → Measure → Analyze → Implement → Verify → Monitor
```

It does not call an AI API, predict rankings, simulate a proprietary search system, or produce a synthetic “AI visibility score.” Results are raw observations, labeled editorial heuristics, structured evidence, and transparent deltas.

## Current capabilities

- Normalizes public HTTP/HTTPS URLs and rejects local, private, link-local, reserved, and unsafe redirect targets.
- Fetches bounded HTML with a timeout, clear user agent, manual redirects, response timing, and redirect evidence.
- Checks public `robots.txt` and `sitemap.xml` resources through the same network policy.
- Extracts metadata, canonical/indexability signals, language, viewport, headings, normalized visible text, questions, FAQ/direct-answer indicators, JSON-LD and parse errors, schema types, social metadata, links, anchors, images, and alt-text issues.
- Preserves inspectable entity, service, location, trust, contact, and content-section term evidence.
- Applies stable deterministic rules. Every finding includes evidence, impact context, exact implementation direction, expected outcome, verification method, priority, and effort.
- Compares one target with one to three competitors through the same analyzer path, with raw matrix values and evidence-backed target gaps/advantages.
- Accepts optional manual rank observations and labels them as manual; it does not collect rankings automatically.
- Saves comparison runs in an atomic JSON-file store and diffs later matching runs without claiming causation.
- Serves a minimal browser interface for analysis, comparison, normalized evidence, reviewed implementation proposals, fixture verification, limitations, and run history.

## Architecture

```text
Browser interface
  → Express API and orchestration
    → URL/network policy and crawler
    → HTML parser and coverage extraction
    → deterministic rule engine
    → transparent comparison
    → JSON run storage and historical diff
  → structured JSON response
```

The browser never contains analysis rules. Fetching, parsing, rules, comparison, and persistence are separate typed modules. See [`docs/architecture.md`](docs/architecture.md) and [`docs/file-map.md`](docs/file-map.md).

## Requirements and setup

- Node.js 20 or newer
- npm

```powershell
npm install
npm test
npm run build
npm run dev
```

Open `http://localhost:3000`. Configuration defaults are documented in `.env.example`; no secrets are required.

Production-style local start after building:

```powershell
npm run build
npm start
```

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the local service with TypeScript watch mode |
| `npm test` | Run the deterministic Vitest suite |
| `npm run build` | Compile all strict TypeScript |
| `npm start` | Run compiled output from `dist/` |
| `npm run test:watch` | Rerun tests while editing |

## API examples

Health:

```http
GET /health
```

Single-page evidence and findings:

```http
POST /api/analyze
Content-Type: application/json

{
  "url": "https://425clearaligners.com"
}
```

Comparison and saved history:

```http
POST /api/compare
Content-Type: application/json

{
  "targetUrl": "https://425clearaligners.com",
  "competitorUrls": ["https://competitor.example"],
  "queryLabel": "clear aligners Bellevue",
  "rankObservations": {
    "https://425clearaligners.com": 8
  }
}
```

Run history:

```http
GET /api/runs
GET /api/runs/:id
GET /api/runs/latest?targetUrl=https%3A%2F%2F425clearaligners.com
```

All API errors use a stable envelope:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Request validation failed",
    "details": {}
  }
}
```

See [`docs/api.md`](docs/api.md) for contracts and status behavior.

## Evidence and limitations

The application can directly observe only public responses and page content at crawl time. It cannot know private traffic, conversions, revenue, Search Console data, backlinks, true historical rankings, or proprietary search/AI factors. Manual positions are user-supplied observations. A change occurring near a rank observation is correlation only, never proof of causation.

Metadata-length, content-breadth, and low-link thresholds are clearly labeled editorial heuristics rather than ranking laws. Competitor-only topics and schema are research prompts, not instructions to copy wording or fabricate content. Structured-data guidance must match truthful visible content.

The JSON store is suitable for a local single-process MVP, not multi-instance production deployment. The SSRF policy validates DNS immediately before native fetch, but a lower-level transport would be needed to eliminate the residual DNS-rebinding time-of-check/time-of-use window.

The service has no authentication or rate limiting and is intended for a trusted local interface. It parses bounded static response bodies without a content-type gate or JavaScript rendering, checks only the conventional root resource URLs, resolves relative URLs without applying an HTML `base` element, and treats exact hostnames as the internal-link boundary. These limits are fully inventoried in [`docs/change-report.md`](docs/change-report.md).

## Data and configuration

Generated history is written under `data/` and ignored by Git. Only `data/.gitkeep` is tracked. `.env` files and secrets are ignored. No AI, SERP, analytics, or database credential is needed.

## Roadmap

### Working now

- Single-page analysis, competitor comparison, evidence-backed findings, a factual-review implementation proposal, deterministic before/after fixture verification, and saved run history.

### Future modules

All items below are **Planned — not enabled in this prototype.**

- Multi-Page Crawling: inspect a bounded set of pages.
- AI Interpretation: optional interpretation over preserved deterministic evidence.
- Automated Rank Tracking: verified external observations.
- PDF Reports: export an evidence report.
- Database Storage: durable multi-user persistence.
- Advanced E-E-A-T: additional transparent evidence checks.
- Advanced Analyzer Library: more deterministic analyzers.
- Interface Redesign: broader presentation work.

## Screenshots

The local interface supports screenshots of single-site analysis, comparison, history, and evidence-backed findings. Screenshots are intentionally not committed because results depend on live public pages and generated local run data.
