import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { compareAnalyses } from "../comparison/compare.js";
import { diffRuns } from "../comparison/diff.js";
import {
  classifyComparisonEligibility,
  COMPARISON_INCOMPLETE_MESSAGE
} from "../comparison/eligibility.js";
import type {
  ComparableAnalysis,
  ComparisonEligibility,
  ComparisonSite
} from "../comparison/types.js";
import {
  APPLICATION_VERSION,
  STORAGE_SCHEMA_VERSION,
  type NewRunRecord,
  type RunRecord,
  type RunStore,
  type RunSummary
} from "./types.js";

const httpUrlSchema = z.url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "Only HTTP and HTTPS URLs are supported");

const evidenceSchema = z.looseObject({
  sourceUrl: httpUrlSchema,
  field: z.string().min(1),
  observedValue: z.unknown(),
  fetchedAt: z.iso.datetime(),
  selector: z.string().optional(),
  snippet: z.string().optional()
});

const findingSchema = z.looseObject({
  ruleId: z.string().min(1),
  ruleVersion: z.string().min(1).default("1.0.0"),
  category: z.enum(["crawl-indexability", "metadata", "heading-structure", "structured-data", "links-media", "answerability", "entity-coverage"]),
  problem: z.string().min(1),
  evidence: z.array(evidenceSchema),
  whyItMatters: z.string().min(1),
  exactImplementation: z.string().min(1),
  expectedOutcome: z.string().min(1),
  verificationMethod: z.string().min(1),
  priority: z.enum(["high", "medium", "low"]),
  effort: z.enum(["low", "medium", "high"]),
  classification: z.enum(["observation", "editorial-heuristic"]),
  confidence: z.enum(["high", "medium", "low"]).default("medium"),
  limitation: z.string().min(1).default("Legacy finding: limitation text was not recorded at creation time.")
});

const coverageSignalSchema = z.looseObject({
  kind: z.string().min(1),
  term: z.string(),
  normalizedTerm: z.string(),
  sourceField: z.string().min(1),
  snippet: z.string(),
  method: z.string().min(1),
  heuristic: z.boolean(),
  selector: z.string().optional()
});

const coverageDimensionSchema = z.looseObject({
  present: z.boolean(),
  count: z.number().int().nonnegative(),
  terms: z.array(z.string()),
  signals: z.array(coverageSignalSchema)
});

const coverageSchema = z.looseObject({
  entity: coverageDimensionSchema,
  service: coverageDimensionSchema,
  location: coverageDimensionSchema,
  trust: coverageDimensionSchema,
  contact: coverageDimensionSchema,
  contentSection: coverageDimensionSchema
});

const analysisSchema = z.looseObject({
  requestedUrl: z.string().min(1),
  normalizedUrl: httpUrlSchema,
  statusCode: z.number().int().min(100).max(599),
  finalUrl: httpUrlSchema,
  responseTimeMs: z.number().nonnegative(),
  fetchedAt: z.iso.datetime(),
  redirectCount: z.number().int().nonnegative(),
  title: z.string().nullable(),
  titleLength: z.number().int().nonnegative(),
  metaDescription: z.string().nullable(),
  metaDescriptionLength: z.number().int().nonnegative(),
  canonicalUrl: z.string().nullable(),
  canonicalStatus: z.enum(["match", "mismatch", "missing", "invalid"]),
  robotsMeta: z.string().nullable(),
  indexability: z.looseObject({ status: z.string().min(1), isIndexable: z.boolean(), reason: z.string().min(1) }),
  documentLanguage: z.string().nullable(),
  viewportPresent: z.boolean(),
  h1Count: z.number().int().nonnegative(),
  h1Text: z.array(z.string()),
  headingHierarchy: z.array(z.looseObject({ level: z.number().int().min(1).max(6), text: z.string() })),
  totalHeadingCount: z.number().int().nonnegative(),
  headingLevelJumps: z.array(z.unknown()),
  emptyHeadingCount: z.number().int().nonnegative(),
  repeatedHeadings: z.array(z.unknown()),
  visibleText: z.string(),
  wordCount: z.number().int().nonnegative(),
  sentenceCount: z.number().int().nonnegative(),
  questionCount: z.number().int().nonnegative(),
  detectedQuestions: z.array(z.string()),
  faqIndicators: z.array(z.unknown()),
  breadcrumbIndicators: z.array(z.unknown()),
  directAnswerCount: z.number().int().nonnegative(),
  directAnswers: z.array(z.unknown()),
  jsonLdParseErrors: z.array(z.unknown()),
  schemaTypes: z.array(z.string()),
  imageCount: z.number().int().nonnegative(),
  imagesMissingAlt: z.number().int().nonnegative(),
  internalLinkCount: z.number().int().nonnegative(),
  externalLinkCount: z.number().int().nonnegative(),
  uniqueInternalUrls: z.array(httpUrlSchema),
  uniqueInternalUrlCount: z.number().int().nonnegative(),
  uniqueExternalUrls: z.array(httpUrlSchema),
  externalDomains: z.array(z.string()),
  uniqueExternalDomainCount: z.number().int().nonnegative(),
  anchorTextSummary: z.array(z.unknown()),
  emptyAnchorCount: z.number().int().nonnegative(),
  imageAltIssues: z.array(z.unknown()),
  robotsTxtAvailable: z.boolean(),
  robotsTxtStatusCode: z.number().int().min(100).max(599).nullable(),
  sitemapXmlAvailable: z.boolean(),
  sitemapXmlStatusCode: z.number().int().min(100).max(599).nullable(),
  coverage: coverageSchema,
  findings: z.array(findingSchema)
});

const legacyAnalysisSchema = analysisSchema.extend({
  visibleText: z.string().optional()
});

const comparisonEligibilityReasonCodeSchema = z.enum([
  "NON_SUCCESS_HTTP",
  "ACCESS_DENIED",
  "BOT_CHALLENGE",
  "CAPTCHA",
  "SECURITY_CHECK",
  "ERROR_PAGE",
  "EMPTY_CONTENT",
  "NEAR_EMPTY_CONTENT",
  "MISSING_PAGE_EVIDENCE"
]);

const comparisonEligibilitySchema = z.strictObject({
  status: z.enum(["eligible", "degraded", "ineligible"]),
  usableAsBenchmark: z.boolean(),
  reasons: z.array(z.strictObject({
    code: comparisonEligibilityReasonCodeSchema,
    message: z.string().min(1),
    evidence: z.array(evidenceSchema)
  }))
});

const comparisonSiteSchema = z.strictObject({
  role: z.enum(["target", "competitor"]),
  inputOrder: z.number().int().min(0).max(5),
  inputUrl: z.string().trim().min(1).max(2_048),
  normalizedUrl: httpUrlSchema,
  finalUrl: httpUrlSchema,
  eligibility: comparisonEligibilitySchema
});

const legacyComparisonSiteSchema = comparisonSiteSchema.extend({
  eligibility: comparisonEligibilitySchema.optional()
});

const competitorEvidenceSchema = z.looseObject({
  sourceUrl: httpUrlSchema,
  normalizedUrl: httpUrlSchema,
  inputOrder: z.number().int().min(1).max(5),
  observedValue: z.unknown(),
  benchmark: z.boolean(),
  evidence: z.array(evidenceSchema).min(1)
});

const legacyCompetitorEvidenceSchema = competitorEvidenceSchema.extend({
  normalizedUrl: httpUrlSchema.optional(),
  inputOrder: z.number().int().min(0).max(5).optional(),
  observedValue: z.unknown().optional(),
  benchmark: z.boolean().optional(),
  evidence: z.array(evidenceSchema)
});

const comparisonDeltaSchema = z.strictObject({
  targetValue: z.union([z.number(), z.boolean()]),
  benchmarkValue: z.union([z.number(), z.boolean()]),
  difference: z.number().nonnegative().nullable(),
  threshold: z.number().nonnegative().nullable(),
  interpretation: z.enum([
    "target-below-benchmark",
    "target-above-benchmark",
    "target-absent",
    "target-present"
  ])
});

const comparisonFindingCategorySchema = z.enum([
  "technical",
  "content",
  "entity",
  "trust",
  "schema",
  "answerability",
  "retrieval-support"
]);

const comparisonConfidenceSchema = z.enum(["high", "medium", "low"]);

const comparisonGapSchema = z.looseObject({
  ruleId: z.string().min(1),
  category: comparisonFindingCategorySchema,
  gapId: z.string().min(1),
  metric: z.string().min(1),
  targetEvidence: z.array(evidenceSchema).min(1),
  competitorEvidence: z.array(competitorEvidenceSchema).min(1),
  whatDiffers: z.string().min(1),
  exactDifference: z.string().min(1),
  competitorObservation: z.string().min(1),
  interpretation: z.string().min(1),
  whyItMayMatter: z.string().min(1),
  implementationDirection: z.string().min(1),
  verificationMethod: z.string().min(1),
  expectedObservableOutcome: z.string().min(1),
  confidence: comparisonConfidenceSchema,
  limitation: z.string().min(1),
  priority: z.enum(["high", "medium", "low"]),
  effort: z.enum(["low", "medium", "high"]),
  caution: z.string().min(1),
  missingValues: z.array(z.string()).optional(),
  delta: comparisonDeltaSchema.optional()
});

const legacyComparisonGapSchema = comparisonGapSchema.extend({
  ruleId: z.string().min(1).optional(),
  category: comparisonFindingCategorySchema.optional(),
  exactDifference: z.string().min(1).optional(),
  interpretation: z.string().min(1).optional(),
  expectedObservableOutcome: z.string().min(1).optional(),
  confidence: comparisonConfidenceSchema.optional(),
  limitation: z.string().min(1).optional(),
  targetEvidence: z.array(evidenceSchema),
  competitorEvidence: z.array(legacyCompetitorEvidenceSchema)
});

const metricDefinitionSchema = z.looseObject({
  key: z.string().min(1),
  label: z.string().min(1),
  whatItShows: z.string().min(1),
  whyItMayHelp: z.string().min(1),
  direction: z.enum(["higher-is-more", "lower-is-better", "context-only"])
});

const comparisonRowSchema = z.looseObject({
  role: z.enum(["target", "competitor"]),
  inputOrder: z.number().int().min(0).max(5),
  inputUrl: z.string().trim().min(1).max(2_048),
  url: httpUrlSchema,
  finalUrl: httpUrlSchema,
  eligibility: comparisonEligibilitySchema,
  manualRankObservation: z.number().int().min(1).max(1_000).nullable(),
  metrics: z.record(z.string(), z.union([z.number(), z.boolean(), z.string(), z.null()])),
  schemaTypes: z.array(z.string()),
  topicTerms: z.array(z.string()),
  questions: z.array(z.string())
});

const legacyComparisonRowSchema = comparisonRowSchema.extend({
  inputOrder: z.number().int().min(0).max(5).optional(),
  inputUrl: z.string().trim().min(1).max(2_048).optional(),
  eligibility: comparisonEligibilitySchema.optional()
});

const targetAdvantageSchema = z.looseObject({
  ruleId: z.string().min(1),
  category: comparisonFindingCategorySchema,
  advantageId: z.string().min(1),
  metric: z.string().min(1),
  targetEvidence: z.array(evidenceSchema).min(1),
  competitorEvidence: z.array(competitorEvidenceSchema).min(1),
  whatDiffers: z.string().min(1),
  exactDifference: z.string().min(1),
  interpretation: z.string().min(1),
  whyItMayMatter: z.string().min(1),
  implementationDirection: z.string().min(1),
  expectedObservableOutcome: z.string().min(1),
  verificationMethod: z.string().min(1),
  confidence: comparisonConfidenceSchema,
  limitation: z.string().min(1),
  priority: z.enum(["high", "medium", "low"]),
  effort: z.enum(["low", "medium", "high"]),
  delta: comparisonDeltaSchema.optional()
});

const legacyTargetAdvantageSchema = targetAdvantageSchema.extend({
  ruleId: z.string().min(1).optional(),
  category: comparisonFindingCategorySchema.optional(),
  exactDifference: z.string().min(1).optional(),
  whyItMayMatter: z.string().min(1).optional(),
  implementationDirection: z.string().min(1).optional(),
  expectedObservableOutcome: z.string().min(1).optional(),
  verificationMethod: z.string().min(1).optional(),
  confidence: comparisonConfidenceSchema.optional(),
  limitation: z.string().min(1).optional(),
  priority: z.enum(["high", "medium", "low"]).optional(),
  effort: z.enum(["low", "medium", "high"]).optional(),
  targetEvidence: z.array(evidenceSchema),
  competitorEvidence: z.array(legacyCompetitorEvidenceSchema)
});

const comparisonSchema = z.looseObject({
  targetUrl: httpUrlSchema,
  competitorUrls: z.array(httpUrlSchema).min(1).max(5),
  sites: z.array(comparisonSiteSchema).min(2).max(6),
  conclusionStatus: z.enum(["complete", "partial", "unavailable"]),
  incompleteMessage: z.string().min(1).nullable(),
  excludedCompetitorUrls: z.array(httpUrlSchema),
  queryLabel: z.string().nullable(),
  metricDefinitions: z.array(metricDefinitionSchema),
  matrix: z.array(comparisonRowSchema).min(2).max(6),
  targetGaps: z.array(comparisonGapSchema),
  targetAdvantages: z.array(targetAdvantageSchema),
  competitorAdvantages: z.array(comparisonGapSchema),
  sharedGaps: z.array(comparisonGapSchema),
  competitorOnlySchemaTypes: z.array(z.string()),
  competitorOnlyTopics: z.array(z.string()),
  competitorOnlyQuestions: z.array(z.string()),
  limitations: z.array(z.string())
});

const legacyComparisonSchema = comparisonSchema.extend({
  sites: z.array(legacyComparisonSiteSchema).min(2).max(6).optional(),
  conclusionStatus: z.enum(["complete", "partial", "unavailable"]).optional(),
  incompleteMessage: z.string().min(1).nullable().optional(),
  excludedCompetitorUrls: z.array(httpUrlSchema).optional(),
  matrix: z.array(legacyComparisonRowSchema).min(2).max(6),
  targetGaps: z.array(legacyComparisonGapSchema),
  targetAdvantages: z.array(legacyTargetAdvantageSchema),
  competitorAdvantages: z.array(legacyComparisonGapSchema).optional(),
  sharedGaps: z.array(legacyComparisonGapSchema).optional()
});

const observedChangeSchema = z.looseObject({
  scope: z.enum(["target", "competitor"]),
  sourceUrl: httpUrlSchema,
  category: z.string().min(1),
  field: z.string().min(1),
  change: z.enum(["added", "removed", "changed"]),
  previousValue: z.unknown(),
  currentValue: z.unknown(),
  value: z.unknown().optional(),
  siteKey: httpUrlSchema,
  inputOrder: z.number().int().min(0).max(5),
  previousSourceUrl: httpUrlSchema,
  currentSourceUrl: httpUrlSchema
});

const legacyObservedChangeSchema = observedChangeSchema.extend({
  siteKey: httpUrlSchema.optional(),
  inputOrder: z.number().int().min(0).max(5).optional(),
  previousSourceUrl: httpUrlSchema.optional(),
  currentSourceUrl: httpUrlSchema.optional()
});

const findingChangeSchema = z.looseObject({
  sourceUrl: httpUrlSchema,
  siteKey: httpUrlSchema,
  inputOrder: z.number().int().min(0).max(5),
  previousSourceUrl: httpUrlSchema,
  currentSourceUrl: httpUrlSchema,
  newRuleIds: z.array(z.string()),
  resolvedRuleIds: z.array(z.string()),
  unchangedRuleIds: z.array(z.string()),
  indeterminateRuleIds: z.array(z.string())
});

const legacyFindingChangeSchema = findingChangeSchema.extend({
  siteKey: httpUrlSchema.optional(),
  inputOrder: z.number().int().min(0).max(5).optional(),
  previousSourceUrl: httpUrlSchema.optional(),
  currentSourceUrl: httpUrlSchema.optional(),
  indeterminateRuleIds: z.array(z.string()).optional()
});

const competitorOrderingSchema = z.strictObject({
  previousOrder: z.array(httpUrlSchema),
  currentOrder: z.array(httpUrlSchema),
  orderChanged: z.boolean(),
  moves: z.array(z.strictObject({
    normalizedUrl: httpUrlSchema,
    previousInputOrder: z.number().int().min(1).max(5),
    currentInputOrder: z.number().int().min(1).max(5)
  }))
});

const rankObservationChangeSchema = z.looseObject({
  url: httpUrlSchema,
  previous: z.number().int().min(1).max(1_000).nullable(),
  current: z.number().int().min(1).max(1_000).nullable(),
  delta: z.number().int().nullable(),
  source: z.literal("manual"),
  change: z.enum(["added", "removed", "changed"])
});

const historySchema = z.looseObject({
  previousRunId: z.string().min(1),
  previousCreatedAt: z.string().min(1),
  technicalChanges: z.array(observedChangeSchema),
  metadataChanges: z.array(observedChangeSchema),
  schemaChanges: z.array(observedChangeSchema),
  headingChanges: z.array(observedChangeSchema),
  contentCountChanges: z.array(observedChangeSchema),
  linkAndMediaChanges: z.array(observedChangeSchema),
  findingChanges: z.array(findingChangeSchema),
  competitorChanges: z.looseObject({
    addedUrls: z.array(httpUrlSchema),
    removedUrls: z.array(httpUrlSchema),
    ordering: competitorOrderingSchema,
    observedChanges: z.array(observedChangeSchema)
  }),
  rankObservationChanges: z.array(rankObservationChangeSchema),
  rankComparisonSkippedReason: z.string().nullable(),
  correlationSummary: z.looseObject({
    rankObservationChange: rankObservationChangeSchema.nullable(),
    siteChangesSincePreviousRun: z.array(observedChangeSchema),
    interpretation: z.string().min(1)
  })
});

const legacyHistorySchema = historySchema.extend({
  technicalChanges: z.array(legacyObservedChangeSchema),
  metadataChanges: z.array(legacyObservedChangeSchema),
  schemaChanges: z.array(legacyObservedChangeSchema),
  headingChanges: z.array(legacyObservedChangeSchema),
  contentCountChanges: z.array(legacyObservedChangeSchema),
  linkAndMediaChanges: z.array(legacyObservedChangeSchema),
  findingChanges: z.array(legacyFindingChangeSchema),
  competitorChanges: z.looseObject({
    addedUrls: z.array(httpUrlSchema),
    removedUrls: z.array(httpUrlSchema),
    ordering: competitorOrderingSchema.optional(),
    observedChanges: z.array(legacyObservedChangeSchema)
  }),
  correlationSummary: z.looseObject({
    rankObservationChange: rankObservationChangeSchema.nullable(),
    siteChangesSincePreviousRun: z.array(legacyObservedChangeSchema),
    interpretation: z.string().min(1)
  })
});

const runRecordSchema = z.looseObject({
  id: z.string().min(1),
  createdAt: z.iso.datetime(),
  schemaVersion: z.literal(STORAGE_SCHEMA_VERSION),
  applicationVersion: z.string().min(1),
  targetUrl: httpUrlSchema,
  competitorUrls: z.array(httpUrlSchema).min(1).max(5),
  sites: z.array(comparisonSiteSchema).min(2).max(6),
  queryLabel: z.string().max(200).nullable(),
  rankObservations: z.record(httpUrlSchema, z.number().int().min(1).max(1_000)),
  analyses: z.array(analysisSchema).min(2).max(6),
  comparison: comparisonSchema,
  history: historySchema.nullable()
});

const legacyRunRecordSchema = runRecordSchema.extend({
  sites: z.array(legacyComparisonSiteSchema).min(2).max(6).optional(),
  analyses: z.array(legacyAnalysisSchema).min(2).max(6),
  comparison: legacyComparisonSchema,
  history: legacyHistorySchema.nullable()
});

const storeFileSchema = z.object({
  schemaVersion: z.literal(STORAGE_SCHEMA_VERSION),
  runs: z.array(runRecordSchema)
});

const legacyStoreFileSchema = z.object({
  schemaVersion: z.literal(STORAGE_SCHEMA_VERSION),
  runs: z.array(legacyRunRecordSchema)
});

type LegacyRunRecord = z.infer<typeof legacyRunRecordSchema>;
type LegacyComparisonSite = z.infer<typeof legacyComparisonSiteSchema>;

interface StoreFile {
  schemaVersion: typeof STORAGE_SCHEMA_VERSION;
  runs: RunRecord[];
}

interface JsonRunStoreOptions {
  clock?: () => Date;
  idFactory?: () => string;
}

export class RunStoreError extends Error {
  constructor(
    readonly code: "CORRUPT_STORE" | "UNSUPPORTED_SCHEMA" | "STORE_IO_ERROR" | "INVALID_RECORD",
    message: string,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "RunStoreError";
  }
}

export class JsonRunStore implements RunStore {
  private readonly filePath: string;
  private readonly clock: () => Date;
  private readonly idFactory: () => string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath = resolve(process.env.DATA_DIR ?? "data", "runs.json"), options: JsonRunStoreOptions = {}) {
    this.filePath = resolve(filePath);
    this.clock = options.clock ?? (() => new Date());
    this.idFactory = options.idFactory ?? randomUUID;
  }

  async save(input: NewRunRecord): Promise<RunRecord> {
    const record: RunRecord = {
      ...input,
      id: this.idFactory(),
      createdAt: this.clock().toISOString(),
      schemaVersion: STORAGE_SCHEMA_VERSION,
      applicationVersion: APPLICATION_VERSION
    };
    const recordValidation = runRecordSchema.safeParse(record);
    if (!recordValidation.success) {
      throw new RunStoreError("INVALID_RECORD", "Run record failed validation and was not saved", { issues: recordValidation.error.issues });
    }
    const validatedRecord = recordValidation.data as unknown as RunRecord;
    const alignmentIssues = recordAlignmentIssues(validatedRecord);
    if (alignmentIssues.length > 0) {
      throw new RunStoreError("INVALID_RECORD", "Run record identities are inconsistent and were not saved", { issues: alignmentIssues });
    }

    let saved!: RunRecord;
    const operation = this.writeQueue.then(async () => {
      const file = await this.readStore();
      const previousRun = validatedRecord.history
        ? file.runs.find((run) => run.id === validatedRecord.history?.previousRunId)
        : undefined;
      const persistedAlignmentIssues = recordAlignmentIssues(validatedRecord, previousRun, true);
      if (persistedAlignmentIssues.length > 0) {
        throw new RunStoreError("INVALID_RECORD", "Run record history is inconsistent and was not saved", { issues: persistedAlignmentIssues });
      }
      file.runs.push(validatedRecord);
      await this.writeStore(file);
      saved = validatedRecord;
    });
    this.writeQueue = operation.catch(() => undefined);
    await operation;
    return saved;
  }

  async get(id: string): Promise<RunRecord | null> {
    await this.writeQueue;
    const file = await this.readStore();
    return file.runs.find((run) => run.id === id) ?? null;
  }

  async list(): Promise<RunSummary[]> {
    await this.writeQueue;
    const file = await this.readStore();
    return newestFirst(file.runs)
      .map(toSummary);
  }

  async findLatestByTarget(targetUrl: string, excludeId?: string): Promise<RunRecord | null> {
    await this.writeQueue;
    const key = normalizeTargetKey(targetUrl);
    const file = await this.readStore();
    return newestFirst(file.runs).find(
      (run) => run.id !== excludeId && normalizeTargetKey(run.targetUrl) === key
    ) ?? null;
  }

  private async readStore(): Promise<StoreFile> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return { schemaVersion: STORAGE_SCHEMA_VERSION, runs: [] };
      }
      throw new RunStoreError("STORE_IO_ERROR", "Could not read run history", { filePath: this.filePath });
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(raw);
    } catch {
      throw new RunStoreError("CORRUPT_STORE", "Run history contains invalid JSON; it was not overwritten", { filePath: this.filePath });
    }

    if (typeof decoded === "object" && decoded !== null && "schemaVersion" in decoded && (decoded as { schemaVersion?: unknown }).schemaVersion !== STORAGE_SCHEMA_VERSION) {
      throw new RunStoreError("UNSUPPORTED_SCHEMA", "Run history uses an unsupported storage schema", { filePath: this.filePath, observedSchemaVersion: (decoded as { schemaVersion?: unknown }).schemaVersion });
    }

    const legacyValidation = legacyStoreFileSchema.safeParse(decoded);
    if (!legacyValidation.success) {
      throw new RunStoreError("CORRUPT_STORE", "Run history failed structural validation; it was not overwritten", { filePath: this.filePath, issues: legacyValidation.error.issues });
    }

    let normalizedRuns: RunRecord[];
    try {
      const legacyRuns = legacyValidation.data.runs as unknown as LegacyRunRecord[];
      normalizedRuns = normalizeLegacyRuns(legacyRuns);
    } catch (error: unknown) {
      throw new RunStoreError("CORRUPT_STORE", "Run history could not be normalized safely; it was not overwritten", {
        filePath: this.filePath,
        reason: error instanceof Error ? error.message : "Unknown normalization failure"
      });
    }

    const normalizedFile = { schemaVersion: STORAGE_SCHEMA_VERSION, runs: normalizedRuns };
    const validation = storeFileSchema.safeParse(normalizedFile);
    if (!validation.success) {
      throw new RunStoreError("CORRUPT_STORE", "Run history failed current structural validation after legacy normalization; it was not overwritten", { filePath: this.filePath, issues: validation.error.issues });
    }
    const validatedRuns = validation.data.runs as unknown as RunRecord[];
    const runsById = new Map(validatedRuns.map((run) => [run.id, run]));
    const alignmentIssues = validatedRuns.flatMap((run) => recordAlignmentIssues(
      run,
      run.history ? runsById.get(run.history.previousRunId) : undefined,
      true
    ).map((issue) => `${run.id}: ${issue}`));
    if (alignmentIssues.length > 0) {
      throw new RunStoreError("CORRUPT_STORE", "Run history contains inconsistent ordered identities; it was not overwritten", { filePath: this.filePath, issues: alignmentIssues });
    }
    return { schemaVersion: STORAGE_SCHEMA_VERSION, runs: validatedRuns };
  }

  private async writeStore(file: StoreFile): Promise<void> {
    const directory = dirname(this.filePath);
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await mkdir(directory, { recursive: true });
      await writeFile(temporaryPath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
      await rename(temporaryPath, this.filePath);
    } catch {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw new RunStoreError("STORE_IO_ERROR", "Could not save run history atomically", { filePath: this.filePath });
    }
  }
}

function normalizeLegacyRuns(runs: LegacyRunRecord[]): RunRecord[] {
  const normalized = runs.map((run) => normalizeLegacyRun(run));
  const byId = new Map(normalized.map((entry) => [entry.record.id, entry]));
  return normalized.map((entry) => {
    if (!entry.source.history) return entry.record;
    const previous = byId.get(entry.source.history.previousRunId);
    const recomputeHistory = entry.recomputedComparison
      || previous?.recomputedComparison === true
      || missesCurrentHistoryContract(entry.source.history);
    if (!recomputeHistory) return entry.record;
    if (!previous) throw new Error(`No stored run matches history reference ${entry.source.history.previousRunId}`);
    return {
      ...entry.record,
      history: diffRuns(previous.record, entry.record)
    };
  });
}

function normalizeLegacyRun(run: LegacyRunRecord): {
  source: LegacyRunRecord;
  record: RunRecord;
  recomputedComparison: boolean;
} {
  const analyses = run.analyses.map((analysis) => ({
    ...analysis,
    visibleText: analysis.visibleText ?? reconstructLegacyVisibleText(analysis)
  })) as unknown as ComparableAnalysis[];
  const analysesByUrl = new Map(analyses.map((analysis) => [normalizeTargetKey(analysis.normalizedUrl), analysis]));
  const suppliedSites = run.sites ?? run.comparison.sites;
  const sites = suppliedSites
    ? suppliedSites.map((site) => normalizeLegacySite(site, analysesByUrl))
    : [run.targetUrl, ...run.competitorUrls].map((url, inputOrder) => {
        const analysis = analysesByUrl.get(normalizeTargetKey(url));
        if (!analysis) throw new Error(`No analysis matches ordered site ${url}`);
        return {
          role: inputOrder === 0 ? "target" : "competitor",
          inputOrder,
          inputUrl: analysis.requestedUrl,
          normalizedUrl: analysis.normalizedUrl,
          finalUrl: analysis.finalUrl,
          eligibility: classifyComparisonEligibility(analysis)
        } satisfies ComparisonSite;
      });
  const recomputedComparison = missesCurrentComparisonContract(run);
  const comparison = recomputedComparison
    ? compareAnalyses({
        target: analyses[0]!,
        competitors: analyses.slice(1),
        sites: sites.map((site) => ({
          role: site.role,
          inputOrder: site.inputOrder,
          inputUrl: site.inputUrl,
          normalizedUrl: site.normalizedUrl
        })),
        queryLabel: run.queryLabel,
        rankObservations: run.rankObservations
      })
    : run.comparison as unknown as RunRecord["comparison"];
  const normalizedSites = recomputedComparison ? comparison.sites : sites;
  const record = {
    ...run,
    sites: normalizedSites,
    analyses,
    comparison,
    history: run.history
  } as unknown as RunRecord;
  return { source: run, record, recomputedComparison };
}

function normalizeLegacySite(
  site: LegacyComparisonSite,
  analysesByUrl: Map<string, ComparableAnalysis>
): ComparisonSite {
  const analysis = analysesByUrl.get(normalizeTargetKey(site.normalizedUrl));
  if (!analysis) throw new Error(`No analysis matches stored site ${site.normalizedUrl}`);
  return {
    ...site,
    eligibility: site.eligibility ?? classifyComparisonEligibility(analysis)
  } as ComparisonSite;
}

function reconstructLegacyVisibleText(analysis: z.infer<typeof legacyAnalysisSchema>): string {
  const values = [
    analysis.title,
    analysis.metaDescription,
    ...analysis.h1Text,
    ...analysis.headingHierarchy.map((heading) => heading.text),
    ...analysis.detectedQuestions,
    ...Object.values(analysis.coverage as ComparableAnalysis["coverage"]).flatMap((dimension: ComparableAnalysis["coverage"][keyof ComparableAnalysis["coverage"]]) => [
      ...dimension.terms,
      ...dimension.signals.map((signal) => signal.snippet)
    ])
  ];
  return values
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim())
    .join("\n");
}

function missesCurrentComparisonContract(run: LegacyRunRecord): boolean {
  if (!run.sites || run.analyses.some((analysis) => !hasOwn(analysis, "visibleText"))) return true;
  if (run.sites.some((site) => !hasOwn(site, "eligibility"))) return true;
  const comparison = run.comparison;
  if (
    !hasOwn(comparison, "sites")
    || !hasOwn(comparison, "conclusionStatus")
    || !hasOwn(comparison, "incompleteMessage")
    || !hasOwn(comparison, "excludedCompetitorUrls")
    || !hasOwn(comparison, "competitorAdvantages")
    || !hasOwn(comparison, "sharedGaps")
    || !comparison.sites
  ) return true;
  if (comparison.sites.some((site) => !hasOwn(site, "eligibility"))) return true;
  if (comparison.matrix.some((row) => (
    !hasOwn(row, "inputOrder")
    || !hasOwn(row, "inputUrl")
    || !hasOwn(row, "eligibility")
  ))) return true;
  return [
    ...comparison.targetGaps,
    ...comparison.targetAdvantages,
    ...(comparison.competitorAdvantages ?? []),
    ...(comparison.sharedGaps ?? [])
  ].some((conclusion) => (
    !hasOwn(conclusion, "ruleId")
    || !hasOwn(conclusion, "category")
    || !hasOwn(conclusion, "exactDifference")
    || !hasOwn(conclusion, "expectedObservableOutcome")
    || !hasOwn(conclusion, "confidence")
    || !hasOwn(conclusion, "limitation")
    || (
    conclusion.competitorEvidence.some((bundle) => (
      !hasOwn(bundle, "normalizedUrl")
      || !hasOwn(bundle, "inputOrder")
      || !hasOwn(bundle, "observedValue")
      || !hasOwn(bundle, "benchmark")
    ))
    )
  ));
}

function missesCurrentHistoryContract(history: NonNullable<LegacyRunRecord["history"]>): boolean {
  if (!hasOwn(history.competitorChanges, "ordering")) return true;
  if (history.findingChanges.some((change) => missingHistoryIdentity(change) || !hasOwn(change, "indeterminateRuleIds"))) return true;
  return legacyHistoryObservedChanges(history).some(missingHistoryIdentity);
}

function missingHistoryIdentity(change: object): boolean {
  return !hasOwn(change, "siteKey")
    || !hasOwn(change, "inputOrder")
    || !hasOwn(change, "previousSourceUrl")
    || !hasOwn(change, "currentSourceUrl");
}

function legacyHistoryObservedChanges(history: NonNullable<LegacyRunRecord["history"]>) {
  return [
    ...history.technicalChanges,
    ...history.metadataChanges,
    ...history.schemaChanges,
    ...history.headingChanges,
    ...history.contentCountChanges,
    ...history.linkAndMediaChanges,
    ...history.competitorChanges.observedChanges,
    ...history.correlationSummary.siteChangesSincePreviousRun
  ];
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function deriveConclusion(sites: ComparisonSite[]): {
  status: RunRecord["comparison"]["conclusionStatus"];
  incompleteMessage: string | null;
  excludedCompetitorUrls: string[];
} {
  const target = sites[0];
  const competitors = sites.slice(1);
  const excludedCompetitorUrls = competitors
    .filter((site) => !site.eligibility.usableAsBenchmark)
    .map((site) => site.normalizedUrl);
  const anyDegraded = sites.some((site) => site.eligibility.status === "degraded");
  const anyIneligible = sites.some((site) => site.eligibility.status === "ineligible");
  const status = !target?.eligibility.usableAsBenchmark || competitors.every((site) => !site.eligibility.usableAsBenchmark)
    ? "unavailable"
    : anyDegraded || anyIneligible
    ? "partial"
    : "complete";
  return {
    status,
    incompleteMessage: anyIneligible ? COMPARISON_INCOMPLETE_MESSAGE : null,
    excludedCompetitorUrls
  };
}

function deriveCompetitorOrdering(
  previousOrder: string[],
  currentOrder: string[]
): NonNullable<RunRecord["history"]>["competitorChanges"]["ordering"] {
  const previousKeys = new Set(previousOrder.map(normalizeTargetKey));
  const currentKeys = new Set(currentOrder.map(normalizeTargetKey));
  const previousCommon = previousOrder.filter((url) => currentKeys.has(normalizeTargetKey(url)));
  const currentCommon = currentOrder.filter((url) => previousKeys.has(normalizeTargetKey(url)));
  const orderChanged = !sameUrlOrder(previousCommon, currentCommon);
  const moves = orderChanged
    ? currentCommon.flatMap((url) => {
        const key = normalizeTargetKey(url);
        const previousRelativeIndex = previousCommon.findIndex((item) => normalizeTargetKey(item) === key);
        const currentRelativeIndex = currentCommon.findIndex((item) => normalizeTargetKey(item) === key);
        if (previousRelativeIndex === currentRelativeIndex) return [];
        return [{
          normalizedUrl: url,
          previousInputOrder: previousOrder.findIndex((item) => normalizeTargetKey(item) === key) + 1,
          currentInputOrder: currentOrder.findIndex((item) => normalizeTargetKey(item) === key) + 1
        }];
      })
    : [];
  return { previousOrder: [...previousOrder], currentOrder: [...currentOrder], orderChanged, moves };
}

function recordAlignmentIssues(run: RunRecord, previousRun?: RunRecord, requirePreviousRun = false): string[] {
  const issues: string[] = [];
  const expectedUrls = [run.targetUrl, ...run.competitorUrls];
  if (run.sites.length !== expectedUrls.length) issues.push("sites count must match target plus competitor count");
  if (run.analyses.length !== expectedUrls.length) issues.push("analyses count must match target plus competitor count");
  if (run.comparison.sites.length !== expectedUrls.length) issues.push("comparison sites count must match target plus competitor count");
  if (run.comparison.matrix.length !== expectedUrls.length) issues.push("comparison matrix count must match target plus competitor count");
  if (!sameUrl(run.comparison.targetUrl, run.targetUrl)) issues.push("comparison target URL must match run target URL");
  if (!sameUrlOrder(run.comparison.competitorUrls, run.competitorUrls)) issues.push("comparison competitor URLs must preserve run competitor order");
  if (run.comparison.queryLabel !== run.queryLabel) issues.push("comparison query label must match run query label");

  const seen = new Set<string>();
  for (let inputOrder = 0; inputOrder < expectedUrls.length; inputOrder += 1) {
    const expectedUrl = expectedUrls[inputOrder]!;
    const expectedRole = inputOrder === 0 ? "target" : "competitor";
    const site = run.sites[inputOrder];
    const analysis = run.analyses[inputOrder];
    const comparisonSite = run.comparison.sites[inputOrder];
    const row = run.comparison.matrix[inputOrder];
    if (!site || !analysis || !comparisonSite || !row) continue;
    const key = normalizeTargetKey(site.normalizedUrl);
    if (seen.has(key)) issues.push(`site ${inputOrder} duplicates an ordered URL identity`);
    seen.add(key);
    if (site.inputOrder !== inputOrder) issues.push(`site ${inputOrder} has the wrong inputOrder`);
    if (site.role !== expectedRole) issues.push(`site ${inputOrder} has the wrong role`);
    if (!sameUrl(site.normalizedUrl, expectedUrl)) issues.push(`site ${inputOrder} does not match the submitted URL order`);
    if (!sameUrl(analysis.normalizedUrl, expectedUrl)) issues.push(`analysis ${inputOrder} does not match the submitted URL order`);
    if (site.inputUrl !== analysis.requestedUrl) issues.push(`site ${inputOrder} input URL does not match its analysis request`);
    if (!sameUrl(site.finalUrl, analysis.finalUrl)) issues.push(`site ${inputOrder} final URL does not match its analysis`);
    if (!sameSite(site, comparisonSite)) issues.push(`comparison site ${inputOrder} does not match the stored ordered site`);
    if (row.role !== expectedRole || row.inputOrder !== inputOrder) issues.push(`comparison row ${inputOrder} has inconsistent role or order`);
    if (row.inputUrl !== site.inputUrl) issues.push(`comparison row ${inputOrder} input URL does not match the ordered site`);
    if (!sameUrl(row.url, site.normalizedUrl) || !sameUrl(row.finalUrl, site.finalUrl)) issues.push(`comparison row ${inputOrder} URL identity does not match the ordered site`);
    if (!equalJson(row.eligibility, site.eligibility)) issues.push(`comparison row ${inputOrder} eligibility does not match the ordered site`);
    if (!equalJson(site.eligibility, classifyComparisonEligibility(analysis))) issues.push(`site ${inputOrder} eligibility does not match its analysis evidence`);
    issues.push(...eligibilityIssues(site.eligibility).map((issue) => `site ${inputOrder} ${issue}`));
  }

  const conclusion = deriveConclusion(run.sites);
  if (run.comparison.conclusionStatus !== conclusion.status) issues.push("comparison conclusion status does not match site eligibility");
  if (run.comparison.incompleteMessage !== conclusion.incompleteMessage) issues.push("comparison incomplete message does not match site eligibility");
  if (!sameUrlOrder(run.comparison.excludedCompetitorUrls, conclusion.excludedCompetitorUrls)) issues.push("excluded competitor URLs do not match site eligibility");
  if (run.comparison.conclusionStatus === "unavailable" && (
    run.comparison.targetGaps.length > 0
    || run.comparison.targetAdvantages.length > 0
    || run.comparison.competitorAdvantages.length > 0
    || run.comparison.sharedGaps.length > 0
    || run.comparison.competitorOnlySchemaTypes.length > 0
    || run.comparison.competitorOnlyTopics.length > 0
    || run.comparison.competitorOnlyQuestions.length > 0
  )) issues.push("unavailable comparisons cannot retain competitive conclusions");
  const targetSite = run.sites[0];
  const usableCompetitors = run.sites.slice(1).filter((site) => site.eligibility.usableAsBenchmark);
  if (targetSite) {
    for (const gap of run.comparison.targetGaps) {
      issues.push(...comparisonEvidenceIssues(gap, targetSite, usableCompetitors, `gap ${gap.gapId}`));
    }
    for (const advantage of run.comparison.targetAdvantages) {
      issues.push(...comparisonEvidenceIssues(advantage, targetSite, usableCompetitors, `advantage ${advantage.advantageId}`));
    }
    for (const advantage of run.comparison.competitorAdvantages) {
      issues.push(...comparisonEvidenceIssues(advantage, targetSite, usableCompetitors, `competitor advantage ${advantage.gapId}`));
    }
    for (const gap of run.comparison.sharedGaps) {
      issues.push(...comparisonEvidenceIssues(gap, targetSite, usableCompetitors, `shared gap ${gap.gapId}`));
    }
  }
  issues.push(...comparisonSemanticIssues(run));

  if (run.history) {
    const currentOrder = run.sites.slice(1).map((site) => site.normalizedUrl);
    if (!sameUrlOrder(run.history.competitorChanges.ordering.currentOrder, currentOrder)) {
      issues.push("history current competitor order does not match the run sites");
    }
    if (requirePreviousRun && !previousRun) issues.push("history previousRunId does not reference a stored run");
    if (previousRun) {
      const previousOrder = previousRun.sites.slice(1).map((site) => site.normalizedUrl);
      const expectedOrdering = deriveCompetitorOrdering(previousOrder, currentOrder);
      if (!equalJson(run.history.competitorChanges.ordering, expectedOrdering)) issues.push("history competitor ordering does not match the previous and current sites");
      if (run.history.previousCreatedAt !== previousRun.createdAt) issues.push("history previousCreatedAt does not match the referenced run");
      if (!sameUrl(previousRun.targetUrl, run.targetUrl)) issues.push("history referenced run has a different target URL");
      const previousKeys = new Set(previousOrder.map(normalizeTargetKey));
      const currentKeys = new Set(currentOrder.map(normalizeTargetKey));
      const expectedAdded = currentOrder.filter((url) => !previousKeys.has(normalizeTargetKey(url)));
      const expectedRemoved = previousOrder.filter((url) => !currentKeys.has(normalizeTargetKey(url)));
      if (!sameUrlOrder(run.history.competitorChanges.addedUrls, expectedAdded)) issues.push("history added competitor URLs are inconsistent");
      if (!sameUrlOrder(run.history.competitorChanges.removedUrls, expectedRemoved)) issues.push("history removed competitor URLs are inconsistent");
      const expectedHistory = diffRuns(previousRun, run);
      issues.push(...historySemanticIssues(run.history, expectedHistory));
    }
    for (const change of run.history.findingChanges) {
      validateHistorySiteReference(change, run.sites, issues, "finding change");
    }
    for (const change of historyObservedChanges(run.history)) {
      validateHistorySiteReference(change, run.sites, issues, "observed change");
    }
  }
  return issues;
}

function historySemanticIssues(
  actual: NonNullable<RunRecord["history"]>,
  expected: NonNullable<RunRecord["history"]>
): string[] {
  const actualView = historySemanticView(actual);
  const expectedView = historySemanticView(expected);
  return (Object.keys(expectedView) as Array<keyof typeof expectedView>)
    .filter((key) => !equalJson(actualView[key], expectedView[key]))
    .map((key) => `history ${key} does not match the deterministic diff of the referenced run`);
}

function historySemanticView(history: NonNullable<RunRecord["history"]>) {
  return {
    previousRunId: history.previousRunId,
    previousCreatedAt: history.previousCreatedAt,
    technicalChanges: history.technicalChanges.map(observedChangeSemanticView),
    metadataChanges: history.metadataChanges.map(observedChangeSemanticView),
    schemaChanges: history.schemaChanges.map(observedChangeSemanticView),
    headingChanges: history.headingChanges.map(observedChangeSemanticView),
    contentCountChanges: history.contentCountChanges.map(observedChangeSemanticView),
    linkAndMediaChanges: history.linkAndMediaChanges.map(observedChangeSemanticView),
    findingChanges: history.findingChanges.map((change) => ({
      sourceUrl: change.sourceUrl,
      siteKey: change.siteKey,
      inputOrder: change.inputOrder,
      previousSourceUrl: change.previousSourceUrl,
      currentSourceUrl: change.currentSourceUrl,
      newRuleIds: change.newRuleIds,
      resolvedRuleIds: change.resolvedRuleIds,
      unchangedRuleIds: change.unchangedRuleIds,
      indeterminateRuleIds: change.indeterminateRuleIds
    })),
    competitorChanges: {
      addedUrls: history.competitorChanges.addedUrls,
      removedUrls: history.competitorChanges.removedUrls,
      ordering: {
        previousOrder: history.competitorChanges.ordering.previousOrder,
        currentOrder: history.competitorChanges.ordering.currentOrder,
        orderChanged: history.competitorChanges.ordering.orderChanged,
        moves: history.competitorChanges.ordering.moves.map((move) => ({
          normalizedUrl: move.normalizedUrl,
          previousInputOrder: move.previousInputOrder,
          currentInputOrder: move.currentInputOrder
        }))
      },
      observedChanges: history.competitorChanges.observedChanges.map(observedChangeSemanticView)
    },
    rankObservationChanges: history.rankObservationChanges.map(rankObservationChangeSemanticView),
    rankComparisonSkippedReason: history.rankComparisonSkippedReason,
    correlationSummary: {
      rankObservationChange: history.correlationSummary.rankObservationChange
        ? rankObservationChangeSemanticView(history.correlationSummary.rankObservationChange)
        : null,
      siteChangesSincePreviousRun: history.correlationSummary.siteChangesSincePreviousRun.map(observedChangeSemanticView),
      interpretation: history.correlationSummary.interpretation
    }
  };
}

function observedChangeSemanticView(change: NonNullable<RunRecord["history"]>["technicalChanges"][number]) {
  return {
    scope: change.scope,
    sourceUrl: change.sourceUrl,
    category: change.category,
    field: change.field,
    change: change.change,
    previousValue: change.previousValue,
    currentValue: change.currentValue,
    value: change.value,
    siteKey: change.siteKey,
    inputOrder: change.inputOrder,
    previousSourceUrl: change.previousSourceUrl,
    currentSourceUrl: change.currentSourceUrl
  };
}

function rankObservationChangeSemanticView(change: NonNullable<RunRecord["history"]>["rankObservationChanges"][number]) {
  return {
    url: change.url,
    previous: change.previous,
    current: change.current,
    delta: change.delta,
    source: change.source,
    change: change.change
  };
}

function comparisonEvidenceIssues(
  conclusion: RunRecord["comparison"]["targetGaps"][number] | RunRecord["comparison"]["targetAdvantages"][number],
  targetSite: ComparisonSite,
  usableCompetitors: ComparisonSite[],
  label: string
): string[] {
  const issues: string[] = [];
  if (conclusion.targetEvidence.length === 0) issues.push(`${label} must include target evidence`);
  if (conclusion.targetEvidence.some((evidence) => !sameUrl(evidence.sourceUrl, targetSite.finalUrl))) {
    issues.push(`${label} target evidence must reference the target final URL`);
  }
  if (conclusion.competitorEvidence.length !== usableCompetitors.length) {
    issues.push(`${label} must include exactly one ordered evidence bundle per usable competitor`);
  }
  conclusion.competitorEvidence.forEach((bundle, index) => {
    const site = usableCompetitors[index];
    if (!site) {
      issues.push(`${label} includes evidence for an excluded or unknown competitor`);
      return;
    }
    if (!hasOwn(bundle, "normalizedUrl") || !bundle.normalizedUrl || !sameUrl(bundle.normalizedUrl, site.normalizedUrl)) {
      issues.push(`${label} competitor evidence ${index} has the wrong normalized identity`);
    }
    if (!hasOwn(bundle, "inputOrder") || bundle.inputOrder !== site.inputOrder) {
      issues.push(`${label} competitor evidence ${index} has the wrong input order`);
    }
    if (!hasOwn(bundle, "observedValue") || bundle.observedValue === undefined) {
      issues.push(`${label} competitor evidence ${index} must include an observed value`);
    }
    if (!hasOwn(bundle, "benchmark") || typeof bundle.benchmark !== "boolean") {
      issues.push(`${label} competitor evidence ${index} must declare benchmark participation`);
    }
    if (!sameUrl(bundle.sourceUrl, site.finalUrl)) {
      issues.push(`${label} competitor evidence ${index} source URL does not match the ordered site`);
    }
    if (bundle.evidence.length === 0) {
      issues.push(`${label} competitor evidence ${index} must include nested evidence`);
    } else if (bundle.evidence.some((evidence) => !sameUrl(evidence.sourceUrl, site.finalUrl))) {
      issues.push(`${label} competitor evidence ${index} nested evidence references the wrong site`);
    }
  });
  if (!conclusion.competitorEvidence.some((bundle) => bundle.benchmark === true)) {
    issues.push(`${label} must include at least one benchmark competitor`);
  }
  return issues;
}

function comparisonSemanticIssues(run: RunRecord): string[] {
  let expected: RunRecord["comparison"];
  try {
    expected = compareAnalyses({
      target: run.analyses[0]!,
      competitors: run.analyses.slice(1),
      sites: run.sites.map((site) => ({
        role: site.role,
        inputOrder: site.inputOrder,
        inputUrl: site.inputUrl,
        normalizedUrl: site.normalizedUrl
      })),
      queryLabel: run.queryLabel,
      rankObservations: run.rankObservations
    });
  } catch (error: unknown) {
    return [`comparison semantics could not be recomputed: ${error instanceof Error ? error.message : "unknown failure"}`];
  }

  const issues: string[] = [];
  run.comparison.matrix.forEach((row, index) => {
    const expectedRow = expected.matrix[index];
    if (!expectedRow) return;
    if (!equalJson(row.metrics, expectedRow.metrics)) issues.push(`comparison row ${index} metrics do not match its analysis`);
    if (row.manualRankObservation !== expectedRow.manualRankObservation) issues.push(`comparison row ${index} rank observation does not match the run observations`);
    if (!equalJson(row.schemaTypes, expectedRow.schemaTypes)) issues.push(`comparison row ${index} schema values do not match its analysis`);
    if (!equalJson(row.topicTerms, expectedRow.topicTerms)) issues.push(`comparison row ${index} topic values do not match its analysis`);
    if (!equalJson(row.questions, expectedRow.questions)) issues.push(`comparison row ${index} question values do not match its analysis`);
  });
  if (!equalJson(
    run.comparison.targetGaps.map((gap) => gap.gapId),
    expected.targetGaps.map((gap) => gap.gapId)
  )) issues.push("stored comparison gaps do not match deterministic comparison rules");
  if (!equalJson(
    run.comparison.targetAdvantages.map((advantage) => advantage.advantageId),
    expected.targetAdvantages.map((advantage) => advantage.advantageId)
  )) issues.push("stored target advantages do not match deterministic comparison rules");
  if (!equalJson(
    run.comparison.competitorAdvantages.map((advantage) => advantage.gapId),
    expected.competitorAdvantages.map((advantage) => advantage.gapId)
  )) issues.push("stored competitor advantages do not match deterministic comparison rules");
  if (!equalJson(
    run.comparison.sharedGaps.map((gap) => gap.gapId),
    expected.sharedGaps.map((gap) => gap.gapId)
  )) issues.push("stored shared gaps do not match deterministic comparison rules");

  const expectedGaps = new Map(expected.targetGaps.map((gap) => [gap.gapId, gap]));
  for (const gap of run.comparison.targetGaps) {
    const expectedGap = expectedGaps.get(gap.gapId);
    if (expectedGap) issues.push(...conclusionSemanticIssues(gap, expectedGap, `gap ${gap.gapId}`));
  }
  const expectedAdvantages = new Map(expected.targetAdvantages.map((advantage) => [advantage.advantageId, advantage]));
  for (const advantage of run.comparison.targetAdvantages) {
    const expectedAdvantage = expectedAdvantages.get(advantage.advantageId);
    if (expectedAdvantage) issues.push(...conclusionSemanticIssues(advantage, expectedAdvantage, `advantage ${advantage.advantageId}`));
  }
  const expectedCompetitorAdvantages = new Map(expected.competitorAdvantages.map((gap) => [gap.gapId, gap]));
  for (const advantage of run.comparison.competitorAdvantages) {
    const expectedAdvantage = expectedCompetitorAdvantages.get(advantage.gapId);
    if (expectedAdvantage) issues.push(...conclusionSemanticIssues(advantage, expectedAdvantage, `competitor advantage ${advantage.gapId}`));
  }
  const expectedSharedGaps = new Map(expected.sharedGaps.map((gap) => [gap.gapId, gap]));
  for (const gap of run.comparison.sharedGaps) {
    const expectedGap = expectedSharedGaps.get(gap.gapId);
    if (expectedGap) issues.push(...conclusionSemanticIssues(gap, expectedGap, `shared gap ${gap.gapId}`));
  }
  if (!equalJson(run.comparison.competitorOnlySchemaTypes, expected.competitorOnlySchemaTypes)) issues.push("competitor-only schema conclusions do not match analyzed evidence");
  if (!equalJson(run.comparison.competitorOnlyTopics, expected.competitorOnlyTopics)) issues.push("competitor-only topic conclusions do not match analyzed evidence");
  if (!equalJson(run.comparison.competitorOnlyQuestions, expected.competitorOnlyQuestions)) issues.push("competitor-only question conclusions do not match analyzed evidence");
  return issues;
}

function conclusionSemanticIssues(
  actual: RunRecord["comparison"]["targetGaps"][number] | RunRecord["comparison"]["targetAdvantages"][number],
  expected: RunRecord["comparison"]["targetGaps"][number] | RunRecord["comparison"]["targetAdvantages"][number],
  label: string
): string[] {
  const issues: string[] = [];
  if (actual.ruleId !== expected.ruleId) issues.push(`${label} rule ID does not match its deterministic rule`);
  if (actual.category !== expected.category) issues.push(`${label} category does not match its deterministic rule`);
  if (actual.exactDifference !== expected.exactDifference) issues.push(`${label} exact difference does not match its deterministic rule`);
  if (actual.expectedObservableOutcome !== expected.expectedObservableOutcome) issues.push(`${label} expected outcome does not match its deterministic rule`);
  if (actual.confidence !== expected.confidence) issues.push(`${label} confidence does not match its deterministic rule`);
  if (actual.limitation !== expected.limitation) issues.push(`${label} limitation does not match its deterministic rule`);
  if (actual.metric !== expected.metric) issues.push(`${label} metric does not match its deterministic rule`);
  if (!equalJson(actual.delta, expected.delta)) issues.push(`${label} delta does not match target and benchmark values`);
  if (!equalJson(
    "missingValues" in actual ? actual.missingValues : undefined,
    "missingValues" in expected ? expected.missingValues : undefined
  )) issues.push(`${label} missing-value conclusion does not match analyzed evidence`);
  if (!equalJson(evidenceSemantics(actual.targetEvidence), evidenceSemantics(expected.targetEvidence))) {
    issues.push(`${label} target evidence values do not match the deterministic comparison`);
  }
  actual.competitorEvidence.forEach((bundle, index) => {
    const expectedBundle = expected.competitorEvidence[index];
    if (!expectedBundle) return;
    if (!equalJson(bundle.observedValue, expectedBundle.observedValue)) {
      issues.push(`${label} competitor evidence ${index} observed value does not match the comparison matrix`);
    }
    if (bundle.benchmark !== expectedBundle.benchmark) {
      issues.push(`${label} competitor evidence ${index} benchmark flag does not match the comparison rule`);
    }
    if (!equalJson(evidenceSemantics(bundle.evidence), evidenceSemantics(expectedBundle.evidence))) {
      issues.push(`${label} competitor evidence ${index} nested values do not match the deterministic comparison`);
    }
  });
  return issues;
}

function evidenceSemantics(evidence: Array<{ sourceUrl: string; field: string; observedValue: unknown }>) {
  return evidence.map((item) => ({
    sourceUrl: normalizeTargetKey(item.sourceUrl),
    field: item.field,
    observedValue: item.observedValue
  }));
}

function validateHistorySiteReference(
  change: { siteKey?: string; inputOrder?: number; currentSourceUrl?: string },
  sites: ComparisonSite[],
  issues: string[],
  label: string
): void {
  const site = change.inputOrder !== undefined
    ? sites[change.inputOrder]
    : change.siteKey
    ? sites.find((candidate) => sameUrl(candidate.normalizedUrl, change.siteKey!))
    : undefined;
  if ((change.inputOrder !== undefined || change.siteKey !== undefined) && !site) {
    issues.push(`${label} references an unknown ordered site`);
    return;
  }
  if (!site) return;
  if (change.siteKey && !sameUrl(change.siteKey, site.normalizedUrl)) issues.push(`${label} siteKey does not match inputOrder`);
  if (change.currentSourceUrl && !sameUrl(change.currentSourceUrl, site.finalUrl)) issues.push(`${label} current source URL does not match the ordered site`);
}

function historyObservedChanges(history: NonNullable<RunRecord["history"]>) {
  return [
    ...history.technicalChanges,
    ...history.metadataChanges,
    ...history.schemaChanges,
    ...history.headingChanges,
    ...history.contentCountChanges,
    ...history.linkAndMediaChanges,
    ...history.competitorChanges.observedChanges,
    ...history.correlationSummary.siteChangesSincePreviousRun
  ];
}

function eligibilityIssues(eligibility: ComparisonEligibility): string[] {
  if (eligibility.status === "ineligible") {
    return [
      ...(eligibility.usableAsBenchmark ? ["ineligible status cannot be used as a benchmark"] : []),
      ...(eligibility.reasons.length === 0 ? ["ineligible status must include a reason"] : [])
    ];
  }
  if (!eligibility.usableAsBenchmark) return [`${eligibility.status} status must be usable as a benchmark`];
  if (eligibility.status === "eligible" && eligibility.reasons.length > 0) return ["eligible status cannot include degradation reasons"];
  if (eligibility.status === "degraded" && eligibility.reasons.length === 0) return ["degraded status must include a reason"];
  return [];
}

function sameSite(left: ComparisonSite, right: ComparisonSite): boolean {
  return left.role === right.role
    && left.inputOrder === right.inputOrder
    && left.inputUrl === right.inputUrl
    && sameUrl(left.normalizedUrl, right.normalizedUrl)
    && sameUrl(left.finalUrl, right.finalUrl)
    && equalJson(left.eligibility, right.eligibility);
}

function sameUrl(left: string, right: string): boolean {
  return normalizeTargetKey(left) === normalizeTargetKey(right);
}

function sameUrlOrder(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((url, index) => sameUrl(url, right[index]!));
}

function equalJson(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    const entries = Object.keys(object)
      .filter((key) => object[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`);
    return `{${entries.join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  return encoded === undefined ? "null" : encoded;
}

function copySite(site: ComparisonSite): ComparisonSite {
  return {
    ...site,
    eligibility: {
      ...site.eligibility,
      reasons: site.eligibility.reasons.map((reason) => ({
        ...reason,
        evidence: reason.evidence.map((evidence) => ({ ...evidence }))
      }))
    }
  };
}

function normalizeTargetKey(value: string): string {
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(candidate);
  url.hash = "";
  return url.toString();
}

function toSummary(run: RunRecord): RunSummary {
  return {
    id: run.id,
    createdAt: run.createdAt,
    targetUrl: run.targetUrl,
    competitorUrls: [...run.competitorUrls],
    sites: run.sites.map(copySite),
    queryLabel: run.queryLabel,
    findingCount: run.analyses.reduce((total, analysis) => total + analysis.findings.length, 0),
    gapCount: run.comparison.targetGaps.length,
    hasPreviousRun: run.history !== null
  };
}

function newestFirst(runs: RunRecord[]): RunRecord[] {
  return runs
    .map((run, index) => ({ run, index }))
    .sort((left, right) => right.run.createdAt.localeCompare(left.run.createdAt) || right.index - left.index)
    .map(({ run }) => run);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
