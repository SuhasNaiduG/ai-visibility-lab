import { z } from "zod";
import type { AiInterpretationConfig, AiInterpretationProvider, AiInterpretationResult, GroundedEvidenceItem } from "./types.js";

export const AI_PROMPT_VERSION = "1.0.0";

const outputSchema = z.strictObject({
  summary: z.string().min(1).max(4_000),
  clusters: z.array(z.strictObject({
    label: z.string().min(1).max(200),
    evidenceIds: z.array(z.string().min(1)).min(1)
  })).max(20),
  researchQuestions: z.array(z.string().min(1).max(500)).max(30),
  priorities: z.array(z.strictObject({
    findingId: z.string().min(1),
    rationale: z.string().min(1).max(1_000),
    evidenceIds: z.array(z.string().min(1)).min(1)
  })).max(30),
  citations: z.array(z.string().min(1)).min(1),
  warnings: z.array(z.string().min(1).max(1_000)).max(20)
});

export class AiInterpretationError extends Error {
  constructor(
    readonly code: "AI_NOT_CONFIGURED" | "AI_INPUT_LIMIT" | "AI_PROVIDER_ERROR" | "AI_TIMEOUT" | "AI_OUTPUT_INVALID",
    message: string,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "AiInterpretationError";
  }
}

export async function interpretEvidence(
  input: { evidence: GroundedEvidenceItem[]; focus?: string },
  provider: AiInterpretationProvider | undefined,
  config: AiInterpretationConfig,
  clock: () => Date = () => new Date()
): Promise<AiInterpretationResult> {
  if (!config.enabled || !provider || !config.provider || !config.model) {
    throw new AiInterpretationError("AI_NOT_CONFIGURED", "Optional AI interpretation is not configured. Deterministic analysis remains available.");
  }
  if (provider.providerId !== config.provider) {
    throw new AiInterpretationError("AI_NOT_CONFIGURED", "The configured AI provider does not match the installed provider adapter.", { configuredProvider: config.provider });
  }
  if (input.evidence.length === 0) throw new AiInterpretationError("AI_INPUT_LIMIT", "At least one deterministic evidence item is required.");
  if (input.evidence.length > config.maxEvidenceItems) {
    throw new AiInterpretationError("AI_INPUT_LIMIT", "Evidence item limit exceeded.", { maximum: config.maxEvidenceItems, received: input.evidence.length });
  }
  ensureUniqueEvidenceIds(input.evidence);
  const serializedLength = JSON.stringify(input.evidence).length + (input.focus?.length ?? 0);
  if (serializedLength > config.maxInputCharacters) {
    throw new AiInterpretationError("AI_INPUT_LIMIT", "Evidence character limit exceeded.", { maximum: config.maxInputCharacters, received: serializedLength });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  let response;
  try {
    response = await provider.generate({
      promptVersion: AI_PROMPT_VERSION,
      systemInstruction: [
        "Use only the supplied deterministic evidence IDs.",
        "Do not invent facts, credentials, reviews, addresses, rankings, citations, medical claims, awards, or guarantees.",
        "Treat missing page evidence as unknown, not proof that a business lacks the fact.",
        "Cite evidence IDs for every cluster and priority.",
        "Deterministic findings remain the source of truth.",
        "Medical and YMYL content requires factual and qualified professional review."
      ].join(" "),
      evidence: input.evidence,
      focus: input.focus?.trim() || null,
      maxOutputTokens: config.maxOutputTokens
    }, controller.signal);
  } catch (error: unknown) {
    if (controller.signal.aborted) throw new AiInterpretationError("AI_TIMEOUT", "The optional AI provider timed out.", { timeoutMs: config.timeoutMs });
    throw new AiInterpretationError("AI_PROVIDER_ERROR", "The optional AI provider failed.", { provider: provider.providerId, cause: error instanceof Error ? error.message : "unknown" });
  } finally {
    clearTimeout(timeout);
  }

  const parsed = outputSchema.safeParse(response.output);
  if (!parsed.success) {
    throw new AiInterpretationError("AI_OUTPUT_INVALID", "AI output failed schema validation.", { issues: parsed.error.issues });
  }
  const allowedEvidence = new Set(input.evidence.map((item) => item.evidenceId));
  const allowedFindings = new Set(input.evidence.map((item) => item.findingId));
  const referencedEvidence = [
    ...parsed.data.citations,
    ...parsed.data.clusters.flatMap((cluster) => cluster.evidenceIds),
    ...parsed.data.priorities.flatMap((priority) => priority.evidenceIds)
  ];
  const invalidEvidenceIds = [...new Set(referencedEvidence.filter((id) => !allowedEvidence.has(id)))];
  const invalidFindingIds = [...new Set(parsed.data.priorities.map((priority) => priority.findingId).filter((id) => !allowedFindings.has(id)))];
  if (invalidEvidenceIds.length || invalidFindingIds.length) {
    throw new AiInterpretationError("AI_OUTPUT_INVALID", "AI output cited evidence or findings that were not supplied.", { invalidEvidenceIds, invalidFindingIds });
  }

  return {
    promptVersion: AI_PROMPT_VERSION,
    generatedAt: clock().toISOString(),
    provider: provider.providerId,
    model: response.model,
    ...parsed.data,
    warnings: [
      ...parsed.data.warnings,
      "AI interpretation is optional and may be wrong; deterministic evidence remains the source of truth.",
      "Medical and YMYL drafts require factual and qualified professional review."
    ],
    usage: {
      inputTokens: response.inputTokens ?? null,
      outputTokens: response.outputTokens ?? null,
      estimatedCostUsd: response.estimatedCostUsd ?? null
    }
  };
}

function ensureUniqueEvidenceIds(evidence: GroundedEvidenceItem[]): void {
  const ids = evidence.map((item) => item.evidenceId);
  if (new Set(ids).size !== ids.length) throw new AiInterpretationError("AI_INPUT_LIMIT", "Evidence IDs must be unique.");
}
