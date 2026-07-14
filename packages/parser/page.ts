import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { extractCoverage } from "../entities/extract.js";
import type { CoverageMetrics } from "../entities/types.js";
import {
  extractLinks,
  type AnchorTextSummary,
  type LinkItem
} from "./links.js";
import {
  countWords,
  extractQuestions,
  extractVisibleText,
  normalizeVisibleText,
  splitSentences
} from "./text.js";

export interface HeadingItem {
  level: number;
  text: string;
}

export interface HeadingLevelJump {
  fromIndex: number;
  toIndex: number;
  fromLevel: number;
  toLevel: number;
  fromText: string;
  toText: string;
}

export interface RepeatedHeading {
  text: string;
  count: number;
  levels: number[];
}

export interface IndexabilityInterpretation {
  status: "explicit-noindex" | "explicit-index" | "not-specified";
  isIndexable: boolean;
  reason: string;
}

export interface TextIndicator {
  text: string;
  field: string;
  selector?: string;
  heuristic: boolean;
}

export interface DirectAnswer {
  question: string;
  answer: string;
  questionSelector: string;
  answerSelector: string;
  source: "html" | "json-ld";
}

export interface JsonLdParseError {
  scriptIndex: number;
  selector: string;
  raw: string;
  message: string;
}

export interface ImageItem {
  src: string | null;
  resolvedUrl: string | null;
  alt: string | null;
  selector: string;
}

export interface ImageAltIssue extends ImageItem {
  reason: "missing-attribute" | "empty-value";
}

export interface ParsedPage {
  title: string | null;
  titleLength: number;
  metaDescription: string | null;
  metaDescriptionLength: number;
  canonicalUrl: string | null;
  canonicalResolvedUrl: string | null;
  canonicalStatus: "match" | "mismatch" | "missing" | "invalid";
  canonicalError: string | null;
  canonicalCount: number;
  robotsMeta: string | null;
  robotsDirectives: string[];
  indexability: IndexabilityInterpretation;
  documentLanguage: string | null;
  viewportPresent: boolean;
  viewportContent: string | null;
  h1Count: number;
  h1Text: string[];
  headingHierarchy: HeadingItem[];
  totalHeadingCount: number;
  headingLevelJumps: HeadingLevelJump[];
  emptyHeadingCount: number;
  repeatedHeadings: RepeatedHeading[];
  visibleText: string;
  wordCount: number;
  sentenceCount: number;
  questionCount: number;
  detectedQuestions: string[];
  faqIndicators: TextIndicator[];
  breadcrumbIndicators: TextIndicator[];
  directAnswerCount: number;
  directAnswers: DirectAnswer[];
  jsonLdBlocks: unknown[];
  jsonLdRawBlocks: string[];
  jsonLdParseErrors: JsonLdParseError[];
  schemaTypes: string[];
  openGraph: Record<string, string>;
  twitterCards: Record<string, string>;
  imageCount: number;
  images: ImageItem[];
  imagesMissingAlt: number;
  imageAltIssues: ImageAltIssue[];
  internalLinkCount: number;
  externalLinkCount: number;
  links: LinkItem[];
  uniqueInternalUrls: string[];
  uniqueInternalUrlCount: number;
  uniqueExternalUrls: string[];
  externalDomains: string[];
  uniqueExternalDomainCount: number;
  anchorTextSummary: AnchorTextSummary[];
  emptyAnchorCount: number;
  coverage: CoverageMetrics;
}

export function parsePage(html: string, pageUrl: string): ParsedPage {
  const $ = cheerio.load(html);
  const title = normalizeOptional($("title").first().text());
  const metaDescription = firstNamedMetaContent($, "description");
  const robotsMetaValues = namedMetaContents($, ["robots", "googlebot"]);
  const robotsMeta = firstNamedMetaContent($, "robots");
  const robotsDirectives = uniqueStrings(
    robotsMetaValues.flatMap((content) =>
      content
        .split(/[;,]/u)
        .map((directive) => directive.trim().toLocaleLowerCase("en-US"))
        .filter(Boolean)
    )
  );
  const indexability = interpretIndexability(robotsDirectives);
  const canonical = parseCanonical($, pageUrl);
  const documentLanguage =
    normalizeOptional($("html").first().attr("lang")) ?? null;
  const viewportContent = firstNamedMetaContent($, "viewport");
  const viewportPresent = hasNamedMeta($, "viewport");

  const headingElements = $("h1, h2, h3, h4, h5, h6").toArray();
  const headingHierarchy: HeadingItem[] = headingElements.map((element) => ({
    level: Number(element.tagName.slice(1)),
    text: normalizeVisibleText($(element).text())
  }));
  const headingSelectors = headingElements.map((element) => {
    const tagName = element.tagName.toLocaleLowerCase("en-US");
    return `${tagName}:nth-of-type(${$(element).prevAll(tagName).length + 1})`;
  });
  const h1Elements = $("h1").toArray();
  const h1Text = h1Elements.map((element) =>
    normalizeVisibleText($(element).text())
  );
  const headingLevelJumps = findHeadingLevelJumps(headingHierarchy);
  const repeatedHeadings = findRepeatedHeadings(headingHierarchy);

  const jsonLdBlocks: unknown[] = [];
  const jsonLdRawBlocks: string[] = [];
  const jsonLdParseErrors: JsonLdParseError[] = [];
  const schemaTypes = new Set<string>();

  $('script[type="application/ld+json"]').each((scriptIndex, element) => {
    const raw = $(element).html()?.trim() ?? "";
    const selector =
      `script[type="application/ld+json"]:nth-of-type(${scriptIndex + 1})`;

    jsonLdRawBlocks.push(raw);

    if (!raw) {
      jsonLdParseErrors.push({
        scriptIndex,
        selector,
        raw,
        message: "JSON-LD block is empty"
      });
      return;
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      jsonLdBlocks.push(parsed);
      collectSchemaTypes(parsed, schemaTypes);
    } catch (error: unknown) {
      jsonLdParseErrors.push({
        scriptIndex,
        selector,
        raw,
        message:
          error instanceof Error ? error.message : "Invalid JSON-LD syntax"
      });
    }
  });

  const openGraph: Record<string, string> = {};
  const twitterCards: Record<string, string> = {};

  $("meta").each((_, element) => {
    const key = (
      $(element).attr("property") ?? $(element).attr("name") ?? ""
    )
      .trim()
      .toLocaleLowerCase("en-US");
    const content = normalizeOptional($(element).attr("content"));

    if (!content) {
      return;
    }

    if (key.startsWith("og:") && openGraph[key] === undefined) {
      openGraph[key] = content;
    } else if (
      key.startsWith("twitter:") &&
      twitterCards[key] === undefined
    ) {
      twitterCards[key] = content;
    }
  });

  const visibleText = extractVisibleText($);
  const sentenceCount = splitSentences(visibleText).length;
  const faqIndicators = extractFaqIndicators(
    headingHierarchy,
    headingSelectors,
    [...schemaTypes]
  );
  const breadcrumbIndicators = extractBreadcrumbIndicators($);
  const htmlDirectAnswers = extractHtmlDirectAnswers(
    $,
    headingElements,
    headingSelectors
  );
  const jsonLdDirectAnswers = extractJsonLdDirectAnswers(jsonLdBlocks);
  const directAnswers = dedupeDirectAnswers([
    ...htmlDirectAnswers,
    ...jsonLdDirectAnswers
  ]);
  const detectedQuestions = uniqueCaseInsensitive([
    ...headingHierarchy
      .map((heading) => heading.text)
      .filter((text) => text.endsWith("?")),
    ...extractQuestions(visibleText),
    ...directAnswers.map((answer) => answer.question)
  ]);

  const images: ImageItem[] = [];
  const imageAltIssues: ImageAltIssue[] = [];

  $("img").each((index, element) => {
    const src = normalizeOptional($(element).attr("src"));
    const altAttribute = $(element).attr("alt");
    const alt = altAttribute === undefined ? null : normalizeVisibleText(altAttribute);
    const selector = `img:nth-of-type(${index + 1})`;
    const image: ImageItem = {
      src,
      resolvedUrl: resolveHttpUrl(src, pageUrl),
      alt,
      selector
    };

    images.push(image);

    if (altAttribute === undefined) {
      imageAltIssues.push({
        ...image,
        reason: "missing-attribute"
      });
    } else if (!alt) {
      imageAltIssues.push({
        ...image,
        reason: "empty-value"
      });
    }
  });

  const parsedLinks = extractLinks($, pageUrl);
  const coverageSources = [
    ...(title
      ? [{ field: "title", text: title, selector: "title" }]
      : []),
    ...(metaDescription
      ? [
          {
            field: "metaDescription",
            text: metaDescription,
            selector: 'meta[name="description"]'
          }
        ]
      : []),
    ...headingHierarchy
      .map((heading, index) => ({
        field: `headingHierarchy[${index}]`,
        text: heading.text,
        selector: headingSelectors[index]
      }))
      .filter((source) => source.text),
    ...(visibleText
      ? [{ field: "visibleText", text: visibleText, selector: "body" }]
      : []),
    ...(openGraph["og:site_name"]
      ? [
          {
            field: "openGraph.og:site_name",
            text: openGraph["og:site_name"],
            selector: 'meta[property="og:site_name"]'
          }
        ]
      : [])
  ];
  const coverageLinks = $("a[href]")
    .toArray()
    .map((element, index) => ({
      href: $(element).attr("href")?.trim() ?? "",
      anchorText: normalizeVisibleText($(element).text()),
      selector: `a[href]:nth-of-type(${index + 1})`
    }))
    .filter((link) => link.href);
  const coverage = extractCoverage({
    pageUrl,
    sources: coverageSources,
    jsonLdBlocks,
    links: coverageLinks
  });

  return {
    title,
    titleLength: title?.length ?? 0,
    metaDescription,
    metaDescriptionLength: metaDescription?.length ?? 0,
    ...canonical,
    robotsMeta,
    robotsDirectives,
    indexability,
    documentLanguage,
    viewportPresent,
    viewportContent,
    h1Count: h1Elements.length,
    h1Text,
    headingHierarchy,
    totalHeadingCount: headingHierarchy.length,
    headingLevelJumps,
    emptyHeadingCount: headingHierarchy.filter((heading) => !heading.text)
      .length,
    repeatedHeadings,
    visibleText,
    wordCount: countWords(visibleText),
    sentenceCount,
    questionCount: detectedQuestions.length,
    detectedQuestions,
    faqIndicators,
    breadcrumbIndicators,
    directAnswerCount: directAnswers.length,
    directAnswers,
    jsonLdBlocks,
    jsonLdRawBlocks,
    jsonLdParseErrors,
    schemaTypes: [...schemaTypes],
    openGraph,
    twitterCards,
    imageCount: images.length,
    images,
    imagesMissingAlt: imageAltIssues.length,
    imageAltIssues,
    ...parsedLinks,
    coverage
  };
}

function parseCanonical(
  $: cheerio.CheerioAPI,
  pageUrl: string
): Pick<
  ParsedPage,
  | "canonicalUrl"
  | "canonicalResolvedUrl"
  | "canonicalStatus"
  | "canonicalError"
  | "canonicalCount"
> {
  const canonicalElements = $("link[rel]").filter((_, element) =>
    ($(element).attr("rel") ?? "")
      .split(/\s+/u)
      .some((token) => token.toLocaleLowerCase("en-US") === "canonical")
  );
  const canonicalCount = canonicalElements.length;

  if (canonicalCount === 0) {
    return {
      canonicalUrl: null,
      canonicalResolvedUrl: null,
      canonicalStatus: "missing",
      canonicalError: null,
      canonicalCount
    };
  }

  const canonicalUrl =
    canonicalElements.first().attr("href")?.trim() ?? "";

  if (!canonicalUrl) {
    return {
      canonicalUrl,
      canonicalResolvedUrl: null,
      canonicalStatus: "invalid",
      canonicalError: "Canonical href is empty",
      canonicalCount
    };
  }

  try {
    const canonicalResolved = new URL(canonicalUrl, pageUrl);

    if (!['http:', 'https:'].includes(canonicalResolved.protocol)) {
      return {
        canonicalUrl,
        canonicalResolvedUrl: canonicalResolved.toString(),
        canonicalStatus: "invalid",
        canonicalError: `Unsupported canonical protocol: ${canonicalResolved.protocol}`,
        canonicalCount
      };
    }

    canonicalResolved.hash = "";
    const finalComparable = new URL(pageUrl);
    finalComparable.hash = "";
    const canonicalResolvedUrl = canonicalResolved.toString();

    return {
      canonicalUrl,
      canonicalResolvedUrl,
      canonicalStatus:
        canonicalResolvedUrl === finalComparable.toString()
          ? "match"
          : "mismatch",
      canonicalError: null,
      canonicalCount
    };
  } catch (error: unknown) {
    return {
      canonicalUrl,
      canonicalResolvedUrl: null,
      canonicalStatus: "invalid",
      canonicalError:
        error instanceof Error ? error.message : "Malformed canonical URL",
      canonicalCount
    };
  }
}

function findHeadingLevelJumps(
  headings: HeadingItem[]
): HeadingLevelJump[] {
  const jumps: HeadingLevelJump[] = [];

  for (let index = 1; index < headings.length; index += 1) {
    const previous = headings[index - 1];
    const current = headings[index];

    if (previous && current && current.level > previous.level + 1) {
      jumps.push({
        fromIndex: index - 1,
        toIndex: index,
        fromLevel: previous.level,
        toLevel: current.level,
        fromText: previous.text,
        toText: current.text
      });
    }
  }

  return jumps;
}

function findRepeatedHeadings(
  headings: HeadingItem[]
): RepeatedHeading[] {
  const groups = new Map<string, RepeatedHeading>();

  for (const heading of headings) {
    const key = heading.text.toLocaleLowerCase("en-US");

    if (!key) {
      continue;
    }

    const group = groups.get(key) ?? {
      text: heading.text,
      count: 0,
      levels: []
    };
    group.count += 1;
    group.levels.push(heading.level);
    groups.set(key, group);
  }

  return [...groups.values()].filter((group) => group.count > 1);
}

function interpretIndexability(
  directives: string[]
): IndexabilityInterpretation {
  if (directives.includes("noindex") || directives.includes("none")) {
    return {
      status: "explicit-noindex",
      isIndexable: false,
      reason: "A robots meta directive explicitly contains noindex or none."
    };
  }

  if (directives.includes("index") || directives.includes("all")) {
    return {
      status: "explicit-index",
      isIndexable: true,
      reason:
        "A robots meta directive explicitly permits indexing; other crawl controls may still apply."
    };
  }

  return {
    status: "not-specified",
    isIndexable: true,
    reason:
      "No meta noindex directive was observed; HTTP headers and external controls were not inferred."
  };
}

function extractFaqIndicators(
  headings: HeadingItem[],
  selectors: string[],
  schemaTypes: string[]
): TextIndicator[] {
  const indicators: TextIndicator[] = [];
  const faqPattern =
    /\b(?:faq|frequently asked questions|questions? (?:and|&) answers?|common questions)\b/i;

  headings.forEach((heading, index) => {
    if (faqPattern.test(heading.text)) {
      indicators.push({
        text: heading.text,
        field: `headingHierarchy[${index}]`,
        selector: selectors[index],
        heuristic: false
      });
    }
  });

  if (
    schemaTypes.some(
      (type) => type.toLocaleLowerCase("en-US") === "faqpage"
    )
  ) {
    indicators.push({
      text: "FAQPage",
      field: "schemaTypes",
      selector: 'script[type="application/ld+json"]',
      heuristic: false
    });
  }

  return indicators;
}

function extractBreadcrumbIndicators(
  $: cheerio.CheerioAPI
): TextIndicator[] {
  const indicators: TextIndicator[] = [];

  $("nav[aria-label], [role='navigation'][aria-label], .breadcrumb, .breadcrumbs")
    .each((index, element) => {
      const ariaLabel = normalizeVisibleText($(element).attr("aria-label") ?? "");
      const classes = ($(element).attr("class") ?? "")
        .split(/\s+/u)
        .map((value) => value.toLocaleLowerCase("en-US"));
      const explicit = /breadcrumb/i.test(ariaLabel) ||
        classes.includes("breadcrumb") ||
        classes.includes("breadcrumbs");
      const text = normalizeVisibleText($(element).text());

      if (explicit && text) {
        indicators.push({
          text,
          field: `breadcrumbIndicators[${indicators.length}]`,
          selector: `${element.tagName}:nth-of-type(${index + 1})`,
          heuristic: false
        });
      }
    });

  return indicators;
}

function extractHtmlDirectAnswers(
  $: cheerio.CheerioAPI,
  headingElements: AnyNode[],
  selectors: string[]
): DirectAnswer[] {
  const answers: DirectAnswer[] = [];

  headingElements.forEach((element, index) => {
    const question = normalizeVisibleText($(element).text());

    if (!question.endsWith("?")) {
      return;
    }

    let sibling = $(element).next();

    while (sibling.length > 0 && !sibling.is("h1, h2, h3, h4, h5, h6")) {
      const paragraph = sibling.is("p")
        ? sibling
        : sibling.find("p").first();
      const answer = normalizeVisibleText(paragraph.text());

      if (answer) {
        answers.push({
          question,
          answer,
          questionSelector: selectors[index] ?? "h1, h2, h3, h4, h5, h6",
          answerSelector: paragraph.is("p") ? "p" : `${sibling.prop("tagName") ?? "*"} p`,
          source: "html"
        });
        return;
      }

      sibling = sibling.next();
    }
  });

  return answers;
}

function extractJsonLdDirectAnswers(blocks: unknown[]): DirectAnswer[] {
  const answers: DirectAnswer[] = [];

  blocks.forEach((block, blockIndex) => {
    visitJson(block, (record, path) => {
      const types = toStringArray(record["@type"])
        .map((type) => type.toLocaleLowerCase("en-US"));

      if (!types.includes("question")) {
        return;
      }

      const question = firstString(record.name, record.text);
      const acceptedAnswer = record.acceptedAnswer;
      const answer = isRecord(acceptedAnswer)
        ? firstString(acceptedAnswer.text, acceptedAnswer.name)
        : null;

      if (question && answer) {
        answers.push({
          question: normalizeVisibleText(question),
          answer: normalizeVisibleText(answer),
          questionSelector:
            `script[type="application/ld+json"]:nth-of-type(${blockIndex + 1}) ${path}`,
          answerSelector:
            `script[type="application/ld+json"]:nth-of-type(${blockIndex + 1}) ${path}.acceptedAnswer`,
          source: "json-ld"
        });
      }
    });
  });

  return answers;
}

function dedupeDirectAnswers(answers: DirectAnswer[]): DirectAnswer[] {
  const seen = new Set<string>();

  return answers.filter((answer) => {
    const key = `${answer.question}\u0000${answer.answer}`.toLocaleLowerCase(
      "en-US"
    );

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function visitJson(
  value: unknown,
  visitor: (record: Record<string, unknown>, path: string) => void,
  path = "$"
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitJson(item, visitor, `${path}[${index}]`));
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  visitor(value, path);

  for (const [key, child] of Object.entries(value)) {
    visitJson(child, visitor, `${path}.${key}`);
  }
}

function collectSchemaTypes(value: unknown, schemaTypes: Set<string>): void {
  visitJson(value, (record) => {
    for (const type of toStringArray(record["@type"])) {
      schemaTypes.add(type);
    }
  });
}

function firstNamedMetaContent(
  $: cheerio.CheerioAPI,
  requestedName: string
): string | null {
  return namedMetaContents($, [requestedName])[0] ?? null;
}

function namedMetaContents(
  $: cheerio.CheerioAPI,
  requestedNames: string[]
): string[] {
  const names = new Set(
    requestedNames.map((name) => name.toLocaleLowerCase("en-US"))
  );

  return $("meta[name]")
    .toArray()
    .filter((element) =>
      names.has(
        ($(element).attr("name") ?? "").toLocaleLowerCase("en-US")
      )
    )
    .map((element) => normalizeOptional($(element).attr("content")))
    .filter((content): content is string => content !== null);
}

function hasNamedMeta(
  $: cheerio.CheerioAPI,
  requestedName: string
): boolean {
  const lowerName = requestedName.toLocaleLowerCase("en-US");
  return $("meta[name]")
    .toArray()
    .some(
      (element) =>
        ($(element).attr("name") ?? "").toLocaleLowerCase("en-US") ===
        lowerName
    );
}

function resolveHttpUrl(
  value: string | null,
  pageUrl: string
): string | null {
  if (!value) {
    return null;
  }

  try {
    const resolved = new URL(value, pageUrl);
    return ['http:', 'https:'].includes(resolved.protocol)
      ? resolved.toString()
      : null;
  } catch {
    return null;
  }
}

function normalizeOptional(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const normalized = normalizeVisibleText(value);
  return normalized || null;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function uniqueCaseInsensitive(values: string[]): string[] {
  const output = new Map<string, string>();

  for (const value of values) {
    const normalized = normalizeVisibleText(value);

    if (normalized) {
      const key = normalized.toLocaleLowerCase("en-US");

      if (!output.has(key)) {
        output.set(key, normalized);
      }
    }
  }

  return [...output.values()];
}

function toStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  return [];
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
