export interface ResourceAvailability {
  url: string;
  available: boolean;
  statusCode: number | null;
}

export interface SiteResources {
  robotsTxt: ResourceAvailability;
  sitemapXml: ResourceAvailability;
}

export async function checkSiteResources(
  pageUrl: string
): Promise<SiteResources> {
  const origin = new URL(pageUrl).origin;

  const [robotsTxt, sitemapXml] = await Promise.all([
    checkResource(new URL("/robots.txt", origin)),
    checkResource(new URL("/sitemap.xml", origin))
  ]);

  return {
    robotsTxt,
    sitemapXml
  };
}

async function checkResource(
  url: URL
): Promise<ResourceAvailability> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "AI-Visibility-Lab/0.1"
      }
    });

    return {
      url: response.url || url.toString(),
      available: response.ok,
      statusCode: response.status
    };
  } catch {
    return {
      url: url.toString(),
      available: false,
      statusCode: null
    };
  }
}