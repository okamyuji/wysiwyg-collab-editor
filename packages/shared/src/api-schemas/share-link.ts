import { z } from "zod";
import { SHR_EXPIRES_MAX_DAYS } from "../constants/index.js";

const maxShareLinkAgeMs = SHR_EXPIRES_MAX_DAYS * 24 * 3600 * 1000;

export const createShareLinkReq = z
  .object({
    link_kind: z.enum(["restricted", "anyone"]),
    permission_level: z.enum(["viewer", "commenter"]),
    expires_at: z.string().datetime(),
  })
  .refine((value) => new Date(value.expires_at).getTime() - Date.now() <= maxShareLinkAgeMs, {
    message: "SHR-003 expires must be within 30 days",
  });

export const createShareLinkRes = z.object({
  link_id: z.string().uuid(),
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  share_url: z.string().url(),
});
