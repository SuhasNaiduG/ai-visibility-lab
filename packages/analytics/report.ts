import { escapeSpreadsheetCell } from "./csv.js";
import type { AnalyticsAuditEvent, AnalyticsMetric, ConnectorSource, GrowthOpportunity, ImportJob, ProjectReference } from "./types.js";

export interface GrowthAnalyticsReport {
  reportVersion: "1.0.0";
  generatedAt: string;
  project: ProjectReference;
  sources: ConnectorSource[];
  imports: ImportJob[];
  metrics: AnalyticsMetric[];
  opportunities: GrowthOpportunity[];
  auditEvents: AnalyticsAuditEvent[];
  limitations: string[];
}

export function buildGrowthAnalyticsReport(input: Omit<GrowthAnalyticsReport, "reportVersion" | "limitations">): GrowthAnalyticsReport {
  return {
    reportVersion: "1.0.0",
    ...input,
    limitations: [
      "All analytics values come from normalized CSV imports; no live provider data was requested.",
      "Opportunities are deterministic review flags with exact thresholds, not forecasts or causal claims.",
      "Original CSV files and rejected cell values are not retained.",
      "Public website and competitor evidence is stored separately in saved research runs and may represent a different observation date."
    ]
  };
}

export function growthReportJson(report: GrowthAnalyticsReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function growthReportMarkdown(report: GrowthAnalyticsReport): string {
  const lines = [
    `# Growth intelligence report: ${report.project.targetUrl}`,
    "",
    `Generated: ${report.generatedAt}`,
    `Project: ${report.project.projectId}`,
    "",
    "## Import summary",
    "",
    `- Sources: ${report.sources.length}`,
    `- Imports: ${report.imports.length}`,
    `- Normalized records: ${report.metrics.length}`,
    `- Opportunities: ${report.opportunities.length}`,
    "",
    "## Opportunity backlog",
    ""
  ];
  for (const item of report.opportunities) lines.push(`### ${item.title}`, "", `- Status: ${item.status}`, `- Priority: ${item.priority}`, `- Observation: ${item.observation}`, `- Exact calculation: ${item.exactCalculation}`, `- Proposed action: ${item.proposedAction}`, `- Success metric: ${item.successMetric}`, `- Limitation: ${item.limitation}`, "");
  lines.push("## Limitations", "", ...report.limitations.map((item) => `- ${item}`), "");
  return lines.join("\n");
}

export function growthReportCsv(report: GrowthAnalyticsReport): string {
  const header = ["record_type", "project_id", "record_id", "metric_type_or_rule", "date", "page", "query", "observation_or_value", "calculation", "status", "limitation"];
  const rows: Array<Array<string | number | null>> = [header];
  for (const metric of report.metrics) rows.push([
    "metric",
    metric.projectId,
    metric.metricId,
    metric.metricType,
    metric.dateTo ? `${metric.date} to ${metric.dateTo}` : metric.date,
    "page" in metric ? metric.page : null,
    metric.metricType === "search-performance" ? metric.query : null,
    metricValue(metric),
    null,
    "accepted",
    metric.lineage.limitations.join(" ")
  ]);
  for (const item of report.opportunities) rows.push(["opportunity", item.projectId, item.opportunityId, item.ruleId, item.updatedAt, item.page, item.query, item.observation, item.exactCalculation, item.status, item.limitation]);
  return `${rows.map((row) => row.map(escapeSpreadsheetCell).join(",")).join("\r\n")}\r\n`;
}

function metricValue(metric: AnalyticsMetric): string {
  if (metric.metricType === "search-performance") return `clicks=${metric.clicks}; impressions=${metric.impressions}; ctr=${metric.ctr}; averagePosition=${metric.averagePosition}; device=${metric.device}; country=${metric.country}`;
  if (metric.metricType === "web-analytics") return `sessions=${metric.sessions}; users=${metric.users ?? "not imported"}; engagementRate=${metric.engagementRate ?? "not imported"}; conversions=${metric.conversions ?? "not imported"}`;
  if (metric.metricType === "campaign-performance") return `campaign=${metric.campaign}; spend=${metric.spend}; clicks=${metric.clicks}; conversions=${metric.conversions}`;
  return `source=${metric.source}; leads=${metric.leads}; qualifiedLeads=${metric.qualifiedLeads}`;
}
