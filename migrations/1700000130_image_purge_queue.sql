-- up
CREATE TABLE image_purge_queue (
  id UUID PRIMARY KEY,
  original_image_id UUID REFERENCES images(id) ON DELETE SET NULL,
  storage_key TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (storage_key, original_image_id)
);

-- down
DROP TABLE IF EXISTS image_purge_queue;
