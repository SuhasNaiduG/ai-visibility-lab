import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
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
  category: z.enum(["crawl-indexability", "metadata", "heading-structure", "structured-data", "links-media", "answerability", "entity-coverage"]),
  problem: z.string().min(1),
  evidence: z.array(evidenceSchema),
  whyItMatters: z.string().min(1),
  exactImplementation: z.string().min(1),
  expectedOutcome: z.string().min(1),
  verificationMethod: z.string().min(1),
  priority: z.enum(["high", "medium", "low"]),
  effort: z.enum(["low", "medium", "high"]),
  classification: z.enum(["observation", "editorial-heuristic"])
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
  wordCount: z.number().int().nonnegative(),
  sentenceCount: z.number().int().nonnegative(),
  questionCount: z.number().int().nonnegative(),
  detectedQuestions: z.array(z.string()),
  faqIndicators: z.array(z.unknown()),
  directAnswerCount: z.number().int().nonnegative(),
  jsonLdParseErrors: z.array(z.unknown()),
  schemaTypes: z.array(z.string()),
  imageCount: z.number().int().nonnegative(),
  imagesMissingAlt: z.number().int().nonnegative(),
  internalLinkCount: z.number().int().nonnegative(),
  externalLinkCount: z.number().int().nonnegative(),
  uniqueInternalUrls: z.array(httpUrlSchema),
  externalDomains: z.array(z.string()),
  emptyAnchorCount: z.number().int().nonnegative(),
  robotsTxtAvailable: z.boolean(),
  robotsTxtStatusCode: z.number().int().min(100).max(599).nullable(),
  sitemapXmlAvailable: z.boolean(),
  sitemapXmlStatusCode: z.number().int().min(100).max(599).nullable(),
  coverage: coverageSchema,
  findings: z.array(findingSchema)
});

const competitorEvidenceSchema = z.looseObject({
  sourceUrl: httpUrlSchema,
  evidence: z.array(evidenceSchema)
});

const comparisonGapSchema = z.looseObject({
  gapId: z.string().min(1),
  metric: z.string().min(1),
  targetEvidence: z.array(evidenceSchema),
  competitorEvidence: z.array(competitorEvidenceSchema),
  whatDiffers: z.string().min(1),
  competitorObservation: z.string().min(1),
  whyItMayMatter: z.string().min(1),
  implementationDirection: z.string().min(1),
  verificationMethod: z.string().min(1),
  priority: z.enum(["high", "medium", "low"]),
  effort: z.enum(["low", "medium", "high"]),
  caution: z.string().min(1)
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
  url: httpUrlSchema,
  finalUrl: httpUrlSchema,
  manualRankObservation: z.number().int().min(1).max(1_000).nullable(),
  metrics: z.record(z.string(), z.union([z.number(), z.boolean(), z.string(), z.null()])),
  schemaTypes: z.array(z.string()),
  topicTerms: z.array(z.string()),
  questions: z.array(z.string())
});

const targetAdvantageSchema = z.looseObject({
  advantageId: z.string().min(1),
  metric: z.string().min(1),
  targetEvidence: z.array(evidenceSchema),
  competitorEvidence: z.array(competitorEvidenceSchema),
  whatDiffers: z.string().min(1),
  interpretation: z.string().min(1)
});

const comparisonSchema = z.looseObject({
  targetUrl: httpUrlSchema,
  competitorUrls: z.array(httpUrlSchema).min(1).max(3),
  queryLabel: z.string().nullable(),
  metricDefinitions: z.array(metricDefinitionSchema),
  matrix: z.array(comparisonRowSchema).min(2).max(4),
  targetGaps: z.array(comparisonGapSchema),
  targetAdvantages: z.array(targetAdvantageSchema),
  competitorOnlySchemaTypes: z.array(z.string()),
  competitorOnlyTopics: z.array(z.string()),
  competitorOnlyQuestions: z.array(z.string()),
  limitations: z.array(z.string())
});

const observedChangeSchema = z.looseObject({
  scope: z.enum(["target", "competitor"]),
  sourceUrl: httpUrlSchema,
  category: z.string().min(1),
  field: z.string().min(1),
  change: z.enum(["added", "removed", "changed"]),
  previousValue: z.unknown(),
  currentValue: z.unknown()
});

const findingChangeSchema = z.looseObject({
  sourceUrl: httpUrlSchema,
  newRuleIds: z.array(z.string()),
  resolvedRuleIds: z.array(z.string()),
  unchangedRuleIds: z.array(z.string())
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
  competitorChanges: z.looseObject({ addedUrls: z.array(httpUrlSchema), removedUrls: z.array(httpUrlSchema), observedChanges: z.array(observedChangeSchema) }),
  rankObservationChanges: z.array(rankObservationChangeSchema),
  rankComparisonSkippedReason: z.string().nullable(),
  correlationSummary: z.looseObject({
    rankObservationChange: rankObservationChangeSchema.nullable(),
    siteChangesSincePreviousRun: z.array(observedChangeSchema),
    interpretation: z.string().min(1)
  })
});

const runRecordSchema = z.looseObject({
  id: z.string().min(1),
  createdAt: z.iso.datetime(),
  schemaVersion: z.literal(STORAGE_SCHEMA_VERSION),
  applicationVersion: z.string().min(1),
  targetUrl: httpUrlSchema,
  competitorUrls: z.array(httpUrlSchema).min(1).max(3),
  queryLabel: z.string().max(200).nullable(),
  rankObservations: z.record(httpUrlSchema, z.number().int().min(1).max(1_000)),
  analyses: z.array(analysisSchema).min(2).max(4),
  comparison: comparisonSchema,
  history: historySchema.nullable()
});

const storeFileSchema = z.object({
  schemaVersion: z.literal(STORAGE_SCHEMA_VERSION),
  runs: z.array(runRecordSchema)
});

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

    let saved!: RunRecord;
    const operation = this.writeQueue.then(async () => {
      const file = await this.readStore();
      file.runs.push(record);
      await this.writeStore(file);
      saved = record;
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

    const validation = storeFileSchema.safeParse(decoded);
    if (!validation.success) {
      throw new RunStoreError("CORRUPT_STORE", "Run history failed structural validation; it was not overwritten", { filePath: this.filePath, issues: validation.error.issues });
    }
    return validation.data as unknown as StoreFile;
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
