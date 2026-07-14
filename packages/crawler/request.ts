import { CrawlerError, isCrawlerError } from "./errors.js";
import {
  assertPublicHttpUrl,
  type DnsLookup,
  type UrlSafetyEvidence
} from "./safety.js";

export const DEFAULT_CRAWLER_USER_AGENT = "AI-Visibility-Lab/1.0";
export const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
export const DEFAULT_MAX_REDIRECTS = 5;

export type FetchImplementation = (
  input: string,
  init: RequestInit
) => Promise<Response>;

export interface CrawlerRequestOptions {
  timeoutMs?: number;
  maxRedirects?: number;
  userAgent?: string;
  fetchImpl?: FetchImplementation;
  dnsLookup?: DnsLookup;
}

export interface RedirectHop {
  statusCode: number;
  fromUrl: string;
  toUrl: string;
  location: string;
}

export interface ResponseContext {
  requestedUrl: string;
  finalUrl: string;
  redirectChain: readonly RedirectHop[];
  networkChecks: readonly UrlSafetyEvidence[];
}

export interface PolicyRequestResult<T> {
  statusCode: number;
  finalUrl: string;
  responseTimeMs: number;
  fetchedAt: string;
  redirectCount: number;
  redirectChain: RedirectHop[];
  networkChecks: UrlSafetyEvidence[];
  value: T;
}

const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

/**
 * Runs all crawler requests through one policy boundary. The response consumer
 * executes inside the same timeout, so a stalled body cannot evade the limit.
 */
export async function requestWithPolicy<T>(
  initialUrl: URL,
  options: CrawlerRequestOptions,
  consumeResponse: (
    response: Response,
    context: ResponseContext
  ) => Promise<T>
): Promise<PolicyRequestResult<T>> {
  const timeoutMs = positiveInteger(
    options.timeoutMs,
    DEFAULT_REQUEST_TIMEOUT_MS,
    "timeoutMs"
  );
  const maxRedirects = nonNegativeInteger(
    options.maxRedirects,
    DEFAULT_MAX_REDIRECTS,
    "maxRedirects"
  );
  const userAgent = options.userAgent?.trim() || DEFAULT_CRAWLER_USER_AGENT;
  const fetchImpl: FetchImplementation =
    options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  const requestedUrl = initialUrl.toString();
  const redirectChain: RedirectHop[] = [];
  const networkChecks: UrlSafetyEvidence[] = [];
  const controller = new AbortController();
  const start = performance.now();
  let currentUrl = new URL(initialUrl);

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(createTimeoutError(timeoutMs, requestedUrl, currentUrl, redirectChain));
    }, timeoutMs);
  });

  const requestPromise = performRequest();

  try {
    return await Promise.race([requestPromise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }

  async function performRequest(): Promise<PolicyRequestResult<T>> {
    try {
      while (true) {
        const safetyEvidence = await assertPublicHttpUrl(currentUrl, {
          dnsLookup: options.dnsLookup
        });
        networkChecks.push(safetyEvidence);

        const response = await fetchImpl(currentUrl.toString(), {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "User-Agent": userAgent
          }
        });

        const location = response.headers.get("location");

        if (REDIRECT_STATUS_CODES.has(response.status) && location) {
          const nextUrl = resolveRedirectUrl(location, currentUrl);

          // Validate before applying the redirect limit so unsafe Location
          // values are never hidden by a redirect-count error.
          const nextSafetyEvidence = await validateRedirectTarget(
            nextUrl,
            options.dnsLookup
          );
          const hop: RedirectHop = {
            statusCode: response.status,
            fromUrl: currentUrl.toString(),
            toUrl: nextUrl.toString(),
            location
          };

          await cancelBody(response);

          if (redirectChain.length >= maxRedirects) {
            throw new CrawlerError(
              "TOO_MANY_REDIRECTS",
              `Request exceeded the maximum of ${maxRedirects} redirects`,
              {
                details: {
                  requestedUrl,
                  maxRedirects,
                  redirectChain: [...redirectChain, hop]
                }
              }
            );
          }

          redirectChain.push(hop);
          networkChecks.push(nextSafetyEvidence);
          currentUrl = nextUrl;
          continue;
        }

        const finalUrl = currentUrl.toString();
        const context: ResponseContext = {
          requestedUrl,
          finalUrl,
          redirectChain,
          networkChecks
        };
        const value = await consumeResponse(response, context);

        return {
          statusCode: response.status,
          finalUrl,
          responseTimeMs: Math.max(0, Math.round(performance.now() - start)),
          fetchedAt: new Date().toISOString(),
          redirectCount: redirectChain.length,
          redirectChain: [...redirectChain],
          networkChecks: deduplicateNetworkChecks(networkChecks),
          value
        };
      }
    } catch (error: unknown) {
      if (isCrawlerError(error)) {
        throw error;
      }

      if (controller.signal.aborted || isAbortError(error)) {
        throw createTimeoutError(
          timeoutMs,
          requestedUrl,
          currentUrl,
          redirectChain,
          error
        );
      }

      throw new CrawlerError(
        "UPSTREAM_FETCH_FAILED",
        "Website request failed",
        {
          details: {
            requestedUrl,
            url: currentUrl.toString(),
            redirectChain: [...redirectChain]
          },
          cause: error
        }
      );
    }
  }
}

async function validateRedirectTarget(
  url: URL,
  dnsLookup: DnsLookup | undefined
): Promise<UrlSafetyEvidence> {
  try {
    return await assertPublicHttpUrl(url, { dnsLookup });
  } catch (error: unknown) {
    if (isCrawlerError(error) && error.code === "INVALID_URL") {
      throw new CrawlerError(
        "UPSTREAM_FETCH_FAILED",
        "Upstream response contained an invalid redirect URL",
        {
          details: {
            redirectUrl: url.toString(),
            reason: error.message
          },
          cause: error
        }
      );
    }

    throw error;
  }
}

function resolveRedirectUrl(location: string, currentUrl: URL): URL {
  try {
    return new URL(location, currentUrl);
  } catch (cause: unknown) {
    throw new CrawlerError(
      "UPSTREAM_FETCH_FAILED",
      "Upstream response contained an invalid redirect URL",
      {
        details: {
          fromUrl: currentUrl.toString(),
          location
        },
        cause
      }
    );
  }
}

async function cancelBody(response: Response): Promise<void> {
  if (!response.body) {
    return;
  }

  try {
    await response.body.cancel();
  } catch {
    // Cancellation is best-effort once the redirect metadata is captured.
  }
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

function createTimeoutError(
  timeoutMs: number,
  requestedUrl: string,
  currentUrl: URL,
  redirectChain: readonly RedirectHop[],
  cause?: unknown
): CrawlerError {
  return new CrawlerError(
    "FETCH_TIMEOUT",
    `Request timed out after ${timeoutMs}ms`,
    {
      details: {
        requestedUrl,
        url: currentUrl.toString(),
        timeoutMs,
        redirectChain: [...redirectChain]
      },
      cause
    }
  );
}

function positiveInteger(
  value: number | undefined,
  fallback: number,
  name: string
): number {
  const resolved = value ?? fallback;

  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }

  return resolved;
}

function nonNegativeInteger(
  value: number | undefined,
  fallback: number,
  name: string
): number {
  const resolved = value ?? fallback;

  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw new TypeError(`${name} must be a non-negative integer`);
  }

  return resolved;
}

function deduplicateNetworkChecks(
  checks: readonly UrlSafetyEvidence[]
): UrlSafetyEvidence[] {
  const seen = new Set<string>();

  return checks.filter((check) => {
    if (seen.has(check.url)) {
      return false;
    }

    seen.add(check.url);
    return true;
  });
}
