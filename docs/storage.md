# Storage adapters

AI Visibility Lab preserves the `RunStore` interface and provides two adapters.

## JSON adapter

`STORAGE_ADAPTER=json` is the default for local development and tests. It writes `DATA_DIR/runs.json` atomically and retains strict schema, identity, comparison-semantic, history, proposal, and verification validation. Manual visibility observations use a separate atomic JSON file in the same directory.

Release 1 analytics uses a matching `DATA_DIR/analytics.json` file through `JsonAnalyticsStore`. It validates project/source/import/metric/opportunity/evidence/audit relationships, duplicate fingerprints, project isolation, and controlled deletion before an atomic replacement. Neither JSON file is a multi-process database.

## SQLite adapter

`STORAGE_ADAPTER=sqlite` enables the built-in Node SQLite adapter. Set `SQLITE_PATH` to a file on a persistent disk; otherwise the default is `DATA_DIR/research.sqlite`.

Requirements:

- Node.js 22.13 or later;
- one application instance writing to the database file;
- a persistent filesystem in production.

No dependency was installed. The adapter uses `node:sqlite`, which is available without the experimental flag from Node 22.13. The Node API remains release-candidate status, so this adapter is an opt-in durable single-instance deployment path rather than a claim of multi-instance database support.

The adapter enables foreign keys, WAL journaling, a busy timeout, and transactional writes. It runs ordered migrations from `packages/storage/sqlite-migrations.ts`; the matching reviewable SQL is in `packages/storage/migrations/001_initial.sql`.

Migration 1 stores:

- research projects and crawled pages;
- complete validated comparison runs;
- ordered run sites and analyzed pages;
- findings and evidence;
- comparisons and implementation proposals;
- later-run verifications;
- the versioned research source registry;
- optional AI interpretations generated from saved evidence;
- a reserved table for visibility observations.

Additive analytics migration 002 is owned by `packages/analytics/sqlite-migration.ts`, with reviewable SQL at `packages/analytics/migrations/002_analytics_connectors.sql`. It adds:

- connector sources referencing `research_projects.id`;
- import jobs and cascade-owned redacted rejections;
- normalized metric records with per-project/source source-record and normalized-hash uniqueness;
- opportunities with project/rule/group uniqueness;
- opportunity evidence links that cascade only when their metric or opportunity owner is deleted;
- redacted audit events whose project/import references remain textual so import deletion cannot erase the event.

Project-scoped indexes cover source, import time/source, metric type/date/page/query/import, opportunity status/priority, evidence links, and audit time. Foreign keys are explicitly enabled and asserted. Import deletion cannot delete a project, unrelated metric, opportunity, or audit event.

Migration 002 was tested against fresh schema 001 and an existing-schema fixture containing project/page records. It was not run against the current persistent local or deployed database. Obtain separate approval and take a verified backup before opening an important SQLite file with the Release 1 app.

Complete run JSON remains the read model, while normalized child tables support inspection and later query expansion. Every run is passed through the same strict validation used by the JSON adapter before and after history linkage. Reopening a SQLite record validates it again and treats invalid data as corrupt rather than silently normalizing or overwriting it.

## Production boundary

SQLite mode is suitable for a persistent, single-instance demo or small research deployment. Horizontal scaling, managed backups, failover, and multi-instance writers require a future PostgreSQL or other managed database adapter. Adding such an adapter requires an approved dependency and a separate migration plan; no PostgreSQL dependency was added in this release.
