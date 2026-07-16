import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { JsonAnalyticsStore } from "../../packages/analytics/json-analytics-store.js";
import { SqliteAnalyticsStore } from "../../packages/analytics/sqlite-analytics-store.js";
import type { AnalyticsAuditEvent, AnalyticsStore, ImportBundle, ProjectReference } from "../../packages/analytics/types.js";
import { SqliteRunStore } from "../../packages/storage/sqlite-run-store.js";

const PROJECT: ProjectReference = {
  projectId: "project-one",
  createdAt: "2026-07-17T00:00:00.000Z",
  targetUrl: "https://target.example/",
  status: "complete"
};
const SECOND_PROJECT: ProjectReference = {
  projectId: "project-two",
  createdAt: "2026-07-17T00:00:01.000Z",
  targetUrl: "https://other.example/",
  status: "complete"
};

describe("Release 1 analytics storage foundation", () => {
  it("applies migration 002 to a fresh schema 001 database with foreign keys enabled", async () => {
    const path = await sqliteFixture([PROJECT]);
    const store = new SqliteAnalyticsStore(path);
    store.close();

    const database = new DatabaseSync(path, { enableForeignKeyConstraints: true });
    expect((database.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version: number }).version).toBe(2);
    expect((database.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys).toBe(1);
    expect(() => database.prepare("INSERT INTO connector_sources (id, project_id, connector_id, connector_version, kind, label, source_json) VALUES ('bad', 'missing', 'x', '1.0.0', 'search-console', 'bad', '{}')").run()).toThrow(/FOREIGN KEY/u);
    database.close();
  });

  it("migrates an existing schema fixture without changing its project or page records", async () => {
    const path = await sqliteFixture([PROJECT], true);
    const before = inspectCounts(path, ["research_projects", "project_pages"]);
    const store = new SqliteAnalyticsStore(path);
    store.close();
    expect(inspectCounts(path, ["research_projects", "project_pages"])).toEqual(before);
  });

  it.each(["json", "sqlite"] as const)("enforces project isolation and duplicate protection in %s", async (adapter) => {
    const store = await storeFixture(adapter, [PROJECT, SECOND_PROJECT]);
    await store.saveImport(bundle());
    expect(await store.getMetric(SECOND_PROJECT.projectId, "metric-one")).toBeNull();
    expect(await store.listMetrics(PROJECT.projectId)).toHaveLength(1);

    await expect(store.saveImport(bundle({ importId: "import-two", metricId: "metric-two", eventId: "audit-two" }))).rejects.toMatchObject({ code: "DUPLICATE_RECORD" });
    close(store);
  });

  it.each(["json", "sqlite"] as const)("deletes only import-owned rows and evidence links in %s", async (adapter) => {
    const store = await storeFixture(adapter, [PROJECT]);
    await store.saveImport(bundle({ includeRejection: true }));
    const event = deletionEvent();
    expect(await store.deleteImport(PROJECT.projectId, "import-one", event)).toBe(true);

    expect(await store.getProject(PROJECT.projectId)).toEqual(PROJECT);
    expect(await store.listImports(PROJECT.projectId)).toEqual([]);
    expect(await store.listMetrics(PROJECT.projectId)).toEqual([]);
    expect(await store.listEvidence(PROJECT.projectId)).toEqual([]);
    expect(await store.listOpportunities(PROJECT.projectId)).toHaveLength(1);
    expect(await store.listAuditEvents(PROJECT.projectId)).toEqual(expect.arrayContaining([event]));
    close(store);
  });

  it("keeps JSON and SQLite behavior aligned for save, filter, workflow, and deletion", async () => {
    const json = await storeFixture("json", [PROJECT]);
    const sqlite = await storeFixture("sqlite", [PROJECT]);
    for (const store of [json, sqlite]) await store.saveImport(bundle());

    const statusEvent: AnalyticsAuditEvent = {
      eventId: "audit-status",
      projectId: PROJECT.projectId,
      occurredAt: "2026-07-17T01:00:00.000Z",
      eventType: "opportunity.status-changed",
      importRef: null,
      summary: { opportunityId: "opportunity-one", previousStatus: "new", status: "reviewed" }
    };
    for (const store of [json, sqlite]) await store.updateOpportunityStatus(PROJECT.projectId, "opportunity-one", "reviewed", statusEvent);

    expect(await json.listSources(PROJECT.projectId)).toEqual(await sqlite.listSources(PROJECT.projectId));
    expect(await json.listImports(PROJECT.projectId)).toEqual(await sqlite.listImports(PROJECT.projectId));
    expect(await json.listMetrics(PROJECT.projectId, { metricType: "search-performance", query: "widget", device: "desktop" })).toEqual(await sqlite.listMetrics(PROJECT.projectId, { metricType: "search-performance", query: "widget", device: "desktop" }));
    expect(await json.listOpportunities(PROJECT.projectId)).toEqual(await sqlite.listOpportunities(PROJECT.projectId));
    expect(await json.listEvidence(PROJECT.projectId)).toEqual(await sqlite.listEvidence(PROJECT.projectId));

    for (const store of [json, sqlite]) await store.deleteImport(PROJECT.projectId, "import-one", deletionEvent());
    expect(await json.listMetrics(PROJECT.projectId)).toEqual(await sqlite.listMetrics(PROJECT.projectId));
    expect(await json.listOpportunities(PROJECT.projectId)).toEqual(await sqlite.listOpportunities(PROJECT.projectId));
    close(json);
    close(sqlite);
  });

  it("persists normalized data and redacted audit metadata without retaining CSV content", async () => {
    const directory = await mkdtemp(join(tmpdir(), "analytics-json-"));
    const path = join(directory, "analytics.json");
    const store = new JsonAnalyticsStore(path);
    await store.registerProject(PROJECT);
    await store.saveImport(bundle());
    const content = await readFile(path, "utf8");
    expect(content).not.toContain("Query,Page,Clicks");
    expect(content).not.toContain("originalCsv");
    expect(content).not.toMatch(/credential|oauth|patient|recording|form contents/iu);
    expect(JSON.parse(content).metrics[0].query).toBe("blue widget");
  });
});

async function sqliteFixture(projects: ProjectReference[], withPage = false): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "analytics-sqlite-"));
  const path = join(directory, "research.sqlite");
  const store = new SqliteRunStore(path);
  for (const project of projects) {
    await store.saveCrawlProject({
      projectId: project.projectId,
      createdAt: project.createdAt,
      targetUrl: project.targetUrl,
      status: project.status,
      pages: withPage ? [{ status: "analyzed", url: project.targetUrl }] : []
    });
  }
  store.close();
  return path;
}

async function storeFixture(adapter: "json" | "sqlite", projects: ProjectReference[]): Promise<AnalyticsStore> {
  if (adapter === "json") {
    const directory = await mkdtemp(join(tmpdir(), "analytics-json-"));
    const store = new JsonAnalyticsStore(join(directory, "analytics.json"));
    for (const project of projects) await store.registerProject(project);
    return store;
  }
  return new SqliteAnalyticsStore(await sqliteFixture(projects));
}

function bundle(options: { importId?: string; metricId?: string; eventId?: string; includeRejection?: boolean } = {}): ImportBundle {
  const importId = options.importId ?? "import-one";
  const metricId = options.metricId ?? "metric-one";
  const rejectionCount = options.includeRejection ? 1 : 0;
  const createdAt = "2026-07-17T00:10:00.000Z";
  return {
    project: PROJECT,
    source: {
      sourceId: "source-one",
      projectId: PROJECT.projectId,
      connectorId: "search-console-csv",
      connectorVersion: "1.0.0",
      kind: "search-console",
      label: "Search export",
      accountLabel: null,
      propertyLabel: "target.example",
      createdAt
    },
    job: {
      importId,
      projectId: PROJECT.projectId,
      sourceId: "source-one",
      createdAt,
      completedAt: createdAt,
      status: rejectionCount ? "completed-with-rejections" : "completed",
      fileName: "search.csv",
      mimeType: "text/csv",
      fileSha256: "a".repeat(64),
      mapping: { query: "Query", page: "Page", date: "Date", clicks: "Clicks", impressions: "Impressions", ctr: "CTR", averagePosition: "Position" },
      totalRows: 1 + rejectionCount,
      acceptedRows: 1,
      rejectedRows: rejectionCount,
      duplicateRows: rejectionCount,
      sourceDateFrom: "2026-07-01",
      sourceDateTo: "2026-07-01",
      limitations: ["Imported aggregate values are not independently verified."]
    },
    rejections: options.includeRejection ? [{ rejectionId: "reject-one", importId, projectId: PROJECT.projectId, rowNumber: 3, code: "DUPLICATE_RECORD", field: null, message: "Duplicate normalized record was rejected." }] : [],
    metrics: [{
      metricId,
      projectId: PROJECT.projectId,
      sourceId: "source-one",
      importId,
      metricType: "search-performance",
      date: "2026-07-01",
      dateTo: null,
      query: "blue widget",
      page: "https://target.example/widgets/blue",
      clicks: 4,
      impressions: 200,
      ctr: 0.02,
      averagePosition: 4.2,
      device: "desktop",
      country: "usa",
      lineage: {
        projectId: PROJECT.projectId,
        sourceId: "source-one",
        importId,
        connectorId: "search-console-csv",
        connectorVersion: "1.0.0",
        importMethod: "csv",
        sourceRecordId: "b".repeat(64),
        normalizedRecordHash: "c".repeat(64),
        importedAt: createdAt,
        sourceDate: "2026-07-01",
        sourceDateTo: null,
        transformationVersion: "release-1.0.0",
        validationStatus: "accepted",
        confidence: "reported-by-import",
        limitations: ["Imported aggregate values are not independently verified."]
      }
    }],
    opportunities: [{
      opportunityId: "opportunity-one",
      projectId: PROJECT.projectId,
      ruleId: "SEARCH_STRONG_POSITION_LOW_CTR",
      ruleVersion: "1.0.0",
      groupKey: "https://target.example/widgets/blue|blue widget",
      title: "Review a strong-position, low-CTR query",
      status: "new",
      priority: "high",
      category: "search",
      page: "https://target.example/widgets/blue",
      query: "blue widget",
      observation: "The imported row reports 200 impressions, 4 clicks, 2.00% CTR, and average position 4.20.",
      exactCalculation: "CTR = 4 / 200 = 2.00%; threshold: position <= 5, impressions >= 50, CTR < 3.00%.",
      proposedAction: "Review the public title and description against the query intent before changing the page.",
      successMetric: "On a later comparable import, CTR for the same query-page-device-country segment is at least 3.00% without a worse average position.",
      limitation: "This is a deterministic review flag from imported aggregates; it does not establish causation or forecast impact.",
      sourceMetricIds: [metricId],
      createdAt,
      updatedAt: createdAt
    }],
    evidence: [{ opportunityId: "opportunity-one", metricId, projectId: PROJECT.projectId, calculationRole: "trigger row" }],
    auditEvent: {
      eventId: options.eventId ?? "audit-import",
      projectId: PROJECT.projectId,
      occurredAt: createdAt,
      eventType: "import.completed",
      importRef: importId,
      summary: { acceptedRows: 1, rejectedRows: rejectionCount, duplicateRows: rejectionCount, connectorId: "search-console-csv" }
    }
  };
}

function deletionEvent(): AnalyticsAuditEvent {
  return {
    eventId: "audit-delete",
    projectId: PROJECT.projectId,
    occurredAt: "2026-07-17T02:00:00.000Z",
    eventType: "import.deleted",
    importRef: "import-one",
    summary: { deletedMetricCount: 1, deletedRejectionCount: 0, retainedOpportunities: true }
  };
}

function inspectCounts(path: string, tables: string[]): Record<string, number> {
  const database = new DatabaseSync(path);
  const result = Object.fromEntries(tables.map((table) => [table, (database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count]));
  database.close();
  return result;
}

function close(store: AnalyticsStore): void {
  if (store instanceof SqliteAnalyticsStore) store.close();
}
