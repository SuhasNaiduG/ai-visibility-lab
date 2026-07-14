import { describe, expect, it } from "vitest";
import { classifyComparisonEligibility } from "../../packages/comparison/eligibility.js";
import { makeAnalysis } from "../helpers/analysis.js";

describe("classifyComparisonEligibility", () => {
  it("excludes a 403 response and exposes the status as retrieval evidence", () => {
    const analysis = makeAnalysis("https://forbidden.example/", { statusCode: 403 });

    const result = classifyComparisonEligibility(analysis);

    expect(result).toEqual({
      status: "ineligible",
      usableAsBenchmark: false,
      reasons: [{
        code: "NON_SUCCESS_HTTP",
        message: expect.stringMatching(/HTTP 403|non-2xx/i),
        evidence: [{
          sourceUrl: analysis.finalUrl,
          field: "statusCode",
          observedValue: 403,
          fetchedAt: analysis.fetchedAt
        }]
      }]
    });
  });

  it.each([401, 429, 500, 503])("excludes HTTP %i as a non-success retrieval", (statusCode) => {
    const analysis = makeAnalysis(`https://status-${statusCode}.example/`, { statusCode });

    const result = classifyComparisonEligibility(analysis);

    expect(result).toEqual(expect.objectContaining({
      status: "ineligible",
      usableAsBenchmark: false,
      reasons: [expect.objectContaining({
        code: "NON_SUCCESS_HTTP",
        evidence: [expect.objectContaining({ field: "statusCode", observedValue: statusCode })]
      })]
    }));
  });

  it("excludes an HTTP 200 access-denied page using visible response evidence", () => {
    const analysis = makeAnalysis("https://blocked.example/", {
      statusCode: 200,
      title: "Access Denied",
      titleLength: 13,
      visibleText: "Access denied. Your request has been blocked.",
      wordCount: 8
    });

    const result = classifyComparisonEligibility(analysis);

    expect(result).toEqual(expect.objectContaining({
      status: "ineligible",
      usableAsBenchmark: false,
      reasons: [expect.objectContaining({
        code: "ACCESS_DENIED",
        evidence: [expect.objectContaining({
          sourceUrl: analysis.finalUrl,
          field: "title",
          observedValue: "Access Denied",
          selector: "title",
          snippet: "Access Denied",
          fetchedAt: analysis.fetchedAt
        })]
      })]
    }));
  });

  it.each([
    { title: "Just a moment", visibleText: "Verify you are human before continuing. Checking your browser.", code: "BOT_CHALLENGE" },
    { title: "CAPTCHA", visibleText: "Complete the CAPTCHA to continue.", code: "CAPTCHA" },
    { title: "Security check", visibleText: "Performing a security check before continuing.", code: "SECURITY_CHECK" },
    { title: "Service unavailable", visibleText: "The requested page is temporarily unavailable.", code: "ERROR_PAGE" },
    { title: "404 Page Not Found", visibleText: "The requested page could not be found.", code: "ERROR_PAGE" }
  ])("excludes a successful-status $code page", ({ title, visibleText, code }) => {
    const analysis = makeAnalysis(`https://${code.toLocaleLowerCase()}.example/`, {
      title,
      titleLength: title.length,
      visibleText,
      wordCount: visibleText.split(/\s+/u).length,
      metaDescription: null,
      metaDescriptionLength: 0,
      h1Count: 0,
      h1Text: [],
      headingHierarchy: [],
      totalHeadingCount: 0,
      internalLinkCount: 0,
      externalLinkCount: 0,
      schemaTypes: []
    });

    expect(classifyComparisonEligibility(analysis)).toEqual(expect.objectContaining({
      status: "ineligible",
      usableAsBenchmark: false,
      reasons: [expect.objectContaining({ code })]
    }));
  });

  it("excludes an empty page", () => {
    const analysis = makeAnalysis("https://empty.example/", {
      title: null,
      titleLength: 0,
      metaDescription: null,
      metaDescriptionLength: 0,
      h1Count: 0,
      h1Text: [],
      headingHierarchy: [],
      totalHeadingCount: 0,
      visibleText: "",
      wordCount: 0,
      internalLinkCount: 0,
      externalLinkCount: 0,
      schemaTypes: []
    });

    const result = classifyComparisonEligibility(analysis);

    expect(result).toEqual(expect.objectContaining({
      status: "ineligible",
      usableAsBenchmark: false,
      reasons: [expect.objectContaining({
        code: "EMPTY_CONTENT",
        evidence: [expect.objectContaining({
          sourceUrl: analysis.finalUrl,
          field: "wordCount",
          observedValue: 0,
          selector: "body",
          fetchedAt: analysis.fetchedAt
        })]
      })]
    }));
  });

  it("excludes a near-empty page when it lacks enough normal page evidence", () => {
    const analysis = makeAnalysis("https://near-empty.example/", {
      title: "Brief response",
      titleLength: 14,
      metaDescription: null,
      metaDescriptionLength: 0,
      h1Count: 0,
      h1Text: [],
      headingHierarchy: [],
      totalHeadingCount: 0,
      visibleText: "A very brief response with no supporting page structure.",
      wordCount: 9,
      internalLinkCount: 0,
      externalLinkCount: 0,
      schemaTypes: []
    });

    const result = classifyComparisonEligibility(analysis);

    expect(result).toEqual(expect.objectContaining({
      status: "ineligible",
      usableAsBenchmark: false,
      reasons: [expect.objectContaining({
        code: "NEAR_EMPTY_CONTENT",
        evidence: [expect.objectContaining({
          field: "wordCount",
          observedValue: 9,
          selector: "body"
        })]
      })]
    }));
  });

  it("keeps an evidence-rich near-empty page as a degraded benchmark", () => {
    const analysis = makeAnalysis("https://short.example/", {
      visibleText: "A brief service summary with contact details and treatment options for prospective readers.",
      wordCount: 32
    });

    const result = classifyComparisonEligibility(analysis);

    expect(result).toEqual(expect.objectContaining({
      status: "degraded",
      usableAsBenchmark: true,
      reasons: [expect.objectContaining({
        code: "NEAR_EMPTY_CONTENT",
        evidence: [expect.objectContaining({
          sourceUrl: analysis.finalUrl,
          field: "wordCount",
          observedValue: 32,
          selector: "body",
          fetchedAt: analysis.fetchedAt
        })]
      })]
    }));
  });

  it("does not exclude a normal evidence-rich page merely for discussing CAPTCHA security", () => {
    const analysis = makeAnalysis("https://security-guide.example/", {
      title: "A guide to CAPTCHA security",
      titleLength: 27,
      visibleText: "This article explains CAPTCHA security controls, accessibility trade-offs, implementation choices, and testing guidance for site owners.",
      wordCount: 250
    });

    expect(classifyComparisonEligibility(analysis)).toEqual({
      status: "eligible",
      usableAsBenchmark: true,
      reasons: []
    });
  });

  it("does not exclude a normal guide whose title discusses error handling", () => {
    const analysis = makeAnalysis("https://engineering.example/errors", {
      title: "Error handling guide",
      titleLength: 20,
      visibleText: "A detailed engineering guide to error handling, recovery, diagnostics, monitoring, and safe user-facing messages.",
      wordCount: 250
    });

    expect(classifyComparisonEligibility(analysis)).toEqual({
      status: "eligible",
      usableAsBenchmark: true,
      reasons: []
    });
  });

  it("does not exclude an evidence-rich article that discusses an error phrase in its body", () => {
    const analysis = makeAnalysis("https://engineering.example/status-guidance", {
      title: "Service resilience and incident communication",
      titleLength: 46,
      visibleText: "This troubleshooting article explains how teams communicate when a service unavailable message appears, investigate causes, restore service, monitor recovery, and document prevention guidance.",
      wordCount: 120
    });

    expect(classifyComparisonEligibility(analysis)).toEqual({
      status: "eligible",
      usableAsBenchmark: true,
      reasons: []
    });
  });

  it("does not mistake a legitimate brand name beginning with three digits for an HTTP error title", () => {
    const analysis = makeAnalysis("https://425clearaligners.example/", {
      title: "425 Clear Aligners | Doctor-Supervised Aligners",
      titleLength: 48,
      visibleText: "Doctor-supervised clear aligner treatment with detailed service, provider, location, contact, and patient guidance.",
      wordCount: 250
    });

    expect(classifyComparisonEligibility(analysis)).toEqual({
      status: "eligible",
      usableAsBenchmark: true,
      reasons: []
    });
  });

  it("does not treat a CAPTCHA-protected contact form as a whole-page retrieval failure", () => {
    const analysis = makeAnalysis("https://contact.example/", {
      title: "Contact our service team",
      visibleText: "Contact our service team. Name. Email. Message. This form is protected by reCAPTCHA.",
      wordCount: 45
    });

    expect(classifyComparisonEligibility(analysis)).toEqual(expect.objectContaining({
      status: "degraded",
      usableAsBenchmark: true
    }));
  });

  it("accepts a normal successful page as a valid benchmark", () => {
    const analysis = makeAnalysis("https://valid.example/");

    expect(classifyComparisonEligibility(analysis)).toEqual({
      status: "eligible",
      usableAsBenchmark: true,
      reasons: []
    });
  });
});
