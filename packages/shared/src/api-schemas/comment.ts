import { z } from "zod";

export const comment = z.object({
  id: z.string().uuid(),
  document_id: z.string().uuid(),
  anchor_start: z.number().int().nonnegative(),
  anchor_end: z.number().int().nonnegative(),
  body: z.string().min(1).max(4096),
  author_id: z.string().uuid().nullable(),
  author_guest_session_id: z.string().uuid().nullable(),
  resolved_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const createCommentReq = z
  .object({
    anchor_start: z.number().int().nonnegative(),
    anchor_end: z.number().int().nonnegative(),
    body: z.string().min(1).max(4096),
  })
  .refine((value) => value.anchor_end >= value.anchor_start, {
    message: "CMT-002 invalid anchor range",
  });

export const createCommentReplyReq = z.object({ body: z.string().min(1).max(4096) });
export const toggleResolveReq = z.object({ resolved: z.boolean() });
