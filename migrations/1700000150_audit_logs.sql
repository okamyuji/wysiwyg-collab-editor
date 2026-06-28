-- up
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  seq BIGSERIAL UNIQUE,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('user', 'guest', 'system')),
  actor_id UUID,
  target_kind TEXT NOT NULL,
  target_id UUID NOT NULL,
  action TEXT NOT NULL,
  payload JSONB NOT NULL,
  salt_version INTEGER NOT NULL,
  prev_hash BYTEA,
  hash BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((actor_kind = 'system' AND actor_id IS NULL) OR (actor_kind <> 'system' AND actor_id IS NOT NULL))
);

-- down
DROP TABLE IF EXISTS audit_logs;
