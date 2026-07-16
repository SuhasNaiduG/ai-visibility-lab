export type CrawlerErrorCode =
  | "INVALID_URL"
  | "PRIVATE_NETWORK_TARGET"
  | "FETCH_TIMEOUT"
  | "RESPONSE_TOO_LARGE"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "TOO_MANY_REDIRECTS"
  | "UPSTREAM_FETCH_FAILED";

const CRAWLER_ERROR_HTTP_STATUS: Readonly<
  Record<CrawlerErrorCode, number>
> = {
  INVALID_URL: 400,
  PRIVATE_NETWORK_TARGET: 400,
  FETCH_TIMEOUT: 504,
  RESPONSE_TOO_LARGE: 502,
  UNSUPPORTED_CONTENT_TYPE: 502,
  TOO_MANY_REDIRECTS: 502,
  UPSTREAM_FETCH_FAILED: 502
};

export interface CrawlerErrorOptions {
  details?: Readonly<Record<string, unknown>>;
  cause?: unknown;
}

/**
 * A stable error boundary between network acquisition and API presentation.
 * `httpStatus` is safe to map to an API response; `details` contains only
 * serializable crawl evidence and never a stack trace.
 */
export class CrawlerError extends Error {
  readonly code: CrawlerErrorCode;
  readonly httpStatus: number;
  readonly details: Readonly<Record<string, unknown>>;
  override readonly cause?: unknown;

  constructor(
    code: CrawlerErrorCode,
    message: string,
    options: CrawlerErrorOptions = {}
  ) {
    super(message);
    this.name = "CrawlerError";
    this.code = code;
    this.httpStatus = CRAWLER_ERROR_HTTP_STATUS[code];
    this.details = options.details ?? {};
    this.cause = options.cause;
  }
}

export function isCrawlerError(error: unknown): error is CrawlerError {
  return error instanceof CrawlerError;
}

export function getCrawlerErrorHttpStatus(error: unknown): number | null {
  return isCrawlerError(error) ? error.httpStatus : null;
}
