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
        makeAnalysis(targetUrl, { h1Count: 2, h1Text: ["One", "Two"], robotsTxtStatusCode: 404, findings: [finding("HEADING_MULTIPLE_H1"), finding("META_DESCRIPTION_MISSING")] }),
        makeAnalysis(competitorUrl)
      ]
    };
    const current = {
      targetUrl,
      competitorUrls: [competitorUrl],
      queryLabel: "Example   Query",
      rankObservations: { [targetUrl]: 5 },
      analyses: [
        makeAnalysis(targetUrl, { h1Count: 1, h1Text: ["One"], robotsTxtStatusCode: 403, findings: [finding("META_DESCRIPTION_MISSING")] }),
        makeAnalysis(competitorUrl, { schemaTypes: ["Organization", "FAQPage"] })
      ]
    };

    const result = diffRuns(previous, current);

    expect(result.previousRunId).toBe("previous-run");
    expect(result.headingChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: "target", field: "h1Count", previousValue: 2, currentValue: 1 })
    ]));
    expect(result.technicalChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: "target", field: "robotsTxtStatusCode", previousValue: 404, currentValue: 403 })
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

  it("does not report schema casing changes as additions or removals", () => {
    const targetUrl = "https://target.example/";
    const result = diffRuns(
      { id: "prior", createdAt: "2026-07-14T00:00:00.000Z", targetUrl, competitorUrls: ["https://one.example/"], queryLabel: null, rankObservations: {}, analyses: [makeAnalysis(targetUrl, { schemaTypes: ["FAQPage"] })] },
      { targetUrl, competitorUrls: ["https://one.example/"], queryLabel: null, rankObservations: {}, analyses: [makeAnalysis(targetUrl, { schemaTypes: ["faqpage"] })] }
    );
    expect(result.schemaChanges).toEqual([]);
  });

  it("reports competitor reordering separately from membership changes", () => {
    const target = "https://target.example/";
    const a = "https://a.example/";
    const b = "https://b.example/";
    const c = "https://c.example/";
    const analyses = (urls: string[]) => [makeAnalysis(target), ...urls.map((url) => makeAnalysis(url))];

    const reorderOnly = diffRuns(
      { id: "prior", createdAt: "2026-07-14T00:00:00.000Z", targetUrl: target, competitorUrls: [a, b, c], queryLabel: null, rankObservations: {}, analyses: analyses([a, b, c]) },
      { targetUrl: target, competitorUrls: [c, a, b], queryLabel: null, rankObservations: {}, analyses: analyses([c, a, b]) }
    );
    expect(reorderOnly.competitorChanges.addedUrls).toEqual([]);
    expect(reorderOnly.competitorChanges.removedUrls).toEqual([]);
    expect(reorderOnly.competitorChanges.ordering).toEqual(expect.objectContaining({
      previousOrder: [a, b, c],
      currentOrder: [c, a, b],
      orderChanged: true
    }));
    expect(reorderOnly.competitorChanges.ordering.moves.map((move) => move.normalizedUrl)).toEqual([c, a, b]);

    const membershipOnly = diffRuns(
      { id: "prior", createdAt: "2026-07-14T00:00:00.000Z", targetUrl: target, competitorUrls: [a, b, c], queryLabel: null, rankObservations: {}, analyses: analyses([a, b, c]) },
      { targetUrl: target, competitorUrls: ["https://x.example/", a, c], queryLabel: null, rankObservations: {}, analyses: analyses(["https://x.example/", a, c]) }
    );
    expect(membershipOnly.competitorChanges.addedUrls).toEqual(["https://x.example/"]);
    expect(membershipOnly.competitorChanges.removedUrls).toEqual([b]);
    expect(membershipOnly.competitorChanges.ordering.orderChanged).toBe(false);
    expect(membershipOnly.competitorChanges.ordering.moves).toEqual([]);

    const mixed = diffRuns(
      { id: "prior", createdAt: "2026-07-14T00:00:00.000Z", targetUrl: target, competitorUrls: [a, b, c], queryLabel: null, rankObservations: {}, analyses: analyses([a, b, c]) },
      { targetUrl: target, competitorUrls: [c, "https://d.example/", a], queryLabel: null, rankObservations: {}, analyses: analyses([c, "https://d.example/", a]) }
    );
    expect(mixed.competitorChanges.addedUrls).toEqual(["https://d.example/"]);
    expect(mixed.competitorChanges.removedUrls).toEqual([b]);
    expect(mixed.competitorChanges.ordering.orderChanged).toBe(true);
    expect(mixed.competitorChanges.ordering.moves.map((move) => move.normalizedUrl)).toEqual([c, a]);
  });

  it("matches history by normalized submitted URL instead of final URL or array index", () => {
    const target = "https://target.example/";
    const a = "https://a.example/";
    const b = "https://b.example/";
    const previous = {
      id: "prior",
      createdAt: "2026-07-14T00:00:00.000Z",
      targetUrl: target,
      competitorUrls: [a, b],
      queryLabel: null,
      rankObservations: {},
      analyses: [makeAnalysis(target), makeAnalysis(a, { wordCount: 300 }), makeAnalysis(b, { wordCount: 400 })]
    };
    const current = {
      targetUrl: target,
      competitorUrls: [b, a],
      queryLabel: null,
      rankObservations: {},
      analyses: [
        makeAnalysis(target),
        makeAnalysis(b, { wordCount: 410 }),
        makeAnalysis(a, { wordCount: 320, finalUrl: "https://www.a.example/landing" })
      ]
    };

    const result = diffRuns(previous, current);

    expect(result.competitorChanges.addedUrls).toEqual([]);
    expect(result.competitorChanges.removedUrls).toEqual([]);
    expect(result.contentCountChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ siteKey: a, previousValue: 300, currentValue: 320 }),
      expect.objectContaining({ siteKey: b, previousValue: 400, currentValue: 410 })
    ]));
    expect(result.technicalChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ siteKey: a, field: "finalUrl", previousSourceUrl: a, currentSourceUrl: "https://www.a.example/landing" })
    ]));
  });

  it("keeps finding changes indeterminate when retrieval eligibility prevents content comparison", () => {
    const target = "https://target.example/";
    const competitor = "https://competitor.example/";
    const result = diffRuns(
      {
        id: "prior",
        createdAt: "2026-07-14T00:00:00.000Z",
        targetUrl: target,
        competitorUrls: [competitor],
        queryLabel: null,
        rankObservations: {},
        analyses: [makeAnalysis(target), makeAnalysis(competitor, { findings: [finding("META_DESCRIPTION_MISSING")] })]
      },
      {
        targetUrl: target,
        competitorUrls: [competitor],
        queryLabel: null,
        rankObservations: {},
        analyses: [
          makeAnalysis(target),
          makeAnalysis(competitor, { statusCode: 403, title: "Access denied", visibleText: "Access denied", wordCount: 2, findings: [] })
        ]
      }
    );

    expect(result.findingChanges[1]).toEqual(expect.objectContaining({
      newRuleIds: [],
      resolvedRuleIds: [],
      indeterminateRuleIds: ["META_DESCRIPTION_MISSING"]
    }));
    expect(result.contentCountChanges.filter((change) => change.siteKey === competitor)).toEqual([]);
    expect(result.technicalChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ siteKey: competitor, field: "comparisonEligibility", previousValue: "eligible", currentValue: "ineligible" })
    ]));
  });
});
