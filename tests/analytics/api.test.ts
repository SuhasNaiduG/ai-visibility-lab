import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JsonAnalyticsStore } from "../../packages/analytics/json-analytics-store.js";
import type { RunRecord, RunStore } from "../../packages/storage/types.js";
import { createApp } from "../../services/analyzer/app.js";
import { makeAnalysis, makeComparison, makeCoverage } from "../helpers/analysis.js";

describe("Release 1 growth intelligence API", () => {
  let analyticsStore: JsonAnalyticsStore;
  let run: RunRecord;
  let runStore: RunStore;

  beforeEach(async () => {
    analyticsStore = new JsonAnalyticsStore(join(await mkdtemp(join(tmpdir(), "analytics-api-")), "analytics.json"));
    await analyticsStore.registerProject({ projectId: "project-one", createdAt: "2026-07-17T00:00:00.000Z", targetUrl: "https://target.example/", status: "complete" });
    const target = makeAnalysis("https://target.example/blue", { title: "Blue widget guide", h1Text: ["Blue widget"], headingHierarchy: [{ level: 1, text: "Blue widget" }] });
    const competitor = makeAnalysis("https://competitor.example/blue", {
      detectedQuestions: ["How does a blue widget work?"],
      coverage: makeCoverage({ contentSection: { present: true, count: 1, terms: ["blue widget"], signals: [] } })
    });
    const comparison = makeComparison(target, competitor);
    run = {
      id: "run-one",
      createdAt: "2026-07-16T00:00:00.000Z",
      schemaVersion: "1",
      applicationVersion: "1.0.0",
      targetUrl: "https://target.example/",
      competitorUrls: [competitor.normalizedUrl],
      sites: comparison.sites,
      queryLabel: "blue widget",
      rankObservations: {},
      analyses: [target, competitor],
      comparison,
      history: null,
      verification: null
    };
    runStore = {
      save: vi.fn(),
      get: vi.fn(async (id: string) => id === run.id ? run : null),
      list: vi.fn(async () => []),
      findLatestByTarget: vi.fn(async (url: string) => url === run.targetUrl ? run : null)
    } as unknown as RunStore;
  });

  it("exposes offline connectors and validates preview without provider access", async () => {
    const app = createApp({ analyticsStore, runStore });
    const connectors = await request(app).get("/api/connectors");
    expect(connectors.status).toBe(200);
    expect(connectors.body).toMatchObject({ release: 1, liveProviderAccess: false });
    expect(connectors.body.connectors).toHaveLength(4);

    const preview = await request(app).post("/api/imports/preview").send({ connectorId: "search-console-csv", file: csvFile() });
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ totalRows: 1, connectorId: "search-console-csv", suggestedMapping: { query: "Query", page: "Page" } });
  });

  it("imports, filters Search Performance, opens evidence detail, changes workflow, exports, and deletes safely", async () => {
    const app = createApp({ analyticsStore, runStore });
    const imported = await request(app).post("/api/imports").send(importBody());
    expect(imported.status).toBe(201);
    expect(imported.body.job).toMatchObject({ acceptedRows: 1, rejectedRows: 0 });

    const projects = await request(app).get("/api/growth/projects");
    expect(projects.body).toEqual([expect.objectContaining({ projectId: "project-one" })]);
    const sources = await request(app).get("/api/data-sources").query({ projectId: "project-one" });
    expect(sources.body).toEqual([expect.objectContaining({ connectorId: "search-console-csv" })]);
    const imports = await request(app).get("/api/imports").query({ projectId: "project-one" });
    expect(imports.body).toHaveLength(1);

    const filtered = await request(app).get("/api/search-performance").query({ projectId: "project-one", page: "/blue", query: "widget", dateFrom: "2026-07-01", dateTo: "2026-07-31", device: "desktop", country: "usa" });
    expect(filtered.status).toBe(200);
    expect(filtered.body).toEqual([expect.objectContaining({ query: "blue widget", page: "https://target.example/blue", clicks: 4, impressions: 200, ctr: 0.02, averagePosition: 4.2, device: "desktop", country: "usa" })]);
    const metricId = filtered.body[0].metricId;

    const detail = await request(app).get(`/api/search-performance/${encodeURIComponent(metricId)}`).query({ projectId: "project-one" });
    expect(detail.status).toBe(200);
    expect(detail.body.matchingPublicWebsiteEvidence).toMatchObject({ runId: "run-one", sourceUrl: "https://target.example/blue", title: "Blue widget guide" });
    expect(detail.body.relatedCompetitorEvidence).toEqual([expect.objectContaining({ sourceUrl: "https://competitor.example/blue", questions: ["How does a blue widget work?"] })]);
    expect(detail.body.deterministicOpportunity).toEqual(expect.objectContaining({ ruleId: "SEARCH_HIGH_IMPRESSIONS_LOW_CTR" }));
    expect(detail.body.exactCalculation).toContain("4 / 200");
    expect(detail.body.proposedAction).toBeTruthy();
    expect(detail.body.successMetric).toBeTruthy();
    expect(detail.body.limitation).toMatch(/does not establish|different observation date/iu);

    const opportunities = await request(app).get("/api/opportunities").query({ projectId: "project-one" });
    const opportunityId = opportunities.body[0].opportunityId;
    const changed = await request(app).patch(`/api/opportunities/${encodeURIComponent(opportunityId)}/status`).query({ projectId: "project-one" }).send({ status: "reviewed" });
    expect(changed.status).toBe(200);
    expect(changed.body.status).toBe("reviewed");

    for (const format of ["json", "markdown", "csv"]) {
      const exported = await request(app).get("/api/growth/export").query({ projectId: "project-one", format });
      expect(exported.status).toBe(200);
      expect(exported.headers["content-disposition"]).toContain(`.${format === "markdown" ? "md" : format}`);
      expect(exported.text).not.toContain("Query,Page,Date,Clicks,Impressions");
    }

    const importId = imported.body.job.importId;
    const removed = await request(app).delete(`/api/imports/${encodeURIComponent(importId)}`).query({ projectId: "project-one" });
    expect(removed.body).toMatchObject({ deleted: true, deletedMetricCount: 1, opportunitiesRetained: true });
    expect((await request(app).get("/api/search-performance").query({ projectId: "project-one" })).body).toEqual([]);
    expect((await request(app).get("/api/opportunities").query({ projectId: "project-one" })).body).toHaveLength(2);
  });

  it("enforces project scoping and reports current failures safely", async () => {
    const app = createApp({ analyticsStore, runStore });
    expect((await request(app).post("/api/imports").send({ ...importBody(), projectId: "missing" })).status).toBe(400);
    expect((await request(app).get("/api/search-performance").query({ projectId: "project-one", dateFrom: "2026-08-01", dateTo: "2026-07-01" })).status).toBe(400);
    expect((await request(app).get("/api/search-performance/missing").query({ projectId: "project-one" })).status).toBe(404);
  });
});

function csvFile() {
  return {
    fileName: "search.csv",
    mimeType: "text/csv",
    content: "Query,Page,Date,Clicks,Impressions,CTR,Position,Device,Country\nblue widget,https://target.example/blue,2026-07-01,4,200,2%,4.2,desktop,usa"
  };
}

function importBody() {
  return {
    projectId: "project-one",
    connectorId: "search-console-csv",
    sourceLabel: "Search export",
    propertyLabel: "target.example",
    file: csvFile(),
    mapping: { query: "Query", page: "Page", date: "Date", clicks: "Clicks", impressions: "Impressions", ctr: "CTR", averagePosition: "Position", device: "Device", country: "Country" }
  };
}
