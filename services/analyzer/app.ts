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
  analyzeRequestSchema,
  compareRequestSchema,
  crawlProjectRequestSchema,
  latestRunQuerySchema
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

export interface AppDependencies {
  analyze: (url: string) => Promise<AnalysisResult>;
  compareAndSave: (input: CompareRunInput) => Promise<RunRecord>;
  runStore: RunStore;
  crawl: (input: { targetUrl: string; maxPages?: number; maxDepth?: number; minimumDelayMs?: number }) => Promise<CrawlResearchProject>;
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
  const runStore = overrides.runStore ?? new JsonRunStore();
  const analyze = overrides.analyze ?? analyzeUrl;
  const compareAndSave = overrides.compareAndSave ?? ((input) =>
    compareAndSaveRun(input, { store: runStore, analyze }));
  const crawl = overrides.crawl ?? ((input) => crawlSiteProject(input, { analyze }));
  const app = express();

  app.disable("x-powered-by");
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
    response.status(200).json(await compareAndSave(validation.data));
  }));

  app.post("/api/projects/crawl", asyncHandler(async (request, response) => {
    const validation = crawlProjectRequestSchema.safeParse(request.body);
    if (!validation.success) throw validationError(validation.error.flatten());
    response.status(200).json(await crawl(validation.data));
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

export const app = createApp();
