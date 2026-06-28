import { z } from "zod";

export const revisionSummary = z.object({
  id: z.string().uuid(),
  version_number: z.number().int().nonnegative(),
  kind: z.enum(["auto", "explicit"]),
  created_by: z.string().uuid(),
  label: z.string().nullable(),
  created_at: z.string().datetime(),
});

export const createExplicitRevisionReq = z.object({ label: z.string().min(1).max(128) });
export const restoreRevisionRes = z.object({ new_version_number: z.number().int().nonnegative() });
