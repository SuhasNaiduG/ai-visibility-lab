import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response
} from "express";
import { CrawlerError } from "../../packages/crawler/errors.js";
import { normalizeUrl } from "../../packages/crawler/url.js";
import {
  aiInterpretationRequestSchema,
  analyzeRequestSchema,
  compareRequestSchema,
  crawlProjectRequestSchema,
  latestRunQuerySchema,
  manualVisibilityObservationRequestSchema,
  reportExportQuerySchema,
  visibilityObservationListQuerySchema
} from "../../packages/schemas/api.js";
import {
  JsonRunStore,
  RunStoreError
} from "../../packages/storage/json-run-store.js";
import type {
  RunRecord,
  RunStore
} from "../../packages/storage/types.js";
import { analyzeUrl, type AnalysisResult } from "./analyze.js";
import {
  compareAndSaveRun,
  type CompareRunInput
} from "./compare.js";
import { crawlSiteProject } from "./crawl.js";
import type { CrawlResearchProject } from "../../packages/crawler/site-crawl.js";
import { researchSources, RESEARCH_SOURCE_REGISTRY_VERSION } from "../../packages/research/sources.js";
import { loadAiInterpretationConfig } from "../../packages/ai/config.js";
import { AiInterpretationError, interpretEvidence } from "../../packages/ai/interpret.js";
import { evidenceForRun } from "../../packages/ai/run-evidence.js";
import type { AiInterpretationConfig, AiInterpretationProvider } from "../../packages/ai/types.js";
import { JsonVisibilityObservationStore, VisibilityObservationStoreError } from "../../packages/visibility/json-observation-store.js";
import type { VisibilityObservationStore } from "../../packages/visibility/types.js";
import { SqliteRunStore } from "../../packages/storage/sqlite-run-store.js";
import { buildCompleteResearchReport, researchReportCsv, researchReportJson, researchReportMarkdown } from "../../packages/reports/report.js";
import { connectorDefinitions } from "../../packages/analytics/connectors.js";
import { previewCsv, CsvImportError } from "../../packages/analytics/csv.js";
import { importAnalyticsCsv } from "../../packages/analytics/import-service.js";
import { JsonAnalyticsStore } from "../../packages/analytics/json-analytics-store.js";
import { SqliteAnalyticsStore } from "../../packages/analytics/sqlite-analytics-store.js";
import type { AnalyticsStore, ProjectReference, SearchPerformanceRecord } from "../../packages/analytics/types.js";
import { AnalyticsStoreError } from "../../packages/analytics/validation.js";
import {
  analyticsExportQuerySchema,
  analyticsIdParamsSchema,
  csvImportRequestSchema,
  csvPreviewRequestSchema,
  metricQuerySchema,
  opportunityStatusRequestSchema,
  projectQuerySchema
} from "../../packages/analytics/api-schemas.js";
import { buildSearchPerformanceDetail } from "../../packages/analytics/detail.js";
import { buildGrowthAnalyticsReport, growthReportCsv, growthReportJson, growthReportMarkdown } from "../../packages/analytics/report.js";

export interface AppDependencies {
  analyze: (url: string) => Promise<AnalysisResult>;
  compareAndSave: (input: CompareRunInput) => Promise<RunRecord>;
  runStore: RunStore;
  crawl: (input: { targetUrl: string; maxPages?: number; maxDepth?: number; minimumDelayMs?: number }) => Promise<CrawlResearchProject>;
  aiProvider: AiInterpretationProvider | null;
  aiConfig: AiInterpretationConfig;
  visibilityStore: VisibilityObservationStore;
  analyticsStore: AnalyticsStore;
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: unknown = {}
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function createApp(overrides: Partial<AppDependencies> = {}): Express {
  const runStore = overrides.runStore ?? createDefaultRunStore();
  const analyze = overrides.analyze ?? analyzeUrl;
  const compareAndSave = overrides.compareAndSave ?? ((input) =>
    compareAndSaveRun(input, { store: runStore, analyze }));
  const crawl = overrides.crawl ?? ((input) => crawlSiteProject(input, { analyze }));
  const aiProvider = overrides.aiProvider ?? null;
  const aiConfig = overrides.aiConfig ?? loadAiInterpretationConfig();
  const visibilityStore = overrides.visibilityStore ?? new JsonVisibilityObservationStore();
  const analyticsStore = overrides.analyticsStore ?? createDefaultAnalyticsStore();
  const app = express();

  app.disable("x-powered-by");
  app.use("/api/imports", express.json({ limit: "3mb" }));
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_request: Request, response: Response) => {
    response.status(200).json({ status: "ok" });
  });

  app.post("/api/analyze", asyncHandler(async (request, response) => {
    const validation = analyzeRequestSchema.safeParse(request.body);
    if (!validation.success) {
      throw validationError(validation.error.flatten());
    }
    response.status(200).json(await analyze(validation.data.url));
  }));

  app.post("/api/compare", asyncHandler(async (request, response) => {
    const validation = compareRequestSchema.safeParse(request.body);
    if (!validation.success) {
      throw validationError(validation.error.flatten());
    }
    const run = await compareAndSave(validation.data);
    await analyticsStore.registerProject({ projectId: `run:${run.id}`, createdAt: run.createdAt, targetUrl: run.targetUrl, status: "comparison-run" });
    response.status(200).json(run);
  }));

  app.post("/api/projects/crawl", asyncHandler(async (request, response) => {
    const validation = crawlProjectRequestSchema.safeParse(request.body);
    if (!validation.success) throw validationError(validation.error.flatten());
    const project = await crawl(validation.data);
    await runStore.saveCrawlProject?.(project);
    if (isProjectReference(project)) await analyticsStore.registerProject(project);
    response.status(200).json(project);
  }));

  app.get("/api/connectors", (_request, response) => {
    response.status(200).json({ release: 1, liveProviderAccess: false, connectors: connectorDefinitions });
  });

  app.get("/api/growth/projects", asyncHandler(async (_request, response) => {
    response.status(200).json(await analyticsStore.listProjects());
  }));

  app.post("/api/imports/preview", asyncHandler(async (request, response) => {
    const validation = csvPreviewRequestSchema.safeParse(request.body);
    if (!validation.success) throw validationError(validation.error.flatten());
    response.status(200).json(previewCsv(validation.data.file, validation.data.connectorId));
  }));

  app.post("/api/imports", asyncHandler(async (request, response) => {
    const validation = csvImportRequestSchema.safeParse(request.body);
    if (!validation.success) throw validationError(validation.error.flatten());
    response.status(201).json(await importAnalyticsCsv(validation.data, analyticsStore));
  }));

  app.get("/api/imports", asyncHandler(async (request, response) => {
    const validation = projectQuerySchema.safeParse({ projectId: request.query.projectId });
    if (!validation.success) throw validationError(validation.error.flatten());
    response.status(200).json(await analyticsStore.listImports(validation.data.projectId));
  }));

  app.get("/api/imports/:id", asyncHandler(async (request, response) => {
    const params = analyticsIdParamsSchema.safeParse({ id: request.params.id });
    const query = projectQuerySchema.safeParse({ projectId: request.query.projectId });
    if (!params.success || !query.success) throw validationError({ params: params.success ? {} : params.error.flatten(), query: query.success ? {} : query.error.flatten() });
    const item = await analyticsStore.getImport(query.data.projectId, params.data.id);
    if (!item) throw new ApiError(404, "IMPORT_NOT_FOUND", "Analytics import was not found");
    response.status(200).json(item);
  }));

  app.delete("/api/imports/:id", asyncHandler(async (request, response) => {
    const params = analyticsIdParamsSchema.safeParse({ id: request.params.id });
    const query = projectQuerySchema.safeParse({ projectId: request.query.projectId });
    if (!params.success || !query.success) throw validationError({ params: params.success ? {} : params.error.flatten(), query: query.success ? {} : query.error.flatten() });
    const item = await analyticsStore.getImport(query.data.projectId, params.data.id);
    if (!item) throw new ApiError(404, "IMPORT_NOT_FOUND", "Analytics import was not found");
    const ownedMetrics = (await analyticsStore.listMetrics(query.data.projectId)).filter((metric) => metric.importId === params.data.id);
    const event = {
      eventId: `audit:${randomUUID()}`,
      projectId: query.data.projectId,
      occurredAt: new Date().toISOString(),
      eventType: "import.deleted" as const,
      importRef: params.data.id,
      summary: { deletedMetricCount: ownedMetrics.length, deletedRejectionCount: item.rejections.length, retainedOpportunities: true }
    };
    await analyticsStore.deleteImport(query.data.projectId, params.data.id, event);
    response.status(200).json({ deleted: true, importId: params.data.id, deletedMetricCount: ownedMetrics.length, deletedRejectionCount: item.rejections.length, opportunitiesRetained: true });
  }));

  app.get("/api/data-sources", asyncHandler(async (request, response) => {
    const validation = projectQuerySchema.safeParse({ projectId: request.query.projectId });
    if (!validation.success) throw validationError(validation.error.flatten());
    response.status(200).json(await analyticsStore.listSources(validation.data.projectId));
  }));

  app.get("/api/metrics", asyncHandler(async (request, response) => {
    const validation = metricQuerySchema.safeParse(queryObject(request));
    if (!validation.success) throw validationError(validation.error.flatten());
    response.status(200).json(await analyticsStore.listMetrics(validation.data.projectId, validation.data));
  }));

  app.get("/api/search-performance", asyncHandler(async (request, response) => {
    const validation = metricQuerySchema.safeParse({ ...queryObject(request), metricType: "search-performance" });
    if (!validation.success) throw validationError(validation.error.flatten());
    response.status(200).json(await analyticsStore.listMetrics(validation.data.projectId, validation.data));
  }));

  app.get("/api/search-performance/:id", asyncHandler(async (request, response) => {
    const params = analyticsIdParamsSchema.safeParse({ id: request.params.id });
    const query = projectQuerySchema.safeParse({ projectId: request.query.projectId });
    if (!params.success || !query.success) throw validationError({ params: params.success ? {} : params.error.flatten(), query: query.success ? {} : query.error.flatten() });
    const metric = await analyticsStore.getMetric(query.data.projectId, params.data.id);
    if (!metric || metric.metricType !== "search-performance") throw new ApiError(404, "SEARCH_RECORD_NOT_FOUND", "Search performance record was not found");
    const project = await analyticsStore.getProject(query.data.projectId);
    const run = project ? await runStore.findLatestByTarget(project.targetUrl) : null;
    response.status(200).json(buildSearchPerformanceDetail(metric as SearchPerformanceRecord, await analyticsStore.listOpportunities(query.data.projectId), run));
  }));

  app.get("/api/opportunities", asyncHandler(async (request, response) => {
    const validation = projectQuerySchema.safeParse({ projectId: request.query.projectId });
    if (!validation.success) throw validationError(validation.error.flatten());
    response.status(200).json(await analyticsStore.listOpportunities(validation.data.projectId));
  }));

  app.get("/api/opportunities/:id", asyncHandler(async (request, response) => {
    const params = analyticsIdParamsSchema.safeParse({ id: request.params.id });
    const query = projectQuerySchema.safeParse({ projectId: request.query.projectId });
    if (!params.success || !query.success) throw validationError({ params: params.success ? {} : params.error.flatten(), query: query.success ? {} : query.error.flatten() });
    const opportunity = await analyticsStore.getOpportunity(query.data.projectId, params.data.id);
    if (!opportunity) throw new ApiError(404, "OPPORTUNITY_NOT_FOUND", "Growth opportunity was not found");
    response.status(200).json({ opportunity, evidence: await analyticsStore.listEvidence(query.data.projectId, opportunity.opportunityId) });
  }));

  app.patch("/api/opportunities/:id/status", asyncHandler(async (request, response) => {
    const params = analyticsIdParamsSchema.safeParse({ id: request.params.id });
    const query = projectQuerySchema.safeParse({ projectId: request.query.projectId });
    const body = opportunityStatusRequestSchema.safeParse(request.body);
    if (!params.success || !query.success || !body.success) throw validationError({ params: params.success ? {} : params.error.flatten(), query: query.success ? {} : query.error.flatten(), body: body.success ? {} : body.error.flatten() });
    const current = await analyticsStore.getOpportunity(query.data.projectId, params.data.id);
    if (!current) throw new ApiError(404, "OPPORTUNITY_NOT_FOUND", "Growth opportunity was not found");
    const updated = await analyticsStore.updateOpportunityStatus(query.data.projectId, params.data.id, body.data.status, {
      eventId: `audit:${randomUUID()}`,
      projectId: query.data.projectId,
      occurredAt: new Date().toISOString(),
      eventType: "opportunity.status-changed",
      importRef: null,
      summary: { opportunityId: params.data.id, previousStatus: current.status, status: body.data.status }
    });
    response.status(200).json(updated);
  }));

  app.get("/api/growth/export", asyncHandler(async (request, response) => {
    const validation = analyticsExportQuerySchema.safeParse({ projectId: request.query.projectId, format: request.query.format });
    if (!validation.success) throw validationError(validation.error.flatten());
    const project = await analyticsStore.getProject(validation.data.projectId);
    if (!project) throw new ApiError(404, "PROJECT_NOT_FOUND", "Research project was not found");
    const report = buildGrowthAnalyticsReport({
      generatedAt: new Date().toISOString(),
      project,
      sources: await analyticsStore.listSources(project.projectId),
      imports: await analyticsStore.listImports(project.projectId),
      metrics: await analyticsStore.listMetrics(project.projectId),
      opportunities: await analyticsStore.listOpportunities(project.projectId),
      auditEvents: await analyticsStore.listAuditEvents(project.projectId)
    });
    const extension = validation.data.format === "markdown" ? "md" : validation.data.format;
    response.setHeader("Content-Disposition", `attachment; filename="growth-intelligence-${project.projectId}.${extension}"`);
    if (validation.data.format === "json") response.type("application/json").send(growthReportJson(report));
    else if (validation.data.format === "markdown") response.type("text/markdown").send(growthReportMarkdown(report));
    else response.type("text/csv").send(growthReportCsv(report));
  }));

  app.get("/api/research-sources", (_request, response) => {
    response.status(200).json({
      registryVersion: RESEARCH_SOURCE_REGISTRY_VERSION,
      sources: researchSources
    });
  });

  app.get("/api/ai/status", (_request, response) => {
    response.status(200).json({
      enabled: aiConfig.enabled && aiProvider !== null,
      configuredProvider: aiConfig.provider,
      configuredModel: aiConfig.model,
      deterministicAnalysisAvailable: true
    });
  });

  app.post("/api/runs/:id/interpretations", asyncHandler(async (request, response) => {
    const rawId = request.params.id;
    const id = Array.isArray(rawId) ? "" : rawId?.trim();
    if (!id || id.length > 200) throw validationError({ fieldErrors: { id: ["A valid run ID is required"] } });
    const validation = aiInterpretationRequestSchema.safeParse(request.body ?? {});
    if (!validation.success) throw validationError(validation.error.flatten());
    const run = await runStore.get(id);
    if (!run) throw new ApiError(404, "RUN_NOT_FOUND", "Saved run was not found", { id });
    const result = await interpretEvidence({ evidence: evidenceForRun(run), ...validation.data }, aiProvider ?? undefined, aiConfig);
    await runStore.saveAiInterpretation?.(run.id, result);
    response.status(200).json(result);
  }));

  app.get("/api/visibility-providers", (_request, response) => {
    response.status(200).json({ manualEntryEnabled: true, providers: [] });
  });

  app.post("/api/visibility-observations", asyncHandler(async (request, response) => {
    const validation = manualVisibilityObservationRequestSchema.safeParse(request.body);
    if (!validation.success) throw validationError(validation.error.flatten());
    response.status(201).json(await visibilityStore.save(validation.data));
  }));

  app.get("/api/visibility-observations", asyncHandler(async (request, response) => {
    const validation = visibilityObservationListQuerySchema.safeParse({ targetUrl: request.query.targetUrl });
    if (!validation.success) throw validationError(validation.error.flatten());
    response.status(200).json(await visibilityStore.list(validation.data.targetUrl));
  }));

  app.get("/api/runs/:id/export", asyncHandler(async (request, response) => {
    const rawId = request.params.id;
    const id = Array.isArray(rawId) ? "" : rawId?.trim();
    if (!id || id.length > 200) throw validationError({ fieldErrors: { id: ["A valid run ID is required"] } });
    const validation = reportExportQuerySchema.safeParse({ format: request.query.format });
    if (!validation.success) throw validationError(validation.error.flatten());
    const run = await runStore.get(id);
    if (!run) throw new ApiError(404, "RUN_NOT_FOUND", "Saved run was not found", { id });
    const report = buildCompleteResearchReport(run, await visibilityStore.list(run.targetUrl));
    const extension = validation.data.format === "markdown" ? "md" : validation.data.format;
    response.setHeader("Content-Disposition", `attachment; filename="ai-visibility-${id}.${extension}"`);
    if (validation.data.format === "json") response.type("application/json").send(researchReportJson(report));
    else if (validation.data.format === "markdown") response.type("text/markdown").send(researchReportMarkdown(report));
    else response.type("text/csv").send(researchReportCsv(report));
  }));

  app.get("/api/runs", asyncHandler(async (_request, response) => {
    response.status(200).json(await runStore.list());
  }));

  app.get("/api/runs/latest", asyncHandler(async (request, response) => {
    const validation = latestRunQuerySchema.safeParse({
      targetUrl: request.query.targetUrl
    });
    if (!validation.success) {
      throw validationError(validation.error.flatten());
    }
    const normalized = normalizeUrl(validation.data.targetUrl).toString();
    const run = await runStore.findLatestByTarget(normalized);
    if (!run) {
      throw new ApiError(404, "RUN_NOT_FOUND", "No saved run matches the target URL", { targetUrl: normalized });
    }
    response.status(200).json(run);
  }));

  app.get("/api/runs/:id", asyncHandler(async (request, response) => {
    const rawId = request.params.id;
    const id = Array.isArray(rawId) ? "" : rawId?.trim();
    if (!id || id.length > 200) {
      throw validationError({ fieldErrors: { id: ["A valid run ID is required"] } });
    }
    const run = await runStore.get(id);
    if (!run) {
      throw new ApiError(404, "RUN_NOT_FOUND", "Saved run was not found", { id });
    }
    response.status(200).json(run);
  }));

  app.use(express.static(resolve(process.cwd(), "apps", "web", "public"), {
    index: "index.html",
    maxAge: "1h"
  }));

  app.use("/api", (_request, _response, next) => {
    next(new ApiError(404, "ENDPOINT_NOT_FOUND", "API endpoint was not found"));
  });

  app.use((
    error: unknown,
    request: Request,
    response: Response,
    _next: NextFunction
  ): void => {
    const mapped = mapError(error, request);
    response.status(mapped.status).json({
      error: {
        code: mapped.code,
        message: mapped.message,
        details: mapped.details
      }
    });
  });

  return app;
}

function createDefaultRunStore(): RunStore {
  const adapter = process.env.STORAGE_ADAPTER?.trim().toLocaleLowerCase("en-US") || "json";
  if (adapter === "json") return new JsonRunStore();
  if (adapter === "sqlite") return new SqliteRunStore(process.env.SQLITE_PATH?.trim() || undefined);
  throw new Error(`STORAGE_ADAPTER must be json or sqlite; received ${adapter}`);
}

function createDefaultAnalyticsStore(): AnalyticsStore {
  const adapter = process.env.STORAGE_ADAPTER?.trim().toLocaleLowerCase("en-US") || "json";
  if (adapter === "json") {
    const testPath = process.env.NODE_ENV === "test"
      ? resolve(tmpdir(), `ai-visibility-lab-analytics-${process.pid}-${randomUUID()}.json`)
      : undefined;
    return new JsonAnalyticsStore(testPath);
  }
  if (adapter === "sqlite") return new SqliteAnalyticsStore(process.env.SQLITE_PATH?.trim() || undefined);
  throw new Error(`STORAGE_ADAPTER must be json or sqlite; received ${adapter}`);
}

function asyncHandler(
  handler: (request: Request, response: Response) => Promise<void>
): (request: Request, response: Response, next: NextFunction) => void {
  return (request, response, next) => {
    handler(request, response).catch(next);
  };
}

function validationError(details: unknown): ApiError {
  return new ApiError(400, "INVALID_REQUEST", "Request validation failed", details);
}

function mapError(error: unknown, request?: Pick<Request, "method" | "path">): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof CrawlerError) {
    return new ApiError(error.httpStatus, error.code, error.message, error.details);
  }
  if (error instanceof RunStoreError) {
    const comparisonSave = request?.method === "POST" && request.path === "/api/compare";
    return new ApiError(
      500,
      "RUN_STORE_ERROR",
      comparisonSave
        ? "The comparison completed, but the run could not be saved."
        : "Run history is unavailable",
      { code: error.code, ...error.details }
    );
  }
  if (error instanceof CsvImportError) {
    const status = error.code === "CSV_TOO_LARGE" ? 413 : 400;
    return new ApiError(status, error.code, error.message, error.details);
  }
  if (error instanceof AnalyticsStoreError) {
    const status = error.code === "PROJECT_NOT_FOUND" ? 404 : error.code === "DUPLICATE_RECORD" ? 409 : error.code === "INVALID_ANALYTICS_RECORD" ? 400 : 500;
    return new ApiError(status, error.code, error.message, error.details);
  }
  if (error instanceof AiInterpretationError) {
    const status = error.code === "AI_NOT_CONFIGURED" ? 503
      : error.code === "AI_TIMEOUT" ? 504
      : error.code === "AI_PROVIDER_ERROR" ? 502
      : 422;
    return new ApiError(status, error.code, error.message, error.details);
  }
  if (error instanceof VisibilityObservationStoreError) {
    return new ApiError(500, "VISIBILITY_STORE_ERROR", "Manual visibility observations are unavailable", { code: error.code, ...error.details });
  }
  if (isJsonSyntaxError(error)) {
    return new ApiError(400, "INVALID_JSON", "Request body contains invalid JSON");
  }
  if (isHttpStatusError(error, 413)) {
    return new ApiError(413, "REQUEST_TOO_LARGE", "Request body exceeds the allowed size");
  }
  if (error instanceof Error && (
    error.message === "URL is required" ||
    error.message === "Invalid URL" ||
    error.message.includes("HTTP and HTTPS")
  )) {
    return new ApiError(400, "INVALID_URL", error.message);
  }
  if (error instanceof Error && error.message.startsWith("Manual rank")) {
    return new ApiError(400, "INVALID_RANK_OBSERVATION", error.message);
  }
  return new ApiError(500, "INTERNAL_ERROR", "Unexpected analyzer error");
}

function isJsonSyntaxError(error: unknown): boolean {
  return error instanceof SyntaxError && isHttpStatusError(error, 400);
}

function isHttpStatusError(error: unknown, status: number): boolean {
  return error instanceof Error && "status" in error && (error as Error & { status?: number }).status === status;
}

function isProjectReference(value: CrawlResearchProject): value is CrawlResearchProject & ProjectReference {
  return typeof value.projectId === "string"
    && typeof value.createdAt === "string"
    && typeof value.targetUrl === "string"
    && typeof value.status === "string";
}

function queryObject(request: Request): Record<string, unknown> {
  return {
    projectId: request.query.projectId,
    metricType: request.query.metricType,
    page: request.query.page,
    query: request.query.query,
    dateFrom: request.query.dateFrom,
    dateTo: request.query.dateTo,
    device: request.query.device,
    country: request.query.country
  };
}
