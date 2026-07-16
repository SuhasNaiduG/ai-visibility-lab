import type { Evidence } from "../rules/types.js";

export const PROPOSAL_REVIEW_LABEL = "Proposal — requires factual and professional review before publication.";

export type ImplementationArtifactType =
  | "title"
  | "meta-description"
  | "canonical"
  | "heading-structure"
  | "visible-faq-and-jsonld"
  | "structured-data"
  | "provider-or-reviewer-block"
  | "references-and-risk-section"
  | "trust-or-contact-block"
  | "internal-links"
  | "page-brief"
  | "comparison-table"
  | "image-alt-guidance";

export interface ImplementationArtifact {
  artifactId: string;
  artifactVersion: string;
  artifactType: ImplementationArtifactType;
  status: "proposal";
  label: typeof PROPOSAL_REVIEW_LABEL;
  sourceFinding: {
    ruleId: string;
    metric: string;
  };
  evidence: Evidence[];
  proposedArtifact: string;
  assumptions: string[];
  factsToConfirm: string[];
  reviewRequirement: string;
  verificationSteps: string[];
}
