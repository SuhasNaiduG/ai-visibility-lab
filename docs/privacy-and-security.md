# Analytics Privacy and Security

## Accepted data boundary

Release 1 accepts aggregate performance records needed by its four connector contracts. It does not accept or store:

- credentials, passwords, API keys, secrets, access tokens, refresh tokens, or OAuth material;
- direct personal identifiers such as names, email addresses, phone numbers, postal addresses, IP addresses, or user/contact IDs;
- patient, diagnosis, medical, health, or medication information;
- form submissions, message bodies, free-text responses, or call recordings/transcripts;
- original CSV files after processing.

Sensitive-header detection rejects the complete file. Aggregate lead imports accept only date, source/channel, total leads, and qualified-lead count.

## Isolation and integrity

- Every source, import, rejection, metric, opportunity, and evidence link is project-scoped.
- SQLite uses foreign keys plus project-leading indexes and uniqueness constraints.
- JSON validates the same relationships before every atomic write.
- Deterministic hashes prevent duplicate normalized records within a source.
- Strict discriminated schemas reject unknown fields and cross-record identity drift.
- Audit summaries allow only short scalar values; they never include file contents or rejected cell data.

## Logs and errors

The import path does not log request bodies, CSV content, normalized records, or rejection values. API errors expose safe codes, bounds, field names, and validation paths. SQLite constraint messages are truncated/redacted before entering API details.

## Retention and deletion

The application stores normalized aggregates until an import is deleted. Controlled cascades remove only import-owned rows and evidence links. Opportunities and redacted audit history remain so a reviewer can see that a prior flag and deletion occurred. Project deletion is not exposed by Release 1.

## Deployment boundary

Migration 002 has been tested only against temporary databases. Do not start a SQLite-backed deployment containing important data until the migration and backup plan receive separate approval. Live OAuth/provider access is explicitly outside Release 1.
