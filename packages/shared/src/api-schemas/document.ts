import { z } from "zod";

export const permissionLevel = z.enum(["owner", "editor", "commenter", "viewer"]);

export const documentSummary = z.object({
  id: z.string().uuid(),
  title: z.string().max(256),
  owner_id: z.string().uuid(),
  permission_level: permissionLevel,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  deleted_at: z.string().datetime().nullable(),
});

export const createDocumentReq = z.object({ title: z.string().min(1).max(256) });
export const createDocumentRes = z.object({ document_id: z.string().uuid() });

export const listDocumentsQuery = z.object({
  cursor: z.string().nullable().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(50),
  owner: z.string().uuid().optional(),
});

export const listDocumentsRes = z.object({
  documents: z.array(documentSummary),
});

export const patchDocumentReq = z.object({ title: z.string().min(1).max(256) });
export const restoreDocumentRes = z.object({ document_id: z.string().uuid() });
export const changeOwnerReq = z.object({ new_owner_id: z.string().uuid() });
