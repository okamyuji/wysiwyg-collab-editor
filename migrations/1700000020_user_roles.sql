-- up
CREATE TABLE user_roles (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('standard', 'operations_admin', 'cs_admin')),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by UUID REFERENCES users(id)
);
CREATE UNIQUE INDEX user_roles_unique_active ON user_roles(user_id, role);

-- down
DROP INDEX IF EXISTS user_roles_unique_active;
DROP TABLE IF EXISTS user_roles;
