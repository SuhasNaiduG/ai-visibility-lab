import { describe, expect, it } from "vitest";
import { compareAnalyses } from "../../packages/comparison/compare.js";
import { generateImplementationArtifacts } from "../../packages/proposals/generate.js";
import { PROPOSAL_REVIEW_LABEL } from "../../packages/proposals/types.js";
import { makeAnalysis } from "../helpers/analysis.js";

describe("implementation artifact generator", () => {
  it("preserves the exact factual and professional review label", () => {
    expect(PROPOSAL_REVIEW_LABEL).toBe("Proposal — requires factual and professional review before publication.");
  });

  it("generates deterministic evidence-linked proposals without inserting unverified facts", () => {
    const target = makeAnalysis("https://target.example/", { title: null, titleLength: 0, questionCount: 0, detectedQuestions: [] });
    const competitor = makeAnalysis("https://competitor.example/", { title: "Confirmed title", titleLength: 15, questionCount: 1, detectedQuestions: ["What is included?"] });
    const comparison = compareAnalyses({ target, competitors: [competitor] });
    const artifacts = generateImplementationArtifacts(comparison);
    const title = artifacts.find((artifact) => artifact.artifactType === "title");

    expect(title).toEqual(expect.objectContaining({
      artifactId: "PROPOSAL_GAP_TITLE_MISSING",
      artifactVersion: "1.0.0",
      status: "proposal",
      label: PROPOSAL_REVIEW_LABEL,
      sourceFinding: { ruleId: "GAP_TITLE_MISSING", metric: "hasTitle" }
    }));
    expect(title?.evidence[0]?.sourceUrl).toBe(target.finalUrl);
    expect(title?.proposedArtifact).toContain("[Confirmed page subject]");
    expect(title?.factsToConfirm.length).toBeGreaterThan(0);
    expect(title?.verificationSteps.some((step) => /Rerun/u.test(step))).toBe(true);
    expect(JSON.stringify(artifacts)).not.toMatch(/best|award-winning|board-certified|guaranteed results/iu);
  });
});
