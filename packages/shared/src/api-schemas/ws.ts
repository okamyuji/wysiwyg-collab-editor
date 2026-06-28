import { z } from "zod";

export const wsClientHello = z.object({
  type: z.literal("hello"),
  client_session_id: z.string().uuid(),
  document_id: z.string().uuid(),
  since: z.number().int().nonnegative().optional(),
});

export const wsServerAck = z.object({
  type: z.literal("ack"),
  client_seq: z.number().int().nonnegative(),
  version: z.number().int().nonnegative(),
});

export const wsForceReload = z.object({
  type: z.literal("force_reload"),
  reason: z.enum(["ack_seq_lost", "compaction", "document_deleted", "share_link_revoked"]),
});

export const wsUnauthorized = z.object({
  type: z.literal("unauthorized"),
  close_code: z.number().int(),
  error_code: z.string(),
});
