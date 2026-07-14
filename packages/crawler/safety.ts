import { lookup as nodeLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { CrawlerError } from "./errors.js";

export interface DnsLookupAddress {
  address: string;
  family: number;
}

export interface DnsLookupOptions {
  all: true;
  verbatim: true;
}

export type DnsLookup = (
  hostname: string,
  options: DnsLookupOptions
) => Promise<readonly DnsLookupAddress[]>;

export interface UrlSafetyEvidence {
  url: string;
  hostname: string;
  resolvedAddresses: string[];
}

export interface UrlSafetyOptions {
  dnsLookup?: DnsLookup;
}

const DEFAULT_DNS_LOOKUP: DnsLookup = async (hostname, options) =>
  nodeLookup(hostname, options);

/**
 * Resolves a URL before every request and rejects the whole hostname when any
 * answer is non-public. Rejecting mixed public/private answers prevents a
 * caller from hiding a private destination behind DNS round-robin records.
 */
export async function assertPublicHttpUrl(
  url: URL,
  options: UrlSafetyOptions = {}
): Promise<UrlSafetyEvidence> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CrawlerError(
      "INVALID_URL",
      "Only HTTP and HTTPS URLs are supported",
      {
        details: {
          url: url.toString(),
          protocol: url.protocol
        }
      }
    );
  }

  const hostname = normalizeHostname(url.hostname);

  if (!hostname) {
    throw new CrawlerError("INVALID_URL", "URL hostname is required", {
      details: { url: url.toString() }
    });
  }

  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throwPrivateNetworkTarget(url, hostname, [hostname]);
  }

  const literalIpFamily = isIP(hostname);

  if (literalIpFamily !== 0) {
    if (!isPublicIpAddress(hostname)) {
      throwPrivateNetworkTarget(url, hostname, [hostname]);
    }

    return {
      url: url.toString(),
      hostname,
      resolvedAddresses: [hostname]
    };
  }

  let answers: readonly DnsLookupAddress[];

  try {
    answers = await (options.dnsLookup ?? DEFAULT_DNS_LOOKUP)(hostname, {
      all: true,
      verbatim: true
    });
  } catch (cause: unknown) {
    throw new CrawlerError(
      "UPSTREAM_FETCH_FAILED",
      `DNS lookup failed for ${hostname}`,
      {
        details: {
          url: url.toString(),
          hostname
        },
        cause
      }
    );
  }

  const addresses = [...new Set(answers.map((answer) => answer.address))];

  if (addresses.length === 0) {
    throw new CrawlerError(
      "UPSTREAM_FETCH_FAILED",
      `DNS lookup returned no addresses for ${hostname}`,
      {
        details: {
          url: url.toString(),
          hostname
        }
      }
    );
  }

  const invalidAddress = addresses.find((address) => isIP(address) === 0);

  if (invalidAddress) {
    throw new CrawlerError(
      "UPSTREAM_FETCH_FAILED",
      `DNS lookup returned an invalid address for ${hostname}`,
      {
        details: {
          url: url.toString(),
          hostname,
          address: invalidAddress
        }
      }
    );
  }

  if (addresses.some((address) => !isPublicIpAddress(address))) {
    throwPrivateNetworkTarget(url, hostname, addresses);
  }

  return {
    url: url.toString(),
    hostname,
    resolvedAddresses: addresses
  };
}

export function isPublicIpAddress(address: string): boolean {
  const normalized = normalizeHostname(address);
  const family = isIP(normalized);

  if (family === 4) {
    return isPublicIpv4(parseIpv4(normalized));
  }

  if (family === 6) {
    return isPublicIpv6(parseIpv6(normalized));
  }

  return false;
}

function normalizeHostname(hostname: string): string {
  const withoutBrackets = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;

  return withoutBrackets.replace(/\.$/, "").toLowerCase();
}

function throwPrivateNetworkTarget(
  url: URL,
  hostname: string,
  addresses: readonly string[]
): never {
  throw new CrawlerError(
    "PRIVATE_NETWORK_TARGET",
    "URL resolves to a private or non-public network address",
    {
      details: {
        url: url.toString(),
        hostname,
        resolvedAddresses: [...addresses]
      }
    }
  );
}

function parseIpv4(address: string): readonly number[] {
  return address.split(".").map(Number);
}

function isPublicIpv4(octets: readonly number[]): boolean {
  const [first = -1, second = -1, third = -1] = octets;

  if (
    octets.length !== 4 ||
    octets.some(
      (octet) => !Number.isInteger(octet) || octet < 0 || octet > 255
    )
  ) {
    return false;
  }

  return !(
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
}

function parseIpv6(address: string): Uint8Array {
  let normalized = address.split("%")[0] ?? address;

  if (normalized.includes(".")) {
    const lastColon = normalized.lastIndexOf(":");
    const ipv4 = parseIpv4(normalized.slice(lastColon + 1));

    if (lastColon < 0 || ipv4.length !== 4) {
      return new Uint8Array();
    }

    const firstGroup = ((ipv4[0] ?? 0) << 8) | (ipv4[1] ?? 0);
    const secondGroup = ((ipv4[2] ?? 0) << 8) | (ipv4[3] ?? 0);
    normalized = `${normalized.slice(0, lastColon)}:${firstGroup.toString(16)}:${secondGroup.toString(16)}`;
  }

  const doubleColonParts = normalized.split("::");

  if (doubleColonParts.length > 2) {
    return new Uint8Array();
  }

  const left = splitIpv6Groups(doubleColonParts[0] ?? "");
  const right = splitIpv6Groups(doubleColonParts[1] ?? "");
  const hasCompression = doubleColonParts.length === 2;
  const missingGroups = 8 - left.length - right.length;

  if (
    (!hasCompression && missingGroups !== 0) ||
    (hasCompression && missingGroups < 1)
  ) {
    return new Uint8Array();
  }

  const groups = hasCompression
    ? [...left, ...Array<number>(missingGroups).fill(0), ...right]
    : left;
  const bytes = new Uint8Array(16);

  if (
    groups.length !== 8 ||
    groups.some((group) => !Number.isInteger(group) || group < 0 || group > 0xffff)
  ) {
    return new Uint8Array();
  }

  for (const [index, group] of groups.entries()) {
    bytes[index * 2] = group >> 8;
    bytes[index * 2 + 1] = group & 0xff;
  }

  return bytes;
}

function splitIpv6Groups(value: string): number[] {
  if (!value) {
    return [];
  }

  return value.split(":").map((group) => Number.parseInt(group, 16));
}

function isPublicIpv6(bytes: Uint8Array): boolean {
  if (bytes.length !== 16) {
    return false;
  }

  const firstTwelveAreZero = bytes.slice(0, 12).every((byte) => byte === 0);
  const isIpv4Mapped =
    bytes.slice(0, 10).every((byte) => byte === 0) &&
    bytes[10] === 0xff &&
    bytes[11] === 0xff;

  if (firstTwelveAreZero || isIpv4Mapped) {
    return isPublicIpv4([...bytes.slice(12)]);
  }

  const isNat64WellKnown =
    bytes[0] === 0x00 &&
    bytes[1] === 0x64 &&
    bytes[2] === 0xff &&
    bytes[3] === 0x9b &&
    bytes.slice(4, 12).every((byte) => byte === 0);

  if (isNat64WellKnown) {
    return isPublicIpv4([...bytes.slice(12)]);
  }

  const isSixToFour = bytes[0] === 0x20 && bytes[1] === 0x02;

  if (isSixToFour) {
    return isPublicIpv4([...bytes.slice(2, 6)]);
  }

  const isUniqueLocal = (bytes[0]! & 0xfe) === 0xfc;
  const isLinkLocal = bytes[0] === 0xfe && (bytes[1]! & 0xc0) === 0x80;
  const isSiteLocal = bytes[0] === 0xfe && (bytes[1]! & 0xc0) === 0xc0;
  const isMulticast = bytes[0] === 0xff;
  const isDocumentation =
    bytes[0] === 0x20 &&
    bytes[1] === 0x01 &&
    bytes[2] === 0x0d &&
    bytes[3] === 0xb8;
  const isTeredo =
    bytes[0] === 0x20 &&
    bytes[1] === 0x01 &&
    bytes[2] === 0x00 &&
    bytes[3] === 0x00;
  const isOrchid =
    bytes[0] === 0x20 &&
    bytes[1] === 0x01 &&
    bytes[2] === 0x00 &&
    ((bytes[3]! & 0xf0) === 0x10 || (bytes[3]! & 0xf0) === 0x20);
  const isGlobalUnicast = (bytes[0]! & 0xe0) === 0x20;

  return (
    isGlobalUnicast &&
    !isUniqueLocal &&
    !isLinkLocal &&
    !isSiteLocal &&
    !isMulticast &&
    !isDocumentation &&
    !isTeredo &&
    !isOrchid
  );
}
