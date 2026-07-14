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

function section(title, contents) {
  return element("section", { className: "section-card" }, [element("h3", { text: title }), ...(Array.isArray(contents) ? contents : [contents])]);
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

function renderGaps(gaps = []) {
  if (!gaps.length) return element("p", { className: "empty", text: "No target gaps met the transparent comparison thresholds." });
  const list = element("div", { className: "gap-list" });
  for (const gap of gaps) {
    list.append(element("article", { className: `gap ${gap.priority ?? ""}` }, [
      element("div", { className: "tags" }, [gap.gapId, gap.metric, gap.priority, gap.effort].filter(Boolean).map((tag) => element("span", { className: "tag", text: tag }))),
      element("h3", { text: gap.whatDiffers }),
      element("div", { className: "detail-grid" }, [labelled("Why it may matter", gap.whyItMayMatter), labelled("Implementation direction", gap.implementationDirection), labelled("Verification", gap.verificationMethod), labelled("Caution", gap.caution)]),
      jsonDetails({ targetEvidence: gap.targetEvidence, competitorEvidence: gap.competitorEvidence }, "Comparison evidence")
    ]));
  }
  return list;
}

function renderComparison(run, container) {
  clear(container);
  const comparison = run.comparison ?? run;
  container.append(metricCards([
    ["Saved run", run.id ?? run.runId], ["Created", formatTime(run.createdAt)], ["Sites", comparison.matrix?.length],
    ["Target gaps", comparison.targetGaps?.length ?? 0], ["Target advantages", comparison.targetAdvantages?.length ?? 0], ["Prior matching run", run.history?.previousRunId ?? "None"]
  ]));
  const definitions = new Map((comparison.metricDefinitions ?? []).map((item) => [item.key, item]));
  const metricKeys = comparison.matrix?.[0] ? Object.keys(comparison.matrix[0].metrics) : [];
  container.append(section("Normalized comparison matrix", [
    table(["Metric", ...(comparison.matrix ?? []).map((row) => `${row.role}: ${row.url}`)], metricKeys.map((key) => [definitions.get(key)?.label ?? key, ...(comparison.matrix ?? []).map((row) => row.metrics[key])])),
    jsonDetails(comparison.metricDefinitions ?? [], "Metric explanations")
  ]));
  container.append(section("Evidence-backed target gaps", renderGaps(comparison.targetGaps)));
  container.append(section("Observed target advantages", comparison.targetAdvantages?.length ? table(["Metric", "Difference", "Interpretation"], comparison.targetAdvantages.map((item) => [item.metric, item.whatDiffers, item.interpretation])) : element("p", { className: "empty", text: "No target advantages met the transparent comparison thresholds." })));
  container.append(section("Coverage differences", table(["Comparison", "Observed competitor-only values"], [
    ["Schema types", comparison.competitorOnlySchemaTypes], ["Topics", comparison.competitorOnlyTopics], ["Questions", comparison.competitorOnlyQuestions]
  ])));
  if (run.history) container.append(section("Changes since the prior matching run", [
    metricCards([["Technical", run.history.technicalChanges?.length ?? 0], ["Metadata", run.history.metadataChanges?.length ?? 0], ["Schema", run.history.schemaChanges?.length ?? 0], ["Headings", run.history.headingChanges?.length ?? 0], ["Content", run.history.contentCountChanges?.length ?? 0], ["Links/media", run.history.linkAndMediaChanges?.length ?? 0]]),
    element("p", { text: run.history.correlationSummary?.interpretation }),
    jsonDetails(run.history, "Complete historical diff")
  ]));
  const limitations = element("ul", { className: "plain-list" }, (comparison.limitations ?? []).map((item) => element("li", { text: item })));
  container.append(section("Limitations", limitations));
  container.append(jsonDetails(run, "Complete saved run JSON"));
}

async function loadHistory() {
  const results = $("#history-results");
  const error = $("#history-error");
  hideError(error);
  clear(results);
  results.append(element("p", { className: "empty", text: "Loading saved runs…" }));
  try {
    const runs = await api("/api/runs");
    clear(results);
    if (!runs.length) {
      results.append(element("p", { className: "empty", text: "No comparison runs are saved yet." }));
      return;
    }
    const list = element("div", { className: "history-list" });
    for (const run of runs) {
      const open = element("button", { className: "history-open", text: "Open run", attributes: { type: "button" } });
      open.addEventListener("click", async () => {
        open.disabled = true;
        try {
          renderComparison(await api(`/api/runs/${encodeURIComponent(run.id)}`), results);
          results.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (caught) { showError(error, caught); }
        finally { open.disabled = false; }
      });
      list.append(element("article", { className: "history-item" }, [
        element("div", {}, [element("strong", { text: run.targetUrl }), element("p", { text: `${formatTime(run.createdAt)} · ${run.competitorUrls.length} competitor(s) · ${run.gapCount} gap(s) · ${run.findingCount} finding(s)` })]), open
      ]));
    }
    results.append(list);
  } catch (caught) { clear(results); showError(error, caught); }
}

$$('.tab').forEach((button) => button.addEventListener("click", () => {
  $$('.tab').forEach((item) => item.classList.toggle("active", item === button));
  $$('.panel').forEach((panel) => {
    const active = panel.id === button.dataset.panel;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
  if (button.dataset.panel === "history-panel") loadHistory();
}));

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
    const competitorUrls = [1, 2, 3].map((index) => String(values[`competitorUrl${index}`] ?? "").trim()).filter(Boolean);
    const rankObservations = {};
    if (values.targetRank) rankObservations[String(values.targetUrl)] = Number(values.targetRank);
    competitorUrls.forEach((url, index) => { const rank = values[`competitorRank${index + 1}`]; if (rank) rankObservations[url] = Number(rank); });
    const payload = { targetUrl: values.targetUrl, competitorUrls, queryLabel: values.queryLabel || undefined, rankObservations: Object.keys(rankObservations).length ? rankObservations : undefined };
    const run = await api("/api/compare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    renderComparison(run, $("#compare-results"));
  } catch (caught) { showError(error, caught); }
  finally { setBusy(form, false); }
});

$("#refresh-history").addEventListener("click", loadHistory);

api("/health").then((health) => {
  const status = $("#health-status");
  status.textContent = health.status === "ok" ? "Service ready" : "Service unavailable";
  status.classList.add(health.status === "ok" ? "ok" : "bad");
}).catch(() => {
  const status = $("#health-status");
  status.textContent = "Service unavailable";
  status.classList.add("bad");
});
