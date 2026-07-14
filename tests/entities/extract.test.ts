import { describe, expect, it } from "vitest";
import { extractCoverage } from "../../packages/entities/extract.js";

describe("extractCoverage", () => {
  it("links transparent entity, service, location, trust, and contact signals to sources", () => {
    const coverage = extractCoverage({
      pageUrl: "https://example.com/",
      sources: [
        { field: "openGraph.og:site_name", text: "Example Dental", selector: "meta" },
        { field: "headingHierarchy[0]", text: "Clear aligner treatment in Bellevue", selector: "h1" },
        { field: "headingHierarchy[1]", text: "Contact our doctor-led team", selector: "h2" }
      ],
      jsonLdBlocks: [{
        "@type": "Dentist",
        name: "Example Dental",
        telephone: "+1-425-555-0100",
        address: { "@type": "PostalAddress", addressLocality: "Bellevue" }
      }],
      links: [{ href: "mailto:care@example.com", anchorText: "Email", selector: "a" }]
    });

    expect(coverage.entity.terms).toContain("Example Dental");
    expect(coverage.service.present).toBe(true);
    expect(coverage.location.terms).toContain("Bellevue");
    expect(coverage.trust.present).toBe(true);
    expect(coverage.contact.present).toBe(true);
    expect(coverage.service.signals[0]).toEqual(expect.objectContaining({ sourceField: expect.any(String), heuristic: expect.any(Boolean) }));
  });
});
