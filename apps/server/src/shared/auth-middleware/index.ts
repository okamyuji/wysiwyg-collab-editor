import type { Request } from "express";

export const SESSION_COOKIE_NAME = "connect.sid";
export const GUEST_SESSION_COOKIE_NAME = "guest_session";
export const GUEST_WS_SUBPROTOCOL_PREFIX = "guest-token.";

export interface AuthenticatedSession {
  kind: "user";
  user_id: string;
}

export interface GuestSession {
  kind: "guest";
  guest_session_id: string;
}

export type AuthContext = AuthenticatedSession | GuestSession;

export interface RequestWithAuth extends Request {
  auth?: AuthContext;
}

export function parseGuestWebSocketProtocol(
  protocols: string | string[] | undefined,
): string | null {
  const values = Array.isArray(protocols)
    ? protocols
    : protocols?.split(",").map((value) => value.trim());
  const match = values?.find((value) => value.startsWith(GUEST_WS_SUBPROTOCOL_PREFIX));
  return match ? match.slice(GUEST_WS_SUBPROTOCOL_PREFIX.length) : null;
}
