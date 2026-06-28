import crypto from "node:crypto";
import canonicalize from "canonicalize";
import type { Pool } from "pg";

import { loadAuditSalts } from "../../config/secrets.js";

export const AUDIT_ADVISORY_LOCK_KEY = 0x4155444954n;
const ZERO_256 = Buffer.alloc(32);

export type AuditActor =
  | { kind: "user"; user_id: string; guest_session_id?: never }
  | { kind: "guest"; guest_session_id: string; user_id?: never }
  | { kind: "system"; user_id?: never; guest_session_id?: never };

export interface AuditPayload {
  actor: AuditActor;
  target_kind: string;
  target_id: string | null;
  action: string;
  ip_address_hash?: Buffer;
  user_agent?: string;
  payload: Record<string, unknown>;
}

export interface AuditEmitResult {
  id: string;
  seq: bigint;
  entry_hash: Buffer;
}

interface AuditCanonicalRecord {
  id: string;
  seq: number;
  actor_kind: AuditActor["kind"];
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

function canonicalString(record: AuditCanonicalRecord): string {
  const canonical = canonicalize(record);
  if (!canonical) throw new Error("Failed to canonicalize audit record");
  return canonical.normalize("NFC");
}

export async function emitAudit(
  pool: Pool,
  auditPayload: AuditPayload,
  currentSaltVersion: number,
): Promise<AuditEmitResult> {
  const salts = loadAuditSalts(currentSaltVersion);
  const salt = salts.get(currentSaltVersion);
  if (!salt) throw new Error(`AUDIT_HASH_SALT_v${currentSaltVersion} missing`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [AUDIT_ADVISORY_LOCK_KEY.toString()]);

    const seqRow = await client.query<{ next: string }>(
      "SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM audit_logs",
    );
    const newSeq = BigInt(seqRow.rows[0]?.next ?? "1");
    const prevRow = await client.query<{ entry_hash: Buffer }>(
      "SELECT entry_hash FROM audit_logs ORDER BY seq DESC LIMIT 1",
    );
    const prevHash = prevRow.rows[0]?.entry_hash ?? ZERO_256;

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const canonicalRecord: AuditCanonicalRecord = {
      id,
      seq: Number(newSeq),
      actor_kind: auditPayload.actor.kind,
      user_id: auditPayload.actor.kind === "user" ? auditPayload.actor.user_id : null,
      guest_session_id:
        auditPayload.actor.kind === "guest" ? auditPayload.actor.guest_session_id : null,
      target_kind: auditPayload.target_kind,
      target_id: auditPayload.target_id,
      action: auditPayload.action,
      created_at: createdAt,
      ip_address_hash: auditPayload.ip_address_hash?.toString("base64") ?? null,
      user_agent: auditPayload.user_agent ?? null,
      payload: auditPayload.payload,
      salt_version: currentSaltVersion,
    };

    const entryHash = crypto
      .createHmac("sha256", salt)
      .update(Buffer.concat([prevHash, Buffer.from(canonicalString(canonicalRecord))]))
      .digest();

    await client.query(
      `INSERT INTO audit_logs (
         id, seq, actor_kind, user_id, guest_session_id, target_kind, target_id, action,
         ip_address_hash, user_agent, payload, salt_version, prev_hash, entry_hash, created_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        id,
        Number(newSeq),
        auditPayload.actor.kind,
        canonicalRecord.user_id,
        canonicalRecord.guest_session_id,
        auditPayload.target_kind,
        auditPayload.target_id,
        auditPayload.action,
        auditPayload.ip_address_hash ?? null,
        auditPayload.user_agent ?? null,
        auditPayload.payload,
        currentSaltVersion,
        prevHash,
        entryHash,
        createdAt,
      ],
    );
    await client.query(
      `UPDATE secret_versions
          SET last_used_at = now()
        WHERE secret_name = 'AUDIT_HASH_SALT'
          AND version = $1`,
      [currentSaltVersion],
    );

    await client.query("COMMIT");
    return { id, seq: newSeq, entry_hash: entryHash };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
