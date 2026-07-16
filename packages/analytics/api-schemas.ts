import { z } from "zod";
import { CSV_MIME_TYPES, MAX_CSV_BYTES } from "./csv.js";
import { opportunityStatusSchema } from "./schemas.js";

const identifier = z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9:_-]+$/u);
const safeText = z.string().trim().min(1).max(200).refine((value) => !/[\r\n\0]/u.test(value));
const csvFile = z.strictObject({
  fileName: z.string().trim().min(5).max(255).refine((value) => value.toLocaleLowerCase("en-US").endsWith(".csv")),
  mimeType: z.string().trim().transform((value) => value.toLocaleLowerCase("en-US")).pipe(z.enum(CSV_MIME_TYPES)),
  content: z.string().min(1).max(MAX_CSV_BYTES)
});

export const csvPreviewRequestSchema = z.strictObject({ connectorId: identifier, file: csvFile });
export const csvImportRequestSchema = z.strictObject({
  projectId: identifier,
  connectorId: identifier,
  sourceLabel: safeText,
  accountLabel: safeText.nullable().optional(),
  propertyLabel: safeText.nullable().optional(),
  file: csvFile,
  mapping: z.record(z.string().trim().min(1).max(100), z.string().trim().min(1).max(200))
});
export const projectQuerySchema = z.strictObject({ projectId: identifier });
export const metricQuerySchema = z.strictObject({
  projectId: identifier,
  metricType: z.enum(["search-performance", "web-analytics", "campaign-performance", "lead-summary"]).optional(),
  page: z.string().trim().max(2_000).optional(),
  query: z.string().trim().max(1_000).optional(),
  dateFrom: z.iso.date().optional(),
  dateTo: z.iso.date().optional(),
  device: safeText.optional(),
  country: safeText.optional()
}).refine((value) => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo, { path: ["dateTo"], message: "dateTo must not be before dateFrom" });
export const analyticsIdParamsSchema = z.strictObject({ id: identifier });
export const analyticsProjectIdParamsSchema = z.strictObject({ projectId: identifier, id: identifier });
export const opportunityStatusRequestSchema = z.strictObject({ status: opportunityStatusSchema });
export const analyticsExportQuerySchema = z.strictObject({ projectId: identifier, format: z.enum(["json", "markdown", "csv"]).default("json") });
