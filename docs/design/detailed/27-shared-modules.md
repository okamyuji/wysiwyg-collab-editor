# 27共通モジュール契約

## スコープ

サーバー側の横断モジュール(logger/metrics/permissions/middleware/audit-emit/db/redis/s3/error/envelope)の契約を集約する。各章はこれらを呼び出すだけで横断責務(ログ・メトリクス・認可・監査追記・エラー応答)を満たせるようにする。

## ApiErrorと共通エンベロープ

```ts
// apps/server/src/shared/error/api-error.ts
export class ApiError extends Error {
  constructor(
    public code: string, // 'SUG-001' 等(詳細19登録簿)
    public httpStatus: number,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// apps/server/src/shared/api/envelope.ts
import { ApiError } from "../error/api-error.js";
import { Response } from "express";
import crypto from "node:crypto";

export function sendSuccess<T>(res: Response, data: T, next_cursor?: string | null) {
  res.json({
    data,
    error: null,
    meta: {
      request_id: res.req.headers["x-request-id"] ?? crypto.randomUUID(),
      trace_id: (res.req as any).trace_id ?? crypto.randomUUID(),
      next_cursor: next_cursor ?? null,
    },
  });
}

export function sendError(res: Response, err: ApiError) {
  res.status(err.httpStatus).json({
    data: null,
    error: { code: err.code, message: err.message, details: err.details },
    meta: {
      request_id: res.req.headers["x-request-id"] ?? crypto.randomUUID(),
      trace_id: (res.req as any).trace_id ?? crypto.randomUUID(),
    },
  });
}
```

## logger

```ts
// apps/server/src/shared/logger/index.ts
import pino from "pino";
import { loadEnv } from "../../config/env.js";
const env = loadEnv();

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "password",
      "password_hash",
      "*.password",
      "*.password_hash",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    remove: true,
  },
  formatters: { level: (label) => ({ level: label }) },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
```

## request_id middleware

```ts
// apps/server/src/shared/tracing/request-id.ts
import { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";

export function requestId(req: Request, res: Response, next: NextFunction) {
  const id = (req.headers["x-request-id"] as string | undefined) ?? crypto.randomUUID();
  req.headers["x-request-id"] = id;
  res.setHeader("x-request-id", id);
  (req as any).trace_id = crypto.randomUUID();
  next();
}
```

## metrics

```ts
// apps/server/src/shared/metrics/index.ts
import client from "prom-client";

client.collectDefaultMetrics();

export const otAckLatency = new client.Histogram({
  name: "ot_ack_latency_seconds",
  help: "OT ACK latency",
  buckets: [0.05, 0.1, 0.2, 0.4, 0.8, 1.6, 3.2],
});

export const restResponse = new client.Histogram({
  name: "rest_response_seconds",
  help: "REST response time",
  buckets: [0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
  labelNames: ["method", "route", "status"] as const,
});

export const wsConnectionsActive = new client.Gauge({
  name: "websocket_connections_active",
  help: "active WebSocket connections",
});

export const capacityRejectSubscribe = new client.Counter({
  name: "capacity_reject_subscribe_total",
  help: "subscribe rejects",
});
export const capacityRejectConnect = new client.Counter({
  name: "capacity_reject_connect_total",
  help: "connect rejects",
});
export const capacityRejectProxy = new client.Counter({
  name: "capacity_reject_proxy_total",
  help: "proxy-layer rejects",
});
export const cspViolation = new client.Counter({
  name: "csp_violation_total",
  help: "CSP violation reports",
});
export const revisionReachabilityViolation = new client.Counter({
  name: "revision_reachability_violation_total",
  help: "reachability invariant violations",
});
export const logDropCount = new client.Counter({
  name: "log_drop_count",
  help: "fluent-bit ring buffer drops",
});

export function getMetrics() {
  return client.register.metrics();
}
```

## permissions (ADR-0010共通モジュール)

```ts
// apps/server/src/shared/permissions/check.ts
import { Pool } from "pg";

export type PermissionLevel = "owner" | "editor" | "commenter" | "viewer";
export type ActorKind = "user" | "guest" | "system";

export interface PermissionContext {
  pool: Pool;
  document_id: string;
  actor: { kind: ActorKind; user_id?: string; guest_session_id?: string };
  required: PermissionLevel;
}

const ORDER: Record<PermissionLevel, number> = { viewer: 0, commenter: 1, editor: 2, owner: 3 };

export async function checkPermission(ctx: PermissionContext): Promise<boolean> {
  if (ctx.actor.kind === "system") return true;
  if (ctx.actor.kind === "user") {
    const r = await ctx.pool.query(
      `SELECT permission_level FROM document_permissions WHERE document_id = $1 AND user_id = $2`,
      [ctx.document_id, ctx.actor.user_id],
    );
    if (r.rowCount === 0) return false;
    return ORDER[r.rows[0].permission_level as PermissionLevel] >= ORDER[ctx.required];
  }
  // guest
  const r = await ctx.pool.query(
    `SELECT sl.permission_level FROM guest_sessions gs
       JOIN share_links sl ON sl.id = gs.share_link_id
      WHERE gs.id = $1 AND sl.document_id = $2 AND sl.revoked_at IS NULL AND sl.expires_at > now()`,
    [ctx.actor.guest_session_id, ctx.document_id],
  );
  if (r.rowCount === 0) return false;
  return ORDER[r.rows[0].permission_level as PermissionLevel] >= ORDER[ctx.required];
}
```

## audit-emit (詳細14のINSERT契約)

```ts
// apps/server/src/shared/audit-emit/index.ts
import { Pool } from "pg";
import crypto from "node:crypto";
import { canonicalize } from "canonicalize";
import { loadAuditSalts } from "../../config/secrets.js";

const ADVISORY_LOCK_KEY = 0x4155444954n; // 'AUDIT'

export interface AuditPayload {
  actor: { kind: "user" | "guest" | "system"; user_id?: string; guest_session_id?: string };
  target_kind: string;
  target_id: string;
  action: string;
  ip_address_hash?: Buffer;
  user_agent?: string;
  payload: Record<string, unknown>;
}

export async function emitAudit(pool: Pool, p: AuditPayload, currentSaltVersion: number) {
  const salts = loadAuditSalts(currentSaltVersion);
  const salt = salts.get(currentSaltVersion)!;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [ADVISORY_LOCK_KEY.toString()]);

    const seqRow = await client.query<{ next: string }>(
      `SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM audit_logs`,
    );
    const newSeq = BigInt(seqRow.rows[0].next);
    const prevRow = await client.query<{ entry_hash: Buffer }>(
      `SELECT entry_hash FROM audit_logs ORDER BY seq DESC LIMIT 1`,
    );
    const prev = prevRow.rows[0]?.entry_hash ?? Buffer.alloc(32);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const record_canonical = {
      id,
      seq: Number(newSeq),
      actor_kind: p.actor.kind,
      user_id: p.actor.user_id ?? null,
      guest_session_id: p.actor.guest_session_id ?? null,
      target_kind: p.target_kind,
      target_id: p.target_id,
      action: p.action,
      created_at: now,
      ip_address_hash: p.ip_address_hash ? p.ip_address_hash.toString("base64") : null,
      user_agent: p.user_agent ?? null,
      payload: p.payload,
      salt_version: currentSaltVersion,
    };
    const canonical = canonicalize(record_canonical)!.normalize("NFC");
    const entry_hash = crypto
      .createHmac("sha256", salt)
      .update(Buffer.concat([prev, Buffer.from(canonical)]))
      .digest();

    await client.query(
      `INSERT INTO audit_logs (id, seq, actor_kind, user_id, guest_session_id, target_kind, target_id, action,
                               ip_address_hash, user_agent, payload, salt_version, prev_hash, entry_hash, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        id,
        Number(newSeq),
        p.actor.kind,
        p.actor.user_id ?? null,
        p.actor.guest_session_id ?? null,
        p.target_kind,
        p.target_id,
        p.action,
        p.ip_address_hash ?? null,
        p.user_agent ?? null,
        p.payload,
        currentSaltVersion,
        prev,
        entry_hash,
        now,
      ],
    );
    // last_used_at更新(secret_versions)
    await client.query(
      `UPDATE secret_versions SET last_used_at = now() WHERE secret_name = 'AUDIT_HASH_SALT' AND version = $1`,
      [currentSaltVersion],
    );

    await client.query("COMMIT");
    return { id, seq: newSeq, entry_hash };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
```

## db pool

```ts
// apps/server/src/shared/db/pool.ts
import { Pool } from "pg";
import { loadEnv } from "../../config/env.js";
const env = loadEnv();
export const pool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  max: env.DB_POOL_MAX,
  ssl: env.DB_SSL_MODE === "require" ? { rejectUnauthorized: true } : false,
});

export async function withTx<T>(fn: (c: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await fn(client);
    await client.query("COMMIT");
    return r;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
```

## redis client

```ts
// apps/server/src/shared/redis/client.ts
import Redis from "ioredis";
import { loadEnv } from "../../config/env.js";
const env = loadEnv();
export const redis = new Redis(env.REDIS_URL, {
  password: env.REDIS_PASSWORD || undefined,
  tls: env.REDIS_TLS ? {} : undefined,
  enableReadyCheck: true,
  maxRetriesPerRequest: 3,
});
```

## s3 client

```ts
// apps/server/src/shared/s3/client.ts
import { S3Client } from "@aws-sdk/client-s3";
import { loadEnv } from "../../config/env.js";
const env = loadEnv();
export const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
});
```

## express共通middleware配線

```ts
// apps/server/src/main.ts
import express from "express";
import session from "express-session";
import { RedisStore } from "connect-redis";
import { doubleCsrf } from "csrf-csrf";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import RedisStoreRl from "rate-limit-redis";
import { loadEnv } from "./config/env.js";
import { logger } from "./shared/logger/index.js";
import { requestId } from "./shared/tracing/request-id.js";
import { redis } from "./shared/redis/client.js";
import { restResponse } from "./shared/metrics/index.js";
import { ApiError } from "./shared/error/api-error.js";
import { sendError } from "./shared/api/envelope.js";
// 各featureルーター import (auth, document, suggestion, ...)

const env = loadEnv();
const app = express();

app.use(requestId);
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", (req) => `'nonce-${(req as any).cspNonce}'`],
        styleSrc: ["'self'", (req) => `'nonce-${(req as any).cspNonce}'`],
        styleSrcAttr: ["'unsafe-hashes'", ...require("./styles/csp-style-hashes.json")],
        imgSrc: ["'self'", "data:", env.S3_ENDPOINT],
        connectSrc: ["'self'", `wss://${new URL(env.APP_BASE_URL).host}`],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        reportUri: ["/api/csp-report"],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(
  session({
    store: new RedisStore({ client: redis as any }),
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1209600000,
    },
  }),
);

const { doubleCsrfProtection } = doubleCsrf({
  getSecret: () => env.CSRF_SECRET,
  cookieName: "__Host-csrf",
});
app.use((req, res, next) =>
  req.path === "/api/csp-report" ? next() : doubleCsrfProtection(req, res, next),
);

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 600,
    store: new RedisStoreRl({ sendCommand: (...args) => (redis as any).call(...args) }),
  }),
);

// レスポンス計測
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const sec = Number(process.hrtime.bigint() - start) / 1e9;
    restResponse
      .labels(req.method, req.route?.path ?? req.path, String(res.statusCode))
      .observe(sec);
  });
  next();
});

// ルーター登録(各feature)
// app.use('/api/auth', authRouter)
// ...

// エラーハンドラ(最後)
app.use((err: unknown, _req, res, _next) => {
  if (err instanceof ApiError) return sendError(res, err);
  logger.error({ err }, "unhandled error");
  return sendError(res, new ApiError("API-500", 500, "Internal server error"));
});

app.listen(3000, () => logger.info("app-server listening on 3000"));
```

## エラーコード

| コード    | HTTP | 意味                       |
| --------- | ---- | -------------------------- |
| `API-500` | 500  | 想定外のサーバー内部エラー |

## テストID紐付け

| 契約ID          | 内容                                                                       | テストID  | テスト種別 | CIゲート |
| --------------- | -------------------------------------------------------------------------- | --------- | ---------- | -------- |
| SHM-CONTRACT-01 | ApiErrorからエンベロープ変換                                               | T-SHM-001 | unit       | Vitest   |
| SHM-CONTRACT-02 | request_idが応答ヘッダに含まれる                                           | T-SHM-002 | integ      | Vitest   |
| SHM-CONTRACT-03 | metricsエンドポイントがPrometheus形式                                      | T-SHM-003 | integ      | Vitest   |
| SHM-CONTRACT-04 | permissions.checkPermissionがowner/editor/commenter/viewer順序を正しく評価 | T-SHM-004 | unit       | Vitest   |
| SHM-CONTRACT-05 | emitAuditがadvisory lock下でseq単調採番                                    | T-SHM-005 | integ      | Vitest   |

## トレーサビリティ

| 対応要件                                         | 対応基本設計節 | 対応ADR                                |
| ------------------------------------------------ | -------------- | -------------------------------------- |
| NFR-04(セキュリティ)、NFR-05(監査)、NFR-07(運用) | §6、§7、§10    | ADR-0006、ADR-0010、ADR-0017、ADR-0018 |
