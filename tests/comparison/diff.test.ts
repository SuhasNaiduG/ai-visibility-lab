import { describe, expect, it } from "vitest";
import { diffRuns } from "../../packages/comparison/diff.js";
import type { Finding } from "../../packages/rules/types.js";
import { makeAnalysis } from "../helpers/analysis.js";

function finding(ruleId: string): Finding {
  return {
    ruleId,
    category: "heading-structure",
    problem: ruleId,
    evidence: [],
    whyItMatters: "Test evidence",
    exactImplementation: "Test implementation",
    expectedOutcome: "Test outcome",
    verificationMethod: "Rerun",
    priority: "medium",
    effort: "low",
    classification: "observation"
  };
}

describe("diffRuns", () => {
  it("reports site, finding, competitor, and manual rank changes without claiming causation", () => {
    const targetUrl = "https://target.example/";
    const competitorUrl = "https://competitor.example/";
    const previous = {
      id: "previous-run",
      createdAt: "2026-07-14T00:00:00.000Z",
      targetUrl,
      competitorUrls: [competitorUrl],
      queryLabel: "example query",
      rankObservations: { [targetUrl]: 8 },
      analyses: [
        makeAnalysis(targetUrl, { h1Count: 2, h1Text: ["One", "Two"], findings: [finding("HEADING_MULTIPLE_H1"), finding("META_DESCRIPTION_MISSING")] }),
        makeAnalysis(competitorUrl)
      ]
    };
    const current = {
      targetUrl,
      competitorUrls: [competitorUrl],
      queryLabel: "Example   Query",
      rankObservations: { [targetUrl]: 5 },
      analyses: [
        makeAnalysis(targetUrl, { h1Count: 1, h1Text: ["One"], findings: [finding("META_DESCRIPTION_MISSING")] }),
        makeAnalysis(competitorUrl, { schemaTypes: ["Organization", "FAQPage"] })
      ]
    };

    const result = diffRuns(previous, current);

    expect(result.previousRunId).toBe("previous-run");
    expect(result.headingChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: "target", field: "h1Count", previousValue: 2, currentValue: 1 })
    ]));
    expect(result.findingChanges[0]).toEqual(expect.objectContaining({
      resolvedRuleIds: ["HEADING_MULTIPLE_H1"],
      unchangedRuleIds: ["META_DESCRIPTION_MISSING"]
    }));
    expect(result.schemaChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: "competitor", change: "added", value: "FAQPage" })
    ]));
    expect(result.rankObservationChanges[0]).toEqual(expect.objectContaining({ previous: 8, current: 5, delta: -3, source: "manual" }));
    expect(result.correlationSummary.interpretation).toMatch(/does not claim.*caused/i);
  });

  it("suppresses manual rank correlation when query labels differ and tracks added or removed observations", () => {
    const targetUrl = "https://target.example/";
    const analysis = makeAnalysis(targetUrl);
    const differentQuery = diffRuns(
      { id: "prior", createdAt: "2026-07-14T00:00:00.000Z", targetUrl, competitorUrls: ["https://one.example/"], queryLabel: "query one", rankObservations: { [targetUrl]: 8 }, analyses: [analysis] },
      { targetUrl, competitorUrls: ["https://one.example/"], queryLabel: "query two", rankObservations: { [targetUrl]: 5 }, analyses: [analysis] }
    );
    expect(differentQuery.rankObservationChanges).toEqual([]);
    expect(differentQuery.rankComparisonSkippedReason).toMatch(/query labels differ/i);

    const addedRemoved = diffRuns(
      { id: "prior", createdAt: "2026-07-14T00:00:00.000Z", targetUrl, competitorUrls: ["https://one.example/"], queryLabel: "same query", rankObservations: { [targetUrl]: 8 }, analyses: [analysis] },
      { targetUrl, competitorUrls: ["https://one.example/"], queryLabel: "same query", rankObservations: { "https://one.example/": 3 }, analyses: [analysis] }
    );
    expect(addedRemoved.rankObservationChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ url: targetUrl, previous: 8, current: null, delta: null, change: "removed" }),
      expect.objectContaining({ url: "https://one.example/", previous: null, current: 3, delta: null, change: "added" })
    ]));
  });
});
