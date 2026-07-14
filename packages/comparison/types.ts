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
  directAnswerCount: number;
  jsonLdParseErrors: unknown[];
  schemaTypes: string[];
  imageCount: number;
  imagesMissingAlt: number;
  internalLinkCount: number;
  externalLinkCount: number;
  uniqueInternalUrls: string[];
  externalDomains: string[];
  emptyAnchorCount: number;
  robotsTxtAvailable: boolean;
  robotsTxtStatusCode: number | null;
  sitemapXmlAvailable: boolean;
  sitemapXmlStatusCode: number | null;
  coverage: ComparableCoverage;
  findings: Finding[];
}

export type ComparisonRole = "target" | "competitor";

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
  url: string;
  finalUrl: string;
  manualRankObservation: number | null;
  metrics: ComparisonMetrics;
  schemaTypes: string[];
  topicTerms: string[];
  questions: string[];
}

export interface CompetitorEvidence {
  sourceUrl: string;
  evidence: Evidence[];
}

export interface ComparisonGap {
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
}

export interface TargetAdvantage {
  advantageId: string;
  metric: string;
  targetEvidence: Evidence[];
  competitorEvidence: CompetitorEvidence[];
  whatDiffers: string;
  interpretation: string;
}

export interface ComparisonResult {
  targetUrl: string;
  competitorUrls: string[];
  queryLabel: string | null;
  metricDefinitions: MetricDefinition[];
  matrix: ComparisonRow[];
  targetGaps: ComparisonGap[];
  targetAdvantages: TargetAdvantage[];
  competitorOnlySchemaTypes: string[];
  competitorOnlyTopics: string[];
  competitorOnlyQuestions: string[];
  limitations: string[];
}

export type ManualRankObservations = Record<string, number>;
