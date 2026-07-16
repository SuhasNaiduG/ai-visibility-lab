import { createHash } from "node:crypto";
import { connectorById } from "./connectors.js";

export const MAX_CSV_BYTES = 2 * 1024 * 1024;
export const MAX_CSV_ROWS = 10_000;
export const MAX_CSV_COLUMNS = 100;
export const MAX_CSV_CELL_LENGTH = 10_000;
export const CSV_MIME_TYPES = ["text/csv", "application/csv", "application/vnd.ms-excel", "text/plain"] as const;

export interface CsvFileInput {
  fileName: string;
  mimeType: string;
  content: string;
}

export interface CsvPreview {
  fileName: string;
  fileSha256: string;
  headers: string[];
  sampleRows: Array<Record<string, string>>;
  totalRows: number;
  suggestedMapping: Record<string, string>;
  connectorId: string;
  warnings: string[];
}

export class CsvImportError extends Error {
  constructor(
    readonly code: "INVALID_CSV_FILE" | "CSV_TOO_LARGE" | "CSV_PARSE_ERROR" | "SENSITIVE_DATA_PROHIBITED" | "UNSUPPORTED_CONNECTOR",
    message: string,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "CsvImportError";
  }
}

export function previewCsv(file: CsvFileInput, connectorId: string): CsvPreview {
  const connector = connectorById(connectorId);
  if (!connector) throw new CsvImportError("UNSUPPORTED_CONNECTOR", "Connector is not supported in Release 1", { connectorId });
  validateFile(file);
  const parsed = parseCsv(file.content);
  const sensitive = parsed.headers.filter(isSensitiveHeader);
  if (sensitive.length > 0) throw new CsvImportError("SENSITIVE_DATA_PROHIBITED", "The CSV contains prohibited direct-identifier or sensitive-data columns", { headers: sensitive });
  const mapping = suggestMapping(parsed.headers, connectorId);
  const missing = connector.requiredFields.filter((field) => !mapping[field]);
  return {
    fileName: file.fileName,
    fileSha256: sha256(file.content),
    headers: parsed.headers,
    sampleRows: parsed.rows.slice(0, 5).map((row) => Object.fromEntries(parsed.headers.map((header, index) => [header, row[index] ?? ""]))),
    totalRows: parsed.rows.length,
    suggestedMapping: mapping,
    connectorId,
    warnings: missing.length > 0 ? [`Map required field(s): ${missing.join(", ")}.`] : []
  };
}

export function parseAndValidateCsv(file: CsvFileInput): { headers: string[]; rows: string[][]; fileSha256: string } {
  validateFile(file);
  const parsed = parseCsv(file.content);
  const sensitive = parsed.headers.filter(isSensitiveHeader);
  if (sensitive.length > 0) throw new CsvImportError("SENSITIVE_DATA_PROHIBITED", "The CSV contains prohibited direct-identifier or sensitive-data columns", { headers: sensitive });
  return { ...parsed, fileSha256: sha256(file.content) };
}

export function isFormulaValue(value: string): boolean {
  const trimmed = value.trimStart();
  if (/^[=+@]/u.test(trimmed)) return true;
  return /^-/u.test(trimmed) && !/^-\d+(?:[.,]\d+)?%?$/u.test(trimmed);
}

export function escapeSpreadsheetCell(value: string | number | null): string {
  let text = value === null ? "" : String(value);
  if (isFormulaValue(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function validateFile(file: CsvFileInput): void {
  if (!file.fileName.trim().toLocaleLowerCase("en-US").endsWith(".csv")) throw new CsvImportError("INVALID_CSV_FILE", "Only .csv files are accepted");
  if (!(CSV_MIME_TYPES as readonly string[]).includes(file.mimeType.trim().toLocaleLowerCase("en-US"))) throw new CsvImportError("INVALID_CSV_FILE", "CSV MIME type is not allowed", { mimeType: file.mimeType });
  const bytes = Buffer.byteLength(file.content, "utf8");
  if (bytes > MAX_CSV_BYTES) throw new CsvImportError("CSV_TOO_LARGE", "CSV exceeds the 2 MB Release 1 limit", { bytes, maxBytes: MAX_CSV_BYTES });
  if (file.content.includes("\0")) throw new CsvImportError("INVALID_CSV_FILE", "CSV contains prohibited null bytes");
}

function parseCsv(content: string): { headers: string[]; rows: string[][] } {
  const input = content.replace(/^\uFEFF/u, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!;
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"' && cell.length === 0) quoted = true;
    else if (character === ",") {
      row.push(boundedCell(cell));
      cell = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(boundedCell(cell));
      cell = "";
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      if (rows.length > MAX_CSV_ROWS + 1) throw new CsvImportError("CSV_TOO_LARGE", "CSV exceeds the 10,000-row Release 1 limit", { maxRows: MAX_CSV_ROWS });
    } else cell += character;
  }
  if (quoted) throw new CsvImportError("CSV_PARSE_ERROR", "CSV has an unclosed quoted field");
  row.push(boundedCell(cell));
  if (row.some((value) => value.length > 0)) rows.push(row);
  if (rows.length < 2) throw new CsvImportError("CSV_PARSE_ERROR", "CSV must contain a header and at least one data row");
  const headers = rows.shift()!.map((header) => header.trim());
  if (headers.length > MAX_CSV_COLUMNS) throw new CsvImportError("CSV_TOO_LARGE", "CSV exceeds the 100-column Release 1 limit", { maxColumns: MAX_CSV_COLUMNS });
  if (headers.some((header) => !header)) throw new CsvImportError("CSV_PARSE_ERROR", "CSV headers must be non-empty");
  const normalizedHeaders = headers.map(normalizeHeader);
  if (new Set(normalizedHeaders).size !== headers.length) throw new CsvImportError("CSV_PARSE_ERROR", "CSV headers must be unique after normalization");
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index]!.length !== headers.length) throw new CsvImportError("CSV_PARSE_ERROR", "CSV row has a different column count", { rowNumber: index + 2, expectedColumns: headers.length, actualColumns: rows[index]!.length });
  }
  return { headers, rows };
}

function boundedCell(value: string): string {
  if (value.length > MAX_CSV_CELL_LENGTH) throw new CsvImportError("CSV_TOO_LARGE", "CSV cell exceeds the 10,000-character limit", { maxCellLength: MAX_CSV_CELL_LENGTH });
  return value.trim();
}

const HEADER_ALIASES: Record<string, string[]> = {
  query: ["query", "search query", "keyword", "top queries"],
  page: ["page", "landing page", "landing page plus query string", "url"],
  date: ["date", "day", "start date"],
  dateTo: ["date to", "end date"],
  clicks: ["clicks"],
  impressions: ["impressions"],
  ctr: ["ctr", "click through rate", "click-through rate"],
  averagePosition: ["position", "average position", "avg position"],
  device: ["device", "device category"],
  country: ["country", "country code"],
  sessions: ["sessions"],
  users: ["users", "active users", "total users"],
  engagementRate: ["engagement rate"],
  conversions: ["conversions", "key events"],
  campaign: ["campaign", "campaign name"],
  spend: ["spend", "cost", "amount spent"],
  source: ["source", "channel", "lead source"],
  leads: ["leads", "lead count"],
  qualifiedLeads: ["qualified leads", "qualified lead count", "mqls"]
};

function suggestMapping(headers: string[], connectorId: string): Record<string, string> {
  const connector = connectorById(connectorId)!;
  const available = new Map(headers.map((header) => [normalizeHeader(header), header]));
  const mapping: Record<string, string> = {};
  for (const field of [...connector.requiredFields, ...connector.optionalFields]) {
    const matched = HEADER_ALIASES[field]?.map(normalizeHeader).map((alias) => available.get(alias)).find(Boolean);
    if (matched) mapping[field] = matched;
  }
  return mapping;
}

function normalizeHeader(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/[_-]+/gu, " ").replace(/\s+/gu, " ");
}

const SENSITIVE_HEADER_PATTERNS = [
  /(^|\b)(full )?name($|\b)/u,
  /e[ -]?mail/u,
  /phone|mobile|telephone/u,
  /address|postal|zip code/u,
  /patient|diagnos|medical|health|medication/u,
  /form (content|response|submission)|message body|free.?text/u,
  /call (recording|transcript)|audio/u,
  /credential|password|secret|access token|refresh token|oauth/u,
  /ip address|client id|user id|contact id/u
];

function isSensitiveHeader(header: string): boolean {
  const normalized = normalizeHeader(header);
  return SENSITIVE_HEADER_PATTERNS.some((pattern) => pattern.test(normalized));
}
