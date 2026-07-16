# Release 1 Data Connectors

## Scope

Release 1 provides an offline connector architecture for four aggregate CSV shapes:

| Connector | Normalized metric | Required canonical fields |
| --- | --- | --- |
| `search-console-csv` | `search-performance` | query, page, date, clicks, impressions, ctr, averagePosition |
| `web-analytics-csv` | `web-analytics` | page, date, sessions |
| `campaign-csv` | `campaign-performance` | campaign, date, spend, clicks, conversions |
| `lead-summary-csv` | `lead-summary` | source, date, leads, qualifiedLeads |

Optional fields and limitations are declared in `packages/analytics/connectors.ts`. Every definition declares `importMethods: ["csv"]` and `liveAccess: false`. No provider SDK, credential, token, OAuth flow, scheduled sync, or network adapter was added.

## Project identity

The canonical project identity remains schema-001 `research_projects.id`. Migration 002 does not create `growth_projects`. SQLite connector sources, imports, metrics, opportunities, and evidence links reference `research_projects` directly. The JSON analytics store keeps validated references to project IDs created by the existing crawl or comparison flow and never generates a second project ID.

## Lineage contract

Every accepted metric stores:

- project, connector source, and import IDs;
- connector ID/version and `csv` import method;
- deterministic source-record and normalized-record SHA-256 hashes;
- import timestamp and source date/range;
- transformation version `release-1.0.0`;
- accepted validation status and `reported-by-import` confidence;
- explicit source limitations.

Original CSV bytes are held only in the request while parsing. Stores receive normalized records, file metadata/fingerprint, mapping, counts, redacted rejections, opportunities, links, and audit metadata—never the original file.

## Storage adapters

`JsonAnalyticsStore` and `SqliteAnalyticsStore` implement the same `AnalyticsStore` port. Parity tests cover registration, import, filtering, workflow, deletion, duplicate handling, evidence links, and audit retention. SQLite enables and verifies `PRAGMA foreign_keys = ON`.

Migration 002 was verified on temporary fresh and existing-schema databases. It has not been applied to the current persistent local or deployed database.

## Future live connector boundary

Any future live adapter belongs behind the normalized import boundary and must produce the same strict records and lineage. Before implementation it requires separate approval for provider choice, OAuth scopes, secret storage, token lifecycle, rate limits, account/property selection, refresh behavior, privacy review, deletion/retention, and deployment migrations.
