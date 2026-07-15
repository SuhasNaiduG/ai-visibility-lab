import { describe, it, expect } from "vitest";
import { JsonRunStore } from "../../packages/storage/json-run-store.js";
import { analyzeUrl } from "../../services/analyzer/analyze.js";
import { compareAnalyses } from "../../packages/comparison/compare.js";
import { normalizeUrl } from "../../packages/crawler/url.js";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { rm } from "node:fs/promises";

describe("reproduction of INVALID_RECORD", () => {
  it("captures the detailed RunStoreError when comparing target and competitors", async () => {
    // 1. Setup minimal store
    const storePath = resolve("data", "repro-runs.json");
    const store = new JsonRunStore(storePath);

    // 2. Perform analyses (simulating the service/compare.ts flow)
    const targetUrl = "https://425clearaligners.com";
    const competitorUrl = "https://porth.io/education-hub/top-bellevue-orthodontist/";
    
    const targetAnalysis = await analyzeUrl(targetUrl);
    const competitorAnalysis = await analyzeUrl(competitorUrl);

    const sites = [
      { role: "target" as const, inputOrder: 0, inputUrl: targetUrl, normalizedUrl: normalizeUrl(targetUrl).toString() },
      { role: "competitor" as const, inputOrder: 1, inputUrl: competitorUrl, normalizedUrl: normalizeUrl(competitorUrl).toString() }
    ];

    const comparison = compareAnalyses({
      target: targetAnalysis,
      competitors: [competitorAnalysis],
      sites
    });

    // 3. Construct input for storage (mimicking services/analyzer/compare.ts)
    const input = {
      targetUrl: targetAnalysis.normalizedUrl,
      competitorUrls: [competitorAnalysis.normalizedUrl],
      sites: comparison.sites,
      queryLabel: null,
      rankObservations: {},
      analyses: [targetAnalysis, competitorAnalysis],
      comparison,
      history: null
    };

    // 4. Trigger save and capture error
    try {
      await store.save(input);
    } catch (error: any) {
      if (error.name === "RunStoreError") {
        console.log("RunStoreError code:", error.code);
        console.log("RunStoreError details:", JSON.stringify(error.details, null, 2));
      }
      throw error;
    } finally {
        await rm(storePath, { force: true });
    }
  });
});
