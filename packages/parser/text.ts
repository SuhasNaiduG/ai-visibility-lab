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
  return splitSentences(text).filter((sentence) => sentence.endsWith("?"));
}
