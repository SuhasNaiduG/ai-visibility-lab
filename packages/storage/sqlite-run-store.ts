import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { normalizeUrl } from "../crawler/url.js";
import { researchSources } from "../research/sources.js";
import { RunStoreError, validateRunRecord } from "./json-run-store.js";
import { SQLITE_MIGRATIONS } from "./sqlite-migrations.js";
import { APPLICATION_VERSION, STORAGE_SCHEMA_VERSION, type NewRunRecord, type RunRecord, type RunStore, type RunSummary } from "./types.js";

export class SqliteRunStore implements RunStore {
  private readonly database: DatabaseSync;
  private readonly clock: () => Date;
  private readonly idFactory: () => string;

  constructor(path = resolve(process.env.DATA_DIR ?? "data", "research.sqlite"), options: { clock?: () => Date; idFactory?: () => string } = {}) {
    const resolved = path === ":memory:" ? path : resolve(path);
    if (resolved !== ":memory:") mkdirSync(dirname(resolved), { recursive: true });
    this.database = new DatabaseSync(resolved, { timeout: 5_000, enableForeignKeyConstraints: true });
    this.database.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
    this.clock = options.clock ?? (() => new Date());
    this.idFactory = options.idFactory ?? randomUUID;
    this.migrate();
    this.seedResearchSources();
  }

  async save(input: NewRunRecord): Promise<RunRecord> {
    const record = validateRunRecord({
      ...input,
      id: this.idFactory(),
      createdAt: this.clock().toISOString(),
      schemaVersion: STORAGE_SCHEMA_VERSION,
      applicationVersion: APPLICATION_VERSION
    });
    const previous = record.history ? await this.get(record.history.previousRunId) : undefined;
    validateRunRecord(record, previous ?? undefined, true);

    try {
      this.database.exec("BEGIN IMMEDIATE");
      this.database.prepare("INSERT INTO runs (id, created_at, target_url, record_json) VALUES (?, ?, ?, ?)")
        .run(record.id, record.createdAt, record.targetUrl, JSON.stringify(record));
      this.database.prepare("INSERT OR IGNORE INTO research_projects (id, created_at, target_url, status, project_json) VALUES (?, ?, ?, ?, ?)")
        .run(`run:${record.id}`, record.createdAt, record.targetUrl, "comparison-run", JSON.stringify({ runId: record.id, targetUrl: record.targetUrl }));
      const siteStatement = this.database.prepare("INSERT INTO run_sites (run_id, input_order, role, normalized_url, final_url) VALUES (?, ?, ?, ?, ?)");
      const pageStatement = this.database.prepare("INSERT INTO run_pages (run_id, input_order, analysis_json) VALUES (?, ?, ?)");
      const findingStatement = this.database.prepare("INSERT INTO findings (run_id, finding_id, rule_id, rule_version, source_url, finding_json) VALUES (?, ?, ?, ?, ?, ?)");
      const evidenceStatement = this.database.prepare("INSERT INTO evidence (run_id, evidence_id, source_url, field, evidence_json) VALUES (?, ?, ?, ?, ?)");
      record.sites.forEach((site, index) => {
        siteStatement.run(record.id, site.inputOrder, site.role, site.normalizedUrl, site.finalUrl);
        const analysis = record.analyses[index]!;
        pageStatement.run(record.id, index, JSON.stringify(analysis));
        analysis.findings.forEach((finding, findingIndex) => {
          const findingId = `${index}:${finding.ruleId}:${findingIndex}`;
          findingStatement.run(record.id, findingId, finding.ruleId, finding.ruleVersion, analysis.finalUrl, JSON.stringify(finding));
          finding.evidence.forEach((evidence, evidenceIndex) => evidenceStatement.run(
            record.id,
            `${findingId}:${evidenceIndex}`,
            evidence.sourceUrl,
            evidence.field,
            JSON.stringify(evidence)
          ));
        });
      });
      this.database.prepare("INSERT INTO comparisons (run_id, comparison_json) VALUES (?, ?)").run(record.id, JSON.stringify(record.comparison));
      const proposalStatement = this.database.prepare("INSERT INTO proposals (artifact_id, run_id, proposal_json) VALUES (?, ?, ?)");
      record.comparison.implementationArtifacts.forEach((artifact) => proposalStatement.run(artifact.artifactId, record.id, JSON.stringify(artifact)));
      if (record.verification) this.database.prepare("INSERT INTO verifications (run_id, previous_run_id, verification_json) VALUES (?, ?, ?)")
        .run(record.id, record.verification.comparedRunId, JSON.stringify(record.verification));
      this.database.exec("COMMIT");
      return record;
    } catch (error: unknown) {
      if (this.database.isTransaction) this.database.exec("ROLLBACK");
      if (error instanceof RunStoreError) throw error;
      throw new RunStoreError("STORE_IO_ERROR", "Could not save the SQLite research run transaction", { cause: error instanceof Error ? error.message : "unknown" });
    }
  }

  async get(id: string): Promise<RunRecord | null> {
    const row = this.database.prepare("SELECT record_json FROM runs WHERE id = ?").get(id) as { record_json: string } | undefined;
    if (!row) return null;
    return this.decode(row.record_json);
  }

  async list(): Promise<RunSummary[]> {
    const rows = this.database.prepare("SELECT record_json FROM runs ORDER BY created_at DESC, rowid DESC").all() as Array<{ record_json: string }>;
    return rows.map((row) => summary(this.decode(row.record_json)));
  }

  async findLatestByTarget(targetUrl: string, excludeId?: string): Promise<RunRecord | null> {
    const normalized = normalizeUrl(targetUrl).toString();
    const row = excludeId
      ? this.database.prepare("SELECT record_json FROM runs WHERE target_url = ? AND id <> ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(normalized, excludeId)
      : this.database.prepare("SELECT record_json FROM runs WHERE target_url = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(normalized);
    return row ? this.decode((row as { record_json: string }).record_json) : null;
  }

  async saveCrawlProject(project: unknown): Promise<void> {
    const value = project as { projectId?: unknown; createdAt?: unknown; targetUrl?: unknown; status?: unknown; pages?: unknown[] };
    if (typeof value.projectId !== "string" || typeof value.createdAt !== "string" || typeof value.targetUrl !== "string" || typeof value.status !== "string" || !Array.isArray(value.pages)) {
      throw new RunStoreError("INVALID_RECORD", "Crawl project failed SQLite archive validation");
    }
    try {
      this.database.exec("BEGIN IMMEDIATE");
      this.database.prepare("INSERT INTO research_projects (id, created_at, target_url, status, project_json) VALUES (?, ?, ?, ?, ?)")
        .run(value.projectId, value.createdAt, value.targetUrl, value.status, JSON.stringify(project));
      const statement = this.database.prepare("INSERT INTO project_pages (project_id, page_order, status, page_json) VALUES (?, ?, ?, ?)");
      value.pages.forEach((page, index) => statement.run(value.projectId as string, index, typeof (page as { status?: unknown }).status === "string" ? (page as { status: string }).status : "unknown", JSON.stringify(page)));
      this.database.exec("COMMIT");
    } catch (error: unknown) {
      if (this.database.isTransaction) this.database.exec("ROLLBACK");
      throw new RunStoreError("STORE_IO_ERROR", "Could not archive the SQLite crawl project", { cause: error instanceof Error ? error.message : "unknown" });
    }
  }

  async saveAiInterpretation(runId: string, interpretation: unknown): Promise<void> {
    try {
      this.database.prepare("INSERT INTO ai_interpretations (run_id, created_at, interpretation_json) VALUES (?, ?, ?)")
        .run(runId, this.clock().toISOString(), JSON.stringify(interpretation));
    } catch (error: unknown) {
      throw new RunStoreError("STORE_IO_ERROR", "Could not archive the SQLite AI interpretation", { cause: error instanceof Error ? error.message : "unknown" });
    }
  }

  close(): void {
    this.database.close();
  }

  private decode(json: string): RunRecord {
    let value: unknown;
    try {
      value = JSON.parse(json);
    } catch {
      throw new RunStoreError("CORRUPT_STORE", "SQLite run JSON is corrupt and was not modified");
    }
    const candidate = value as { history?: { previousRunId?: string } | null };
    const previousRow = candidate.history?.previousRunId
      ? this.database.prepare("SELECT record_json FROM runs WHERE id = ?").get(candidate.history.previousRunId) as { record_json: string } | undefined
      : undefined;
    const previous = previousRow ? validateRunRecord(JSON.parse(previousRow.record_json)) : undefined;
    try {
      return validateRunRecord(value, previous, Boolean(candidate.history));
    } catch (error: unknown) {
      if (error instanceof RunStoreError) throw new RunStoreError("CORRUPT_STORE", "SQLite run failed strict validation and was not modified", error.details);
      throw error;
    }
  }

  private migrate(): void {
    const hasMigrations = this.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get();
    const current = hasMigrations
      ? Number((this.database.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations").get() as { version: number }).version)
      : 0;
    for (const migration of SQLITE_MIGRATIONS) {
      if (migration.version <= current) continue;
      this.database.exec("BEGIN IMMEDIATE");
      try {
        this.database.exec(migration.sql);
        this.database.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(migration.version, this.clock?.().toISOString() ?? new Date().toISOString());
        this.database.exec("COMMIT");
      } catch (error: unknown) {
        if (this.database.isTransaction) this.database.exec("ROLLBACK");
        throw new RunStoreError("STORE_IO_ERROR", "SQLite migration failed", { version: migration.version, cause: error instanceof Error ? error.message : "unknown" });
      }
    }
  }

  private seedResearchSources(): void {
    const statement = this.database.prepare("INSERT OR REPLACE INTO research_sources (source_id, registry_version, source_json) VALUES (?, ?, ?)");
    for (const source of researchSources) statement.run(source.sourceId, source.registryVersion, JSON.stringify(source));
  }
}

function summary(run: RunRecord): RunSummary {
  return {
    id: run.id,
    createdAt: run.createdAt,
    targetUrl: run.targetUrl,
    competitorUrls: [...run.competitorUrls],
    sites: run.sites,
    queryLabel: run.queryLabel,
    findingCount: run.analyses.reduce((count, analysis) => count + analysis.findings.length, 0),
    gapCount: run.comparison.targetGaps.length,
    hasPreviousRun: run.history !== null
  };
}
