import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { compareAnalyses } from "../../packages/comparison/compare.js";
import { diffRuns } from "../../packages/comparison/diff.js";
import type { ComparableAnalysis } from "../../packages/comparison/types.js";
import { JsonRunStore, RunStoreError } from "../../packages/storage/json-run-store.js";
import type { NewRunRecord, RunRecord } from "../../packages/storage/types.js";
import { verifyResearchRuns } from "../../packages/verification/verify.js";
import { makeAnalysis } from "../helpers/analysis.js";

async function temporaryStore() {
  const directory = await mkdtemp(join(tmpdir(), "ai-visibility-run-store-"));
  return {
    directory,
    file: join(directory, "nested", "runs.json")
  };
}

function withVerification(previous: RunRecord, input: NewRunRecord, history: NonNullable<NewRunRecord["history"]>): NewRunRecord {
  const current = { ...input, history };
  return { ...current, verification: verifyResearchRuns(previous, current) };
}

function newRunInput(competitorUrls = ["https://competitor.example/"]): NewRunRecord {
  const target = makeAnalysis("https://target.example/");
  const competitors = competitorUrls.map((url) => makeAnalysis(url));
  return runInputFromAnalyses(target, competitors);
}

function runInputFromAnalyses(target: ComparableAnalysis, competitors: ComparableAnalysis[], targetRank = 8): NewRunRecord {
  const queryLabel = "example query";
  const rankObservations = { [target.normalizedUrl]: targetRank };
  const comparison = compareAnalyses({ target, competitors, queryLabel, rankObservations });
  return {
    targetUrl: target.normalizedUrl,
    competitorUrls: competitors.map((competitor) => competitor.normalizedUrl),
    sites: comparison.sites,
    queryLabel,
    rankObservations,
    analyses: [target, ...competitors],
    comparison,
    history: null,
    verification: null
  };
}

function comparisonWithExcludedCompetitor(): NewRunRecord {
  return runInputFromAnalyses(
    makeAnalysis("https://target.example/", { wordCount: 100 }),
    [
      makeAnalysis("https://benchmark.example/", { wordCount: 500 }),
      makeAnalysis("https://blocked.example/", { statusCode: 403, wordCount: 900 })
    ]
  );
}

function comparisonWithNonBenchmarkCompetitor(): NewRunRecord {
  return runInputFromAnalyses(
    makeAnalysis("https://target.example/", { wordCount: 100 }),
    [
      makeAnalysis("https://benchmark.example/", { wordCount: 500 }),
      makeAnalysis("https://context.example/", { wordCount: 200 })
    ]
  );
}

function stripLegacyComparisonContract(run: any): void {
  delete run.sites;
  for (const analysis of run.analyses) delete analysis.visibleText;
  delete run.comparison.sites;
  delete run.comparison.conclusionStatus;
  delete run.comparison.incompleteMessage;
  delete run.comparison.excludedCompetitorUrls;
  for (const row of run.comparison.matrix) {
    delete row.inputOrder;
    delete row.inputUrl;
    delete row.eligibility;
  }
  for (const conclusion of [...run.comparison.targetGaps, ...run.comparison.targetAdvantages]) {
    for (const bundle of conclusion.competitorEvidence) {
      delete bundle.normalizedUrl;
      delete bundle.inputOrder;
      delete bundle.observedValue;
      delete bundle.benchmark;
    }
  }
}

function stripLegacyHistoryContract(history: any): void {
  delete history.competitorChanges.ordering;
  const observedChanges = [
    ...history.technicalChanges,
    ...history.metadataChanges,
    ...history.schemaChanges,
    ...history.headingChanges,
    ...history.contentCountChanges,
    ...history.linkAndMediaChanges,
    ...history.competitorChanges.observedChanges,
    ...history.correlationSummary.siteChangesSincePreviousRun
  ];
  for (const change of [...observedChanges, ...history.findingChanges]) {
    delete change.siteKey;
    delete change.inputOrder;
    delete change.previousSourceUrl;
    delete change.currentSourceUrl;
  }
  for (const findingChange of history.findingChanges) delete findingChange.indeterminateRuleIds;
}

async function ensureParent(file: string): Promise<void> {
  const directory = join(file, "..");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(directory, { recursive: true }));
}

describe("JsonRunStore", () => {
  it("creates storage, saves atomically, reads, lists, and finds the latest matching target", async () => {
    const { directory, file } = await temporaryStore();
    let id = 0;
    let tick = 0;
    const store = new JsonRunStore(file, {
      idFactory: () => `run-${++id}`,
      clock: () => new Date(Date.UTC(2026, 6, 15, 0, 0, tick++))
    });
    const input = newRunInput();

    const first = await store.save(input);
    const second = await store.save({
      ...input,
      queryLabel: "second run",
      comparison: { ...input.comparison, queryLabel: "second run" }
    });

    expect(await store.get(first.id)).toEqual(first);
    const summaries = await store.list();
    expect(summaries.map((run) => run.id)).toEqual([second.id, first.id]);
    expect(first.sites.map((site) => site.normalizedUrl)).toEqual([input.targetUrl, ...input.competitorUrls]);
    expect(summaries[1]?.sites).toEqual(first.sites);
    expect((await store.findLatestByTarget("target.example"))?.id).toBe(second.id);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual(expect.objectContaining({ schemaVersion: "1" }));
    expect((await readdir(join(directory, "nested"))).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("rejects corrupt data without overwriting it", async () => {
    const { file } = await temporaryStore();
    await ensureParent(file);
    await writeFile(file, "{not-json", "utf8");
    const store = new JsonRunStore(file);

    await expect(store.list()).rejects.toMatchObject({ code: "CORRUPT_STORE" } satisfies Partial<RunStoreError>);
    expect(await readFile(file, "utf8")).toBe("{not-json");
  });

  it("rejects unsupported schemas and structurally invalid records", async () => {
    const unsupported = await temporaryStore();
    await ensureParent(unsupported.file);
    await writeFile(unsupported.file, JSON.stringify({ schemaVersion: "99", runs: [] }), "utf8");
    await expect(new JsonRunStore(unsupported.file).list()).rejects.toMatchObject({ code: "UNSUPPORTED_SCHEMA" });

    const malformed = await temporaryStore();
    await ensureParent(malformed.file);
    await writeFile(malformed.file, JSON.stringify({ schemaVersion: "1", runs: [{ id: "incomplete" }] }), "utf8");
    await expect(new JsonRunStore(malformed.file).list()).rejects.toMatchObject({ code: "CORRUPT_STORE" });
  });

  it("validates before save and serializes concurrent writes", async () => {
    const { file } = await temporaryStore();
    let id = 0;
    const store = new JsonRunStore(file, {
      idFactory: () => `concurrent-${++id}`,
      clock: () => new Date("2026-07-15T00:00:00.000Z")
    });
    await expect(store.save({ ...newRunInput(), targetUrl: "ftp://target.example/" })).rejects.toMatchObject({ code: "INVALID_RECORD" });

    const saved = await Promise.all(Array.from({ length: 5 }, (_, index) => {
      const input = newRunInput();
      return store.save({
        ...input,
        queryLabel: `run ${index}`,
        comparison: { ...input.comparison, queryLabel: `run ${index}` }
      });
    }));
    expect(saved).toHaveLength(5);
    expect(await store.list()).toHaveLength(5);
    expect((await store.findLatestByTarget("target.example"))?.id).toBe("concurrent-6");
  });

  it("rejects cross-field identity drift in otherwise valid new records", async () => {
    const { file } = await temporaryStore();
    const store = new JsonRunStore(file);
    const input = newRunInput();

    await expect(store.save({ ...input, sites: [...input.sites].reverse() })).rejects.toMatchObject({
      code: "INVALID_RECORD"
    });
    const blocked = newRunInput();
    blocked.analyses[1] = { ...blocked.analyses[1]!, statusCode: 403 };
    await expect(store.save(blocked)).rejects.toMatchObject({ code: "INVALID_RECORD" });
    await expect(store.list()).resolves.toEqual([]);
  });

  it("rejects incomplete, unordered, excluded, or benchmark-free conclusion evidence", async () => {
    const { file } = await temporaryStore();
    const store = new JsonRunStore(file);
    const input = comparisonWithExcludedCompetitor();
    const gap = input.comparison.targetGaps.find((item) => item.gapId === "GAP_CONTENT_BREADTH");
    expect(gap).toBeDefined();

    const noTargetEvidence = structuredClone(input);
    noTargetEvidence.comparison.targetGaps[0]!.targetEvidence = [];
    await expect(store.save(noTargetEvidence)).rejects.toMatchObject({ code: "INVALID_RECORD" });

    const missingObservedValue = structuredClone(input);
    delete missingObservedValue.comparison.targetGaps[0]!.competitorEvidence[0]!.observedValue;
    await expect(store.save(missingObservedValue)).rejects.toMatchObject({ code: "INVALID_RECORD" });

    const fabricatedObservedValue = structuredClone(input);
    fabricatedObservedValue.comparison.targetGaps[0]!.competitorEvidence[0]!.observedValue = 9_999;
    await expect(store.save(fabricatedObservedValue)).rejects.toMatchObject({ code: "INVALID_RECORD" });

    const fabricatedDelta = structuredClone(input);
    fabricatedDelta.comparison.targetGaps[0]!.delta!.benchmarkValue = 9_999;
    await expect(store.save(fabricatedDelta)).rejects.toMatchObject({ code: "INVALID_RECORD" });

    const fabricatedExplanation = structuredClone(input);
    fabricatedExplanation.comparison.targetGaps[0]!.exactDifference = "Unsupported comparison claim";
    await expect(store.save(fabricatedExplanation)).rejects.toMatchObject({ code: "INVALID_RECORD" });

    const fabricatedSharedRule = structuredClone(input);
    if (fabricatedSharedRule.comparison.sharedGaps[0]) {
      fabricatedSharedRule.comparison.sharedGaps[0].confidence = "low";
      await expect(store.save(fabricatedSharedRule)).rejects.toMatchObject({ code: "INVALID_RECORD" });
    }

    const fabricatedMatrixValue = structuredClone(input);
    fabricatedMatrixValue.comparison.matrix[1]!.metrics.wordCount = 9_999;
    await expect(store.save(fabricatedMatrixValue)).rejects.toMatchObject({ code: "INVALID_RECORD" });

    const emptyNestedEvidence = structuredClone(input);
    emptyNestedEvidence.comparison.targetGaps[0]!.competitorEvidence[0]!.evidence = [];
    await expect(store.save(emptyNestedEvidence)).rejects.toMatchObject({ code: "INVALID_RECORD" });

    const fabricatedNestedEvidence = structuredClone(input);
    fabricatedNestedEvidence.comparison.targetGaps[0]!.competitorEvidence[0]!.evidence[0]!.observedValue = 9_999;
    await expect(store.save(fabricatedNestedEvidence)).rejects.toMatchObject({ code: "INVALID_RECORD" });

    const benchmarkFree = structuredClone(input);
    benchmarkFree.comparison.targetGaps[0]!.competitorEvidence.forEach((bundle) => { bundle.benchmark = false; });
    await expect(store.save(benchmarkFree)).rejects.toMatchObject({ code: "INVALID_RECORD" });

    const fabricatedBenchmark = comparisonWithNonBenchmarkCompetitor();
    const contextEvidence = fabricatedBenchmark.comparison.targetGaps[0]!.competitorEvidence[1]!;
    expect(contextEvidence.benchmark).toBe(false);
    contextEvidence.benchmark = true;
    await expect(store.save(fabricatedBenchmark)).rejects.toMatchObject({ code: "INVALID_RECORD" });

    const excludedEvidence = structuredClone(input);
    const blocked = input.analyses[2]!;
    excludedEvidence.comparison.targetGaps[0]!.competitorEvidence.push({
      sourceUrl: blocked.finalUrl,
      normalizedUrl: blocked.normalizedUrl,
      inputOrder: 2,
      observedValue: blocked.wordCount,
      benchmark: true,
      evidence: [{
        sourceUrl: blocked.finalUrl,
        field: "wordCount",
        observedValue: blocked.wordCount,
        fetchedAt: blocked.fetchedAt
      }]
    });
    await expect(store.save(excludedEvidence)).rejects.toMatchObject({ code: "INVALID_RECORD" });
    await expect(store.list()).resolves.toEqual([]);
  });

  it("preserves the submitted order of five competitors in records and summaries", async () => {
    const { file } = await temporaryStore();
    const store = new JsonRunStore(file, {
      idFactory: () => "ordered-run",
      clock: () => new Date("2026-07-15T00:00:00.000Z")
    });
    const input = newRunInput([
      "https://zeta.example/",
      "https://alpha.example/",
      "https://middle.example/",
      "https://fourth.example/",
      "https://fifth.example/"
    ]);

    const saved = await store.save(input);
    const expectedOrder = [input.targetUrl, ...input.competitorUrls];
    expect(saved.sites.map((site) => site.normalizedUrl)).toEqual(expectedOrder);
    expect((await store.get(saved.id))?.sites.map((site) => site.normalizedUrl)).toEqual(expectedOrder);
    expect((await store.list())[0]?.sites.map((site) => site.normalizedUrl)).toEqual(expectedOrder);
  });

  it("recomputes legacy comparisons so excluded competitor evidence cannot survive", async () => {
    const { file } = await temporaryStore();
    const store = new JsonRunStore(file, {
      idFactory: () => "legacy-evidence",
      clock: () => new Date("2026-07-15T00:00:00.000Z")
    });
    const input = comparisonWithExcludedCompetitor();
    const saved = await store.save(input);
    const legacyFile = JSON.parse(await readFile(file, "utf8"));
    const legacyRun = legacyFile.runs[0];
    const legacyGap = legacyRun.comparison.targetGaps.find((gap: any) => gap.gapId === "GAP_CONTENT_BREADTH");
    const blocked = input.analyses[2]!;
    legacyGap.competitorEvidence.push({
      sourceUrl: blocked.finalUrl,
      evidence: [{
        sourceUrl: blocked.finalUrl,
        field: "wordCount",
        observedValue: blocked.wordCount,
        fetchedAt: blocked.fetchedAt
      }]
    });
    stripLegacyComparisonContract(legacyRun);
    const legacyJson = `${JSON.stringify(legacyFile, null, 2)}\n`;
    await writeFile(file, legacyJson, "utf8");

    const normalized = await new JsonRunStore(file).get(saved.id);
    expect(normalized?.comparison.excludedCompetitorUrls).toEqual([blocked.normalizedUrl]);
    const conclusions = [
      ...(normalized?.comparison.targetGaps ?? []),
      ...(normalized?.comparison.targetAdvantages ?? [])
    ];
    expect(conclusions.length).toBeGreaterThan(0);
    expect(conclusions.every((conclusion) => conclusion.competitorEvidence.every((bundle) => (
      bundle.normalizedUrl === input.competitorUrls[0]
      && bundle.inputOrder === 1
      && bundle.benchmark !== undefined
      && bundle.observedValue !== undefined
      && bundle.evidence.length > 0
    )))).toBe(true);
    expect(conclusions.some((conclusion) => conclusion.competitorEvidence.some((bundle) => bundle.sourceUrl === blocked.finalUrl))).toBe(false);
    expect(await readFile(file, "utf8")).toBe(legacyJson);
  });

  it("recomputes legacy added and removed competitor arrays in submitted order", async () => {
    const { file } = await temporaryStore();
    let id = 0;
    let tick = 0;
    const store = new JsonRunStore(file, {
      idFactory: () => `legacy-order-${++id}`,
      clock: () => new Date(Date.UTC(2026, 6, 15, 0, 0, tick++))
    });
    const firstInput = newRunInput([
      "https://zeta.example/",
      "https://shared.example/",
      "https://old.example/"
    ]);
    const first = await store.save(firstInput);
    const secondInput = newRunInput([
      "https://middle.example/",
      "https://shared.example/",
      "https://alpha.example/"
    ]);
    const history = diffRuns(first, {
      targetUrl: secondInput.targetUrl,
      competitorUrls: secondInput.competitorUrls,
      sites: secondInput.sites,
      queryLabel: secondInput.queryLabel,
      rankObservations: secondInput.rankObservations,
      analyses: secondInput.analyses
    });
    const second = await store.save(withVerification(first, secondInput, history));
    const legacyFile = JSON.parse(await readFile(file, "utf8"));
    const legacyHistory = legacyFile.runs[1].history;
    legacyHistory.competitorChanges.addedUrls.sort();
    legacyHistory.competitorChanges.removedUrls.sort();
    stripLegacyHistoryContract(legacyHistory);
    const legacyJson = `${JSON.stringify(legacyFile, null, 2)}\n`;
    await writeFile(file, legacyJson, "utf8");

    const normalized = await new JsonRunStore(file).get(second.id);
    expect(normalized?.history?.competitorChanges.addedUrls).toEqual([
      "https://middle.example/",
      "https://alpha.example/"
    ]);
    expect(normalized?.history?.competitorChanges.removedUrls).toEqual([
      "https://zeta.example/",
      "https://old.example/"
    ]);
    expect(await readFile(file, "utf8")).toBe(legacyJson);
  });

  it("propagates legacy verification normalization through later run history without rewriting", async () => {
    const { file } = await temporaryStore();
    let id = 0;
    let tick = 0;
    const store = new JsonRunStore(file, {
      idFactory: () => `legacy-verification-${++id}`,
      clock: () => new Date(Date.UTC(2026, 6, 15, 0, 0, tick++))
    });
    const first = await store.save(newRunInput());
    const secondInput = runInputFromAnalyses(
      makeAnalysis("https://target.example/", { title: "Second title", titleLength: 12 }),
      [makeAnalysis("https://competitor.example/")]
    );
    const secondHistory = diffRuns(first, secondInput);
    const second = await store.save(withVerification(first, secondInput, secondHistory));
    const thirdInput = runInputFromAnalyses(
      makeAnalysis("https://target.example/", { title: "Example service", titleLength: 15 }),
      [makeAnalysis("https://competitor.example/")]
    );
    const thirdHistory = diffRuns(second, thirdInput);
    const third = await store.save(withVerification(second, thirdInput, thirdHistory));

    const legacyFile = JSON.parse(await readFile(file, "utf8"));
    legacyFile.runs[1].verification = null;
    legacyFile.runs[2].verification = verifyResearchRuns(
      { ...second, verification: null },
      { ...third, verification: null }
    );
    const legacyJson = `${JSON.stringify(legacyFile, null, 2)}\n`;
    await writeFile(file, legacyJson, "utf8");

    const reopenedStore = new JsonRunStore(file);
    const reopenedSecond = await reopenedStore.get(second.id);
    const reopenedThird = await reopenedStore.get(third.id);
    expect(reopenedSecond?.verification).not.toBeNull();
    expect(reopenedThird?.verification).toEqual(verifyResearchRuns(
      reopenedSecond!,
      { ...reopenedThird!, verification: null }
    ));
    expect(await readFile(file, "utf8")).toBe(legacyJson);
  });

  it("rejects fabricated current history semantics on save and read", async () => {
    const { file } = await temporaryStore();
    let id = 0;
    let tick = 0;
    const store = new JsonRunStore(file, {
      idFactory: () => `history-integrity-${++id}`,
      clock: () => new Date(Date.UTC(2026, 6, 15, 0, 0, tick++))
    });
    const first = await store.save(newRunInput());
    const secondInput = runInputFromAnalyses(
      makeAnalysis("https://target.example/", { title: "Changed target title", titleLength: 20 }),
      [makeAnalysis("https://competitor.example/")],
      5
    );
    const history = diffRuns(first, {
      targetUrl: secondInput.targetUrl,
      competitorUrls: secondInput.competitorUrls,
      sites: secondInput.sites,
      queryLabel: secondInput.queryLabel,
      rankObservations: secondInput.rankObservations,
      analyses: secondInput.analyses
    });
    const validSecond = withVerification(first, secondInput, history);
    expect(history.metadataChanges.length).toBeGreaterThan(0);
    expect(history.findingChanges.length).toBeGreaterThan(0);
    expect(history.rankObservationChanges.length).toBeGreaterThan(0);

    const fabricatedObserved = structuredClone(validSecond);
    fabricatedObserved.history!.metadataChanges[0]!.currentValue = "fabricated metadata";
    await expect(store.save(fabricatedObserved)).rejects.toMatchObject({ code: "INVALID_RECORD" });

    const fabricatedFinding = structuredClone(validSecond);
    fabricatedFinding.history!.findingChanges[0]!.newRuleIds.push("FABRICATED_RULE");
    await expect(store.save(fabricatedFinding)).rejects.toMatchObject({ code: "INVALID_RECORD" });

    const fabricatedRank = structuredClone(validSecond);
    fabricatedRank.history!.rankObservationChanges[0]!.delta = 999;
    await expect(store.save(fabricatedRank)).rejects.toMatchObject({ code: "INVALID_RECORD" });

    const fabricatedCorrelation = structuredClone(validSecond);
    fabricatedCorrelation.history!.correlationSummary.interpretation = "Fabricated causal interpretation.";
    await expect(store.save(fabricatedCorrelation)).rejects.toMatchObject({ code: "INVALID_RECORD" });

    const fabricatedVerification = structuredClone(validSecond);
    fabricatedVerification.verification!.causationStatement = "Website changes caused visibility changes." as never;
    await expect(store.save(fabricatedVerification)).rejects.toMatchObject({ code: "INVALID_RECORD" });

    const fabricatedMembership = structuredClone(validSecond);
    const competitorSite = secondInput.sites[1]!;
    fabricatedMembership.history!.competitorChanges.observedChanges.push({
      scope: "competitor",
      sourceUrl: competitorSite.finalUrl,
      category: "metadata",
      field: "title",
      change: "changed",
      previousValue: "old",
      currentValue: "fabricated",
      siteKey: competitorSite.normalizedUrl,
      inputOrder: competitorSite.inputOrder,
      previousSourceUrl: competitorSite.finalUrl,
      currentSourceUrl: competitorSite.finalUrl
    });
    await expect(store.save(fabricatedMembership)).rejects.toMatchObject({ code: "INVALID_RECORD" });

    const second = await store.save(validSecond);
    expect(await store.get(second.id)).toEqual(second);

    const corruptedFile = JSON.parse(await readFile(file, "utf8"));
    corruptedFile.runs[1].history.findingChanges[0].resolvedRuleIds.push("FABRICATED_ON_DISK");
    const corruptedJson = `${JSON.stringify(corruptedFile, null, 2)}\n`;
    await writeFile(file, corruptedJson, "utf8");
    await expect(new JsonRunStore(file).get(second.id)).rejects.toMatchObject({ code: "CORRUPT_STORE" });
    expect(await readFile(file, "utf8")).toBe(corruptedJson);
  });

  it("normalizes legacy ordered identities, eligibility, and history without rewriting on read", async () => {
    const { file } = await temporaryStore();
    let id = 0;
    let tick = 0;
    const store = new JsonRunStore(file, {
      idFactory: () => `legacy-${++id}`,
      clock: () => new Date(Date.UTC(2026, 6, 15, 0, 0, tick++))
    });
    const firstInput = newRunInput([
      "https://beta.example/",
      "https://alpha.example/"
    ]);
    const first = await store.save(firstInput);
    const secondInput = runInputFromAnalyses(
      makeAnalysis("https://target.example/", { title: "Updated example service", titleLength: 23 }),
      [
        makeAnalysis("https://alpha.example/"),
        makeAnalysis("https://beta.example/")
      ]
    );
    const history = diffRuns(first, {
      targetUrl: secondInput.targetUrl,
      competitorUrls: secondInput.competitorUrls,
      sites: secondInput.sites,
      queryLabel: secondInput.queryLabel,
      rankObservations: secondInput.rankObservations,
      analyses: secondInput.analyses
    });
    const second = await store.save(withVerification(first, secondInput, history));

    const legacyFile = JSON.parse(await readFile(file, "utf8"));
    for (const run of legacyFile.runs) {
      stripLegacyComparisonContract(run);
      if (run.history) stripLegacyHistoryContract(run.history);
    }
    const legacyJson = `${JSON.stringify(legacyFile, null, 2)}\n`;
    await writeFile(file, legacyJson, "utf8");

    const reloaded = new JsonRunStore(file);
    const normalized = await reloaded.get(second.id);
    expect(normalized?.sites.map((site) => site.normalizedUrl)).toEqual([
      secondInput.targetUrl,
      ...secondInput.competitorUrls
    ]);
    expect(normalized?.sites.every((site) => site.eligibility.status === "eligible")).toBe(true);
    expect(normalized?.analyses.every((analysis) => analysis.visibleText.includes("Example service"))).toBe(true);
    expect(normalized?.comparison.matrix.map((row) => row.inputOrder)).toEqual([0, 1, 2]);
    expect(normalized?.comparison.conclusionStatus).toBe("complete");
    expect(normalized?.history?.competitorChanges.ordering).toEqual({
      previousOrder: firstInput.competitorUrls,
      currentOrder: secondInput.competitorUrls,
      orderChanged: true,
      moves: [
        { normalizedUrl: "https://alpha.example/", previousInputOrder: 2, currentInputOrder: 1 },
        { normalizedUrl: "https://beta.example/", previousInputOrder: 1, currentInputOrder: 2 }
      ]
    });
    expect(normalized?.history?.findingChanges.every((change) => change.indeterminateRuleIds.length === 0)).toBe(true);
    expect(normalized?.history?.findingChanges.every((change) => (
      change.siteKey !== undefined
      && change.inputOrder !== undefined
      && change.previousSourceUrl !== undefined
      && change.currentSourceUrl !== undefined
    ))).toBe(true);
    expect(normalized?.history?.metadataChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        siteKey: secondInput.targetUrl,
        inputOrder: 0,
        previousSourceUrl: secondInput.analyses[0]!.finalUrl,
        currentSourceUrl: secondInput.analyses[0]!.finalUrl,
        field: "title"
      })
    ]));
    expect((await reloaded.list())[0]?.sites).toEqual(normalized?.sites);
    expect(await readFile(file, "utf8")).toBe(legacyJson);
  });
});
