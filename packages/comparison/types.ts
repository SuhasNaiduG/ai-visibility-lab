import type { Evidence, Finding, Effort, Priority } from "../rules/types.js";

export interface CoverageSignal {
  kind: string;
  term: string;
  normalizedTerm: string;
  sourceField: string;
  selector?: string;
  snippet: string;
  method: string;
  heuristic: boolean;
}

export interface CoverageDimension {
  present: boolean;
  count: number;
  terms: string[];
  signals: CoverageSignal[];
}

export interface ComparableCoverage {
  entity: CoverageDimension;
  service: CoverageDimension;
  location: CoverageDimension;
  trust: CoverageDimension;
  contact: CoverageDimension;
  contentSection: CoverageDimension;
}

export interface ComparableAnalysis {
  requestedUrl: string;
  normalizedUrl: string;
  statusCode: number;
  finalUrl: string;
  responseTimeMs: number;
  fetchedAt: string;
  redirectCount: number;
  title: string | null;
  titleLength: number;
  metaDescription: string | null;
  metaDescriptionLength: number;
  canonicalUrl: string | null;
  canonicalStatus: "match" | "mismatch" | "missing" | "invalid";
  robotsMeta: string | null;
  indexability: {
    status: string;
    isIndexable: boolean;
    reason: string;
  };
  documentLanguage: string | null;
  viewportPresent: boolean;
  h1Count: number;
  h1Text: string[];
  headingHierarchy: Array<{ level: number; text: string }>;
  totalHeadingCount: number;
  headingLevelJumps: unknown[];
  emptyHeadingCount: number;
  repeatedHeadings: unknown[];
  visibleText: string;
  wordCount: number;
  sentenceCount: number;
  questionCount: number;
  detectedQuestions: string[];
  faqIndicators: Array<{
    text: string;
    field: string;
    selector?: string;
    heuristic: boolean;
  }>;
  breadcrumbIndicators: Array<{
    text: string;
    field: string;
    selector?: string;
    heuristic: boolean;
  }>;
  directAnswerCount: number;
  directAnswers: unknown[];
  jsonLdParseErrors: unknown[];
  schemaTypes: string[];
  imageCount: number;
  imagesMissingAlt: number;
  internalLinkCount: number;
  externalLinkCount: number;
  uniqueInternalUrls: string[];
  uniqueInternalUrlCount: number;
  uniqueExternalUrls: string[];
  externalDomains: string[];
  uniqueExternalDomainCount: number;
  anchorTextSummary: unknown[];
  emptyAnchorCount: number;
  imageAltIssues: unknown[];
  robotsTxtAvailable: boolean;
  robotsTxtStatusCode: number | null;
  sitemapXmlAvailable: boolean;
  sitemapXmlStatusCode: number | null;
  coverage: ComparableCoverage;
  findings: Finding[];
}

export type ComparisonRole = "target" | "competitor";

export type ComparisonEligibilityStatus = "eligible" | "degraded" | "ineligible";

export type ComparisonEligibilityReasonCode =
  | "NON_SUCCESS_HTTP"
  | "ACCESS_DENIED"
  | "BOT_CHALLENGE"
  | "CAPTCHA"
  | "SECURITY_CHECK"
  | "ERROR_PAGE"
  | "EMPTY_CONTENT"
  | "NEAR_EMPTY_CONTENT"
  | "MISSING_PAGE_EVIDENCE";

export interface ComparisonEligibilityReason {
  code: ComparisonEligibilityReasonCode;
  message: string;
  evidence: Evidence[];
}

export interface ComparisonEligibility {
  status: ComparisonEligibilityStatus;
  usableAsBenchmark: boolean;
  reasons: ComparisonEligibilityReason[];
}

export interface ComparisonSite {
  role: ComparisonRole;
  inputOrder: number;
  inputUrl: string;
  normalizedUrl: string;
  finalUrl: string;
  eligibility: ComparisonEligibility;
}

export type ComparisonSiteInput = Omit<ComparisonSite, "finalUrl" | "eligibility">;

export interface ComparisonMetrics {
  statusCode: number;
  redirectCount: number;
  indexable: boolean;
  indexabilityStatus: string;
  robotsTxtAvailable: boolean;
  robotsTxtStatusCode: number | null;
  sitemapXmlAvailable: boolean;
  sitemapXmlStatusCode: number | null;
  hasTitle: boolean;
  titleLength: number;
  hasMetaDescription: boolean;
  descriptionLength: number;
  canonicalMatches: boolean;
  canonicalStatus: string;
  hasLanguage: boolean;
  documentLanguage: string | null;
  viewportPresent: boolean;
  h1Count: number;
  h1StructureValid: boolean;
  totalHeadingCount: number;
  headingJumpCount: number;
  emptyHeadingCount: number;
  repeatedHeadingCount: number;
  wordCount: number;
  questionCount: number;
  faqIndicatorCount: number;
  directAnswerCount: number;
  schemaTypeCount: number;
  jsonLdParseErrorCount: number;
  internalLinkCount: number;
  externalLinkCount: number;
  uniqueInternalUrlCount: number;
  uniqueExternalDomainCount: number;
  imageCount: number;
  imagesMissingAltCount: number;
  emptyAnchorCount: number;
  topicTermCount: number;
  serviceTermCount: number;
  locationTermCount: number;
  hasIdentitySignals: boolean;
  hasTrustSignals: boolean;
  hasContactSignals: boolean;
  hasLocationSignals: boolean;
}

export type ComparisonMetricKey = keyof ComparisonMetrics;

export interface MetricDefinition {
  key: ComparisonMetricKey;
  label: string;
  whatItShows: string;
  whyItMayHelp: string;
  direction: "higher-is-more" | "lower-is-better" | "context-only";
}

export interface ComparisonRow {
  role: ComparisonRole;
  inputOrder: number;
  inputUrl: string;
  url: string;
  finalUrl: string;
  eligibility: ComparisonEligibility;
  manualRankObservation: number | null;
  metrics: ComparisonMetrics;
  schemaTypes: string[];
  topicTerms: string[];
  questions: string[];
}

export interface CompetitorEvidence {
  sourceUrl: string;
  normalizedUrl?: string;
  inputOrder?: number;
  observedValue?: unknown;
  benchmark?: boolean;
  evidence: Evidence[];
}

export interface ComparisonDelta {
  targetValue: number | boolean;
  benchmarkValue: number | boolean;
  difference: number | null;
  threshold: number | null;
  interpretation:
    | "target-below-benchmark"
    | "target-above-benchmark"
    | "target-absent"
    | "target-present";
}

export type ComparisonFindingCategory =
  | "technical"
  | "content"
  | "entity"
  | "trust"
  | "schema"
  | "answerability"
  | "retrieval-support";

export type ComparisonConfidence = "high" | "medium" | "low";

export interface ComparisonFindingExplanation {
  ruleId: string;
  category: ComparisonFindingCategory;
  exactDifference: string;
  interpretation: string;
  expectedObservableOutcome: string;
  confidence: ComparisonConfidence;
  limitation: string;
}

export interface ComparisonGap extends ComparisonFindingExplanation {
  gapId: string;
  metric: string;
  targetEvidence: Evidence[];
  competitorEvidence: CompetitorEvidence[];
  whatDiffers: string;
  competitorObservation: string;
  whyItMayMatter: string;
  implementationDirection: string;
  verificationMethod: string;
  priority: Priority;
  effort: Effort;
  caution: string;
  missingValues?: string[];
  /** Present for scalar and boolean comparisons; absent on set-difference gaps. */
  delta?: ComparisonDelta;
}

export interface TargetAdvantage {
  ruleId: string;
  category: ComparisonFindingCategory;
  advantageId: string;
  metric: string;
  targetEvidence: Evidence[];
  competitorEvidence: CompetitorEvidence[];
  whatDiffers: string;
  exactDifference: string;
  interpretation: string;
  whyItMayMatter: string;
  implementationDirection: string;
  expectedObservableOutcome: string;
  verificationMethod: string;
  confidence: ComparisonConfidence;
  limitation: string;
  priority: Priority;
  effort: Effort;
  /** Present for scalar and boolean comparisons. */
  delta?: ComparisonDelta;
}

export interface ComparisonResult {
  targetUrl: string;
  competitorUrls: string[];
  sites: ComparisonSite[];
  conclusionStatus: "complete" | "partial" | "unavailable";
  incompleteMessage: string | null;
  excludedCompetitorUrls: string[];
  queryLabel: string | null;
  metricDefinitions: MetricDefinition[];
  matrix: ComparisonRow[];
  targetGaps: ComparisonGap[];
  targetAdvantages: TargetAdvantage[];
  competitorAdvantages: ComparisonGap[];
  sharedGaps: ComparisonGap[];
  competitorOnlySchemaTypes: string[];
  competitorOnlyTopics: string[];
  competitorOnlyQuestions: string[];
  limitations: string[];
}

export type ManualRankObservations = Record<string, number>;
