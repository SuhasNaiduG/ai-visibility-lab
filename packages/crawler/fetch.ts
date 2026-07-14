import { CrawlerError } from "./errors.js";
import {
  requestWithPolicy,
  type CrawlerRequestOptions,
  type RedirectHop
} from "./request.js";
import type { UrlSafetyEvidence } from "./safety.js";

export const DEFAULT_MAX_HTML_BYTES = 2_000_000;

export interface FetchResult {
  statusCode: number;
  finalUrl: string;
  html: string;
  responseTimeMs: number;
  fetchedAt: string;
  redirectCount: number;
  redirectChain: RedirectHop[];
  networkChecks: UrlSafetyEvidence[];
}

export interface FetchOptions extends CrawlerRequestOptions {
  maxHtmlBytes?: number;
}

export async function fetchHtml(
  url: URL,
  options: FetchOptions = {}
): Promise<FetchResult> {
  const maxHtmlBytes = options.maxHtmlBytes ?? DEFAULT_MAX_HTML_BYTES;

  if (!Number.isSafeInteger(maxHtmlBytes) || maxHtmlBytes <= 0) {
    throw new TypeError("maxHtmlBytes must be a positive integer");
  }

  const result = await requestWithPolicy(
    url,
    options,
    (response, context) => readBoundedHtml(response, maxHtmlBytes, context)
  );

  return {
    statusCode: result.statusCode,
    finalUrl: result.finalUrl,
    html: result.value,
    responseTimeMs: result.responseTimeMs,
    fetchedAt: result.fetchedAt,
    redirectCount: result.redirectCount,
    redirectChain: result.redirectChain,
    networkChecks: result.networkChecks
  };
}

async function readBoundedHtml(
  response: Response,
  maxHtmlBytes: number,
  context: {
    finalUrl: string;
    redirectChain: readonly RedirectHop[];
  }
): Promise<string> {
  const contentLengthHeader = response.headers.get("content-length");
  const contentLength = contentLengthHeader === null
    ? null
    : Number.parseInt(contentLengthHeader, 10);

  if (
    contentLength !== null &&
    Number.isFinite(contentLength) &&
    contentLength > maxHtmlBytes
  ) {
    await cancelResponseBody(response);
    throw responseTooLargeError(maxHtmlBytes, context, {
      contentLength
    });
  }

  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let receivedBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      receivedBytes += value.byteLength;

      if (receivedBytes > maxHtmlBytes) {
        await reader.cancel();
        throw responseTooLargeError(maxHtmlBytes, context, {
          receivedBytes
        });
      }

      parts.push(decoder.decode(value, { stream: true }));
    }

    parts.push(decoder.decode());
    return parts.join("");
  } finally {
    reader.releaseLock();
  }
}

async function cancelResponseBody(response: Response): Promise<void> {
  if (!response.body) {
    return;
  }

  try {
    await response.body.cancel();
  } catch {
    // The size violation has already been captured as the primary error.
  }
}

function responseTooLargeError(
  maxHtmlBytes: number,
  context: {
    finalUrl: string;
    redirectChain: readonly RedirectHop[];
  },
  sizeEvidence: Readonly<Record<string, number>>
): CrawlerError {
  return new CrawlerError(
    "RESPONSE_TOO_LARGE",
    `HTML response exceeded the ${maxHtmlBytes} byte limit`,
    {
      details: {
        finalUrl: context.finalUrl,
        maxHtmlBytes,
        ...sizeEvidence,
        redirectChain: [...context.redirectChain]
      }
    }
  );
}
