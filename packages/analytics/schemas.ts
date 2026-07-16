import { z } from "zod";
import { ANALYTICS_SCHEMA_VERSION, CONNECTOR_VERSION, TRANSFORMATION_VERSION } from "./types.js";

const identifier = z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9:_-]+$/u);
const dateTime = z.iso.datetime({ offset: true });
const date = z.iso.date();
const httpUrl = z.url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol));
const safeLabel = z.string().trim().min(1).max(200).refine((value) => !/[\r\n\0]/u.test(value));
const nullableLabel = safeLabel.nullable();
const nonNegative = z.number().finite().nonnegative();

export const projectReferenceSchema = z.strictObject({
  projectId: identifier,
  createdAt: dateTime,
  targetUrl: httpUrl,
  status: safeLabel
});

export const connectorSourceSchema = z.strictObject({
  sourceId: identifier,
  projectId: identifier,
  connectorId: identifier,
  connectorVersion: z.literal(CONNECTOR_VERSION),
  kind: z.enum(["search-console", "web-analytics", "campaign", "lead-summary"]),
  label: safeLabel,
  accountLabel: nullableLabel,
  propertyLabel: nullableLabel,
  createdAt: dateTime
});

export const importJobSchema = z.strictObject({
  importId: identifier,
  projectId: identifier,
  sourceId: identifier,
  createdAt: dateTime,
  completedAt: dateTime,
  status: z.enum(["completed", "completed-with-rejections"]),
  fileName: safeLabel.max(255),
  mimeType: safeLabel.max(100),
  fileSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  mapping: z.record(z.string().min(1).max(100), z.string().min(1).max(200)),
  totalRows: z.number().int().nonnegative(),
  acceptedRows: z.number().int().nonnegative(),
  rejectedRows: z.number().int().nonnegative(),
  duplicateRows: z.number().int().nonnegative(),
  sourceDateFrom: date.nullable(),
  sourceDateTo: date.nullable(),
  limitations: z.array(safeLabel.max(500)).min(1).max(20)
}).superRefine((job, context) => {
  if (job.totalRows !== job.acceptedRows + job.rejectedRows) context.addIssue({ code: "custom", path: ["totalRows"], message: "totalRows must equal acceptedRows plus rejectedRows" });
  if (job.duplicateRows > job.rejectedRows) context.addIssue({ code: "custom", path: ["duplicateRows"], message: "duplicateRows cannot exceed rejectedRows" });
});

export const importRejectionSchema = z.strictObject({
  rejectionId: identifier,
  importId: identifier,
  projectId: identifier,
  rowNumber: z.number().int().min(2),
  code: z.enum(["INVALID_VALUE", "MISSING_VALUE", "DUPLICATE_RECORD", "FORMULA_VALUE", "UNSUPPORTED_SENSITIVE_FIELD"]),
  field: z.string().min(1).max(100).nullable(),
  message: safeLabel.max(300)
});

const lineageSchema = z.strictObject({
  projectId: identifier,
  sourceId: identifier,
  importId: identifier,
  connectorId: identifier,
  connectorVersion: z.literal(CONNECTOR_VERSION),
  importMethod: z.literal("csv"),
  sourceRecordId: z.string().regex(/^[a-f0-9]{64}$/u),
  normalizedRecordHash: z.string().regex(/^[a-f0-9]{64}$/u),
  importedAt: dateTime,
  sourceDate: date,
  sourceDateTo: date.nullable(),
  transformationVersion: z.literal(TRANSFORMATION_VERSION),
  validationStatus: z.literal("accepted"),
  confidence: z.literal("reported-by-import"),
  limitations: z.array(safeLabel.max(500)).min(1).max(20)
});

const metricBase = {
  metricId: identifier,
  projectId: identifier,
  sourceId: identifier,
  importId: identifier,
  date,
  dateTo: date.nullable(),
  lineage: lineageSchema
};

export const analyticsMetricSchema = z.discriminatedUnion("metricType", [
  z.strictObject({ ...metricBase, metricType: z.literal("search-performance"), query: safeLabel.max(1_000), page: httpUrl, clicks: nonNegative.int(), impressions: nonNegative.int(), ctr: z.number().finite().min(0).max(1), averagePosition: z.number().finite().positive(), device: safeLabel, country: safeLabel }),
  z.strictObject({ ...metricBase, metricType: z.literal("web-analytics"), page: httpUrl, sessions: nonNegative.int(), users: nonNegative.int().nullable(), engagementRate: z.number().finite().min(0).max(1).nullable(), conversions: nonNegative.nullable(), device: nullableLabel, country: nullableLabel }),
  z.strictObject({ ...metricBase, metricType: z.literal("campaign-performance"), campaign: safeLabel.max(500), spend: nonNegative, clicks: nonNegative.int(), conversions: nonNegative }),
  z.strictObject({ ...metricBase, metricType: z.literal("lead-summary"), source: safeLabel.max(500), leads: nonNegative.int(), qualifiedLeads: nonNegative.int() })
]).superRefine((metric, context) => {
  for (const key of ["projectId", "sourceId", "importId"] as const) {
    if (metric[key] !== metric.lineage[key]) context.addIssue({ code: "custom", path: ["lineage", key], message: `${key} must align with the metric` });
  }
  if (metric.date !== metric.lineage.sourceDate || metric.dateTo !== metric.lineage.sourceDateTo) context.addIssue({ code: "custom", path: ["lineage", "sourceDate"], message: "lineage dates must align with the metric" });
});

export const opportunityStatusSchema = z.enum(["new", "reviewed", "approved", "rejected", "implemented", "monitoring", "verified"]);

export const growthOpportunitySchema = z.strictObject({
  opportunityId: identifier,
  projectId: identifier,
  ruleId: identifier,
  ruleVersion: z.literal("1.0.0"),
  groupKey: safeLabel.max(2_000),
  title: safeLabel.max(300),
  status: opportunityStatusSchema,
  priority: z.enum(["high", "medium", "low"]),
  category: z.enum(["search", "engagement", "campaign", "lead-quality"]),
  page: httpUrl.nullable(),
  query: safeLabel.max(1_000).nullable(),
  observation: safeLabel.max(2_000),
  exactCalculation: safeLabel.max(2_000),
  proposedAction: safeLabel.max(2_000),
  successMetric: safeLabel.max(1_000),
  limitation: safeLabel.max(2_000),
  sourceMetricIds: z.array(identifier).min(1).max(1_000),
  createdAt: dateTime,
  updatedAt: dateTime
});

export const opportunityEvidenceSchema = z.strictObject({ opportunityId: identifier, metricId: identifier, projectId: identifier, calculationRole: safeLabel.max(200) });

export const auditEventSchema = z.strictObject({
  eventId: identifier,
  projectId: identifier,
  occurredAt: dateTime,
  eventType: z.enum(["project.registered", "import.completed", "import.deleted", "opportunity.status-changed"]),
  importRef: identifier.nullable(),
  summary: z.record(z.string().min(1).max(100), z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]))
});

export const analyticsStateSchema = z.strictObject({
  schemaVersion: z.literal(ANALYTICS_SCHEMA_VERSION),
  projects: z.array(projectReferenceSchema),
  sources: z.array(connectorSourceSchema),
  imports: z.array(importJobSchema),
  rejections: z.array(importRejectionSchema),
  metrics: z.array(analyticsMetricSchema),
  opportunities: z.array(growthOpportunitySchema),
  opportunityEvidence: z.array(opportunityEvidenceSchema),
  auditEvents: z.array(auditEventSchema)
});

export const emptyAnalyticsState = () => analyticsStateSchema.parse({ schemaVersion: ANALYTICS_SCHEMA_VERSION, projects: [], sources: [], imports: [], rejections: [], metrics: [], opportunities: [], opportunityEvidence: [], auditEvents: [] });
