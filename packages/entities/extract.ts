import type {
  CoverageDimension,
  CoverageExtractionInput,
  CoverageMetrics,
  CoverageSignal,
  CoverageSignalKind,
  CoverageSource
} from "./types.js";

const IDENTITY_SCHEMA_TYPES = new Set([
  "organization",
  "corporation",
  "localbusiness",
  "medicalbusiness",
  "dentist",
  "physician",
  "person"
]);

const SERVICE_SCHEMA_TYPES = new Set([
  "service",
  "product",
  "offer",
  "medicalprocedure"
]);

const SERVICE_PATTERN =
  /\b(?:services?|treatments?|consultations?|care|therapy|repairs?|installations?|solutions?|aligners?|dentistry|orthodontics?|pricing)\b/giu;
const TRUST_PATTERN =
  /\b(?:author|provider|doctor(?:-led)?|dentist|physician|specialist|licensed|certified|credentials?|experience|our team|about us)\b/giu;
const CONTACT_PATTERN =
  /\b(?:contact us|call us|email us|telephone|phone|address|directions|book (?:a |an )?(?:visit|appointment|consultation))\b/giu;
const EMAIL_PATTERN =
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const PHONE_PATTERN =
  /(?:\+?\d[\d\s().-]{7,}\d)/gu;
const LOCATION_PATTERN =
  /\b(?:located in|based in|serving|near|in)\s+([\p{Lu}][\p{L}.'-]+(?:\s+[\p{Lu}][\p{L}.'-]+){0,2})/gu;

const SECTION_PATTERNS: Array<{
  term: string;
  pattern: RegExp;
}> = [
  { term: "faq", pattern: /\b(?:faq|frequently asked|questions? (?:and|&) answers?)\b/i },
  { term: "services", pattern: /\b(?:services?|treatments?|what we (?:do|offer))\b/i },
  { term: "process", pattern: /\b(?:how it works|process|what to expect)\b/i },
  { term: "pricing", pattern: /\b(?:pricing|costs?|financing|fees?)\b/i },
  { term: "identity", pattern: /\b(?:about|our team|provider|doctor|author)\b/i },
  { term: "contact", pattern: /\b(?:contact|location|directions|hours)\b/i },
  { term: "trust", pattern: /\b(?:credentials?|experience|reviews?|testimonials?)\b/i },
  { term: "benefits", pattern: /\b(?:benefits?|why choose|advantages?)\b/i }
];

/**
 * Extracts only inspectable strings and labels each pattern-based inference as a
 * heuristic. This is coverage inventory, not named-entity recognition.
 */
export function extractCoverage(
  input: CoverageExtractionInput
): CoverageMetrics {
  const signals: CoverageSignal[] = [];

  for (const [index, block] of input.jsonLdBlocks.entries()) {
    collectJsonLdSignals(
      block,
      `jsonLdBlocks[${index}]`,
      `script[type="application/ld+json"]:nth-of-type(${index + 1})`,
      signals
    );
  }

  for (const source of input.sources) {
    collectTextSignals(source, signals);
  }

  for (const link of input.links) {
    const protocol = safeProtocol(link.href, input.pageUrl);

    if (protocol === "mailto:" || protocol === "tel:") {
      addSignal(signals, {
        kind: "contact",
        term: normalizeContactHref(link.href),
        sourceField: "links",
        selector: link.selector,
        snippet: link.anchorText || link.href,
        method: "link-protocol",
        heuristic: false
      });
    }
  }

  return {
    entity: buildDimension(signals, "entity"),
    service: buildDimension(signals, "service"),
    location: buildDimension(signals, "location"),
    trust: buildDimension(signals, "trust"),
    contact: buildDimension(signals, "contact"),
    contentSection: buildDimension(signals, "content-section")
  };
}

function collectJsonLdSignals(
  value: unknown,
  path: string,
  selector: string,
  signals: CoverageSignal[],
  parentTypes: string[] = []
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectJsonLdSignals(
        item,
        `${path}[${index}]`,
        selector,
        signals,
        parentTypes
      );
    });
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  const types = schemaTypes(value["@type"]);
  const effectiveTypes = types.length > 0 ? types : parentTypes;

  for (const type of types) {
    const normalizedType = normalizeTerm(type);

    if (IDENTITY_SCHEMA_TYPES.has(normalizedType)) {
      addSignal(signals, {
        kind: "trust",
        term: type,
        sourceField: `${path}.@type`,
        selector,
        snippet: type,
        method: "json-ld-type",
        heuristic: false
      });
    }

    if (SERVICE_SCHEMA_TYPES.has(normalizedType)) {
      addSignal(signals, {
        kind: "service",
        term: type,
        sourceField: `${path}.@type`,
        selector,
        snippet: type,
        method: "json-ld-type",
        heuristic: false
      });
    }
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    const stringValues = scalarStrings(child);
    const normalizedKey = key.toLowerCase();

    for (const stringValue of stringValues) {
      if (
        ["name", "legalname", "alternatename"].includes(normalizedKey) &&
        effectiveTypes.some((type) =>
          IDENTITY_SCHEMA_TYPES.has(normalizeTerm(type))
        )
      ) {
        addSignal(signals, {
          kind: "entity",
          term: stringValue,
          sourceField: childPath,
          selector,
          snippet: stringValue,
          method: "json-ld-property",
          heuristic: false
        });
      }

      if (
        ["servicetype", "itemoffered"].includes(normalizedKey) ||
        (normalizedKey === "name" &&
          effectiveTypes.some((type) =>
            SERVICE_SCHEMA_TYPES.has(normalizeTerm(type))
          ))
      ) {
        addSignal(signals, {
          kind: "service",
          term: stringValue,
          sourceField: childPath,
          selector,
          snippet: stringValue,
          method: "json-ld-property",
          heuristic: false
        });
      }

      if (
        [
          "streetaddress",
          "addresslocality",
          "addressregion",
          "addresscountry",
          "postalcode",
          "areaserved"
        ].includes(normalizedKey)
      ) {
        addSignal(signals, {
          kind: "location",
          term: stringValue,
          sourceField: childPath,
          selector,
          snippet: stringValue,
          method: "json-ld-property",
          heuristic: false
        });
      }

      if (
        ["author", "provider", "founder", "jobtitle", "credentials"].includes(
          normalizedKey
        )
      ) {
        addSignal(signals, {
          kind: "trust",
          term: stringValue,
          sourceField: childPath,
          selector,
          snippet: stringValue,
          method: "json-ld-property",
          heuristic: false
        });
      }

      if (["telephone", "email", "contacttype"].includes(normalizedKey)) {
        addSignal(signals, {
          kind: "contact",
          term: stringValue,
          sourceField: childPath,
          selector,
          snippet: stringValue,
          method: "json-ld-property",
          heuristic: false
        });
      }
    }

    collectJsonLdSignals(
      child,
      childPath,
      selector,
      signals,
      effectiveTypes
    );
  }
}

function collectTextSignals(
  source: CoverageSource,
  signals: CoverageSignal[]
): void {
  if (!source.text) {
    return;
  }

  if (source.field === "openGraph.og:site_name") {
    addSignal(signals, {
      kind: "entity",
      term: source.text,
      sourceField: source.field,
      selector: source.selector,
      snippet: source.text,
      method: "explicit-text-pattern",
      heuristic: false
    });
  }

  addMatches(signals, source, SERVICE_PATTERN, "service");
  addMatches(signals, source, TRUST_PATTERN, "trust");
  addMatches(signals, source, CONTACT_PATTERN, "contact");
  addMatches(signals, source, EMAIL_PATTERN, "contact", false);
  addMatches(signals, source, PHONE_PATTERN, "contact");

  for (const match of source.text.matchAll(LOCATION_PATTERN)) {
    const term = match[1]?.trim();

    if (term) {
      addSignal(signals, {
        kind: "location",
        term,
        sourceField: source.field,
        selector: source.selector,
        snippet: snippetAround(source.text, match.index ?? 0, match[0].length),
        method: "explicit-text-pattern",
        heuristic: true
      });
    }
  }

  if (source.field.startsWith("headingHierarchy[")) {
    for (const sectionPattern of SECTION_PATTERNS) {
      if (sectionPattern.pattern.test(source.text)) {
        addSignal(signals, {
          kind: "content-section",
          term: sectionPattern.term,
          sourceField: source.field,
          selector: source.selector,
          snippet: source.text,
          method: "section-heading",
          heuristic: false
        });
      }
    }
  }
}

function addMatches(
  signals: CoverageSignal[],
  source: CoverageSource,
  pattern: RegExp,
  kind: CoverageSignalKind,
  heuristic = true
): void {
  pattern.lastIndex = 0;

  for (const match of source.text.matchAll(pattern)) {
    const term = match[0]?.trim();

    if (term) {
      addSignal(signals, {
        kind,
        term,
        sourceField: source.field,
        selector: source.selector,
        snippet: snippetAround(source.text, match.index ?? 0, term.length),
        method: "explicit-text-pattern",
        heuristic
      });
    }
  }
}

function addSignal(
  signals: CoverageSignal[],
  signal: Omit<CoverageSignal, "normalizedTerm">
): void {
  const term = collapseWhitespace(signal.term);

  if (!term) {
    return;
  }

  const complete: CoverageSignal = {
    ...signal,
    term,
    normalizedTerm: normalizeTerm(term)
  };
  const duplicate = signals.some(
    (existing) =>
      existing.kind === complete.kind &&
      existing.normalizedTerm === complete.normalizedTerm &&
      existing.sourceField === complete.sourceField
  );

  if (!duplicate) {
    signals.push(complete);
  }
}

function buildDimension(
  signals: CoverageSignal[],
  kind: CoverageSignalKind
): CoverageDimension {
  const dimensionSignals = signals.filter((signal) => signal.kind === kind);
  const terms = [
    ...new Map(
      dimensionSignals.map((signal) => [signal.normalizedTerm, signal.term])
    ).values()
  ];

  return {
    present: dimensionSignals.length > 0,
    count: dimensionSignals.length,
    terms,
    signals: dimensionSignals
  };
}

function schemaTypes(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  return [];
}

function scalarStrings(value: unknown): string[] {
  if (typeof value === "string" || typeof value === "number") {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => scalarStrings(item));
  }

  return [];
}

function safeProtocol(href: string, pageUrl: string): string | null {
  try {
    return new URL(href, pageUrl).protocol;
  } catch {
    return null;
  }
}

function normalizeContactHref(href: string): string {
  const colonIndex = href.indexOf(":");
  return collapseWhitespace(
    colonIndex >= 0 ? href.slice(colonIndex + 1) : href
  );
}

function normalizeTerm(value: string): string {
  return collapseWhitespace(value).toLocaleLowerCase("en-US");
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function snippetAround(
  text: string,
  start: number,
  length: number
): string {
  const snippetStart = Math.max(0, start - 45);
  const snippetEnd = Math.min(text.length, start + length + 45);
  return collapseWhitespace(text.slice(snippetStart, snippetEnd));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
