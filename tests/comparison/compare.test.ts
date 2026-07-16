import { describe, expect, it } from "vitest";
import { compareAnalyses } from "../../packages/comparison/compare.js";
import { COMPARISON_INCOMPLETE_MESSAGE } from "../../packages/comparison/eligibility.js";
import type { Evidence } from "../../packages/rules/types.js";
import { makeAnalysis, makeCoverage } from "../helpers/analysis.js";

function expectStructuredEvidence(items: Evidence[], sourceUrl: string): void {
  expect(items.length).toBeGreaterThan(0);
  for (const item of items) {
    expect(item).toEqual(expect.objectContaining({
      sourceUrl,
      field: expect.any(String),
      fetchedAt: expect.any(String)
    }));
    expect(item.field.length).toBeGreaterThan(0);
    expect(Object.prototype.hasOwnProperty.call(item, "observedValue")).toBe(true);
    expect(Number.isNaN(Date.parse(item.fetchedAt))).toBe(false);
  }
}

describe("compareAnalyses", () => {
  it("returns transparent gaps, advantages, raw matrix metrics, and competitor-only evidence", () => {
    const target = makeAnalysis("https://target.example/", {
      wordCount: 180,
      imagesMissingAlt: 0,
      detectedQuestions: [],
      schemaTypes: ["Organization"],
      coverage: makeCoverage({
        contentSection: { present: true, count: 1, terms: ["treatment"], signals: [] }
      })
    });
    const competitor = makeAnalysis("https://competitor.example/", {
      wordCount: 650,
      imagesMissingAlt: 2,
      detectedQuestions: ["How long does treatment take?"],
      questionCount: 1,
      schemaTypes: ["Organization", "FAQPage"],
      coverage: makeCoverage({
        contentSection: { present: true, count: 2, terms: ["treatment", "consultation"], signals: [] }
      })
    });

    const result = compareAnalyses({
      target,
      competitors: [competitor],
      queryLabel: "example treatment",
      rankObservations: { "https://target.example": 8 }
    });

    expect(result.matrix).toHaveLength(2);
    expect(result.matrix[0]?.manualRankObservation).toBe(8);
    expect(result.targetGaps.map((gap) => gap.gapId)).toEqual(expect.arrayContaining([
      "GAP_CONTENT_BREADTH",
      "GAP_COMPETITOR_ONLY_SCHEMA",
      "GAP_COMPETITOR_ONLY_TOPICS",
      "GAP_COMPETITOR_ONLY_QUESTIONS"
    ]));
    expect(result.targetAdvantages.map((item) => item.advantageId)).toContain("ADV_IMAGE_ALT");
    expect(result.targetGaps.find((gap) => gap.gapId === "GAP_CONTENT_BREADTH")?.delta).toEqual({
      targetValue: 180,
      benchmarkValue: 650,
      difference: 470,
      threshold: 100,
      interpretation: "target-below-benchmark"
    });
    expect(result.targetAdvantages.find((item) => item.advantageId === "ADV_IMAGE_ALT")?.delta).toEqual({
      targetValue: 0,
      benchmarkValue: 2,
      difference: 2,
      threshold: 1,
      interpretation: "target-below-benchmark"
    });
    expect(result.competitorOnlySchemaTypes).toEqual(["FAQPage"]);
    expect(result.targetGaps.length).toBeGreaterThan(0);
    for (const gap of result.targetGaps) {
      expectStructuredEvidence(gap.targetEvidence, target.finalUrl);
      expect(gap.competitorEvidence.length).toBeGreaterThan(0);
      expect(gap.competitorEvidence.some((item) => item.benchmark === true)).toBe(true);
      for (const competitorItem of gap.competitorEvidence) {
        expect(competitorItem).toEqual(expect.objectContaining({
          sourceUrl: competitor.finalUrl,
          normalizedUrl: competitor.normalizedUrl,
          inputOrder: 1,
          benchmark: expect.any(Boolean)
        }));
        expect(Object.prototype.hasOwnProperty.call(competitorItem, "observedValue")).toBe(true);
        expectStructuredEvidence(competitorItem.evidence, competitorItem.sourceUrl);
      }
    }
    expect(result.limitations.join(" ")).toMatch(/not proof|cannot see|does not measure/i);
  });

  it("accepts five competitors and rejects comparisons outside the one-to-five limit", () => {
    expect(() => compareAnalyses({ target: makeAnalysis("https://target.example/"), competitors: [] })).toThrow("one to five");
    const five = [1, 2, 3, 4, 5].map((value) => makeAnalysis(`https://competitor-${value}.example/`));
    expect(compareAnalyses({ target: makeAnalysis("https://target.example/"), competitors: five }).matrix.map((row) => row.inputOrder)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(() => compareAnalyses({
      target: makeAnalysis("https://target.example/"),
      competitors: [1, 2, 3, 4, 5, 6].map((value) => makeAnalysis(`https://competitor-${value}.example/`))
    })).toThrow("one to five");
  });

  it("uses the strongest observed benchmark across multiple competitors", () => {
    const target = makeAnalysis("https://target.example/", { wordCount: 100 });
    const competitors = [
      makeAnalysis("https://one.example/", { wordCount: 180 }),
      makeAnalysis("https://two.example/", { wordCount: 500 })
    ];
    const result = compareAnalyses({ target, competitors });
    const gap = result.targetGaps.find((item) => item.gapId === "GAP_CONTENT_BREADTH");
    expect(result.matrix).toHaveLength(3);
    expect(gap?.delta).toEqual(expect.objectContaining({ benchmarkValue: 500, difference: 400 }));
    expect(gap?.competitorEvidence).toHaveLength(2);
    expect(gap?.competitorEvidence.map((item) => item.normalizedUrl)).toEqual([
      "https://one.example/",
      "https://two.example/"
    ]);
  });

  it("keeps target-first input order and excludes an unusable competitor from every benchmark conclusion", () => {
    const target = makeAnalysis("https://target.example/", {
      wordCount: 100,
      schemaTypes: ["Organization"]
    });
    const validCompetitor = makeAnalysis("https://valid.example/", {
      wordCount: 650,
      schemaTypes: ["Organization", "FAQPage"]
    });
    const invalidCompetitor = makeAnalysis("https://blocked.example/", {
      statusCode: 403,
      wordCount: 10_000,
      schemaTypes: ["Organization", "Product"]
    });

    const result = compareAnalyses({
      target,
      competitors: [validCompetitor, invalidCompetitor],
      sites: [
        { role: "target", inputOrder: 0, inputUrl: "target.example", normalizedUrl: target.normalizedUrl },
        { role: "competitor", inputOrder: 1, inputUrl: "valid.example", normalizedUrl: validCompetitor.normalizedUrl },
        { role: "competitor", inputOrder: 2, inputUrl: "blocked.example", normalizedUrl: invalidCompetitor.normalizedUrl }
      ]
    });

    expect(result.conclusionStatus).toBe("partial");
    expect(result.excludedCompetitorUrls).toEqual([invalidCompetitor.normalizedUrl]);
    expect(result.sites).toMatchObject([
      { role: "target", inputOrder: 0, inputUrl: "target.example", normalizedUrl: target.normalizedUrl },
      { role: "competitor", inputOrder: 1, inputUrl: "valid.example", normalizedUrl: validCompetitor.normalizedUrl },
      { role: "competitor", inputOrder: 2, inputUrl: "blocked.example", normalizedUrl: invalidCompetitor.normalizedUrl }
    ]);
    expect(result.matrix.map(({ role, inputOrder, inputUrl, url }) => ({ role, inputOrder, inputUrl, url }))).toEqual([
      { role: "target", inputOrder: 0, inputUrl: "target.example", url: target.normalizedUrl },
      { role: "competitor", inputOrder: 1, inputUrl: "valid.example", url: validCompetitor.normalizedUrl },
      { role: "competitor", inputOrder: 2, inputUrl: "blocked.example", url: invalidCompetitor.normalizedUrl }
    ]);
    expect(result.matrix[2]).toEqual(expect.objectContaining({
      eligibility: expect.objectContaining({ status: "ineligible", usableAsBenchmark: false }),
      metrics: expect.objectContaining({ statusCode: 403, wordCount: 10_000 })
    }));

    const breadthGap = result.targetGaps.find((item) => item.gapId === "GAP_CONTENT_BREADTH");
    expect(breadthGap?.delta).toEqual(expect.objectContaining({ benchmarkValue: 650, difference: 550 }));
    expect(breadthGap?.competitorEvidence).toHaveLength(1);
    expect(breadthGap?.competitorEvidence[0]).toEqual(expect.objectContaining({
      sourceUrl: validCompetitor.finalUrl,
      normalizedUrl: validCompetitor.normalizedUrl,
      inputOrder: 1
    }));
    expect(result.competitorOnlySchemaTypes).toEqual(["FAQPage"]);
    expect(result.competitorOnlySchemaTypes).not.toContain("Product");
  });

  it("does not let a 403 competitor create either a target gap or advantage", () => {
    const target = makeAnalysis("https://target.example/", { wordCount: 300, imagesMissingAlt: 0 });
    const validCompetitor = makeAnalysis("https://valid.example/", { wordCount: 300, imagesMissingAlt: 0 });
    const blockedCompetitor = makeAnalysis("https://blocked.example/", {
      statusCode: 403,
      wordCount: 10_000,
      imagesMissingAlt: 5
    });

    const result = compareAnalyses({ target, competitors: [validCompetitor, blockedCompetitor] });

    expect(result.targetGaps.map((gap) => gap.gapId)).not.toContain("GAP_CONTENT_BREADTH");
    expect(result.targetAdvantages.map((advantage) => advantage.advantageId)).not.toContain("ADV_IMAGE_ALT");
    expect(result.targetGaps.flatMap((gap) => gap.competitorEvidence.map((evidence) => evidence.normalizedUrl))).not.toContain(blockedCompetitor.normalizedUrl);
    expect(result.targetAdvantages.flatMap((advantage) => advantage.competitorEvidence.map((evidence) => evidence.normalizedUrl))).not.toContain(blockedCompetitor.normalizedUrl);
  });

  it("reports an unavailable conclusion while preserving raw target retrieval evidence", () => {
    const target = makeAnalysis("https://target.example/", {
      statusCode: 403,
      title: null,
      titleLength: 0,
      metaDescription: null,
      metaDescriptionLength: 0,
      canonicalUrl: null,
      canonicalStatus: "missing",
      documentLanguage: null,
      viewportPresent: false,
      h1Count: 0,
      h1Text: [],
      robotsTxtAvailable: false,
      robotsTxtStatusCode: 404
    });
    const competitor = makeAnalysis("https://competitor.example/");

    const result = compareAnalyses({ target, competitors: [competitor] });
    const targetMetrics = result.matrix[0]?.metrics;

    expect(targetMetrics).toEqual(expect.objectContaining({
      statusCode: 403,
      indexable: false,
      robotsTxtAvailable: false,
      robotsTxtStatusCode: 404,
      canonicalStatus: "missing",
      documentLanguage: null
    }));
    expect(result.sites.map(({ role, inputOrder }) => ({ role, inputOrder }))).toEqual([
      { role: "target", inputOrder: 0 },
      { role: "competitor", inputOrder: 1 }
    ]);
    expect(result.sites[0]?.eligibility).toEqual(expect.objectContaining({
      status: "ineligible",
      usableAsBenchmark: false,
      reasons: [expect.objectContaining({ code: "NON_SUCCESS_HTTP" })]
    }));
    expect(result.sites[1]?.eligibility.status).toBe("eligible");
    expect(result.conclusionStatus).toBe("unavailable");
    expect(result.incompleteMessage).toBe(COMPARISON_INCOMPLETE_MESSAGE);
    expect(result.excludedCompetitorUrls).toEqual([]);
    expect(result.targetGaps).toEqual([]);
    expect(result.targetAdvantages).toEqual([]);
    expect(result.competitorOnlySchemaTypes).toEqual([]);
    expect(result.competitorOnlyTopics).toEqual([]);
    expect(result.competitorOnlyQuestions).toEqual([]);
  });
});
