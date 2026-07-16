import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { previewCsv, CsvImportError } from "../../packages/analytics/csv.js";
import { importAnalyticsCsv } from "../../packages/analytics/import-service.js";
import { JsonAnalyticsStore } from "../../packages/analytics/json-analytics-store.js";

describe("Release 1 CSV imports", () => {
  let store: JsonAnalyticsStore;
  let sequence: number;

  beforeEach(async () => {
    store = new JsonAnalyticsStore(join(await mkdtemp(join(tmpdir(), "analytics-import-")), "analytics.json"));
    await store.registerProject({ projectId: "project-one", createdAt: "2026-07-17T00:00:00.000Z", targetUrl: "https://target.example/", status: "complete" });
    sequence = 0;
  });

  it("previews headers, safe samples, and deterministic Search Console mapping", () => {
    const preview = previewCsv(file("Query,Page,Date,Clicks,Impressions,CTR,Position,Device,Country\nblue widget,https://target.example/blue,2026-07-01,4,200,2%,4.2,desktop,usa"), "search-console-csv");
    expect(preview.totalRows).toBe(1);
    expect(preview.suggestedMapping).toEqual({ query: "Query", page: "Page", date: "Date", clicks: "Clicks", impressions: "Impressions", ctr: "CTR", averagePosition: "Position", device: "Device", country: "Country" });
    expect(preview.sampleRows[0]?.Query).toBe("blue widget");
  });

  it("rejects prohibited columns and malformed or oversized structures before import", () => {
    expect(() => previewCsv(file("Query,Page,Date,Clicks,Impressions,CTR,Position,E-mail\nq,https://target.example/,2026-07-01,1,10,10%,1,blocked"), "search-console-csv")).toThrowError(CsvImportError);
    expect(() => previewCsv(file('Query,Page\n"unclosed,https://target.example/'), "search-console-csv")).toThrow(/unclosed/u);
    expect(() => previewCsv(file("Query,Query\nfirst,second"), "search-console-csv")).toThrow(/unique/u);
  });

  it("normalizes imported Search Console values, lineage, rejections, duplicates, and opportunities", async () => {
    const content = [
      "Query,Page,Date,Clicks,Impressions,CTR,Position,Device,Country",
      "blue widget,https://target.example/blue,2026-07-01,4,200,2%,4.2,desktop,usa",
      "blue widget,https://target.example/blue,2026-07-01,4,200,2%,4.2,desktop,usa",
      "bad arithmetic,https://target.example/bad,2026-07-01,50,100,2%,3,desktop,usa",
      "=formula,https://target.example/formula,2026-07-01,1,100,1%,9,desktop,usa"
    ].join("\n");
    const result = await importSearch(content, "search-one");
    expect(result.job).toMatchObject({ totalRows: 4, acceptedRows: 1, rejectedRows: 3, duplicateRows: 1, status: "completed-with-rejections" });
    expect(result.rejections.map((item) => item.code)).toEqual(["DUPLICATE_RECORD", "INVALID_VALUE", "FORMULA_VALUE"]);
    const metrics = await store.listMetrics("project-one", { metricType: "search-performance" });
    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({ query: "blue widget", clicks: 4, impressions: 200, ctr: 0.02, averagePosition: 4.2, device: "desktop", country: "usa" });
    expect(metrics[0]?.lineage).toMatchObject({ importMethod: "csv", connectorId: "search-console-csv", transformationVersion: "release-1.0.0", confidence: "reported-by-import" });
    expect((await store.listOpportunities("project-one")).map((item) => item.ruleId)).toEqual(expect.arrayContaining(["SEARCH_HIGH_IMPRESSIONS_LOW_CTR", "SEARCH_STRONG_POSITION_LOW_CTR"]));

    const duplicateImport = await importSearch(content.split("\n").slice(0, 2).join("\n"), "search-one");
    expect(duplicateImport.job).toMatchObject({ acceptedRows: 0, rejectedRows: 1, duplicateRows: 1 });
    expect(await store.listMetrics("project-one")).toHaveLength(1);
  });

  it("normalizes all four Release 1 connector contracts without live provider access", async () => {
    await importCsv("web-analytics-csv", "web", "Page,Date,Sessions,Users,Engagement Rate,Conversions,Device,Country\nhttps://target.example/blue,2026-07-01,200,150,25%,1,mobile,usa", { page: "Page", date: "Date", sessions: "Sessions", users: "Users", engagementRate: "Engagement Rate", conversions: "Conversions", device: "Device", country: "Country" });
    await importCsv("campaign-csv", "campaign", "Campaign,Date,Spend,Clicks,Conversions\nBrand,2026-07-01,250,30,0", { campaign: "Campaign", date: "Date", spend: "Spend", clicks: "Clicks", conversions: "Conversions" });
    await importCsv("lead-summary-csv", "lead", "Source,Date,Leads,Qualified Leads\nOrganic,2026-07-01,40,5", { source: "Source", date: "Date", leads: "Leads", qualifiedLeads: "Qualified Leads" });

    expect((await store.listMetrics("project-one")).map((item) => item.metricType).sort()).toEqual(["campaign-performance", "lead-summary", "web-analytics"]);
    expect((await store.listOpportunities("project-one")).map((item) => item.ruleId)).toEqual(expect.arrayContaining(["ENGAGEMENT_HIGH_TRAFFIC_WEAK_ENGAGEMENT", "ENGAGEMENT_HIGH_TRAFFIC_LOW_CONVERSION", "CAMPAIGN_SPEND_WITHOUT_CONVERSION", "LEAD_VOLUME_LOW_QUALIFICATION"]));
  });

  it("creates the multi-page query review flag with transparent aggregation", async () => {
    const content = [
      "Query,Page,Date,Clicks,Impressions,CTR,Position,Device,Country",
      "blue widget,https://target.example/blue,2026-07-01,2,60,3.333%,8,desktop,usa",
      "blue widget,https://target.example/widgets,2026-07-01,2,60,3.333%,9,desktop,usa"
    ].join("\n");
    await importSearch(content, "multi");
    const opportunity = (await store.listOpportunities("project-one")).find((item) => item.ruleId === "SEARCH_QUERY_MULTIPLE_PAGES");
    expect(opportunity?.exactCalculation).toContain("60 + 60 = 120");
    expect(opportunity?.limitation).toContain("do not by themselves prove cannibalization");
    expect(await store.listEvidence("project-one", opportunity?.opportunityId)).toHaveLength(2);
  });

  async function importSearch(content: string, sourceLabel: string) {
    return importCsv("search-console-csv", sourceLabel, content, { query: "Query", page: "Page", date: "Date", clicks: "Clicks", impressions: "Impressions", ctr: "CTR", averagePosition: "Position", device: "Device", country: "Country" });
  }

  async function importCsv(connectorId: string, sourceLabel: string, content: string, mapping: Record<string, string>) {
    return importAnalyticsCsv({ projectId: "project-one", connectorId, sourceLabel, file: file(content), mapping }, store, { clock: () => new Date("2026-07-17T00:10:00.000Z"), idFactory: () => `id-${++sequence}` });
  }
});

function file(content: string) {
  return { fileName: "analytics.csv", mimeType: "text/csv", content };
}
