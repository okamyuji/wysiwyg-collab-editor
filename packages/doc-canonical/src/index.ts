export type AuditActorKind = "user" | "guest" | "system";

export interface AuditRecordCanonical {
  id: string;
  seq: number;
  actor_kind: AuditActorKind;
  user_id: string | null;
  guest_session_id: string | null;
  target_kind: string;
  target_id: string | null;
  action: string;
  created_at: string;
  ip_address_hash: string | null;
  user_agent: string | null;
  payload: Record<string, unknown>;
  salt_version: number;
}

export const AUDIT_RECORD_CANONICAL_KEYS = [
  "id",
  "seq",
  "actor_kind",
  "user_id",
  "guest_session_id",
  "target_kind",
  "target_id",
  "action",
  "created_at",
  "ip_address_hash",
  "user_agent",
  "payload",
  "salt_version",
] as const;

export const ZERO_256_HASH_HEX = "0000000000000000000000000000000000000000000000000000000000000000";

function canonicalizeValue(value: unknown): string {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (typeof value === "string") {
    return JSON.stringify(value.normalize("NFC"));
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeValue(item)).join(",")}]`;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key.normalize("NFC"))}:${canonicalizeValue(record[key])}`).join(",")}}`;
  }

  throw new TypeError("Unsupported value for canonical JSON");
}

export function buildAuditRecordCanonical(record: AuditRecordCanonical): AuditRecordCanonical {
  return {
    id: record.id,
    seq: record.seq,
    actor_kind: record.actor_kind,
    user_id: record.user_id,
    guest_session_id: record.guest_session_id,
    target_kind: record.target_kind,
    target_id: record.target_id,
    action: record.action,
    created_at: record.created_at,
    ip_address_hash: record.ip_address_hash,
    user_agent: record.user_agent,
    payload: record.payload,
    salt_version: record.salt_version,
  };
}

export function canonicalizeAuditRecord(record: AuditRecordCanonical): string {
  return canonicalizeValue(buildAuditRecordCanonical(record)).normalize("NFC");
}
