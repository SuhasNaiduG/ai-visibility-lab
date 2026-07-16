import type { RunRecord } from "../storage/types.js";
import type { GroundedEvidenceItem } from "./types.js";

export function evidenceForRun(run: RunRecord): GroundedEvidenceItem[] {
  const items: GroundedEvidenceItem[] = [];
  run.analyses.forEach((analysis, analysisIndex) => {
    analysis.findings.forEach((finding) => {
      finding.evidence.forEach((evidence, evidenceIndex) => items.push({
        evidenceId: `${run.id}:analysis:${analysisIndex}:finding:${finding.ruleId}:${evidenceIndex}`,
        findingId: finding.ruleId,
        sourceUrl: evidence.sourceUrl,
        field: evidence.field,
        observedValue: evidence.observedValue,
        ...(evidence.snippet ? { snippet: evidence.snippet } : {})
      }));
    });
  });
  run.comparison.targetGaps.forEach((gap) => {
    gap.targetEvidence.forEach((evidence, evidenceIndex) => items.push({
      evidenceId: `${run.id}:comparison:${gap.ruleId}:${evidenceIndex}`,
      findingId: gap.ruleId,
      sourceUrl: evidence.sourceUrl,
      field: evidence.field,
      observedValue: evidence.observedValue,
      ...(evidence.snippet ? { snippet: evidence.snippet } : {})
    }));
  });
  return items;
}
