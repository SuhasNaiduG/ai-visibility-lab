import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JsonVisibilityObservationStore } from "../../packages/visibility/json-observation-store.js";

describe("manual visibility observation store", () => {
  it("saves and filters explicit manual observations without activating a provider", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ai-visibility-observations-"));
    const store = new JsonVisibilityObservationStore(join(directory, "observations.json"), {
      idFactory: () => "observation-1",
      clock: () => new Date("2026-07-16T00:00:00.000Z")
    });
    const saved = await store.save({
      targetUrl: "example.com",
      query: "example service",
      engine: "Manual browser review",
      location: "Seattle, WA",
      device: "desktop",
      observationDate: "2026-07-16",
      observedRank: 4,
      observedCitation: true,
      citationUrl: "https://example.com/source",
      notes: "Observed manually in a signed-out browser.",
      screenshotReference: "screenshots/example-2026-07-16.png",
      referenceUrl: "https://search.example/reference"
    });

    expect(saved).toEqual(expect.objectContaining({ id: "observation-1", source: "manual", targetUrl: "https://example.com/" }));
    expect(await store.list("https://example.com")).toEqual([saved]);
    expect(await store.list("https://other.example")).toEqual([]);
  });

  it("rejects empty observations and preserves corrupt storage", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ai-visibility-observations-"));
    const file = join(directory, "observations.json");
    const store = new JsonVisibilityObservationStore(file);
    await expect(store.save({
      targetUrl: "https://example.com",
      query: "query",
      engine: "manual",
      location: "unknown",
      device: "mobile",
      observationDate: "2026-07-16"
    })).rejects.toMatchObject({ code: "INVALID_RECORD" });

    await writeFile(file, "{not json", "utf8");
    await expect(store.list()).rejects.toMatchObject({ code: "CORRUPT_STORE" });
    expect(await readFile(file, "utf8")).toBe("{not json");
  });
});
