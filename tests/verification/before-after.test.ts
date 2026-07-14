import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePage } from "../../packages/parser/page.js";
import { evaluateRules } from "../../packages/rules/evaluate.js";
import type { AnalysisRuleInput } from "../../packages/rules/types.js";

const pageUrl = "https://example.test/clear-aligners";

function analyzeFixture(name: "original" | "corrected") {
  const html = readFileSync(new URL(`../../fixtures/verification/${name}.html`, import.meta.url), "utf8");
  const input: AnalysisRuleInput = {
    ...parsePage(html, pageUrl),
    requestedUrl: pageUrl,
    normalizedUrl: pageUrl,
    statusCode: 200,
    finalUrl: pageUrl,
    responseTimeMs: 1,
    fetchedAt: "2026-07-15T00:00:00.000Z",
    redirectCount: 0,
    robotsTxtAvailable: true,
    robotsTxtStatusCode: 200,
    sitemapXmlAvailable: true,
    sitemapXmlStatusCode: 200
  };
  return evaluateRules(input).map((finding) => finding.ruleId);
}

describe("before-and-after verification", () => {
  it("resolves original findings by stable rule ID", () => {
    const before = analyzeFixture("original");
    const after = analyzeFixture("corrected");
    const resolved = before.filter((ruleId) => !after.includes(ruleId));
    const unchanged = before.filter((ruleId) => after.includes(ruleId));

    expect(before).toEqual(expect.arrayContaining([
      "CANONICAL_MISMATCH",
      "HEADING_MULTIPLE_H1",
      "HEADING_LEVEL_JUMP",
      "HEADING_EMPTY",
      "JSONLD_INVALID",
      "IMAGE_ALT_MISSING"
    ]));
    expect(resolved).toEqual(expect.arrayContaining([
      "CANONICAL_MISMATCH",
      "HEADING_MULTIPLE_H1",
      "HEADING_LEVEL_JUMP",
      "HEADING_EMPTY",
      "JSONLD_INVALID",
      "IMAGE_ALT_MISSING"
    ]));
    expect(unchanged).toContain("INTERNAL_LINKS_LOW");
  });
});
