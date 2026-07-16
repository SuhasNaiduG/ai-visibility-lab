import { createHash } from "node:crypto";
import type { AnalyticsMetric, GrowthOpportunity, OpportunityEvidenceLink, SearchPerformanceRecord } from "./types.js";

export interface OpportunityGenerationResult {
  opportunities: GrowthOpportunity[];
  evidence: OpportunityEvidenceLink[];
}

export function generateOpportunities(projectId: string, metrics: AnalyticsMetric[], now: string): OpportunityGenerationResult {
  const opportunities: GrowthOpportunity[] = [];
  const evidence: OpportunityEvidenceLink[] = [];
  const add = (opportunity: GrowthOpportunity, records: AnalyticsMetric[]) => {
    if (opportunities.some((item) => item.opportunityId === opportunity.opportunityId)) return;
    opportunities.push(opportunity);
    for (const record of records) evidence.push({ opportunityId: opportunity.opportunityId, metricId: record.metricId, projectId, calculationRole: "deterministic rule input" });
  };

  for (const metric of metrics) {
    if (metric.metricType === "search-performance") generateSearchRow(metric, now).forEach((item) => add(item, [metric]));
    if (metric.metricType === "web-analytics") {
      if (metric.sessions >= 100 && metric.engagementRate !== null && metric.engagementRate < 0.4) add(opportunity(projectId, "ENGAGEMENT_HIGH_TRAFFIC_WEAK_ENGAGEMENT", metric.page, null, "Review a high-traffic page with weak reported engagement", "high", "engagement", `The imported row reports ${metric.sessions} sessions and ${(metric.engagementRate * 100).toFixed(2)}% engagement rate.`, `Threshold test: sessions ${metric.sessions} >= 100 and engagement rate ${(metric.engagementRate * 100).toFixed(2)}% < 40.00%.`, "Review the public page and measurement definition; identify an evidence-backed change that improves task completion without inflating events.", "On a later comparable import, engagement rate is at least 40.00% while sessions remain measurable.", "Imported engagement is provider-defined and can be affected by consent, instrumentation, traffic mix, and date range; this flag does not establish why engagement is low.", [metric.metricId], now), [metric]);
      if (metric.sessions >= 100 && metric.conversions !== null && metric.conversions / metric.sessions < 0.01) add(opportunity(projectId, "ENGAGEMENT_HIGH_TRAFFIC_LOW_CONVERSION", metric.page, null, "Review a high-traffic page with low reported conversion", "high", "engagement", `The imported row reports ${metric.sessions} sessions and ${metric.conversions} conversions.`, `Conversion rate = ${metric.conversions} / ${metric.sessions} = ${percent(metric.conversions / metric.sessions)}; threshold: sessions >= 100 and rate < 1.00%.`, "Check the page-to-action path, message match, and measurement setup before proposing a specific conversion change.", "On a later comparable import, conversion rate for the page is at least 1.00% with valid measurement.", "Aggregate conversion data does not identify user intent, attribution, or causal effects; instrumentation quality is not independently verified.", [metric.metricId], now), [metric]);
      if (metric.sessions < 50 && metric.conversions !== null && metric.sessions > 0 && metric.conversions / metric.sessions >= 0.05) add(opportunity(projectId, "ENGAGEMENT_LOW_TRAFFIC_STRONG_CONVERSION", metric.page, null, "Review discoverability for a low-traffic, strong-conversion page", "medium", "engagement", `The imported row reports ${metric.sessions} sessions and ${metric.conversions} conversions.`, `Conversion rate = ${metric.conversions} / ${metric.sessions} = ${percent(metric.conversions / metric.sessions)}; threshold: sessions < 50 and rate >= 5.00%.`, "Validate the page's public evidence and consider relevant internal discovery or search coverage without assuming more traffic will convert at the same rate.", "A later comparable import shows increased sessions while conversion rate remains at or above 5.00%.", "Small denominators are volatile, and the observed rate must not be extrapolated as a forecast.", [metric.metricId], now), [metric]);
    }
    if (metric.metricType === "campaign-performance" && metric.spend >= 100 && metric.conversions === 0) add(opportunity(projectId, "CAMPAIGN_SPEND_WITHOUT_CONVERSION", null, null, "Review campaign spend without reported conversion", "high", "campaign", `The imported campaign row reports spend ${metric.spend.toFixed(2)}, ${metric.clicks} clicks, and 0 conversions.`, `Threshold test: spend ${metric.spend.toFixed(2)} >= 100.00 and conversions = 0; cost per conversion is undefined.`, "Review campaign targeting, landing-page evidence, and conversion instrumentation before changing spend.", "A later comparable import reports at least one valid conversion or the campaign is intentionally stopped after review.", "The spend threshold is a review rule in source currency units; currency, attribution window, incrementality, and tracking accuracy are not available in this CSV contract.", [metric.metricId], now), [metric]);
    if (metric.metricType === "lead-summary" && metric.leads >= 20 && metric.qualifiedLeads / metric.leads < 0.25) add(opportunity(projectId, "LEAD_VOLUME_LOW_QUALIFICATION", null, null, "Review a lead source with low aggregate qualification", "high", "lead-quality", `The imported aggregate reports ${metric.leads} leads and ${metric.qualifiedLeads} qualified leads from ${metric.source}.`, `Qualification rate = ${metric.qualifiedLeads} / ${metric.leads} = ${percent(metric.qualifiedLeads / metric.leads)}; threshold: leads >= 20 and rate < 25.00%.`, "Review public acquisition message and aggregate qualification definition; do not inspect or import direct lead identities.", "On a later comparable aggregate import, qualification rate is at least 25.00% under the same definition.", "Aggregate counts do not expose lead-level causes, sales follow-up, or attribution; no personal or patient data is accepted.", [metric.metricId], now), [metric]);
  }

  const search = metrics.filter((metric): metric is SearchPerformanceRecord => metric.metricType === "search-performance");
  const queryGroups = new Map<string, SearchPerformanceRecord[]>();
  for (const metric of search) {
    const key = [metric.query.toLocaleLowerCase("en-US"), metric.date, metric.dateTo ?? "", metric.device.toLocaleLowerCase("en-US"), metric.country.toLocaleLowerCase("en-US")].join("|");
    queryGroups.set(key, [...(queryGroups.get(key) ?? []), metric]);
  }
  for (const records of queryGroups.values()) {
    const pages = new Set(records.map((item) => item.page));
    const impressions = records.reduce((sum, item) => sum + item.impressions, 0);
    if (pages.size > 1 && impressions >= 100) {
      const first = records[0]!;
      const metricIds = records.map((item) => item.metricId).sort();
      add(opportunity(projectId, "SEARCH_QUERY_MULTIPLE_PAGES", [...pages].sort().join(" | "), first.query, "Review a query reported across multiple pages", "medium", "search", `The same imported query segment appears on ${pages.size} pages with ${impressions} total impressions.`, `Distinct pages = ${pages.size}; total impressions = ${records.map((item) => item.impressions).join(" + ")} = ${impressions}; threshold: pages > 1 and impressions >= 100.`, "Review whether the pages serve distinct intents; consolidate or clarify public evidence only when the overlap is real.", "On a later comparable import, the intended page has the strongest impressions and clicks for this query segment without losing total clicks.", "Multiple pages for a query can be intentional and do not by themselves prove cannibalization.", metricIds, now, `query:${first.query}|date:${first.date}|device:${first.device}|country:${first.country}`), records);
    }
  }
  return { opportunities, evidence };
}

function generateSearchRow(metric: SearchPerformanceRecord, now: string): GrowthOpportunity[] {
  const result: GrowthOpportunity[] = [];
  const calculatedCtr = metric.impressions === 0 ? 0 : metric.clicks / metric.impressions;
  const observation = `The imported row reports ${metric.impressions} impressions, ${metric.clicks} clicks, ${percent(metric.ctr)} CTR, and average position ${metric.averagePosition.toFixed(2)}.`;
  const baseLimitation = "This is a deterministic review flag from imported aggregate values; it does not establish ranking causes, forecast impact, or verify the source platform's aggregation.";
  if (metric.impressions >= 100 && metric.ctr < 0.03) result.push(opportunity(metric.projectId, "SEARCH_HIGH_IMPRESSIONS_LOW_CTR", metric.page, metric.query, "Review a high-impression, low-CTR query", "high", "search", observation, `CTR check = imported ${percent(metric.ctr)}; row arithmetic ${metric.clicks} / ${metric.impressions} = ${percent(calculatedCtr)}; threshold: impressions >= 100 and CTR < 3.00%.`, "Compare the query with the page's public title, description, and answer evidence; revise only where the public evidence is incomplete or mismatched.", "On a later comparable import, CTR for the same query-page-device-country segment is at least 3.00% without materially worse average position.", baseLimitation, [metric.metricId], now));
  if (metric.impressions >= 50 && metric.averagePosition <= 5 && metric.ctr < 0.03) result.push(opportunity(metric.projectId, "SEARCH_STRONG_POSITION_LOW_CTR", metric.page, metric.query, "Review a strong-position, low-CTR query", "high", "search", observation, `Threshold test: average position ${metric.averagePosition.toFixed(2)} <= 5.00; impressions ${metric.impressions} >= 50; CTR ${percent(metric.ctr)} < 3.00%.`, "Review message match in the public title and description and confirm the page directly answers the imported query.", "On a later comparable import, CTR reaches 3.00% for the same segment while average position remains at or better than 5.00.", baseLimitation, [metric.metricId], now));
  if (metric.impressions >= 50 && metric.averagePosition > 10 && metric.averagePosition <= 20) result.push(opportunity(metric.projectId, "SEARCH_PAGE_TWO_DEMAND", metric.page, metric.query, "Review a page-two query with demonstrated impressions", "medium", "search", observation, `Threshold test: 10.00 < average position ${metric.averagePosition.toFixed(2)} <= 20.00 and impressions ${metric.impressions} >= 50.`, "Inspect matching public evidence and competitor evidence; fill a verified coverage gap or improve internal discovery only when supported.", "On a later comparable import, average position is at or better than 10.00 while clicks do not decline.", baseLimitation, [metric.metricId], now));
  return result;
}

function opportunity(projectId: string, ruleId: string, page: string | null, query: string | null, title: string, priority: GrowthOpportunity["priority"], category: GrowthOpportunity["category"], observation: string, exactCalculation: string, proposedAction: string, successMetric: string, limitation: string, sourceMetricIds: string[], now: string, explicitGroupKey?: string): GrowthOpportunity {
  const groupKey = explicitGroupKey ?? `${page ?? "all-pages"}|${query ?? "all-queries"}`;
  return {
    opportunityId: `opportunity:${hash(`${projectId}|${ruleId}|${groupKey}`).slice(0, 32)}`,
    projectId,
    ruleId,
    ruleVersion: "1.0.0",
    groupKey,
    title,
    status: "new",
    priority,
    category,
    page: page?.includes(" | ") ? null : page,
    query,
    observation,
    exactCalculation,
    proposedAction,
    successMetric,
    limitation,
    sourceMetricIds,
    createdAt: now,
    updatedAt: now
  };
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
