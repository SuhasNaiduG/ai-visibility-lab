import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import type { Finding } from "../../packages/rules/types.js";
import { JsonRunStore } from "../../packages/storage/json-run-store.js";
import type { AnalysisResult } from "../../services/analyzer/analyze.js";
import { compareAndSaveRun } from "../../services/analyzer/compare.js";
import { makeAnalysis } from "../helpers/analysis.js";

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
});
