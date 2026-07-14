import { describe, expect, it } from "vitest";
import { parsePage } from "../../packages/parser/page.js";

const html = `
<!doctype html>
<html lang="en">
  <head>
    <title>Clear Aligners Bellevue</title>
    <meta
      name="description"
      content="Doctor-led clear aligner treatment in Bellevue."
    />
    <meta name="robots" content="index, follow" />
    <link
      rel="canonical"
      href="https://example.com/clear-aligners"
    />
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Organization",
            "name": "Example Orthodontics"
          },
          {
            "@type": ["MedicalBusiness", "LocalBusiness"],
            "name": "Example Clear Aligners"
          }
        ]
      }
    </script>
  </head>
  <body>
    <h1>Clear Aligners in Bellevue</h1>
    <h2>How treatment works</h2>
    <h3>Consultation</h3>

    <a href="/pricing">Pricing</a>
    <a href="https://example.com/contact">Contact</a>
    <a href="https://external.example.org/article">External article</a>
    <a href="#faq">FAQ</a>
    <a href="mailto:hello@example.com">Email</a>
  </body>
</html>
`;

describe("parsePage", () => {
  it("extracts page metadata and headings", () => {
    const result = parsePage(html, "https://example.com/clear-aligners");

    expect(result.title).toBe("Clear Aligners Bellevue");
    expect(result.metaDescription).toBe(
      "Doctor-led clear aligner treatment in Bellevue."
    );
    expect(result.canonicalUrl).toBe(
      "https://example.com/clear-aligners"
    );
    expect(result.robotsMeta).toBe("index, follow");
    expect(result.h1Count).toBe(1);
    expect(result.h1Text).toEqual(["Clear Aligners in Bellevue"]);
    expect(result.headingHierarchy).toEqual([
      { level: 1, text: "Clear Aligners in Bellevue" },
      { level: 2, text: "How treatment works" },
      { level: 3, text: "Consultation" }
    ]);
  });

  it("extracts JSON-LD blocks and schema types", () => {
    const result = parsePage(html, "https://example.com/clear-aligners");

    expect(result.jsonLdBlocks).toHaveLength(1);
    expect(result.schemaTypes).toEqual(
      expect.arrayContaining([
        "Organization",
        "MedicalBusiness",
        "LocalBusiness"
      ])
    );
  });

  it("counts internal and external HTTP links", () => {
    const result = parsePage(html, "https://example.com/clear-aligners");

    expect(result.internalLinkCount).toBe(2);
    expect(result.externalLinkCount).toBe(1);
  });

  it("detects multiple H1 elements", () => {
    const result = parsePage(
      "<h1>First</h1><h1>Second</h1>",
      "https://example.com"
    );

    expect(result.h1Count).toBe(2);
    expect(result.h1Text).toEqual(["First", "Second"]);
  });

  it("does not fail when JSON-LD is invalid", () => {
    const result = parsePage(
      '<script type="application/ld+json">{invalid}</script>',
      "https://example.com"
    );

    expect(result.jsonLdBlocks).toEqual([]);
    expect(result.schemaTypes).toEqual([]);
  });
});