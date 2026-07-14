import type { Evidence } from "../rules/types.js";
import type {
  ComparableAnalysis,
  ComparisonGap,
  ComparisonMetricKey,
  ComparisonMetrics,
  ComparisonResult,
  ComparisonRow,
  CompetitorEvidence,
  ManualRankObservations,
  MetricDefinition,
  TargetAdvantage
} from "./types.js";

export const COMPARISON_LIMITATIONS = [
  "The comparison uses public page evidence only; it cannot see private analytics, conversions, or revenue.",
  "The comparison does not measure backlinks, off-page authority, or proprietary ranking factors.",
  "Competitor differences are observations, not proof that a tactic caused rankings or citations.",
  "Rank positions are optional manual observations unless a separate provider is configured; they are not collected automatically.",
  "No single metric proves search ranking or eligibility for citation by an AI system."
] as const;

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  definition("statusCode", "HTTP status", "Crawl accessibility", "Retrieval requires an accessible response.", "context-only"),
  definition("redirectCount", "Redirects", "URL resolution steps", "A stable final URL reduces retrieval ambiguity.", "lower-is-better"),
  definition("indexable", "Indexability", "Observed response state and robots directives", "A non-success response or explicit noindex prevents reliable discovery.", "context-only"),
  definition("indexabilityStatus", "Indexability interpretation", "Parser robots interpretation", "The raw interpretation explains the boolean indexability value.", "context-only"),
  definition("robotsTxtAvailable", "robots.txt available", "Whether the root resource returned 2xx", "A public robots file makes crawl guidance inspectable.", "context-only"),
  definition("robotsTxtStatusCode", "robots.txt status", "Observed root resource status", "The status preserves evidence behind resource availability.", "context-only"),
  definition("sitemapXmlAvailable", "sitemap.xml available", "Whether the conventional root sitemap returned 2xx", "A public sitemap can provide a machine-readable discovery path.", "context-only"),
  definition("sitemapXmlStatusCode", "sitemap.xml status", "Observed conventional sitemap status", "The status preserves evidence and does not prove that no other sitemap exists.", "context-only"),
  definition("hasTitle", "Title present", "Whether title metadata exists", "A clear title helps identify the page.", "context-only"),
  definition("titleLength", "Title length", "Metadata identity detail", "A clear title helps page interpretation; short/long thresholds are bounded editorial heuristics.", "context-only"),
  definition("hasMetaDescription", "Description present", "Whether description metadata exists", "A useful summary can clarify page purpose.", "context-only"),
  definition("descriptionLength", "Description length", "Metadata summary detail", "A useful summary can clarify page purpose; short/long thresholds are bounded editorial heuristics.", "context-only"),
  definition("canonicalMatches", "Canonical matches final URL", "Preferred-URL consistency", "A matching canonical reduces duplicate-URL ambiguity.", "context-only"),
  definition("canonicalStatus", "Canonical relationship", "Missing, invalid, matching, or mismatching canonical", "The raw relationship exposes preferred-URL consistency.", "context-only"),
  definition("hasLanguage", "Language declared", "Document-language metadata", "A language declaration reduces interpretation ambiguity and supports accessibility.", "context-only"),
  definition("documentLanguage", "Document language", "Observed html language value", "The raw value allows exact cross-site inspection.", "context-only"),
  definition("viewportPresent", "Viewport present", "Mobile viewport metadata", "Viewport metadata supports predictable rendering on mobile devices.", "context-only"),
  definition("h1Count", "H1 count", "Primary heading structure", "An explicit primary heading supports scanning and section interpretation.", "context-only"),
  definition("h1StructureValid", "Single H1", "Whether exactly one H1 was observed", "A clear primary heading makes the page subject easier to inspect.", "context-only"),
  definition("totalHeadingCount", "Headings", "Visible section structure", "Explicit sections make coverage easier to inspect.", "higher-is-more"),
  definition("headingJumpCount", "Heading jumps", "Skipped heading levels", "Fewer structural jumps generally make hierarchy easier to follow.", "lower-is-better"),
  definition("emptyHeadingCount", "Empty headings", "Heading elements without text", "Empty structural labels do not describe a section.", "lower-is-better"),
  definition("repeatedHeadingCount", "Repeated headings", "Repeated normalized heading labels", "Repeated labels are review evidence and may reflect intentional responsive markup.", "lower-is-better"),
  definition("wordCount", "Words", "Page content breadth", "Large differences can surface coverage gaps, but more words are not inherently better.", "higher-is-more"),
  definition("questionCount", "Questions", "Natural-language question coverage", "Questions can reveal answerable user needs.", "higher-is-more"),
  definition("faqIndicatorCount", "FAQ indicators", "Explicit FAQ or Q&A structure", "Clearly labeled Q&A sections improve answerability inspection.", "higher-is-more"),
  definition("directAnswerCount", "Direct answers", "Question headings followed by concise paragraphs", "Direct answers make responses easy to locate.", "higher-is-more"),
  definition("schemaTypeCount", "Schema types", "Machine-readable entity/page types", "Structured data can reduce ambiguity when it accurately reflects visible content.", "higher-is-more"),
  definition("jsonLdParseErrorCount", "JSON-LD errors", "Malformed structured-data blocks", "Valid JSON-LD is required before its entities can be reliably parsed.", "lower-is-better"),
  definition("internalLinkCount", "Internal links", "On-site relationships and discovery paths", "Internal links expose page relationships and crawl paths.", "higher-is-more"),
  definition("externalLinkCount", "External links", "Observed outbound references", "External links are contextual evidence, not automatically positive or negative.", "context-only"),
  definition("uniqueInternalUrlCount", "Unique internal URLs", "Distinct internal destinations", "Distinct destinations show breadth of navigable relationships.", "higher-is-more"),
  definition("uniqueExternalDomainCount", "External domains", "Distinct referenced domains", "This is an observed reference summary, not an authority score.", "context-only"),
  definition("imageCount", "Images", "Media volume", "Media volume provides context for alt-text coverage.", "context-only"),
  definition("imagesMissingAltCount", "Images missing alt", "Observed media accessibility gaps", "Alt text makes informative images more interpretable and accessible.", "lower-is-better"),
  definition("emptyAnchorCount", "Empty anchors", "HTTP links without visible anchor text", "Descriptive anchors expose destination context.", "lower-is-better"),
  definition("topicTermCount", "Topic terms", "Distinct inspected heading/title terms", "Explicit terminology can reduce subject ambiguity.", "higher-is-more"),
  definition("serviceTermCount", "Service terms", "Explicit inspected service phrases", "Service clarity helps explain what is offered.", "higher-is-more"),
  definition("locationTermCount", "Location terms", "Explicit inspected location phrases", "Location clarity helps explain where service is available.", "higher-is-more"),
  definition("hasIdentitySignals", "Identity signals", "Observed organization, person, author, or provider labels", "Identity signals clarify source accountability.", "context-only"),
  definition("hasTrustSignals", "Trust/provider signals", "Observed author, provider, or credential labels", "Truthful provider context can clarify source accountability.", "context-only"),
  definition("hasContactSignals", "Contact signals", "Observed contact/address markers", "Contact signals make the responsible entity easier to verify.", "context-only"),
  definition("hasLocationSignals", "Location signals", "Observed location text or structured properties", "Location evidence clarifies where an offering applies.", "context-only")
];

interface ComparisonInput {
  target: ComparableAnalysis;
  competitors: ComparableAnalysis[];
  queryLabel?: string | null;
  rankObservations?: ManualRankObservations;
}

interface ScalarRule {
  key: ComparisonMetricKey;
  gapId: string;
  advantageId: string;
  minDifference: number;
  priority: ComparisonGap["priority"];
  effort: ComparisonGap["effort"];
  reverse?: boolean;
  implementation: string;
  verification: string;
}

const scalarRules: ScalarRule[] = [
  { key: "totalHeadingCount", gapId: "GAP_HEADING_COVERAGE", advantageId: "ADV_HEADING_COVERAGE", minDifference: 2, priority: "medium", effort: "medium", implementation: "Review competitor section themes, then add original, useful sections that answer unmet user needs without copying wording.", verification: "Rerun the comparison and confirm the intended new headings and reduced transparent delta." },
  { key: "wordCount", gapId: "GAP_CONTENT_BREADTH", advantageId: "ADV_CONTENT_BREADTH", minDifference: 100, priority: "medium", effort: "high", implementation: "Expand only substantiated sections that improve topic coverage; do not add filler to meet a word count.", verification: "Rerun and inspect the visible-text evidence, covered topics, and word-count delta." },
  { key: "questionCount", gapId: "GAP_QUESTION_COVERAGE", advantageId: "ADV_QUESTION_COVERAGE", minDifference: 1, priority: "medium", effort: "medium", implementation: "Add original questions that reflect real user needs and provide direct, accurate answers.", verification: "Rerun and confirm the new question text is detected and answered on the page." },
  { key: "directAnswerCount", gapId: "GAP_DIRECT_ANSWERS", advantageId: "ADV_DIRECT_ANSWERS", minDifference: 1, priority: "medium", effort: "medium", implementation: "Place a concise factual answer immediately after relevant question headings, followed by supporting detail.", verification: "Rerun and confirm the question-to-paragraph evidence is present." },
  { key: "internalLinkCount", gapId: "GAP_INTERNAL_LINKS", advantageId: "ADV_INTERNAL_LINKS", minDifference: 3, priority: "medium", effort: "low", implementation: "Add descriptive links to genuinely relevant internal pages where they help a reader continue the task.", verification: "Rerun and verify the destination URLs and anchor text in raw link evidence." },
  { key: "imagesMissingAltCount", gapId: "GAP_IMAGE_ALT", advantageId: "ADV_IMAGE_ALT", minDifference: 1, reverse: true, priority: "medium", effort: "low", implementation: "Add concise alt text to informative images and use empty alt text for intentionally decorative images.", verification: "Rerun and confirm the missing-alt image evidence is reduced without stuffing keywords." },
  { key: "headingJumpCount", gapId: "GAP_HEADING_JUMPS", advantageId: "ADV_HEADING_JUMPS", minDifference: 1, reverse: true, priority: "low", effort: "low", implementation: "Adjust heading levels so section nesting progresses without unexplained jumps while preserving the visual design in CSS.", verification: "Rerun and inspect the heading-level jump evidence." },
  { key: "emptyHeadingCount", gapId: "GAP_EMPTY_HEADINGS", advantageId: "ADV_EMPTY_HEADINGS", minDifference: 1, reverse: true, priority: "low", effort: "low", implementation: "Remove empty heading elements or give genuine sections descriptive labels.", verification: "Rerun and confirm empty heading evidence is reduced." },
  { key: "repeatedHeadingCount", gapId: "GAP_REPEATED_HEADINGS", advantageId: "ADV_REPEATED_HEADINGS", minDifference: 1, reverse: true, priority: "low", effort: "low", implementation: "Review repeated headings in source and consolidate only unintended duplicates; responsive duplicate markup is not automatically harmful.", verification: "Rerun and compare repeated heading text, count, levels, and rendered behavior." },
  { key: "jsonLdParseErrorCount", gapId: "GAP_JSONLD_ERRORS", advantageId: "ADV_JSONLD_ERRORS", minDifference: 1, reverse: true, priority: "high", effort: "low", implementation: "Correct the recorded JSON syntax at the cited script block without adding unsupported properties.", verification: "Validate the block and rerun until the parse-error record is absent." },
  { key: "emptyAnchorCount", gapId: "GAP_EMPTY_ANCHORS", advantageId: "ADV_EMPTY_ANCHORS", minDifference: 1, reverse: true, priority: "low", effort: "low", implementation: "Give meaningful linked controls accessible text or an appropriate accessible name.", verification: "Rerun and inspect empty-anchor evidence and rendered accessibility." },
  { key: "serviceTermCount", gapId: "GAP_SERVICE_CLARITY", advantageId: "ADV_SERVICE_CLARITY", minDifference: 1, priority: "medium", effort: "medium", implementation: "State the actual services offered in original, factual page copy and headings.", verification: "Rerun and inspect the service terms and their source locations." },
  { key: "locationTermCount", gapId: "GAP_LOCATION_CLARITY", advantageId: "ADV_LOCATION_CLARITY", minDifference: 1, priority: "medium", effort: "low", implementation: "State genuine served locations or the real business address where relevant; never invent locations.", verification: "Rerun and inspect detected location terms and source evidence." }
];

export function compareAnalyses(input: ComparisonInput): ComparisonResult {
  if (input.competitors.length < 1 || input.competitors.length > 3) {
    throw new Error("Comparison requires one to three competitors");
  }

  const all = [input.target, ...input.competitors];
  const rows = all.map((analysis, index) => toRow(
    analysis,
    index === 0 ? "target" : "competitor",
    findRank(input.rankObservations, analysis)
  ));
  const targetRow = rows[0]!;
  const competitorRows = rows.slice(1);
  const gaps: ComparisonGap[] = [];
  const advantages: TargetAdvantage[] = [];

  for (const rule of scalarRules) {
    evaluateScalar(rule, input.target, input.competitors, targetRow, competitorRows, gaps, advantages);
  }

  evaluateBooleanDifference("GAP_INDEXABILITY", "ADV_INDEXABILITY", "indexable", input.target, input.competitors, targetRow.metrics.indexable, competitorRows.map((row) => row.metrics.indexable), gaps, advantages, "Remove only unintended blocking directives or response errors, then verify the public page is intentionally indexable.", "Rerun and verify status, robots meta, and indexability evidence.", "high");
  evaluateBooleanDifference("GAP_TITLE_MISSING", "ADV_TITLE_PRESENT", "hasTitle", input.target, input.competitors, targetRow.metrics.hasTitle, competitorRows.map((row) => row.metrics.hasTitle), gaps, advantages, "Add one concise, accurate HTML title that identifies the page and its subject.", "Rerun and inspect title text and length evidence.", "high");
  evaluateBooleanDifference("GAP_DESCRIPTION_MISSING", "ADV_DESCRIPTION_PRESENT", "hasMetaDescription", input.target, input.competitors, targetRow.metrics.hasMetaDescription, competitorRows.map((row) => row.metrics.hasMetaDescription), gaps, advantages, "Add an original factual meta description that summarizes the page without promises or unsupported claims.", "Rerun and inspect description text and length evidence.", "medium");
  evaluateBooleanDifference("GAP_CANONICAL_MISMATCH", "ADV_CANONICAL_MATCH", "canonicalMatches", input.target, input.competitors, targetRow.metrics.canonicalMatches, competitorRows.map((row) => row.metrics.canonicalMatches), gaps, advantages, "Set one valid canonical to the intentionally preferred public URL after confirming redirect and duplicate-URL behavior.", "Rerun and verify the resolved canonical equals the final URL.", "high");
  evaluateBooleanDifference("GAP_LANGUAGE_MISSING", "ADV_LANGUAGE_PRESENT", "hasLanguage", input.target, input.competitors, targetRow.metrics.hasLanguage, competitorRows.map((row) => row.metrics.hasLanguage), gaps, advantages, "Add the truthful BCP 47 language code to the root html element.", "Rerun and verify documentLanguage.", "low");
  evaluateBooleanDifference("GAP_VIEWPORT_MISSING", "ADV_VIEWPORT_PRESENT", "viewportPresent", input.target, input.competitors, targetRow.metrics.viewportPresent, competitorRows.map((row) => row.metrics.viewportPresent), gaps, advantages, "Add an appropriate viewport meta element and verify mobile rendering.", "Rerun and verify viewport evidence plus a browser check.", "medium");
  evaluateBooleanDifference("GAP_H1_STRUCTURE", "ADV_H1_STRUCTURE", "h1StructureValid", input.target, input.competitors, targetRow.metrics.h1StructureValid, competitorRows.map((row) => row.metrics.h1StructureValid), gaps, advantages, "Provide one descriptive primary H1 in the source; review responsive duplicates before removing intentional markup.", "Rerun and inspect H1 count and raw text.", "medium");
  evaluateBooleanDifference("GAP_FAQ_STRUCTURE", "ADV_FAQ_STRUCTURE", "faqIndicatorCount", input.target, input.competitors, targetRow.metrics.faqIndicatorCount > 0, competitorRows.map((row) => row.metrics.faqIndicatorCount > 0), gaps, advantages, "If users genuinely ask recurring questions, add an original visible FAQ or Q&A section with accurate answers.", "Rerun and inspect FAQ indicators and detected questions.", "medium");
  evaluateBooleanDifference("GAP_IDENTITY_SIGNALS", "ADV_IDENTITY_SIGNALS", "hasIdentitySignals", input.target, input.competitors, targetRow.metrics.hasIdentitySignals, competitorRows.map((row) => row.metrics.hasIdentitySignals), gaps, advantages, "Add truthful organization, author, or provider identity information supported by the visible page; do not invent credentials.", "Rerun and inspect identity-term source evidence.", "high");
  evaluateBooleanDifference("GAP_TRUST_SIGNALS", "ADV_TRUST_SIGNALS", "hasTrustSignals", input.target, input.competitors, targetRow.metrics.hasTrustSignals, competitorRows.map((row) => row.metrics.hasTrustSignals), gaps, advantages, "Identify the real author or provider and include only verifiable qualifications relevant to the content.", "Rerun and inspect trust/provider signal sources.", "medium");
  evaluateBooleanDifference("GAP_CONTACT_SIGNALS", "ADV_CONTACT_SIGNALS", "hasContactSignals", input.target, input.competitors, targetRow.metrics.hasContactSignals, competitorRows.map((row) => row.metrics.hasContactSignals), gaps, advantages, "Add real contact or location information where appropriate and keep it consistent with visible business details.", "Rerun and inspect contact-term source evidence.", "medium");
  evaluateBooleanDifference("GAP_LOCATION_SIGNALS", "ADV_LOCATION_SIGNALS", "hasLocationSignals", input.target, input.competitors, targetRow.metrics.hasLocationSignals, competitorRows.map((row) => row.metrics.hasLocationSignals), gaps, advantages, "State only genuine served locations or address details where relevant.", "Rerun and inspect location signal source evidence.", "medium");

  const competitorOnlySchemaTypes = setDifference(union(input.competitors.flatMap((item) => item.schemaTypes)), input.target.schemaTypes);
  const competitorOnlyTopics = setDifference(union(input.competitors.flatMap(topicTerms)), topicTerms(input.target));
  const competitorOnlyQuestions = setDifference(union(input.competitors.flatMap((item) => item.detectedQuestions.map(normalizePhrase))), input.target.detectedQuestions.map(normalizePhrase));

  if (competitorOnlySchemaTypes.length > 0) {
    gaps.push(createSetGap("GAP_COMPETITOR_ONLY_SCHEMA", "schemaTypes", input.target, input.competitors, competitorOnlySchemaTypes, "Validate whether any observed competitor-only type accurately describes visible target content. Add only valid JSON-LD that matches the page; never fabricate reviews, ratings, claims, or credentials.", "Validate JSON-LD and rerun to inspect parsed schema types."));
  }
  if (competitorOnlyTopics.length > 0) {
    gaps.push(createSetGap("GAP_COMPETITOR_ONLY_TOPICS", "topicTerms", input.target, input.competitors, competitorOnlyTopics, "Research whether the missing themes represent real user needs, then write original factual coverage where useful. Do not copy competitor wording.", "Rerun and inspect topic terms with their title/heading sources."));
  }
  if (competitorOnlyQuestions.length > 0) {
    gaps.push(createSetGap("GAP_COMPETITOR_ONLY_QUESTIONS", "detectedQuestions", input.target, input.competitors, competitorOnlyQuestions, "Use the observed questions as research prompts only. Add independently written questions and accurate direct answers where they fit user intent.", "Rerun and inspect detected question text and direct-answer evidence."));
  }

  return {
    targetUrl: input.target.normalizedUrl,
    competitorUrls: input.competitors.map((item) => item.normalizedUrl),
    queryLabel: input.queryLabel?.trim() || null,
    metricDefinitions: METRIC_DEFINITIONS,
    matrix: rows,
    targetGaps: uniqueById(gaps, "gapId"),
    targetAdvantages: uniqueById(advantages, "advantageId"),
    competitorOnlySchemaTypes,
    competitorOnlyTopics,
    competitorOnlyQuestions,
    limitations: [...COMPARISON_LIMITATIONS]
  };
}

function toRow(analysis: ComparableAnalysis, role: ComparisonRow["role"], manualRankObservation: number | null): ComparisonRow {
  return {
    role,
    url: analysis.normalizedUrl,
    finalUrl: analysis.finalUrl,
    manualRankObservation,
    metrics: {
      statusCode: analysis.statusCode,
      redirectCount: analysis.redirectCount,
      indexable: analysis.statusCode >= 200 && analysis.statusCode < 300 && analysis.indexability.isIndexable,
      indexabilityStatus: analysis.indexability.status,
      robotsTxtAvailable: analysis.robotsTxtAvailable,
      robotsTxtStatusCode: analysis.robotsTxtStatusCode,
      sitemapXmlAvailable: analysis.sitemapXmlAvailable,
      sitemapXmlStatusCode: analysis.sitemapXmlStatusCode,
      hasTitle: analysis.title !== null,
      titleLength: analysis.titleLength,
      hasMetaDescription: analysis.metaDescription !== null,
      descriptionLength: analysis.metaDescriptionLength,
      canonicalMatches: analysis.canonicalStatus === "match",
      canonicalStatus: analysis.canonicalStatus,
      hasLanguage: analysis.documentLanguage !== null,
      documentLanguage: analysis.documentLanguage,
      viewportPresent: analysis.viewportPresent,
      h1Count: analysis.h1Count,
      h1StructureValid: analysis.h1Count === 1,
      totalHeadingCount: analysis.totalHeadingCount,
      headingJumpCount: analysis.headingLevelJumps.length,
      emptyHeadingCount: analysis.emptyHeadingCount,
      repeatedHeadingCount: analysis.repeatedHeadings.length,
      wordCount: analysis.wordCount,
      questionCount: analysis.questionCount,
      faqIndicatorCount: analysis.faqIndicators.length,
      directAnswerCount: analysis.directAnswerCount,
      schemaTypeCount: analysis.schemaTypes.length,
      jsonLdParseErrorCount: analysis.jsonLdParseErrors.length,
      internalLinkCount: analysis.internalLinkCount,
      externalLinkCount: analysis.externalLinkCount,
      uniqueInternalUrlCount: analysis.uniqueInternalUrls.length,
      uniqueExternalDomainCount: analysis.externalDomains.length,
      imageCount: analysis.imageCount,
      imagesMissingAltCount: analysis.imagesMissingAlt,
      emptyAnchorCount: analysis.emptyAnchorCount,
      topicTermCount: topicTerms(analysis).length,
      serviceTermCount: analysis.coverage.service.terms.length,
      locationTermCount: analysis.coverage.location.terms.length,
      hasIdentitySignals: analysis.coverage.entity.present,
      hasTrustSignals: analysis.coverage.trust.present,
      hasContactSignals: analysis.coverage.contact.present,
      hasLocationSignals: analysis.coverage.location.present
    },
    schemaTypes: [...analysis.schemaTypes],
    topicTerms: topicTerms(analysis),
    questions: [...analysis.detectedQuestions]
  };
}

function evaluateScalar(rule: ScalarRule, target: ComparableAnalysis, competitors: ComparableAnalysis[], targetRow: ComparisonRow, competitorRows: ComparisonRow[], gaps: ComparisonGap[], advantages: TargetAdvantage[]): void {
  const targetValue = targetRow.metrics[rule.key];
  const competitorValues = competitorRows.map((row) => row.metrics[rule.key]);
  if (typeof targetValue !== "number" || competitorValues.some((value) => typeof value !== "number")) return;
  const relevant = rule.reverse ? Math.min(...competitorValues as number[]) : Math.max(...competitorValues as number[]);
  const difference = rule.reverse ? targetValue - relevant : relevant - targetValue;
  if (difference >= rule.minDifference) {
    gaps.push({
      gapId: rule.gapId,
      metric: rule.key,
      targetEvidence: [metricEvidence(target, rule.key, targetValue)],
      competitorEvidence: competitorEvidence(competitors, rule.key, competitorValues),
      whatDiffers: `Target ${rule.key} is ${targetValue}; the relevant competitor benchmark is ${relevant} (transparent delta ${difference}).`,
      competitorObservation: "At least one competitor shows a different observed public-page signal; this does not prove causation or that the target should copy it.",
      whyItMayMatter: METRIC_DEFINITIONS.find((item) => item.key === rule.key)?.whyItMayHelp ?? "The difference may warrant inspection.",
      implementationDirection: rule.implementation,
      verificationMethod: rule.verification,
      priority: rule.priority,
      effort: rule.effort,
      caution: "Treat this as a comparison gap, not a ranking prediction. Preserve accuracy and user value over metric parity."
    });
  }
  const inverseDifference = rule.reverse ? relevant - targetValue : targetValue - relevant;
  if (inverseDifference >= rule.minDifference) {
    advantages.push({
      advantageId: rule.advantageId,
      metric: rule.key,
      targetEvidence: [metricEvidence(target, rule.key, targetValue)],
      competitorEvidence: competitorEvidence(competitors, rule.key, competitorValues),
      whatDiffers: `Target ${rule.key} is ${targetValue}; the relevant competitor benchmark is ${relevant}.`,
      interpretation: "This is an observed target advantage for this metric only; it does not prove ranking or citation eligibility."
    });
  }
}

function evaluateBooleanDifference(gapId: string, advantageId: string, metric: ComparisonMetricKey, target: ComparableAnalysis, competitors: ComparableAnalysis[], targetValue: boolean, competitorValues: boolean[], gaps: ComparisonGap[], advantages: TargetAdvantage[], implementation: string, verification: string, priority: ComparisonGap["priority"]): void {
  if (!targetValue && competitorValues.some(Boolean)) gaps.push({
    gapId,
    metric,
    targetEvidence: [metricEvidence(target, metric, targetValue)],
    competitorEvidence: competitorEvidence(competitors, metric, competitorValues),
    whatDiffers: `The target does not show ${metric}; at least one competitor does.`,
    competitorObservation: "The competitor signal is an observed tactic, not evidence that it caused performance.",
    whyItMayMatter: METRIC_DEFINITIONS.find((item) => item.key === metric)?.whyItMayHelp ?? "The difference may warrant inspection.",
    implementationDirection: implementation,
    verificationMethod: verification,
    priority,
    effort: "medium",
    caution: "Implement only when supported by truthful visible content; do not copy wording or fabricate evidence."
  });
  if (targetValue && competitorValues.every((value) => !value)) {
    advantages.push({
      advantageId,
      metric,
      targetEvidence: [metricEvidence(target, metric, targetValue)],
      competitorEvidence: competitorEvidence(competitors, metric, competitorValues),
      whatDiffers: `The target shows ${metric}; none of the compared competitors do.`,
      interpretation: "This is a transparent observed difference, not proof of ranking or citation eligibility."
    });
  }
}

function createSetGap(id: string, metric: string, target: ComparableAnalysis, competitors: ComparableAnalysis[], missing: string[], implementation: string, verification: string): ComparisonGap {
  return {
    gapId: id,
    metric,
    targetEvidence: [metricEvidence(target, metric, metric === "schemaTypes" ? target.schemaTypes : metric === "detectedQuestions" ? target.detectedQuestions : target.coverage)],
    competitorEvidence: competitors.map((item) => ({ sourceUrl: item.finalUrl, evidence: [metricEvidence(item, metric, metric === "schemaTypes" ? item.schemaTypes : metric === "detectedQuestions" ? item.detectedQuestions : item.coverage)] })),
    whatDiffers: `Competitors contain observed values not present on the target: ${missing.join(", ")}.`,
    competitorObservation: "These values are research observations only, not instructions to copy a competitor or proof of causation.",
    whyItMayMatter: "The difference can reveal an evidence-coverage area worth validating against real user and business needs.",
    implementationDirection: implementation,
    verificationMethod: verification,
    priority: "medium",
    effort: "medium",
    caution: "Add only original, accurate, visible content and matching structured evidence."
  };
}

function metricEvidence(analysis: ComparableAnalysis, field: string, observedValue: unknown): Evidence {
  return { sourceUrl: analysis.finalUrl, field, observedValue, fetchedAt: analysis.fetchedAt };
}

function competitorEvidence(competitors: ComparableAnalysis[], field: string, values: unknown[]): CompetitorEvidence[] {
  return competitors.map((item, index) => ({ sourceUrl: item.finalUrl, evidence: [metricEvidence(item, field, values[index])] }));
}

function findRank(observations: ManualRankObservations | undefined, analysis: ComparableAnalysis): number | null {
  if (!observations) return null;
  for (const candidate of [analysis.normalizedUrl, analysis.finalUrl, analysis.requestedUrl]) {
    const direct = observations[candidate];
    if (direct !== undefined) return direct;
    try {
      const normalizedCandidate = normalizeRankKey(candidate);
      const entry = Object.entries(observations).find(([key]) => normalizeRankKey(key) === normalizedCandidate);
      if (entry) return entry[1];
    } catch {
      // Request validation owns malformed observation keys; unmatched keys are ignored here.
    }
  }
  return null;
}

function normalizeRankKey(value: string): string {
  const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`);
  url.hash = "";
  return url.toString();
}

function normalizePhrase(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function topicTerms(analysis: ComparableAnalysis): string[] {
  return union([
    ...analysis.coverage.contentSection.terms,
    ...analysis.coverage.service.terms,
    ...analysis.coverage.entity.terms,
    ...analysis.coverage.location.terms
  ]);
}

function union(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function setDifference(values: string[], targetValues: string[]): string[] {
  const target = new Set(targetValues.map(normalizePhrase));
  return values.filter((value) => !target.has(normalizePhrase(value)));
}

function uniqueById<T extends Record<K, string>, K extends keyof T>(values: T[], key: K): T[] {
  return [...new Map(values.map((value) => [value[key], value])).values()];
}

function definition(key: ComparisonMetricKey, label: string, whatItShows: string, whyItMayHelp: string, direction: MetricDefinition["direction"]): MetricDefinition {
  return { key, label, whatItShows, whyItMayHelp, direction };
}
