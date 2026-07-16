import { normalizeUrl } from "../crawler/url.js";
import type { RunRecord } from "../storage/types.js";
import type { GrowthOpportunity, SearchPerformanceRecord } from "./types.js";

export interface SearchPerformanceDetail {
  metrics: SearchPerformanceRecord;
  matchingPublicWebsiteEvidence: null | {
    runId: string;
    sourceUrl: string;
    fetchedAt: string;
    title: string | null;
    metaDescription: string | null;
    h1: string[];
    relevantFindings: Array<{ ruleId: string; message: string }>;
  };
  relatedCompetitorEvidence: Array<{
    sourceUrl: string;
    topicTerms: string[];
    questions: string[];
    relevantGapIds: string[];
  }>;
  deterministicOpportunity: GrowthOpportunity | null;
  exactCalculation: string | null;
  proposedAction: string | null;
  successMetric: string | null;
  limitation: string;
}

export function buildSearchPerformanceDetail(metric: SearchPerformanceRecord, opportunities: GrowthOpportunity[], run: RunRecord | null): SearchPerformanceDetail {
  const opportunity = opportunities.find((item) => item.sourceMetricIds.includes(metric.metricId)) ?? null;
  if (!run) return {
    metrics: metric,
    matchingPublicWebsiteEvidence: null,
    relatedCompetitorEvidence: [],
    deterministicOpportunity: opportunity,
    exactCalculation: opportunity?.exactCalculation ?? null,
    proposedAction: opportunity?.proposedAction ?? null,
    successMetric: opportunity?.successMetric ?? null,
    limitation: joinLimitations(opportunity?.limitation, "No saved comparison run matches the research project's target URL, so public website and competitor evidence cannot be linked.")
  };
  const normalizedPage = safeNormalize(metric.page);
  const matching = run.analyses.find((analysis) => safeNormalize(analysis.finalUrl) === normalizedPage || safeNormalize(analysis.normalizedUrl) === normalizedPage);
  const queryTerms = terms(metric.query);
  const relevantGapIds = run.comparison.targetGaps.filter((gap) => [...terms(`${gap.metric} ${gap.exactDifference}`)].some((term) => queryTerms.has(term))).map((gap) => gap.gapId);
  const competitors = run.analyses.slice(1).map((analysis) => ({
    sourceUrl: analysis.finalUrl,
    topicTerms: analysisTopicTerms(analysis).filter((term) => queryTerms.has(term.toLocaleLowerCase("en-US"))),
    questions: analysis.detectedQuestions.filter((question) => [...terms(question)].some((term) => queryTerms.has(term))),
    relevantGapIds
  })).filter((item) => item.topicTerms.length > 0 || item.questions.length > 0 || item.relevantGapIds.length > 0);
  return {
    metrics: metric,
    matchingPublicWebsiteEvidence: matching ? {
      runId: run.id,
      sourceUrl: matching.finalUrl,
      fetchedAt: matching.fetchedAt,
      title: matching.title,
      metaDescription: matching.metaDescription,
      h1: matching.h1Text,
      relevantFindings: matching.findings.filter((finding) => [...terms(`${finding.ruleId} ${finding.problem}`)].some((term) => queryTerms.has(term))).map((finding) => ({ ruleId: finding.ruleId, message: finding.problem }))
    } : null,
    relatedCompetitorEvidence: competitors,
    deterministicOpportunity: opportunity,
    exactCalculation: opportunity?.exactCalculation ?? null,
    proposedAction: opportunity?.proposedAction ?? null,
    successMetric: opportunity?.successMetric ?? null,
    limitation: joinLimitations(opportunity?.limitation, matching ? "Public website evidence comes from the latest saved static-HTML run and may differ from the imported analytics date range." : "No analyzed page in the latest saved run matched the imported page URL; no page evidence is inferred.", competitors.length === 0 ? "No query-related competitor evidence was observed in the latest saved run; no competitor claim is inferred." : "Competitor evidence is limited to public pages in the latest saved comparison run.")
  };
}

function terms(value: string): Set<string> {
  return new Set(value.toLocaleLowerCase("en-US").split(/[^\p{L}\p{N}]+/u).filter((term) => term.length >= 3));
}

function safeNormalize(value: string): string {
  try { return normalizeUrl(value).toString(); }
  catch { return value; }
}

function joinLimitations(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function analysisTopicTerms(analysis: RunRecord["analyses"][number]): string[] {
  return [...new Set([
    ...analysis.coverage.contentSection.terms,
    ...analysis.coverage.service.terms,
    ...analysis.coverage.entity.terms,
    ...analysis.coverage.location.terms
  ])];
}
