import { describe, expect, it } from "vitest";
import { parsePage } from "../../packages/parser/page.js";

describe("extended page evidence", () => {
  it("preserves malformed JSON-LD and complete heading/link/media evidence", () => {
    const result = parsePage(`
      <html lang="en"><head>
        <meta name="viewport" content="width=device-width">
        <link rel="canonical" href="https://example.com/page">
        <meta property="og:title" content="Example">
        <meta name="twitter:card" content="summary">
        <script type="application/ld+json">{"bad": }</script>
      </head><body>
        <nav aria-label="Breadcrumb"><a href="/">Home</a> / Example</nav>
        <h1>Example</h1><h3></h3><h3>What is care?</h3><p>Care is individual.</p><h3>Example</h3>
        <img src="/one.jpg"><img src="/decorative.svg" alt="">
        <a href="/one">Details</a><a href="/one">Details</a><a href="https://outside.example/x"></a>
      </body></html>
    `, "https://example.com/page");

    expect(result.canonicalStatus).toBe("match");
    expect(result.documentLanguage).toBe("en");
    expect(result.viewportPresent).toBe(true);
    expect(result.totalHeadingCount).toBe(4);
    expect(result.emptyHeadingCount).toBe(1);
    expect(result.headingLevelJumps).toHaveLength(1);
    expect(result.repeatedHeadings).toEqual([expect.objectContaining({ text: "Example", count: 2 })]);
    expect(result.detectedQuestions).toContain("What is care?");
    expect(result.directAnswerCount).toBe(1);
    expect(result.breadcrumbIndicators[0]?.text).toContain("Home");
    expect(result.jsonLdParseErrors[0]).toEqual(expect.objectContaining({ raw: '{"bad": }' }));
    expect(result.openGraph["og:title"]).toBe("Example");
    expect(result.twitterCards["twitter:card"]).toBe("summary");
    expect(result.imagesMissingAlt).toBe(2);
    expect(result.internalLinkCount).toBe(3);
    expect(result.uniqueInternalUrls).toEqual(["https://example.com/", "https://example.com/one"]);
    expect(result.externalDomains).toEqual(["outside.example"]);
    expect(result.anchorTextSummary[0]).toEqual(expect.objectContaining({ text: "Details", count: 2 }));
    expect(result.emptyAnchorCount).toBe(1);
  });
});
