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
  const list = element("div", { className: "finding-list" });
  for (const finding of findings) {
    const tags = element("div", { className: "tags" }, [finding.ruleId, finding.category, finding.priority, finding.effort, finding.classification].filter(Boolean).map((tag) => element("span", { className: "tag", text: tag })));
    const details = element("div", { className: "detail-grid" }, [
      labelled("Why it may matter", finding.whyItMatters),
      labelled("Exact implementation", finding.exactImplementation),
      labelled("Expected outcome", finding.expectedOutcome),
      labelled("Verification", finding.verificationMethod)
    ]);
    list.append(element("article", { className: `finding ${finding.priority ?? ""}` }, [tags, element("h3", { text: finding.problem }), details, jsonDetails(finding.evidence ?? [], "Structured evidence") ]));
  }
  return list;
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
    const summary = `${page.order + 1}. ${page.status.toUpperCase()} â€” ${page.url}`;
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
  results.append(element("p", { className: "empty", text: "Loading versioned sourcesâ€¦" }));
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

$$('.tab').forEach((button) => button.addEventListener("click", () => {
  $$('.tab').forEach((item) => item.classList.toggle("active", item === button));
  $$('.panel').forEach((panel) => {
    const active = panel.id === button.dataset.panel;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
  if (button.dataset.panel === "history-panel") loadRunHistory();
  if (button.dataset.panel === "sources-panel") loadResearchSources();
}));

$("#crawl-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const error = $("#crawl-error");
  hideError(error);
  setBusy(form, true, "Discovering and analyzing a bounded same-origin page setâ€¦");
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
  } catch (caught) { showError(error, caught); }
  finally { setBusy(form, false); }
});

$("#refresh-history").addEventListener("click", loadRunHistory);
$("#refresh-sources").addEventListener("click", loadResearchSources);

api("/health").then((health) => {
  const status = $("#health-status");
  status.textContent = health.status === "ok" ? "Service ready" : "Service unavailable";
  status.classList.add(health.status === "ok" ? "ok" : "bad");
}).catch(() => {
  const status = $("#health-status");
  status.textContent = "Service unavailable";
  status.classList.add("bad");
});
