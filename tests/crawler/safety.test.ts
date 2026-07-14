import { describe, expect, it, vi } from "vitest";
import {
  assertPublicHttpUrl,
  isPublicIpAddress
} from "../../packages/crawler/safety.js";

describe("public-network URL policy", () => {
  it.each([
    "0.0.0.0",
    "10.0.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.1.1",
    "192.168.1.1",
    "198.18.0.1",
    "224.0.0.1",
    "240.0.0.1",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1"
  ])("classifies %s as non-public", (address) => {
    expect(isPublicIpAddress(address)).toBe(false);
  });

  it.each([
    "8.8.8.8",
    "93.184.216.34",
    "2001:4860:4860::8888"
  ])("classifies %s as public", (address) => {
    expect(isPublicIpAddress(address)).toBe(true);
  });

  it("rejects localhost without attempting DNS", async () => {
    const dnsLookup = vi.fn();

    await expect(
      assertPublicHttpUrl(new URL("http://app.localhost/admin"), {
        dnsLookup
      })
    ).rejects.toMatchObject({
      code: "PRIVATE_NETWORK_TARGET",
      httpStatus: 400
    });
    expect(dnsLookup).not.toHaveBeenCalled();
  });

  it("rejects direct private IP literals without attempting DNS", async () => {
    const dnsLookup = vi.fn();

    await expect(
      assertPublicHttpUrl(new URL("http://192.168.1.20/"), {
        dnsLookup
      })
    ).rejects.toMatchObject({
      code: "PRIVATE_NETWORK_TARGET"
    });
    expect(dnsLookup).not.toHaveBeenCalled();
  });

  it("rejects a hostname when any DNS answer is private", async () => {
    const dnsLookup = vi.fn(async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.8", family: 4 }
    ]);

    await expect(
      assertPublicHttpUrl(new URL("https://mixed.example/"), {
        dnsLookup
      })
    ).rejects.toMatchObject({
      code: "PRIVATE_NETWORK_TARGET",
      details: {
        resolvedAddresses: ["93.184.216.34", "10.0.0.8"]
      }
    });
  });

  it("returns the resolved public addresses as evidence", async () => {
    const dnsLookup = vi.fn(async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 }
    ]);

    const evidence = await assertPublicHttpUrl(
      new URL("https://example.com/path"),
      { dnsLookup }
    );

    expect(evidence).toEqual({
      url: "https://example.com/path",
      hostname: "example.com",
      resolvedAddresses: [
        "93.184.216.34",
        "2606:2800:220:1:248:1893:25c8:1946"
      ]
    });
    expect(dnsLookup).toHaveBeenCalledWith("example.com", {
      all: true,
      verbatim: true
    });
  });

  it("maps DNS failures to a typed upstream error", async () => {
    const dnsLookup = vi.fn(async () => {
      throw new Error("host not found");
    });

    await expect(
      assertPublicHttpUrl(new URL("https://missing.example/"), {
        dnsLookup
      })
    ).rejects.toMatchObject({
      code: "UPSTREAM_FETCH_FAILED",
      httpStatus: 502,
      message: "DNS lookup failed for missing.example"
    });
  });

  it("rejects unsupported protocols with a client-safe error", async () => {
    await expect(
      assertPublicHttpUrl(new URL("ftp://example.com/file"))
    ).rejects.toMatchObject({
      code: "INVALID_URL",
      httpStatus: 400,
      message: "Only HTTP and HTTPS URLs are supported"
    });
  });
});
