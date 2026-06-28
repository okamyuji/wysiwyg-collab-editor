-- up
CREATE FUNCTION next_audit_seq() RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  next_seq BIGINT;
BEGIN
  PERFORM pg_advisory_xact_lock(1700000200);
  SELECT COALESCE(MAX(seq), 0) + 1 INTO next_seq FROM audit_logs;
  RETURN next_seq;
END;
$$;

-- down
DROP FUNCTION IF EXISTS next_audit_seq();
