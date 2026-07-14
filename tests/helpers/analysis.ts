import type { ComparableAnalysis, ComparableCoverage, ComparisonResult } from "../../packages/comparison/types.js";
import { compareAnalyses } from "../../packages/comparison/compare.js";

export function makeCoverage(overrides: Partial<ComparableCoverage> = {}): ComparableCoverage {
  const empty = () => ({ present: false, count: 0, terms: [], signals: [] });
  return {
    entity: empty(),
    service: empty(),
    location: empty(),
    trust: empty(),
    contact: empty(),
    contentSection: empty(),
    ...overrides
  };
}

export function makeAnalysis(url: string, overrides: Partial<ComparableAnalysis> = {}): ComparableAnalysis {
  return {
    requestedUrl: url,
    normalizedUrl: url,
    statusCode: 200,
    finalUrl: url,
    responseTimeMs: 20,
    fetchedAt: "2026-07-15T00:00:00.000Z",
    redirectCount: 0,
    title: "Example service",
    titleLength: 15,
    metaDescription: "A useful description of the example service and its purpose.",
    metaDescriptionLength: 60,
    canonicalUrl: url,
    canonicalStatus: "match",
    robotsMeta: "index, follow",
    indexability: { status: "explicit-index", isIndexable: true, reason: "No noindex directive was observed." },
    documentLanguage: "en",
    viewportPresent: true,
    h1Count: 1,
    h1Text: ["Example service"],
    headingHierarchy: [{ level: 1, text: "Example service" }],
    totalHeadingCount: 1,
    headingLevelJumps: [],
    emptyHeadingCount: 0,
    repeatedHeadings: [],
    wordCount: 250,
    sentenceCount: 15,
    questionCount: 0,
    detectedQuestions: [],
    faqIndicators: [],
    directAnswerCount: 0,
    jsonLdParseErrors: [],
    schemaTypes: ["Organization"],
    imageCount: 1,
    imagesMissingAlt: 0,
    internalLinkCount: 4,
    externalLinkCount: 1,
    uniqueInternalUrls: [`${url}contact`],
    externalDomains: ["reference.example"],
    emptyAnchorCount: 0,
    robotsTxtAvailable: true,
    robotsTxtStatusCode: 200,
    sitemapXmlAvailable: true,
    sitemapXmlStatusCode: 200,
    coverage: makeCoverage(),
    findings: [],
    ...overrides
  };
}

export function makeComparison(target: ComparableAnalysis, competitor: ComparableAnalysis): ComparisonResult {
  return compareAnalyses({ target, competitors: [competitor] });
}
