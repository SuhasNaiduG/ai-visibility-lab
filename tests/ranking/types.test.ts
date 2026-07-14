import { describe, expect, it } from "vitest";
import { validateManualRankObservations } from "../../packages/ranking/types.js";

describe("manual rank observations", () => {
  it("validates positions and normalizes URL keys", () => {
    expect(validateManualRankObservations({ "example.com": 8 })).toEqual({ "https://example.com/": 8 });
    expect(() => validateManualRankObservations({ "https://example.com": 0 })).toThrow(/1 to 1000/);
    expect(() => validateManualRankObservations({ "ftp://example.com": 8 })).toThrow(/HTTP and HTTPS/);
  });
});
