import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { JsonRunStore, RunStoreError } from "../../packages/storage/json-run-store.js";
import type { NewRunRecord } from "../../packages/storage/types.js";
import { makeAnalysis, makeComparison } from "../helpers/analysis.js";

async function temporaryStore() {
  const directory = await mkdtemp(join(tmpdir(), "ai-visibility-run-store-"));
  return {
    directory,
    file: join(directory, "nested", "runs.json")
  };
}

function newRunInput(): NewRunRecord {
  const target = makeAnalysis("https://target.example/");
  const competitor = makeAnalysis("https://competitor.example/");
  return {
    targetUrl: target.normalizedUrl,
    competitorUrls: [competitor.normalizedUrl],
    queryLabel: "example query",
    rankObservations: { [target.normalizedUrl]: 8 },
    analyses: [target, competitor],
    comparison: makeComparison(target, competitor),
    history: null
  };
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
    const second = await store.save({ ...input, queryLabel: "second run" });

    expect(await store.get(first.id)).toEqual(first);
    expect((await store.list()).map((run) => run.id)).toEqual([second.id, first.id]);
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

    const saved = await Promise.all(Array.from({ length: 5 }, (_, index) => store.save({ ...newRunInput(), queryLabel: `run ${index}` })));
    expect(saved).toHaveLength(5);
    expect(await store.list()).toHaveLength(5);
    expect((await store.findLatestByTarget("target.example"))?.id).toBe("concurrent-6");
  });
});
