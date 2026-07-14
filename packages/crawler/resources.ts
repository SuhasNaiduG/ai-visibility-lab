import { isCrawlerError } from "./errors.js";
import {
  requestWithPolicy,
  type CrawlerRequestOptions,
  type RedirectHop
} from "./request.js";
import type { UrlSafetyEvidence } from "./safety.js";

export interface ResourceErrorEvidence {
  code: string;
  message: string;
  httpStatus: number | null;
  details: Readonly<Record<string, unknown>>;
}

export interface ResourceCheckEvidence {
  requestedUrl: string;
  finalUrl: string | null;
  statusCode: number | null;
  checkedAt: string;
  responseTimeMs: number | null;
  redirectCount: number;
  redirectChain: RedirectHop[];
  networkChecks: UrlSafetyEvidence[];
  error: ResourceErrorEvidence | null;
}

export interface ResourceAvailability {
  url: string;
  available: boolean;
  statusCode: number | null;
  finalUrl: string | null;
  evidence: ResourceCheckEvidence;
}

export interface SiteResources {
  robotsTxt: ResourceAvailability;
  sitemapXml: ResourceAvailability;
}

export interface ResourceCheckOptions extends CrawlerRequestOptions {}

export async function checkSiteResources(
  pageUrl: string,
  options: ResourceCheckOptions = {}
): Promise<SiteResources> {
  const origin = new URL(pageUrl).origin;

  const [robotsTxt, sitemapXml] = await Promise.all([
    checkResource(new URL("/robots.txt", origin), options),
    checkResource(new URL("/sitemap.xml", origin), options)
  ]);

  return {
    robotsTxt,
    sitemapXml
  };
}

async function checkResource(
  url: URL,
  options: ResourceCheckOptions
): Promise<ResourceAvailability> {
  const requestedUrl = url.toString();

  try {
    const result = await requestWithPolicy(
      url,
      options,
      async (response) => {
        if (response.body) {
          try {
            await response.body.cancel();
          } catch {
            // Availability needs headers only; cancellation is best-effort.
          }
        }
      }
    );
    const evidence: ResourceCheckEvidence = {
      requestedUrl,
      finalUrl: result.finalUrl,
      statusCode: result.statusCode,
      checkedAt: result.fetchedAt,
      responseTimeMs: result.responseTimeMs,
      redirectCount: result.redirectCount,
      redirectChain: result.redirectChain,
      networkChecks: result.networkChecks,
      error: null
    };

    return {
      url: result.finalUrl,
      available: result.statusCode >= 200 && result.statusCode < 300,
      statusCode: result.statusCode,
      finalUrl: result.finalUrl,
      evidence
    };
  } catch (error: unknown) {
    const crawlerError = isCrawlerError(error) ? error : null;
    const errorEvidence: ResourceErrorEvidence = {
      code: crawlerError?.code ?? "UNKNOWN_RESOURCE_ERROR",
      message: error instanceof Error ? error.message : "Resource check failed",
      httpStatus: crawlerError?.httpStatus ?? null,
      details: crawlerError?.details ?? {}
    };

    return {
      url: requestedUrl,
      available: false,
      statusCode: null,
      finalUrl: null,
      evidence: {
        requestedUrl,
        finalUrl: null,
        statusCode: null,
        checkedAt: new Date().toISOString(),
        responseTimeMs: null,
        redirectCount: redirectCountFromError(error),
        redirectChain: redirectChainFromError(error),
        networkChecks: [],
        error: errorEvidence
      }
    };
  }
}

function redirectChainFromError(error: unknown): RedirectHop[] {
  if (!isCrawlerError(error)) {
    return [];
  }

  const chain = error.details.redirectChain;
  return Array.isArray(chain) ? (chain as RedirectHop[]) : [];
}

function redirectCountFromError(error: unknown): number {
  return redirectChainFromError(error).length;
}
