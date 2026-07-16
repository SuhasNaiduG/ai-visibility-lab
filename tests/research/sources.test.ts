import { describe, expect, it } from "vitest";
import { runAnalyzerLibrary } from "../../packages/analyzers/evaluate.js";
import { RESEARCH_SOURCE_REGISTRY_VERSION, researchSources, sourcesForAnalyzer } from "../../packages/research/sources.js";
import { makeAnalysis } from "../helpers/analysis.js";

describe("research source registry", () => {
  it("maps every deterministic analyzer to at least one versioned source", () => {
    const observations = runAnalyzerLibrary(makeAnalysis("https://example.com/"));
    const unmapped = observations.observations
      .map((item) => item.analyzerId)
      .filter((analyzerId) => sourcesForAnalyzer(analyzerId).length === 0);

    expect(unmapped).toEqual([]);
    expect(researchSources.every((source) => source.registryVersion === RESEARCH_SOURCE_REGISTRY_VERSION)).toBe(true);
  });

  it("labels local heuristics and does not attach invented URLs to them", () => {
    const heuristics = researchSources.filter((source) => source.sourceType === "internal-heuristic");
    expect(heuristics.length).toBeGreaterThan(0);
    expect(heuristics.every((source) => source.url === null && source.confidence === "bounded")).toBe(true);
  });

  it("keeps source identifiers and analyzer mappings unique within each record", () => {
    expect(new Set(researchSources.map((source) => source.sourceId)).size).toBe(researchSources.length);
    expect(researchSources.every((source) => new Set(source.applicableAnalyzers).size === source.applicableAnalyzers.length)).toBe(true);
  });
});
