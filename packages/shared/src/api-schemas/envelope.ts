import { z } from "zod";

export const errorEnvelope = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const metaEnvelope = z.object({
  request_id: z.string().uuid(),
  trace_id: z.string().uuid(),
  next_cursor: z.string().nullable().optional(),
});

export const successEnvelope = <T extends z.ZodType>(data: T) =>
  z.object({ data, error: z.null(), meta: metaEnvelope });

export const failureEnvelope = z.object({
  data: z.null(),
  error: errorEnvelope,
  meta: metaEnvelope,
});

export type ErrorEnvelope = z.infer<typeof errorEnvelope>;
export type MetaEnvelope = z.infer<typeof metaEnvelope>;
export type FailureEnvelope = z.infer<typeof failureEnvelope>;
