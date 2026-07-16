import type { AnalyzerStatus } from "../analyzers/types.js";

export type VerificationClassification = "new" | "resolved" | "unchanged" | "regressed" | "changed" | "indeterminate";

export interface AnalyzerVerificationChange {
  analyzerId: string;
  previousVersion: string | null;
  currentVersion: string | null;
  previousStatus: AnalyzerStatus | null;
  currentStatus: AnalyzerStatus | null;
  classification: VerificationClassification;
  limitation: string;
}

export interface ImplementationVerificationLink {
  artifactId: string;
  sourceRuleId: string;
  status: "resolved" | "unchanged" | "regressed" | "indeterminate";
  currentEvidenceCount: number;
  explanation: string;
}

export interface VerificationReport {
  verificationVersion: string;
  comparedRunId: string;
  observedAt: string;
  ruleChanges: {
    new: string[];
    resolved: string[];
    unchanged: string[];
    regressed: string[];
  };
  analyzerChanges: AnalyzerVerificationChange[];
  implementationLinks: ImplementationVerificationLink[];
  pageSummary: Array<{
    role: "target" | "competitor";
    inputOrder: number;
    normalizedUrl: string;
    findingCount: number;
    analyzerObservationCount: number;
    eligibility: string;
  }>;
  siteSummary: {
    comparedPages: number;
    changedEvidenceRecords: number;
    resolvedImplementationArtifacts: number;
  };
  evidenceDiffs: Array<{
    category: string;
    field: string;
    siteKey: string;
    previousValue: unknown;
    currentValue: unknown;
  }>;
  causationStatement: "Website changes and observed visibility changes occurred during the same interval. This does not establish causation.";
  limitations: string[];
}
