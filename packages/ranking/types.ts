import { normalizeUrl } from "../crawler/url.js";

export interface RankObservation {
  url: string;
  position: number;
  source: "manual" | `provider:${string}`;
  observedAt: string;
}

export interface RankObservationProvider {
  readonly providerId: string;
  observe(queryLabel: string, urls: string[]): Promise<RankObservation[]>;
}

export function validateManualRankObservations(values: Record<string, number> | undefined): Record<string, number> {
  if (!values) return {};
  const normalized: Record<string, number> = {};
  for (const [url, position] of Object.entries(values)) {
    if (!Number.isInteger(position) || position < 1 || position > 1000) {
      throw new Error(`Manual rank for ${url} must be an integer from 1 to 1000`);
    }
    const normalizedUrl = normalizeUrl(url).toString();
    if (Object.hasOwn(normalized, normalizedUrl)) {
      throw new Error(`Manual rank contains duplicate normalized URL: ${normalizedUrl}`);
    }
    normalized[normalizedUrl] = position;
  }
  return normalized;
}
