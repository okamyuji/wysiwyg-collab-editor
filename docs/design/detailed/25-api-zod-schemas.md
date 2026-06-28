# 25 API zodスキーマ

## スコープ

全REST API入出力スキーマをzodで定義し `packages/shared/src/api-schemas/` で管理する。クライアントとサーバーが同一スキーマを参照することで契約と実装が一体化、TypeScript型は自動派生する。

## 共通エンベロープ

```ts
// packages/shared/src/api-schemas/envelope.ts
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

export const successEnvelope = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ data, error: z.null(), meta: metaEnvelope });

export const failureEnvelope = z.object({
  data: z.null(),
  error: errorEnvelope,
  meta: metaEnvelope,
});
```

## auth (詳細03)

```ts
// packages/shared/src/api-schemas/auth.ts
import { z } from "zod";

export const registerReq = z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).max(256),
  display_name: z.string().min(1).max(64),
});
export const registerRes = z.object({ user_id: z.string().uuid() });

export const loginReq = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export const loginRes = z.object({ user_id: z.string().uuid(), display_name: z.string() });

export const passwordResetRequestReq = z.object({ email: z.string().email() });
export const passwordResetConfirmReq = z.object({
  token: z.string().min(32),
  new_password: z.string().min(12).max(256),
});

export const meRes = z.object({
  user_id: z.string().uuid(),
  email: z.string().email(),
  display_name: z.string(),
  color_hex: z.string().regex(/^#[0-9a-f]{6}$/i),
  avatar_url: z.string().url().nullable(),
  locale: z.enum(["ja", "en"]),
  roles: z.array(z.enum(["standard", "operations_admin", "security_admin", "cs_admin"])),
});

export const updateMeReq = z.object({
  display_name: z.string().min(1).max(64).optional(),
  color_hex: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional(),
  locale: z.enum(["ja", "en"]).optional(),
});
```

## document (詳細11)

```ts
// packages/shared/src/api-schemas/document.ts
import { z } from "zod";

export const documentSummary = z.object({
  id: z.string().uuid(),
  title: z.string().max(256),
  owner_id: z.string().uuid(),
  permission_level: z.enum(["owner", "editor", "commenter", "viewer"]),
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
```

## suggestion (詳細05)

```ts
// packages/shared/src/api-schemas/suggestion.ts
import { z } from "zod";

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
  delta: z.record(z.string(), z.unknown()), // Quill Delta(JSONB)
  status: suggestionStatus,
  applied_version: z.number().int().nonnegative().nullable(),
  optimistic_version: z.number().int().nonnegative(),
  created_at: z.string().datetime(),
  status_changed_at: z.string().datetime().nullable(),
});

export const createSuggestionReq = z.object({
  base_version: z.number().int().nonnegative(),
  delta: z
    .record(z.string(), z.unknown())
    .refine((d) => Buffer.byteLength(JSON.stringify(d), "utf-8") <= 65536, {
      message: "SUG-004 Delta exceeds 64KB",
    }),
});
export const acceptSuggestionReq = z.object({
  optimistic_version: z.number().int().nonnegative(),
});
export const rejectSuggestionReq = z.object({
  optimistic_version: z.number().int().nonnegative(),
});
```

## comment (詳細05b)

```ts
// packages/shared/src/api-schemas/comment.ts
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
  .refine((v) => v.anchor_end >= v.anchor_start, { message: "CMT-002 invalid anchor range" });

export const createCommentReplyReq = z.object({ body: z.string().min(1).max(4096) });
export const toggleResolveReq = z.object({ resolved: z.boolean() });
```

## version (詳細06)

```ts
// packages/shared/src/api-schemas/version.ts
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
```

## export (詳細07)

```ts
// packages/shared/src/api-schemas/export.ts
import { z } from "zod";

export const exportFormat = z.enum(["pdf", "docx", "markdown"]);
export const exportStatus = z.enum(["queued", "running", "succeeded", "failed", "cancelled"]);

export const createExportReq = z.object({ format: exportFormat });
export const createExportRes = z.object({ export_id: z.string().uuid() });

export const getExportRes = z.object({
  export_id: z.string().uuid(),
  format: exportFormat,
  status: exportStatus,
  download_url: z.string().url().nullable(),
  failure_reason: z
    .enum([
      "timeout",
      "memory_exhausted",
      "render_error",
      "unsupported_format",
      "storage_unavailable",
      "cancelled_by_user",
    ])
    .nullable(),
  created_at: z.string().datetime(),
  finished_at: z.string().datetime().nullable(),
});
```

## image (詳細08)

```ts
// packages/shared/src/api-schemas/image.ts
import { z } from "zod";

export const imageRes = z.object({
  image_id: z.string().uuid(),
  storage_key: z.string(),
  mime_type: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  thumbnails: z.object({
    size_1280: z.string(),
    size_640: z.string(),
    size_320: z.string(),
  }),
  signed_url: z.string().url(),
});
```

## share-link (詳細09)

```ts
// packages/shared/src/api-schemas/share-link.ts
import { z } from "zod";

export const createShareLinkReq = z
  .object({
    link_kind: z.enum(["restricted", "anyone"]),
    permission_level: z.enum(["viewer", "commenter"]),
    expires_at: z.string().datetime(),
  })
  .refine((v) => new Date(v.expires_at).getTime() - Date.now() <= 30 * 24 * 3600 * 1000, {
    message: "SHR-003 expires must be within 30 days",
  });

export const createShareLinkRes = z.object({
  link_id: z.string().uuid(),
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  share_url: z.string().url(),
});
```

## admin (詳細12)

```ts
// packages/shared/src/api-schemas/admin.ts
import { z } from "zod";

export const grantRoleReq = z.object({
  role: z.enum(["operations_admin", "security_admin", "cs_admin"]),
});

export const auditLogQuery = z
  .object({
    user_id: z.string().uuid().optional(),
    document_id: z.string().uuid().optional(),
    support_ticket_id: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(100),
    cursor: z.string().nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.user_id && !v.document_id) {
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
```

## csp (詳細13)

```ts
// packages/shared/src/api-schemas/csp.ts
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
```

## WebSocketメッセージ

```ts
// packages/shared/src/api-schemas/ws.ts
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
```

## エンドポイント↔スキーマ対応表

| メソッド | パス                                                  | リクエスト                   | レスポンス                                             |
| -------- | ----------------------------------------------------- | ---------------------------- | ------------------------------------------------------ |
| POST     | `/api/auth/register`                                  | `registerReq`                | `successEnvelope(registerRes)`                         |
| POST     | `/api/auth/login`                                     | `loginReq`                   | `successEnvelope(loginRes)`                            |
| POST     | `/api/auth/logout`                                    | (なし)                       | `successEnvelope(z.object({}))`                        |
| POST     | `/api/auth/password-reset/request`                    | `passwordResetRequestReq`    | `successEnvelope(z.object({}))`                        |
| POST     | `/api/auth/password-reset/confirm`                    | `passwordResetConfirmReq`    | `successEnvelope(z.object({}))`                        |
| GET      | `/api/users/me`                                       | (なし)                       | `successEnvelope(meRes)`                               |
| PATCH    | `/api/users/me`                                       | `updateMeReq`                | `successEnvelope(meRes)`                               |
| GET      | `/api/documents`                                      | (query) `listDocumentsQuery` | `successEnvelope(listDocumentsRes)`                    |
| POST     | `/api/documents`                                      | `createDocumentReq`          | `successEnvelope(createDocumentRes)`                   |
| GET      | `/api/documents/:id`                                  | (なし)                       | `successEnvelope(documentSummary)`                     |
| PATCH    | `/api/documents/:id`                                  | `patchDocumentReq`           | `successEnvelope(documentSummary)`                     |
| DELETE   | `/api/documents/:id`                                  | (なし)                       | `successEnvelope(z.object({}))`                        |
| POST     | `/api/documents/:id/restore`                          | (なし)                       | `successEnvelope(restoreDocumentRes)`                  |
| PATCH    | `/api/documents/:id/owner`                            | `changeOwnerReq`             | `successEnvelope(documentSummary)`                     |
| POST     | `/api/documents/:id/comments`                         | `createCommentReq`           | `successEnvelope(comment)`                             |
| POST     | `/api/documents/:id/comments/:commentId/replies`      | `createCommentReplyReq`      | `successEnvelope(z.object({}))`                        |
| PATCH    | `/api/documents/:id/comments/:commentId`              | `toggleResolveReq`           | `successEnvelope(comment)`                             |
| POST     | `/api/documents/:id/suggestions`                      | `createSuggestionReq`        | `successEnvelope(suggestion)`                          |
| POST     | `/api/documents/:id/suggestions/:suggestionId/accept` | `acceptSuggestionReq`        | `successEnvelope(suggestion)`                          |
| POST     | `/api/documents/:id/suggestions/:suggestionId/reject` | `rejectSuggestionReq`        | `successEnvelope(suggestion)`                          |
| POST     | `/api/documents/:id/revisions`                        | `createExplicitRevisionReq`  | `successEnvelope(revisionSummary)`                     |
| POST     | `/api/documents/:id/revisions/:revisionId/restore`    | (なし)                       | `successEnvelope(restoreRevisionRes)`                  |
| POST     | `/api/documents/:id/images`                           | (multipart/form-data)        | `successEnvelope(imageRes)`                            |
| POST     | `/api/documents/:id/exports`                          | `createExportReq`            | `successEnvelope(createExportRes)`                     |
| GET      | `/api/exports/:exportId`                              | (なし)                       | `successEnvelope(getExportRes)`                        |
| DELETE   | `/api/exports/:exportId`                              | (なし)                       | `successEnvelope(z.object({}))`                        |
| POST     | `/api/documents/:id/share-links`                      | `createShareLinkReq`         | `successEnvelope(createShareLinkRes)`                  |
| DELETE   | `/api/documents/:id/share-links/:linkId`              | (なし)                       | `successEnvelope(z.object({}))`                        |
| POST     | `/api/admin/users/:id/roles`                          | `grantRoleReq`               | `successEnvelope(z.object({}))`                        |
| GET      | `/api/admin/audit-logs`                               | (query) `auditLogQuery`      | `successEnvelope(z.object({entries: z.array(...)}))`   |
| POST     | `/api/admin/secret-versions/:secret_name/rotate`      | `rotateSecretReq`            | `successEnvelope(z.object({new_version: z.number()}))` |
| POST     | `/api/csp-report`                                     | `cspReportPayload`           | 204                                                    |
| GET      | `/api/healthz`                                        | (なし)                       | `200 OK` plaintext                                     |

## サーバー側middleware契約

```ts
// apps/server/src/shared/api/validate.ts
import { ZodSchema } from "zod";
import { Request, Response, NextFunction } from "express";
import { ApiError } from "../error/api-error.js";

export function validate<T>(schema: ZodSchema<T>, source: "body" | "query" | "params") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(new ApiError("API-002", 400, "Invalid request format", result.error.format()));
    }
    (req as any).validated = { ...(req as any).validated, [source]: result.data };
    next();
  };
}
```

## エラーコード(本章固有なし、`API-` を使用)

## テストID紐付け

| 契約ID          | 内容                                     | テストID  | テスト種別 | CIゲート      |
| --------------- | ---------------------------------------- | --------- | ---------- | ------------- |
| ZOD-CONTRACT-01 | 不正なJSONで400 API-002                  | T-ZOD-001 | integ      | Vitest        |
| ZOD-CONTRACT-02 | 全エンドポイントがスキーマと一致         | T-ZOD-002 | meta       | contract test |
| ZOD-CONTRACT-03 | クライアント・サーバーで同一スキーマ参照 | T-ZOD-003 | unit       | Vitest        |

## トレーサビリティ

| 対応要件                          | 対応基本設計節 | 対応ADR  |
| --------------------------------- | -------------- | -------- |
| NFR-04(入力検証)、NFR-09(API契約) | §4             | ADR-0010 |
