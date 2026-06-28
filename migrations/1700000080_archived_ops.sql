-- up
CREATE TABLE archived_ops (
  id UUID PRIMARY KEY,
  revision_id UUID NOT NULL REFERENCES revisions(id) ON DELETE CASCADE,
  ops JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- down
DROP TABLE IF EXISTS archived_ops;
