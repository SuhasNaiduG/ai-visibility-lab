export type VisibilityDevice = "desktop" | "mobile" | "tablet" | "other";

export interface ManualVisibilityObservationInput {
  targetUrl: string;
  query: string;
  engine: string;
  location: string;
  device: VisibilityDevice;
  observationDate: string;
  observedRank?: number;
  observedCitation?: boolean;
  citationUrl?: string;
  notes?: string;
  screenshotReference?: string;
  referenceUrl?: string;
}

export interface ManualVisibilityObservation extends ManualVisibilityObservationInput {
  id: string;
  createdAt: string;
  source: "manual";
}

export interface VisibilityObservationStore {
  save(input: ManualVisibilityObservationInput): Promise<ManualVisibilityObservation>;
  list(targetUrl?: string): Promise<ManualVisibilityObservation[]>;
}

export interface VisibilityProviderRequest {
  targetUrl: string;
  query: string;
  engine: string;
  location: string;
  device: VisibilityDevice;
}

export interface VisibilityObservationProvider {
  providerId: string;
  configured: boolean;
  collect(request: VisibilityProviderRequest, signal: AbortSignal): Promise<ManualVisibilityObservationInput>;
}
