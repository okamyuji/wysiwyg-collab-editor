import type { Pool } from "pg";

export type PermissionLevel = "owner" | "editor" | "commenter" | "viewer";
export type ActorKind = "user" | "guest" | "system";

export interface PermissionActor {
  kind: ActorKind;
  user_id?: string;
  guest_session_id?: string;
}

export interface PermissionContext {
  pool: Pool;
  document_id: string;
  actor: PermissionActor;
  required: PermissionLevel;
}

const ORDER: Record<PermissionLevel, number> = {
  viewer: 0,
  commenter: 1,
  editor: 2,
  owner: 3,
};

function permits(actual: PermissionLevel, required: PermissionLevel): boolean {
  return ORDER[actual] >= ORDER[required];
}

export async function checkPermission(ctx: PermissionContext): Promise<boolean> {
  if (ctx.actor.kind === "system") return true;

  if (ctx.actor.kind === "user") {
    if (!ctx.actor.user_id) return false;
    const result = await ctx.pool.query<{ permission_level: PermissionLevel }>(
      `SELECT permission_level
         FROM document_permissions
        WHERE document_id = $1
          AND user_id = $2`,
      [ctx.document_id, ctx.actor.user_id],
    );
    const permission = result.rows[0]?.permission_level;
    return permission ? permits(permission, ctx.required) : false;
  }

  if (!ctx.actor.guest_session_id) return false;
  const result = await ctx.pool.query<{ permission_level: PermissionLevel }>(
    `SELECT sl.permission_level
       FROM guest_sessions gs
       JOIN share_links sl ON sl.id = gs.share_link_id
      WHERE gs.id = $1
        AND sl.document_id = $2
        AND sl.revoked_at IS NULL
        AND sl.expires_at > now()`,
    [ctx.actor.guest_session_id, ctx.document_id],
  );
  const permission = result.rows[0]?.permission_level;
  return permission ? permits(permission, ctx.required) : false;
}
