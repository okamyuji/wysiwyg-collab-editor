import { EnvConfigError } from "./env.js";

const AUDIT_SALT_PREFIX = "AUDIT_HASH_SALT_v";
const MIN_SECRET_BYTES = 32;

export function loadAuditSalts(
  currentVersion: number,
  source: NodeJS.ProcessEnv = process.env,
): Map<number, string> {
  if (!Number.isInteger(currentVersion) || currentVersion < 1) {
    throw new EnvConfigError("ENV-002", "AUDIT_CURRENT_SALT_VERSION must be a positive integer", {
      currentVersion,
    });
  }

  const salts = new Map<number, string>();
  for (const [key, value] of Object.entries(source)) {
    if (!key.startsWith(AUDIT_SALT_PREFIX) || value == null) continue;

    const version = Number.parseInt(key.slice(AUDIT_SALT_PREFIX.length), 10);
    if (!Number.isInteger(version) || version < 1) continue;
    if (Buffer.byteLength(value, "utf8") < MIN_SECRET_BYTES) {
      throw new EnvConfigError("ENV-003", `${key} must be at least 32 bytes`, { key });
    }
    salts.set(version, value);
  }

  if (!salts.has(currentVersion)) {
    throw new EnvConfigError("ENV-002", `${AUDIT_SALT_PREFIX}${currentVersion} missing`, {
      currentVersion,
    });
  }

  return salts;
}
