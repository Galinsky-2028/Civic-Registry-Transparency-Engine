import { createHash } from "node:crypto";

// Import the storage entry point only: the package root also loads PDF.js,
// which must stay out of web bundles that use the database package.
import {
  documentStorageKey,
  FileSystemDocumentStorage,
  parseDocumentStorageKey,
} from "@civic-registry/documents/storage";
import type {
  DocumentStorage,
  StoredDocument,
} from "@civic-registry/documents";
import type { Pool } from "pg";

/** Upper bound for one stored document; matches the PDF extraction budget. */
export const MAX_STORED_DOCUMENT_BYTES = 25 * 1024 * 1024;

const sha256Hex = (data: Uint8Array) =>
  createHash("sha256").update(data).digest("hex");

/**
 * Content-addressed document bytes in PostgreSQL. Suitable for hosts whose
 * filesystem is erased on restart (for example free Render web services).
 * Rows are immutable; reads verify SHA-256 before returning bytes.
 */
export class PostgresDocumentStorage implements DocumentStorage {
  private readonly pool: Pool;
  private readonly maxBytes: number;

  constructor(pool: Pool, maxBytes = MAX_STORED_DOCUMENT_BYTES) {
    this.pool = pool;
    this.maxBytes = maxBytes;
  }

  async put(input: {
    sha256: string;
    extension: string;
    data: Uint8Array;
  }): Promise<StoredDocument> {
    const storageKey = documentStorageKey(input.sha256, input.extension);
    const { sha256 } = parseDocumentStorageKey(storageKey);
    if (input.data.byteLength > this.maxBytes) {
      throw new Error(`Document exceeds the ${this.maxBytes}-byte storage limit.`);
    }
    if (sha256Hex(input.data) !== sha256) {
      throw new Error("Document bytes do not match the supplied SHA-256.");
    }
    const inserted = await this.pool.query(
      `INSERT INTO civic_registry_document_content
         (storage_key, sha256, byte_length, content)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (storage_key) DO NOTHING`,
      [storageKey, sha256, input.data.byteLength, Buffer.from(input.data)],
    );
    if (inserted.rowCount === 0) {
      // An existing row must hold the identical verified bytes.
      const existing = await this.get(storageKey);
      if (!existing) throw new Error("Stored document disappeared during write.");
    }
    return { storageKey, byteLength: input.data.byteLength };
  }

  async get(storageKey: string): Promise<Uint8Array | null> {
    const { sha256 } = parseDocumentStorageKey(storageKey);
    const result = await this.pool.query<{ content: Buffer; sha256: string }>(
      `SELECT content, sha256
       FROM civic_registry_document_content
       WHERE storage_key = $1`,
      [storageKey],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (row.sha256 !== sha256 || sha256Hex(row.content) !== sha256) {
      throw new Error("Stored document failed SHA-256 integrity verification.");
    }
    return new Uint8Array(row.content);
  }
}

/**
 * Selects document storage from configuration. PostgreSQL is the default so
 * retrieved evidence survives restarts on hosts without persistent disks;
 * `filesystem` requires CIVIC_REGISTRY_DOCUMENT_STORAGE_DIR on a durable mount.
 */
export function createDocumentStorage(
  pool: Pool,
  env: Record<string, string | undefined> = process.env,
): DocumentStorage {
  const backend = (env.CIVIC_REGISTRY_DOCUMENT_STORAGE ?? "postgres").trim().toLowerCase();
  if (backend === "postgres") return new PostgresDocumentStorage(pool);
  if (backend === "filesystem") {
    const directory = env.CIVIC_REGISTRY_DOCUMENT_STORAGE_DIR?.trim();
    if (!directory) {
      throw new Error("CIVIC_REGISTRY_DOCUMENT_STORAGE_DIR is required for filesystem document storage.");
    }
    return new FileSystemDocumentStorage(directory);
  }
  throw new Error("CIVIC_REGISTRY_DOCUMENT_STORAGE must be postgres or filesystem.");
}

export {
  documentStorageKey,
  parseDocumentStorageKey,
} from "@civic-registry/documents/storage";
