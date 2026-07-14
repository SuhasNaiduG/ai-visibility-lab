import type { CheerioAPI } from "cheerio";
import { normalizeVisibleText } from "./text.js";

export interface LinkItem {
  href: string;
  resolvedUrl: string;
  type: "internal" | "external";
  anchorText: string;
  selector: string;
}

export interface AnchorTextSummary {
  text: string;
  count: number;
  internalCount: number;
  externalCount: number;
  urls: string[];
}

export interface ParsedLinks {
  links: LinkItem[];
  internalLinkCount: number;
  externalLinkCount: number;
  uniqueInternalUrls: string[];
  uniqueInternalUrlCount: number;
  uniqueExternalUrls: string[];
  externalDomains: string[];
  uniqueExternalDomainCount: number;
  anchorTextSummary: AnchorTextSummary[];
  emptyAnchorCount: number;
}

export function extractLinks(
  $: CheerioAPI,
  pageUrl: string
): ParsedLinks {
  const baseUrl = new URL(pageUrl);
  const links: LinkItem[] = [];

  $("a[href]").each((index, element) => {
    const href = $(element).attr("href")?.trim();

    if (!href || href.startsWith("#")) {
      return;
    }

    try {
      const resolved = new URL(href, baseUrl);

      if (!['http:', 'https:'].includes(resolved.protocol)) {
        return;
      }

      resolved.hash = "";
      const type =
        resolved.hostname.toLocaleLowerCase("en-US") ===
        baseUrl.hostname.toLocaleLowerCase("en-US")
          ? "internal"
          : "external";

      links.push({
        href,
        resolvedUrl: resolved.toString(),
        type,
        anchorText: normalizeVisibleText($(element).text()),
        selector: `a[href]:nth-of-type(${index + 1})`
      });
    } catch {
      // Malformed href values are excluded from HTTP relationship metrics.
    }
  });

  const internalLinks = links.filter((link) => link.type === "internal");
  const externalLinks = links.filter((link) => link.type === "external");
  const uniqueInternalUrls = uniqueSorted(
    internalLinks.map((link) => link.resolvedUrl)
  );
  const uniqueExternalUrls = uniqueSorted(
    externalLinks.map((link) => link.resolvedUrl)
  );
  const externalDomains = uniqueSorted(
    externalLinks.map((link) => new URL(link.resolvedUrl).hostname)
  );

  return {
    links,
    internalLinkCount: internalLinks.length,
    externalLinkCount: externalLinks.length,
    uniqueInternalUrls,
    uniqueInternalUrlCount: uniqueInternalUrls.length,
    uniqueExternalUrls,
    externalDomains,
    uniqueExternalDomainCount: externalDomains.length,
    anchorTextSummary: summarizeAnchorText(links),
    emptyAnchorCount: links.filter((link) => !link.anchorText).length
  };
}

function summarizeAnchorText(links: LinkItem[]): AnchorTextSummary[] {
  const summaries = new Map<string, AnchorTextSummary>();

  for (const link of links) {
    if (!link.anchorText) {
      continue;
    }

    const key = link.anchorText.toLocaleLowerCase("en-US");
    const existing = summaries.get(key) ?? {
      text: link.anchorText,
      count: 0,
      internalCount: 0,
      externalCount: 0,
      urls: []
    };

    existing.count += 1;
    existing.internalCount += link.type === "internal" ? 1 : 0;
    existing.externalCount += link.type === "external" ? 1 : 0;

    if (!existing.urls.includes(link.resolvedUrl)) {
      existing.urls.push(link.resolvedUrl);
    }

    summaries.set(key, existing);
  }

  return [...summaries.values()].sort(
    (left, right) =>
      right.count - left.count || left.text.localeCompare(right.text)
  );
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
