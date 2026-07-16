import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

class FakeNode {
  children: FakeNode[] = [];
  textContent = "";
  hidden = false;
  disabled = false;
  className = "";
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  listeners = new Map<string, (...args: unknown[]) => unknown>();
  classList = {
    add: () => undefined,
    toggle: () => undefined
  };

  append(...children: FakeNode[]) {
    this.children.push(...children);
  }

  replaceChildren(...children: FakeNode[]) {
    this.children = [...children];
  }

  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
  }

  addEventListener(name: string, listener: (...args: unknown[]) => unknown) {
    this.listeners.set(name, listener);
  }

  scrollIntoView() {}
}

function nestedText(node: FakeNode): string {
  return [node.textContent, ...node.children.map(nestedText)].join(" ");
}

describe("saved-run history UI", () => {
  it("clears a failed request's stale error when the next request succeeds and renders saved runs", async () => {
    const source = await readFile(new URL("../../apps/web/public/app.js", import.meta.url), "utf8");
    const nodes = new Map<string, FakeNode>([
      ["#history-error", new FakeNode()],
      ["#history-results", new FakeNode()],
      ["#analyze-form", new FakeNode()],
      ["#compare-form", new FakeNode()],
      ["#refresh-history", new FakeNode()],
      ["#health-status", new FakeNode()]
    ]);
    const document = {
      createElement: () => new FakeNode(),
      createTextNode: (value: string) => Object.assign(new FakeNode(), { textContent: value }),
      querySelector: (selector: string) => nodes.get(selector) ?? new FakeNode(),
      querySelectorAll: () => []
    };
    let historyRequests = 0;
    const fetch = async (path: string) => {
      if (path === "/health") return response(true, { status: "ok" });
      if (path === "/api/runs") {
        historyRequests += 1;
        if (historyRequests === 1) return response(false, { error: { message: "INVALID_RECORD history failure" } }, 500);
        return response(true, [{
          id: "saved-run-1",
          targetUrl: "https://target.example/",
          createdAt: "2026-07-15T00:00:00.000Z",
          competitorUrls: ["https://competitor.example/"],
          gapCount: 2,
          findingCount: 3
        }]);
      }
      if (path === "/api/runs/saved-run-1") {
        return response(true, {
          id: "saved-run-1",
          createdAt: "2026-07-15T00:00:00.000Z",
          analyses: [],
          comparison: {
            sites: [],
            matrix: [],
            metricDefinitions: [],
            conclusionStatus: "complete",
            targetGaps: [],
            targetAdvantages: [],
            competitorOnlySchemaTypes: [],
            competitorOnlyTopics: [],
            competitorOnlyQuestions: [],
            limitations: []
          }
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    };
    const context = vm.createContext({
      console,
      document,
      fetch,
      Node: FakeNode,
      FormData: class {},
      Intl,
      URL,
      encodeURIComponent,
      setTimeout,
      clearTimeout
    });
    vm.runInContext(source, context);

    await vm.runInContext("loadRunHistory()", context);
    const error = nodes.get("#history-error")!;
    expect(error.hidden).toBe(false);
    expect(error.textContent).toContain("INVALID_RECORD");

    await vm.runInContext("loadRunHistory()", context);
    const results = nodes.get("#history-results")!;
    expect(error.hidden).toBe(true);
    expect(error.textContent).toBe("");
    expect(nestedText(results)).toContain("https://target.example/");
    expect(nestedText(results)).toContain("Open run");

    error.hidden = false;
    error.textContent = "obsolete history error";
    const openButton = findByClass(results, "history-open");
    expect(openButton).toBeDefined();
    await openButton!.listeners.get("click")?.();
    expect(error.hidden).toBe(true);
    expect(error.textContent).toBe("");
    expect(nestedText(results)).toContain("Complete saved run JSON");
    expect(source).toContain("await loadRunHistory();");
  });
});

describe("demo implementation and verification UI", () => {
  it("keeps the proposal review boundary and fixture verification visible in the browser source", async () => {
    const source = await readFile(new URL("../../apps/web/public/app.js", import.meta.url), "utf8");

    expect(source).toContain("Proposal — requires factual and medical review before publication.");
    expect(source).toContain("Fixture verification");
    expect(source).toContain("CANONICAL_MISMATCH");
    expect(source).toContain("INTERNAL_LINKS_LOW");
  });

  it("submits all five optional competitor fields", async () => {
    const source = await readFile(new URL("../../apps/web/public/app.js", import.meta.url), "utf8");
    const html = await readFile(new URL("../../apps/web/public/index.html", import.meta.url), "utf8");

    expect(source).toContain("[1, 2, 3, 4, 5].map");
    expect(html).toContain('name="competitorUrl5"');
    expect(html).toContain('name="competitorRank5"');
  });

  it("exposes project, crawl, evidence, source, verification, history, and roadmap workspace views", async () => {
    const source = await readFile(new URL("../../apps/web/public/app.js", import.meta.url), "utf8");
    const html = await readFile(new URL("../../apps/web/public/index.html", import.meta.url), "utf8");

    for (const panel of ["projects-panel", "analyze-panel", "compare-panel", "history-panel", "sources-panel", "roadmap-panel"]) {
      expect(html).toContain(`id="${panel}"`);
    }
    expect(source).toContain('section("Crawl Explorer"');
    expect(source).toContain('section("Evidence Explorer"');
    expect(source).toContain('section("Implementation workspace"');
    expect(source).toContain('section("Fixture verification"');
    expect(source).toContain('/api/research-sources');
  });
});

function findByClass(node: FakeNode, className: string): FakeNode | undefined {
  if (node.className.split(/\s+/u).includes(className)) return node;
  for (const child of node.children) {
    const match = findByClass(child, className);
    if (match) return match;
  }
  return undefined;
}

function response(ok: boolean, body: unknown, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    json: async () => body
  };
}
