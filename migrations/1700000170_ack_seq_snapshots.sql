-- up
CREATE TABLE ack_seq_snapshots (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_or_guest TEXT NOT NULL,
  client_session_id TEXT NOT NULL,
  ack_seq BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, user_or_guest, client_session_id)
);

-- down
DROP TABLE IF EXISTS ack_seq_snapshots;
