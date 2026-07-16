import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  analyticsStateSchema,
  auditEventSchema,
  emptyAnalyticsState,
  growthOpportunitySchema,
  projectReferenceSchema
} from "./schemas.js";
import { filterMetrics, mergeOpportunity, stableJson } from "./store-utils.js";
import type {
  AnalyticsAuditEvent,
  AnalyticsFilters,
  AnalyticsMetric,
  AnalyticsState,
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
import { AnalyticsStoreError, validateImportBundle, validateStateRelationships } from "./validation.js";

export class JsonAnalyticsStore implements AnalyticsStore {
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly filePath = resolve(process.env.DATA_DIR ?? "data", "analytics.json")) {}

  async registerProject(input: ProjectReference): Promise<ProjectReference> {
    return this.mutate((state) => {
      const project = projectReferenceSchema.parse(input);
      const existing = state.projects.find((item) => item.projectId === project.projectId);
      if (existing && stableJson(existing) !== stableJson(project)) throw new AnalyticsStoreError("INVALID_ANALYTICS_RECORD", "Project reference conflicts with an existing research project", { projectId: project.projectId });
      if (!existing) state.projects.push(project);
      return structuredClone(project);
    });
  }

  async listProjects(): Promise<ProjectReference[]> {
    return structuredClone((await this.read()).projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  async getProject(projectId: string): Promise<ProjectReference | null> {
    return structuredClone((await this.read()).projects.find((item) => item.projectId === projectId) ?? null);
  }

  async saveImport(input: ImportBundle): Promise<ImportJob> {
    return this.mutate((state) => {
      const bundle = validateImportBundle(input, state);
      const existingSource = state.sources.find((item) => item.sourceId === bundle.source.sourceId);
      if (existingSource && stableJson(existingSource) !== stableJson(bundle.source)) throw new AnalyticsStoreError("INVALID_ANALYTICS_RECORD", "Connector source identity conflicts with an existing source", { sourceId: bundle.source.sourceId });
      if (!existingSource) state.sources.push(bundle.source);
      if (state.imports.some((item) => item.importId === bundle.job.importId)) throw new AnalyticsStoreError("DUPLICATE_RECORD", "Import identity already exists", { importId: bundle.job.importId });
      state.imports.push(bundle.job);
      state.rejections.push(...bundle.rejections);
      state.metrics.push(...bundle.metrics);
      for (const opportunity of bundle.opportunities) {
        const index = state.opportunities.findIndex((item) => item.opportunityId === opportunity.opportunityId);
        const merged = mergeOpportunity(index >= 0 ? state.opportunities[index] : undefined, opportunity);
        if (index >= 0) state.opportunities[index] = merged;
        else state.opportunities.push(merged);
      }
      for (const link of bundle.evidence) {
        if (!state.opportunityEvidence.some((item) => item.opportunityId === link.opportunityId && item.metricId === link.metricId)) state.opportunityEvidence.push(link);
      }
      state.auditEvents.push(bundle.auditEvent);
      return structuredClone(bundle.job);
    });
  }

  async listSources(projectId: string): Promise<ConnectorSource[]> {
    return structuredClone((await this.read()).sources.filter((item) => item.projectId === projectId));
  }

  async listImports(projectId: string): Promise<ImportJob[]> {
    return structuredClone((await this.read()).imports.filter((item) => item.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  async getImport(projectId: string, importId: string): Promise<{ job: ImportJob; rejections: ImportRejection[] } | null> {
    const state = await this.read();
    const job = state.imports.find((item) => item.projectId === projectId && item.importId === importId);
    return job ? structuredClone({ job, rejections: state.rejections.filter((item) => item.projectId === projectId && item.importId === importId) }) : null;
  }

  async deleteImport(projectId: string, importId: string, inputEvent: AnalyticsAuditEvent): Promise<boolean> {
    return this.mutate((state) => {
      const index = state.imports.findIndex((item) => item.projectId === projectId && item.importId === importId);
      if (index < 0) return false;
      const event = auditEventSchema.parse(inputEvent);
      if (event.projectId !== projectId || event.importRef !== importId || event.eventType !== "import.deleted") throw new AnalyticsStoreError("INVALID_ANALYTICS_RECORD", "Deletion audit identity does not align");
      const ownedMetricIds = new Set(state.metrics.filter((item) => item.projectId === projectId && item.importId === importId).map((item) => item.metricId));
      state.imports.splice(index, 1);
      state.rejections = state.rejections.filter((item) => !(item.projectId === projectId && item.importId === importId));
      state.metrics = state.metrics.filter((item) => !(item.projectId === projectId && item.importId === importId));
      state.opportunityEvidence = state.opportunityEvidence.filter((item) => !ownedMetricIds.has(item.metricId));
      state.auditEvents.push(event);
      return true;
    });
  }

  async listMetrics(projectId: string, filters: AnalyticsFilters = {}): Promise<AnalyticsMetric[]> {
    return structuredClone(filterMetrics((await this.read()).metrics.filter((item) => item.projectId === projectId), filters));
  }

  async getMetric(projectId: string, metricId: string): Promise<AnalyticsMetric | null> {
    return structuredClone((await this.read()).metrics.find((item) => item.projectId === projectId && item.metricId === metricId) ?? null);
  }

  async listOpportunities(projectId: string): Promise<GrowthOpportunity[]> {
    return structuredClone((await this.read()).opportunities.filter((item) => item.projectId === projectId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }

  async getOpportunity(projectId: string, opportunityId: string): Promise<GrowthOpportunity | null> {
    return structuredClone((await this.read()).opportunities.find((item) => item.projectId === projectId && item.opportunityId === opportunityId) ?? null);
  }

  async updateOpportunityStatus(projectId: string, opportunityId: string, status: OpportunityStatus, inputEvent: AnalyticsAuditEvent): Promise<GrowthOpportunity | null> {
    return this.mutate((state) => {
      const index = state.opportunities.findIndex((item) => item.projectId === projectId && item.opportunityId === opportunityId);
      if (index < 0) return null;
      const event = auditEventSchema.parse(inputEvent);
      if (event.projectId !== projectId || event.eventType !== "opportunity.status-changed") throw new AnalyticsStoreError("INVALID_ANALYTICS_RECORD", "Status audit identity does not align");
      const updated = growthOpportunitySchema.parse({ ...state.opportunities[index]!, status, updatedAt: event.occurredAt });
      state.opportunities[index] = updated;
      state.auditEvents.push(event);
      return structuredClone(updated);
    });
  }

  async listEvidence(projectId: string, opportunityId?: string): Promise<OpportunityEvidenceLink[]> {
    return structuredClone((await this.read()).opportunityEvidence.filter((item) => item.projectId === projectId && (!opportunityId || item.opportunityId === opportunityId)));
  }

  async listAuditEvents(projectId: string): Promise<AnalyticsAuditEvent[]> {
    return structuredClone((await this.read()).auditEvents.filter((item) => item.projectId === projectId).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)));
  }

  private async mutate<T>(change: (state: AnalyticsState) => T): Promise<T> {
    const operation = this.writeQueue.then(async () => {
      const state = await this.read();
      const result = change(state);
      validateStateRelationships(state);
      await this.write(state);
      return result;
    });
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }

  private async read(): Promise<AnalyticsState> {
    try {
      const content = await readFile(this.filePath, "utf8");
      const parsed = analyticsStateSchema.safeParse(JSON.parse(content));
      if (!parsed.success) throw new AnalyticsStoreError("CORRUPT_ANALYTICS_STORE", "Analytics JSON failed strict validation and was not modified", { issues: parsed.error.issues });
      validateStateRelationships(parsed.data);
      return parsed.data;
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === "ENOENT") return emptyAnalyticsState();
      if (error instanceof AnalyticsStoreError) throw error;
      if (error instanceof SyntaxError) throw new AnalyticsStoreError("CORRUPT_ANALYTICS_STORE", "Analytics JSON is malformed and was not modified");
      throw new AnalyticsStoreError("ANALYTICS_STORE_IO_ERROR", "Analytics JSON could not be read", { cause: error instanceof Error ? error.message : "unknown" });
    }
  }

  private async write(state: AnalyticsState): Promise<void> {
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
      await rename(temporary, this.filePath);
    } catch (error: unknown) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw new AnalyticsStoreError("ANALYTICS_STORE_IO_ERROR", "Analytics JSON could not be saved atomically", { cause: error instanceof Error ? error.message : "unknown" });
    }
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
