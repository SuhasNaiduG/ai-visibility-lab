import type { ComparableAnalysis, ManualRankObservations } from "./types.js";

export type ChangeKind = "added" | "removed" | "changed";
export type ChangeCategory = "technical" | "metadata" | "schema" | "headings" | "content" | "links" | "media";

export interface ObservedChange {
  scope: "target" | "competitor";
  sourceUrl: string;
  category: ChangeCategory;
  field: string;
  change: ChangeKind;
  previousValue: unknown;
  currentValue: unknown;
  value?: unknown;
}

export interface FindingChange {
  sourceUrl: string;
  newRuleIds: string[];
  resolvedRuleIds: string[];
  unchangedRuleIds: string[];
}

export interface RankObservationChange {
  url: string;
  previous: number | null;
  current: number | null;
  delta: number | null;
  source: "manual";
  change: "added" | "removed" | "changed";
}

export interface CorrelationSummary {
  rankObservationChange: RankObservationChange | null;
  siteChangesSincePreviousRun: ObservedChange[];
  interpretation: string;
}

export interface HistoricalComparison {
  previousRunId: string;
  previousCreatedAt: string;
  technicalChanges: ObservedChange[];
  metadataChanges: ObservedChange[];
  schemaChanges: ObservedChange[];
  headingChanges: ObservedChange[];
  contentCountChanges: ObservedChange[];
  linkAndMediaChanges: ObservedChange[];
  findingChanges: FindingChange[];
  competitorChanges: {
    addedUrls: string[];
    removedUrls: string[];
    observedChanges: ObservedChange[];
  };
  rankObservationChanges: RankObservationChange[];
  rankComparisonSkippedReason: string | null;
  correlationSummary: CorrelationSummary;
}

export interface DiffableRun {
  id?: string;
  createdAt?: string;
  targetUrl: string;
  competitorUrls: string[];
  queryLabel: string | null;
  rankObservations: ManualRankObservations;
  analyses: ComparableAnalysis[];
}

const trackedFields: Array<{ category: ChangeCategory; fields: Array<keyof ComparableAnalysis> }> = [
  { category: "technical", fields: ["statusCode", "finalUrl", "redirectCount", "robotsTxtAvailable", "robotsTxtStatusCode", "sitemapXmlAvailable", "sitemapXmlStatusCode", "indexability"] },
  { category: "metadata", fields: ["title", "titleLength", "metaDescription", "metaDescriptionLength", "canonicalUrl", "canonicalStatus", "robotsMeta", "documentLanguage", "viewportPresent"] },
  { category: "schema", fields: ["jsonLdParseErrors"] },
  { category: "headings", fields: ["h1Count", "h1Text", "headingHierarchy", "totalHeadingCount", "headingLevelJumps", "emptyHeadingCount", "repeatedHeadings"] },
  { category: "content", fields: ["wordCount", "sentenceCount", "questionCount", "detectedQuestions", "faqIndicators", "breadcrumbIndicators", "directAnswerCount", "directAnswers", "coverage"] },
  { category: "links", fields: ["internalLinkCount", "externalLinkCount", "uniqueInternalUrls", "uniqueInternalUrlCount", "uniqueExternalUrls", "externalDomains", "uniqueExternalDomainCount", "anchorTextSummary", "emptyAnchorCount"] },
  { category: "media", fields: ["imageCount", "imagesMissingAlt", "imageAltIssues"] }
];

export function diffRuns(previous: DiffableRun, current: DiffableRun): HistoricalComparison {
  const previousByUrl = indexAnalyses(previous.analyses);
  const currentByUrl = indexAnalyses(current.analyses);
  const targetKey = normalizeUrlKey(current.targetUrl);
  const previousCompetitors = new Set(previous.competitorUrls.map(normalizeUrlKey));
  const currentCompetitors = new Set(current.competitorUrls.map(normalizeUrlKey));
  const changes: ObservedChange[] = [];
  const findingChanges: FindingChange[] = [];

  for (const [key, currentAnalysis] of currentByUrl) {
    const previousAnalysis = previousByUrl.get(key);
    if (!previousAnalysis) continue;
    const scope = key === targetKey ? "target" : "competitor";
    changes.push(...diffAnalysis(previousAnalysis, currentAnalysis, scope));
    findingChanges.push(diffFindings(previousAnalysis, currentAnalysis));
  }

  const addedUrls = [...currentCompetitors].filter((url) => !previousCompetitors.has(url)).sort();
  const removedUrls = [...previousCompetitors].filter((url) => !currentCompetitors.has(url)).sort();
  const sameQuery = normalizeQuery(previous.queryLabel) === normalizeQuery(current.queryLabel);
  const rankObservationChanges = sameQuery ? diffRankObservations(previous, current) : [];
  const rankComparisonSkippedReason = sameQuery
    ? null
    : "Manual rank changes were not compared because the query labels differ.";
  const targetChanges = changes.filter((change) => change.scope === "target");
  const targetRankChange = rankObservationChanges.find((change) => normalizeUrlKey(change.url) === targetKey) ?? null;

  return {
    previousRunId: previous.id ?? "unknown",
    previousCreatedAt: previous.createdAt ?? "unknown",
    technicalChanges: changes.filter((change) => change.category === "technical"),
    metadataChanges: changes.filter((change) => change.category === "metadata"),
    schemaChanges: changes.filter((change) => change.category === "schema"),
    headingChanges: changes.filter((change) => change.category === "headings"),
    contentCountChanges: changes.filter((change) => change.category === "content"),
    linkAndMediaChanges: changes.filter((change) => change.category === "links" || change.category === "media"),
    findingChanges,
    competitorChanges: {
      addedUrls,
      removedUrls,
      observedChanges: changes.filter((change) => change.scope === "competitor")
    },
    rankObservationChanges,
    rankComparisonSkippedReason,
    correlationSummary: {
      rankObservationChange: targetRankChange,
      siteChangesSincePreviousRun: targetChanges,
      interpretation: rankComparisonSkippedReason
        ? `${rankComparisonSkippedReason} Technical changes remain available for inspection without rank correlation.`
        : targetRankChange && targetChanges.length > 0
        ? "The system observed both manual rank and public-page changes in the same interval. It does not claim that a site change caused the rank change."
        : "The system reports observed changes only. Missing or concurrent rank movement cannot establish causation."
    }
  };
}

function diffAnalysis(previous: ComparableAnalysis, current: ComparableAnalysis, scope: ObservedChange["scope"]): ObservedChange[] {
  const changes: ObservedChange[] = [];
  for (const group of trackedFields) {
    for (const field of group.fields) {
      const previousValue = previous[field];
      const currentValue = current[field];
      if (!equal(previousValue, currentValue)) {
        changes.push({
          scope,
          sourceUrl: current.finalUrl,
          category: group.category,
          field,
          change: classifyChange(previousValue, currentValue),
          previousValue,
          currentValue
        });
      }
    }
  }

  const previousSchema = normalizedSchemaTypes(previous.schemaTypes);
  const currentSchema = normalizedSchemaTypes(current.schemaTypes);
  for (const key of [...currentSchema.keys()].filter((item) => !previousSchema.has(item)).sort()) {
    const value = currentSchema.get(key)!;
    changes.push({ scope, sourceUrl: current.finalUrl, category: "schema", field: "schemaTypes", change: "added", previousValue: previous.schemaTypes, currentValue: current.schemaTypes, value });
  }
  for (const key of [...previousSchema.keys()].filter((item) => !currentSchema.has(item)).sort()) {
    const value = previousSchema.get(key)!;
    changes.push({ scope, sourceUrl: current.finalUrl, category: "schema", field: "schemaTypes", change: "removed", previousValue: previous.schemaTypes, currentValue: current.schemaTypes, value });
  }
  return changes;
}

function diffFindings(previous: ComparableAnalysis, current: ComparableAnalysis): FindingChange {
  const prior = new Set(previous.findings.map((finding) => finding.ruleId));
  const next = new Set(current.findings.map((finding) => finding.ruleId));
  return {
    sourceUrl: current.finalUrl,
    newRuleIds: [...next].filter((id) => !prior.has(id)).sort(),
    resolvedRuleIds: [...prior].filter((id) => !next.has(id)).sort(),
    unchangedRuleIds: [...next].filter((id) => prior.has(id)).sort()
  };
}

function diffRankObservations(previous: DiffableRun, current: DiffableRun): RankObservationChange[] {
  const prior = normalizedRanks(previous.rankObservations);
  const next = normalizedRanks(current.rankObservations);
  const changes: RankObservationChange[] = [];
  const urls = new Set([...prior.keys(), ...next.keys()]);
  for (const url of urls) {
    const currentPosition = next.get(url);
    const previousPosition = prior.get(url);
    if (previousPosition === currentPosition) continue;
    changes.push({
      url,
      previous: previousPosition ?? null,
      current: currentPosition ?? null,
      delta: previousPosition !== undefined && currentPosition !== undefined ? currentPosition - previousPosition : null,
      source: "manual",
      change: previousPosition === undefined ? "added" : currentPosition === undefined ? "removed" : "changed"
    });
  }
  return changes.sort((left, right) => left.url.localeCompare(right.url));
}

function normalizeQuery(value: string | null): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim().toLocaleLowerCase("en-US");
  return normalized || null;
}

function normalizedRanks(values: ManualRankObservations): Map<string, number> {
  const result = new Map<string, number>();
  for (const [url, position] of Object.entries(values)) {
    result.set(normalizeUrlKey(url), position);
  }
  return result;
}

function normalizedSchemaTypes(values: string[]): Map<string, string> {
  return new Map(values.map((value) => [value.trim().toLocaleLowerCase("en-US"), value]));
}

function indexAnalyses(analyses: ComparableAnalysis[]): Map<string, ComparableAnalysis> {
  return new Map(analyses.map((analysis) => [normalizeUrlKey(analysis.normalizedUrl), analysis]));
}

function normalizeUrlKey(value: string): string {
  const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`);
  url.hash = "";
  return url.toString();
}

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function classifyChange(previous: unknown, current: unknown): ChangeKind {
  if (isEmpty(previous) && !isEmpty(current)) return "added";
  if (!isEmpty(previous) && isEmpty(current)) return "removed";
  return "changed";
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}
