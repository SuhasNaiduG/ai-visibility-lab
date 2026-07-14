import request from "supertest";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

vi.mock("../../services/analyzer/analyze.js", () => ({
  analyzeUrl: vi.fn()
}));

import { app } from "../../services/analyzer/app.js";
import { analyzeUrl } from "../../services/analyzer/analyze.js";

const mockedAnalyzeUrl = vi.mocked(analyzeUrl);

describe("analyzer API", () => {
  beforeEach(() => {
    mockedAnalyzeUrl.mockReset();
  });

  it("returns the health status", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok"
    });
  });

  it("rejects a missing URL", async () => {
    const response = await request(app)
      .post("/api/analyze")
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid request");
    expect(mockedAnalyzeUrl).not.toHaveBeenCalled();
  });

  it("rejects an empty URL", async () => {
    const response = await request(app)
      .post("/api/analyze")
      .send({
        url: ""
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid request");
    expect(mockedAnalyzeUrl).not.toHaveBeenCalled();
  });

  it("returns a structured analysis result", async () => {
    mockedAnalyzeUrl.mockResolvedValue({
      requestedUrl: "https://example.com/",
      statusCode: 200,
      finalUrl: "https://example.com/",
      responseTimeMs: 150,
      fetchedAt: "2026-07-15T00:00:00.000Z",
      title: "Example",
      metaDescription: "Example description",
      canonicalUrl: "https://example.com/",
      robotsMeta: "index, follow",
      h1Count: 1,
      h1Text: ["Example heading"],
      headingHierarchy: [
        {
          level: 1,
          text: "Example heading"
        }
      ],
      jsonLdBlocks: [],
      schemaTypes: [],
      internalLinkCount: 3,
      externalLinkCount: 1,
      robotsTxtAvailable: true,
      robotsTxtStatusCode: 200,
      sitemapXmlAvailable: true,
      sitemapXmlStatusCode: 200
    });

    const response = await request(app)
      .post("/api/analyze")
      .send({
        url: "example.com"
      });

    expect(response.status).toBe(200);
    expect(response.body.statusCode).toBe(200);
    expect(response.body.title).toBe("Example");
    expect(response.body.h1Count).toBe(1);
    expect(response.body.robotsTxtAvailable).toBe(true);
    expect(mockedAnalyzeUrl).toHaveBeenCalledWith(
      "example.com"
    );
  });

  it("returns a client error for an unsupported protocol", async () => {
    mockedAnalyzeUrl.mockRejectedValue(
      new Error("Only HTTP and HTTPS URLs are supported")
    );

    const response = await request(app)
      .post("/api/analyze")
      .send({
        url: "ftp://example.com"
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Only HTTP and HTTPS URLs are supported"
    });
  });

  it("returns a gateway error when analysis fails", async () => {
    mockedAnalyzeUrl.mockRejectedValue(
      new Error("Website request failed")
    );

    const response = await request(app)
      .post("/api/analyze")
      .send({
        url: "https://example.com"
      });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      error: "Website request failed"
    });
  });
});