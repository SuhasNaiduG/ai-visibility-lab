import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { normalizeUrl } from "../crawler/url.js";
import type { ManualVisibilityObservation, ManualVisibilityObservationInput, VisibilityObservationStore } from "./types.js";

const httpUrl = z.url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol));
const recordSchema = z.strictObject({
  id: z.string().min(1),
  createdAt: z.iso.datetime(),
  source: z.literal("manual"),
  targetUrl: httpUrl,
  query: z.string().min(1).max(500),
  engine: z.string().min(1).max(100),
  location: z.string().min(1).max(200),
  device: z.enum(["desktop", "mobile", "tablet", "other"]),
  observationDate: z.iso.date(),
  observedRank: z.number().int().min(1).max(10_000).optional(),
  observedCitation: z.boolean().optional(),
  citationUrl: httpUrl.optional(),
  notes: z.string().max(2_000).optional(),
  screenshotReference: z.string().max(2_048).optional(),
  referenceUrl: httpUrl.optional()
}).superRefine((value, context) => {
  if (value.observedRank === undefined && value.observedCitation === undefined) {
    context.addIssue({ code: "custom", path: ["observedRank"], message: "Record a rank, citation observation, or both" });
  }
});

const fileSchema = z.strictObject({ schemaVersion: z.literal("1"), observations: z.array(recordSchema) });

export class VisibilityObservationStoreError extends Error {
  constructor(readonly code: "CORRUPT_STORE" | "INVALID_RECORD" | "STORE_IO_ERROR", message: string, readonly details: Record<string, unknown> = {}) {
    super(message);
    this.name = "VisibilityObservationStoreError";
  }
}

export class JsonVisibilityObservationStore implements VisibilityObservationStore {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath = resolve(process.env.DATA_DIR ?? "data", "visibility-observations.json"),
    private readonly options: { idFactory?: () => string; clock?: () => Date } = {}
  ) {}

  async save(input: ManualVisibilityObservationInput): Promise<ManualVisibilityObservation> {
    const candidate = {
      ...input,
      targetUrl: normalizeUrl(input.targetUrl).toString(),
      id: this.options.idFactory?.() ?? randomUUID(),
      createdAt: (this.options.clock?.() ?? new Date()).toISOString(),
      source: "manual" as const
    };
    const validation = recordSchema.safeParse(candidate);
    if (!validation.success) throw new VisibilityObservationStoreError("INVALID_RECORD", "Visibility observation failed validation", { issues: validation.error.issues });
    const record = validation.data;
    this.writeQueue = this.writeQueue.then(async () => {
      const file = await this.read();
      file.observations.push(record);
      await this.write(file);
    });
    await this.writeQueue;
    return record;
  }

  async list(targetUrl?: string): Promise<ManualVisibilityObservation[]> {
    await this.writeQueue;
    const file = await this.read();
    const normalized = targetUrl ? normalizeUrl(targetUrl).toString() : null;
    return file.observations
      .filter((observation) => !normalized || observation.targetUrl === normalized)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  private async read(): Promise<z.infer<typeof fileSchema>> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { schemaVersion: "1", observations: [] };
      throw new VisibilityObservationStoreError("STORE_IO_ERROR", "Could not read visibility observations", { filePath: this.filePath });
    }
    try {
      const validation = fileSchema.safeParse(JSON.parse(raw));
      if (!validation.success) throw new Error(validation.error.message);
      return validation.data;
    } catch (error: unknown) {
      throw new VisibilityObservationStoreError("CORRUPT_STORE", "Visibility observation history is invalid and was not overwritten", { filePath: this.filePath, cause: error instanceof Error ? error.message : "unknown" });
    }
  }

  private async write(file: z.infer<typeof fileSchema>): Promise<void> {
    const temporary = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      await writeFile(temporary, `${JSON.stringify(file, null, 2)}\n`, "utf8");
      await rename(temporary, this.filePath);
    } catch {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw new VisibilityObservationStoreError("STORE_IO_ERROR", "Could not save visibility observations atomically", { filePath: this.filePath });
    }
  }
}
