# PDF attachment ingestion and extraction

The engine provides generic document-ingestion primitives for public PDF
attachments.

The architecture is:

```text
source adapter row
  -> attachment URL allowlist
  -> hardened binary fetch
  -> SHA-256 content hash
  -> PDF signature validation
  -> content-addressed storage
  -> PDF text extraction
  -> Source + Document + Citation evidence records
  -> ordinary history/search/integrity behavior
```

## Generic document package

`@civic-registry/documents` provides:

- a generic `DocumentStorage` interface;
- content-addressed filesystem storage;
- deterministic SHA-256 storage keys;
- PDF signature validation;
- PDF text extraction with `pdfjs-dist`;
- page-by-page extracted text;
- extractor/version metadata;
- extracted-text SHA-256; and
- extraction warnings.

The storage interface is replaceable so deployments can add object storage or
other durable backends without changing evidence records.

## Safe binary retrieval

Binary fetching uses the same protections as text source retrieval:

- HTTPS for non-local sources;
- per-adapter host allowlists;
- rejection of loopback/private/link-local/reserved destinations;
- redirect revalidation;
- request timeout;
- response-size caps; and
- deterministic provenance metadata.

A remote content-type header is advisory. PDF processing still requires a real
PDF signature.

## Content-addressed storage

Every backend uses the same content-addressed key:

```text
sha256/<first-two-hash-characters>/<full-sha256>.pdf
```

Repeated identical bytes are idempotent. Changed bytes at the same source URL
create a new immutable document version while preserving earlier evidence.

Two backends are provided, selected by `createDocumentStorage(pool)`:

- **PostgreSQL** (default, `CIVIC_REGISTRY_DOCUMENT_STORAGE=postgres`):
  immutable rows in `civic_registry_document_content` (migration 0014), with
  constraints binding key, digest and length, a 25 MiB per-document limit, and
  SHA-256 verification on every write and read. Suitable for hosts without a
  persistent disk; storage counts against the database plan.
- **Filesystem** (`CIVIC_REGISTRY_DOCUMENT_STORAGE=filesystem` plus
  `CIVIC_REGISTRY_DOCUMENT_STORAGE_DIR=/persistent/path`): atomic,
  integrity-checked files. The directory must be on durable storage.

## Command line

```bash
pnpm db:ingest-attachments <registry-id> <record-id> <allowed-host[,host]> <https-url>...
```

Retrieves the listed PDFs for one existing record through the hardened public
source client (HTTPS, allowlisted hosts, DNS-pinned connections, size limits),
stores them with the configured backend, extracts text and creates public
citations (`CIVIC_REGISTRY_ATTACHMENT_VISIBILITY=private` keeps them private).
It prints per-URL results and exits non-zero if any attachment failed.

## Public archived copies

`GET /api/v1/registries/{registryId}/records/{recordId}/documents/{documentId}/content`
serves the stored bytes of a document cited by a public record, under the same
disclosure filtering as the evidence endpoint: disclosed documents return the
original, redacted documents return only the reviewed redacted copy
(`publicStorageKey`), and withheld, uncited or unarchived documents return 404.
Responses are attachments with `nosniff`, a sandbox Content-Security-Policy and
the SHA-256 as ETag. The public evidence page links to the copy when one exists.

## Evidence model

For each retrieved attachment, the generic attachment service can materialize:

- a `Source` representing the public URL;
- a versioned `Document` representing exact retrieved bytes;
- a PDF extraction record; and
- a `Citation` linking the document to a configured registry record/field.

Application-specific decisions about which URLs to fetch and which canonical
field, if any, should be enriched from extracted text remain downstream.

## OCR boundary

The built-in extractor handles textual PDFs. Scanned documents with no
extractable text retain explicit warnings. OCR is intentionally a separate
capability so its extractor identity and provenance can be recorded.

## Tests

Engine tests use generated PDFs and synthetic public URLs. They verify:

- extraction;
- content-addressed storage;
- safe binary retrieval;
- evidence materialization;
- idempotency;
- changed-content version preservation; and
- cryptographic integrity after evidence changes.
