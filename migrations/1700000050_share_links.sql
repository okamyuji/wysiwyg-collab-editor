-- up
CREATE TABLE share_links (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  permission_level TEXT NOT NULL CHECK (permission_level IN ('viewer', 'commenter')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at <= created_at + INTERVAL '30 days')
);

-- down
DROP TABLE IF EXISTS share_links;
