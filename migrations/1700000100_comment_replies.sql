-- up
CREATE TABLE comment_replies (
  id UUID PRIMARY KEY,
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  author_id UUID REFERENCES users(id),
  guest_session_id UUID REFERENCES guest_sessions(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((author_id IS NULL) <> (guest_session_id IS NULL))
);

-- down
DROP TABLE IF EXISTS comment_replies;
