import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { compareAnalyses } from "../../packages/comparison/compare.js";
import { diffRuns } from "../../packages/comparison/diff.js";
import { SqliteRunStore } from "../../packages/storage/sqlite-run-store.js";
import type { NewRunRecord } from "../../packages/storage/types.js";
import { verifyResearchRuns } from "../../packages/verification/verify.js";
import { makeAnalysis } from "../helpers/analysis.js";

describe("SQLite research run store", () => {
  it("migrates, strictly saves, reopens, histories, and archives research entities", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ai-visibility-sqlite-"));
    const file = join(directory, "research.sqlite");
    let id = 0;
    let tick = 0;
    const store = new SqliteRunStore(file, {
      idFactory: () => `sqlite-run-${++id}`,
      clock: () => new Date(Date.UTC(2026, 6, 16, 0, 0, tick++))
    });
    const firstInput = runInput(100);
    const first = await store.save(firstInput);
    const secondInput = runInput(600);
    const history = diffRuns(first, secondInput);
    const current = { ...secondInput, history };
    const second = await store.save({ ...current, verification: verifyResearchRuns(first, current) });

    expect((await store.get(second.id))?.verification?.comparedRunId).toBe(first.id);
    expect((await store.findLatestByTarget("target.example"))?.id).toBe(second.id);
    expect((await store.list()).map((run) => run.id)).toEqual([second.id, first.id]);

    await store.saveCrawlProject({
      projectId: "crawl-project-1",
      createdAt: "2026-07-16T00:00:00.000Z",
      targetUrl: "https://target.example/",
      status: "partial",
      pages: [{ order: 0, status: "analyzed", url: "https://target.example/" }]
    });
    await store.saveAiInterpretation(second.id, { provider: "mock", citations: ["evidence-1"] });
    store.close();

    const database = new DatabaseSync(file, { readOnly: true });
    expect(count(database, "schema_migrations")).toBe(1);
    expect(count(database, "runs")).toBe(2);
    expect(count(database, "run_pages")).toBe(4);
    expect(count(database, "comparisons")).toBe(2);
    expect(count(database, "research_projects")).toBe(3);
    expect(count(database, "project_pages")).toBe(1);
    expect(count(database, "proposals")).toBeGreaterThan(0);
    expect(count(database, "verifications")).toBe(1);
    expect(count(database, "research_sources")).toBeGreaterThan(0);
    expect(count(database, "ai_interpretations")).toBe(1);
    database.close();

    const reopened = new SqliteRunStore(file);
    expect((await reopened.get(first.id))?.id).toBe(first.id);
    reopened.close();
  });

  it("does not weaken deterministic run validation", async () => {
    const store = new SqliteRunStore(":memory:");
    const invalid = runInput(100);
    invalid.comparison.matrix[0]!.metrics.wordCount = 9_999;
    await expect(store.save(invalid)).rejects.toMatchObject({ code: "INVALID_RECORD" });
    expect(await store.list()).toEqual([]);
    store.close();
  });
});

function runInput(targetWords: number): NewRunRecord {
  const target = makeAnalysis("https://target.example/", { wordCount: targetWords });
  const competitor = makeAnalysis("https://competitor.example/", { wordCount: 600 });
  const comparison = compareAnalyses({ target, competitors: [competitor] });
  return {
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
}

function count(database: DatabaseSync, table: string): number {
  return Number((database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);
}
