-- up
INSERT INTO secret_versions(id, secret_name, version, key_material)
VALUES (gen_random_uuid(), 'AUDIT_HASH_SALT', 1, decode('0000000000000000000000000000000000000000000000000000000000000000', 'hex'))
ON CONFLICT (secret_name, version) DO NOTHING;

-- down
DELETE FROM secret_versions WHERE secret_name = 'AUDIT_HASH_SALT' AND version = 1;
