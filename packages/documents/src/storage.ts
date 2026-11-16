import {
  mkdir,
  link,
  readFile,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import {
  dirname,
  join,
  posix,
} from "node:path";

import type {
  DocumentStorage,
  StoredDocument,
} from "./types.ts";

function safeHash(value: string): string {
  const normalized =
    value.trim().toLowerCase();

  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error(
      "Document SHA-256 must contain exactly 64 hexadecimal characters.",
    );
  }

  return normalized;
}

function safeExtension(
  value: string,
): string {
  const normalized =
    value
      .trim()
      .toLowerCase()
      .replace(/^\.+/, "");

  if (
    !normalized ||
    !/^[a-z0-9]{1,12}$/.test(
      normalized,
    )
  ) {
    throw new Error(
      "Document extension must contain 1-12 lowercase alphanumeric characters.",
    );
  }

  return normalized;
}

/** Content-addressed key shared by every storage backend. */
export function documentStorageKey(sha256: string, extension: string): string {
  const hash = safeHash(sha256);
  return posix.join("sha256", hash.slice(0, 2), hash + "." + safeExtension(extension));
}

/** Parses and validates a content-addressed key; returns its SHA-256. */
export function parseDocumentStorageKey(storageKey: string): { sha256: string; extension: string } {
  const match = /^sha256\/([a-f0-9]{2})\/([a-f0-9]{64})\.([a-z0-9]{1,12})$/.exec(storageKey);
  if (!match || match[2]!.slice(0, 2) !== match[1]) {
    throw new Error("Invalid document storage key.");
  }
  return { sha256: match[2]!, extension: match[3]! };
}

export class FileSystemDocumentStorage
  implements DocumentStorage
{
  private readonly rootDirectory: string;

  constructor(rootDirectory: string) {
    const root = rootDirectory.trim();

    if (!root) {
      throw new Error(
        "Document storage root directory is required.",
      );
    }

    this.rootDirectory = root;
  }

  async put(input: {
    sha256: string;
    extension: string;
    data: Uint8Array;
  }): Promise<StoredDocument> {
    const sha256 = safeHash(
      input.sha256,
    );
    if (createHash("sha256").update(input.data).digest("hex") !== sha256) {
      throw new Error("Document bytes do not match the supplied SHA-256.");
    }
    const extension =
      safeExtension(
        input.extension,
      );
    const storageKey = documentStorageKey(sha256, extension);
    const absolutePath =
      join(
        this.rootDirectory,
        ...storageKey.split("/"),
      );

    await mkdir(
      dirname(absolutePath),
      {
        recursive: true,
      },
    );

    const temporaryPath = absolutePath + "." + randomUUID() + ".tmp";
    try {
      await writeFile(
        temporaryPath,
        input.data,
        {
          flag: "wx",
        },
      );
      // Publish complete bytes atomically; concurrent retries never read a partial write.
      await link(temporaryPath, absolutePath);
    } catch (error) {
      if (
        !(
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "EEXIST"
        )
      ) {
        throw error;
      }
      const existing = await readFile(absolutePath);
      if (createHash("sha256").update(existing).digest("hex") !== sha256) {
        throw new Error("Stored document failed SHA-256 integrity verification.");
      }
    } finally {
      await unlink(temporaryPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }

    return {
      storageKey,
      byteLength:
        input.data.byteLength,
    };
  }

  async get(storageKey: string): Promise<Uint8Array | null> {
    const { sha256 } = parseDocumentStorageKey(storageKey);
    let data: Buffer;
    try {
      data = await readFile(join(this.rootDirectory, ...storageKey.split("/")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    if (createHash("sha256").update(data).digest("hex") !== sha256) {
      throw new Error("Stored document failed SHA-256 integrity verification.");
    }
    return new Uint8Array(data);
  }
}
