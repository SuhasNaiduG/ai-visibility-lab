# CSV Imports

## Browser workflow

1. Create or reopen an existing crawl/comparison project.
2. Open **CSV Imports**, select the project and offline connector, and choose a `.csv` file.
3. Preview headers, up to five safe aggregate rows, row count, SHA-256 fingerprint, suggested mapping, and missing-field warnings.
4. Map required and optional canonical fields.
5. Import. Review accepted, rejected, and duplicate counts plus redacted row reasons.
6. Inspect normalized records in **Data Explorer**, Search Console rows in **Search Performance**, and generated review flags in **Opportunity Backlog**.

## Bounds and validation

- `.csv` extension and allowlisted CSV/text MIME type;
- maximum 2 MB UTF-8 request content, 10,000 data rows, 100 columns, and 10,000 characters per cell;
- BOM, CRLF/LF, escaped quotes, quoted commas, and consistent column count support;
- unique non-empty headers after normalization;
- connector-specific required mapping and one canonical field per source header;
- strict dates (`YYYY-MM-DD`), non-negative finite numbers, whole-number counts, HTTP(S) pages, and bounded rates;
- Search Console clicks cannot exceed impressions and imported CTR must align within 0.5 percentage points of clicks/impressions to allow source rounding;
- qualified leads cannot exceed total leads;
- formula-like cells beginning with `=`, `+`, `@`, or nonnumeric `-` are rejected;
- prohibited sensitive columns stop the entire import before sample values are returned.

Rejected rows store only import/project identity, row number, error code, canonical field, and a generic reason. Rejected cell values are never retained.

## Duplicate rules

Canonical normalized values are serialized with stable object-key order and hashed. Uniqueness is enforced per project and connector source on both source-record ID and normalized-record hash. Duplicates within one file or against previous imports become `DUPLICATE_RECORD` row rejections; a storage-level constraint remains as race protection.

## Deletion

Deleting an import removes only its job, redacted row rejections, exclusively owned metric records, and `opportunity_evidence` links that reference those metrics. It does not delete the project, connector source, opportunities, unrelated metrics, or audit history. The retained deletion event contains only IDs and counts.

## CSV exports

Growth exports use spreadsheet-safe cell escaping. Formula-like output is prefixed with an apostrophe before CSV quoting. JSON and Markdown remain text representations of already validated normalized records.
