-- up
CREATE SCHEMA sharedb;
CREATE TABLE sharedb.ops (
  collection TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  version BIGINT NOT NULL,
  operation JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (collection, doc_id, version)
);
CREATE TABLE sharedb.snapshots (
  collection TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  version BIGINT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (collection, doc_id)
);

-- down
DROP TABLE IF EXISTS sharedb.snapshots;
DROP TABLE IF EXISTS sharedb.ops;
DROP SCHEMA IF EXISTS sharedb;
