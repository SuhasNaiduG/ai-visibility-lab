import { describe, expect, it } from "vitest";
import { runAnalyzerLibrary } from "../../packages/analyzers/evaluate.js";
import { makeAnalysis, makeCoverage } from "../helpers/analysis.js";

describe("analyzer library", () => {
  it("returns versioned, evidence-linked observations without inferring missing facts", () => {
    const input = makeAnalysis("https://example.com/", {
      visibleText: "Dr. Example explains how it works. Pricing and insurance information is reviewed by the clinical team. References are provided.",
      questionCount: 1,
      detectedQuestions: ["How does it work?"],
      directAnswerCount: 1,
      directAnswers: [{ question: "How does it work?", answer: "A reviewed explanation." }],
      coverage: makeCoverage({
        entity: { present: true, count: 1, terms: ["Example Practice"], signals: [] },
        service: { present: true, count: 1, terms: ["treatment"], signals: [] }
      })
    });

    const result = runAnalyzerLibrary(input);
    expect(result.libraryVersion).toBe("1.0.0");
    expect(result.observations.length).toBeGreaterThan(20);
    expect(result.observations.every((item) => item.analyzerVersion === "1.0.0" && item.evidence[0]?.sourceUrl === input.finalUrl && item.limitation.length > 0)).toBe(true);
    expect(result.observations.find((item) => item.analyzerId === "CONTENT_PRICING")?.status).toBe("observed");
    expect(result.observations.find((item) => item.analyzerId === "TRUST_CREDENTIALS")?.status).toBe("needs-human-review");
  });
});
