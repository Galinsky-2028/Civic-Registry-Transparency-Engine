import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FileSystemDocumentStorage } from "../packages/documents/src/storage.ts";
test("content-addressed storage rejects mismatched bytes and detects corrupt retries", async () => {
  const root = await mkdtemp(join(tmpdir(), "storage-integrity-"));
  try {
    const storage = new FileSystemDocumentStorage(root);
    const data = new TextEncoder().encode("synthetic evidence");
    const sha256 = createHash("sha256").update(data).digest("hex");
    await assert.rejects(storage.put({ sha256: "a".repeat(64), data, extension: "pdf" }), /do not match/);
    const first = await storage.put({ sha256, data, extension: "pdf" });
    const simultaneous = await Promise.all(Array.from({ length: 10 }, () =>
      storage.put({ sha256, data, extension: "pdf" })));
    simultaneous.forEach((entry) => assert.deepEqual(entry, first));
    assert.deepEqual(await storage.put({ sha256, data, extension: "pdf" }), first);
    const path = join(root, first.storageKey);
    await writeFile(path, "corrupted");
    await assert.rejects(storage.put({ sha256, data, extension: "pdf" }), /integrity verification/);
    assert.equal(await readFile(path, "utf8"), "corrupted", "do not silently overwrite corrupt evidence");
    await assert.rejects(storage.put({ sha256, data, extension: "../../escape" }), /extension/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("filesystem reads verify content and keys are strictly content-addressed", async () => {
  const { documentStorageKey, parseDocumentStorageKey } = await import("../packages/documents/src/storage.ts");
  const root = await mkdtemp(join(tmpdir(), "storage-read-"));
  try {
    const storage = new FileSystemDocumentStorage(root);
    const data = new TextEncoder().encode("synthetic readable evidence");
    const sha256 = createHash("sha256").update(data).digest("hex");
    const stored = await storage.put({ sha256, data, extension: "pdf" });
    assert.equal(stored.storageKey, documentStorageKey(sha256, ".PDF"));
    assert.deepEqual(parseDocumentStorageKey(stored.storageKey), { sha256, extension: "pdf" });
    assert.deepEqual(await storage.get(stored.storageKey), data);
    assert.equal(await storage.get(documentStorageKey("b".repeat(64), "pdf")), null);
    const wrongPrefix = sha256.startsWith("00") ? "11" : "00";
    for (const key of ["../x", `sha256/${wrongPrefix}/${sha256}.pdf`, `sha256/${sha256.slice(0, 2)}/${sha256}.p/df`]) {
      assert.throws(() => parseDocumentStorageKey(key), /Invalid document storage key/);
    }
    await writeFile(join(root, stored.storageKey), "corrupted");
    await assert.rejects(storage.get(stored.storageKey), /integrity verification/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
