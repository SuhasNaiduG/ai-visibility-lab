import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { normalizeUrl } from "../crawler/url.js";
import {
  analyticsMetricSchema,
  auditEventSchema,
  connectorSourceSchema,
  growthOpportunitySchema,
  importJobSchema,
  importRejectionSchema,
  opportunityEvidenceSchema,
  opportunityStatusSchema,
  projectReferenceSchema
} from "./schemas.js";
import { ANALYTICS_SQLITE_MIGRATION } from "./sqlite-migration.js";
import { filterMetrics, mergeOpportunity, stableJson } from "./store-utils.js";
import type {
  AnalyticsAuditEvent,
  AnalyticsFilters,
  AnalyticsMetric,
  AnalyticsStore,
  ConnectorSource,
  GrowthOpportunity,
  ImportBundle,
  ImportJob,
  ImportRejection,
  OpportunityEvidenceLink,
  OpportunityStatus,
  ProjectReference
} from "./types.js";
import { AnalyticsStoreError, validateImportBundle } from "./validation.js";

export interface SqliteAnalyticsStoreOptions {
  clock?: () => Date;
  applyMigration?: boolean;
}

export class SqliteAnalyticsStore implements AnalyticsStore {
  private readonly database: DatabaseSync;
  private readonly clock: () => Date;

  constructor(path = resolve(process.env.DATA_DIR ?? "data", "research.sqlite"), options: SqliteAnalyticsStoreOptions = {}) {
    const resolved = path === ":memory:" ? path : resolve(path);
    if (resolved !== ":memory:") mkdirSync(dirname(resolved), { recursive: true });
    this.database = new DatabaseSync(resolved, { timeout: 5_000, enableForeignKeyConstraints: true });
    this.database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
    this.clock = options.clock ?? (() => new Date());
    const foreignKeys = (this.database.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys;
    if (foreignKeys !== 1) throw new AnalyticsStoreError("ANALYTICS_STORE_IO_ERROR", "SQLite foreign-key enforcement could not be enabled");
    this.assertFoundation();
    if (options.applyMigration !== false) this.migrate();
    this.assertAnalyticsSchema();
  }

  async registerProject(input: ProjectReference): Promise<ProjectReference> {
    const project = projectReferenceSchema.parse(input);
    const existing = this.readProject(project.projectId);
    if (!existing) throw new AnalyticsStoreError("PROJECT_NOT_FOUND", "Analytics require an existing research_projects row", { projectId: project.projectId });
    if (existing.targetUrl !== project.targetUrl) throw new AnalyticsStoreError("INVALID_ANALYTICS_RECORD", "Project target URL conflicts with research_projects", { projectId: project.projectId });
    return project;
  }

  async listProjects(): Promise<ProjectReference[]> {
    const rows = this.database.prepare("SELECT id, created_at, target_url, status FROM research_projects ORDER BY created_at DESC, id").all() as unknown as ProjectRow[];
    return rows.map(toProject);
  }

  async getProject(projectId: string): Promise<ProjectReference | null> {
    return this.readProject(projectId);
  }

  async saveImport(input: ImportBundle): Promise<ImportJob> {
    const bundle = validateImportBundle(input);
    await this.registerProject(bundle.project);
    try {
      this.database.exec("BEGIN IMMEDIATE");
      const existingSourceRow = this.database.prepare("SELECT source_json FROM connector_sources WHERE id = ?").get(bundle.source.sourceId) as { source_json: string } | undefined;
      if (existingSourceRow) {
        const existingSource = decode(existingSourceRow.source_json, connectorSourceSchema, "connector source");
        if (stableJson(existingSource) !== stableJson(bundle.source)) throw new AnalyticsStoreError("INVALID_ANALYTICS_RECORD", "Connector source identity conflicts with an existing source", { sourceId: bundle.source.sourceId });
      } else {
        this.database.prepare("INSERT INTO connector_sources (id, project_id, connector_id, connector_version, kind, label, source_json) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(bundle.source.sourceId, bundle.source.projectId, bundle.source.connectorId, bundle.source.connectorVersion, bundle.source.kind, bundle.source.label, JSON.stringify(bundle.source));
      }
      this.database.prepare("INSERT INTO import_jobs (id, project_id, source_id, created_at, status, file_sha256, job_json) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(bundle.job.importId, bundle.job.projectId, bundle.job.sourceId, bundle.job.createdAt, bundle.job.status, bundle.job.fileSha256, JSON.stringify(bundle.job));
      const rejectionStatement = this.database.prepare("INSERT INTO import_rejections (id, import_id, project_id, row_number, rejection_json) VALUES (?, ?, ?, ?, ?)");
      for (const rejection of bundle.rejections) rejectionStatement.run(rejection.rejectionId, rejection.importId, rejection.projectId, rejection.rowNumber, JSON.stringify(rejection));
      const metricStatement = this.database.prepare("INSERT INTO metric_records (id, project_id, source_id, import_id, metric_type, source_date, page_url, query_text, source_record_id, normalized_record_hash, record_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      for (const metric of bundle.metrics) metricStatement.run(metric.metricId, metric.projectId, metric.sourceId, metric.importId, metric.metricType, metric.date, "page" in metric ? metric.page : null, metric.metricType === "search-performance" ? metric.query : null, metric.lineage.sourceRecordId, metric.lineage.normalizedRecordHash, JSON.stringify(metric));
      const opportunityStatement = this.database.prepare(`INSERT INTO opportunities (id, project_id, rule_id, group_key, status, priority, updated_at, opportunity_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET status = excluded.status, priority = excluded.priority, updated_at = excluded.updated_at, opportunity_json = excluded.opportunity_json`);
      for (const opportunity of bundle.opportunities) {
        const existingRow = this.database.prepare("SELECT opportunity_json FROM opportunities WHERE id = ? AND project_id = ?").get(opportunity.opportunityId, opportunity.projectId) as { opportunity_json: string } | undefined;
        const existing = existingRow ? decode(existingRow.opportunity_json, growthOpportunitySchema, "opportunity") : undefined;
        const merged = mergeOpportunity(existing, opportunity);
        opportunityStatement.run(merged.opportunityId, merged.projectId, merged.ruleId, merged.groupKey, merged.status, merged.priority, merged.updatedAt, JSON.stringify(merged));
      }
      const evidenceStatement = this.database.prepare("INSERT OR IGNORE INTO opportunity_evidence (opportunity_id, metric_id, project_id, calculation_role) VALUES (?, ?, ?, ?)");
      for (const link of bundle.evidence) evidenceStatement.run(link.opportunityId, link.metricId, link.projectId, link.calculationRole);
      this.insertAudit(bundle.auditEvent);
      this.database.exec("COMMIT");
      return structuredClone(bundle.job);
    } catch (error: unknown) {
      if (this.database.isTransaction) this.database.exec("ROLLBACK");
      throw mapSqlError(error, "Could not save the analytics import transaction");
    }
  }

  async listSources(projectId: string): Promise<ConnectorSource[]> {
    const rows = this.database.prepare("SELECT source_json FROM connector_sources WHERE project_id = ? ORDER BY kind, id").all(projectId) as JsonRow<"source_json">[];
    return rows.map((row) => decode(row.source_json, connectorSourceSchema, "connector source"));
  }

  async listImports(projectId: string): Promise<ImportJob[]> {
    const rows = this.database.prepare("SELECT job_json FROM import_jobs WHERE project_id = ? ORDER BY created_at DESC, id").all(projectId) as JsonRow<"job_json">[];
    return rows.map((row) => decode(row.job_json, importJobSchema, "import job"));
  }

  async getImport(projectId: string, importId: string): Promise<{ job: ImportJob; rejections: ImportRejection[] } | null> {
    const row = this.database.prepare("SELECT job_json FROM import_jobs WHERE project_id = ? AND id = ?").get(projectId, importId) as JsonRow<"job_json"> | undefined;
    if (!row) return null;
    const rejections = this.database.prepare("SELECT rejection_json FROM import_rejections WHERE project_id = ? AND import_id = ? ORDER BY row_number, id").all(projectId, importId) as JsonRow<"rejection_json">[];
    return { job: decode(row.job_json, importJobSchema, "import job"), rejections: rejections.map((item) => decode(item.rejection_json, importRejectionSchema, "import rejection")) };
  }

  async deleteImport(projectId: string, importId: string, inputEvent: AnalyticsAuditEvent): Promise<boolean> {
    const event = auditEventSchema.parse(inputEvent);
    if (event.projectId !== projectId || event.importRef !== importId || event.eventType !== "import.deleted") throw new AnalyticsStoreError("INVALID_ANALYTICS_RECORD", "Deletion audit identity does not align");
    const exists = this.database.prepare("SELECT 1 AS found FROM import_jobs WHERE project_id = ? AND id = ?").get(projectId, importId);
    if (!exists) return false;
    try {
      this.database.exec("BEGIN IMMEDIATE");
      this.database.prepare("DELETE FROM import_jobs WHERE project_id = ? AND id = ?").run(projectId, importId);
      this.insertAudit(event);
      this.database.exec("COMMIT");
      return true;
    } catch (error: unknown) {
      if (this.database.isTransaction) this.database.exec("ROLLBACK");
      throw mapSqlError(error, "Could not delete the analytics import");
    }
  }

  async listMetrics(projectId: string, filters: AnalyticsFilters = {}): Promise<AnalyticsMetric[]> {
    const rows = this.database.prepare("SELECT record_json FROM metric_records WHERE project_id = ? ORDER BY source_date DESC, id").all(projectId) as JsonRow<"record_json">[];
    return filterMetrics(rows.map((row) => decode(row.record_json, analyticsMetricSchema, "metric record")), filters);
  }

  async getMetric(projectId: string, metricId: string): Promise<AnalyticsMetric | null> {
    const row = this.database.prepare("SELECT record_json FROM metric_records WHERE project_id = ? AND id = ?").get(projectId, metricId) as JsonRow<"record_json"> | undefined;
    return row ? decode(row.record_json, analyticsMetricSchema, "metric record") : null;
  }

  async listOpportunities(projectId: string): Promise<GrowthOpportunity[]> {
    const rows = this.database.prepare("SELECT opportunity_json FROM opportunities WHERE project_id = ? ORDER BY updated_at DESC, id").all(projectId) as JsonRow<"opportunity_json">[];
    return rows.map((row) => decode(row.opportunity_json, growthOpportunitySchema, "opportunity"));
  }

  async getOpportunity(projectId: string, opportunityId: string): Promise<GrowthOpportunity | null> {
    const row = this.database.prepare("SELECT opportunity_json FROM opportunities WHERE project_id = ? AND id = ?").get(projectId, opportunityId) as JsonRow<"opportunity_json"> | undefined;
    return row ? decode(row.opportunity_json, growthOpportunitySchema, "opportunity") : null;
  }

  async updateOpportunityStatus(projectId: string, opportunityId: string, rawStatus: OpportunityStatus, inputEvent: AnalyticsAuditEvent): Promise<GrowthOpportunity | null> {
    const status = opportunityStatusSchema.parse(rawStatus);
    const event = auditEventSchema.parse(inputEvent);
    if (event.projectId !== projectId || event.eventType !== "opportunity.status-changed") throw new AnalyticsStoreError("INVALID_ANALYTICS_RECORD", "Status audit identity does not align");
    const current = await this.getOpportunity(projectId, opportunityId);
    if (!current) return null;
    const updated = growthOpportunitySchema.parse({ ...current, status, updatedAt: event.occurredAt });
    try {
      this.database.exec("BEGIN IMMEDIATE");
      this.database.prepare("UPDATE opportunities SET status = ?, updated_at = ?, opportunity_json = ? WHERE project_id = ? AND id = ?")
        .run(updated.status, updated.updatedAt, JSON.stringify(updated), projectId, opportunityId);
      this.insertAudit(event);
      this.database.exec("COMMIT");
      return updated;
    } catch (error: unknown) {
      if (this.database.isTransaction) this.database.exec("ROLLBACK");
      throw mapSqlError(error, "Could not update the opportunity status");
    }
  }

  async listEvidence(projectId: string, opportunityId?: string): Promise<OpportunityEvidenceLink[]> {
    const rows = opportunityId
      ? this.database.prepare("SELECT opportunity_id, metric_id, project_id, calculation_role FROM opportunity_evidence WHERE project_id = ? AND opportunity_id = ? ORDER BY metric_id").all(projectId, opportunityId)
      : this.database.prepare("SELECT opportunity_id, metric_id, project_id, calculation_role FROM opportunity_evidence WHERE project_id = ? ORDER BY opportunity_id, metric_id").all(projectId);
    return (rows as unknown as EvidenceRow[]).map((row) => opportunityEvidenceSchema.parse({ opportunityId: row.opportunity_id, metricId: row.metric_id, projectId: row.project_id, calculationRole: row.calculation_role }));
  }

  async listAuditEvents(projectId: string): Promise<AnalyticsAuditEvent[]> {
    const rows = this.database.prepare("SELECT event_json FROM analytics_audit_events WHERE project_id = ? ORDER BY occurred_at DESC, id").all(projectId) as JsonRow<"event_json">[];
    return rows.map((row) => decode(row.event_json, auditEventSchema, "audit event"));
  }

  close(): void {
    this.database.close();
  }

  private readProject(projectId: string): ProjectReference | null {
    const row = this.database.prepare("SELECT id, created_at, target_url, status FROM research_projects WHERE id = ?").get(projectId) as ProjectRow | undefined;
    return row ? toProject(row) : null;
  }

  private insertAudit(event: AnalyticsAuditEvent): void {
    const parsed = auditEventSchema.parse(event);
    this.database.prepare("INSERT INTO analytics_audit_events (id, project_id, occurred_at, event_type, import_ref, event_json) VALUES (?, ?, ?, ?, ?, ?)")
      .run(parsed.eventId, parsed.projectId, parsed.occurredAt, parsed.eventType, parsed.importRef, JSON.stringify(parsed));
  }

  private assertFoundation(): void {
    const migrations = this.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get();
    const projects = this.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'research_projects'").get();
    if (!migrations || !projects) throw new AnalyticsStoreError("ANALYTICS_STORE_IO_ERROR", "SQLite analytics migration requires the existing schema 001 foundation");
  }

  private migrate(): void {
    const current = Number((this.database.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations").get() as { version: number }).version);
    if (current >= ANALYTICS_SQLITE_MIGRATION.version) return;
    try {
      this.database.exec("BEGIN IMMEDIATE");
      this.database.exec(ANALYTICS_SQLITE_MIGRATION.sql);
      this.database.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(ANALYTICS_SQLITE_MIGRATION.version, this.clock().toISOString());
      this.database.exec("COMMIT");
    } catch (error: unknown) {
      if (this.database.isTransaction) this.database.exec("ROLLBACK");
      throw mapSqlError(error, "SQLite analytics migration 002 failed");
    }
  }

  private assertAnalyticsSchema(): void {
    const table = this.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'metric_records'").get();
    if (!table) throw new AnalyticsStoreError("ANALYTICS_STORE_IO_ERROR", "SQLite analytics schema 002 is not applied");
  }
}

interface ProjectRow { id: string; created_at: string; target_url: string; status: string }
interface EvidenceRow { opportunity_id: string; metric_id: string; project_id: string; calculation_role: string }
type JsonRow<K extends string> = Record<K, string>;

function toProject(row: ProjectRow): ProjectReference {
  return projectReferenceSchema.parse({ projectId: row.id, createdAt: row.created_at, targetUrl: normalizeUrl(row.target_url).toString(), status: row.status });
}

function decode<T>(json: string, schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: unknown } } }, label: string): T {
  try {
    const parsed = schema.safeParse(JSON.parse(json));
    if (!parsed.success) throw new AnalyticsStoreError("CORRUPT_ANALYTICS_STORE", `SQLite ${label} failed strict validation`, { issues: parsed.error.issues });
    return parsed.data;
  } catch (error: unknown) {
    if (error instanceof AnalyticsStoreError) throw error;
    throw new AnalyticsStoreError("CORRUPT_ANALYTICS_STORE", `SQLite ${label} JSON is malformed`);
  }
}

function mapSqlError(error: unknown, message: string): AnalyticsStoreError {
  if (error instanceof AnalyticsStoreError) return error;
  const cause = error instanceof Error ? error.message : "unknown";
  if (/UNIQUE constraint failed/u.test(cause)) return new AnalyticsStoreError("DUPLICATE_RECORD", "A deterministic duplicate analytics record was rejected", { constraint: redactSqliteConstraint(cause) });
  if (/FOREIGN KEY constraint failed/u.test(cause)) return new AnalyticsStoreError("INVALID_ANALYTICS_RECORD", "Analytics record violated project isolation or ownership", { constraint: "foreign-key" });
  return new AnalyticsStoreError("ANALYTICS_STORE_IO_ERROR", message, { cause: redactSqliteConstraint(cause) });
}

function redactSqliteConstraint(value: string): string {
  return value.replace(/\([^)]*\)/gu, "").slice(0, 300);
}
