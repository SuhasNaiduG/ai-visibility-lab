import type { Evidence } from "../rules/types.js";
import type {
  ComparableAnalysis,
  ComparisonEligibility,
  ComparisonEligibilityReason,
  ComparisonEligibilityReasonCode
} from "./types.js";

export const COMPARISON_INCOMPLETE_MESSAGE = "Comparison incomplete: this website did not return a usable page to the analyzer. Raw retrieval evidence is shown, but it was excluded from competitive conclusions.";

const NEAR_EMPTY_WORD_THRESHOLD = 50;
const VERY_SHORT_WORD_THRESHOLD = 20;

const challengePatterns: Array<{
  code: Extract<ComparisonEligibilityReasonCode, "ACCESS_DENIED" | "BOT_CHALLENGE" | "CAPTCHA" | "SECURITY_CHECK">;
  titlePattern: RegExp;
  bodyPattern: RegExp;
  message: string;
}> = [
  {
    code: "ACCESS_DENIED",
    titlePattern: /^(?:access denied|request blocked|permission denied|forbidden|not authorized|unauthorized request)(?:\s*[-|:]\s*.*)?[.!]?$/iu,
    bodyPattern: /\b(?:access denied|request blocked|permission denied|forbidden|not authorized|unauthorized request)\b/iu,
    message: "The response contains access-denied or blocked-request language instead of normal page evidence."
  },
  {
    code: "BOT_CHALLENGE",
    titlePattern: /^(?:just a moment|checking your browser|attention required|bot challenge)(?:\s*[-|:]\s*.*)?[.!]?$/iu,
    bodyPattern: /\b(?:checking your browser|verify (?:that )?you are human|bot challenge|automated quer(?:y|ies)|enable javascript and cookies|attention required)\b/iu,
    message: "The response appears to be a bot or browser challenge rather than the requested page."
  },
  {
    code: "CAPTCHA",
    titlePattern: /^(?:captcha|recaptcha|hcaptcha)(?:\s+(?:challenge|required|verification))?[.!]?$/iu,
    bodyPattern: /(?:\b(?:complete|solve|enter|pass)\b.{0,80}\b(?:captcha|recaptcha|hcaptcha)\b|\b(?:captcha|recaptcha|hcaptcha)\b.{0,80}\b(?:continue|verify|verification|required)\b)/isu,
    message: "The response contains a CAPTCHA challenge rather than usable page content."
  },
  {
    code: "SECURITY_CHECK",
    titlePattern: /^(?:security check|security verification|ddos protection)(?:\s*[-|:]\s*.*)?[.!]?$/iu,
    bodyPattern: /\b(?:security check|security verification|performing a security check|ddos protection|cloudflare ray id)\b/iu,
    message: "The response appears to be a security-check page rather than the requested page."
  }
];

const errorTitlePattern = /^(?:(?:4|5)\d{2}[.!]?|(?:4|5)\d{2}(?:\s*[-|:]\s*|\s+)(?:error|not found|page not found|forbidden|unauthorized|bad request|too many requests|internal server error|service unavailable|bad gateway|gateway timeout)\b.*|error\s+(?:4|5)\d{2}(?:\s*[-|:]\s*.*)?|page not found(?:\s*[-|:]\s*.*)?|not found|service unavailable|bad gateway|internal server error|temporarily unavailable)[.!]?$/iu;
const errorBodyPattern = /\b(?:the requested page (?:could not be found|was not found)|page not found|internal server error|service unavailable|bad gateway|an unexpected error occurred)\b/iu;

export function classifyComparisonEligibility(analysis: ComparableAnalysis): ComparisonEligibility {
  if (analysis.statusCode < 200 || analysis.statusCode >= 300) {
    return ineligible(reason(
      analysis,
      "NON_SUCCESS_HTTP",
      `The page returned HTTP ${analysis.statusCode}; non-2xx responses are retrieval evidence and cannot be competitive benchmarks.`,
      "statusCode",
      analysis.statusCode
    ));
  }

  const title = analysis.title?.trim() ?? "";
  const visibleText = analysis.visibleText?.trim() ?? "";
  const earlyText = visibleText.slice(0, 1_500);
  const challengeText = `${title}\n${earlyText}`;
  const normalEvidenceCount = countNormalPageEvidence(analysis);

  for (const candidate of challengePatterns) {
    const titleMatch = candidate.titlePattern.test(title);
    const bodyMatch = candidate.bodyPattern.test(challengeText);
    const weakPageEvidence = analysis.wordCount < 80
      ? normalEvidenceCount < 4
      : normalEvidenceCount < 2;
    if (titleMatch || (bodyMatch && weakPageEvidence)) {
      return ineligible(reason(
        analysis,
        candidate.code,
        candidate.message,
        titleMatch ? "title" : "visibleText",
        titleMatch ? title : earlyText,
        titleMatch ? "title" : "body",
        titleMatch ? title : matchingSnippet(challengeText, candidate.bodyPattern)
      ));
    }
  }

  const errorTitleMatch = errorTitlePattern.test(title);
  const errorBodyMatch = errorBodyPattern.test(earlyText);
  const weakErrorPageEvidence = analysis.wordCount < 80
    ? normalEvidenceCount < 4
    : normalEvidenceCount < 2;
  if (errorTitleMatch || (analysis.wordCount < 200 && errorBodyMatch && weakErrorPageEvidence)) {
    return ineligible(reason(
      analysis,
      "ERROR_PAGE",
      "The response resembles an error page rather than the requested website content.",
      errorTitleMatch ? "title" : "visibleText",
      errorTitleMatch ? title : earlyText,
      errorTitleMatch ? "title" : "body",
      errorTitleMatch ? title : matchingSnippet(earlyText, errorBodyPattern)
    ));
  }

  if (!visibleText || analysis.wordCount === 0) {
    return ineligible(reason(
      analysis,
      "EMPTY_CONTENT",
      "No usable extracted page content was observed.",
      "wordCount",
      analysis.wordCount,
      "body"
    ));
  }

  if (normalEvidenceCount === 0 && analysis.wordCount < 100) {
    return ineligible(reason(
      analysis,
      "MISSING_PAGE_EVIDENCE",
      "The response lacks normal title, heading, link, metadata, and structured page evidence.",
      "normalPageEvidenceCount",
      normalEvidenceCount,
      "body",
      earlyText
    ));
  }

  if (analysis.wordCount < VERY_SHORT_WORD_THRESHOLD && normalEvidenceCount < 2) {
    return ineligible(reason(
      analysis,
      "NEAR_EMPTY_CONTENT",
      `Only ${analysis.wordCount} extracted words and insufficient normal page evidence were observed.`,
      "wordCount",
      analysis.wordCount,
      "body",
      earlyText
    ));
  }

  const degradedReasons: ComparisonEligibilityReason[] = [];
  if (analysis.wordCount < NEAR_EMPTY_WORD_THRESHOLD) {
    degradedReasons.push(reason(
      analysis,
      "NEAR_EMPTY_CONTENT",
      `Only ${analysis.wordCount} extracted words were observed; the page is usable but comparison coverage is limited.`,
      "wordCount",
      analysis.wordCount,
      "body",
      earlyText
    ));
  }
  if (normalEvidenceCount === 0 || (normalEvidenceCount === 1 && analysis.wordCount < 100)) {
    degradedReasons.push(reason(
      analysis,
      "MISSING_PAGE_EVIDENCE",
      "Limited normal page evidence was observed, so competitive conclusions require caution.",
      "normalPageEvidenceCount",
      normalEvidenceCount,
      "body",
      earlyText
    ));
  }

  return degradedReasons.length > 0
    ? { status: "degraded", usableAsBenchmark: true, reasons: degradedReasons }
    : { status: "eligible", usableAsBenchmark: true, reasons: [] };
}

function ineligible(...reasons: ComparisonEligibilityReason[]): ComparisonEligibility {
  return { status: "ineligible", usableAsBenchmark: false, reasons };
}

function reason(
  analysis: ComparableAnalysis,
  code: ComparisonEligibilityReasonCode,
  message: string,
  field: string,
  observedValue: unknown,
  selector?: string,
  snippet?: string
): ComparisonEligibilityReason {
  const evidence: Evidence = {
    sourceUrl: analysis.finalUrl,
    field,
    observedValue,
    fetchedAt: analysis.fetchedAt,
    ...(selector ? { selector } : {}),
    ...(snippet ? { snippet: snippet.slice(0, 300) } : {})
  };
  return { code, message, evidence: [evidence] };
}

function countNormalPageEvidence(analysis: ComparableAnalysis): number {
  return [
    Boolean(analysis.title),
    Boolean(analysis.metaDescription),
    analysis.h1Count > 0,
    analysis.totalHeadingCount > 0,
    analysis.internalLinkCount + analysis.externalLinkCount > 0,
    analysis.schemaTypes.length > 0
  ].filter(Boolean).length;
}

function matchingSnippet(value: string, pattern: RegExp): string {
  pattern.lastIndex = 0;
  const match = pattern.exec(value);
  pattern.lastIndex = 0;
  if (!match || match.index === undefined) return value.slice(0, 240);
  const start = Math.max(0, match.index - 80);
  return value.slice(start, start + 240).replace(/\s+/gu, " ").trim();
}
