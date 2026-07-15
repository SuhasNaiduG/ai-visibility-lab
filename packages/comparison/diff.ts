import { classifyComparisonEligibility } from "./eligibility.js";
import type { ComparableAnalysis, ComparisonSite, ManualRankObservations } from "./types.js";

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
  siteKey?: string;
  inputOrder?: number;
  previousSourceUrl?: string;
  currentSourceUrl?: string;
}

export interface FindingChange {
  sourceUrl: string;
  siteKey?: string;
  inputOrder?: number;
  previousSourceUrl?: string;
  currentSourceUrl?: string;
  newRuleIds: string[];
  resolvedRuleIds: string[];
  unchangedRuleIds: string[];
  indeterminateRuleIds: string[];
}

export interface CompetitorOrderMove {
  normalizedUrl: string;
  previousInputOrder: number;
  currentInputOrder: number;
}

export interface CompetitorOrderingChange {
  previousOrder: string[];
  currentOrder: string[];
  orderChanged: boolean;
  moves: CompetitorOrderMove[];
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
    ordering: CompetitorOrderingChange;
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
  sites?: ComparisonSite[];
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
  const previousSites = orderedSites(previous);
  const currentSites = orderedSites(current);
  const previousByUrl = indexAnalyses(previous.analyses);
  const currentByUrl = indexAnalyses(current.analyses);
  const previousSiteByUrl = new Map(previousSites.map((site) => [normalizeUrlKey(site.normalizedUrl), site]));
  const currentSiteByUrl = new Map(currentSites.map((site) => [normalizeUrlKey(site.normalizedUrl), site]));
  const targetKey = normalizeUrlKey(currentSites[0]?.normalizedUrl ?? current.targetUrl);
  const changes: ObservedChange[] = [];
  const findingChanges: FindingChange[] = [];

  for (const currentSite of currentSites) {
    const key = normalizeUrlKey(currentSite.normalizedUrl);
    const currentAnalysis = currentByUrl.get(key);
    const previousAnalysis = previousByUrl.get(key);
    const previousSite = previousSiteByUrl.get(key);
    if (!currentAnalysis || !previousAnalysis || !previousSite) continue;
    const scope = currentSite.role;
    const contentComparable = previousSite.eligibility.usableAsBenchmark && currentSite.eligibility.usableAsBenchmark;
    changes.push(...diffAnalysis(previousAnalysis, currentAnalysis, scope, previousSite, currentSite, contentComparable));
    if (previousSite.eligibility.status !== currentSite.eligibility.status) {
      changes.push(observedSiteChange(
        previousAnalysis,
        currentAnalysis,
        previousSite,
        currentSite,
        "technical",
        "comparisonEligibility",
        previousSite.eligibility.status,
        currentSite.eligibility.status
      ));
    }
    findingChanges.push(diffFindings(previousAnalysis, currentAnalysis, previousSite, currentSite, contentComparable));
  }

  const previousCompetitors = previousSites.filter((site) => site.role === "competitor");
  const currentCompetitors = currentSites.filter((site) => site.role === "competitor");
  const previousCompetitorKeys = new Set(previousCompetitors.map((site) => normalizeUrlKey(site.normalizedUrl)));
  const currentCompetitorKeys = new Set(currentCompetitors.map((site) => normalizeUrlKey(site.normalizedUrl)));
  const addedUrls = currentCompetitors.filter((site) => !previousCompetitorKeys.has(normalizeUrlKey(site.normalizedUrl))).map((site) => site.normalizedUrl);
  const removedUrls = previousCompetitors.filter((site) => !currentCompetitorKeys.has(normalizeUrlKey(site.normalizedUrl))).map((site) => site.normalizedUrl);
  const ordering = compareCompetitorOrdering(previousCompetitors, currentCompetitors);
  const sameQuery = normalizeQuery(previous.queryLabel) === normalizeQuery(current.queryLabel);
  const previousTarget = previousSiteByUrl.get(targetKey);
  const currentTarget = currentSiteByUrl.get(targetKey);
  const targetContentComparable = Boolean(previousTarget?.eligibility.usableAsBenchmark && currentTarget?.eligibility.usableAsBenchmark);
  const rankComparisonSkippedReason = !sameQuery
    ? "Manual rank changes were not compared because the query labels differ."
    : !targetContentComparable
    ? "Manual rank changes were not compared because target page eligibility made content correlation indeterminate."
    : null;
  const rankObservationChanges = rankComparisonSkippedReason
    ? []
    : diffRankObservations(previous, current, previousSites, currentSites);
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
      ordering,
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

function diffAnalysis(previous: ComparableAnalysis, current: ComparableAnalysis, scope: ObservedChange["scope"], previousSite: ComparisonSite, currentSite: ComparisonSite, contentComparable: boolean): ObservedChange[] {
  const changes: ObservedChange[] = [];
  for (const group of trackedFields) {
    if (!contentComparable && group.category !== "technical") continue;
    for (const field of group.fields) {
      const previousValue = previous[field];
      const currentValue = current[field];
      if (!equal(previousValue, currentValue)) {
        changes.push(observedSiteChange(previous, current, previousSite, currentSite, group.category, String(field), previousValue, currentValue));
      }
    }
  }

  if (!contentComparable) return changes;
  const previousSchema = normalizedSchemaTypes(previous.schemaTypes);
  const currentSchema = normalizedSchemaTypes(current.schemaTypes);
  for (const key of [...currentSchema.keys()].filter((item) => !previousSchema.has(item)).sort()) {
    const value = currentSchema.get(key)!;
    changes.push({ ...observedSiteChange(previous, current, previousSite, currentSite, "schema", "schemaTypes", previous.schemaTypes, current.schemaTypes), change: "added", value });
  }
  for (const key of [...previousSchema.keys()].filter((item) => !currentSchema.has(item)).sort()) {
    const value = previousSchema.get(key)!;
    changes.push({ ...observedSiteChange(previous, current, previousSite, currentSite, "schema", "schemaTypes", previous.schemaTypes, current.schemaTypes), change: "removed", value });
  }
  return changes;
}

function diffFindings(previous: ComparableAnalysis, current: ComparableAnalysis, previousSite: ComparisonSite, currentSite: ComparisonSite, contentComparable: boolean): FindingChange {
  const prior = new Set(previous.findings.map((finding) => finding.ruleId));
  const next = new Set(current.findings.map((finding) => finding.ruleId));
  const unchangedRuleIds = [...next].filter((id) => prior.has(id)).sort();
  return {
    sourceUrl: current.finalUrl,
    siteKey: currentSite.normalizedUrl,
    inputOrder: currentSite.inputOrder,
    previousSourceUrl: previous.finalUrl,
    currentSourceUrl: current.finalUrl,
    newRuleIds: contentComparable ? [...next].filter((id) => !prior.has(id)).sort() : [],
    resolvedRuleIds: contentComparable ? [...prior].filter((id) => !next.has(id)).sort() : [],
    unchangedRuleIds,
    indeterminateRuleIds: contentComparable
      ? []
      : [...new Set([...prior, ...next])].filter((id) => !unchangedRuleIds.includes(id)).sort()
  };
}

function diffRankObservations(previous: DiffableRun, current: DiffableRun, previousSites: ComparisonSite[], currentSites: ComparisonSite[]): RankObservationChange[] {
  const prior = normalizedRanks(previous.rankObservations);
  const next = normalizedRanks(current.rankObservations);
  const changes: RankObservationChange[] = [];
  const urls = orderedIdentityKeys(previousSites, currentSites);
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
  return changes;
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

function observedSiteChange(
  previous: ComparableAnalysis,
  current: ComparableAnalysis,
  previousSite: ComparisonSite,
  currentSite: ComparisonSite,
  category: ChangeCategory,
  field: string,
  previousValue: unknown,
  currentValue: unknown
): ObservedChange {
  return {
    scope: currentSite.role,
    sourceUrl: current.finalUrl,
    category,
    field,
    change: classifyChange(previousValue, currentValue),
    previousValue,
    currentValue,
    siteKey: currentSite.normalizedUrl,
    inputOrder: currentSite.inputOrder,
    previousSourceUrl: previous.finalUrl,
    currentSourceUrl: current.finalUrl
  };
}

function compareCompetitorOrdering(previous: ComparisonSite[], current: ComparisonSite[]): CompetitorOrderingChange {
  const previousOrder = previous.map((site) => site.normalizedUrl);
  const currentOrder = current.map((site) => site.normalizedUrl);
  const previousSet = new Set(previousOrder.map(normalizeUrlKey));
  const currentSet = new Set(currentOrder.map(normalizeUrlKey));
  const previousCommon = previousOrder.filter((url) => currentSet.has(normalizeUrlKey(url)));
  const currentCommon = currentOrder.filter((url) => previousSet.has(normalizeUrlKey(url)));
  const orderChanged = !equal(previousCommon.map(normalizeUrlKey), currentCommon.map(normalizeUrlKey));
  const moves = orderChanged
    ? currentCommon.flatMap((url) => {
        const key = normalizeUrlKey(url);
        const previousSite = previous.find((site) => normalizeUrlKey(site.normalizedUrl) === key);
        const currentSite = current.find((site) => normalizeUrlKey(site.normalizedUrl) === key);
        if (!previousSite || !currentSite) return [];
        const previousRelativeIndex = previousCommon.findIndex((item) => normalizeUrlKey(item) === key);
        const currentRelativeIndex = currentCommon.findIndex((item) => normalizeUrlKey(item) === key);
        return previousRelativeIndex === currentRelativeIndex ? [] : [{
          normalizedUrl: currentSite.normalizedUrl,
          previousInputOrder: previousSite.inputOrder,
          currentInputOrder: currentSite.inputOrder
        }];
      })
    : [];
  return { previousOrder, currentOrder, orderChanged, moves };
}

function orderedIdentityKeys(previousSites: ComparisonSite[], currentSites: ComparisonSite[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const site of [...currentSites, ...previousSites]) {
    const key = normalizeUrlKey(site.normalizedUrl);
    if (!seen.has(key)) {
      result.push(key);
      seen.add(key);
    }
  }
  return result;
}

function orderedSites(run: DiffableRun): ComparisonSite[] {
  if (run.sites?.length) return [...run.sites].sort((left, right) => left.inputOrder - right.inputOrder);
  const analyses = indexAnalyses(run.analyses);
  return [run.targetUrl, ...run.competitorUrls].map((url, inputOrder) => {
    const key = normalizeUrlKey(url);
    const analysis = analyses.get(key);
    if (!analysis) {
      return {
        role: inputOrder === 0 ? "target" : "competitor",
        inputOrder,
        inputUrl: url,
        normalizedUrl: key,
        finalUrl: key,
        eligibility: {
          status: "ineligible",
          usableAsBenchmark: false,
          reasons: []
        }
      };
    }
    return {
      role: inputOrder === 0 ? "target" : "competitor",
      inputOrder,
      inputUrl: analysis.requestedUrl,
      normalizedUrl: analysis.normalizedUrl,
      finalUrl: analysis.finalUrl,
      eligibility: classifyComparisonEligibility(analysis)
    };
  });
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
  return stableJson(left) === stableJson(right);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    const entries = Object.keys(object)
      .filter((key) => object[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`);
    return `{${entries.join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  return encoded === undefined ? "null" : encoded;
}

function classifyChange(previous: unknown, current: unknown): ChangeKind {
  if (isEmpty(previous) && !isEmpty(current)) return "added";
  if (!isEmpty(previous) && isEmpty(current)) return "removed";
  return "changed";
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}
