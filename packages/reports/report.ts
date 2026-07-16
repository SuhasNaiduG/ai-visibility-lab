import { researchSources } from "../research/sources.js";
import type { RunRecord } from "../storage/types.js";
import type { ManualVisibilityObservation } from "../visibility/types.js";

export interface CompleteResearchReport {
  reportVersion: string;
  exportedAt: string;
  target: string;
  competitors: string[];
  run: RunRecord;
  inventory: Array<{
    role: string;
    inputOrder: number;
    inputUrl: string;
    finalUrl: string;
    eligibility: RunRecord["sites"][number]["eligibility"];
    findingCount: number;
  }>;
  visibilityObservations: ManualVisibilityObservation[];
  researchSources: typeof researchSources;
  methodology: string[];
  limitations: string[];
}

export function buildCompleteResearchReport(run: RunRecord, visibilityObservations: ManualVisibilityObservation[] = []): CompleteResearchReport {
  return {
    reportVersion: "1.0.0",
    exportedAt: run.createdAt,
    target: run.targetUrl,
    competitors: [...run.competitorUrls],
    run,
    inventory: run.sites.map((site, index) => ({
      role: site.role,
      inputOrder: site.inputOrder,
      inputUrl: site.inputUrl,
      finalUrl: site.finalUrl,
      eligibility: site.eligibility,
      findingCount: run.analyses[index]?.findings.length ?? 0
    })),
    visibilityObservations,
    researchSources,
    methodology: [
      "Public HTTP/HTML evidence is fetched and parsed deterministically without executing client-side JavaScript.",
      "Every finding and comparison conclusion retains source URLs, observed fields, values, and fetch times.",
      "Competitor differences are observations; ineligible competitors are excluded from conclusions but retained as raw retrieval evidence.",
      "Implementation artifacts are proposals linked to source findings and require factual and professional review.",
      "Later-run changes are correlated by stable identities and rule/analyzer versions without inferring causation."
    ],
    limitations: [
      ...run.comparison.limitations,
      "This export does not contain private analytics, backlink data, automatic search rankings, or guaranteed outcomes.",
      "Missing page evidence does not prove the organization lacks the underlying fact, policy, credential, or capability.",
      "PDF export is not enabled in the deterministic core; JSON, Markdown, and CSV preserve inspectable data."
    ]
  };
}

export function researchReportJson(report: CompleteResearchReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function researchReportMarkdown(report: CompleteResearchReport): string {
  const run = report.run;
  const lines = [
    "# AI Visibility Research Report",
    "",
    `- Report version: \`${report.reportVersion}\``,
    `- Run ID: \`${run.id}\``,
    `- Run created: ${run.createdAt}`,
    `- Target: ${run.targetUrl}`,
    `- Competitors: ${run.competitorUrls.join(", ")}`,
    `- Conclusion status: ${run.comparison.conclusionStatus}`,
    "",
    "## Page inventory and eligibility",
    "",
    "| Order | Role | Final URL | Eligibility | Findings |",
    "| ---: | --- | --- | --- | ---: |",
    ...report.inventory.map((item) => `| ${item.inputOrder} | ${cell(item.role)} | ${cell(item.finalUrl)} | ${cell(item.eligibility.status)} | ${item.findingCount} |`),
    "",
    "## Comparison matrix",
    "",
    "| Role | URL | Words | Questions | Direct answers | Schema types | Trust signals |",
    "| --- | --- | ---: | ---: | ---: | ---: | --- |",
    ...run.comparison.matrix.map((row) => `| ${cell(row.role)} | ${cell(row.finalUrl)} | ${row.metrics.wordCount} | ${row.metrics.questionCount} | ${row.metrics.directAnswerCount} | ${row.metrics.schemaTypeCount} | ${row.metrics.hasTrustSignals ? "Observed" : "Not observed"} |`),
    "",
    "## Evidence-backed target gaps",
    "",
    ...run.comparison.targetGaps.flatMap((gap) => [
      `### ${gap.ruleId} — ${gap.metric}`,
      "",
      `- Category: ${gap.category}`,
      `- Exact difference: ${gap.exactDifference}`,
      `- Interpretation: ${gap.interpretation}`,
      `- Why it may matter: ${gap.whyItMayMatter}`,
      `- Implementation direction: ${gap.implementationDirection}`,
      `- Expected observable outcome: ${gap.expectedObservableOutcome}`,
      `- Verification: ${gap.verificationMethod}`,
      `- Confidence: ${gap.confidence}`,
      `- Limitation: ${gap.limitation}`,
      `- Target evidence: ${gap.targetEvidence.map((item) => `${item.sourceUrl}#${item.field}=${JSON.stringify(item.observedValue)}`).join("; ")}`,
      ""
    ]),
    "## Target advantages, competitor advantages, and shared gaps",
    "",
    `- Target advantages: ${run.comparison.targetAdvantages.map((item) => item.ruleId).join(", ") || "None"}`,
    `- Competitor advantages: ${run.comparison.competitorAdvantages.map((item) => item.ruleId).join(", ") || "None"}`,
    `- Shared gaps: ${run.comparison.sharedGaps.map((item) => item.ruleId).join(", ") || "None"}`,
    `- Competitor-only schema: ${run.comparison.competitorOnlySchemaTypes.join(", ") || "None"}`,
    `- Competitor-only topics: ${run.comparison.competitorOnlyTopics.join(", ") || "None"}`,
    `- Competitor-only questions: ${run.comparison.competitorOnlyQuestions.join(", ") || "None"}`,
    "",
    "## Implementation proposals",
    "",
    ...run.comparison.implementationArtifacts.flatMap((artifact) => [
      `### ${artifact.artifactId} — ${artifact.artifactType}`,
      "",
      `> ${artifact.label}`,
      "",
      `Source finding: \`${artifact.sourceFinding.ruleId}\``,
      "",
      "```",
      artifact.proposedArtifact,
      "```",
      "",
      `Facts to confirm: ${artifact.factsToConfirm.join(" ")}`,
      `Review: ${artifact.reviewRequirement}`,
      `Verification: ${artifact.verificationSteps.join(" ")}`,
      ""
    ]),
    "## Verification and history",
    "",
    run.verification?.causationStatement ?? "This is the first saved run; no prior matching run was available.",
    "",
    run.verification ? `Resolved rules: ${run.verification.ruleChanges.resolved.join(", ") || "None"}` : "",
    run.history ? `Evidence changes: ${run.verification?.siteSummary.changedEvidenceRecords ?? 0}` : "",
    "",
    "## Manual visibility observations",
    "",
    ...(report.visibilityObservations.length ? report.visibilityObservations.map((item) => `- ${item.observationDate}: ${item.query} on ${item.engine}, ${item.location}/${item.device}; rank ${item.observedRank ?? "not recorded"}; citation ${item.observedCitation ?? "not recorded"}.`) : ["No manual visibility observations were included."]),
    "",
    "## Research sources",
    "",
    ...report.researchSources.map((source) => `- **${source.sourceId}** — ${source.publisher}, ${source.title}${source.url ? ` (${source.url})` : " (internal heuristic)"}. ${source.notes}`),
    "",
    "## Methodology",
    "",
    ...report.methodology.map((item) => `- ${item}`),
    "",
    "## Limitations",
    "",
    ...report.limitations.map((item) => `- ${item}`),
    ""
  ];
  return lines.join("\n");
}

export function researchReportCsv(report: CompleteResearchReport): string {
  const rows: unknown[][] = [["section", "site", "rule_or_field", "value", "source_url", "limitation"]];
  for (const [index, row] of report.run.comparison.matrix.entries()) {
    for (const [field, value] of Object.entries(row.metrics)) rows.push(["comparison-metric", row.finalUrl, field, value, row.finalUrl, report.run.comparison.metricDefinitions.find((item) => item.key === field)?.whyItMayHelp ?? ""]);
    for (const finding of report.run.analyses[index]?.findings ?? []) rows.push(["finding", row.finalUrl, `${finding.ruleId}@${finding.ruleVersion}`, finding.problem, finding.evidence[0]?.sourceUrl ?? row.finalUrl, finding.limitation]);
  }
  for (const gap of report.run.comparison.targetGaps) rows.push(["comparison-gap", report.target, gap.ruleId, gap.exactDifference, gap.targetEvidence[0]?.sourceUrl ?? report.target, gap.limitation]);
  for (const proposal of report.run.comparison.implementationArtifacts) rows.push(["proposal", report.target, proposal.artifactId, proposal.proposedArtifact, proposal.evidence[0]?.sourceUrl ?? report.target, proposal.reviewRequirement]);
  for (const observation of report.visibilityObservations) rows.push(["manual-visibility", observation.targetUrl, observation.query, `rank=${observation.observedRank ?? ""};citation=${observation.observedCitation ?? ""}`, observation.referenceUrl ?? observation.citationUrl ?? "", "Manual observation; no causation inference."]);
  for (const source of report.researchSources) rows.push(["research-source", "", source.sourceId, source.claimSupported, source.url ?? "", source.notes]);
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function cell(value: string): string {
  return value.replace(/\|/gu, "\\|").replace(/\r?\n/gu, " ");
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value);
  return `"${text.replace(/"/gu, '""')}"`;
}
