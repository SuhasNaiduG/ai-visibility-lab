export interface GroundedEvidenceItem {
  evidenceId: string;
  findingId: string;
  sourceUrl: string;
  field: string;
  observedValue: unknown;
  snippet?: string;
}

export interface AiInterpretationProviderRequest {
  promptVersion: string;
  systemInstruction: string;
  evidence: GroundedEvidenceItem[];
  focus: string | null;
  maxOutputTokens: number;
}

export interface AiInterpretationProviderResponse {
  output: unknown;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
}

export interface AiInterpretationProvider {
  providerId: string;
  generate(request: AiInterpretationProviderRequest, signal: AbortSignal): Promise<AiInterpretationProviderResponse>;
}

export interface AiInterpretationConfig {
  enabled: boolean;
  provider: string | null;
  model: string | null;
  timeoutMs: number;
  maxOutputTokens: number;
  maxEvidenceItems: number;
  maxInputCharacters: number;
}

export interface AiInterpretationResult {
  promptVersion: string;
  generatedAt: string;
  provider: string;
  model: string;
  summary: string;
  clusters: Array<{ label: string; evidenceIds: string[] }>;
  researchQuestions: string[];
  priorities: Array<{ findingId: string; rationale: string; evidenceIds: string[] }>;
  citations: string[];
  warnings: string[];
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    estimatedCostUsd: number | null;
  };
}
