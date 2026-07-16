import type { AnalyticsFilters, AnalyticsMetric, GrowthOpportunity } from "./types.js";

export function filterMetrics(metrics: AnalyticsMetric[], filters: AnalyticsFilters = {}): AnalyticsMetric[] {
  const page = filters.page?.trim().toLocaleLowerCase("en-US");
  const query = filters.query?.trim().toLocaleLowerCase("en-US");
  const device = filters.device?.trim().toLocaleLowerCase("en-US");
  const country = filters.country?.trim().toLocaleLowerCase("en-US");
  return metrics.filter((metric) => {
    if (filters.metricType && metric.metricType !== filters.metricType) return false;
    const metricPage = "page" in metric ? metric.page.toLocaleLowerCase("en-US") : "";
    if (page && !metricPage.includes(page)) return false;
    const metricQuery = metric.metricType === "search-performance" ? metric.query.toLocaleLowerCase("en-US") : "";
    if (query && !metricQuery.includes(query)) return false;
    if (filters.dateFrom && (metric.dateTo ?? metric.date) < filters.dateFrom) return false;
    if (filters.dateTo && metric.date > filters.dateTo) return false;
    const metricDevice = "device" in metric ? metric.device?.toLocaleLowerCase("en-US") : null;
    if (device && metricDevice !== device) return false;
    const metricCountry = "country" in metric ? metric.country?.toLocaleLowerCase("en-US") : null;
    if (country && metricCountry !== country) return false;
    return true;
  }).sort((left, right) => right.date.localeCompare(left.date) || left.metricId.localeCompare(right.metricId));
}

export function mergeOpportunity(existing: GrowthOpportunity | undefined, incoming: GrowthOpportunity): GrowthOpportunity {
  return existing
    ? { ...incoming, status: existing.status, createdAt: existing.createdAt }
    : incoming;
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
