import type { ComparableAnalysis } from "../comparison/types.js";
import type { Evidence } from "../rules/types.js";
import type { AnalyzerGroup, AnalyzerLibraryResult, AnalyzerObservation, AnalyzerStatus } from "./types.js";

const VERSION = "1.0.0";
const MISSING_LIMIT = "Not observed means only that this fetched page did not expose supported evidence; it does not prove the organization lacks the fact, policy, or capability.";

export function runAnalyzerLibrary(input: ComparableAnalysis): AnalyzerLibraryResult {
  const text = input.visibleText;
  const observations: AnalyzerObservation[] = [];
  const add = (
    analyzerId: string,
    group: AnalyzerGroup,
    label: string,
    status: AnalyzerStatus,
    observedValue: unknown,
    interpretation: string,
    field = "visibleText",
    selector = "body",
    snippet?: string,
    limitation = MISSING_LIMIT
  ) => observations.push({
    analyzerId,
    analyzerVersion: VERSION,
    group,
    label,
    status,
    observedValue,
    evidence: [evidence(input, field, observedValue, selector, snippet)],
    interpretation,
    limitation
  });
  const lexical = (id: string, group: AnalyzerGroup, label: string, pattern: RegExp, interpretation: string, statusWhenMissing: AnalyzerStatus = "not-observed") => {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    add(id, group, label, match ? "observed" : statusWhenMissing, match?.[0] ?? null, interpretation, "visibleText", "body", match ? snippetAround(text, match.index, match[0].length) : undefined);
  };

  add("TECH_HTTP_STATUS", "technical", "HTTP retrieval", input.statusCode >= 200 && input.statusCode < 300 ? "observed" : "partially-observed", input.statusCode, "Observed HTTP response status.", "statusCode", undefined);
  add("TECH_INDEXABILITY", "technical", "Indexability directives", input.indexability.isIndexable ? "observed" : "partially-observed", input.indexability, "Deterministic response/meta interpretation; external index state is unknown.", "indexability", 'meta[name="robots"]');
  add("TECH_CANONICAL", "technical", "Canonical relationship", input.canonicalStatus === "match" ? "observed" : "partially-observed", input.canonicalStatus, "Observed canonical relationship to the fetched URL.", "canonicalStatus", 'link[rel="canonical"]');
  add("TECH_HEADING_STRUCTURE", "technical", "Heading structure", input.h1Count === 1 && input.headingLevelJumps.length === 0 ? "observed" : "partially-observed", { h1Count: input.h1Count, jumps: input.headingLevelJumps.length }, "Inspectable heading structure, without assuming ranking impact.", "headingHierarchy", "h1,h2,h3,h4,h5,h6");
  add("TECH_IMAGE_ALT", "technical", "Image alternative text", input.imageCount === 0 ? "not-applicable" : input.imagesMissingAlt === 0 ? "observed" : "partially-observed", { images: input.imageCount, missingAlt: input.imagesMissingAlt }, "Alternative-text coverage requires rendered-context review for decorative images.", "imageAltIssues", "img");
  add("TECH_STRUCTURED_DATA", "technical", "Structured data", input.schemaTypes.length ? input.jsonLdParseErrors.length ? "partially-observed" : "observed" : "not-observed", { schemaTypes: input.schemaTypes, parseErrors: input.jsonLdParseErrors.length }, "Parsed types and syntax errors are direct markup evidence.", "schemaTypes", 'script[type="application/ld+json"]');

  add("CONTENT_QUESTIONS", "content-answerability", "Visible questions", input.questionCount ? "observed" : "not-observed", input.detectedQuestions, "Normalized question evidence can identify explicit user needs.", "detectedQuestions");
  add("CONTENT_DIRECT_ANSWERS", "content-answerability", "Answer proximity", input.questionCount === 0 ? "not-applicable" : input.directAnswerCount > 0 ? "observed" : "not-observed", input.directAnswerCount, "Direct-answer evidence requires a detected question and nearby answer.", "directAnswers");
  lexical("CONTENT_PRICING", "content-answerability", "Pricing", /\b(?:price|pricing|cost|fees?)\b/iu, "Pricing language was checked lexically; accuracy and completeness require review.");
  lexical("CONTENT_INSURANCE", "content-answerability", "Insurance", /\b(?:insurance|coverage|benefits)\b/iu, "Insurance language was observed or not observed without inferring accepted plans.");
  lexical("CONTENT_PROCESS", "content-answerability", "Process", /\b(?:how it works|process|what to expect|steps?)\b/iu, "Process language can make the service journey explicit.");
  lexical("CONTENT_RISKS", "content-answerability", "Risks and limitations", /\b(?:risks?|side effects?|limitations?|complications?)\b/iu, "Risk language requires professional review for completeness and medical accuracy.", "needs-human-review");
  lexical("CONTENT_ALTERNATIVES", "content-answerability", "Alternatives", /\b(?:alternatives?|other options?|instead of)\b/iu, "Alternative language requires professional review for relevance and completeness.", "needs-human-review");
  lexical("CONTENT_ELIGIBILITY", "content-answerability", "Eligibility", /\b(?:eligible|eligibility|candidate|who (?:is|are) (?:this|treatment) for)\b/iu, "Eligibility language must not substitute for individualized professional assessment.", "needs-human-review");
  lexical("CONTENT_REVIEW_DATE", "content-answerability", "Freshness or review date", /\b(?:updated|reviewed|last modified|published)\s*(?:on)?\s*[:\-]?\s*[A-Z\d]/iu, "Visible date language is observed; actual editorial recency requires validation.");

  add("ENTITY_ORGANIZATION", "entities", "Organization or brand", input.coverage.entity.present ? "observed" : "not-observed", input.coverage.entity.terms, "Explicit organization evidence from supported structured or metadata sources.", "coverage.entity");
  add("ENTITY_SERVICE", "entities", "Services", input.coverage.service.present ? "observed" : "not-observed", input.coverage.service.terms, "Lexical/structured service evidence, not a complete service inventory.", "coverage.service");
  add("ENTITY_LOCATION", "entities", "Locations", input.coverage.location.present ? "observed" : "not-observed", input.coverage.location.terms, "Location terms are page evidence and may not represent a verified office address.", "coverage.location");
  add("ENTITY_CONTACT", "entities", "Contact identity", input.coverage.contact.present ? "observed" : "not-observed", input.coverage.contact.terms, "Contact evidence is observed without validating ownership or availability.", "coverage.contact");
  lexical("ENTITY_PROVIDER", "entities", "Provider or author", /\b(?:Dr\.?|doctor|provider|author|reviewed by|written by)\b/iu, "Provider/author language was observed; identity and role require factual review.", "needs-human-review");
  add("ENTITY_SCHEMA_VISIBLE_CONSISTENCY", "entities", "Schema-to-visible consistency", input.schemaTypes.length && input.coverage.entity.present ? "partially-observed" : "needs-human-review", { schemaTypes: input.schemaTypes, entityTerms: input.coverage.entity.terms }, "Presence can be compared, but property-level factual consistency requires human review.", "coverage");

  lexical("TRUST_CREDENTIALS", "trust-ymyl", "Credentials language", /\b(?:credential|certified|board-certified|licensed|fellowship|residency)\b/iu, "Credential language is not verification; confirm every credential with authoritative records.", "needs-human-review");
  lexical("TRUST_MEDICAL_REVIEW", "trust-ymyl", "Medical review", /\b(?:medically reviewed|clinical review|reviewed by)\b/iu, "A review label is not proof of review quality or reviewer qualifications.", "needs-human-review");
  lexical("TRUST_CITATIONS", "trust-ymyl", "References or citations", /\b(?:references?|sources?|citations?|according to)\b/iu, "Citation language is observed; source quality and claim support require review.", "needs-human-review");
  lexical("TRUST_POLICIES", "trust-ymyl", "Policies", /\b(?:privacy policy|terms of use|accessibility|editorial policy)\b/iu, "Policy language is observed without assessing legal sufficiency.");
  lexical("TRUST_TESTIMONIALS", "trust-ymyl", "Testimonials or cases", /\b(?:testimonial|patient stor(?:y|ies)|case stud(?:y|ies)|before and after)\b/iu, "Testimonials and cases require consent, representativeness, and compliance review.", "needs-human-review");
  lexical("TRUST_ASSOCIATIONS", "trust-ymyl", "Associations or publications", /\b(?:association|academy|society|publication|published|faculty|teach(?:es|ing))\b/iu, "Affiliation language must be independently confirmed before use.", "needs-human-review");
  lexical("TRUST_FINANCING", "trust-ymyl", "Financing", /\b(?:financing|payment plan|monthly payments?)\b/iu, "Financing language is observed without validating terms, eligibility, or availability.", "needs-human-review");

  add("RETRIEVAL_EXTRACTABLE_ANSWERS", "retrieval-support", "Extractable answers", input.directAnswerCount > 0 ? "observed" : input.questionCount > 0 ? "partially-observed" : "not-observed", { questions: input.questionCount, directAnswers: input.directAnswerCount }, "Question/answer proximity is inspectable retrieval-supporting evidence, not a citation guarantee.", "directAnswers");
  lexical("RETRIEVAL_DEFINITIONS", "retrieval-support", "Definitions", /\b[A-Z][\p{L}\s-]{2,40}\s+(?:is|means|refers to)\s+/u, "Definition-like language was checked with a transparent lexical pattern.");
  add("RETRIEVAL_SECTION_CLARITY", "retrieval-support", "Section clarity", input.totalHeadingCount > 1 ? "observed" : "partially-observed", { headings: input.totalHeadingCount, jumps: input.headingLevelJumps.length }, "Heading counts are structural evidence; clarity still requires human review.", "headingHierarchy", "h1,h2,h3,h4,h5,h6");
  add("RETRIEVAL_ENTITY_NAMING", "retrieval-support", "Entity naming", input.coverage.entity.present ? "observed" : "not-observed", input.coverage.entity.terms, "Explicit naming can reduce ambiguity but does not guarantee retrieval or citation.", "coverage.entity");
  add("RETRIEVAL_EVIDENCE_DENSITY", "retrieval-support", "Evidence density", input.wordCount > 0 ? "partially-observed" : "not-observed", { words: input.wordCount, headings: input.totalHeadingCount, directAnswers: input.directAnswerCount, externalDomains: input.uniqueExternalDomainCount }, "This is a transparent component inventory, not a quality score or ranking factor.", "contentCounts");

  return { libraryVersion: VERSION, observations };
}

function evidence(input: ComparableAnalysis, field: string, observedValue: unknown, selector?: string, snippet?: string): Evidence {
  return { sourceUrl: input.finalUrl, field, observedValue, fetchedAt: input.fetchedAt, ...(selector ? { selector } : {}), ...(snippet ? { snippet } : {}) };
}

function snippetAround(text: string, start: number, length: number): string {
  return text.slice(Math.max(0, start - 80), Math.min(text.length, start + length + 120)).replace(/\s+/gu, " ").trim();
}
