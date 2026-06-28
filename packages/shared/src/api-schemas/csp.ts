import { z } from "zod";

export const cspReportPayload = z
  .object({
    "csp-report": z.object({
      "document-uri": z.string().optional(),
      "blocked-uri": z.string().optional(),
      "violated-directive": z.string().optional(),
      "effective-directive": z.string().optional(),
      "original-policy": z.string().optional(),
      "source-file": z.string().optional(),
      "line-number": z.number().optional(),
      "column-number": z.number().optional(),
    }),
  })
  .or(
    z.object({
      type: z.literal("csp-violation"),
      body: z.record(z.string(), z.unknown()),
    }),
  );
