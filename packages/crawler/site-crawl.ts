import { randomUUID } from "node:crypto";
import { isCrawlerError } from "./errors.js";
import { normalizeUrl } from "./url.js";
import type { ComparableAnalysis } from "../comparison/types.js";

export const DEFAULT_CRAWL_MAX_PAGES = 10;
export const DEFAULT_CRAWL_MAX_DEPTH = 2;
export const DEFAULT_CRAWL_DELAY_MS = 250;

export interface CrawlProjectInput {
  targetUrl: string;
  maxPages?: number;
  maxDepth?: number;
  minimumDelayMs?: number;
  sitemapUrls?: string[];
  robotsTxt?: string;
}

export interface CrawlPageRecord {
  order: number;
  url: string;
  depth: number;
  discoveredFrom: string | null;
  status: "analyzed" | "blocked" | "skipped" | "error";
  reasonCode: string | null;
  message: string | null;
  analysis: ComparableAnalysis | null;
}

export interface CrawlAggregate {
  analyzedPages: number;
  blockedPages: number;
  skippedPages: number;
  errorPages: number;
  totalWords: number;
  uniqueSchemaTypes: string[];
  uniqueTopicTerms: string[];
  findingCounts: Array<{ ruleId: string; pages: number }>;
}

export interface CrawlResearchProject {
  projectId: string;
  createdAt: string;
  targetUrl: string;
  origin: string;
  config: Required<Pick<CrawlProjectInput, "maxPages" | "maxDepth" | "minimumDelayMs">>;
  status: "complete" | "partial";
  truncated: boolean;
  pages: CrawlPageRecord[];
  aggregate: CrawlAggregate;
  limitations: string[];
}

export interface CrawlProjectDependencies {
  analyze: (url: string) => Promise<ComparableAnalysis>;
  sleep?: (milliseconds: number) => Promise<void>;
  idFactory?: () => string;
  clock?: () => Date;
}

interface QueueEntry {
  url: string;
  depth: number;
  discoveredFrom: string | null;
}

const TRACKING_PARAMETER = /^(?:utm_.+|gclid|fbclid|msclkid)$/iu;

export async function crawlResearchProject(
  input: CrawlProjectInput,
  dependencies: CrawlProjectDependencies
): Promise<CrawlResearchProject> {
  const maxPages = boundedInteger(input.maxPages, DEFAULT_CRAWL_MAX_PAGES, 1, 50, "maxPages");
  const maxDepth = boundedInteger(input.maxDepth, DEFAULT_CRAWL_MAX_DEPTH, 0, 5, "maxDepth");
  const minimumDelayMs = boundedInteger(input.minimumDelayMs, DEFAULT_CRAWL_DELAY_MS, 0, 60_000, "minimumDelayMs");
  const target = canonicalizeCrawlUrl(normalizeUrl(input.targetUrl), undefined);
  const origin = target.origin;
  const queue: QueueEntry[] = [{ url: target.toString(), depth: 0, discoveredFrom: null }];
  for (const sitemapUrl of [...(input.sitemapUrls ?? [])].sort()) {
    const normalized = safeCrawlUrl(sitemapUrl, origin);
    if (normalized) queue.push({ url: normalized, depth: 0, discoveredFrom: "sitemap" });
  }
  const queued = new Set(queue.map((entry) => entry.url));
  const analyzedFinalUrls = new Set<string>();
  const pages: CrawlPageRecord[] = [];
  const sleep = dependencies.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let lastRequestAt = 0;

  while (queue.length > 0 && pages.length < maxPages) {
    const entry = queue.shift()!;
    if (!isAllowedByRobots(entry.url, input.robotsTxt ?? "")) {
      pages.push(pageRecord(pages.length, entry, "blocked", "ROBOTS_DISALLOWED", "robots.txt disallows this path", null));
      continue;
    }

    const elapsed = Date.now() - lastRequestAt;
    if (lastRequestAt > 0 && elapsed < minimumDelayMs) await sleep(minimumDelayMs - elapsed);
    lastRequestAt = Date.now();
    try {
      const analysis = await dependencies.analyze(entry.url);
      const finalIdentity = canonicalizeCrawlUrl(new URL(analysis.finalUrl), origin).toString();
      if (analyzedFinalUrls.has(finalIdentity)) {
        pages.push(pageRecord(pages.length, entry, "skipped", "REDIRECT_DUPLICATE", `Final URL duplicates ${finalIdentity}`, null));
        continue;
      }
      analyzedFinalUrls.add(finalIdentity);
      pages.push(pageRecord(pages.length, entry, "analyzed", null, null, analysis));

      if (entry.depth < maxDepth) {
        for (const candidate of analysis.uniqueInternalUrls) {
          const normalized = safeCrawlUrl(candidate, origin);
          if (!normalized || queued.has(normalized)) continue;
          queued.add(normalized);
          queue.push({ url: normalized, depth: entry.depth + 1, discoveredFrom: entry.url });
        }
      }
    } catch (error: unknown) {
      pages.push(pageRecord(
        pages.length,
        entry,
        "error",
        isCrawlerError(error) ? error.code : "ANALYSIS_FAILED",
        error instanceof Error ? error.message : "Page analysis failed",
        null
      ));
    }
  }

  const truncated = queue.length > 0;
  const aggregate = aggregatePages(pages);
  const partial = truncated || aggregate.blockedPages > 0 || aggregate.skippedPages > 0 || aggregate.errorPages > 0;
  return {
    projectId: dependencies.idFactory?.() ?? randomUUID(),
    createdAt: (dependencies.clock?.() ?? new Date()).toISOString(),
    targetUrl: target.toString(),
    origin,
    config: { maxPages, maxDepth, minimumDelayMs },
    status: partial ? "partial" : "complete",
    truncated,
    pages,
    aggregate,
    limitations: [
      "The crawl is bounded and same-origin; partial, blocked, skipped, and error pages remain explicit.",
      "robots.txt support applies User-agent: * path rules with longest-match precedence; complex nonstandard directives require review.",
      "Static HTML is analyzed without executing client-side JavaScript."
    ]
  };
}

export function canonicalizeCrawlUrl(url: URL, requiredOrigin?: string): URL {
  const normalized = new URL(url);
  normalized.hash = "";
  for (const key of [...normalized.searchParams.keys()]) {
    if (TRACKING_PARAMETER.test(key)) normalized.searchParams.delete(key);
  }
  normalized.searchParams.sort();
  if (requiredOrigin && normalized.origin !== requiredOrigin) {
    throw new Error("Crawl URL must remain on the project origin");
  }
  return normalized;
}

export function isAllowedByRobots(urlValue: string, robotsTxt: string): boolean {
  if (!robotsTxt.trim()) return true;
  const path = `${new URL(urlValue).pathname}${new URL(urlValue).search}`;
  const rules: Array<{ allow: boolean; path: string }> = [];
  let applies = false;
  for (const rawLine of robotsTxt.split(/\r?\n/u)) {
    const line = rawLine.replace(/#.*$/u, "").trim();
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLocaleLowerCase("en-US");
    const value = line.slice(separator + 1).trim();
    if (field === "user-agent") {
      applies = value === "*";
    } else if (applies && (field === "allow" || field === "disallow") && value) {
      rules.push({ allow: field === "allow", path: value });
    }
  }
  const match = rules
    .filter((rule) => path.startsWith(rule.path))
    .sort((left, right) => right.path.length - left.path.length || Number(right.allow) - Number(left.allow))[0];
  return match?.allow ?? true;
}

function safeCrawlUrl(value: string, origin: string): string | null {
  try {
    const url = canonicalizeCrawlUrl(new URL(value, origin), origin);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function pageRecord(order: number, entry: QueueEntry, status: CrawlPageRecord["status"], reasonCode: string | null, message: string | null, analysis: ComparableAnalysis | null): CrawlPageRecord {
  return { order, url: entry.url, depth: entry.depth, discoveredFrom: entry.discoveredFrom, status, reasonCode, message, analysis };
}

function aggregatePages(pages: CrawlPageRecord[]): CrawlAggregate {
  const analyses = pages.flatMap((page) => page.analysis ? [page.analysis] : []);
  const findingCounts = new Map<string, number>();
  for (const analysis of analyses) {
    for (const ruleId of new Set(analysis.findings.map((finding) => finding.ruleId))) {
      findingCounts.set(ruleId, (findingCounts.get(ruleId) ?? 0) + 1);
    }
  }
  return {
    analyzedPages: analyses.length,
    blockedPages: pages.filter((page) => page.status === "blocked").length,
    skippedPages: pages.filter((page) => page.status === "skipped").length,
    errorPages: pages.filter((page) => page.status === "error").length,
    totalWords: analyses.reduce((total, analysis) => total + analysis.wordCount, 0),
    uniqueSchemaTypes: [...new Set(analyses.flatMap((analysis) => analysis.schemaTypes))].sort(),
    uniqueTopicTerms: [...new Set(analyses.flatMap((analysis) => analysis.coverage.contentSection.terms))].sort(),
    findingCounts: [...findingCounts.entries()].map(([ruleId, count]) => ({ ruleId, pages: count })).sort((a, b) => b.pages - a.pages || a.ruleId.localeCompare(b.ruleId))
  };
}

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < minimum || resolved > maximum) {
    throw new TypeError(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return resolved;
}
