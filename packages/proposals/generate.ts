import type { ComparisonGap } from "../comparison/types.js";
import { PROPOSAL_REVIEW_LABEL, type ImplementationArtifact, type ImplementationArtifactType } from "./types.js";

const VERSION = "1.0.0";

export function generateImplementationArtifacts(input: { targetGaps: ComparisonGap[] }): ImplementationArtifact[] {
  return input.targetGaps.map((gap) => {
    const artifactType = artifactTypeForGap(gap);
    return {
      artifactId: `PROPOSAL_${gap.ruleId}`,
      artifactVersion: VERSION,
      artifactType,
      status: "proposal",
      label: PROPOSAL_REVIEW_LABEL,
      sourceFinding: { ruleId: gap.ruleId, metric: gap.metric },
      evidence: gap.targetEvidence.map((item) => ({ ...item })),
      proposedArtifact: templateFor(artifactType, gap),
      assumptions: [
        "The cited target-page evidence is still current at implementation time.",
        "The proposed component is relevant to the page's real user purpose."
      ],
      factsToConfirm: factsFor(artifactType),
      reviewRequirement: reviewFor(artifactType),
      verificationSteps: [
        gap.verificationMethod,
        "Inspect the rendered page and source to confirm the proposal matches visible content.",
        "Rerun the deterministic comparison and confirm the source finding by stable rule ID."
      ]
    };
  });
}

function artifactTypeForGap(gap: ComparisonGap): ImplementationArtifactType {
  if (["hasTitle", "titleLength"].includes(gap.metric)) return "title";
  if (["hasMetaDescription", "descriptionLength"].includes(gap.metric)) return "meta-description";
  if (["canonicalMatches", "canonicalStatus"].includes(gap.metric)) return "canonical";
  if (["h1Count", "h1StructureValid", "totalHeadingCount", "headingJumpCount", "emptyHeadingCount", "repeatedHeadingCount"].includes(gap.metric)) return "heading-structure";
  if (["questionCount", "faqIndicatorCount", "directAnswerCount", "detectedQuestions"].includes(gap.metric)) return "visible-faq-and-jsonld";
  if (["schemaTypes", "schemaTypeCount", "jsonLdParseErrorCount"].includes(gap.metric)) return "structured-data";
  if (["hasIdentitySignals", "hasTrustSignals"].includes(gap.metric)) return "provider-or-reviewer-block";
  if (["hasContactSignals", "hasLocationSignals", "locationTermCount"].includes(gap.metric)) return "trust-or-contact-block";
  if (["internalLinkCount", "uniqueInternalUrlCount", "emptyAnchorCount"].includes(gap.metric)) return "internal-links";
  if (["imagesMissingAltCount", "imageCount"].includes(gap.metric)) return "image-alt-guidance";
  if (["topicTerms", "topicTermCount", "serviceTermCount", "wordCount"].includes(gap.metric)) return "page-brief";
  if (gap.category === "trust") return "references-and-risk-section";
  return "comparison-table";
}

function templateFor(type: ImplementationArtifactType, gap: ComparisonGap): string {
  const templates: Record<ImplementationArtifactType, string> = {
    title: "<title>[Confirmed page subject] | [Confirmed organization name]</title>",
    "meta-description": '<meta name="description" content="[Original factual summary of the page, reviewed for accuracy]">',
    canonical: '<link rel="canonical" href="https://[confirmed-preferred-public-url]">',
    "heading-structure": "<main>\n  <h1>[Accurate primary page topic]</h1>\n  <section>\n    <h2>[Descriptive section]</h2>\n    <p>[Reviewed factual content]</p>\n  </section>\n</main>",
    "visible-faq-and-jsonld": '<section aria-labelledby="faq-heading">\n  <h2 id="faq-heading">Frequently asked questions</h2>\n  <h3>[Confirmed user question]</h3>\n  <p>[Professionally reviewed factual answer]</p>\n</section>\n<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "FAQPage",\n  "mainEntity": [{\n    "@type": "Question",\n    "name": "[Exact visible confirmed question]",\n    "acceptedAnswer": { "@type": "Answer", "text": "[Exact visible reviewed answer]" }\n  }]\n}\n</script>',
    "structured-data": '<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "[Type that truthfully describes the visible page]",\n  "name": "[Exact visible, confirmed name]"\n}\n</script>',
    "provider-or-reviewer-block": '<aside aria-labelledby="review-heading">\n  <h2 id="review-heading">About the author or reviewer</h2>\n  <p>[Confirmed full name, role, relevant verifiable qualifications, and review date]</p>\n</aside>',
    "references-and-risk-section": '<section>\n  <h2>References, risks, and alternatives</h2>\n  <p>[Professionally reviewed limitations, material risks, and appropriate alternatives]</p>\n  <ul><li><a href="[authoritative-source-url]">[Source supporting the adjacent claim]</a></li></ul>\n</section>',
    "trust-or-contact-block": '<section>\n  <h2>Contact and service information</h2>\n  <address>[Confirmed current organization, address, phone, and service-area details]</address>\n</section>',
    "internal-links": '<nav aria-label="Related information">\n  <ul><li><a href="/[confirmed-related-page]">[Descriptive destination label]</a></li></ul>\n</nav>',
    "page-brief": `Page brief\n- Source rule: ${gap.ruleId}\n- Observed difference: ${gap.exactDifference}\n- User need to validate: [research question]\n- Facts and claims: [confirm with owner/professional]\n- Sections: [original outline]\n- Evidence and references: [authoritative sources]`,
    "comparison-table": '<table>\n  <caption>[Accurate comparison scope]</caption>\n  <thead><tr><th>Option</th><th>[Confirmed attribute]</th></tr></thead>\n  <tbody><tr><th>[Real option]</th><td>[Verified factual value]</td></tr></tbody>\n</table>',
    "image-alt-guidance": "For each informative image: document its purpose, then add concise alternative text conveying the same information. For a decorative image: use alt=\"\" after accessibility review."
  };
  return templates[type];
}

function factsFor(type: ImplementationArtifactType): string[] {
  const common = ["Confirm every organization, service, location, person, date, and claim appearing in the artifact."];
  if (type === "canonical") return [...common, "Confirm the preferred public URL, redirects, duplicate variants, and deployment environment."];
  if (type === "provider-or-reviewer-block") return [...common, "Confirm identity, role, qualifications, licensure where applicable, authorship, reviewer responsibility, and review date."];
  if (type === "visible-faq-and-jsonld") return [...common, "Confirm each question is a real user need and JSON-LD exactly matches the visible reviewed answer."];
  if (type === "structured-data") return [...common, "Confirm every schema type and property is supported by the visible page and current Schema.org vocabulary."];
  if (type === "trust-or-contact-block") return [...common, "Confirm current address, telephone, service area, availability, and responsible organization."];
  return common;
}

function reviewFor(type: ImplementationArtifactType): string {
  if (["provider-or-reviewer-block", "references-and-risk-section", "visible-faq-and-jsonld"].includes(type)) {
    return "Factual, editorial, legal/compliance, and qualified professional review are required; medical/YMYL claims need appropriate clinical review.";
  }
  return "Factual and editorial review are required; add legal, accessibility, compliance, or professional review where the page context requires it.";
}
