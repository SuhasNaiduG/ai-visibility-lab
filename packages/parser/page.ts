import * as cheerio from "cheerio";
export interface HeadingItem {
  level: number;
  text: string;
}

export interface ParsedPage {
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  robotsMeta: string | null;
  h1Count: number;
  h1Text: string[];
  headingHierarchy: HeadingItem[];
  jsonLdBlocks: unknown[];
  schemaTypes: string[];
  internalLinkCount: number;
  externalLinkCount: number;
}
export function parsePage(html: string, pageUrl: string): ParsedPage {
  const $ = cheerio.load(html);
  const baseUrl = new URL(pageUrl);

  const title = $("title").first().text().trim() || null;

  const metaDescription =
    $('meta[name="description"]').first().attr("content")?.trim() || null;

  const canonicalUrl =
    $('link[rel="canonical"]').first().attr("href")?.trim() || null;

  const robotsMeta =
    $('meta[name="robots"]').first().attr("content")?.trim() || null;

  const h1Text = $("h1")
    .map((_, element) => $(element).text().trim())
    .get()
    .filter(Boolean);

  const headingHierarchy: HeadingItem[] = $(
    "h1, h2, h3, h4, h5, h6"
  )
    .map((_, element) => ({
      level: Number(element.tagName.slice(1)),
      text: $(element).text().trim()
    }))
    .get()
    .filter((heading) => heading.text.length > 0);

  const jsonLdBlocks: unknown[] = [];
  const schemaTypes = new Set<string>();

  $('script[type="application/ld+json"]').each((_, element) => {
    const rawJson = $(element).html()?.trim();

    if (!rawJson) {
      return;
    }

    try {
      const parsed: unknown = JSON.parse(rawJson);
      jsonLdBlocks.push(parsed);
      collectSchemaTypes(parsed, schemaTypes);
    } catch {
      // Invalid JSON-LD is ignored here and can become a rule finding later.
    }
  });

  let internalLinkCount = 0;
  let externalLinkCount = 0;

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href")?.trim();

    if (!href || href.startsWith("#")) {
      return;
    }

    try {
      const linkUrl = new URL(href, baseUrl);

      if (!["http:", "https:"].includes(linkUrl.protocol)) {
        return;
      }

      if (linkUrl.hostname === baseUrl.hostname) {
        internalLinkCount += 1;
      } else {
        externalLinkCount += 1;
      }
    } catch {
      // Malformed links are ignored here and can be reported by a later rule.
    }
  });

  return {
    title,
    metaDescription,
    canonicalUrl,
    robotsMeta,
    h1Count: h1Text.length,
    h1Text,
    headingHierarchy,
    jsonLdBlocks,
    schemaTypes: [...schemaTypes],
    internalLinkCount,
    externalLinkCount
  };
}

function collectSchemaTypes(
  value: unknown,
  schemaTypes: Set<string>
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectSchemaTypes(item, schemaTypes);
    }

    return;
  }

  if (typeof value !== "object" || value === null) {
    return;
  }

  const record = value as Record<string, unknown>;
  const type = record["@type"];

  if (typeof type === "string") {
    schemaTypes.add(type);
  } else if (Array.isArray(type)) {
    for (const item of type) {
      if (typeof item === "string") {
        schemaTypes.add(item);
      }
    }
  }

  for (const child of Object.values(record)) {
    collectSchemaTypes(child, schemaTypes);
  }
}