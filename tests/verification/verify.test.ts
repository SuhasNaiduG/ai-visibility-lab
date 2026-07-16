import { describe, expect, it } from "vitest";
import { compareAnalyses } from "../../packages/comparison/compare.js";
import { diffRuns } from "../../packages/comparison/diff.js";
import type { Finding } from "../../packages/rules/types.js";
import { verifyResearchRuns } from "../../packages/verification/verify.js";
import { makeAnalysis } from "../helpers/analysis.js";

describe("research run verification", () => {
  it("links resolved proposals and compares stable rule and analyzer versions", () => {
    const targetUrl = "https://target.example/";
    const competitorUrl = "https://competitor.example/";
    const previousTarget = makeAnalysis(targetUrl, {
      wordCount: 100,
      findings: [finding("CONTENT_THIN")],
      analyzerResults: analyzerResult("1.0.0", "partially-observed")
    });
    const competitor = makeAnalysis(competitorUrl, { wordCount: 600 });
    const previousComparison = compareAnalyses({ target: previousTarget, competitors: [competitor] });
    const previous = {
      id: "run-previous",
      createdAt: "2026-07-15T00:00:00.000Z",
      targetUrl,
      competitorUrls: [competitorUrl],
      queryLabel: null,
      rankObservations: {},
      sites: previousComparison.sites,
      analyses: [previousTarget, competitor],
      comparison: previousComparison,
      history: null,
      verification: null
    };
    const currentTarget = makeAnalysis(targetUrl, {
      fetchedAt: "2026-07-16T00:00:00.000Z",
      wordCount: 600,
      findings: [],
      analyzerResults: analyzerResult("1.0.0", "observed")
    });
    const currentCompetitor = makeAnalysis(competitorUrl, { fetchedAt: "2026-07-16T00:00:00.000Z", wordCount: 600 });
    const currentComparison = compareAnalyses({ target: currentTarget, competitors: [currentCompetitor] });
    const currentBase = {
      targetUrl,
      competitorUrls: [competitorUrl],
      queryLabel: null,
      rankObservations: {},
      sites: currentComparison.sites,
      analyses: [currentTarget, currentCompetitor]
    };
    const history = diffRuns(previous, currentBase);
    const report = verifyResearchRuns(previous, { ...currentBase, comparison: currentComparison, history });

    expect(report.ruleChanges.resolved).toContain("CONTENT_THIN@1.0.0");
    expect(report.analyzerChanges).toContainEqual(expect.objectContaining({
      analyzerId: "TECH_CANONICAL",
      previousVersion: "1.0.0",
      currentVersion: "1.0.0",
      classification: "changed"
    }));
    expect(report.implementationLinks).toContainEqual(expect.objectContaining({
      artifactId: "PROPOSAL_GAP_CONTENT_BREADTH",
      sourceRuleId: "GAP_CONTENT_BREADTH",
      status: "resolved"
    }));
    expect(report.siteSummary.resolvedImplementationArtifacts).toBeGreaterThan(0);
    expect(report.causationStatement).toMatch(/does not establish causation/u);
  });

  it("reports an analyzer version change separately from page status", () => {
    const target = makeAnalysis("https://target.example/", { analyzerResults: analyzerResult("1.0.0", "observed") });
    const competitor = makeAnalysis("https://competitor.example/");
    const comparison = compareAnalyses({ target, competitors: [competitor] });
    const previous = { id: "one", sites: comparison.sites, analyses: [target, competitor], comparison, history: null, verification: null };
    const currentTarget = makeAnalysis("https://target.example/", { analyzerResults: analyzerResult("2.0.0", "observed") });
    const currentComparison = compareAnalyses({ target: currentTarget, competitors: [competitor] });
    const report = verifyResearchRuns(previous, { sites: currentComparison.sites, analyses: [currentTarget, competitor], comparison: currentComparison, history: null });
    expect(report.analyzerChanges[0]).toEqual(expect.objectContaining({ classification: "changed", previousVersion: "1.0.0", currentVersion: "2.0.0" }));
  });
});

function analyzerResult(version: string, status: "observed" | "partially-observed") {
  return {
    libraryVersion: version,
    observations: [{
      analyzerId: "TECH_CANONICAL",
      analyzerVersion: version,
      group: "technical" as const,
      label: "Canonical relationship",
      status,
      observedValue: status,
      evidence: [{ sourceUrl: "https://target.example/", field: "canonicalStatus", observedValue: status, fetchedAt: "2026-07-16T00:00:00.000Z" }],
      interpretation: "Observed canonical evidence.",
      limitation: "External index state is unknown."
    }]
  };
}

function finding(ruleId: string): Finding {
  return {
    ruleId,
    ruleVersion: "1.0.0",
    category: "answerability",
    problem: "Observed thin content",
    evidence: [{ sourceUrl: "https://target.example/", field: "wordCount", observedValue: 100, fetchedAt: "2026-07-15T00:00:00.000Z" }],
    whyItMatters: "Coverage may warrant review.",
    exactImplementation: "Add only useful factual coverage.",
    expectedOutcome: "More reviewed page evidence.",
    verificationMethod: "Rerun the analyzer.",
    priority: "medium",
    effort: "medium",
    classification: "editorial-heuristic",
    confidence: "medium",
    limitation: "This is not a ranking prediction."
  };
}
