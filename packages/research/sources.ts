export type ResearchSourceType =
  | "internet-standard"
  | "official-guidance"
  | "schema-vocabulary"
  | "accessibility-guidance"
  | "internal-heuristic";

export type ResearchConfidence = "high" | "medium" | "bounded";

export interface ResearchSource {
  sourceId: string;
  registryVersion: string;
  publisher: string;
  title: string;
  url: string | null;
  publishedAt: string | null;
  accessedAt: string;
  sourceType: ResearchSourceType;
  claimSupported: string;
  applicableAnalyzers: string[];
  confidence: ResearchConfidence;
  notes: string;
}

export const RESEARCH_SOURCE_REGISTRY_VERSION = "1.0.0";

const ACCESSED_AT = "2026-07-16";

export const researchSources: readonly ResearchSource[] = [
  {
    sourceId: "RFC-9309",
    registryVersion: RESEARCH_SOURCE_REGISTRY_VERSION,
    publisher: "IETF / RFC Editor",
    title: "RFC 9309: Robots Exclusion Protocol",
    url: "https://www.rfc-editor.org/rfc/rfc9309",
    publishedAt: "2022-09",
    accessedAt: ACCESSED_AT,
    sourceType: "internet-standard",
    claimSupported: "robots.txt is a crawler access-control convention with defined matching and access-result behavior; it is not authorization.",
    applicableAnalyzers: ["TECH_INDEXABILITY"],
    confidence: "high",
    notes: "Supports crawler behavior and the limitation around robots evidence. It does not establish whether a URL is indexed by any search engine."
  },
  {
    sourceId: "GOOGLE-ROBOTS-META",
    registryVersion: RESEARCH_SOURCE_REGISTRY_VERSION,
    publisher: "Google Search Central",
    title: "Robots meta tag, data-nosnippet, and X-Robots-Tag specifications",
    url: "https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag",
    publishedAt: null,
    accessedAt: ACCESSED_AT,
    sourceType: "official-guidance",
    claimSupported: "Supported page-level robots directives can control Google crawling and indexing behavior when Google can access the page.",
    applicableAnalyzers: ["TECH_INDEXABILITY"],
    confidence: "high",
    notes: "Product-specific documentation. The analyzer observes directives but does not query an external index."
  },
  {
    sourceId: "GOOGLE-STRUCTURED-DATA",
    registryVersion: RESEARCH_SOURCE_REGISTRY_VERSION,
    publisher: "Google Search Central",
    title: "Understand how structured data works",
    url: "https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data",
    publishedAt: null,
    accessedAt: ACCESSED_AT,
    sourceType: "official-guidance",
    claimSupported: "Valid structured data provides explicit page information to Google, while eligibility does not guarantee a search appearance.",
    applicableAnalyzers: ["TECH_STRUCTURED_DATA", "ENTITY_SCHEMA_VISIBLE_CONSISTENCY"],
    confidence: "high",
    notes: "Supports parsing and consistency review only; no visibility or ranking outcome is inferred."
  },
  {
    sourceId: "SCHEMA-ORG-ORGANIZATION",
    registryVersion: RESEARCH_SOURCE_REGISTRY_VERSION,
    publisher: "Schema.org",
    title: "Organization",
    url: "https://schema.org/Organization",
    publishedAt: null,
    accessedAt: ACCESSED_AT,
    sourceType: "schema-vocabulary",
    claimSupported: "Organization and its subtypes provide a shared vocabulary for organization, location, and contact properties.",
    applicableAnalyzers: ["ENTITY_ORGANIZATION", "ENTITY_LOCATION", "ENTITY_CONTACT", "ENTITY_PROVIDER", "ENTITY_SCHEMA_VISIBLE_CONSISTENCY"],
    confidence: "high",
    notes: "Vocabulary documentation does not verify the truth of marked-up facts or promise use by a retrieval system."
  },
  {
    sourceId: "SCHEMA-ORG-FAQPAGE",
    registryVersion: RESEARCH_SOURCE_REGISTRY_VERSION,
    publisher: "Schema.org",
    title: "FAQPage",
    url: "https://schema.org/FAQPage",
    publishedAt: null,
    accessedAt: ACCESSED_AT,
    sourceType: "schema-vocabulary",
    claimSupported: "FAQPage, Question, and Answer provide a shared vocabulary for explicit question-and-answer content.",
    applicableAnalyzers: ["CONTENT_QUESTIONS", "CONTENT_DIRECT_ANSWERS", "RETRIEVAL_EXTRACTABLE_ANSWERS"],
    confidence: "high",
    notes: "The current analyzer uses visible-text proximity, not FAQ schema eligibility, and makes no rich-result claim."
  },
  {
    sourceId: "WCAG-22-NON-TEXT",
    registryVersion: RESEARCH_SOURCE_REGISTRY_VERSION,
    publisher: "W3C Web Accessibility Initiative",
    title: "Understanding Success Criterion 1.1.1: Non-text Content",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html",
    publishedAt: "2023-10-05",
    accessedAt: ACCESSED_AT,
    sourceType: "accessibility-guidance",
    claimSupported: "Non-text content generally needs a text alternative serving an equivalent purpose, with contextual exceptions.",
    applicableAnalyzers: ["TECH_IMAGE_ALT"],
    confidence: "high",
    notes: "A missing-alt count cannot determine whether an image is decorative or whether alternative text is appropriate."
  },
  {
    sourceId: "AILAB-TECHNICAL-HEURISTICS-1",
    registryVersion: RESEARCH_SOURCE_REGISTRY_VERSION,
    publisher: "AI Visibility Lab",
    title: "Deterministic technical inspection heuristics",
    url: null,
    publishedAt: "2026-07-16",
    accessedAt: ACCESSED_AT,
    sourceType: "internal-heuristic",
    claimSupported: "HTTP status, canonical relationships, and heading structure can be observed reproducibly from a fetched HTML response.",
    applicableAnalyzers: ["TECH_HTTP_STATUS", "TECH_CANONICAL", "TECH_HEADING_STRUCTURE"],
    confidence: "bounded",
    notes: "These are inspectable implementation heuristics, not search-engine ranking factors or outcome predictions."
  },
  {
    sourceId: "AILAB-CONTENT-HEURISTICS-1",
    registryVersion: RESEARCH_SOURCE_REGISTRY_VERSION,
    publisher: "AI Visibility Lab",
    title: "Deterministic answerability and service-content heuristics",
    url: null,
    publishedAt: "2026-07-16",
    accessedAt: ACCESSED_AT,
    sourceType: "internal-heuristic",
    claimSupported: "Explicit lexical signals and question-answer proximity can be inventoried consistently for human research review.",
    applicableAnalyzers: [
      "CONTENT_PRICING", "CONTENT_INSURANCE", "CONTENT_PROCESS", "CONTENT_RISKS", "CONTENT_ALTERNATIVES",
      "CONTENT_ELIGIBILITY", "CONTENT_REVIEW_DATE", "ENTITY_SERVICE"
    ],
    confidence: "bounded",
    notes: "Lexical presence is not factual completeness, professional adequacy, or proof that an AI system will retrieve or cite the content."
  },
  {
    sourceId: "AILAB-TRUST-HEURISTICS-1",
    registryVersion: RESEARCH_SOURCE_REGISTRY_VERSION,
    publisher: "AI Visibility Lab",
    title: "Deterministic trust-signal inventory heuristics",
    url: null,
    publishedAt: "2026-07-16",
    accessedAt: ACCESSED_AT,
    sourceType: "internal-heuristic",
    claimSupported: "Visible credential, review, citation, policy, testimonial, affiliation, and financing language can be inventoried for manual verification.",
    applicableAnalyzers: [
      "TRUST_CREDENTIALS", "TRUST_MEDICAL_REVIEW", "TRUST_CITATIONS", "TRUST_POLICIES",
      "TRUST_TESTIMONIALS", "TRUST_ASSOCIATIONS", "TRUST_FINANCING"
    ],
    confidence: "bounded",
    notes: "Presence is not verification. All professional, medical, legal, financial, and testimonial claims require qualified review."
  },
  {
    sourceId: "AILAB-RETRIEVAL-HEURISTICS-1",
    registryVersion: RESEARCH_SOURCE_REGISTRY_VERSION,
    publisher: "AI Visibility Lab",
    title: "Deterministic retrieval-support inspection heuristics",
    url: null,
    publishedAt: "2026-07-16",
    accessedAt: ACCESSED_AT,
    sourceType: "internal-heuristic",
    claimSupported: "Definitions, section structure, explicit entity naming, and evidence-component counts can be inspected as research inputs.",
    applicableAnalyzers: [
      "RETRIEVAL_DEFINITIONS", "RETRIEVAL_SECTION_CLARITY", "RETRIEVAL_ENTITY_NAMING", "RETRIEVAL_EVIDENCE_DENSITY"
    ],
    confidence: "bounded",
    notes: "These observations are not a visibility score, citation probability, model behavior measurement, or ranking-factor claim."
  }
];

export function sourcesForAnalyzer(analyzerId: string): ResearchSource[] {
  return researchSources.filter((source) => source.applicableAnalyzers.includes(analyzerId));
}
