import { describe, expect, it, vi } from "vitest";
import { CrawlerError } from "../../packages/crawler/errors.js";
import { loadCrawlDiscovery } from "../../packages/crawler/discovery.js";
import { canonicalizeCrawlUrl, crawlResearchProject, isAllowedByRobots } from "../../packages/crawler/site-crawl.js";
import type { FetchImplementation } from "../../packages/crawler/request.js";
import type { DnsLookup } from "../../packages/crawler/safety.js";
import { makeAnalysis } from "../helpers/analysis.js";

const publicDns: DnsLookup = async () => [{ address: "93.184.216.34", family: 4 }];

describe("bounded site crawl", () => {
  it("canonicalizes tracking URLs and applies longest matching robots rules", () => {
    expect(canonicalizeCrawlUrl(new URL("https://example.com/page?utm_source=x&b=2&a=1#part")).toString())
      .toBe("https://example.com/page?a=1&b=2");
    const robots = "User-agent: *\nDisallow: /private\nAllow: /private/public";
    expect(isAllowedByRobots("https://example.com/private/file", robots)).toBe(false);
    expect(isAllowedByRobots("https://example.com/private/public/info", robots)).toBe(true);
  });

  it("keeps deterministic order, deduplicates links and redirects, and preserves partial errors", async () => {
    const analyze = vi.fn(async (url: string) => {
      if (url.endsWith("/broken")) throw new CrawlerError("UPSTREAM_FETCH_FAILED", "fixture failure");
      if (url.endsWith("/redirect")) return makeAnalysis(url, { finalUrl: "https://example.com/about" });
      return makeAnalysis(url, {
        uniqueInternalUrls: url === "https://example.com/"
          ? [
              "https://example.com/about?utm_source=nav",
              "https://example.com/about",
              "https://example.com/private/area",
              "https://example.com/broken",
              "https://example.com/redirect",
              "https://outside.example/ignored"
            ]
          : []
      });
    });

    const project = await crawlResearchProject({
      targetUrl: "https://example.com/",
      maxPages: 6,
      maxDepth: 1,
      minimumDelayMs: 0,
      robotsTxt: "User-agent: *\nDisallow: /private"
    }, { analyze, idFactory: () => "project-1", clock: () => new Date("2026-07-16T00:00:00.000Z") });

    expect(project.projectId).toBe("project-1");
    expect(project.pages.map((page) => [page.url, page.status, page.reasonCode])).toEqual([
      ["https://example.com/", "analyzed", null],
      ["https://example.com/about", "analyzed", null],
      ["https://example.com/private/area", "blocked", "ROBOTS_DISALLOWED"],
      ["https://example.com/broken", "error", "UPSTREAM_FETCH_FAILED"],
      ["https://example.com/redirect", "skipped", "REDIRECT_DUPLICATE"]
    ]);
    expect(project.status).toBe("partial");
    expect(project.aggregate).toEqual(expect.objectContaining({ analyzedPages: 2, blockedPages: 1, skippedPages: 1, errorPages: 1 }));
  });

  it("stops at the configured page limit and reports truncation", async () => {
    const project = await crawlResearchProject({ targetUrl: "https://example.com", maxPages: 2, maxDepth: 1, minimumDelayMs: 0 }, {
      analyze: async (url) => makeAnalysis(url, { uniqueInternalUrls: ["https://example.com/a", "https://example.com/b"] })
    });
    expect(project.pages).toHaveLength(2);
    expect(project.truncated).toBe(true);
    expect(project.status).toBe("partial");
  });
});

describe("robots and sitemap discovery", () => {
  it("reads declared and conventional sitemaps through the shared request policy", async () => {
    const fetchImpl = vi.fn<FetchImplementation>(async (url) => {
      if (url.endsWith("robots.txt")) {
        return new Response("User-agent: *\nDisallow: /private\nSitemap: https://example.com/extra.xml", { status: 200 });
      }
      if (url.endsWith("extra.xml")) {
        return new Response("<urlset><url><loc>https://example.com/b</loc></url></urlset>", { status: 200 });
      }
      return new Response("<urlset><url><loc>https://example.com/a?utm_source=map</loc></url></urlset>", { status: 200 });
    });
    const discovery = await loadCrawlDiscovery("https://example.com/page", { fetchImpl, dnsLookup: publicDns });
    expect(discovery.robotsTxt).toContain("Disallow: /private");
    expect(discovery.sitemapUrls).toEqual(["https://example.com/a?utm_source=map", "https://example.com/b"]);
    expect(discovery.errors).toEqual([]);
  });
});
