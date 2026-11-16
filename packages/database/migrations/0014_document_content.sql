-- Durable content-addressed document bytes for hosts without persistent disks.
-- Rows are immutable: a storage key always names the same verified bytes.
CREATE TABLE IF NOT EXISTS civic_registry_document_content (
  storage_key TEXT PRIMARY KEY
    CHECK (storage_key ~ '^sha256/[a-f0-9]{2}/[a-f0-9]{64}\.[a-z0-9]{1,12}$'),
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
  content BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (octet_length(content) = byte_length),
  CHECK (substr(storage_key, 11, 64) = sha256 AND substr(storage_key, 8, 2) = substr(sha256, 1, 2))
);

CREATE OR REPLACE FUNCTION civic_registry_document_content_immutable()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Stored document content is immutable.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS civic_registry_document_content_no_update
  ON civic_registry_document_content;
CREATE TRIGGER civic_registry_document_content_no_update
  BEFORE UPDATE ON civic_registry_document_content
  FOR EACH ROW EXECUTE FUNCTION civic_registry_document_content_immutable();
