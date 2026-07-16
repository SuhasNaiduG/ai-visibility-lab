import type { Evidence } from "../rules/types.js";

export type AnalyzerStatus = "observed" | "partially-observed" | "not-observed" | "needs-human-review" | "not-applicable";
export type AnalyzerGroup = "technical" | "content-answerability" | "entities" | "trust-ymyl" | "retrieval-support";

export interface AnalyzerObservation {
  analyzerId: string;
  analyzerVersion: string;
  group: AnalyzerGroup;
  label: string;
  status: AnalyzerStatus;
  observedValue: unknown;
  evidence: Evidence[];
  interpretation: string;
  limitation: string;
}

export interface AnalyzerLibraryResult {
  libraryVersion: string;
  observations: AnalyzerObservation[];
}
