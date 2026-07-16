export const ANALYTICS_SCHEMA_VERSION = "1" as const;
export const CONNECTOR_VERSION = "1.0.0" as const;
export const TRANSFORMATION_VERSION = "release-1.0.0" as const;

export type ConnectorKind = "search-console" | "web-analytics" | "campaign" | "lead-summary";
export type MetricType = "search-performance" | "web-analytics" | "campaign-performance" | "lead-summary";
export type OpportunityStatus = "new" | "reviewed" | "approved" | "rejected" | "implemented" | "monitoring" | "verified";

export interface ProjectReference {
  projectId: string;
  createdAt: string;
  targetUrl: string;
  status: string;
}

export interface ConnectorDefinition {
  connectorId: string;
  version: typeof CONNECTOR_VERSION;
  kind: ConnectorKind;
  label: string;
  metricType: MetricType;
  importMethods: ["csv"];
  liveAccess: false;
  requiredFields: string[];
  optionalFields: string[];
  limitations: string[];
}

export interface ConnectorSource {
  sourceId: string;
  projectId: string;
  connectorId: string;
  connectorVersion: typeof CONNECTOR_VERSION;
  kind: ConnectorKind;
  label: string;
  accountLabel: string | null;
  propertyLabel: string | null;
  createdAt: string;
}

export interface ImportMapping {
  [canonicalField: string]: string;
}

export interface ImportJob {
  importId: string;
  projectId: string;
  sourceId: string;
  createdAt: string;
  completedAt: string;
  status: "completed" | "completed-with-rejections";
  fileName: string;
  mimeType: string;
  fileSha256: string;
  mapping: ImportMapping;
  totalRows: number;
  acceptedRows: number;
  rejectedRows: number;
  duplicateRows: number;
  sourceDateFrom: string | null;
  sourceDateTo: string | null;
  limitations: string[];
}

export interface ImportRejection {
  rejectionId: string;
  importId: string;
  projectId: string;
  rowNumber: number;
  code: "INVALID_VALUE" | "MISSING_VALUE" | "DUPLICATE_RECORD" | "FORMULA_VALUE" | "UNSUPPORTED_SENSITIVE_FIELD";
  field: string | null;
  message: string;
}

export interface DataLineage {
  projectId: string;
  sourceId: string;
  importId: string;
  connectorId: string;
  connectorVersion: typeof CONNECTOR_VERSION;
  importMethod: "csv";
  sourceRecordId: string;
  normalizedRecordHash: string;
  importedAt: string;
  sourceDate: string;
  sourceDateTo: string | null;
  transformationVersion: typeof TRANSFORMATION_VERSION;
  validationStatus: "accepted";
  confidence: "reported-by-import";
  limitations: string[];
}

interface MetricBase {
  metricId: string;
  projectId: string;
  sourceId: string;
  importId: string;
  metricType: MetricType;
  date: string;
  dateTo: string | null;
  lineage: DataLineage;
}

export interface SearchPerformanceRecord extends MetricBase {
  metricType: "search-performance";
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  averagePosition: number;
  device: string;
  country: string;
}

export interface WebAnalyticsRecord extends MetricBase {
  metricType: "web-analytics";
  page: string;
  sessions: number;
  users: number | null;
  engagementRate: number | null;
  conversions: number | null;
  device: string | null;
  country: string | null;
}

export interface CampaignPerformanceRecord extends MetricBase {
  metricType: "campaign-performance";
  campaign: string;
  spend: number;
  clicks: number;
  conversions: number;
}

export interface LeadSummaryRecord extends MetricBase {
  metricType: "lead-summary";
  source: string;
  leads: number;
  qualifiedLeads: number;
}

export type AnalyticsMetric = SearchPerformanceRecord | WebAnalyticsRecord | CampaignPerformanceRecord | LeadSummaryRecord;

export interface OpportunityEvidenceLink {
  opportunityId: string;
  metricId: string;
  projectId: string;
  calculationRole: string;
}

export interface GrowthOpportunity {
  opportunityId: string;
  projectId: string;
  ruleId: string;
  ruleVersion: "1.0.0";
  groupKey: string;
  title: string;
  status: OpportunityStatus;
  priority: "high" | "medium" | "low";
  category: "search" | "engagement" | "campaign" | "lead-quality";
  page: string | null;
  query: string | null;
  observation: string;
  exactCalculation: string;
  proposedAction: string;
  successMetric: string;
  limitation: string;
  sourceMetricIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsAuditEvent {
  eventId: string;
  projectId: string;
  occurredAt: string;
  eventType: "project.registered" | "import.completed" | "import.deleted" | "opportunity.status-changed";
  importRef: string | null;
  summary: Record<string, string | number | boolean | null>;
}

export interface AnalyticsState {
  schemaVersion: typeof ANALYTICS_SCHEMA_VERSION;
  projects: ProjectReference[];
  sources: ConnectorSource[];
  imports: ImportJob[];
  rejections: ImportRejection[];
  metrics: AnalyticsMetric[];
  opportunities: GrowthOpportunity[];
  opportunityEvidence: OpportunityEvidenceLink[];
  auditEvents: AnalyticsAuditEvent[];
}

export interface AnalyticsFilters {
  metricType?: MetricType;
  page?: string;
  query?: string;
  dateFrom?: string;
  dateTo?: string;
  device?: string;
  country?: string;
}

export interface ImportBundle {
  project: ProjectReference;
  source: ConnectorSource;
  job: ImportJob;
  rejections: ImportRejection[];
  metrics: AnalyticsMetric[];
  opportunities: GrowthOpportunity[];
  evidence: OpportunityEvidenceLink[];
  auditEvent: AnalyticsAuditEvent;
}

export interface AnalyticsStore {
  registerProject(project: ProjectReference): Promise<ProjectReference>;
  listProjects(): Promise<ProjectReference[]>;
  getProject(projectId: string): Promise<ProjectReference | null>;
  saveImport(bundle: ImportBundle): Promise<ImportJob>;
  listSources(projectId: string): Promise<ConnectorSource[]>;
  listImports(projectId: string): Promise<ImportJob[]>;
  getImport(projectId: string, importId: string): Promise<{ job: ImportJob; rejections: ImportRejection[] } | null>;
  deleteImport(projectId: string, importId: string, event: AnalyticsAuditEvent): Promise<boolean>;
  listMetrics(projectId: string, filters?: AnalyticsFilters): Promise<AnalyticsMetric[]>;
  getMetric(projectId: string, metricId: string): Promise<AnalyticsMetric | null>;
  listOpportunities(projectId: string): Promise<GrowthOpportunity[]>;
  getOpportunity(projectId: string, opportunityId: string): Promise<GrowthOpportunity | null>;
  updateOpportunityStatus(projectId: string, opportunityId: string, status: OpportunityStatus, event: AnalyticsAuditEvent): Promise<GrowthOpportunity | null>;
  listEvidence(projectId: string, opportunityId?: string): Promise<OpportunityEvidenceLink[]>;
  listAuditEvents(projectId: string): Promise<AnalyticsAuditEvent[]>;
}
