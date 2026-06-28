-- up
CREATE TABLE secret_versions (
  id UUID PRIMARY KEY,
  secret_name TEXT NOT NULL,
  version INTEGER NOT NULL,
  key_material BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ GENERATED ALWAYS AS (created_at + INTERVAL '90 days') STORED,
  UNIQUE (secret_name, version)
);

-- down
DROP TABLE IF EXISTS secret_versions;
