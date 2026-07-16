import { isCrawlerError } from "./errors.js";
import { requestWithPolicy, type CrawlerRequestOptions } from "./request.js";

const MAX_DISCOVERY_BYTES = 500_000;

export interface CrawlDiscovery {
  robotsTxt: string;
  sitemapUrls: string[];
  errors: Array<{ resource: string; code: string; message: string }>;
}

export async function loadCrawlDiscovery(
  pageUrl: string,
  options: CrawlerRequestOptions = {}
): Promise<CrawlDiscovery> {
  const origin = new URL(pageUrl).origin;
  const errors: CrawlDiscovery["errors"] = [];
  const robotsUrl = new URL("/robots.txt", origin);
  const robotsTxt = await readResource(robotsUrl, options).catch((error: unknown) => {
    errors.push(resourceError(robotsUrl.toString(), error));
    return "";
  });
  const declared = robotsTxt.split(/\r?\n/u)
    .map((line) => /^\s*sitemap\s*:\s*(\S+)/iu.exec(line)?.[1])
    .filter((value): value is string => Boolean(value));
  const sitemapLocations = [...new Set([new URL("/sitemap.xml", origin).toString(), ...declared])];
  const sitemapUrls: string[] = [];
  for (const location of sitemapLocations) {
    let sitemapUrl: URL;
    try {
      sitemapUrl = new URL(location, origin);
    } catch {
      errors.push({ resource: location, code: "INVALID_SITEMAP_URL", message: "robots.txt declared an invalid sitemap URL" });
      continue;
    }
    const xml = await readResource(sitemapUrl, options).catch((error: unknown) => {
      errors.push(resourceError(sitemapUrl.toString(), error));
      return "";
    });
    for (const match of xml.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/giu)) {
      const value = decodeXml(match[1] ?? "").trim();
      if (value) sitemapUrls.push(value);
    }
  }
  return { robotsTxt, sitemapUrls: [...new Set(sitemapUrls)].sort(), errors };
}

async function readResource(url: URL, options: CrawlerRequestOptions): Promise<string> {
  const result = await requestWithPolicy(url, options, async (response) => {
    if (response.status < 200 || response.status >= 300) {
      if (response.body) await response.body.cancel().catch(() => undefined);
      return "";
    }
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_DISCOVERY_BYTES) {
      if (response.body) await response.body.cancel().catch(() => undefined);
      throw new Error(`Discovery resource exceeds ${MAX_DISCOVERY_BYTES} bytes`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_DISCOVERY_BYTES) throw new Error(`Discovery resource exceeds ${MAX_DISCOVERY_BYTES} bytes`);
    return new TextDecoder().decode(bytes);
  });
  return result.value;
}

function resourceError(resource: string, error: unknown): CrawlDiscovery["errors"][number] {
  return {
    resource,
    code: isCrawlerError(error) ? error.code : "DISCOVERY_FAILED",
    message: error instanceof Error ? error.message : "Discovery resource failed"
  };
}

function decodeXml(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|apos);/giu, (_, entity: string) => ({
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'"
  })[entity.toLocaleLowerCase("en-US")] ?? "");
}
