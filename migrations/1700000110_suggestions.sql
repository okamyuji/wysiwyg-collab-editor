-- up
CREATE TABLE suggestions (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id),
  author_id UUID NOT NULL REFERENCES users(id),
  base_version BIGINT NOT NULL,
  delta JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepting', 'accepted', 'rejected', 'stale', 'expired')),
  applied_version BIGINT,
  optimistic_version BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status_changed_at TIMESTAMPTZ,
  status_changed_by UUID REFERENCES users(id),
  CONSTRAINT applied_version_only_when_accepted
    CHECK ((status = 'accepted' AND applied_version IS NOT NULL) OR (status <> 'accepted' AND applied_version IS NULL)),
  CONSTRAINT delta_size_64kb CHECK (octet_length(delta::text) <= 65536)
);
CREATE INDEX idx_suggestions_hot ON suggestions(document_id, status, created_at DESC);
CREATE INDEX idx_suggestions_rebase ON suggestions(document_id, status, base_version);

-- down
DROP INDEX IF EXISTS idx_suggestions_rebase;
DROP INDEX IF EXISTS idx_suggestions_hot;
DROP TABLE IF EXISTS suggestions;
