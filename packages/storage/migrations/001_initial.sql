CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
) STRICT;

CREATE TABLE research_projects (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  target_url TEXT NOT NULL,
  status TEXT NOT NULL,
  project_json TEXT NOT NULL
) STRICT;

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  target_url TEXT NOT NULL,
  record_json TEXT NOT NULL
) STRICT;

CREATE INDEX runs_target_created_idx ON runs(target_url, created_at DESC);

CREATE TABLE run_sites (
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  input_order INTEGER NOT NULL,
  role TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  final_url TEXT NOT NULL,
  PRIMARY KEY (run_id, input_order)
) STRICT;

CREATE TABLE run_pages (
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  input_order INTEGER NOT NULL,
  analysis_json TEXT NOT NULL,
  PRIMARY KEY (run_id, input_order)
) STRICT;

CREATE TABLE project_pages (
  project_id TEXT NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  page_order INTEGER NOT NULL,
  status TEXT NOT NULL,
  page_json TEXT NOT NULL,
  PRIMARY KEY (project_id, page_order)
) STRICT;

CREATE TABLE evidence (
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  evidence_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  field TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  PRIMARY KEY (run_id, evidence_id)
) STRICT;

CREATE TABLE findings (
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  finding_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  rule_version TEXT NOT NULL,
  source_url TEXT NOT NULL,
  finding_json TEXT NOT NULL,
  PRIMARY KEY (run_id, finding_id)
) STRICT;

CREATE TABLE comparisons (
  run_id TEXT PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  comparison_json TEXT NOT NULL
) STRICT;

CREATE TABLE proposals (
  artifact_id TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  proposal_json TEXT NOT NULL,
  PRIMARY KEY (run_id, artifact_id)
) STRICT;

CREATE TABLE verifications (
  run_id TEXT PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  previous_run_id TEXT NOT NULL,
  verification_json TEXT NOT NULL
) STRICT;

CREATE TABLE research_sources (
  source_id TEXT PRIMARY KEY,
  registry_version TEXT NOT NULL,
  source_json TEXT NOT NULL
) STRICT;

CREATE TABLE ai_interpretations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  interpretation_json TEXT NOT NULL
) STRICT;

CREATE TABLE visibility_observations (
  id TEXT PRIMARY KEY,
  target_url TEXT NOT NULL,
  created_at TEXT NOT NULL,
  observation_json TEXT NOT NULL
) STRICT;
