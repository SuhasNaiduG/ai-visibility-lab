import { describe, expect, it } from "vitest";
import { parsePage } from "../../packages/parser/page.js";
import { evaluateRules } from "../../packages/rules/evaluate.js";
import type { AnalysisRuleInput } from "../../packages/rules/types.js";

function ruleInput(html: string): AnalysisRuleInput {
  const url = "https://example.test/page";
  return {
    ...parsePage(html, url),
    requestedUrl: url,
    normalizedUrl: url,
    statusCode: 200,
    finalUrl: url,
    responseTimeMs: 10,
    fetchedAt: "2026-07-15T00:00:00.000Z",
    redirectCount: 0,
    robotsTxtAvailable: true,
    robotsTxtStatusCode: 200,
    sitemapXmlAvailable: true,
    sitemapXmlStatusCode: 200
  };
}

describe("evaluateRules", () => {
  it("uses stable IDs, structured evidence, and labeled editorial heuristics", () => {
    const findings = evaluateRules(ruleInput(`<html><head><title>Short</title><link rel="canonical" href="/wrong"></head><body><h1>One</h1><h1>Two</h1><img src="x.jpg"></body></html>`));
    const ids = findings.map((finding) => finding.ruleId);

    expect(ids).toEqual(expect.arrayContaining(["CANONICAL_MISMATCH", "HEADING_MULTIPLE_H1", "IMAGE_ALT_MISSING"]));
    expect(findings.find((finding) => finding.ruleId === "TITLE_LENGTH_SHORT")?.classification).toBe("editorial-heuristic");
    expect(findings.every((finding) => finding.evidence.every((item) => item.sourceUrl && item.fetchedAt))).toBe(true);
    expect(findings.find((finding) => finding.ruleId === "HEADING_MULTIPLE_H1")?.problem).toMatch(/not an automatic claim of harm/i);
  });

  it("recommends BreadcrumbList only when visible breadcrumb evidence exists", () => {
    const withoutBreadcrumb = evaluateRules(ruleInput("<html><body><h1>Page</h1></body></html>"));
    const withBreadcrumb = evaluateRules(ruleInput("<html><body><nav aria-label='Breadcrumb'><a href='/'>Home</a> / Page</nav><h1>Page</h1></body></html>"));

    expect(withoutBreadcrumb.map((finding) => finding.ruleId)).not.toContain("BREADCRUMB_SCHEMA_MISSING");
    expect(withBreadcrumb.map((finding) => finding.ruleId)).toContain("BREADCRUMB_SCHEMA_MISSING");
  });
});
