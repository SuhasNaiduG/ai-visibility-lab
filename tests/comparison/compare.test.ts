import { describe, expect, it } from "vitest";
import { compareAnalyses } from "../../packages/comparison/compare.js";
import { makeAnalysis, makeCoverage } from "../helpers/analysis.js";

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
    expect(result.targetGaps[0]?.targetEvidence[0]).toEqual(expect.objectContaining({ sourceUrl: target.finalUrl, fetchedAt: target.fetchedAt }));
    expect(result.limitations.join(" ")).toMatch(/not proof|cannot see|does not measure/i);
  });

  it("rejects comparisons outside the one-to-three competitor limit", () => {
    expect(() => compareAnalyses({ target: makeAnalysis("https://target.example/"), competitors: [] })).toThrow("one to three");
    expect(() => compareAnalyses({
      target: makeAnalysis("https://target.example/"),
      competitors: [1, 2, 3, 4].map((value) => makeAnalysis(`https://competitor-${value}.example/`))
    })).toThrow("one to three");
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
  });

  it("keeps technical and metadata signals raw and does not treat generic trust text as entity identity", () => {
    const target = makeAnalysis("https://target.example/", {
      statusCode: 500,
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
      robotsTxtStatusCode: 404,
      coverage: makeCoverage({
        trust: { present: true, count: 1, terms: ["experience"], signals: [] }
      })
    });
    const competitor = makeAnalysis("https://competitor.example/", {
      coverage: makeCoverage({
        entity: { present: true, count: 1, terms: ["Example Organization"], signals: [] }
      })
    });

    const result = compareAnalyses({ target, competitors: [competitor] });
    const targetMetrics = result.matrix[0]?.metrics;
    const gapIds = result.targetGaps.map((gap) => gap.gapId);

    expect(targetMetrics).toEqual(expect.objectContaining({
      statusCode: 500,
      indexable: false,
      robotsTxtAvailable: false,
      robotsTxtStatusCode: 404,
      canonicalStatus: "missing",
      documentLanguage: null
    }));
    expect(gapIds).toEqual(expect.arrayContaining([
      "GAP_INDEXABILITY",
      "GAP_TITLE_MISSING",
      "GAP_DESCRIPTION_MISSING",
      "GAP_CANONICAL_MISMATCH",
      "GAP_LANGUAGE_MISSING",
      "GAP_VIEWPORT_MISSING",
      "GAP_H1_STRUCTURE",
      "GAP_IDENTITY_SIGNALS"
    ]));
    expect(result.targetGaps.find((gap) => gap.gapId === "GAP_INDEXABILITY")?.delta).toEqual(expect.objectContaining({
      targetValue: false,
      benchmarkValue: true,
      interpretation: "target-absent"
    }));
  });
});
