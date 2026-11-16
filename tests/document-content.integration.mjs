import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseRegistryConfig } from "../packages/config/src/index.ts";
import { FileSystemDocumentStorage } from "../packages/documents/src/index.ts";
import {
  createDatabasePool,
  createDocumentStorage,
  PostgresDisclosureRepository,
  PostgresDocumentRepository,
  PostgresDocumentStorage,
  PostgresRecordRepository,
  PostgresRegistryConfigRepository,
  PostgresSourceRepository,
  runMigrations,
  seedRegistry,
} from "../packages/database/src/index.ts";
import { PostgresPdfAttachmentService } from "../packages/database/src/attachments.ts";
import { getDatabasePool } from "../apps/web/lib/database.ts";
import { handleApiDocumentContent } from "../apps/web/lib/public-api.ts";
import { createTextPdf } from "./helpers/pdf-fixture.mjs";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for database integration tests.");
}

const config = parseRegistryConfig(
  await readFile("examples/generic-registry/registry.yaml", "utf8"),
  { sourceName: "examples/generic-registry/registry.yaml" },
);
const seed = JSON.parse(await readFile("examples/generic-registry/seed.json", "utf8"));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

function pool() {
  return createDatabasePool({
    connectionString: databaseUrl,
    applicationName: "civic-registry-document-content-tests",
  });
}

test.after(async () => {
  await getDatabasePool().end();
});

test("PostgreSQL document storage is content-addressed, verified and immutable", async () => {
  const db = pool();
  try {
    await runMigrations(db);
    const storage = new PostgresDocumentStorage(db, 1024);
    const data = new TextEncoder().encode("%PDF-synthetic-" + Date.now());
    const digest = sha(data);

    const stored = await storage.put({ sha256: digest, extension: "PDF", data });
    assert.equal(stored.storageKey, `sha256/${digest.slice(0, 2)}/${digest}.pdf`);
    assert.equal(stored.byteLength, data.byteLength);
    assert.deepEqual(await storage.get(stored.storageKey), data);

    // Idempotent re-put of identical bytes.
    assert.deepEqual(await storage.put({ sha256: digest, extension: "pdf", data }), stored);

    await assert.rejects(
      storage.put({ sha256: "0".repeat(64), extension: "pdf", data }),
      /do not match/,
    );
    await assert.rejects(
      storage.put({ sha256: sha(new Uint8Array(2048)), extension: "pdf", data: new Uint8Array(2048) }),
      /storage limit/,
    );
    await assert.rejects(storage.get("../etc/passwd"), /Invalid document storage key/);
    assert.equal(await storage.get(`sha256/00/${"0".repeat(64)}.pdf`), null);

    await assert.rejects(
      db.query(
        "UPDATE civic_registry_document_content SET content = $2 WHERE storage_key = $1",
        [stored.storageKey, Buffer.from("tampered")],
      ),
      /immutable/,
    );
    await assert.rejects(
      db.query(
        `INSERT INTO civic_registry_document_content (storage_key, sha256, byte_length, content)
         VALUES ($1, $2, 3, 'abc')`,
        [`sha256/ff/${"a".repeat(64)}.pdf`, "a".repeat(64)],
      ),
      /check constraint/,
    );

    // Bytes altered beneath the storage layer are never returned.
    const raw = new TextEncoder().encode("%PDF-raw-" + Date.now());
    const rawDigest = sha(raw);
    const rawKey = `sha256/${rawDigest.slice(0, 2)}/${rawDigest}.pdf`;
    await db.query(
      `INSERT INTO civic_registry_document_content (storage_key, sha256, byte_length, content)
       VALUES ($1, $2, $3, $4)`,
      [rawKey, rawDigest, raw.byteLength, Buffer.from(raw.map((byte) => byte ^ 1))],
    );
    await assert.rejects(storage.get(rawKey), /integrity/);
  } finally {
    await db.end();
  }
});

test("storage backend selection defaults to PostgreSQL and validates filesystem settings", () => {
  const fake = {};
  assert.ok(createDocumentStorage(fake, {}) instanceof PostgresDocumentStorage);
  assert.ok(createDocumentStorage(fake, { CIVIC_REGISTRY_DOCUMENT_STORAGE: "postgres" }) instanceof PostgresDocumentStorage);
  assert.ok(
    createDocumentStorage(fake, {
      CIVIC_REGISTRY_DOCUMENT_STORAGE: "filesystem",
      CIVIC_REGISTRY_DOCUMENT_STORAGE_DIR: "/tmp/documents",
    }) instanceof FileSystemDocumentStorage,
  );
  assert.throws(() => createDocumentStorage(fake, { CIVIC_REGISTRY_DOCUMENT_STORAGE: "filesystem" }), /STORAGE_DIR/);
  assert.throws(() => createDocumentStorage(fake, { CIVIC_REGISTRY_DOCUMENT_STORAGE: "s3" }), /postgres or filesystem/);
});

test("public document content follows disclosure: disclosed, redacted copy, withheld", async () => {
  const db = pool();
  try {
    await runMigrations(db);
    await db.query("TRUNCATE civic_registry_configurations CASCADE");
    await seedRegistry(db, config, seed);

    const storage = new PostgresDocumentStorage(db);
    const original = createTextPdf("Original public document text " + Date.now());
    const url = "https://example.gov/reports/archived.pdf";
    const service = new PostgresPdfAttachmentService(db, storage, {
      client: {
        async fetchText() { throw new Error("unused"); },
        async fetchBytes(requested) {
          return {
            requestedUrl: requested, finalUrl: requested, contentType: "application/pdf",
            body: original, fetchedAt: "2026-11-16T10:00:00.000Z",
          };
        },
      },
    });
    const ingested = await service.ingest({
      registryId: config.registry.id,
      recordId: "example-report",
      recordTitle: "Example Annual Report",
      attachmentUrls: [url],
      allowedHosts: ["example.gov"],
      visibility: "public",
      fieldId: "summary",
      retrievedAt: "2026-11-16T10:00:00.000Z",
    });
    assert.equal(ingested.failed, 0);
    const documentId = ingested.items[0].documentId;

    const disclosed = await handleApiDocumentContent(config.registry.id, "example-report", documentId);
    assert.equal(disclosed.status, 200);
    assert.equal(disclosed.headers.get("content-type"), "application/pdf");
    assert.match(disclosed.headers.get("content-disposition"), /^attachment;/);
    assert.equal(disclosed.headers.get("x-content-type-options"), "nosniff");
    assert.match(disclosed.headers.get("content-security-policy"), /sandbox/);
    assert.deepEqual(new Uint8Array(await disclosed.arrayBuffer()), original);

    const unknown = await handleApiDocumentContent(config.registry.id, "example-report", "no-such-document");
    assert.equal(unknown.status, 404);
    const wrongRecord = await handleApiDocumentContent(config.registry.id, "missing-record", documentId);
    assert.equal(wrongRecord.status, 404);

    const configs = new PostgresRegistryConfigRepository(db);
    const records = new PostgresRecordRepository(db, configs);
    const sources = new PostgresSourceRepository(db, configs);
    const documents = new PostgresDocumentRepository(db, configs, sources);
    const disclosure = new PostgresDisclosureRepository(db, configs, records, documents);
    const redactedCopy = createTextPdf("Reviewed redacted copy " + Date.now());
    const copy = await storage.put({ sha256: sha(redactedCopy), extension: "pdf", data: redactedCopy });
    await disclosure.setDocumentDisclosure({
      registryId: config.registry.id, documentId, disposition: "redacted",
      publicStorageKey: copy.storageKey, reason: "Personal privacy",
      updatedAt: "2026-11-16T10:05:00.000Z", actorId: "reviewer-1",
    });
    const redacted = await handleApiDocumentContent(config.registry.id, "example-report", documentId);
    assert.equal(redacted.status, 200);
    assert.deepEqual(new Uint8Array(await redacted.arrayBuffer()), redactedCopy);

    await disclosure.setDocumentDisclosure({
      registryId: config.registry.id, documentId, disposition: "redacted",
      publicStorageKey: "public/not-content-addressed.pdf",
      updatedAt: "2026-11-16T10:06:00.000Z", actorId: "reviewer-1",
    });
    assert.equal((await handleApiDocumentContent(config.registry.id, "example-report", documentId)).status, 404);

    await disclosure.setDocumentDisclosure({
      registryId: config.registry.id, documentId, disposition: "withheld",
      reason: "Law enforcement sensitivity", updatedAt: "2026-11-16T10:10:00.000Z", actorId: "reviewer-1",
    });
    const withheld = await handleApiDocumentContent(config.registry.id, "example-report", documentId);
    assert.equal(withheld.status, 404);
    assert.equal((await withheld.json()).error.code, "document_content_not_available");
  } finally {
    await db.end();
  }
});
