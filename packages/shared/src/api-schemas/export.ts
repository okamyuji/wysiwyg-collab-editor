import { z } from "zod";

export const exportFormat = z.enum(["pdf", "docx", "markdown"]);
export const exportStatus = z.enum(["queued", "running", "succeeded", "failed", "cancelled"]);
export const exportFailureReason = z.enum([
  "timeout",
  "memory_exhausted",
  "render_error",
  "unsupported_format",
  "storage_unavailable",
  "cancelled_by_user",
]);

export const createExportReq = z.object({ format: exportFormat });
export const createExportRes = z.object({ export_id: z.string().uuid() });

export const getExportRes = z.object({
  export_id: z.string().uuid(),
  format: exportFormat,
  status: exportStatus,
  download_url: z.string().url().nullable(),
  failure_reason: exportFailureReason.nullable(),
  created_at: z.string().datetime(),
  finished_at: z.string().datetime().nullable(),
});
