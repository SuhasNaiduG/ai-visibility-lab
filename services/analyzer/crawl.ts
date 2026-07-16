import { loadCrawlDiscovery, type CrawlDiscovery } from "../../packages/crawler/discovery.js";
import { crawlResearchProject, type CrawlProjectInput, type CrawlResearchProject } from "../../packages/crawler/site-crawl.js";
import { normalizeUrl } from "../../packages/crawler/url.js";
import { analyzeUrl, type AnalysisOptions, type AnalysisResult } from "./analyze.js";

export interface CrawlServiceDependencies {
  analyze?: (url: string) => Promise<AnalysisResult>;
  discover?: (url: string) => Promise<CrawlDiscovery>;
  sleep?: (milliseconds: number) => Promise<void>;
}

export async function crawlSiteProject(
  input: Omit<CrawlProjectInput, "robotsTxt" | "sitemapUrls">,
  dependencies: CrawlServiceDependencies = {},
  options: AnalysisOptions = {}
): Promise<CrawlResearchProject> {
  const normalized = normalizeUrl(input.targetUrl).toString();
  const discovery = await (dependencies.discover?.(normalized) ?? loadCrawlDiscovery(normalized, options));
  const project = await crawlResearchProject({
    ...input,
    robotsTxt: discovery.robotsTxt,
    sitemapUrls: discovery.sitemapUrls
  }, {
    analyze: dependencies.analyze ?? ((url) => analyzeUrl(url, options)),
    ...(dependencies.sleep ? { sleep: dependencies.sleep } : {})
  });
  return {
    ...project,
    limitations: [
      ...project.limitations,
      ...(discovery.errors.length > 0
        ? [`${discovery.errors.length} robots/sitemap discovery resource(s) failed; link discovery continued with partial evidence.`]
        : [])
    ]
  };
}
