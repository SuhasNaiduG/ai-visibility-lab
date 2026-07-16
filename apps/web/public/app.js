const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function element(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = String(options.text);
  for (const [name, value] of Object.entries(options.attributes ?? {})) node.setAttribute(name, String(value));
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === null || child === undefined) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function clear(node) { node.replaceChildren(); }
function valueOrDash(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? valueOrDash(value) : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" }).format(date);
}

async function api(path, options) {
  const response = await fetch(path, options);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.error?.message ?? body?.error ?? `Request failed with status ${response.status}`;
    const details = body?.error?.details ? `\n${JSON.stringify(body.error.details, null, 2)}` : "";
    throw new Error(`${message}${details}`);
  }
  return body;
}

function setBusy(form, busy, message = "") {
  $("button[type='submit']", form).disabled = busy;
  $(".progress", form).textContent = message;
}
function showError(node, error) {
  node.textContent = error instanceof Error ? error.message : String(error);
  node.hidden = false;
}
function hideError(node) { node.hidden = true; node.textContent = ""; }

function metricCards(items) {
  const grid = element("div", { className: "summary-grid" });
  for (const [label, value] of items) {
    grid.append(element("div", { className: "metric-card" }, [element("span", { text: label }), element("strong", { text: valueOrDash(value) })]));
  }
  return grid;
}

function table(headers, rows) {
  const head = element("thead", {}, element("tr", {}, headers.map((header) => element("th", { text: header }))));
  const body = element("tbody");
  for (const row of rows) body.append(element("tr", {}, row.map((cell) => element("td", { text: valueOrDash(cell) }))));
  return element("div", { className: "table-wrap" }, element("table", {}, [head, body]));
}

function jsonDetails(value, label = "Raw JSON evidence") {
  return element("details", {}, [element("summary", { text: label }), element("pre", { text: JSON.stringify(value, null, 2) })]);
}

function section(title, contents, options = {}) {
  const className = ["section-card", options.className].filter(Boolean).join(" ");
  return element("section", { className, attributes: options.attributes }, [element("h3", { text: title }), ...(Array.isArray(contents) ? contents : [contents])]);
}

function renderFindings(findings = []) {
  if (!findings.length) return element("p", { className: "empty", text: "No deterministic findings were triggered by the available evidence." });
  const wrapper = element("div", { className: "filterable-view" });
  const category = element("select", { attributes: { "aria-label": "Filter findings by category" } });
  category.append(element("option", { text: "All categories", attributes: { value: "" } }));
  for (const value of [...new Set(findings.map((finding) => finding.category).filter(Boolean))].sort()) {
    category.append(element("option", { text: value, attributes: { value } }));
  }
  const priority = element("select", { attributes: { "aria-label": "Filter findings by priority" } });
  priority.append(element("option", { text: "All priorities", attributes: { value: "" } }));
  for (const value of ["high", "medium", "low"]) priority.append(element("option", { text: value, attributes: { value } }));
  const count = element("span", { className: "filter-count" });
  const controls = element("div", { className: "filter-bar" }, [category, priority, count]);
  const list = element("div", { className: "finding-list" });
  const draw = () => {
    clear(list);
    const filtered = findings.filter((finding) => (!category.value || finding.category === category.value) && (!priority.value || finding.priority === priority.value));
    count.textContent = `${filtered.length} of ${findings.length} findings`;
    if (!filtered.length) {
      list.append(element("p", { className: "empty", text: "No findings match the current filters." }));
      return;
    }
    for (const finding of filtered) {
      const tags = element("div", { className: "tags" }, [finding.ruleId, `v${finding.ruleVersion ?? "legacy"}`, finding.category, finding.priority, finding.effort, finding.classification].filter(Boolean).map((tag) => element("span", { className: "tag", text: tag })));
      const details = element("div", { className: "detail-grid" }, [
        labelled("Why it may matter", finding.whyItMatters),
        labelled("Exact implementation", finding.exactImplementation),
        labelled("Expected outcome", finding.expectedOutcome),
        labelled("Verification", finding.verificationMethod),
        labelled("Confidence", finding.confidence),
        labelled("Limitation", finding.limitation)
      ]);
      list.append(element("article", { className: `finding ${finding.priority ?? ""}` }, [tags, element("h3", { text: finding.problem }), details, jsonDetails(finding.evidence ?? [], "Structured evidence") ]));
    }
  };
  category.addEventListener("change", draw);
  priority.addEventListener("change", draw);
  draw();
  wrapper.append(controls, list);
  return wrapper;
}

function labelled(label, value) {
  return element("p", {}, [element("strong", { text: label }), document.createTextNode(valueOrDash(value))]);
}

function renderAnalysis(result, container) {
  clear(container);
  container.append(metricCards([
    ["HTTP status", result.statusCode],
    ["Final URL", result.finalUrl],
    ["Response time", `${result.responseTimeMs} ms`],
    ["Redirects", result.redirectCount ?? (result.redirectObserved ? 1 : 0)],
    ["Indexability", result.indexability?.status ?? result.indexability],
    ["Words", result.wordCount],
    ["Questions", result.questionCount],
    ["Findings", result.findings?.length ?? 0]
  ]));
  container.append(section("Metadata and retrieval", table(["Field", "Observed value"], [
    ["Requested URL", result.requestedUrl], ["Normalized URL", result.normalizedUrl], ["Fetched", formatTime(result.fetchedAt)],
    ["Title", result.title], ["Title length", result.titleLength], ["Meta description", result.metaDescription], ["Description length", result.metaDescriptionLength],
    ["Canonical", result.canonicalUrl], ["Canonical relationship", result.canonicalStatus ?? result.canonicalRelationship], ["Robots meta", result.robotsMeta],
    ["Document language", result.documentLanguage], ["Viewport present", result.viewportPresent], ["robots.txt", `${valueOrDash(result.robotsTxtAvailable)} (${valueOrDash(result.robotsTxtStatusCode)})`],
    ["sitemap.xml", `${valueOrDash(result.sitemapXmlAvailable)} (${valueOrDash(result.sitemapXmlStatusCode)})`]
  ])));
  container.append(section("Headings, content, and answerability", [
    table(["Metric", "Observed value"], [
      ["H1 count", result.h1Count], ["H1 text", result.h1Text], ["Total headings", result.totalHeadingCount], ["Heading jumps", result.headingLevelJumps?.length ?? 0],
      ["Empty headings", result.emptyHeadingCount], ["Repeated headings", (result.repeatedHeadings ?? []).map((item) => item.text)], ["Sentences", result.sentenceCount],
      ["Detected questions", result.detectedQuestions], ["FAQ indicators", (result.faqIndicators ?? []).map((item) => item.text ?? item)], ["Direct answers", result.directAnswerCount]
    ]),
    jsonDetails(result.headingHierarchy ?? [], "Complete heading hierarchy"),
    jsonDetails(result.coverage ?? {}, "Entity, service, location, trust, and contact evidence")
  ]));
  container.append(section("Structured data, links, and media", table(["Metric", "Observed value"], [
    ["Schema types", result.schemaTypes], ["JSON-LD blocks", result.jsonLdBlocks?.length ?? 0], ["JSON-LD parse errors", result.jsonLdParseErrors?.length ?? 0],
    ["Internal links", result.internalLinkCount], ["Unique internal URLs", result.uniqueInternalUrlCount ?? result.uniqueInternalUrls?.length], ["External links", result.externalLinkCount],
    ["External domains", result.externalDomains], ["Images", result.imageCount], ["Images missing alt", result.imagesMissingAlt], ["Empty anchors", result.emptyAnchorCount]
  ])));
  container.append(section("Deterministic findings", renderFindings(result.findings)));
  container.append(jsonDetails(result));
}

function eligibilityStatus(value) {
  return ["eligible", "degraded", "ineligible"].includes(value) ? value : "eligible";
}

function eligibilityFor(site, row) {
  const supplied = site?.eligibility ?? row?.eligibility;
  if (supplied) return { ...supplied, status: eligibilityStatus(supplied.status) };
  const statusCode = row?.metrics?.statusCode;
  const usable = typeof statusCode !== "number" || (statusCode >= 200 && statusCode < 300);
  return {
    status: usable ? "eligible" : "ineligible",
    usableAsBenchmark: usable,
    reasons: usable ? [] : [{ code: "NON_SUCCESS_HTTP", message: `The page returned HTTP ${statusCode}.`, evidence: [] }]
  };
}

function eligibilityBadge(eligibility) {
  const status = eligibilityStatus(eligibility?.status);
  return element("span", { className: `eligibility-badge ${status}`, text: status[0].toUpperCase() + status.slice(1) });
}

function matrixRowForSite(matrix, site, fallbackIndex) {
  return matrix.find((row) => row.inputOrder === site.inputOrder && row.role === site.role)
    ?? matrix.find((row) => row.url === site.normalizedUrl && row.role === site.role)
    ?? matrix.find((row) => row.finalUrl === site.finalUrl && row.role === site.role)
    ?? matrix[fallbackIndex];
}

function orderedComparisonSites(comparison) {
  const matrix = comparison.matrix ?? [];
  const supplied = comparison.sites?.length
    ? comparison.sites
    : matrix.map((row, index) => ({
        role: row.role,
        inputOrder: row.inputOrder ?? index,
        inputUrl: row.inputUrl ?? row.url,
        normalizedUrl: row.url,
        finalUrl: row.finalUrl,
        eligibility: row.eligibility
      }));
  const ordered = [
    ...supplied.filter((site) => site.role === "target"),
    ...supplied.filter((site) => site.role !== "target")
  ];
  let competitorNumber = 0;
  return ordered.map((site, index) => {
    const row = matrixRowForSite(matrix, site, index);
    const label = site.role === "target" ? "Target" : `Competitor ${++competitorNumber}`;
    return { site, row, label, eligibility: eligibilityFor(site, row) };
  });
}

function renderSiteEligibility(siteEntries) {
  const grid = element("div", { className: "comparison-sites" });
  for (const entry of siteEntries) {
    const status = eligibilityStatus(entry.eligibility.status);
    const reasons = entry.eligibility.reasons ?? [];
    const reasonList = reasons.length
      ? element("ul", { className: "eligibility-reasons" }, reasons.map((reason) => element("li", {}, [
          element("span", { className: "reason-code", text: reason.code }),
          document.createTextNode(reason.message ? ` ${reason.message}` : "")
        ])))
      : element("p", { className: "eligibility-use", text: "Usable as a competitive benchmark." });
    grid.append(element("article", { className: `comparison-site eligibility-${status}` }, [
      element("div", { className: "site-card-heading" }, [element("h4", { text: entry.label }), eligibilityBadge(entry.eligibility)]),
      labelled("Submitted URL", entry.site.inputUrl ?? entry.site.normalizedUrl),
      labelled("Final URL", entry.site.finalUrl ?? entry.row?.finalUrl),
      element("p", {
        className: `eligibility-use ${entry.eligibility.usableAsBenchmark ? "included" : "excluded"}`,
        text: entry.eligibility.usableAsBenchmark ? "Included in competitive conclusions." : "Excluded from competitive conclusions."
      }),
      reasonList
    ]));
  }
  return grid;
}

function renderComparisonMatrix(comparison, siteEntries) {
  const definitions = new Map((comparison.metricDefinitions ?? []).map((item) => [item.key, item]));
  const metricKeys = comparison.metricDefinitions?.length
    ? comparison.metricDefinitions.map((item) => item.key)
    : Object.keys(siteEntries[0]?.row?.metrics ?? {});
  const head = element("thead");
  const headRow = element("tr");
  headRow.append(element("th", { text: "Metric", attributes: { scope: "col" } }));
  for (const entry of siteEntries) {
    const status = eligibilityStatus(entry.eligibility.status);
    headRow.append(element("th", { className: `comparison-column eligibility-${status}`, attributes: { scope: "col" } }, [
      element("div", { className: "matrix-site-heading" }, [element("span", { text: entry.label }), eligibilityBadge(entry.eligibility)]),
      element("span", { className: "matrix-url", text: entry.site.normalizedUrl ?? entry.row?.url })
    ]));
  }
  head.append(headRow);
  const body = element("tbody");
  const appendRow = (label, values) => {
    const row = element("tr");
    row.append(element("th", { text: label, attributes: { scope: "row" } }));
    values.forEach((value, index) => {
      const status = eligibilityStatus(siteEntries[index]?.eligibility.status);
      row.append(element("td", { className: `comparison-column eligibility-${status}`, text: valueOrDash(value) }));
    });
    body.append(row);
  };
  appendRow("Manual rank observation (user supplied)", siteEntries.map((entry) => entry.row?.manualRankObservation));
  for (const key of metricKeys) {
    appendRow(definitions.get(key)?.label ?? key, siteEntries.map((entry) => entry.row?.metrics?.[key]));
  }
  return element("div", { className: "table-wrap comparison-matrix" }, element("table", {}, [head, body]));
}

function evidenceValue(value) {
  if (value !== null && typeof value === "object") {
    return element("pre", { className: "evidence-value", text: JSON.stringify(value, null, 2) });
  }
  return element("span", { className: "evidence-value scalar", text: valueOrDash(value) });
}

function evidenceRecord(item) {
  return element("article", { className: "evidence-record" }, [
    element("div", { className: "evidence-record-grid" }, [
      labelled("Selector or field", item.selector || item.field),
      labelled("Fetched", formatTime(item.fetchedAt)),
      labelled("Snippet", item.snippet || "Not recorded")
    ]),
    element("div", { className: "evidence-record-value" }, [element("strong", { text: "Evidence" }), evidenceValue(item.observedValue)])
  ]);
}

function evidencePanel(entry, bundle, options = {}) {
  const eligibility = entry?.eligibility ?? { status: "eligible", usableAsBenchmark: true, reasons: [] };
  const status = eligibilityStatus(eligibility.status);
  const evidence = bundle?.evidence ?? [];
  const sourceUrl = bundle?.sourceUrl ?? evidence[0]?.sourceUrl ?? entry?.site?.finalUrl;
  const observedValue = bundle?.observedValue ?? evidence[0]?.observedValue;
  const headerItems = [element("h4", { text: entry?.label ?? options.label ?? "Competitor" }), eligibilityBadge(eligibility)];
  if (bundle?.benchmark) headerItems.push(element("span", { className: "benchmark-badge", text: "Benchmark" }));
  if (!eligibility.usableAsBenchmark) {
    return element("article", { className: `gap-evidence-panel eligibility-${status} conclusion-excluded` }, [
      element("div", { className: "evidence-panel-heading" }, headerItems),
      labelled("URL", sourceUrl),
      element("p", { className: "excluded-message", text: "Excluded from competitive conclusions. Raw retrieval evidence remains available above." })
    ]);
  }
  if (!bundle) {
    return element("article", { className: `gap-evidence-panel eligibility-${status} evidence-missing` }, [
      element("div", { className: "evidence-panel-heading" }, headerItems),
      labelled("URL", sourceUrl),
      element("p", { className: "missing-evidence-message", text: "No aligned comparison evidence was supplied for this eligible site. Review its raw retrieval evidence before using this conclusion." })
    ]);
  }
  return element("article", { className: `gap-evidence-panel eligibility-${status}` }, [
    element("div", { className: "evidence-panel-heading" }, headerItems),
    labelled("URL", sourceUrl),
    element("div", { className: "observed-value" }, [element("strong", { text: "Observed value" }), evidenceValue(observedValue)]),
    element("div", { className: "evidence-records" }, evidence.length
      ? evidence.map(evidenceRecord)
      : [element("p", { className: "empty compact", text: "No structured evidence was supplied for this value." })])
  ]);
}

function competitorBundleForSite(bundles, site, used) {
  const match = bundles.find((bundle, index) => !used.has(index) && (
    (bundle.inputOrder !== undefined && bundle.inputOrder === site.inputOrder)
    || (bundle.normalizedUrl && bundle.normalizedUrl === site.normalizedUrl)
    || (bundle.sourceUrl && bundle.sourceUrl === site.finalUrl)
  ));
  if (!match) return null;
  used.add(bundles.indexOf(match));
  return match;
}

function renderGapEvidence(gap, siteEntries) {
  const grid = element("div", { className: "gap-evidence-grid" });
  const target = siteEntries.find((entry) => entry.site.role === "target") ?? { label: "Target", eligibility: { status: "eligible", usableAsBenchmark: true, reasons: [] }, site: {} };
  grid.append(evidencePanel(target, {
    sourceUrl: gap.targetEvidence?.[0]?.sourceUrl ?? target.site.finalUrl,
    observedValue: gap.targetEvidence?.[0]?.observedValue,
    evidence: gap.targetEvidence ?? []
  }));
  const bundles = gap.competitorEvidence ?? [];
  const used = new Set();
  const competitors = siteEntries.filter((entry) => entry.site.role !== "target");
  for (const entry of competitors) {
    grid.append(evidencePanel(entry, competitorBundleForSite(bundles, entry.site, used)));
  }
  bundles.forEach((bundle, index) => {
    if (!used.has(index)) grid.append(evidencePanel(null, bundle, { label: `Competitor ${index + 1}` }));
  });
  return grid;
}

function renderGapDifference(gap) {
  if (gap.delta) {
    return metricCards([
      ["Target value", gap.delta.targetValue],
      ["Benchmark value", gap.delta.benchmarkValue],
      ["Difference", gap.delta.difference],
      ["Threshold", gap.delta.threshold],
      ["Interpretation", gap.delta.interpretation]
    ]);
  }
  if (gap.missingValues?.length) return metricCards([["Competitor-only values", gap.missingValues]]);
  return null;
}

function renderGaps(gaps = [], siteEntries = [], definitions = new Map()) {
  if (!gaps.length) return element("p", { className: "empty", text: "No target gaps met the transparent comparison thresholds." });
  const list = element("div", { className: "gap-list" });
  for (const gap of gaps) {
    const metricLabel = definitions.get(gap.metric)?.label ?? gap.metric;
    const delta = renderGapDifference(gap);
    list.append(element("article", { className: `gap ${gap.priority ?? ""}` }, [
      element("div", { className: "tags" }, [gap.ruleId ?? gap.gapId, gap.category, metricLabel, `Confidence: ${gap.confidence}`, `Priority: ${gap.priority}`, `Effort: ${gap.effort}`].filter(Boolean).map((tag) => element("span", { className: "tag", text: tag }))),
      element("h3", { text: metricLabel }),
      element("div", { className: "detail-grid gap-explanation" }, [
        labelled("Exact difference", gap.exactDifference ?? gap.whatDiffers),
        labelled("Interpretation", gap.interpretation ?? gap.competitorObservation),
        labelled("Why it may matter", gap.whyItMayMatter),
        labelled("Implementation", gap.implementationDirection),
        labelled("Expected observable outcome", gap.expectedObservableOutcome),
        labelled("Verification", gap.verificationMethod),
        labelled("Confidence", gap.confidence),
        labelled("Priority", gap.priority),
        labelled("Effort", gap.effort)
      ]),
      delta,
      element("div", { className: "causation-limitation" }, [
        element("strong", { text: "Causation limitation" }),
        element("p", { text: gap.competitorObservation }),
        element("p", { text: gap.limitation ?? gap.caution })
      ]),
      element("h4", { className: "evidence-heading", text: "Target and competitor evidence" }),
      renderGapEvidence(gap, siteEntries),
      jsonDetails({ delta: gap.delta, missingValues: gap.missingValues, targetEvidence: gap.targetEvidence, competitorEvidence: gap.competitorEvidence }, "Raw comparison evidence")
    ].filter(Boolean)));
  }
  return list;
}

function renderAdvantages(advantages = [], siteEntries = [], definitions = new Map()) {
  if (!advantages.length) return element("p", { className: "empty", text: "No target advantages met the transparent comparison thresholds." });
  const list = element("div", { className: "gap-list advantage-list" });
  for (const advantage of advantages) {
    const metricLabel = definitions.get(advantage.metric)?.label ?? advantage.metric;
    const delta = renderGapDifference(advantage);
    list.append(element("article", { className: "gap advantage" }, [
      element("div", { className: "tags" }, [advantage.ruleId ?? advantage.advantageId, advantage.category, metricLabel, `Confidence: ${advantage.confidence}`].filter(Boolean).map((tag) => element("span", { className: "tag", text: tag }))),
      element("h3", { text: metricLabel }),
      element("div", { className: "detail-grid gap-explanation" }, [
        labelled("Exact difference", advantage.exactDifference ?? advantage.whatDiffers),
        labelled("Interpretation", advantage.interpretation),
        labelled("Why it may matter", advantage.whyItMayMatter),
        labelled("Implementation", advantage.implementationDirection),
        labelled("Expected observable outcome", advantage.expectedObservableOutcome),
        labelled("Verification", advantage.verificationMethod),
        labelled("Limitation", advantage.limitation)
      ]),
      delta,
      element("h4", { className: "evidence-heading", text: "Target and competitor evidence" }),
      renderGapEvidence(advantage, siteEntries),
      jsonDetails({ delta: advantage.delta, targetEvidence: advantage.targetEvidence, competitorEvidence: advantage.competitorEvidence }, "Raw comparison evidence")
    ].filter(Boolean)));
  }
  return list;
}

function renderImplementationWorkspace(artifacts = []) {
  if (!artifacts.length) {
    return element("p", { className: "empty", text: "No evidence-backed implementation proposals were generated for this comparison." });
  }
  const workspace = element("div", { className: "implementation-workspace" });
  for (const artifact of artifacts) {
    workspace.append(element("article", { className: "artifact proposal-artifact" }, [
      element("p", { className: "proposal-label", text: artifact.label ?? "Proposal — requires factual and professional review before publication." }),
      element("div", { className: "tags" }, [artifact.artifactId, artifact.artifactType, artifact.status].filter(Boolean).map((tag) => element("span", { className: "tag", text: tag }))),
      labelled("Source finding", `${artifact.sourceFinding?.ruleId}: ${artifact.sourceFinding?.metric}`),
      jsonDetails(artifact.evidence ?? [], "Source evidence"),
      element("div", { className: "artifact" }, [element("strong", { text: "Proposed artifact" }), element("pre", { text: artifact.proposedArtifact })]),
      labelled("Assumptions", artifact.assumptions),
      labelled("Facts requiring confirmation", artifact.factsToConfirm),
      labelled("Review requirement", artifact.reviewRequirement),
      element("div", {}, [element("strong", { text: "Verification steps" }), element("ol", { className: "plain-list" }, (artifact.verificationSteps ?? []).map((step) => element("li", { text: step })))])
    ]));
  }
  return workspace;
}

function renderFixtureVerification() {
  return element("div", { className: "fixture-verification" }, [
    element("p", { text: "Deterministic local fixtures prove the verification workflow without changing a live website." }),
    table(["State", "Stable rule IDs"], [
      ["Resolved in corrected fixture", ["CANONICAL_MISMATCH", "HEADING_MULTIPLE_H1", "HEADING_LEVEL_JUMP", "HEADING_EMPTY", "JSONLD_INVALID", "IMAGE_ALT_MISSING"]],
      ["Newly added", "None"],
      ["Unchanged", "INTERNAL_LINKS_LOW"]
    ]),
    element("p", { text: "Original fixture → deterministic findings → corrected fixture → rerun → resolved, new, and unchanged rule IDs." })
  ]);
}

function renderRunVerification(report) {
  return element("div", { className: "run-verification" }, [
    element("p", { className: "causation-limitation", text: report.causationStatement }),
    metricCards([
      ["Verification version", report.verificationVersion],
      ["Compared run", report.comparedRunId],
      ["New rules", report.ruleChanges?.new?.length ?? 0],
      ["Resolved rules", report.ruleChanges?.resolved?.length ?? 0],
      ["Unchanged rules", report.ruleChanges?.unchanged?.length ?? 0],
      ["Regressed rules", report.ruleChanges?.regressed?.length ?? 0],
      ["Resolved proposals", report.siteSummary?.resolvedImplementationArtifacts ?? 0]
    ]),
    table(["Proposal", "Source rule", "Status", "Explanation"], (report.implementationLinks ?? []).map((link) => [link.artifactId, link.sourceRuleId, link.status, link.explanation])),
    table(["Analyzer", "Previous version/status", "Current version/status", "Classification"], (report.analyzerChanges ?? []).map((change) => [
      change.analyzerId,
      `${valueOrDash(change.previousVersion)} / ${valueOrDash(change.previousStatus)}`,
      `${valueOrDash(change.currentVersion)} / ${valueOrDash(change.currentStatus)}`,
      change.classification
    ])),
    jsonDetails(report.evidenceDiffs ?? [], "Evidence diffs"),
    element("ul", { className: "plain-list" }, (report.limitations ?? []).map((item) => element("li", { text: item })))
  ]);
}

function renderOptionalAiInterpretation(run) {
  const output = element("div", { className: "ai-interpretation-output" });
  const button = element("button", { className: "secondary", text: "Generate optional interpretation", attributes: { type: "button" } });
  button.addEventListener("click", async () => {
    button.disabled = true;
    clear(output);
    output.append(element("p", { className: "empty", text: "Checking configuration and grounding the request in saved evidence…" }));
    try {
      const status = await api("/api/ai/status");
      if (!status.enabled) throw new Error("Optional AI interpretation is not configured. Deterministic evidence and proposals remain fully available.");
      const interpretation = await api(`/api/runs/${encodeURIComponent(run.id)}/interpretations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      clear(output);
      output.append(
        labelled("AI summary", interpretation.summary),
        labelled("Evidence citations", interpretation.citations),
        labelled("Provider/model", `${interpretation.provider} / ${interpretation.model}`),
        element("ul", { className: "plain-list" }, (interpretation.warnings ?? []).map((warning) => element("li", { text: warning }))),
        jsonDetails(interpretation, "Complete schema-validated interpretation")
      );
    } catch (caught) {
      clear(output);
      output.append(element("p", { className: "error", text: caught instanceof Error ? caught.message : String(caught) }));
    } finally {
      button.disabled = false;
    }
  });
  return element("div", { className: "optional-ai" }, [
    element("p", { text: "Optional AI interpretation is provider-neutral, disabled by default, and may only summarize saved deterministic evidence IDs. It never overwrites findings." }),
    button,
    output
  ]);
}

function renderReportExports(run) {
  return element("div", { className: "export-links" }, [
    ["JSON", "json"],
    ["Markdown", "markdown"],
    ["CSV", "csv"]
  ].map(([label, format]) => element("a", {
    text: `Export ${label}`,
    attributes: { href: `/api/runs/${encodeURIComponent(run.id)}/export?format=${format}` }
  })));
}

function analysisForSite(run, entry) {
  const analyses = run.analyses ?? [];
  const direct = analyses[entry.site.inputOrder];
  if (direct && (direct.normalizedUrl === entry.site.normalizedUrl || direct.finalUrl === entry.site.finalUrl)) return direct;
  return analyses.find((analysis) => analysis.normalizedUrl === entry.site.normalizedUrl)
    ?? analyses.find((analysis) => analysis.finalUrl === entry.site.finalUrl)
    ?? direct;
}

function rawRetrievalEvidence(run, entry) {
  const analysis = analysisForSite(run, entry);
  return {
    site: {
      role: entry.site.role,
      inputOrder: entry.site.inputOrder,
      inputUrl: entry.site.inputUrl,
      normalizedUrl: entry.site.normalizedUrl,
      finalUrl: entry.site.finalUrl
    },
    eligibility: entry.eligibility,
    retrieval: analysis ? {
      requestedUrl: analysis.requestedUrl,
      normalizedUrl: analysis.normalizedUrl,
      statusCode: analysis.statusCode,
      finalUrl: analysis.finalUrl,
      responseTimeMs: analysis.responseTimeMs,
      fetchedAt: analysis.fetchedAt,
      redirectCount: analysis.redirectCount,
      redirectChain: analysis.redirectChain ?? [],
      networkChecks: analysis.networkChecks ?? [],
      robotsTxtUrl: analysis.robotsTxtUrl,
      sitemapXmlUrl: analysis.sitemapXmlUrl,
      siteResources: analysis.siteResources,
      rawEvidence: analysis.rawEvidence ?? []
    } : {
      statusCode: entry.row?.metrics?.statusCode,
      finalUrl: entry.row?.finalUrl,
      evidenceAvailable: false
    }
  };
}

function renderRawRetrieval(run, siteEntries) {
  const list = element("div", { className: "raw-retrieval-list" });
  for (const entry of siteEntries) {
    const details = element("details", { className: "raw-retrieval" }, [
      element("summary", {}, [element("span", { text: `${entry.label} raw retrieval evidence` }), eligibilityBadge(entry.eligibility)]),
      element("pre", { text: JSON.stringify(rawRetrievalEvidence(run, entry), null, 2) })
    ]);
    list.append(details);
  }
  return list;
}

function disabledConclusion(message = "Competitive conclusions were not calculated from ineligible evidence.") {
  return element("p", { className: "conclusion-disabled-message", text: message });
}

function historyChanges(history) {
  return [
    ...(history.technicalChanges ?? []),
    ...(history.metadataChanges ?? []),
    ...(history.schemaChanges ?? []),
    ...(history.headingChanges ?? []),
    ...(history.contentCountChanges ?? []),
    ...(history.linkAndMediaChanges ?? [])
  ];
}

function legacySourceMatches(change, entry, siteEntries) {
  const sources = [change.sourceUrl, change.currentSourceUrl, change.previousSourceUrl].filter(Boolean);
  const matches = siteEntries.filter((candidate) => sources.includes(candidate.site.finalUrl) || sources.includes(candidate.site.normalizedUrl));
  return matches.length === 1 && matches[0] === entry;
}

function changeMatchesSite(change, entry, siteEntries) {
  if (change.siteKey) return change.siteKey === entry.site.normalizedUrl;
  if (change.inputOrder !== undefined) return change.inputOrder === entry.site.inputOrder;
  return legacySourceMatches(change, entry, siteEntries);
}

function findingMatchesSite(change, entry, siteEntries) {
  if (change.siteKey) return change.siteKey === entry.site.normalizedUrl;
  if (change.inputOrder !== undefined) return change.inputOrder === entry.site.inputOrder;
  return legacySourceMatches(change, entry, siteEntries);
}

function renderHistorySideBySide(history, siteEntries) {
  const allChanges = historyChanges(history);
  const findingChanges = history.findingChanges ?? [];
  const list = element("div", { className: "history-site-list" });
  const renderedChanges = new Set();
  const renderedFindingChanges = new Set();
  for (const entry of siteEntries) {
    const changes = allChanges.filter((change) => changeMatchesSite(change, entry, siteEntries));
    changes.forEach((change) => renderedChanges.add(change));
    const findings = findingChanges.find((change) => findingMatchesSite(change, entry, siteEntries));
    if (findings) renderedFindingChanges.add(findings);
    const content = [];
    if (changes.length) {
      content.push(table(
        ["Field", "Previous value", "Current value", "Observed change"],
        changes.map((change) => [change.field, change.previousValue, change.currentValue, change.change])
      ));
    } else {
      content.push(element("p", { className: "empty compact", text: "No tracked previous/current value changed for this website." }));
    }
    if (findings) {
      content.push(table(["Finding state", "Stable rule IDs"], [
        ["New", findings.newRuleIds],
        ["Resolved", findings.resolvedRuleIds],
        ["Unchanged", findings.unchangedRuleIds],
        ["Indeterminate", findings.indeterminateRuleIds]
      ]));
    }
    list.append(element("article", { className: "history-site" }, [
      element("div", { className: "site-card-heading" }, [
        element("h4", { text: `${entry.label}: ${entry.site.normalizedUrl}` }),
        eligibilityBadge(entry.eligibility)
      ]),
      ...content
    ]));
  }

  const unmatchedChanges = allChanges.filter((change) => !renderedChanges.has(change));
  const unmatchedFindings = findingChanges.filter((change) => !renderedFindingChanges.has(change));
  if (unmatchedChanges.length || unmatchedFindings.length) {
    list.append(element("article", { className: "history-site history-unmatched" }, [
      element("h4", { text: "Legacy changes with no unambiguous submitted-site identity" }),
      element("p", { text: "These previous/current observations are preserved without assigning them to the wrong website." }),
      ...(unmatchedChanges.length ? [table(
        ["Source", "Field", "Previous value", "Current value"],
        unmatchedChanges.map((change) => [change.sourceUrl, change.field, change.previousValue, change.currentValue])
      )] : []),
      ...(unmatchedFindings.length ? [jsonDetails(unmatchedFindings, "Unmatched finding changes")] : [])
    ]));
  }

  const competitorChanges = history.competitorChanges ?? {};
  const ordering = competitorChanges.ordering;
  if ((competitorChanges.addedUrls?.length ?? 0) || (competitorChanges.removedUrls?.length ?? 0) || ordering) {
    const orderRows = ordering
      ? Array.from({ length: Math.max(ordering.previousOrder?.length ?? 0, ordering.currentOrder?.length ?? 0) }, (_, index) => [
          index + 1,
          ordering.previousOrder?.[index],
          ordering.currentOrder?.[index]
        ])
      : [];
    list.append(element("article", { className: "history-site history-membership" }, [
      element("h4", { text: "Competitor membership and order" }),
      metricCards([
        ["Added", competitorChanges.addedUrls ?? []],
        ["Removed", competitorChanges.removedUrls ?? []],
        ["Relative order changed", ordering?.orderChanged ?? "Not recorded"]
      ]),
      ...(orderRows.length ? [table(["Position", "Previous competitor", "Current competitor"], orderRows)] : [])
    ]));
  }
  return list;
}

function renderComparison(run, container) {
  clear(container);
  const comparison = run.comparison ?? run;
  const siteEntries = orderedComparisonSites(comparison);
  const conclusionStatus = comparison.conclusionStatus ?? "complete";
  const conclusionsUnavailable = conclusionStatus === "unavailable";
  const definitions = new Map((comparison.metricDefinitions ?? []).map((item) => [item.key, item]));
  container.append(metricCards([
    ["Saved run", run.id ?? run.runId], ["Created", formatTime(run.createdAt)], ["Sites", siteEntries.length],
    ["Conclusion status", conclusionStatus], ["Target gaps", comparison.targetGaps?.length ?? 0], ["Target advantages", comparison.targetAdvantages?.length ?? 0], ["Shared gaps", comparison.sharedGaps?.length ?? 0], ["Prior matching run", run.history?.previousRunId ?? "None"]
  ]));
  if (comparison.incompleteMessage) {
    container.append(element("div", { className: "comparison-incomplete", text: comparison.incompleteMessage, attributes: { role: "status" } }));
  }
  container.append(section("Site eligibility and comparison use", renderSiteEligibility(siteEntries)));
  container.append(section("Normalized comparison matrix", [
    renderComparisonMatrix(comparison, siteEntries),
    jsonDetails(comparison.metricDefinitions ?? [], "Metric explanations")
  ]));
  container.append(section("Raw retrieval evidence", renderRawRetrieval(run, siteEntries), { className: "raw-retrieval-section" }));
  container.append(section(
    "Evidence-backed target gaps",
    conclusionsUnavailable ? disabledConclusion() : renderGaps(comparison.targetGaps, siteEntries, definitions),
    conclusionsUnavailable ? { className: "conclusion-section is-disabled", attributes: { "aria-disabled": "true" } } : { className: "conclusion-section" }
  ));
  container.append(section(
    "Observed target advantages",
    conclusionsUnavailable
      ? disabledConclusion()
      : renderAdvantages(comparison.targetAdvantages, siteEntries, definitions),
    conclusionsUnavailable ? { className: "conclusion-section is-disabled", attributes: { "aria-disabled": "true" } } : { className: "conclusion-section" }
  ));
  container.append(section(
    "Observed competitor advantages",
    conclusionsUnavailable ? disabledConclusion() : renderGaps(comparison.competitorAdvantages ?? comparison.targetGaps, siteEntries, definitions),
    conclusionsUnavailable ? { className: "conclusion-section is-disabled", attributes: { "aria-disabled": "true" } } : { className: "conclusion-section" }
  ));
  container.append(section(
    "Shared observed gaps",
    conclusionsUnavailable ? disabledConclusion() : renderGaps(comparison.sharedGaps ?? [], siteEntries, definitions),
    conclusionsUnavailable ? { className: "conclusion-section is-disabled", attributes: { "aria-disabled": "true" } } : { className: "conclusion-section" }
  ));
  container.append(section(
    "Coverage differences",
    conclusionsUnavailable
      ? disabledConclusion()
      : table(["Comparison", "Observed competitor-only values"], [
          ["Schema types", comparison.competitorOnlySchemaTypes], ["Topics", comparison.competitorOnlyTopics], ["Questions", comparison.competitorOnlyQuestions]
        ]),
    conclusionsUnavailable ? { className: "conclusion-section is-disabled", attributes: { "aria-disabled": "true" } } : { className: "conclusion-section" }
  ));
  container.append(section("Implementation workspace", renderImplementationWorkspace(comparison.implementationArtifacts ?? []), { className: "implementation-section" }));
  container.append(section("Fixture verification", renderFixtureVerification(), { className: "verification-section" }));
  if (run.verification) container.append(section("Later-run verification", renderRunVerification(run.verification), { className: "verification-section" }));
  if (run.id) container.append(section("Complete report exports", [renderReportExports(run), element("p", { text: "JSON, Markdown, and CSV preserve the evidence and limitations. PDF is deferred and does not block the deterministic core." })]));
  if (run.id) container.append(section("Optional evidence-grounded AI interpretation", renderOptionalAiInterpretation(run)));
  if (run.history) container.append(section("Changes since the prior matching run", [
    metricCards([["Technical", run.history.technicalChanges?.length ?? 0], ["Metadata", run.history.metadataChanges?.length ?? 0], ["Schema", run.history.schemaChanges?.length ?? 0], ["Headings", run.history.headingChanges?.length ?? 0], ["Content", run.history.contentCountChanges?.length ?? 0], ["Links/media", run.history.linkAndMediaChanges?.length ?? 0]]),
    element("p", { text: run.history.correlationSummary?.interpretation }),
    renderHistorySideBySide(run.history, siteEntries),
    jsonDetails(run.history, "Complete historical diff")
  ]));
  const limitations = element("ul", { className: "plain-list" }, (comparison.limitations ?? []).map((item) => element("li", { text: item })));
  container.append(section("Limitations", limitations));
  container.append(jsonDetails(run, "Complete saved run JSON"));
}

function renderCrawlProject(project, container) {
  clear(container);
  const aggregate = project.aggregate ?? {};
  container.append(metricCards([
    ["Project ID", project.projectId],
    ["Status", project.status],
    ["Origin", project.origin],
    ["Analyzed pages", aggregate.analyzedPages ?? 0],
    ["Blocked", aggregate.blockedPages ?? 0],
    ["Skipped", aggregate.skippedPages ?? 0],
    ["Errors", aggregate.errorPages ?? 0],
    ["Truncated", project.truncated]
  ]));

  container.append(section("Crawl Explorer", [
    table(["Order", "Status", "Depth", "URL", "Discovered from", "Reason"], (project.pages ?? []).map((page) => [
      page.order + 1,
      page.status,
      page.depth,
      page.url,
      page.discoveredFrom,
      [page.reasonCode, page.message].filter(Boolean).join(": ")
    ])),
    labelled("Bounded crawl configuration", `${project.config?.maxPages} pages, depth ${project.config?.maxDepth}, minimum delay ${project.config?.minimumDelayMs} ms`)
  ]));

  const evidenceList = element("div", { className: "crawl-evidence-list" });
  for (const page of project.pages ?? []) {
    const summary = `${page.order + 1}. ${page.status.toUpperCase()} — ${page.url}`;
    if (!page.analysis) {
      evidenceList.append(element("details", { className: `crawl-page crawl-${page.status}` }, [
        element("summary", { text: summary }),
        labelled("Observed state", [page.reasonCode, page.message].filter(Boolean).join(": ") || "No page analysis was produced.")
      ]));
      continue;
    }
    evidenceList.append(element("details", { className: "crawl-page crawl-analyzed" }, [
      element("summary", { text: summary }),
      metricCards([
        ["HTTP", page.analysis.statusCode],
        ["Words", page.analysis.wordCount],
        ["Schema types", page.analysis.schemaTypes],
        ["Questions", page.analysis.questionCount],
        ["Findings", page.analysis.findings?.length ?? 0]
      ]),
      renderFindings(page.analysis.findings ?? []),
      jsonDetails(page.analysis.analyzerResults ?? {}, "Versioned analyzer observations"),
      jsonDetails(page.analysis, "Complete page evidence")
    ]));
  }
  container.append(section("Evidence Explorer", evidenceList));
  container.append(section("Aggregated site evidence", [
    metricCards([["Total words", aggregate.totalWords], ["Schema types", aggregate.uniqueSchemaTypes], ["Topic terms", aggregate.uniqueTopicTerms]]),
    table(["Finding rule", "Pages observed"], (aggregate.findingCounts ?? []).map((item) => [item.ruleId, item.pages]))
  ]));
  container.append(section("Research boundaries", element("ul", { className: "plain-list" }, (project.limitations ?? []).map((item) => element("li", { text: item })))));
  container.append(jsonDetails(project, "Complete project JSON"));
}

async function loadResearchSources() {
  const results = $("#sources-results");
  const error = $("#sources-error");
  hideError(error);
  clear(results);
  results.append(element("p", { className: "empty", text: "Loading versioned sources…" }));
  try {
    const registry = await api("/api/research-sources");
    hideError(error);
    clear(results);
    results.append(metricCards([
      ["Registry version", registry.registryVersion],
      ["Sources", registry.sources?.length ?? 0],
      ["External references", (registry.sources ?? []).filter((source) => source.url).length],
      ["Internal heuristics", (registry.sources ?? []).filter((source) => source.sourceType === "internal-heuristic").length]
    ]));
    const list = element("div", { className: "source-list" });
    for (const source of registry.sources ?? []) {
      const title = source.url
        ? element("a", { text: source.title, attributes: { href: source.url, target: "_blank", rel: "noreferrer" } })
        : element("span", { text: source.title });
      list.append(element("article", { className: "source-card" }, [
        element("div", { className: "tags" }, [source.sourceId, source.sourceType, `Confidence: ${source.confidence}`].map((tag) => element("span", { className: "tag", text: tag }))),
        element("h3", {}, title),
        labelled("Publisher", source.publisher),
        labelled("Supported claim", source.claimSupported),
        labelled("Applicable analyzers", source.applicableAnalyzers),
        labelled("Scope and limitation", source.notes),
        labelled("Accessed", source.accessedAt)
      ]));
    }
    results.append(section("Documented guidance and explicit heuristics", list));
  } catch (caught) {
    clear(results);
    showError(error, caught);
  }
}

async function loadVisibilityObservations() {
  const results = $("#visibility-results");
  const error = $("#visibility-error");
  hideError(error);
  clear(results);
  results.append(element("p", { className: "empty", text: "Loading manual observations…" }));
  try {
    const observations = await api("/api/visibility-observations");
    hideError(error);
    clear(results);
    if (!observations.length) {
      results.append(element("p", { className: "empty", text: "No manual visibility observations are saved yet. No automated provider is active." }));
      return;
    }
    results.append(section("Saved manual observations", table([
      "Date", "Target", "Query", "Engine", "Location/device", "Rank", "Citation", "Reference", "Notes"
    ], observations.map((observation) => [
      observation.observationDate,
      observation.targetUrl,
      observation.query,
      observation.engine,
      `${observation.location} / ${observation.device}`,
      observation.observedRank,
      observation.observedCitation,
      observation.citationUrl ?? observation.referenceUrl ?? observation.screenshotReference,
      observation.notes
    ]))));
    results.append(element("p", { className: "causation-limitation", text: "Website changes and observed visibility changes occurred during the same interval. This does not establish causation." }));
  } catch (caught) {
    clear(results);
    showError(error, caught);
  }
}

let historyRequestSequence = 0;

function beginHistoryRequest(error) {
  hideError(error);
  historyRequestSequence += 1;
  return historyRequestSequence;
}

function isCurrentHistoryRequest(requestSequence) {
  return requestSequence === historyRequestSequence;
}

async function loadRunHistory() {
  const results = $("#history-results");
  const error = $("#history-error");
  const requestSequence = beginHistoryRequest(error);
  clear(results);
  results.append(element("p", { className: "empty", text: "Loading saved runs…" }));
  try {
    const runs = await api("/api/runs");
    if (!isCurrentHistoryRequest(requestSequence)) return;
    hideError(error);
    clear(results);
    if (!runs.length) {
      results.append(element("p", { className: "empty", text: "No comparison runs are saved yet." }));
      return;
    }
    const list = element("div", { className: "history-list" });
    for (const run of runs) {
      const open = element("button", { className: "history-open", text: "Open run", attributes: { type: "button" } });
      open.addEventListener("click", async () => {
        const openRequestSequence = beginHistoryRequest(error);
        open.disabled = true;
        try {
          const savedRun = await api(`/api/runs/${encodeURIComponent(run.id)}`);
          if (!isCurrentHistoryRequest(openRequestSequence)) return;
          hideError(error);
          renderComparison(savedRun, results);
          results.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (caught) {
          if (isCurrentHistoryRequest(openRequestSequence)) showError(error, caught);
        }
        finally { open.disabled = false; }
      });
      list.append(element("article", { className: "history-item" }, [
        element("div", {}, [element("strong", { text: run.targetUrl }), element("p", { text: `${formatTime(run.createdAt)} · ${run.competitorUrls.length} competitor(s) · ${run.gapCount} gap(s) · ${run.findingCount} finding(s)` })]), open
      ]));
    }
    results.append(list);
  } catch (caught) {
    if (!isCurrentHistoryRequest(requestSequence)) return;
    clear(results);
    showError(error, caught);
  }
}

let analyticsProjects = [];
let analyticsConnectors = [];
let pendingImport = null;

async function loadAnalyticsProjects() {
  const [projects, connectorRegistry] = await Promise.all([
    api("/api/growth/projects"),
    analyticsConnectors.length ? Promise.resolve({ connectors: analyticsConnectors }) : api("/api/connectors")
  ]);
  analyticsProjects = projects;
  analyticsConnectors = connectorRegistry.connectors ?? [];
  for (const select of $$(".analytics-project-select")) {
    const selected = select.value;
    clear(select);
    select.append(element("option", { text: projects.length ? "Select a research project" : "Create a crawl or comparison project first", attributes: { value: "" } }));
    for (const project of projects) select.append(element("option", { text: `${project.targetUrl} — ${project.projectId}`, attributes: { value: project.projectId } }));
    if (projects.some((project) => project.projectId === selected)) select.value = selected;
  }
  return projects;
}

async function ensureAnalyticsProjects(error) {
  try { await loadAnalyticsProjects(); return true; }
  catch (caught) { showError(error, caught); return false; }
}

function queryFromForm(form) {
  const values = Object.fromEntries(new FormData(form));
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (typeof value === "string" && value.trim()) query.set(key, value.trim());
  return query;
}

async function loadDataSources() {
  const form = $("#data-sources-form");
  const error = $("#data-sources-error");
  const results = $("#data-sources-results");
  hideError(error);
  const projectId = new FormData(form).get("projectId");
  if (!projectId) { clear(results); results.append(element("p", { className: "empty", text: "Select a research project to inspect its connector sources." })); return; }
  setBusy(form, true, "Loading project-scoped sources…");
  try {
    const [sources, imports] = await Promise.all([
      api(`/api/data-sources?projectId=${encodeURIComponent(projectId)}`),
      api(`/api/imports?projectId=${encodeURIComponent(projectId)}`)
    ]);
    clear(results);
    results.append(element("p", { className: "release-boundary", text: "Release 1 source mode: validated CSV only. Live OAuth and provider access remain disabled." }));
    if (!sources.length) { results.append(element("p", { className: "empty", text: "No CSV source has been imported for this project." })); return; }
    results.append(section("Registered sources", table(["Source", "Connector", "Kind", "Account label", "Property label", "Created", "Imports"], sources.map((source) => [source.label, `${source.connectorId} v${source.connectorVersion}`, source.kind, source.accountLabel, source.propertyLabel, formatTime(source.createdAt), imports.filter((job) => job.sourceId === source.sourceId).length]))));
  } catch (caught) { clear(results); showError(error, caught); }
  finally { setBusy(form, false); }
}

function renderImportPreview(preview) {
  const container = $("#import-preview");
  clear(container);
  container.append(metricCards([["Rows", preview.totalRows], ["Columns", preview.headers.length], ["File SHA-256", preview.fileSha256], ["Connector", preview.connectorId]]));
  container.append(section("Safe preview", table(preview.headers, preview.sampleRows.map((row) => preview.headers.map((header) => row[header])))));
  if (preview.warnings.length) container.append(section("Mapping warnings", element("ul", { className: "plain-list" }, preview.warnings.map((warning) => element("li", { text: warning })))));
  const connector = analyticsConnectors.find((item) => item.connectorId === preview.connectorId);
  const fields = [...(connector?.requiredFields ?? []), ...(connector?.optionalFields ?? [])];
  const mapping = $("#import-mapping");
  clear(mapping);
  for (const field of fields) {
    const required = connector.requiredFields.includes(field);
    const select = element("select", { attributes: { "data-field": field, "aria-label": `Map ${field}` } });
    select.append(element("option", { text: required ? "Select required column" : "Not mapped", attributes: { value: "" } }));
    for (const header of preview.headers) select.append(element("option", { text: header, attributes: { value: header } }));
    select.value = preview.suggestedMapping[field] ?? "";
    mapping.append(element("label", { className: "mapping-field" }, [document.createTextNode(`${field}${required ? " (required)" : ""}`), select]));
  }
  $("#commit-import").disabled = false;
}

async function previewImport(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const error = $("#import-error");
  hideError(error);
  clear($("#import-results"));
  $("#commit-import").disabled = true;
  pendingImport = null;
  setBusy(form, true, "Reading and validating CSV structure…");
  try {
    const values = Object.fromEntries(new FormData(form));
    const file = form.elements.file.files[0];
    if (!file) throw new Error("Select a CSV file.");
    const content = await file.text();
    const filePayload = { fileName: file.name, mimeType: file.type || "text/csv", content };
    const preview = await api("/api/imports/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connectorId: values.connectorId, file: filePayload }) });
    pendingImport = { values, file: filePayload, preview };
    renderImportPreview(preview);
  } catch (caught) { clear($("#import-preview")); clear($("#import-mapping")); showError(error, caught); }
  finally { setBusy(form, false); }
}

async function commitImport() {
  const error = $("#import-error");
  const results = $("#import-results");
  hideError(error);
  if (!pendingImport) { showError(error, new Error("Preview a CSV before importing.")); return; }
  const button = $("#commit-import");
  button.disabled = true;
  button.textContent = "Validating and importing…";
  try {
    const mapping = {};
    for (const select of $$("#import-mapping select")) if (select.value) mapping[select.dataset.field] = select.value;
    const values = pendingImport.values;
    const payload = {
      projectId: values.projectId,
      connectorId: values.connectorId,
      sourceLabel: values.sourceLabel,
      ...(values.accountLabel ? { accountLabel: values.accountLabel } : {}),
      ...(values.propertyLabel ? { propertyLabel: values.propertyLabel } : {}),
      file: pendingImport.file,
      mapping
    };
    const imported = await api("/api/imports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    clear(results);
    results.append(metricCards([["Accepted", imported.job.acceptedRows], ["Rejected", imported.job.rejectedRows], ["Duplicates", imported.job.duplicateRows], ["Opportunities", imported.opportunityCount], ["Status", imported.job.status]]));
    if (imported.rejections.length) results.append(section("Rejected rows (values are not retained)", table(["Row", "Code", "Field", "Reason"], imported.rejections.map((item) => [item.rowNumber, item.code, item.field, item.message]))));
    results.append(section("Stored lineage boundary", [labelled("Import ID", imported.job.importId), labelled("File fingerprint", imported.job.fileSha256), labelled("Source dates", `${valueOrDash(imported.job.sourceDateFrom)} to ${valueOrDash(imported.job.sourceDateTo)}`), element("p", { text: imported.job.limitations.join(" ") })]));
    pendingImport = null;
    clear($("#import-mapping"));
    clear($("#import-preview"));
    await loadImports(values.projectId);
  } catch (caught) { showError(error, caught); button.disabled = false; }
  finally { button.textContent = "Validate and import normalized rows"; }
}

async function loadImports(projectId) {
  const results = $("#import-results");
  if (!projectId) return;
  try {
    const imports = await api(`/api/imports?projectId=${encodeURIComponent(projectId)}`);
    clear(results);
    if (!imports.length) { results.append(element("p", { className: "empty", text: "No retained imports exist for this project." })); return; }
    const cards = element("div", { className: "analytics-records" });
    for (const job of imports) {
      const remove = element("button", { className: "danger-button", text: "Delete imported records", attributes: { type: "button" } });
      remove.addEventListener("click", async () => {
        if (!window.confirm("Delete only the normalized records and rejections owned by this import? Opportunities and redacted audit history will remain.")) return;
        try { await api(`/api/imports/${encodeURIComponent(job.importId)}?projectId=${encodeURIComponent(projectId)}`, { method: "DELETE" }); await loadImports(projectId); }
        catch (caught) { showError($("#import-error"), caught); }
      });
      cards.append(element("article", { className: "analytics-record" }, [element("div", { className: "tags" }, [job.status, `${job.acceptedRows} accepted`, `${job.rejectedRows} rejected`].map((tag) => element("span", { className: "tag", text: tag }))), element("h3", { text: job.fileName }), labelled("Imported", formatTime(job.completedAt)), labelled("Source date range", `${valueOrDash(job.sourceDateFrom)} to ${valueOrDash(job.sourceDateTo)}`), labelled("Import ID", job.importId), remove]));
    }
    results.append(section("Import history and deletion controls", cards));
  } catch (caught) { showError($("#import-error"), caught); }
}

function metricObservation(metric) {
  if (metric.metricType === "search-performance") return `${metric.clicks} clicks / ${metric.impressions} impressions / ${(metric.ctr * 100).toFixed(2)}% CTR / position ${metric.averagePosition}`;
  if (metric.metricType === "web-analytics") return `${metric.sessions} sessions / ${valueOrDash(metric.engagementRate === null ? null : `${(metric.engagementRate * 100).toFixed(2)}% engagement`)} / ${valueOrDash(metric.conversions)} conversions`;
  if (metric.metricType === "campaign-performance") return `${metric.campaign}: spend ${metric.spend}, ${metric.clicks} clicks, ${metric.conversions} conversions`;
  return `${metric.source}: ${metric.leads} leads, ${metric.qualifiedLeads} qualified`;
}

async function loadDataExplorer(event) {
  event?.preventDefault();
  const form = $("#data-explorer-form");
  const error = $("#data-explorer-error");
  const results = $("#data-explorer-results");
  hideError(error); setBusy(form, true, "Loading normalized records…");
  try {
    const metrics = await api(`/api/metrics?${queryFromForm(form)}`);
    clear(results);
    if (!metrics.length) { results.append(element("p", { className: "empty", text: "No normalized records match the current filters." })); return; }
    const records = element("div", { className: "analytics-records" });
    for (const metric of metrics) records.append(element("article", { className: "analytics-record" }, [element("div", { className: "tags" }, [metric.metricType, metric.lineage.connectorId, metric.lineage.validationStatus].map((tag) => element("span", { className: "tag", text: tag }))), element("h3", { text: metricObservation(metric) }), labelled("Date or range", metric.dateTo ? `${metric.date} to ${metric.dateTo}` : metric.date), labelled("Page", metric.page), section("Data lineage", table(["Field", "Value"], [["Metric ID", metric.metricId], ["Source", metric.sourceId], ["Import", metric.importId], ["Source record SHA-256", metric.lineage.sourceRecordId], ["Normalized SHA-256", metric.lineage.normalizedRecordHash], ["Transformation", metric.lineage.transformationVersion], ["Confidence", metric.lineage.confidence], ["Limitation", metric.lineage.limitations.join(" ")]]), { className: "lineage" })]));
    results.append(metricCards([["Matching records", metrics.length], ["Projects", new Set(metrics.map((item) => item.projectId)).size], ["Imports", new Set(metrics.map((item) => item.importId)).size]]), records);
  } catch (caught) { clear(results); showError(error, caught); }
  finally { setBusy(form, false); }
}

async function loadSearchPerformance(event) {
  event?.preventDefault();
  const form = $("#search-performance-form");
  const error = $("#search-performance-error");
  const results = $("#search-performance-results");
  hideError(error); clear($("#search-detail-results")); setBusy(form, true, "Loading imported Search Console rows…");
  try {
    const query = queryFromForm(form);
    const projectId = query.get("projectId");
    const [records, sources] = await Promise.all([api(`/api/search-performance?${query}`), api(`/api/data-sources?projectId=${encodeURIComponent(projectId)}`)]);
    const sourceNames = new Map(sources.map((source) => [source.sourceId, source.label]));
    clear(results);
    if (!records.length) { results.append(element("p", { className: "empty", text: "No imported Search Console rows match the current filters." })); return; }
    const head = element("thead", {}, element("tr", {}, ["Query", "Page", "Date or date range", "Clicks", "Impressions", "CTR", "Average position", "Device", "Country", "Import source", "Details"].map((header) => element("th", { text: header }))));
    const body = element("tbody");
    for (const record of records) {
      const open = element("button", { className: "row-open", text: "Open", attributes: { type: "button" } });
      open.addEventListener("click", () => openSearchDetail(projectId, record.metricId));
      body.append(element("tr", {}, [record.query, record.page, record.dateTo ? `${record.date} to ${record.dateTo}` : record.date, record.clicks, record.impressions, `${(record.ctr * 100).toFixed(2)}%`, record.averagePosition.toFixed(2), record.device, record.country, sourceNames.get(record.sourceId) ?? record.sourceId].map((value) => element("td", { text: value })).concat(element("td", {}, open))));
    }
    results.append(metricCards([["Rows", records.length], ["Clicks", records.reduce((sum, item) => sum + item.clicks, 0)], ["Impressions", records.reduce((sum, item) => sum + item.impressions, 0)]]), element("div", { className: "table-wrap search-performance-table" }, element("table", {}, [head, body])));
  } catch (caught) { clear(results); showError(error, caught); }
  finally { setBusy(form, false); }
}

async function openSearchDetail(projectId, metricId) {
  const error = $("#search-performance-error");
  const results = $("#search-detail-results");
  hideError(error); clear(results); results.append(element("p", { className: "empty", text: "Linking imported values to saved public evidence…" }));
  try {
    const detail = await api(`/api/search-performance/${encodeURIComponent(metricId)}?projectId=${encodeURIComponent(projectId)}`);
    clear(results);
    const metrics = detail.metrics;
    results.append(
      section("1. Search Console metrics", table(["Query", "Page", "Date/range", "Clicks", "Impressions", "CTR", "Average position", "Device", "Country", "Import source"], [[metrics.query, metrics.page, metrics.dateTo ? `${metrics.date} to ${metrics.dateTo}` : metrics.date, metrics.clicks, metrics.impressions, `${(metrics.ctr * 100).toFixed(2)}%`, metrics.averagePosition.toFixed(2), metrics.device, metrics.country, metrics.sourceId]])),
      section("2. Matching public website evidence", detail.matchingPublicWebsiteEvidence ? [labelled("Source URL", detail.matchingPublicWebsiteEvidence.sourceUrl), labelled("Observed", formatTime(detail.matchingPublicWebsiteEvidence.fetchedAt)), labelled("Title", detail.matchingPublicWebsiteEvidence.title), labelled("Description", detail.matchingPublicWebsiteEvidence.metaDescription), labelled("H1", detail.matchingPublicWebsiteEvidence.h1), jsonDetails(detail.matchingPublicWebsiteEvidence.relevantFindings, "Relevant deterministic findings")] : element("p", { className: "empty", text: "No matching saved public-page evidence. Nothing is inferred." })),
      section("3. Related competitor evidence", detail.relatedCompetitorEvidence.length ? table(["Public competitor page", "Related topics", "Related questions", "Related gap IDs"], detail.relatedCompetitorEvidence.map((item) => [item.sourceUrl, item.topicTerms, item.questions, item.relevantGapIds])) : element("p", { className: "empty", text: "No related competitor evidence was observed in the latest saved comparison." })),
      section("4. Deterministic opportunity", detail.deterministicOpportunity ? [element("h3", { text: detail.deterministicOpportunity.title }), labelled("Rule", `${detail.deterministicOpportunity.ruleId} v${detail.deterministicOpportunity.ruleVersion}`), labelled("Observation", detail.deterministicOpportunity.observation)] : element("p", { className: "empty", text: "No Release 1 opportunity rule triggered for this row." })),
      section("5. Exact calculation", element("p", { text: detail.exactCalculation ?? "No calculation triggered." })),
      section("6. Proposed action", element("p", { text: detail.proposedAction ?? "No action proposed." })),
      section("7. Success metric", element("p", { text: detail.successMetric ?? "No success metric because no rule triggered." })),
      section("8. Limitation", element("p", { className: "causation-limitation", text: detail.limitation }))
    );
    results.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (caught) { clear(results); showError(error, caught); }
}

async function loadOpportunities(event) {
  event?.preventDefault();
  const form = $("#opportunities-form");
  const error = $("#opportunities-error");
  const results = $("#opportunities-results");
  hideError(error); setBusy(form, true, "Loading deterministic backlog…");
  try {
    const values = Object.fromEntries(new FormData(form));
    const all = await api(`/api/opportunities?projectId=${encodeURIComponent(values.projectId)}`);
    const opportunities = values.status ? all.filter((item) => item.status === values.status) : all;
    clear(results);
    const exports = element("div", { className: "export-links" }, ["json", "markdown", "csv"].map((format) => element("a", { text: `Export ${format.toUpperCase()}`, attributes: { href: `/api/growth/export?projectId=${encodeURIComponent(values.projectId)}&format=${format}` } })));
    results.append(exports);
    if (!opportunities.length) { results.append(element("p", { className: "empty", text: "No opportunities match the selected workflow status." })); return; }
    const list = element("div", { className: "opportunity-list" });
    for (const item of opportunities) {
      const select = element("select", { attributes: { "aria-label": `Workflow status for ${item.title}` } });
      for (const status of ["new", "reviewed", "approved", "rejected", "implemented", "monitoring", "verified"]) select.append(element("option", { text: status, attributes: { value: status } }));
      select.value = item.status;
      const save = element("button", { className: "workflow-save", text: "Save status", attributes: { type: "button" } });
      save.addEventListener("click", async () => {
        save.disabled = true;
        try { await api(`/api/opportunities/${encodeURIComponent(item.opportunityId)}/status?projectId=${encodeURIComponent(values.projectId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: select.value }) }); await loadOpportunities(); }
        catch (caught) { showError(error, caught); }
        finally { save.disabled = false; }
      });
      list.append(element("article", { className: `opportunity-card ${item.priority}` }, [element("div", { className: "opportunity-heading" }, [element("div", {}, [element("div", { className: "tags" }, [item.priority, item.category, item.ruleId, `v${item.ruleVersion}`].map((tag) => element("span", { className: "tag", text: tag }))), element("h3", { text: item.title })]), element("span", { className: "eligibility-badge eligible", text: item.status })]), labelled("Page", item.page), labelled("Query", item.query), labelled("Observation", item.observation), labelled("Exact calculation", item.exactCalculation), labelled("Proposed action", item.proposedAction), labelled("Success metric", item.successMetric), labelled("Limitation", item.limitation), element("div", { className: "workflow-controls" }, [element("label", {}, [document.createTextNode("Workflow status"), select]), save]) ]));
    }
    results.append(metricCards([["Matching opportunities", opportunities.length], ["High priority", opportunities.filter((item) => item.priority === "high").length], ["New", opportunities.filter((item) => item.status === "new").length]]), list);
  } catch (caught) { clear(results); showError(error, caught); }
  finally { setBusy(form, false); }
}

$$('.tab').forEach((button) => button.addEventListener("click", () => {
  $$('.tab').forEach((item) => {
    item.classList.toggle("active", item === button);
    item.setAttribute("aria-selected", String(item === button));
  });
  $$('.panel').forEach((panel) => {
    const active = panel.id === button.dataset.panel;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
  if (button.dataset.panel === "history-panel") loadRunHistory();
  if (button.dataset.panel === "sources-panel") loadResearchSources();
  if (button.dataset.panel === "visibility-panel") loadVisibilityObservations();
  if (["data-sources-panel", "imports-panel", "data-explorer-panel", "search-performance-panel", "opportunities-panel"].includes(button.dataset.panel)) {
    const error = button.dataset.panel === "data-sources-panel" ? $("#data-sources-error") : button.dataset.panel === "imports-panel" ? $("#import-error") : button.dataset.panel === "data-explorer-panel" ? $("#data-explorer-error") : button.dataset.panel === "search-performance-panel" ? $("#search-performance-error") : $("#opportunities-error");
    hideError(error);
    ensureAnalyticsProjects(error).then((ready) => {
      if (!ready) return;
      if (button.dataset.panel === "data-sources-panel" && $("#data-sources-form select").value) loadDataSources();
      if (button.dataset.panel === "imports-panel" && $("#import-form select[name='projectId']").value) loadImports($("#import-form select[name='projectId']").value);
    });
  }
}));

$("#crawl-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const error = $("#crawl-error");
  hideError(error);
  setBusy(form, true, "Discovering and analyzing a bounded same-origin page set…");
  try {
    const values = Object.fromEntries(new FormData(form));
    const payload = {
      targetUrl: values.targetUrl,
      maxPages: Number(values.maxPages),
      maxDepth: Number(values.maxDepth),
      minimumDelayMs: Number(values.minimumDelayMs)
    };
    const project = await api("/api/projects/crawl", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    renderCrawlProject(project, $("#crawl-results"));
    await loadAnalyticsProjects();
  } catch (caught) { showError(error, caught); }
  finally { setBusy(form, false); }
});

$("#analyze-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const error = $("#analyze-error");
  hideError(error);
  setBusy(form, true, "Fetching and evaluating public evidence…");
  try {
    const data = Object.fromEntries(new FormData(form));
    renderAnalysis(await api("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: data.url }) }), $("#analyze-results"));
  } catch (caught) { showError(error, caught); }
  finally { setBusy(form, false); }
});

$("#compare-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const error = $("#compare-error");
  hideError(error);
  setBusy(form, true, "Analyzing each site through the same evidence pipeline…");
  try {
    const values = Object.fromEntries(new FormData(form));
    const competitors = [1, 2, 3, 4, 5].map((index) => ({
      url: String(values[`competitorUrl${index}`] ?? "").trim(),
      rank: values[`competitorRank${index}`]
    })).filter((entry) => entry.url);
    const competitorUrls = competitors.map((entry) => entry.url);
    const rankObservations = {};
    if (values.targetRank) rankObservations[String(values.targetUrl)] = Number(values.targetRank);
    competitors.forEach(({ url, rank }) => { if (rank) rankObservations[url] = Number(rank); });
    const payload = { targetUrl: values.targetUrl, competitorUrls, queryLabel: values.queryLabel || undefined, rankObservations: Object.keys(rankObservations).length ? rankObservations : undefined };
    const run = await api("/api/compare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    renderComparison(run, $("#compare-results"));
    await loadRunHistory();
    await loadAnalyticsProjects();
  } catch (caught) { showError(error, caught); }
  finally { setBusy(form, false); }
});

$("#visibility-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const error = $("#visibility-error");
  hideError(error);
  setBusy(form, true, "Saving the manual observation and its context…");
  try {
    const values = Object.fromEntries(new FormData(form));
    const payload = {
      targetUrl: values.targetUrl,
      query: values.query,
      engine: values.engine,
      location: values.location,
      device: values.device,
      observationDate: values.observationDate,
      ...(values.observedRank ? { observedRank: Number(values.observedRank) } : {}),
      ...(values.observedCitation !== "" ? { observedCitation: values.observedCitation === "true" } : {}),
      ...(values.citationUrl ? { citationUrl: values.citationUrl } : {}),
      ...(values.referenceUrl ? { referenceUrl: values.referenceUrl } : {}),
      ...(values.screenshotReference ? { screenshotReference: values.screenshotReference } : {}),
      ...(values.notes ? { notes: values.notes } : {})
    };
    await api("/api/visibility-observations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    await loadVisibilityObservations();
  } catch (caught) { showError(error, caught); }
  finally { setBusy(form, false); }
});

$("#refresh-history").addEventListener("click", loadRunHistory);
$("#refresh-sources").addEventListener("click", loadResearchSources);
$("#data-sources-form").addEventListener("submit", (event) => { event.preventDefault(); loadDataSources(); });
$("#import-form").addEventListener("submit", previewImport);
$("#import-form select[name='projectId']").addEventListener("change", (event) => loadImports(event.currentTarget.value));
$("#commit-import").addEventListener("click", commitImport);
$("#data-explorer-form").addEventListener("submit", loadDataExplorer);
$("#search-performance-form").addEventListener("submit", loadSearchPerformance);
$("#opportunities-form").addEventListener("submit", loadOpportunities);

const observationDate = $("#visibility-form input[name='observationDate']");
if (!observationDate.value) observationDate.value = new Date().toISOString().slice(0, 10);

api("/health").then((health) => {
  const status = $("#health-status");
  status.textContent = health.status === "ok" ? "Service ready" : "Service unavailable";
  status.classList.add(health.status === "ok" ? "ok" : "bad");
}).catch(() => {
  const status = $("#health-status");
  status.textContent = "Service unavailable";
  status.classList.add("bad");
});
