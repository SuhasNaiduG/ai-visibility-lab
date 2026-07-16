import { randomUUID } from "node:crypto";
import { normalizeUrl } from "../crawler/url.js";
import { connectorById } from "./connectors.js";
import { CsvImportError, isFormulaValue, parseAndValidateCsv, sha256, type CsvFileInput } from "./csv.js";
import { generateOpportunities } from "./opportunities.js";
import { stableJson } from "./store-utils.js";
import { CONNECTOR_VERSION, TRANSFORMATION_VERSION, type AnalyticsMetric, type AnalyticsStore, type ConnectorSource, type ImportBundle, type ImportJob, type ImportMapping, type ImportRejection, type ProjectReference } from "./types.js";

export interface AnalyticsCsvImportInput {
  projectId: string;
  connectorId: string;
  sourceLabel: string;
  accountLabel?: string | null;
  propertyLabel?: string | null;
  file: CsvFileInput;
  mapping: ImportMapping;
}

export interface AnalyticsImportDependencies {
  clock?: () => Date;
  idFactory?: () => string;
}

export async function importAnalyticsCsv(input: AnalyticsCsvImportInput, store: AnalyticsStore, dependencies: AnalyticsImportDependencies = {}): Promise<{ job: ImportJob; rejections: ImportRejection[]; opportunityCount: number }> {
  const connector = connectorById(input.connectorId);
  if (!connector) throw new CsvImportError("UNSUPPORTED_CONNECTOR", "Connector is not supported in Release 1", { connectorId: input.connectorId });
  const project = await store.getProject(input.projectId);
  if (!project) throw new CsvImportError("INVALID_CSV_FILE", "An existing research project is required before analytics can be imported", { projectId: input.projectId });
  const parsed = parseAndValidateCsv(input.file);
  validateMapping(parsed.headers, connector.requiredFields, connector.optionalFields, input.mapping);
  const clock = dependencies.clock ?? (() => new Date());
  const idFactory = dependencies.idFactory ?? randomUUID;
  const now = clock().toISOString();
  const importId = `import:${idFactory()}`;
  const sourceIdentity = sha256(stableJson({ projectId: project.projectId, connectorId: connector.connectorId, sourceLabel: input.sourceLabel.trim(), accountLabel: input.accountLabel?.trim() || null, propertyLabel: input.propertyLabel?.trim() || null }));
  const sourceId = `source:${sourceIdentity.slice(0, 32)}`;
  const existingSource = (await store.listSources(project.projectId)).find((source) => source.sourceId === sourceId);
  const source: ConnectorSource = existingSource ?? {
    sourceId,
    projectId: project.projectId,
    connectorId: connector.connectorId,
    connectorVersion: CONNECTOR_VERSION,
    kind: connector.kind,
    label: safeText(input.sourceLabel, "sourceLabel", 200),
    accountLabel: input.accountLabel ? safeText(input.accountLabel, "accountLabel", 200) : null,
    propertyLabel: input.propertyLabel ? safeText(input.propertyLabel, "propertyLabel", 200) : null,
    createdAt: now
  };
  const headerIndex = new Map(parsed.headers.map((header, index) => [header, index]));
  const rejections: ImportRejection[] = [];
  const metrics: AnalyticsMetric[] = [];
  const seenHashes = new Set<string>();
  const existingHashes = new Set((await store.listMetrics(project.projectId)).filter((metric) => metric.sourceId === sourceId).map((metric) => metric.lineage.normalizedRecordHash));

  for (let index = 0; index < parsed.rows.length; index += 1) {
    const rowNumber = index + 2;
    const row = parsed.rows[index]!;
    try {
      for (const [field, header] of Object.entries(input.mapping)) {
        const value = row[headerIndex.get(header)!] ?? "";
        if (value && isFormulaValue(value)) throw new RowError("FORMULA_VALUE", field, "Formula-like cell value was rejected.");
      }
      const normalized = normalizeRow(connector.connectorId, project, source, importId, now, row, headerIndex, input.mapping);
      const hash = normalized.lineage.normalizedRecordHash;
      if (seenHashes.has(hash) || existingHashes.has(hash)) throw new RowError("DUPLICATE_RECORD", null, "Duplicate normalized record was rejected.");
      seenHashes.add(hash);
      metrics.push(normalized);
    } catch (error: unknown) {
      const rowError = error instanceof RowError ? error : new RowError("INVALID_VALUE", null, "Row failed deterministic normalization.");
      rejections.push({ rejectionId: `${importId}:reject:${rowNumber}`, importId, projectId: project.projectId, rowNumber, code: rowError.code, field: rowError.field, message: rowError.message });
    }
  }
  const duplicateRows = rejections.filter((item) => item.code === "DUPLICATE_RECORD").length;
  const dates = metrics.map((metric) => metric.date).sort();
  const dateEnds = metrics.map((metric) => metric.dateTo ?? metric.date).sort();
  const job: ImportJob = {
    importId,
    projectId: project.projectId,
    sourceId,
    createdAt: now,
    completedAt: now,
    status: rejections.length > 0 ? "completed-with-rejections" : "completed",
    fileName: safeFileName(input.file.fileName),
    mimeType: input.file.mimeType.trim().toLocaleLowerCase("en-US"),
    fileSha256: parsed.fileSha256,
    mapping: structuredClone(input.mapping),
    totalRows: parsed.rows.length,
    acceptedRows: metrics.length,
    rejectedRows: rejections.length,
    duplicateRows,
    sourceDateFrom: dates[0] ?? null,
    sourceDateTo: dateEnds.at(-1) ?? null,
    limitations: [...connector.limitations, "The original CSV is discarded after validation and is not retained by the analytics store."]
  };
  const generated = generateOpportunities(project.projectId, metrics, now);
  const bundle: ImportBundle = {
    project,
    source,
    job,
    rejections,
    metrics,
    opportunities: generated.opportunities,
    evidence: generated.evidence,
    auditEvent: {
      eventId: `audit:${idFactory()}`,
      projectId: project.projectId,
      occurredAt: now,
      eventType: "import.completed",
      importRef: importId,
      summary: { connectorId: connector.connectorId, acceptedRows: metrics.length, rejectedRows: rejections.length, duplicateRows }
    }
  };
  await store.saveImport(bundle);
  return { job, rejections, opportunityCount: generated.opportunities.length };
}

function normalizeRow(connectorId: string, project: ProjectReference, source: ConnectorSource, importId: string, importedAt: string, row: string[], headerIndex: Map<string, number>, mapping: ImportMapping): AnalyticsMetric {
  const get = (field: string, required = false): string => {
    const header = mapping[field];
    const value = header === undefined ? "" : (row[headerIndex.get(header)!] ?? "").trim();
    if (required && !value) throw new RowError("MISSING_VALUE", field, "Required value is missing.");
    return value;
  };
  const date = isoDate(get("date", true), "date");
  const dateToValue = get("dateTo");
  const dateTo = dateToValue ? isoDate(dateToValue, "dateTo") : null;
  if (dateTo && dateTo < date) throw new RowError("INVALID_VALUE", "dateTo", "End date must not be before start date.");
  const base = { date, dateTo };
  let normalized: NormalizedMetric;
  if (connectorId === "search-console-csv") {
    const clicks = integer(get("clicks", true), "clicks");
    const impressions = integer(get("impressions", true), "impressions");
    const ctr = ratio(get("ctr", true), "ctr");
    if (clicks > impressions) throw new RowError("INVALID_VALUE", "clicks", "Clicks cannot exceed impressions.");
    const calculated = impressions === 0 ? 0 : clicks / impressions;
    if (Math.abs(calculated - ctr) > 0.005) throw new RowError("INVALID_VALUE", "ctr", "CTR does not align with clicks and impressions within rounding tolerance.");
    normalized = { ...base, metricType: "search-performance", query: safeText(get("query", true), "query", 1_000), page: httpUrl(get("page", true), "page"), clicks, impressions, ctr, averagePosition: positiveNumber(get("averagePosition", true), "averagePosition"), device: safeText(get("device") || "all", "device", 200), country: safeText(get("country") || "all", "country", 200) };
  } else if (connectorId === "web-analytics-csv") normalized = { ...base, metricType: "web-analytics", page: httpUrl(get("page", true), "page"), sessions: integer(get("sessions", true), "sessions"), users: nullableInteger(get("users"), "users"), engagementRate: nullableRatio(get("engagementRate"), "engagementRate"), conversions: nullableNumber(get("conversions"), "conversions"), device: get("device") ? safeText(get("device"), "device", 200) : null, country: get("country") ? safeText(get("country"), "country", 200) : null };
  else if (connectorId === "campaign-csv") normalized = { ...base, metricType: "campaign-performance", campaign: safeText(get("campaign", true), "campaign", 500), spend: number(get("spend", true), "spend"), clicks: integer(get("clicks", true), "clicks"), conversions: number(get("conversions", true), "conversions") };
  else normalized = { ...base, metricType: "lead-summary", source: safeText(get("source", true), "source", 500), leads: integer(get("leads", true), "leads"), qualifiedLeads: integer(get("qualifiedLeads", true), "qualifiedLeads") };
  if (normalized.metricType === "lead-summary" && normalized.qualifiedLeads > normalized.leads) throw new RowError("INVALID_VALUE", "qualifiedLeads", "Qualified leads cannot exceed leads.");
  const normalizedRecordHash = sha256(stableJson(normalized));
  const sourceRecordId = sha256(`${source.sourceId}|${normalizedRecordHash}`);
  const metricId = `metric:${sha256(`${project.projectId}|${sourceRecordId}`).slice(0, 32)}`;
  return {
    ...normalized,
    metricId,
    projectId: project.projectId,
    sourceId: source.sourceId,
    importId,
    lineage: {
      projectId: project.projectId,
      sourceId: source.sourceId,
      importId,
      connectorId: source.connectorId,
      connectorVersion: CONNECTOR_VERSION,
      importMethod: "csv",
      sourceRecordId,
      normalizedRecordHash,
      importedAt,
      sourceDate: date,
      sourceDateTo: dateTo,
      transformationVersion: TRANSFORMATION_VERSION,
      validationStatus: "accepted",
      confidence: "reported-by-import",
      limitations: ["The value is a normalized aggregate from an uploaded CSV and was not independently verified against a live provider."]
    }
  } as AnalyticsMetric;
}

function validateMapping(headers: string[], required: string[], optional: string[], mapping: ImportMapping): void {
  const allowed = new Set([...required, ...optional]);
  const headerSet = new Set(headers);
  for (const field of required) if (!mapping[field]) throw new CsvImportError("INVALID_CSV_FILE", "Required canonical field is not mapped", { field });
  for (const [field, header] of Object.entries(mapping)) {
    if (!allowed.has(field)) throw new CsvImportError("INVALID_CSV_FILE", "Mapping contains an unsupported canonical field", { field });
    if (!headerSet.has(header)) throw new CsvImportError("INVALID_CSV_FILE", "Mapping references an unknown CSV header", { field, header });
  }
  const mappedHeaders = Object.values(mapping);
  if (new Set(mappedHeaders).size !== mappedHeaders.length) throw new CsvImportError("INVALID_CSV_FILE", "Each CSV header can map to at most one canonical field");
}

type NormalizedMetric = AnalyticsMetric extends infer Metric
  ? Metric extends AnalyticsMetric
    ? Omit<Metric, "metricId" | "projectId" | "sourceId" | "importId" | "lineage">
    : never
  : never;

class RowError extends Error {
  constructor(readonly code: ImportRejection["code"], readonly field: string | null, message: string) { super(message); }
}

function isoDate(value: string, field: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) throw new RowError("INVALID_VALUE", field, "Date must use YYYY-MM-DD.");
  return value;
}

function numeric(value: string, field: string): number {
  const normalized = value.replaceAll(",", "").trim();
  if (!/^\d+(?:\.\d+)?$/u.test(normalized)) throw new RowError("INVALID_VALUE", field, "Value must be a non-negative number.");
  const result = Number(normalized);
  if (!Number.isFinite(result)) throw new RowError("INVALID_VALUE", field, "Value must be finite.");
  return result;
}

function number(value: string, field: string): number { return numeric(value, field); }
function positiveNumber(value: string, field: string): number { const result = numeric(value, field); if (result <= 0) throw new RowError("INVALID_VALUE", field, "Value must be greater than zero."); return result; }
function integer(value: string, field: string): number { const result = numeric(value, field); if (!Number.isInteger(result)) throw new RowError("INVALID_VALUE", field, "Value must be a whole number."); return result; }
function nullableInteger(value: string, field: string): number | null { return value ? integer(value, field) : null; }
function nullableNumber(value: string, field: string): number | null { return value ? number(value, field) : null; }
function ratio(value: string, field: string): number { const percent = value.endsWith("%"); const result = numeric(percent ? value.slice(0, -1) : value, field); const ratioValue = percent || result > 1 ? result / 100 : result; if (ratioValue > 1) throw new RowError("INVALID_VALUE", field, "Rate must be between 0% and 100%."); return ratioValue; }
function nullableRatio(value: string, field: string): number | null { return value ? ratio(value, field) : null; }

function httpUrl(value: string, field: string): string {
  try { return normalizeUrl(value).toString(); }
  catch { throw new RowError("INVALID_VALUE", field, "Value must be a valid HTTP(S) URL."); }
}

function safeText(value: string, field: string, max: number): string {
  const text = value.trim();
  if (!text || text.length > max || /[\r\n\0]/u.test(text)) throw new RowError("INVALID_VALUE", field, `Text must contain 1 to ${max} safe characters.`);
  return text;
}

function safeFileName(value: string): string {
  const name = value.trim().replace(/^.*[\\/]/u, "");
  if (!name || name.length > 255 || /[\r\n\0]/u.test(name)) throw new CsvImportError("INVALID_CSV_FILE", "CSV file name is invalid");
  return name;
}
