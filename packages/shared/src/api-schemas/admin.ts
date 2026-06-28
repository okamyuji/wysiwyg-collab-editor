import { z } from "zod";

export const adminRole = z.enum(["operations_admin", "security_admin", "cs_admin"]);

export const grantRoleReq = z.object({
  role: adminRole,
});

export const auditLogQuery = z
  .object({
    user_id: z.string().uuid().optional(),
    document_id: z.string().uuid().optional(),
    support_ticket_id: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(100),
    cursor: z.string().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.user_id && !value.document_id) {
      ctx.addIssue({ code: "custom", message: "CSO-002 user_id or document_id is required" });
    }
  });

export const rotateSecretReq = z.object({
  secret_name: z.enum([
    "AUDIT_HASH_SALT",
    "CACHE_ETAG_SECRET",
    "IP_HASH_SECRET",
    "GUEST_WS_TOKEN_SECRET",
  ]),
});
