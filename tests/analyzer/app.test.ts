import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CrawlerError } from "../../packages/crawler/errors.js";
import { parsePage } from "../../packages/parser/page.js";
import type { RunRecord, RunStore } from "../../packages/storage/types.js";
import { createApp } from "../../services/analyzer/app.js";
import type { AnalysisResult } from "../../services/analyzer/analyze.js";
import type { CompareRunInput } from "../../services/analyzer/compare.js";
import { makeAnalysis, makeComparison } from "../helpers/analysis.js";

const pageUrl = "https://example.com/";
const parsed = parsePage(`<!doctype html><html lang="en"><head>
  <title>Example service page</title>
  <meta name="description" content="An example description with enough public evidence for the API fixture." />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="https://example.com/" />
</head><body><h1>Example service</h1><a href="/contact">Contact</a></body></html>`, pageUrl);

const resource = (name: "robots.txt" | "sitemap.xml") => ({
  url: `${pageUrl}${name}`,
  available: true,
  statusCode: 200,
  finalUrl: `${pageUrl}${name}`,
  evidence: {
    requestedUrl: `${pageUrl}${name}`,
    finalUrl: `${pageUrl}${name}`,
    statusCode: 200,
    checkedAt: "2026-07-15T00:00:00.000Z",
    responseTimeMs: 5,
    redirectCount: 0,
    redirectChain: [],
    networkChecks: [],
    error: null
  }
});

const analysisResult: AnalysisResult = {
  requestedUrl: "example.com",
  normalizedUrl: pageUrl,
  statusCode: 200,
  finalUrl: pageUrl,
  responseTimeMs: 25,
  fetchedAt: "2026-07-15T00:00:00.000Z",
  redirectCount: 0,
  redirectObserved: false,
  redirectChain: [],
  networkChecks: [],
  ...parsed,
  robotsTxtAvailable: true,
  robotsTxtStatusCode: 200,
  sitemapXmlAvailable: true,
  sitemapXmlStatusCode: 200,
  robotsTxtUrl: `${pageUrl}robots.txt`,
  sitemapXmlUrl: `${pageUrl}sitemap.xml`,
  siteResources: { robotsTxt: resource("robots.txt"), sitemapXml: resource("sitemap.xml") },
  findings: [],
  rawEvidence: []
};

function runRecord(): RunRecord {
  const target = makeAnalysis("https://target.example/");
  const competitor = makeAnalysis("https://competitor.example/");
  const comparison = makeComparison(target, competitor);
  return {
    id: "run-1",
    createdAt: "2026-07-15T00:00:00.000Z",
    schemaVersion: "1",
    applicationVersion: "1.0.0",
    targetUrl: target.normalizedUrl,
    competitorUrls: [competitor.normalizedUrl],
    sites: comparison.sites,
    queryLabel: "example query",
    rankObservations: {},
    analyses: [target, competitor],
    comparison,
    history: null
  };
}

class MemoryRunStore implements RunStore {
  records: RunRecord[] = [];
  save = vi.fn(async () => { throw new Error("not used"); });
  get = vi.fn(async (id: string) => this.records.find((run) => run.id === id) ?? null);
  list = vi.fn(async () => this.records.map((run) => ({
    id: run.id,
    createdAt: run.createdAt,
    targetUrl: run.targetUrl,
    competitorUrls: run.competitorUrls,
    sites: run.sites,
    queryLabel: run.queryLabel,
    findingCount: 0,
    gapCount: run.comparison.targetGaps.length,
    hasPreviousRun: run.history !== null
  })));
  findLatestByTarget = vi.fn(async (url: string) => this.records.find((run) => run.targetUrl === url) ?? null);
}

describe("analyzer API", () => {
  let analyze: ReturnType<typeof vi.fn<(url: string) => Promise<AnalysisResult>>>;
  let compareAndSave: ReturnType<typeof vi.fn<(input: CompareRunInput) => Promise<RunRecord>>>;
  let store: MemoryRunStore;

  beforeEach(() => {
    analyze = vi.fn(async () => analysisResult);
    compareAndSave = vi.fn<(input: CompareRunInput) => Promise<RunRecord>>(async () => runRecord());
    store = new MemoryRunStore();
  });

  function app() {
    return createApp({ analyze, compareAndSave, runStore: store });
  }

  it("returns the health status", async () => {
    const response = await request(app()).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("serves the static browser interface", async () => {
    const response = await request(app()).get("/");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/text\/html/);
    expect(response.text).toContain("AI Visibility Engineering Lab");

    const script = await request(app()).get("/app.js");
    expect(script.status).toBe(200);
    expect(script.text).toContain("function renderAdvantages(");
    expect(script.text).toContain("renderGapEvidence(advantage, siteEntries)");
    expect(script.text).toContain("Raw retrieval evidence remains available above.");
  });

  it.each([{}, { url: "" }])("rejects a missing or empty URL", async (body) => {
    const response = await request(app()).post("/api/analyze").send(body);
    expect(response.status).toBe(400);
    expect(response.body.error).toEqual(expect.objectContaining({ code: "INVALID_REQUEST", message: "Request validation failed" }));
    expect(analyze).not.toHaveBeenCalled();
  });

  it("returns a structured analysis result", async () => {
    const response = await request(app()).post("/api/analyze").send({ url: "example.com" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({ normalizedUrl: pageUrl, title: "Example service page", h1Count: 1, findings: [] }));
    expect(analyze).toHaveBeenCalledWith("example.com");
  });

  it("maps an unsupported or unsafe URL to a client-safe error", async () => {
    analyze.mockRejectedValue(new CrawlerError("PRIVATE_NETWORK_TARGET", "URL resolves to a private or non-public network address", { details: { hostname: "localhost" } }));
    const response = await request(app()).post("/api/analyze").send({ url: "http://localhost" });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: { code: "PRIVATE_NETWORK_TARGET", message: "URL resolves to a private or non-public network address", details: { hostname: "localhost" } } });
  });

  it("maps fetch and timeout failures without returning a stack", async () => {
    analyze.mockRejectedValue(new CrawlerError("UPSTREAM_FETCH_FAILED", "Website request failed"));
    const response = await request(app()).post("/api/analyze").send({ url: "https://example.com" });
    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: { code: "UPSTREAM_FETCH_FAILED", message: "Website request failed", details: {} } });
    expect(JSON.stringify(response.body)).not.toMatch(/stack/i);
  });

  it("uses 500 for an unexpected internal failure", async () => {
    analyze.mockRejectedValue(new Error("sensitive internal detail"));
    const response = await request(app()).post("/api/analyze").send({ url: "https://example.com" });
    expect(response.status).toBe(500);
    expect(response.body.error).toEqual({ code: "INTERNAL_ERROR", message: "Unexpected analyzer error", details: {} });
    expect(JSON.stringify(response.body)).not.toContain("sensitive internal detail");
  });

  it("validates comparison limits, uniqueness, and rank ownership", async () => {
    const noCompetitors = await request(app()).post("/api/compare").send({ targetUrl: pageUrl, competitorUrls: [] });
    expect(noCompetitors.status).toBe(400);
    const duplicate = await request(app()).post("/api/compare").send({ targetUrl: pageUrl, competitorUrls: ["https://two.example", "https://two.example"] });
    expect(duplicate.status).toBe(400);
    const foreignRank = await request(app()).post("/api/compare").send({ targetUrl: pageUrl, competitorUrls: ["https://two.example"], rankObservations: { "https://other.example": 2 } });
    expect(foreignRank.status).toBe(400);
    const invalidCompetitor = await request(app()).post("/api/compare").send({ targetUrl: pageUrl, competitorUrls: ["ftp://two.example"] });
    expect(invalidCompetitor.status).toBe(400);
    expect(invalidCompetitor.body.error.details.fieldErrors).toHaveProperty("competitorUrls");
    expect(invalidCompetitor.body.error.details.fieldErrors).not.toHaveProperty("targetUrl");
    const duplicateRankAlias = await request(app()).post("/api/compare").send({
      targetUrl: pageUrl,
      competitorUrls: ["https://two.example"],
      rankObservations: { "example.com": 8, "https://example.com/": 7 }
    });
    expect(duplicateRankAlias.status).toBe(400);
    expect(compareAndSave).not.toHaveBeenCalled();
  });

  it("runs and returns a saved comparison", async () => {
    const payload = { targetUrl: "https://target.example", competitorUrls: ["https://competitor.example"], queryLabel: "example query", rankObservations: { "https://target.example": 8 } };
    const response = await request(app()).post("/api/compare").send(payload);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({ id: "run-1", comparison: expect.objectContaining({ targetUrl: "https://target.example/" }) }));
    expect(compareAndSave).toHaveBeenCalledWith(payload);
  });

  it("lists, opens, and locates saved runs and returns 404 when missing", async () => {
    store.records = [runRecord()];
    expect((await request(app()).get("/api/runs")).body[0]).toEqual(expect.objectContaining({ id: "run-1" }));
    expect((await request(app()).get("/api/runs/run-1")).body.id).toBe("run-1");
    expect((await request(app()).get("/api/runs/latest").query({ targetUrl: "https://target.example" })).body.id).toBe("run-1");
    const missing = await request(app()).get("/api/runs/not-found");
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("RUN_NOT_FOUND");
  });

  it("returns a consistent error for invalid JSON", async () => {
    const response = await request(app()).post("/api/analyze").set("Content-Type", "application/json").send("{");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_JSON");
  });

  it("rejects JSON request bodies larger than 100 KB", async () => {
    const response = await request(app())
      .post("/api/analyze")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ url: "https://example.com", padding: "x".repeat(101 * 1024) }));
    expect(response.status).toBe(413);
    expect(response.body.error).toEqual({
      code: "REQUEST_TOO_LARGE",
      message: "Request body exceeds the allowed size",
      details: {}
    });
    expect(analyze).not.toHaveBeenCalled();
  });
});
