import type {
  AnalysisRuleInput,
  Evidence,
  Finding,
  FindingCategory,
  FindingClassification,
  Priority,
  Effort
} from "./types.js";

interface FindingDetails {
  ruleId: string;
  category: FindingCategory;
  problem: string;
  evidence: Evidence[];
  whyItMatters: string;
  exactImplementation: string;
  expectedOutcome: string;
  verificationMethod: string;
  priority: Priority;
  effort: Effort;
  classification?: FindingClassification;
}

export function evaluateRules(input: AnalysisRuleInput): Finding[] {
  const findings: Finding[] = [];
  const observed = (
    field: string,
    observedValue: unknown,
    selector?: string,
    snippet?: string
  ): Evidence => ({
    sourceUrl: input.finalUrl,
    field,
    observedValue,
    ...(selector ? { selector } : {}),
    ...(snippet ? { snippet } : {}),
    fetchedAt: input.fetchedAt
  });
  const add = (details: FindingDetails): void => {
    const classification = details.classification ?? "observation";
    findings.push({
      ...details,
      ruleVersion: "1.0.0",
      classification,
      confidence: classification === "observation" ? "high" : "medium",
      limitation: "This finding describes evidence observed on the fetched page. Missing page evidence does not prove the underlying business fact or capability is absent."
    });
  };

  if (input.statusCode < 200 || input.statusCode >= 300) {
    add({
      ruleId: "HTTP_NON_2XX",
      category: "crawl-indexability",
      problem: `The fetched page returned HTTP ${input.statusCode}, not a 2xx response.`,
      evidence: [observed("statusCode", input.statusCode)],
      whyItMatters: "Retrieval requires an accessible response; this signal does not by itself explain search or citation performance.",
      exactImplementation: "Restore the intended public page to a successful 2xx response or update incoming links and canonical references to the correct live URL.",
      expectedOutcome: "A repeat fetch receives the intended 2xx response.",
      verificationMethod: "Rerun analysis and verify statusCode is between 200 and 299.",
      priority: "high",
      effort: "medium"
    });
  }

  if ((input.redirectObserved ?? input.redirectCount > 0)) {
    add({
      ruleId: "REDIRECT_OBSERVED",
      category: "crawl-indexability",
      problem: "The requested URL resolved through at least one redirect.",
      evidence: [
        observed("normalizedUrl", input.normalizedUrl),
        observed("finalUrl", input.finalUrl),
        observed("redirectCount", input.redirectCount)
      ],
      whyItMatters: "The final URL is an observed technical signal; unnecessary redirect hops can add ambiguity or latency.",
      exactImplementation: "Confirm the redirect is intentional, then point internal links and canonical markup directly at the final preferred URL where practical.",
      expectedOutcome: "Intentional redirects remain documented and avoidable internal hops are removed.",
      verificationMethod: "Rerun analysis and inspect normalizedUrl, finalUrl, and redirectCount.",
      priority: "medium",
      effort: "low"
    });
  }

  resourceFinding(input.robotsTxtAvailable, "ROBOTS_TXT_MISSING", "robots.txt", "robotsTxtStatusCode", input.robotsTxtStatusCode, add, observed);
  resourceFinding(input.sitemapXmlAvailable, "SITEMAP_XML_MISSING", "sitemap.xml", "sitemapXmlStatusCode", input.sitemapXmlStatusCode, add, observed);

  if (input.indexability.status === "explicit-noindex") {
    add({
      ruleId: "INDEXABILITY_NOINDEX",
      category: "crawl-indexability",
      problem: "A page-level robots directive explicitly contains noindex or none.",
      evidence: [observed("robotsDirectives", input.robotsDirectives, 'meta[name="robots"]', input.robotsMeta ?? undefined)],
      whyItMatters: "An explicitly noindexed page cannot be expected to remain available in systems that honor the directive.",
      exactImplementation: "If public indexing is intended, remove only the unintended noindex/none directive after confirming the publishing policy.",
      expectedOutcome: "The page no longer exposes an unintended page-level noindex directive.",
      verificationMethod: "Rerun analysis and verify indexability.status is not explicit-noindex.",
      priority: "high",
      effort: "low"
    });
  }

  canonicalFinding(input, add, observed);
  metadataFindings(input, add, observed);
  headingFindings(input, add, observed);
  structuredDataFindings(input, add, observed);
  linkAndMediaFindings(input, add, observed);
  answerabilityFindings(input, add, observed);

  return findings;
}

export const evaluatePageRules = evaluateRules;

function canonicalFinding(
  input: AnalysisRuleInput,
  add: (details: FindingDetails) => void,
  evidence: EvidenceFactory
): void {
  if (input.canonicalStatus === "missing") {
    add({
      ruleId: "CANONICAL_MISSING",
      category: "crawl-indexability",
      problem: "No canonical link element was observed.",
      evidence: [evidence("canonicalStatus", input.canonicalStatus, 'link[rel="canonical"]')],
      whyItMatters: "A canonical identifies the preferred URL and can reduce duplicate-URL ambiguity.",
      exactImplementation: "Add one absolute HTTP(S) canonical link in the document head that points to the genuine preferred URL.",
      expectedOutcome: "The parser observes one valid canonical URL.",
      verificationMethod: "Rerun analysis and verify canonicalStatus is match.",
      priority: "high",
      effort: "low"
    });
  } else if (input.canonicalStatus === "mismatch") {
    add({
      ruleId: "CANONICAL_MISMATCH",
      category: "crawl-indexability",
      problem: "The resolved canonical differs from the fetched final URL.",
      evidence: [evidence("canonicalResolvedUrl", input.canonicalResolvedUrl, 'link[rel="canonical"]', input.canonicalUrl ?? undefined), evidence("finalUrl", input.finalUrl)],
      whyItMatters: "A mismatch is a directly observed preferred-URL signal and should be reviewed; it can also be intentional.",
      exactImplementation: "Confirm the preferred URL. If this page should be self-canonical, update the canonical href to the exact final URL; otherwise document the intentional consolidation.",
      expectedOutcome: "The canonical relationship matches the documented URL policy.",
      verificationMethod: "Rerun and verify canonicalStatus is match, or retain documented evidence for an intentional mismatch.",
      priority: "high",
      effort: "low"
    });
  } else if (input.canonicalStatus === "invalid") {
    add({
      ruleId: "CANONICAL_INVALID",
      category: "crawl-indexability",
      problem: "The canonical href is empty, malformed, or uses an unsupported protocol.",
      evidence: [evidence("canonicalUrl", input.canonicalUrl, 'link[rel="canonical"]', input.canonicalError ?? undefined)],
      whyItMatters: "An invalid canonical cannot communicate a usable preferred HTTP(S) URL.",
      exactImplementation: "Replace the href with one valid absolute HTTP(S) preferred URL and keep only the intended canonical element.",
      expectedOutcome: "The canonical parses successfully and has a clear relationship to the final URL.",
      verificationMethod: "Rerun and verify canonicalStatus is match or an intentional mismatch, never invalid.",
      priority: "high",
      effort: "low"
    });
  }
}

function metadataFindings(input: AnalysisRuleInput, add: AddFinding, evidence: EvidenceFactory): void {
  if (!input.title) {
    add(simple("TITLE_MISSING", "metadata", "The document has no non-empty title.", [evidence("title", input.title, "title")], "A title provides an explicit page identity.", "Add a concise, accurate title element that uniquely identifies this page.", "The title is present and accurately describes the page.", "Rerun and verify title is non-null.", "high", "low"));
  } else if (input.titleLength < 30) {
    add(lengthFinding("TITLE_LENGTH_SHORT", "title", input.titleLength, input.title, "shorter than 30 characters", "30–60 character review range", evidence));
  } else if (input.titleLength > 60) {
    add(lengthFinding("TITLE_LENGTH_LONG", "title", input.titleLength, input.title, "longer than 60 characters", "30–60 character review range", evidence));
  }

  if (!input.metaDescription) {
    add(simple("META_DESCRIPTION_MISSING", "metadata", "No non-empty meta description was observed.", [evidence("metaDescription", input.metaDescription, 'meta[name="description"]')], "A clear summary can improve page interpretation and search presentation, but it is not a ranking guarantee.", "Add an accurate, page-specific meta description supported by visible content.", "The page exposes a useful summary without invented claims.", "Rerun and verify metaDescription is non-null.", "medium", "low"));
  } else if (input.metaDescriptionLength < 70) {
    add(lengthFinding("META_DESCRIPTION_LENGTH_SHORT", "metaDescription", input.metaDescriptionLength, input.metaDescription, "shorter than 70 characters", "70–160 character review range", evidence));
  } else if (input.metaDescriptionLength > 160) {
    add(lengthFinding("META_DESCRIPTION_LENGTH_LONG", "metaDescription", input.metaDescriptionLength, input.metaDescription, "longer than 160 characters", "70–160 character review range", evidence));
  }

  if (!input.documentLanguage) {
    add(simple("DOCUMENT_LANGUAGE_MISSING", "metadata", "The html element has no non-empty lang attribute.", [evidence("documentLanguage", input.documentLanguage, "html")], "An explicit language helps user agents interpret and pronounce the document.", "Set the html lang attribute to the page's actual BCP 47 language tag.", "The document exposes its actual language.", "Rerun and verify documentLanguage.", "medium", "low"));
  }
  if (!input.viewportPresent) {
    add(simple("VIEWPORT_MISSING", "metadata", "No viewport meta element was observed.", [evidence("viewportPresent", false, 'meta[name="viewport"]')], "A viewport declaration supports predictable rendering on mobile devices.", "Add a conventional viewport meta element after confirming the site's responsive behavior.", "Mobile browsers receive the intended layout viewport.", "Rerun and verify viewportPresent is true.", "medium", "low"));
  }
}

function headingFindings(input: AnalysisRuleInput, add: AddFinding, evidence: EvidenceFactory): void {
  if (input.h1Count === 0) {
    add(simple("HEADING_MISSING_H1", "heading-structure", "No H1 element was observed.", [evidence("h1Count", 0, "h1")], "A primary heading makes the page's visible subject explicit.", "Add one accurate visible H1 for the page's primary subject.", "The page has an explicit primary heading.", "Rerun and verify h1Count is at least one.", "high", "low"));
  }
  if (input.h1Count > 1) {
    add(simple("HEADING_MULTIPLE_H1", "heading-structure", `${input.h1Count} H1 elements were observed. This is raw structure evidence, not an automatic claim of harm.`, [evidence("h1Text", input.h1Text, "h1")], "Repeated responsive markup or intentional document sections can explain multiple H1s; accidental duplication can make the primary subject less explicit.", "Inspect the rendered variants. Consolidate only accidental duplicates while preserving legitimate, accessible responsive content.", "The heading structure reflects the intentional document outline.", "Rerun and compare h1Count and h1Text after the template change.", "medium", "medium"));
  }
  if (input.emptyHeadingCount > 0) {
    add(simple("HEADING_EMPTY", "heading-structure", `${input.emptyHeadingCount} heading elements contain no normalized text.`, [evidence("emptyHeadingCount", input.emptyHeadingCount, "h1, h2, h3, h4, h5, h6")], "Empty headings add outline structure without a readable label.", "Remove unintended empty headings or provide an accurate visible heading label.", "Every retained heading has meaningful text.", "Rerun and verify emptyHeadingCount is zero.", "medium", "low"));
  }
  if (input.headingLevelJumps.length > 0) {
    add(simple("HEADING_LEVEL_JUMP", "heading-structure", "At least one adjacent heading increases by more than one level.", [evidence("headingLevelJumps", input.headingLevelJumps, "h1, h2, h3, h4, h5, h6")], "A sequential hierarchy can make section nesting easier to inspect and navigate.", "Review each recorded jump and use the heading level that matches the actual section nesting.", "Observed jumps are resolved without changing headings solely for appearance.", "Rerun and verify headingLevelJumps is empty or intentionally documented.", "medium", "low"));
  }
  if (input.repeatedHeadings.length > 0) {
    add(simple("HEADING_REPEATED_TEXT", "heading-structure", "Identical normalized heading text appears more than once.", [evidence("repeatedHeadings", input.repeatedHeadings, "h1, h2, h3, h4, h5, h6")], "The duplicate may be intentional responsive markup; raw repetition warrants template review but does not prove a retrieval problem.", "Inspect rendered and hidden variants, then remove or differentiate only accidental repeated section labels.", "Every repeated heading is intentional or corrected.", "Rerun and inspect repeatedHeadings with the rendered page.", "low", "medium"));
  }
}

function structuredDataFindings(input: AnalysisRuleInput, add: AddFinding, evidence: EvidenceFactory): void {
  if (input.jsonLdRawBlocks.length === 0) {
    add(simple("JSONLD_MISSING", "structured-data", "No JSON-LD script block was observed.", [evidence("jsonLdRawBlocks", [], 'script[type="application/ld+json"]')], "Accurate structured data can make page and entity types explicit, but it does not guarantee ranking or citation.", "Add JSON-LD only for entities and page features that are truthful and visible; do not fabricate reviews, ratings, credentials, addresses, or claims.", "Supported visible facts have matching machine-readable representation.", "Validate the JSON-LD and rerun to inspect schemaTypes.", "medium", "medium"));
  }
  if (input.jsonLdParseErrors.length > 0) {
    add(simple("JSONLD_INVALID", "structured-data", `${input.jsonLdParseErrors.length} JSON-LD block(s) could not be parsed.`, input.jsonLdParseErrors.map((error) => evidence("jsonLdParseErrors", error, error.selector, error.raw.slice(0, 240))), "Malformed JSON-LD cannot provide reliable machine-readable evidence.", "Correct the JSON syntax without changing the underlying factual claims, then validate each block.", "Every retained JSON-LD block parses successfully.", "Rerun and verify jsonLdParseErrors is empty.", "high", "low"));
  }

  const schema = new Set(input.schemaTypes.map((type) => type.toLocaleLowerCase("en-US")));
  const identityTypes = ["organization", "corporation", "localbusiness", "medicalbusiness", "dentist", "physician", "person"];
  const homePage = isHomePage(input.finalUrl);
  const identityRelevant = homePage && (input.coverage.entity.present || input.coverage.service.present || input.coverage.location.present || input.coverage.contact.present);
  if (identityRelevant && !identityTypes.some((type) => schema.has(type))) {
    add(simple("IDENTITY_SCHEMA_MISSING", "structured-data", "Identity-relevant visible signals were observed on the home page, but no Organization/LocalBusiness-style identity type was parsed.", [evidence("schemaTypes", input.schemaTypes), evidence("coverage", input.coverage)], "Accurate identity schema can reduce ambiguity about who operates the site; relevance is a labeled heuristic.", "Add the most specific truthful identity schema supported by visible content. Do not invent addresses, credentials, ratings, or claims.", "The chosen identity type and properties match visible business evidence.", "Validate JSON-LD and rerun to inspect schemaTypes and coverage.", "medium", "medium", "editorial-heuristic"));
  }
  if (!homePage && input.breadcrumbIndicators.length > 0 && !schema.has("breadcrumblist")) {
    add(simple("BREADCRUMB_SCHEMA_MISSING", "structured-data", "Visible breadcrumb navigation was observed on a non-home URL without parsed BreadcrumbList schema.", [evidence("breadcrumbIndicators", input.breadcrumbIndicators), evidence("schemaTypes", input.schemaTypes)], "Breadcrumb markup can explicitly describe the already-visible navigation hierarchy; the rule does not recommend inventing breadcrumbs.", "If the visible breadcrumbs represent the real site hierarchy, add matching BreadcrumbList JSON-LD with the same destinations and labels.", "Visible navigation and structured breadcrumbs agree.", "Validate the markup and rerun to confirm BreadcrumbList is parsed.", "low", "medium", "editorial-heuristic"));
  }
}

function linkAndMediaFindings(input: AnalysisRuleInput, add: AddFinding, evidence: EvidenceFactory): void {
  if (input.internalLinkCount === 0) {
    add(simple("INTERNAL_LINKS_MISSING", "links-media", "No crawlable internal HTTP(S) links were observed.", [evidence("internalLinkCount", 0, "a[href]")], "Internal links expose on-site discovery paths and page relationships.", "Add descriptive links to genuinely relevant internal destinations where they help a reader continue.", "The page exposes useful internal relationships.", "Rerun and inspect links and uniqueInternalUrls.", "high", "medium"));
  } else if (input.internalLinkCount < 3) {
    add(simple("INTERNAL_LINKS_LOW", "links-media", `Only ${input.internalLinkCount} crawlable internal links were observed.`, [evidence("internalLinkCount", input.internalLinkCount, "a[href]")], "This threshold is a transparent review heuristic, not a ranking law; a small focused page may need few links.", "Review whether users need additional contextual links to real related pages; do not add links solely to meet the threshold.", "Any added link serves a clear navigation or context purpose.", "Rerun and inspect link destinations and anchorTextSummary.", "low", "low", "editorial-heuristic"));
  }
  if (input.imagesMissingAlt > 0) {
    add(simple("IMAGE_ALT_MISSING", "links-media", `${input.imagesMissingAlt} image(s) have a missing or empty alt value.`, input.imageAltIssues.map((issue) => evidence("imageAltIssues", issue, issue.selector, issue.src ?? undefined)), "Informative images need useful alternatives; empty alt can be correct for intentionally decorative images.", "Add concise factual alt text to informative images. Retain empty alt for decorative images after confirming that intent.", "Every image has an intentional accessible-text treatment.", "Rerun and review imageAltIssues alongside the rendered image context.", "medium", "low"));
  }
  if (input.emptyAnchorCount > 0) {
    const emptyLinks = input.links.filter((link) => !link.anchorText);
    add(simple("EMPTY_ANCHOR_TEXT", "links-media", `${input.emptyAnchorCount} crawlable link(s) have no text content.`, emptyLinks.map((link) => evidence("links", link, link.selector, link.resolvedUrl)), "Links without a discernible label can be hard to understand; an image or ARIA label may supply context not represented by text alone.", "Give each actionable link a descriptive visible or accessible name and verify image-link alternatives where applicable.", "Every retained link has an understandable purpose.", "Rerun and review emptyAnchorCount with an accessibility inspection.", "medium", "low"));
  }
}

function answerabilityFindings(input: AnalysisRuleInput, add: AddFinding, evidence: EvidenceFactory): void {
  if (input.questionCount > 0 && input.directAnswerCount === 0) {
    add(simple("DIRECT_ANSWER_MISSING", "answerability", "Question text was detected, but no question heading followed by an answer paragraph (or valid JSON-LD answer) was observed.", [evidence("detectedQuestions", input.detectedQuestions), evidence("directAnswerCount", 0)], "A nearby direct answer can make factual content easier to locate; this is an answerability heuristic, not an AI-ranking prediction.", "Where the question represents a real user need, place a concise accurate answer immediately after it, followed by supporting detail.", "Relevant questions have inspectable answers without invented claims.", "Rerun and verify directAnswers contains the intended question-answer pair.", "medium", "medium", "editorial-heuristic"));
  }

  const businessRelevant = input.coverage.service.present || input.coverage.location.present || input.coverage.contact.present;
  if (businessRelevant && !input.coverage.entity.present) {
    add(coverageFinding("ENTITY_COVERAGE_MISSING", "entity", "No explicit entity name was extracted from supported JSON-LD or og:site_name evidence.", "State the real organization or provider name in visible content and matching metadata/schema where appropriate.", input, evidence));
  }
  if (isHomePage(input.finalUrl) && input.wordCount >= 100 && (input.coverage.entity.present || input.coverage.contact.present) && !input.coverage.service.present) {
    add(coverageFinding("SERVICE_COVERAGE_MISSING", "service", "No supported explicit service term was extracted from a content-rich home page.", "Describe the actual services offered using original, factual visible language.", input, evidence));
  }

  const localSchema = input.schemaTypes.some((type) => ["localbusiness", "medicalbusiness", "dentist", "physician"].includes(type.toLocaleLowerCase("en-US")));
  if (localSchema && !input.coverage.location.present) {
    add(coverageFinding("LOCATION_COVERAGE_MISSING", "location", "A local-business-style schema type was observed without an extracted location signal.", "Add only the genuine served location or business address to visible content and consistent structured data.", input, evidence));
  }
  if (localSchema && !input.coverage.contact.present) {
    add(coverageFinding("CONTACT_SIGNALS_MISSING", "contact", "A local-business-style schema type was observed without an extracted contact signal.", "Add real contact details where appropriate and keep visible and structured representations consistent.", input, evidence));
  }
}

function coverageFinding(ruleId: string, dimension: "entity" | "service" | "location" | "contact", problem: string, implementation: string, input: AnalysisRuleInput, evidence: EvidenceFactory): FindingDetails {
  return simple(ruleId, "entity-coverage", problem, [evidence(`coverage.${dimension}`, input.coverage[dimension])], "Explicit evidence can reduce ambiguity about who, what, or where; this deterministic coverage check is a labeled heuristic, not semantic understanding.", implementation, "The relevant dimension has truthful, source-linked evidence.", `Rerun and inspect coverage.${dimension}.signals and their source fields.`, "medium", "medium", "editorial-heuristic");
}

function resourceFinding(available: boolean, ruleId: string, label: string, statusField: string, statusCode: number | null, add: AddFinding, evidence: EvidenceFactory): void {
  if (available) return;
  add(simple(ruleId, "crawl-indexability", `${label} was not available at the checked site-root URL.`, [evidence(statusField, statusCode)], `${label} can expose crawl guidance or discovery paths; absence does not prove that pages cannot be found.`, `Publish a valid ${label} at the checked origin if it supports the site's crawl policy.`, `A repeat check receives a successful response for ${label}.`, `Rerun and verify the corresponding availability and status fields.`, "medium", "low"));
}

function lengthFinding(ruleId: string, field: "title" | "metaDescription", length: number, text: string, problemRange: string, reviewRange: string, evidence: EvidenceFactory): FindingDetails {
  return simple(ruleId, "metadata", `The ${field} is ${problemRange}.`, [evidence(`${field}Length`, length), evidence(field, text)], `The ${reviewRange} is a transparent editorial heuristic, not a ranking law or guarantee.`, `Review the ${field} for clarity and accuracy; revise only if doing so improves the page summary rather than merely hitting a character count.`, `The ${field} communicates the page purpose without truncation-driven wording or invented claims.`, `Rerun and inspect ${field}, ${field}Length, and the rendered search presentation where available.`, "low", "low", "editorial-heuristic");
}

function simple(ruleId: string, category: FindingCategory, problem: string, evidence: Evidence[], whyItMatters: string, exactImplementation: string, expectedOutcome: string, verificationMethod: string, priority: Priority, effort: Effort, classification: FindingClassification = "observation"): FindingDetails {
  return { ruleId, category, problem, evidence, whyItMatters, exactImplementation, expectedOutcome, verificationMethod, priority, effort, classification };
}

function isHomePage(value: string): boolean {
  try {
    const pathname = new URL(value).pathname.replace(/\/+$/u, "");
    return pathname === "";
  } catch {
    return false;
  }
}

type AddFinding = (details: FindingDetails) => void;
type EvidenceFactory = (field: string, observedValue: unknown, selector?: string, snippet?: string) => Evidence;
