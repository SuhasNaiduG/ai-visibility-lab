import { describe, expect, it, vi } from "vitest";
import type { FetchImplementation } from "../../packages/crawler/request.js";
import type { DnsLookup } from "../../packages/crawler/safety.js";
import { analyzeUrl } from "../../services/analyzer/analyze.js";

const publicDns: DnsLookup = async () => [{ address: "93.184.216.34", family: 4 }];

describe("analyzeUrl orchestration", () => {
  it("uses final-URL parsing, shared resource policy, deterministic findings, and raw evidence", async () => {
    const fetchImpl = vi.fn<FetchImplementation>(async (input) => {
      if (input === "https://example.com/start") {
        return new Response(null, { status: 302, headers: { location: "/final" } });
      }
      if (input === "https://example.com/final") {
        return new Response(`<!doctype html><html><head>
          <title>Short</title>
          <link rel="canonical" href="/other" />
          <script type="application/ld+json">{invalid}</script>
        </head><body>
          <h1>Example service</h1><h1>Example service</h1>
          <img src="/service.jpg" />
          <a href="/contact">Contact</a>
        </body></html>`, { status: 200, headers: { "content-type": "text/html" } });
      }
      if (input === "https://example.com/robots.txt") {
        return new Response("not found", { status: 404 });
      }
      if (input === "https://example.com/sitemap.xml") {
        return new Response("<urlset />", { status: 200 });
      }
      throw new Error(`Unexpected test URL: ${input}`);
    });

    const result = await analyzeUrl("  https://example.com/start#ignored  ", {
      fetchImpl,
      dnsLookup: publicDns,
      timeoutMs: 1_000
    });

    expect(result).toEqual(expect.objectContaining({
      requestedUrl: "https://example.com/start#ignored",
      normalizedUrl: "https://example.com/start",
      finalUrl: "https://example.com/final",
      statusCode: 200,
      redirectCount: 1,
      redirectObserved: true,
      h1Count: 2,
      canonicalStatus: "mismatch",
      imagesMissingAlt: 1,
      robotsTxtAvailable: false,
      robotsTxtStatusCode: 404,
      sitemapXmlAvailable: true,
      sitemapXmlStatusCode: 200
    }));
    expect(result.jsonLdParseErrors).toHaveLength(1);
    expect(result.findings.map((finding) => finding.ruleId)).toEqual(expect.arrayContaining([
      "REDIRECT_OBSERVED",
      "ROBOTS_TXT_MISSING",
      "CANONICAL_MISMATCH",
      "HEADING_MULTIPLE_H1",
      "JSONLD_INVALID",
      "IMAGE_ALT_MISSING"
    ]));
    expect(result.rawEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "headingHierarchy", sourceUrl: "https://example.com/final" }),
      expect.objectContaining({ field: "robotsTxt", observedValue: { available: false, statusCode: 404 } })
    ]));
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});
