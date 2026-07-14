import type { ComparableAnalysis, ComparisonResult, ComparisonSite, ManualRankObservations } from "../comparison/types.js";
import type { HistoricalComparison } from "../comparison/diff.js";

export const STORAGE_SCHEMA_VERSION = "1" as const;
export const APPLICATION_VERSION = "1.0.0" as const;

export interface RunRecord {
  id: string;
  createdAt: string;
  schemaVersion: typeof STORAGE_SCHEMA_VERSION;
  applicationVersion: string;
  targetUrl: string;
  competitorUrls: string[];
  sites: ComparisonSite[];
  queryLabel: string | null;
  rankObservations: ManualRankObservations;
  analyses: ComparableAnalysis[];
  comparison: ComparisonResult;
  history: HistoricalComparison | null;
}

export type NewRunRecord = Omit<
  RunRecord,
  "id" | "createdAt" | "schemaVersion" | "applicationVersion"
>;

export interface RunSummary {
  id: string;
  createdAt: string;
  targetUrl: string;
  competitorUrls: string[];
  sites: ComparisonSite[];
  queryLabel: string | null;
  findingCount: number;
  gapCount: number;
  hasPreviousRun: boolean;
}

export interface RunStore {
  save(input: NewRunRecord): Promise<RunRecord>;
  get(id: string): Promise<RunRecord | null>;
  list(): Promise<RunSummary[]>;
  findLatestByTarget(targetUrl: string, excludeId?: string): Promise<RunRecord | null>;
}
