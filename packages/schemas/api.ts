import { z } from "zod";
import { normalizeUrl } from "../crawler/url.js";

const urlInput = z.string().trim().min(1, "URL is required").max(2_048, "URL is too long");
const rankPosition = z.number().int().min(1).max(1_000);

export const analyzeRequestSchema = z.strictObject({
  url: urlInput
});

export const compareRequestSchema = z.strictObject({
  targetUrl: urlInput,
  competitorUrls: z.array(urlInput).min(1, "At least one competitor is required").max(3, "At most three competitors are allowed"),
  queryLabel: z.string().trim().max(200).optional(),
  rankObservations: z.record(z.string().max(2_048), rankPosition).optional()
}).superRefine((value, context) => {
  let target: string;
  try {
    target = normalizeUrl(value.targetUrl).toString();
  } catch (error: unknown) {
    context.addIssue({
      code: "custom",
      path: ["targetUrl"],
      message: error instanceof Error ? error.message : "Only valid HTTP and HTTPS URLs are supported"
    });
    return;
  }

  const competitors: string[] = [];
  for (const [index, competitor] of value.competitorUrls.entries()) {
    try {
      competitors.push(normalizeUrl(competitor).toString());
    } catch (error: unknown) {
      context.addIssue({
        code: "custom",
        path: ["competitorUrls", index],
        message: error instanceof Error ? error.message : "Only valid HTTP and HTTPS URLs are supported"
      });
    }
  }
  if (competitors.length !== value.competitorUrls.length) return;

  if (new Set(competitors).size !== competitors.length) {
    context.addIssue({ code: "custom", path: ["competitorUrls"], message: "Competitor URLs must be unique" });
  }
  if (competitors.includes(target)) {
    context.addIssue({ code: "custom", path: ["competitorUrls"], message: "The target URL cannot also be a competitor" });
  }

  if (value.rankObservations) {
    const allowed = new Set([target, ...competitors]);
    const seenRankUrls = new Set<string>();
    for (const key of Object.keys(value.rankObservations)) {
      try {
        const normalizedKey = normalizeUrl(key).toString();
        if (seenRankUrls.has(normalizedKey)) {
          context.addIssue({ code: "custom", path: ["rankObservations", key], message: "Rank observation URLs must be unique after normalization" });
        }
        seenRankUrls.add(normalizedKey);
        if (!allowed.has(normalizedKey)) {
          context.addIssue({ code: "custom", path: ["rankObservations", key], message: "Rank observations may reference only submitted target or competitor URLs" });
        }
      } catch {
        context.addIssue({ code: "custom", path: ["rankObservations", key], message: "Rank observation keys must be valid HTTP or HTTPS URLs" });
      }
    }
  }
});

export const latestRunQuerySchema = z.strictObject({
  targetUrl: urlInput
});

export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;
export type CompareRequest = z.infer<typeof compareRequestSchema>;
