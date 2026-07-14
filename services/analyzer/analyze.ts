import {
  checkSiteResources,
  type SiteResources
} from "../../packages/crawler/resources.js";
import {
  fetchHtml,
  type FetchOptions
} from "../../packages/crawler/fetch.js";
import { normalizeUrl } from "../../packages/crawler/url.js";
import {
  parsePage,
  type ParsedPage
} from "../../packages/parser/page.js";

export interface AnalysisResult extends ParsedPage {
  requestedUrl: string;
  statusCode: number;
  finalUrl: string;
  responseTimeMs: number;
  fetchedAt: string;
  robotsTxtAvailable: boolean;
  robotsTxtStatusCode: number | null;
  sitemapXmlAvailable: boolean;
  sitemapXmlStatusCode: number | null;
}

export async function analyzeUrl(
  input: string,
  fetchOptions: FetchOptions = {}
): Promise<AnalysisResult> {
  const normalizedUrl = normalizeUrl(input);
  const fetched = await fetchHtml(normalizedUrl, fetchOptions);

  const [parsed, resources] = await Promise.all([
    Promise.resolve(parsePage(fetched.html, fetched.finalUrl)),
    checkSiteResources(fetched.finalUrl)
  ]);

  return createAnalysisResult(
    normalizedUrl,
    fetched,
    parsed,
    resources
  );
}

function createAnalysisResult(
  requestedUrl: URL,
  fetched: Awaited<ReturnType<typeof fetchHtml>>,
  parsed: ParsedPage,
  resources: SiteResources
): AnalysisResult {
  return {
    requestedUrl: requestedUrl.toString(),
    statusCode: fetched.statusCode,
    finalUrl: fetched.finalUrl,
    responseTimeMs: fetched.responseTimeMs,
    fetchedAt: fetched.fetchedAt,
    ...parsed,
    robotsTxtAvailable: resources.robotsTxt.available,
    robotsTxtStatusCode: resources.robotsTxt.statusCode,
    sitemapXmlAvailable: resources.sitemapXml.available,
    sitemapXmlStatusCode: resources.sitemapXml.statusCode
  };
}
