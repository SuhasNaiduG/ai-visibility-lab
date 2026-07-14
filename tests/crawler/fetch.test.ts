import { describe, expect, it, vi } from "vitest";
import { fetchHtml } from "../../packages/crawler/fetch.js";
import {
  getCrawlerErrorHttpStatus
} from "../../packages/crawler/errors.js";
import type {
  FetchImplementation
} from "../../packages/crawler/request.js";
import type { DnsLookup } from "../../packages/crawler/safety.js";

const publicDns: DnsLookup = async () => [
  { address: "93.184.216.34", family: 4 }
];

describe("fetchHtml", () => {
  it("fetches HTML with a configurable user agent and policy evidence", async () => {
    const fetchImpl = vi.fn<FetchImplementation>(async (_input, init) => {
      expect(init.redirect).toBe("manual");
      expect(new Headers(init.headers).get("user-agent")).toBe(
        "Visibility-Test/1.0"
      );
      return new Response("<main>ok</main>", { status: 200 });
    });

    const result = await fetchHtml(new URL("https://example.com/"), {
      fetchImpl,
      dnsLookup: publicDns,
      userAgent: "Visibility-Test/1.0"
    });

    expect(result).toMatchObject({
      statusCode: 200,
      finalUrl: "https://example.com/",
      html: "<main>ok</main>",
      redirectCount: 0,
      redirectChain: [],
      networkChecks: [
        {
          url: "https://example.com/",
          hostname: "example.com",
          resolvedAddresses: ["93.184.216.34"]
        }
      ]
    });
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(Date.parse(result.fetchedAt))).toBe(false);
  });

  it("follows redirects manually and records every hop", async () => {
    const fetchImpl = vi.fn<FetchImplementation>(async (input) => {
      if (input === "http://example.com/start") {
        return new Response(null, {
          status: 301,
          headers: { location: "https://www.example.com/next" }
        });
      }

      if (input === "https://www.example.com/next") {
        return new Response(null, {
          status: 302,
          headers: { location: "/final" }
        });
      }

      return new Response("done", { status: 200 });
    });

    const result = await fetchHtml(new URL("http://example.com/start"), {
      fetchImpl,
      dnsLookup: publicDns
    });

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      "http://example.com/start",
      "https://www.example.com/next",
      "https://www.example.com/final"
    ]);
    expect(result.finalUrl).toBe("https://www.example.com/final");
    expect(result.redirectCount).toBe(2);
    expect(result.redirectChain).toEqual([
      {
        statusCode: 301,
        fromUrl: "http://example.com/start",
        toUrl: "https://www.example.com/next",
        location: "https://www.example.com/next"
      },
      {
        statusCode: 302,
        fromUrl: "https://www.example.com/next",
        toUrl: "https://www.example.com/final",
        location: "/final"
      }
    ]);
    expect(result.networkChecks.map(({ url }) => url)).toEqual([
      "http://example.com/start",
      "https://www.example.com/next",
      "https://www.example.com/final"
    ]);
  });

  it("rejects a redirect to a private network before the second fetch", async () => {
    const fetchImpl = vi.fn<FetchImplementation>(async () =>
      new Response(null, {
        status: 302,
        headers: { location: "http://internal.example/admin" }
      })
    );
    const dnsLookup: DnsLookup = async (hostname) => [
      {
        address: hostname === "internal.example" ? "10.0.0.9" : "8.8.8.8",
        family: 4
      }
    ];

    await expect(
      fetchHtml(new URL("https://example.com/"), {
        fetchImpl,
        dnsLookup
      })
    ).rejects.toMatchObject({
      code: "PRIVATE_NETWORK_TARGET",
      httpStatus: 400
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("stops redirect loops at the configured limit", async () => {
    const fetchImpl = vi.fn<FetchImplementation>(async (input) => {
      const current = new URL(input);
      const count = Number(current.searchParams.get("hop") ?? "0") + 1;
      return new Response(null, {
        status: 302,
        headers: { location: `/?hop=${count}` }
      });
    });

    await expect(
      fetchHtml(new URL("https://example.com/?hop=0"), {
        fetchImpl,
        dnsLookup: publicDns,
        maxRedirects: 2
      })
    ).rejects.toMatchObject({
      code: "TOO_MANY_REDIRECTS",
      httpStatus: 502,
      details: {
        maxRedirects: 2
      }
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("aborts a stalled request at the configured timeout", async () => {
    const fetchImpl = vi.fn<FetchImplementation>(async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      })
    );

    await expect(
      fetchHtml(new URL("https://example.com/slow"), {
        fetchImpl,
        dnsLookup: publicDns,
        timeoutMs: 10
      })
    ).rejects.toMatchObject({
      code: "FETCH_TIMEOUT",
      httpStatus: 504,
      message: "Request timed out after 10ms"
    });
  });

  it("rejects an oversized response from Content-Length before reading it", async () => {
    const fetchImpl: FetchImplementation = async () =>
      new Response("abcdef", {
        status: 200,
        headers: { "content-length": "6" }
      });

    await expect(
      fetchHtml(new URL("https://example.com/large"), {
        fetchImpl,
        dnsLookup: publicDns,
        maxHtmlBytes: 5
      })
    ).rejects.toMatchObject({
      code: "RESPONSE_TOO_LARGE",
      httpStatus: 502,
      details: {
        contentLength: 6,
        maxHtmlBytes: 5
      }
    });
  });

  it("enforces the byte limit while streaming when length is unknown", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("abc"));
        controller.enqueue(new TextEncoder().encode("def"));
        controller.close();
      }
    });
    const fetchImpl: FetchImplementation = async () =>
      new Response(body, { status: 200 });

    await expect(
      fetchHtml(new URL("https://example.com/chunked"), {
        fetchImpl,
        dnsLookup: publicDns,
        maxHtmlBytes: 5
      })
    ).rejects.toMatchObject({
      code: "RESPONSE_TOO_LARGE",
      details: {
        receivedBytes: 6,
        maxHtmlBytes: 5
      }
    });
  });

  it("maps transport failures to an explicit upstream error and status", async () => {
    const fetchImpl: FetchImplementation = async () => {
      throw new TypeError("connection reset");
    };

    const request = fetchHtml(new URL("https://example.com/"), {
      fetchImpl,
      dnsLookup: publicDns
    });

    await expect(request).rejects.toMatchObject({
      code: "UPSTREAM_FETCH_FAILED",
      httpStatus: 502,
      message: "Website request failed"
    });

    try {
      await request;
    } catch (error: unknown) {
      expect(getCrawlerErrorHttpStatus(error)).toBe(502);
    }
  });
});
