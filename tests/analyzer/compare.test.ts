import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import type { Finding } from "../../packages/rules/types.js";
import { JsonRunStore } from "../../packages/storage/json-run-store.js";
import type { AnalysisResult } from "../../services/analyzer/analyze.js";
import { compareAndSaveRun } from "../../services/analyzer/compare.js";
import { makeAnalysis, makeCoverage } from "../helpers/analysis.js";

function finding(ruleId: string): Finding {
  return {
    ruleId,
    category: "heading-structure",
    problem: "Observed test issue",
    evidence: [],
    whyItMatters: "Test reason",
    exactImplementation: "Test implementation",
    expectedOutcome: "Test outcome",
    verificationMethod: "Rerun",
    priority: "medium",
    effort: "low",
    classification: "observation"
  };
}

describe("compareAndSaveRun", () => {
  it("persists the reported target and competitor request when nested coverage object key order differs", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ai-visibility-compare-history-order-"));
    const store = new JsonRunStore(join(directory, "runs.json"));
    const coverage = makeCoverage({
      contentSection: {
        present: true,
        count: 1,
        terms: ["faq"],
        signals: [{
          kind: "content-section",
          term: "faq",
          normalizedTerm: "faq",
          sourceField: "visibleText",
          snippet: "Frequently asked questions",
          method: "pattern",
          heuristic: true
        }]
      }
    });
    let version = 1;
    const analyze = vi.fn(async (url: string) => {
      const normalized = new URL(url).toString();
      const reorderedCoverage = {
        contentSection: coverage.contentSection,
        contact: coverage.contact,
        trust: coverage.trust,
        location: coverage.location,
        service: coverage.service,
        entity: coverage.entity
      };
      return makeAnalysis(normalized, {
        requestedUrl: url,
        coverage: version === 1 ? coverage : reorderedCoverage
      }) as unknown as AnalysisResult;
    });
    const input = {
      targetUrl: "https://425clearaligners.com",
      competitorUrls: ["https://porth.io/education-hub/top-bellevue-orthodontist/"]
    };

    const first = await compareAndSaveRun(input, { store, analyze });
    version = 2;
    const second = await compareAndSaveRun(input, { store, analyze });

    expect(second.history).toEqual(expect.objectContaining({ previousRunId: first.id }));
    expect(second.history?.contentCountChanges).toEqual([]);
    expect(second.history?.competitorChanges.observedChanges).toEqual([]);

    const tracked = await compareAndSaveRun({
      ...input,
      competitorUrls: ["https://porth.io/education-hub/top-bellevue-orthodontist/?utm_source=demo"]
    }, { store, analyze });

    expect(tracked.history).toEqual(expect.objectContaining({ previousRunId: second.id }));
    expect((await store.list()).map((run) => run.id)).toEqual([tracked.id, second.id, first.id]);
  });

  it("analyzes every site through one function, saves runs, and returns the prior-run diff", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ai-visibility-compare-service-"));
    const store = new JsonRunStore(join(directory, "runs.json"));
    let version = 1;
    const analyze = vi.fn(async (url: string) => {
      const normalized = new URL(url).toString();
      const isTarget = normalized.includes("target.example");
      return makeAnalysis(normalized, isTarget ? {
        wordCount: version === 1 ? 200 : 360,
        findings: version === 1 ? [finding("HEADING_MULTIPLE_H1")] : []
      } : {}) as unknown as AnalysisResult;
    });
    const input = {
      targetUrl: "https://target.example/",
      competitorUrls: ["https://competitor.example/"],
      queryLabel: "example query",
      rankObservations: { "target.example": 8 }
    };

    const first = await compareAndSaveRun(input, { store, analyze });
    expect(first.history).toBeNull();
    version = 2;
    const second = await compareAndSaveRun({ ...input, rankObservations: { "https://target.example": 5 } }, { store, analyze });

    expect(analyze).toHaveBeenCalledTimes(4);
    expect(second.history).toEqual(expect.objectContaining({
      previousRunId: first.id,
      findingChanges: expect.arrayContaining([
        expect.objectContaining({ sourceUrl: "https://target.example/", resolvedRuleIds: ["HEADING_MULTIPLE_H1"] })
      ]),
      rankObservationChanges: [expect.objectContaining({ previous: 8, current: 5, delta: -3, source: "manual" })]
    }));
    expect(second.history?.contentCountChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: "target", field: "wordCount", previousValue: 200, currentValue: 360 })
    ]));
    expect((await store.list()).map((run) => run.id)).toEqual([second.id, first.id]);
  });

  it("reassembles parallel analyses in submitted target-first order and persists stable identities", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ai-visibility-compare-order-"));
    const store = new JsonRunStore(join(directory, "runs.json"));
    const input = {
      targetUrl: "https://target.example/",
      competitorUrls: [
        "https://zeta.example/",
        "https://alpha.example/",
        "https://middle.example/"
      ]
    };
    const pending = new Map<string, (analysis: AnalysisResult) => void>();
    const analyze = vi.fn((url: string) => new Promise<AnalysisResult>((resolve) => {
      pending.set(url, resolve);
    }));

    const runPromise = compareAndSaveRun(input, { store, analyze });
    expect(analyze).toHaveBeenCalledTimes(4);
    for (const url of [input.competitorUrls[1]!, input.competitorUrls[2]!, input.targetUrl, input.competitorUrls[0]!]) {
      pending.get(url)!(makeAnalysis(new URL(url).toString()) as unknown as AnalysisResult);
    }

    const run = await runPromise;
    const expectedOrder = [input.targetUrl, ...input.competitorUrls].map((url) => new URL(url).toString());
    expect(run.analyses.map((analysis) => analysis.normalizedUrl)).toEqual(expectedOrder);
    expect(run.sites.map((site) => site.normalizedUrl)).toEqual(expectedOrder);
    expect(run.sites.map((site) => site.inputOrder)).toEqual([0, 1, 2, 3]);
    expect(run.sites.map((site) => site.role)).toEqual(["target", "competitor", "competitor", "competitor"]);
    expect(run.comparison.matrix.map((row) => row.url)).toEqual(expectedOrder);
    expect(run.competitorUrls).toEqual(expectedOrder.slice(1));
    expect((await store.get(run.id))?.sites.map((site) => site.normalizedUrl)).toEqual(expectedOrder);
  });
});
