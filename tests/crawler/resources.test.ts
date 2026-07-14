import { describe, expect, it, vi } from "vitest";
import {
  checkSiteResources
} from "../../packages/crawler/resources.js";
import type {
  FetchImplementation
} from "../../packages/crawler/request.js";
import type { DnsLookup } from "../../packages/crawler/safety.js";

const publicDns: DnsLookup = async () => [
  { address: "93.184.216.34", family: 4 }
];

describe("checkSiteResources", () => {
  it("preserves 404 evidence for missing robots.txt and sitemap.xml", async () => {
    const fetchImpl = vi.fn<FetchImplementation>(async () =>
      new Response("not found", { status: 404 })
    );

    const resources = await checkSiteResources(
      "https://example.com/page",
      { fetchImpl, dnsLookup: publicDns }
    );

    expect(resources.robotsTxt).toMatchObject({
      url: "https://example.com/robots.txt",
      finalUrl: "https://example.com/robots.txt",
      available: false,
      statusCode: 404,
      evidence: {
        requestedUrl: "https://example.com/robots.txt",
        finalUrl: "https://example.com/robots.txt",
        statusCode: 404,
        redirectCount: 0,
        error: null
      }
    });
    expect(resources.sitemapXml).toMatchObject({
      url: "https://example.com/sitemap.xml",
      finalUrl: "https://example.com/sitemap.xml",
      available: false,
      statusCode: 404,
      evidence: {
        requestedUrl: "https://example.com/sitemap.xml",
        statusCode: 404,
        error: null
      }
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("treats every 2xx status as available", async () => {
    const fetchImpl: FetchImplementation = async (input) =>
      new Response(null, {
        status: input.endsWith("robots.txt") ? 204 : 206
      });

    const resources = await checkSiteResources("https://example.com/", {
      fetchImpl,
      dnsLookup: publicDns
    });

    expect(resources.robotsTxt.available).toBe(true);
    expect(resources.robotsTxt.statusCode).toBe(204);
    expect(resources.sitemapXml.available).toBe(true);
    expect(resources.sitemapXml.statusCode).toBe(206);
  });

  it("uses the shared redirect policy and captures a resource final URL", async () => {
    const fetchImpl = vi.fn<FetchImplementation>(async (input, init) => {
      expect(init.redirect).toBe("manual");
      expect(new Headers(init.headers).get("user-agent")).toBe(
        "Resource-Test/1.0"
      );

      if (input === "https://example.com/robots.txt") {
        return new Response(null, {
          status: 301,
          headers: { location: "https://static.example/robots.txt" }
        });
      }

      return new Response(null, {
        status: input.endsWith("sitemap.xml") ? 404 : 200
      });
    });

    const resources = await checkSiteResources("https://example.com/page", {
      fetchImpl,
      dnsLookup: publicDns,
      userAgent: "Resource-Test/1.0"
    });

    expect(resources.robotsTxt).toMatchObject({
      url: "https://static.example/robots.txt",
      finalUrl: "https://static.example/robots.txt",
      available: true,
      statusCode: 200,
      evidence: {
        redirectCount: 1,
        redirectChain: [
          {
            statusCode: 301,
            fromUrl: "https://example.com/robots.txt",
            toUrl: "https://static.example/robots.txt"
          }
        ]
      }
    });
  });

  it("returns typed evidence instead of throwing when a resource is unsafe", async () => {
    const fetchImpl = vi.fn<FetchImplementation>();
    const privateDns: DnsLookup = async () => [
      { address: "192.168.10.2", family: 4 }
    ];

    const resources = await checkSiteResources("https://internal.example/", {
      fetchImpl,
      dnsLookup: privateDns
    });

    expect(resources.robotsTxt).toMatchObject({
      available: false,
      statusCode: null,
      finalUrl: null,
      evidence: {
        error: {
          code: "PRIVATE_NETWORK_TARGET",
          httpStatus: 400
        }
      }
    });
    expect(resources.sitemapXml.evidence.error?.code).toBe(
      "PRIVATE_NETWORK_TARGET"
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("records timeouts as unavailable resource evidence", async () => {
    const fetchImpl = vi.fn<FetchImplementation>(async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      })
    );

    const resources = await checkSiteResources("https://example.com/", {
      fetchImpl,
      dnsLookup: publicDns,
      timeoutMs: 10
    });

    expect(resources.robotsTxt.evidence.error).toMatchObject({
      code: "FETCH_TIMEOUT",
      httpStatus: 504,
      message: "Request timed out after 10ms"
    });
    expect(resources.sitemapXml.evidence.error?.code).toBe("FETCH_TIMEOUT");
  });
});
