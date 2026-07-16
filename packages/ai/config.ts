import type { AiInterpretationConfig } from "./types.js";

export function loadAiInterpretationConfig(environment: NodeJS.ProcessEnv = process.env): AiInterpretationConfig {
  const enabled = environment.AI_INTERPRETATION_ENABLED === "true";
  return {
    enabled,
    provider: environment.AI_PROVIDER?.trim() || null,
    model: environment.AI_MODEL?.trim() || null,
    timeoutMs: integer(environment.AI_TIMEOUT_MS, 15_000, 1_000, 120_000, "AI_TIMEOUT_MS"),
    maxOutputTokens: integer(environment.AI_MAX_OUTPUT_TOKENS, 1_200, 100, 8_000, "AI_MAX_OUTPUT_TOKENS"),
    maxEvidenceItems: integer(environment.AI_MAX_EVIDENCE_ITEMS, 100, 1, 500, "AI_MAX_EVIDENCE_ITEMS"),
    maxInputCharacters: integer(environment.AI_MAX_INPUT_CHARACTERS, 30_000, 1_000, 200_000, "AI_MAX_INPUT_CHARACTERS")
  };
}

function integer(raw: string | undefined, fallback: number, minimum: number, maximum: number, name: string): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}
