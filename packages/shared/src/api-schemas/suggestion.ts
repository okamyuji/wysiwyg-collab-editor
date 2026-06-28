import { z } from "zod";
import { SUG_DELTA_MAX_BYTES } from "../constants/index.js";
import { quillDelta } from "../delta-types/index.js";

const encodedByteLength = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;

export const suggestionStatus = z.enum([
  "pending",
  "accepting",
  "accepted",
  "rejected",
  "stale",
  "expired",
]);

export const suggestion = z.object({
  id: z.string().uuid(),
  document_id: z.string().uuid(),
  author_id: z.string().uuid(),
  base_version: z.number().int().nonnegative(),
  delta: quillDelta,
  status: suggestionStatus,
  applied_version: z.number().int().nonnegative().nullable(),
  optimistic_version: z.number().int().nonnegative(),
  created_at: z.string().datetime(),
  status_changed_at: z.string().datetime().nullable(),
});

export const createSuggestionReq = z.object({
  base_version: z.number().int().nonnegative(),
  delta: quillDelta.refine((delta) => encodedByteLength(delta) <= SUG_DELTA_MAX_BYTES, {
    message: "SUG-004 Delta exceeds 64KB",
  }),
});

export const acceptSuggestionReq = z.object({
  optimistic_version: z.number().int().nonnegative(),
});

export const rejectSuggestionReq = z.object({
  optimistic_version: z.number().int().nonnegative(),
});
