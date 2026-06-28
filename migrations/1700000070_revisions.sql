-- up
CREATE TABLE revisions (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version BIGINT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (version >= 0),
  UNIQUE (document_id, version)
);

-- down
DROP TABLE IF EXISTS revisions;
