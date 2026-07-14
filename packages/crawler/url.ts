export function normalizeUrl(input: string): URL {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error("URL is required");
  }

  const hasProtocol = /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed);

  const withProtocol = hasProtocol ? trimmed : `https://${trimmed}`;

  const url = new URL(withProtocol);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are supported");
  }

  url.hash = "";

  return url;
}
