import { describe, expect, it } from "vitest";
import { compareAnalyses } from "../../packages/comparison/compare.js";
import { buildCompleteResearchReport, researchReportCsv, researchReportJson, researchReportMarkdown } from "../../packages/reports/report.js";
import type { RunRecord } from "../../packages/storage/types.js";
import { makeAnalysis } from "../helpers/analysis.js";

describe("complete research report exports", () => {
  it("exports inspectable JSON, Markdown, and CSV with evidence, proposals, sources, methodology, and limitations", () => {
    const target = makeAnalysis("https://target.example/", { wordCount: 100, title: null, titleLength: 0 });
    const competitor = makeAnalysis("https://competitor.example/", { wordCount: 600, title: "Competitor", titleLength: 10 });
    const comparison = compareAnalyses({ target, competitors: [competitor] });
    const run: RunRecord = {
      id: "report-run",
      createdAt: "2026-07-16T00:00:00.000Z",
      schemaVersion: "1",
      applicationVersion: "1.0.0",
      targetUrl: target.normalizedUrl,
      competitorUrls: [competitor.normalizedUrl],
      sites: comparison.sites,
      queryLabel: null,
      rankObservations: {},
      analyses: [target, competitor],
      comparison,
      history: null,
      verification: null
    };
    const report = buildCompleteResearchReport(run, [{
      id: "observation-1",
      createdAt: run.createdAt,
      source: "manual",
      targetUrl: target.normalizedUrl,
      query: "example query",
      engine: "manual",
      location: "Seattle",
      device: "desktop",
      observationDate: "2026-07-16",
      observedRank: 4
    }]);
    const json = researchReportJson(report);
    const markdown = researchReportMarkdown(report);
    const csv = researchReportCsv(report);

    expect(JSON.parse(json)).toEqual(expect.objectContaining({ target: target.normalizedUrl, run: expect.objectContaining({ id: "report-run" }) }));
    expect(markdown).toMatch(/Comparison matrix|Implementation proposals|Research sources|Methodology|Limitations/u);
    expect(markdown).toContain("PROPOSAL_GAP_TITLE_MISSING");
    expect(csv).toMatch(/comparison-metric|comparison-gap|proposal|manual-visibility|research-source/u);
    expect(csv.split("\r\n")[0]).toBe('"section","site","rule_or_field","value","source_url","limitation"');
  });
});
