import { compareAnalyses } from "../../packages/comparison/compare.js";
import type { ComparisonSiteInput } from "../../packages/comparison/types.js";
import { normalizeUrl } from "../../packages/crawler/url.js";
import { diffRuns } from "../../packages/comparison/diff.js";
import { validateManualRankObservations } from "../../packages/ranking/types.js";
import type { RunRecord, RunStore } from "../../packages/storage/types.js";
import { analyzeUrl, type AnalysisResult } from "./analyze.js";

export interface CompareRunInput {
  targetUrl: string;
  competitorUrls: string[];
  queryLabel?: string;
  rankObservations?: Record<string, number>;
}

export interface ComparisonServiceDependencies {
  store: RunStore;
  analyze?: (url: string) => Promise<AnalysisResult>;
}

export async function compareAndSaveRun(
  input: CompareRunInput,
  dependencies: ComparisonServiceDependencies
): Promise<RunRecord> {
  const analyze = dependencies.analyze ?? analyzeUrl;
  const submittedUrls = [input.targetUrl, ...input.competitorUrls];
  const sites: ComparisonSiteInput[] = submittedUrls.map((url, inputOrder) => ({
    role: inputOrder === 0 ? "target" : "competitor",
    inputOrder,
    inputUrl: url.trim(),
    normalizedUrl: normalizeUrl(url).toString()
  }));
  const analyses = await Promise.all(
    submittedUrls.map((url) => analyze(url))
  );
  const target = analyses[0];
  const competitors = analyses.slice(1);

  if (!target || competitors.length < 1 || competitors.length > 3) {
    throw new Error("Comparison requires one target and one to three competitors");
  }
  analyses.forEach((analysis, index) => {
    if (analysis.normalizedUrl !== sites[index]?.normalizedUrl) {
      throw new Error(`Analyzer returned a mismatched normalized URL at input order ${index}`);
    }
  });

  const rankObservations = validateManualRankObservations(input.rankObservations);
  const queryLabel = input.queryLabel?.trim() || null;
  const comparison = compareAnalyses({
    target,
    competitors,
    sites,
    queryLabel,
    rankObservations
  });
  const targetUrl = target.normalizedUrl;
  const competitorUrls = competitors.map((analysis) => analysis.normalizedUrl);
  const previous = await dependencies.store.findLatestByTarget(targetUrl);
  const currentSnapshot = {
    targetUrl,
    competitorUrls,
    sites: comparison.sites,
    queryLabel,
    rankObservations,
    analyses
  };
  const history = previous ? diffRuns(previous, currentSnapshot) : null;

  return dependencies.store.save({
    ...currentSnapshot,
    comparison,
    history
  });
}
