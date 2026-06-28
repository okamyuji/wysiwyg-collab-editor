-- up
CREATE TABLE export_jobs (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(id),
  format TEXT NOT NULL CHECK (format IN ('pdf', 'docx', 'markdown')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  worker_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'running' AND worker_id IS NOT NULL) OR (status <> 'running' AND worker_id IS NULL))
);

-- down
DROP TABLE IF EXISTS export_jobs;
