export type CoverageSignalKind =
  | "entity"
  | "service"
  | "location"
  | "trust"
  | "contact"
  | "content-section";

export interface CoverageSource {
  field: string;
  text: string;
  selector?: string;
}

export interface CoverageLinkSource {
  href: string;
  anchorText: string;
  selector?: string;
}

export interface CoverageExtractionInput {
  pageUrl: string;
  sources: CoverageSource[];
  jsonLdBlocks: unknown[];
  links: CoverageLinkSource[];
}

export interface CoverageSignal {
  kind: CoverageSignalKind;
  term: string;
  normalizedTerm: string;
  sourceField: string;
  selector?: string;
  snippet: string;
  method:
    | "json-ld-property"
    | "json-ld-type"
    | "explicit-text-pattern"
    | "link-protocol"
    | "section-heading";
  heuristic: boolean;
}

export interface CoverageDimension {
  present: boolean;
  count: number;
  terms: string[];
  signals: CoverageSignal[];
}

export interface CoverageMetrics {
  entity: CoverageDimension;
  service: CoverageDimension;
  location: CoverageDimension;
  trust: CoverageDimension;
  contact: CoverageDimension;
  contentSection: CoverageDimension;
}
