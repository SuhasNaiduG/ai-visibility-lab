export const ANALYTICS_SQLITE_MIGRATION = {
  version: 2,
  sql: `
    CREATE TABLE connector_sources (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
      connector_id TEXT NOT NULL,
      connector_version TEXT NOT NULL,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      source_json TEXT NOT NULL,
      UNIQUE(project_id, id)
    ) STRICT;
    CREATE INDEX connector_sources_project_idx ON connector_sources(project_id, kind, id);

    CREATE TABLE import_jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
      source_id TEXT NOT NULL REFERENCES connector_sources(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL,
      file_sha256 TEXT NOT NULL,
      job_json TEXT NOT NULL,
      UNIQUE(project_id, id)
    ) STRICT;
    CREATE INDEX import_jobs_project_created_idx ON import_jobs(project_id, created_at DESC, id);
    CREATE INDEX import_jobs_project_source_idx ON import_jobs(project_id, source_id, created_at DESC);

    CREATE TABLE import_rejections (
      id TEXT PRIMARY KEY,
      import_id TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
      row_number INTEGER NOT NULL,
      rejection_json TEXT NOT NULL,
      UNIQUE(project_id, import_id, row_number, id)
    ) STRICT;
    CREATE INDEX import_rejections_project_import_idx ON import_rejections(project_id, import_id, row_number);

    CREATE TABLE metric_records (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
      source_id TEXT NOT NULL REFERENCES connector_sources(id) ON DELETE RESTRICT,
      import_id TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
      metric_type TEXT NOT NULL,
      source_date TEXT NOT NULL,
      page_url TEXT,
      query_text TEXT,
      source_record_id TEXT NOT NULL,
      normalized_record_hash TEXT NOT NULL,
      record_json TEXT NOT NULL,
      UNIQUE(project_id, source_id, source_record_id),
      UNIQUE(project_id, source_id, normalized_record_hash)
    ) STRICT;
    CREATE INDEX metric_records_project_type_date_idx ON metric_records(project_id, metric_type, source_date DESC, id);
    CREATE INDEX metric_records_project_page_idx ON metric_records(project_id, page_url, source_date DESC);
    CREATE INDEX metric_records_project_query_idx ON metric_records(project_id, query_text, source_date DESC);
    CREATE INDEX metric_records_project_import_idx ON metric_records(project_id, import_id, id);

    CREATE TABLE opportunities (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
      rule_id TEXT NOT NULL,
      group_key TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      opportunity_json TEXT NOT NULL,
      UNIQUE(project_id, rule_id, group_key)
    ) STRICT;
    CREATE INDEX opportunities_project_status_priority_idx ON opportunities(project_id, status, priority, updated_at DESC);

    CREATE TABLE opportunity_evidence (
      opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
      metric_id TEXT NOT NULL REFERENCES metric_records(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
      calculation_role TEXT NOT NULL,
      PRIMARY KEY(opportunity_id, metric_id),
      UNIQUE(project_id, opportunity_id, metric_id)
    ) STRICT;
    CREATE INDEX opportunity_evidence_project_opportunity_idx ON opportunity_evidence(project_id, opportunity_id, metric_id);

    CREATE TABLE analytics_audit_events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      event_type TEXT NOT NULL,
      import_ref TEXT,
      event_json TEXT NOT NULL
    ) STRICT;
    CREATE INDEX analytics_audit_project_time_idx ON analytics_audit_events(project_id, occurred_at DESC, id);
  `
} as const;
