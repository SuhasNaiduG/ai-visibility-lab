import { describe, expect, it } from "vitest";
import { normalizeUrl } from "../../packages/crawler/url.js";

describe("normalizeUrl", () => {
  it("adds https when the protocol is missing", () => {
    const result = normalizeUrl("425clearaligners.com");

    expect(result.toString()).toBe("https://425clearaligners.com/");
  });

  it("preserves an existing https URL", () => {
    const result = normalizeUrl("https://425clearaligners.com");

    expect(result.toString()).toBe("https://425clearaligners.com/");
  });

  it("trims surrounding whitespace", () => {
    const result = normalizeUrl("  https://example.com/path  ");

    expect(result.toString()).toBe("https://example.com/path");
  });

  it("removes URL fragments", () => {
    const result = normalizeUrl("https://example.com/page#section");

    expect(result.toString()).toBe("https://example.com/page");
  });

  it("rejects an empty value", () => {
    expect(() => normalizeUrl("   ")).toThrow("URL is required");
  });

  it("rejects unsupported protocols", () => {
    expect(() => normalizeUrl("ftp://example.com")).toThrow();
  });

  it("rejects malformed URLs", () => {
    expect(() => normalizeUrl("not a valid url")).toThrow();
  });
});