import type { ParsedPage } from "../parser/page.js";

export interface Evidence {
  sourceUrl: string;
  field: string;
  observedValue: unknown;
  selector?: string;
  snippet?: string;
  fetchedAt: string;
}

export type Priority = "high" | "medium" | "low";
export type Effort = "low" | "medium" | "high";
export type FindingClassification = "observation" | "editorial-heuristic";
export type FindingCategory =
  | "crawl-indexability"
  | "metadata"
  | "heading-structure"
  | "structured-data"
  | "links-media"
  | "answerability"
  | "entity-coverage";

export interface Finding {
  ruleId: string;
  ruleVersion: string;
  category: FindingCategory;
  problem: string;
  evidence: Evidence[];
  whyItMatters: string;
  exactImplementation: string;
  expectedOutcome: string;
  verificationMethod: string;
  priority: Priority;
  effort: Effort;
  classification: FindingClassification;
  confidence: "high" | "medium" | "low";
  limitation: string;
}

export interface AnalysisRuleInput extends ParsedPage {
  requestedUrl: string;
  normalizedUrl: string;
  statusCode: number;
  finalUrl: string;
  responseTimeMs: number;
  fetchedAt: string;
  redirectCount: number;
  redirectObserved?: boolean;
  robotsTxtAvailable: boolean;
  robotsTxtStatusCode: number | null;
  sitemapXmlAvailable: boolean;
  sitemapXmlStatusCode: number | null;
}

export type RuleEvaluator = (input: AnalysisRuleInput) => Finding[];
