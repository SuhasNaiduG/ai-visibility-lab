import {
  analyticsMetricSchema,
  auditEventSchema,
  connectorSourceSchema,
  growthOpportunitySchema,
  importJobSchema,
  importRejectionSchema,
  opportunityEvidenceSchema,
  projectReferenceSchema
} from "./schemas.js";
import type { AnalyticsState, ImportBundle } from "./types.js";

export class AnalyticsStoreError extends Error {
  constructor(
    readonly code: "INVALID_ANALYTICS_RECORD" | "PROJECT_NOT_FOUND" | "DUPLICATE_RECORD" | "CORRUPT_ANALYTICS_STORE" | "ANALYTICS_STORE_IO_ERROR",
    message: string,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "AnalyticsStoreError";
  }
}

export function validateImportBundle(input: ImportBundle, state?: AnalyticsState): ImportBundle {
  const parsed: ImportBundle = {
    project: parse(projectReferenceSchema, input.project, "project"),
    source: parse(connectorSourceSchema, input.source, "source"),
    job: parse(importJobSchema, input.job, "job"),
    rejections: input.rejections.map((value, index) => parse(importRejectionSchema, value, `rejections.${index}`)),
    metrics: input.metrics.map((value, index) => parse(analyticsMetricSchema, value, `metrics.${index}`)),
    opportunities: input.opportunities.map((value, index) => parse(growthOpportunitySchema, value, `opportunities.${index}`)),
    evidence: input.evidence.map((value, index) => parse(opportunityEvidenceSchema, value, `evidence.${index}`)),
    auditEvent: parse(auditEventSchema, input.auditEvent, "auditEvent")
  };
  const ids = [parsed.source.projectId, parsed.job.projectId, parsed.auditEvent.projectId];
  if (ids.some((id) => id !== parsed.project.projectId)) invalid("project IDs do not align", { field: "projectId" });
  if (parsed.job.sourceId !== parsed.source.sourceId) invalid("import source does not align", { field: "job.sourceId" });
  if (parsed.rejections.some((item) => item.projectId !== parsed.project.projectId || item.importId !== parsed.job.importId)) invalid("rejection identity does not align");
  if (parsed.metrics.some((item) => item.projectId !== parsed.project.projectId || item.importId !== parsed.job.importId || item.sourceId !== parsed.source.sourceId)) invalid("metric identity does not align");
  if (parsed.opportunities.some((item) => item.projectId !== parsed.project.projectId)) invalid("opportunity identity does not align");
  const metricIds = new Set(parsed.metrics.map((item) => item.metricId));
  const opportunityIds = new Set(parsed.opportunities.map((item) => item.opportunityId));
  if (metricIds.size !== parsed.metrics.length) duplicate("metricId", "bundle");
  const recordHashes = new Set(parsed.metrics.map((item) => `${item.projectId}|${item.sourceId}|${item.lineage.normalizedRecordHash}`));
  if (recordHashes.size !== parsed.metrics.length) duplicate("normalizedRecordHash", "bundle");
  if (parsed.evidence.some((item) => item.projectId !== parsed.project.projectId || !metricIds.has(item.metricId) || !opportunityIds.has(item.opportunityId))) invalid("opportunity evidence references an unknown bundle record");
  if (parsed.job.acceptedRows !== parsed.metrics.length || parsed.job.rejectedRows !== parsed.rejections.length) invalid("import counts do not align with normalized records", { field: "job.acceptedRows" });
  if (state) {
    const project = state.projects.find((item) => item.projectId === parsed.project.projectId);
    if (!project) throw new AnalyticsStoreError("PROJECT_NOT_FOUND", "Analytics imports require an existing research project", { projectId: parsed.project.projectId });
    if (project.targetUrl !== parsed.project.targetUrl) invalid("project target URL does not align with the existing research project", { field: "project.targetUrl" });
    const existing = new Set(state.metrics.map((item) => `${item.projectId}|${item.sourceId}|${item.lineage.normalizedRecordHash}`));
    const collision = parsed.metrics.find((item) => existing.has(`${item.projectId}|${item.sourceId}|${item.lineage.normalizedRecordHash}`));
    if (collision) duplicate("normalizedRecordHash", collision.lineage.normalizedRecordHash);
  }
  return structuredClone(parsed);
}

export function validateStateRelationships(state: AnalyticsState): void {
  const projects = new Map(state.projects.map((item) => [item.projectId, item]));
  const sources = new Map(state.sources.map((item) => [item.sourceId, item]));
  const imports = new Map(state.imports.map((item) => [item.importId, item]));
  const metrics = new Map(state.metrics.map((item) => [item.metricId, item]));
  const opportunities = new Map(state.opportunities.map((item) => [item.opportunityId, item]));
  if (state.projects.length !== projects.size || state.sources.length !== sources.size || state.imports.length !== imports.size || state.metrics.length !== metrics.size || state.opportunities.length !== opportunities.size) invalid("analytics state contains duplicate primary identities");
  for (const source of state.sources) if (!projects.has(source.projectId)) invalid("source references an unknown project");
  for (const job of state.imports) {
    const source = sources.get(job.sourceId);
    if (!projects.has(job.projectId) || !source || source.projectId !== job.projectId) invalid("import references an unknown or cross-project source");
  }
  const hashes = new Set<string>();
  for (const metric of state.metrics) {
    const job = imports.get(metric.importId);
    if (!job || job.projectId !== metric.projectId || job.sourceId !== metric.sourceId) invalid("metric references an unknown or cross-project import");
    const hash = `${metric.projectId}|${metric.sourceId}|${metric.lineage.normalizedRecordHash}`;
    if (hashes.has(hash)) duplicate("normalizedRecordHash", metric.lineage.normalizedRecordHash);
    hashes.add(hash);
  }
  for (const rejection of state.rejections) {
    const job = imports.get(rejection.importId);
    if (!job || job.projectId !== rejection.projectId) invalid("rejection references an unknown or cross-project import");
  }
  for (const opportunity of state.opportunities) if (!projects.has(opportunity.projectId)) invalid("opportunity references an unknown project");
  for (const link of state.opportunityEvidence) {
    const metric = metrics.get(link.metricId);
    const opportunity = opportunities.get(link.opportunityId);
    if (!metric || !opportunity || metric.projectId !== link.projectId || opportunity.projectId !== link.projectId) invalid("opportunity evidence crosses a project boundary");
  }
}

function parse<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: unknown } } }, value: unknown, field: string): T {
  const result = schema.safeParse(value);
  if (!result.success) invalid("analytics record failed strict validation", { field, issues: result.error.issues });
  return result.data;
}

function invalid(message: string, details: Record<string, unknown> = {}): never {
  throw new AnalyticsStoreError("INVALID_ANALYTICS_RECORD", message, details);
}

function duplicate(field: string, value: string): never {
  throw new AnalyticsStoreError("DUPLICATE_RECORD", "A deterministic duplicate analytics record was rejected", { field, value });
}
