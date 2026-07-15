# Rooz demo guide

## Launch

```powershell
npm run build
npm start
```

Open `http://localhost:3000`.

## Three-to-five minute sequence

1. In **Single-site analysis**, analyze `https://425clearaligners.com`. Show retrieval, metadata, headings, schema, normalized questions/topics, and deterministic findings. These are observations, not a ranking prediction.
2. In **Competitor comparison**, use the same target and `https://porth.io/education-hub/top-bellevue-orthodontist/` as Competitor 1. Show target-first ordering, eligibility, the saved run ID, and the matrix.
3. Open an evidence-backed target gap. Show target evidence, eligible competitor evidence, the exact difference, implementation direction, verification method, priority, effort, and the causation limitation.
4. Show **Implementation workspace**. Its artifact is labeled **Proposal — requires factual and medical review before publication.** It is an editable review template and never changes a live website.
5. Show **Fixture verification**: original fixture → stable findings → corrected fixture → resolved/new/unchanged rule IDs. The fixture test proves the flow deterministically; it is separate from the live comparison.
6. Show **Run history**, reopen the latest record, and show the prior/current change view. Where rank observations or time-based changes appear, use this boundary: “Website changes and rank changes were observed during the same interval. This does not establish causation.”
7. End with **Prototype roadmap**. Working Now is live functionality; every Future Module is labeled **Planned — not enabled in this prototype.**

## What the demo proves

```text
Analyze → Compare → evidence-backed gap → reviewed proposal → fixture verification → saved/reopened history
```

The comparison only uses eligible competitors as benchmarks. Ineligible sites remain visible with retrieval evidence but are excluded from conclusions.

## Limits to say aloud

- One submitted page per site plus conventional root resources; no multi-page crawler or JavaScript rendering.
- Evidence is public, deterministic, and inspectable; no AI API, automatic rank provider, private analytics, proprietary visibility score, or causation claim.
- The question/topic cleanup removes obvious placeholders, markup, navigation runs, and fragments; it is not semantic interpretation.
- JSON persistence is local and single-process only. Keep generated `data/runs.json` as local application data.
