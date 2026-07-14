import {
  checkSiteResources,
  type SiteResources
} from "../../packages/crawler/resources.js";
import {
  fetchHtml,
  type FetchOptions
} from "../../packages/crawler/fetch.js";
import type { RedirectHop } from "../../packages/crawler/request.js";
import type { UrlSafetyEvidence } from "../../packages/crawler/safety.js";
import { normalizeUrl } from "../../packages/crawler/url.js";
import {
  parsePage,
  type ParsedPage
} from "../../packages/parser/page.js";
import { evaluateRules } from "../../packages/rules/evaluate.js";
import type {
  AnalysisRuleInput,
  Evidence,
  Finding
} from "../../packages/rules/types.js";

export interface AnalysisResult extends AnalysisRuleInput {
  redirectObserved: boolean;
  redirectChain: RedirectHop[];
  networkChecks: UrlSafetyEvidence[];
  robotsTxtUrl: string;
  sitemapXmlUrl: string;
  siteResources: SiteResources;
  findings: Finding[];
  rawEvidence: Evidence[];
}

export type AnalysisOptions = FetchOptions;

export async function analyzeUrl(
  input: string,
  options: AnalysisOptions = {}
): Promise<AnalysisResult> {
  const requestedUrl = input.trim();
  const normalizedUrl = normalizeUrl(input);
  const requestOptions = {
    ...environmentOptions(),
    ...options
  };
  const fetched = await fetchHtml(normalizedUrl, requestOptions);
  const parsed = parsePage(fetched.html, fetched.finalUrl);
  const resources = await checkSiteResources(fetched.finalUrl, requestOptions);
  const ruleInput: AnalysisRuleInput = {
    requestedUrl,
    normalizedUrl: normalizedUrl.toString(),
    statusCode: fetched.statusCode,
    finalUrl: fetched.finalUrl,
    responseTimeMs: fetched.responseTimeMs,
    fetchedAt: fetched.fetchedAt,
    redirectCount: fetched.redirectCount,
    redirectObserved: fetched.redirectCount > 0,
    ...parsed,
    robotsTxtAvailable: resources.robotsTxt.available,
    robotsTxtStatusCode: resources.robotsTxt.statusCode,
    sitemapXmlAvailable: resources.sitemapXml.available,
    sitemapXmlStatusCode: resources.sitemapXml.statusCode
  };
  const findings = evaluateRules(ruleInput);

  return {
    ...ruleInput,
    redirectObserved: fetched.redirectCount > 0,
    redirectChain: fetched.redirectChain,
    networkChecks: fetched.networkChecks,
    robotsTxtUrl: resources.robotsTxt.url,
    sitemapXmlUrl: resources.sitemapXml.url,
    siteResources: resources,
    findings,
    rawEvidence: createRawEvidence(ruleInput)
  };
}

function createRawEvidence(input: AnalysisRuleInput): Evidence[] {
  const evidence = (
    field: keyof AnalysisRuleInput | string,
    observedValue: unknown,
    selector?: string
  ): Evidence => ({
    sourceUrl: input.finalUrl,
    field,
    observedValue,
    ...(selector ? { selector } : {}),
    fetchedAt: input.fetchedAt
  });

  return [
    evidence("statusCode", input.statusCode),
    evidence("normalizedUrl", input.normalizedUrl),
    evidence("finalUrl", input.finalUrl),
    evidence("redirectCount", input.redirectCount),
    evidence("title", input.title, "title"),
    evidence("metaDescription", input.metaDescription, 'meta[name="description"]'),
    evidence("canonicalStatus", {
      raw: input.canonicalUrl,
      resolved: input.canonicalResolvedUrl,
      status: input.canonicalStatus,
      error: input.canonicalError,
      count: input.canonicalCount
    }, 'link[rel="canonical"]'),
    evidence("indexability", input.indexability, 'meta[name="robots"]'),
    evidence("documentLanguage", input.documentLanguage, "html"),
    evidence("viewportPresent", input.viewportPresent, 'meta[name="viewport"]'),
    evidence("headingHierarchy", input.headingHierarchy, "h1, h2, h3, h4, h5, h6"),
    evidence("headingLevelJumps", input.headingLevelJumps),
    evidence("repeatedHeadings", input.repeatedHeadings),
    evidence("visibleText", input.visibleText, "body"),
    evidence("contentCounts", {
      wordCount: input.wordCount,
      sentenceCount: input.sentenceCount,
      questionCount: input.questionCount,
      directAnswerCount: input.directAnswerCount
    }),
    evidence("detectedQuestions", input.detectedQuestions),
    evidence("faqIndicators", input.faqIndicators),
    evidence("breadcrumbIndicators", input.breadcrumbIndicators),
    evidence("jsonLdParseErrors", input.jsonLdParseErrors, 'script[type="application/ld+json"]'),
    evidence("schemaTypes", input.schemaTypes, 'script[type="application/ld+json"]'),
    evidence("links", {
      internalLinkCount: input.internalLinkCount,
      externalLinkCount: input.externalLinkCount,
      uniqueInternalUrls: input.uniqueInternalUrls,
      uniqueExternalUrls: input.uniqueExternalUrls,
      externalDomains: input.externalDomains,
      emptyAnchorCount: input.emptyAnchorCount,
      anchorTextSummary: input.anchorTextSummary
    }, "a[href]"),
    evidence("images", {
      imageCount: input.imageCount,
      imagesMissingAlt: input.imagesMissingAlt,
      issues: input.imageAltIssues
    }, "img"),
    evidence("coverage", input.coverage),
    evidence("robotsTxt", {
      available: input.robotsTxtAvailable,
      statusCode: input.robotsTxtStatusCode
    }),
    evidence("sitemapXml", {
      available: input.sitemapXmlAvailable,
      statusCode: input.sitemapXmlStatusCode
    })
  ];
}

function environmentOptions(): FetchOptions {
  return {
    ...(positiveEnvironmentInteger("REQUEST_TIMEOUT_MS") !== undefined
      ? { timeoutMs: positiveEnvironmentInteger("REQUEST_TIMEOUT_MS") }
      : {}),
    ...(positiveEnvironmentInteger("MAX_HTML_BYTES") !== undefined
      ? { maxHtmlBytes: positiveEnvironmentInteger("MAX_HTML_BYTES") }
      : {}),
    ...(process.env.USER_AGENT?.trim()
      ? { userAgent: process.env.USER_AGENT.trim() }
      : {})
  };
}

function positiveEnvironmentInteger(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

export type { ParsedPage };
