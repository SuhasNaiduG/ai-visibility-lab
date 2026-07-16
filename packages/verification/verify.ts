import type { AnalyzerObservation } from "../analyzers/types.js";
import type { HistoricalComparison } from "../comparison/diff.js";
import type { ComparableAnalysis, ComparisonResult, ComparisonSite } from "../comparison/types.js";
import type { VerificationClassification, VerificationReport } from "./types.js";

export interface VerificationRunSnapshot {
  id?: string;
  sites: ComparisonSite[];
  analyses: ComparableAnalysis[];
  comparison: ComparisonResult;
  history: HistoricalComparison | null;
  verification?: VerificationReport | null;
}

export function verifyResearchRuns(previous: VerificationRunSnapshot & { id: string }, current: VerificationRunSnapshot): VerificationReport {
  const previousRules = ruleIds(previous.analyses);
  const currentRules = ruleIds(current.analyses);
  const priorResolved = new Set(previous.verification?.ruleChanges.resolved ?? []);
  const newRules = difference(currentRules, previousRules);
  const regressed = newRules.filter((ruleId) => priorResolved.has(ruleId));
  const historyChanges = current.history ? allEvidenceChanges(current.history) : [];
  const targetUsable = current.sites[0]?.eligibility.usableAsBenchmark === true;
  const currentTargetGapIds = new Set(current.comparison.targetGaps.map((gap) => gap.ruleId));
  const implementationLinks = previous.comparison.implementationArtifacts.map((artifact) => {
    const present = currentTargetGapIds.has(artifact.sourceFinding.ruleId);
    const wasPreviouslyResolved = previous.verification?.implementationLinks.some((link) => link.artifactId === artifact.artifactId && link.status === "resolved") === true;
    const status: VerificationReport["implementationLinks"][number]["status"] = !targetUsable
      ? "indeterminate"
      : present && wasPreviouslyResolved
      ? "regressed"
      : present
      ? "unchanged"
      : "resolved";
    const currentGap = current.comparison.targetGaps.find((gap) => gap.ruleId === artifact.sourceFinding.ruleId);
    return {
      artifactId: artifact.artifactId,
      sourceRuleId: artifact.sourceFinding.ruleId,
      status,
      currentEvidenceCount: currentGap?.targetEvidence.length ?? 0,
      explanation: status === "resolved"
        ? "The source comparison rule is not present in the current deterministic result."
        : status === "indeterminate"
        ? "Current target evidence is not eligible for a deterministic conclusion."
        : status === "regressed"
        ? "The source rule is present again after an earlier resolved verification."
        : "The source comparison rule remains present in the current deterministic result."
    };
  });

  return {
    verificationVersion: "1.0.0",
    comparedRunId: previous.id,
    observedAt: current.analyses[0]?.fetchedAt ?? new Date(0).toISOString(),
    ruleChanges: {
      new: newRules.filter((ruleId) => !priorResolved.has(ruleId)),
      resolved: difference(previousRules, currentRules),
      unchanged: intersection(previousRules, currentRules),
      regressed
    },
    analyzerChanges: analyzerChanges(previous.analyses[0], current.analyses[0]),
    implementationLinks,
    pageSummary: current.sites.map((site, index) => ({
      role: site.role,
      inputOrder: site.inputOrder,
      normalizedUrl: site.normalizedUrl,
      findingCount: current.analyses[index]?.findings.length ?? 0,
      analyzerObservationCount: current.analyses[index]?.analyzerResults?.observations.length ?? 0,
      eligibility: site.eligibility.status
    })),
    siteSummary: {
      comparedPages: current.sites.length,
      changedEvidenceRecords: historyChanges.length,
      resolvedImplementationArtifacts: implementationLinks.filter((link) => link.status === "resolved").length
    },
    evidenceDiffs: historyChanges.map((change) => ({
      category: change.category,
      field: change.field,
      siteKey: change.siteKey ?? change.currentSourceUrl ?? change.sourceUrl,
      previousValue: change.previousValue,
      currentValue: change.currentValue
    })),
    causationStatement: "Website changes and observed visibility changes occurred during the same interval. This does not establish causation.",
    limitations: [
      "Resolved means a deterministic rule was not triggered in the later crawl; it does not prove business or visibility impact.",
      "Analyzer-version changes are reported explicitly and should not be interpreted as page changes without reviewing evidence.",
      "A live recrawl observes public responses at two times and cannot isolate causation or unseen external changes."
    ]
  };
}

function analyzerChanges(previous: ComparableAnalysis | undefined, current: ComparableAnalysis | undefined): VerificationReport["analyzerChanges"] {
  const previousMap = observationMap(previous?.analyzerResults?.observations ?? []);
  const currentMap = observationMap(current?.analyzerResults?.observations ?? []);
  const ids = [...new Set([...previousMap.keys(), ...currentMap.keys()])].sort();
  return ids.map((analyzerId) => {
    const before = previousMap.get(analyzerId);
    const after = currentMap.get(analyzerId);
    let classification: VerificationClassification;
    if (!before) classification = "new";
    else if (!after) classification = "resolved";
    else if (before.analyzerVersion !== after.analyzerVersion) classification = "changed";
    else if (before.status === after.status) classification = "unchanged";
    else if (isPositive(before.status) && !isPositive(after.status)) classification = "regressed";
    else classification = "changed";
    return {
      analyzerId,
      previousVersion: before?.analyzerVersion ?? null,
      currentVersion: after?.analyzerVersion ?? null,
      previousStatus: before?.status ?? null,
      currentStatus: after?.status ?? null,
      classification,
      limitation: "Status changes describe analyzer observations only; review the linked page evidence and analyzer versions."
    };
  });
}

function observationMap(values: AnalyzerObservation[]): Map<string, AnalyzerObservation> {
  return new Map(values.map((observation) => [observation.analyzerId, observation]));
}

function isPositive(status: AnalyzerObservation["status"]): boolean {
  return status === "observed" || status === "not-applicable";
}

function ruleIds(analyses: ComparableAnalysis[]): string[] {
  return [...new Set(analyses.flatMap((analysis) => analysis.findings.map((finding) => `${finding.ruleId}@${finding.ruleVersion}`)))].sort();
}

function difference(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

function intersection(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value));
}

function allEvidenceChanges(history: HistoricalComparison) {
  return [
    ...history.technicalChanges,
    ...history.metadataChanges,
    ...history.schemaChanges,
    ...history.headingChanges,
    ...history.contentCountChanges,
    ...history.linkAndMediaChanges,
    ...history.competitorChanges.observedChanges
  ];
}
