import type { CheerioAPI } from "cheerio";

const BLOCK_ELEMENTS = [
  "address",
  "article",
  "aside",
  "blockquote",
  "br",
  "div",
  "dl",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "td",
  "th",
  "tr",
  "ul"
].join(",");

export function normalizeVisibleText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

export function extractVisibleText($: CheerioAPI): string {
  const clone = $("body").first().clone();

  clone
    .find(
      "script, style, noscript, template, svg, canvas, [hidden], [aria-hidden='true']"
    )
    .remove();
  clone.find(BLOCK_ELEMENTS).append(" ");

  return normalizeVisibleText(clone.text());
}

export function countWords(text: string): number {
  return (
    text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) ?? []
  ).length;
}

export function splitSentences(text: string): string[] {
  if (!text) {
    return [];
  }

  return text
    .split(/(?<=[.!?])\s+/u)
    .map(normalizeVisibleText)
    .filter((sentence) => /[\p{L}\p{N}]/u.test(sentence));
}

export function extractQuestions(text: string): string[] {
  const readableText = normalizeVisibleText(decodeHtmlEntities(text)).replace(
    /<[^>]*>/gu,
    ""
  );

  return splitSentences(readableText)
    .map(normalizeQuestion)
    .filter((question): question is string => question !== null);
}

/**
 * Keeps the question inventory limited to short, readable questions. Page text
 * often contains encoded markup, navigation runs, and form placeholders that
 * happen to end in a question mark; those are not useful comparison evidence.
 */
export function normalizeQuestion(value: string): string | null {
  const question = normalizeVisibleText(decodeHtmlEntities(value))
    .replace(/<[^>]*>/gu, "")
    .replace(/\s+\?/gu, "?");

  if (!question.endsWith("?") || question.length > 220) {
    return null;
  }

  const wordCount = countWords(question);
  if (wordCount < 2 || wordCount > 30) {
    return null;
  }

  return /^(?:what|when|where|which|who|whom|whose|why|how|is|are|was|were|can|could|do|does|did|will|would|should|may|might|have|has|had)\b/iu.test(
    question
  )
    ? question
    : null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([\da-f]+);/giu, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/gu, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10))
    )
    .replace(/&(quot|apos|amp|lt|gt|nbsp);/giu, (_, entity: string) => {
      const entities: Record<string, string> = {
        quot: '"',
        apos: "'",
        amp: "&",
        lt: "<",
        gt: ">",
        nbsp: " "
      };
      return entities[entity.toLocaleLowerCase("en-US")] ?? "";
    });
}
