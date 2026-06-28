-- up
CREATE TABLE comments (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  author_id UUID REFERENCES users(id),
  guest_session_id UUID REFERENCES guest_sessions(id),
  anchor JSONB NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((author_id IS NULL) <> (guest_session_id IS NULL))
);

-- down
DROP TABLE IF EXISTS comments;
