import { describe, expect, it, vi } from "vitest";
import { loadAiInterpretationConfig } from "../../packages/ai/config.js";
import { AiInterpretationError, interpretEvidence } from "../../packages/ai/interpret.js";
import type { AiInterpretationConfig, AiInterpretationProvider, GroundedEvidenceItem } from "../../packages/ai/types.js";

const evidence: GroundedEvidenceItem[] = [{
  evidenceId: "run:comparison:GAP_TITLE:0",
  findingId: "GAP_TITLE",
  sourceUrl: "https://example.com/",
  field: "hasTitle",
  observedValue: false
}];

const config: AiInterpretationConfig = {
  enabled: true,
  provider: "mock",
  model: "mock-model",
  timeoutMs: 1_000,
  maxOutputTokens: 500,
  maxEvidenceItems: 10,
  maxInputCharacters: 10_000
};

describe("optional evidence-grounded AI interpretation", () => {
  it("is disabled by default and validates environment controls", async () => {
    const disabled = loadAiInterpretationConfig({});
    expect(disabled.enabled).toBe(false);
    expect(disabled.provider).toBeNull();
    await expect(interpretEvidence({ evidence }, undefined, disabled)).rejects.toMatchObject({ code: "AI_NOT_CONFIGURED" });
    expect(() => loadAiInterpretationConfig({ AI_TIMEOUT_MS: "1" })).toThrow(/AI_TIMEOUT_MS/u);
  });

  it("passes evidence IDs and guardrails to a mock provider and validates grounded output", async () => {
    const generate = vi.fn(async () => ({
      model: "mock-model",
      inputTokens: 100,
      outputTokens: 50,
      estimatedCostUsd: 0.001,
      output: {
        summary: "The title evidence should be reviewed.",
        clusters: [{ label: "Metadata", evidenceIds: [evidence[0]!.evidenceId] }],
        researchQuestions: ["What title accurately describes the page?"],
        priorities: [{ findingId: "GAP_TITLE", rationale: "The title is absent in supplied evidence.", evidenceIds: [evidence[0]!.evidenceId] }],
        citations: [evidence[0]!.evidenceId],
        warnings: []
      }
    }));
    const provider: AiInterpretationProvider = { providerId: "mock", generate };
    const result = await interpretEvidence({ evidence, focus: "Explain metadata" }, provider, config, () => new Date("2026-07-16T00:00:00.000Z"));

    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      promptVersion: "1.0.0",
      evidence,
      focus: "Explain metadata",
      maxOutputTokens: 500,
      systemInstruction: expect.stringMatching(/Do not invent facts/u)
    }), expect.any(AbortSignal));
    expect(result).toEqual(expect.objectContaining({ provider: "mock", model: "mock-model", generatedAt: "2026-07-16T00:00:00.000Z" }));
    expect(result.citations).toEqual([evidence[0]!.evidenceId]);
    expect(result.warnings.join(" ")).toMatch(/source of truth|professional review/u);
  });

  it("rejects schema-valid output that invents an evidence citation", async () => {
    const provider: AiInterpretationProvider = {
      providerId: "mock",
      generate: async () => ({
        model: "mock-model",
        output: {
          summary: "Unsupported",
          clusters: [{ label: "Unknown", evidenceIds: ["invented"] }],
          researchQuestions: [],
          priorities: [],
          citations: ["invented"],
          warnings: []
        }
      })
    };
    await expect(interpretEvidence({ evidence }, provider, config)).rejects.toEqual(expect.objectContaining<Partial<AiInterpretationError>>({
      code: "AI_OUTPUT_INVALID",
      details: expect.objectContaining({ invalidEvidenceIds: ["invented"] })
    }));
  });
});
