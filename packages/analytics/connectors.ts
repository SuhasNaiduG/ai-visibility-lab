import { CONNECTOR_VERSION, type ConnectorDefinition, type ConnectorKind } from "./types.js";

export const connectorDefinitions: readonly ConnectorDefinition[] = [
  {
    connectorId: "search-console-csv",
    version: CONNECTOR_VERSION,
    kind: "search-console",
    label: "Search Console CSV",
    metricType: "search-performance",
    importMethods: ["csv"],
    liveAccess: false,
    requiredFields: ["query", "page", "date", "clicks", "impressions", "ctr", "averagePosition"],
    optionalFields: ["dateTo", "device", "country"],
    limitations: ["Values are accepted only from the uploaded CSV and are not refreshed automatically.", "Search Console exports can be sampled, filtered, aggregated, or privacy-thresholded by the source product."]
  },
  {
    connectorId: "web-analytics-csv",
    version: CONNECTOR_VERSION,
    kind: "web-analytics",
    label: "Web Analytics CSV",
    metricType: "web-analytics",
    importMethods: ["csv"],
    liveAccess: false,
    requiredFields: ["page", "date", "sessions"],
    optionalFields: ["dateTo", "users", "engagementRate", "conversions", "device", "country"],
    limitations: ["Values are reported by the imported aggregate export; attribution and consent settings are not independently verified."]
  },
  {
    connectorId: "campaign-csv",
    version: CONNECTOR_VERSION,
    kind: "campaign",
    label: "Campaign CSV",
    metricType: "campaign-performance",
    importMethods: ["csv"],
    liveAccess: false,
    requiredFields: ["campaign", "date", "spend", "clicks", "conversions"],
    optionalFields: ["dateTo"],
    limitations: ["Campaign values are imported aggregates and do not establish causal incrementality or provider attribution accuracy."]
  },
  {
    connectorId: "lead-summary-csv",
    version: CONNECTOR_VERSION,
    kind: "lead-summary",
    label: "Lead Summary CSV",
    metricType: "lead-summary",
    importMethods: ["csv"],
    liveAccess: false,
    requiredFields: ["source", "date", "leads", "qualifiedLeads"],
    optionalFields: ["dateTo"],
    limitations: ["Only aggregate lead counts are accepted. Direct identifiers, form contents, patient information, and call data are prohibited."]
  }
] as const;

export function connectorById(connectorId: string): ConnectorDefinition | undefined {
  return connectorDefinitions.find((connector) => connector.connectorId === connectorId);
}

export function connectorForKind(kind: ConnectorKind): ConnectorDefinition {
  return connectorDefinitions.find((connector) => connector.kind === kind)!;
}
