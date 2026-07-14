export interface FetchResult {
  statusCode: number;
  finalUrl: string;
  html: string;
  responseTimeMs: number;
  fetchedAt: string;
}

export interface FetchOptions {
  timeoutMs?: number;
}

export async function fetchHtml(
  url: URL,
  options: FetchOptions = {}
): Promise<FetchResult> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();

  try {
    const response = await fetch(url.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "AI-Visibility-Lab/0.1"
      }
    });

    const html = await response.text();

    return {
      statusCode: response.status,
      finalUrl: response.url,
      html,
      responseTimeMs: Math.round(performance.now() - start),
      fetchedAt: new Date().toISOString()
    };
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError")
    ) {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}