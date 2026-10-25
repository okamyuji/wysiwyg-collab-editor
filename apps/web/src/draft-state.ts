import { sanitizeRichTextHtml } from "./rich-text.js";

export const draftStorageKey = "wysiwyg-collab-editor:draft";
export const commentsStorageKey = "wysiwyg-collab-editor:comments";

export type Comment = {
  id: string;
  text: string;
  createdAt: number;
};
// Comments live OUTSIDE DraftState. If they rode on the draft, a peer with no
// new comments would still broadcast `comments: []` and clobber the partner's
// additions via last-write-wins. Append-only event stream avoids this.
export type DraftState = {
  title: string;
  bodyHtml: string;
  revision: number;
  // Optional server-assigned monotonic sequence. Local edits omit it; the
  // server fills it in when accepting a draft. Receivers compare on
  // (revision, seq) so equal-Date.now() ties resolve deterministically
  // instead of silently dropping one peer's write.
  seq?: number;
};
export function safeRandomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeComments(value: unknown): Comment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): Comment[] => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as Record<string, unknown>;
    const id = typeof raw.id === "string" && raw.id.length > 0 ? raw.id : safeRandomId();
    const text = typeof raw.text === "string" ? raw.text.trim() : "";
    // Number.isFinite alone still admits values that overflow Date's range
    // (e.g. 1e20), and `new Date(...).toISOString()` then throws RangeError
    // when the comment list re-renders. Round-trip through Date to drop
    // anything Date can't represent.
    const candidate =
      typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt)
        ? raw.createdAt
        : Date.now();
    const createdAt = Number.isNaN(new Date(candidate).getTime()) ? Date.now() : candidate;
    if (text.length === 0) return [];
    return [{ id, text, createdAt }];
  });
}

export function detectLocale(languages: readonly string[] = navigator.languages): "ja" | "en" {
  const preferred = languages.find((language) => {
    const normalized = language.toLowerCase();
    return normalized.startsWith("ja") || normalized.startsWith("en");
  });
  return preferred?.toLowerCase().startsWith("ja") ? "ja" : "en";
}

// Lamport-style monotonic clock for draft revisions. The naive
// `current + 1` scheme broke cross-browser sync: if Brave's localStorage
// carried a large revision from an old session, Chrome's fresh edits
// (small revisions) were filtered out as "stale". Anchoring on Date.now()
// keeps revisions globally monotonic enough for last-write-wins; the +1
// ensures monotonicity even when the wall clock stalls or rewinds.
export function nextRevision(current: number, now: number = Date.now()): number {
  return Math.max(current + 1, now);
}

// Lexicographic compare on (revision, seq). seq is the server-assigned
// monotonic tie-breaker for equal-millisecond revisions from two peers.
// Local-only drafts have no seq yet, defaulting to 0 so the very first
// server-broadcast (seq >= 1) wins.
export function compareDraftKey(
  a: { revision: number; seq?: number },
  b: { revision: number; seq?: number },
): number {
  if (a.revision !== b.revision) return a.revision - b.revision;
  return (a.seq ?? 0) - (b.seq ?? 0);
}
export function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadStoredDraft(fallback: DraftState): DraftState {
  const storage = getBrowserStorage();
  if (!storage) return fallback;
  try {
    const stored = storage.getItem(draftStorageKey);
    if (!stored) return fallback;
    const parsed = JSON.parse(stored) as Partial<DraftState>;
    if (typeof parsed.title === "string" && typeof parsed.bodyHtml === "string") {
      // Deliberately discard any persisted revision. Carrying it across
      // sessions broke collab: a tab loading a stale revision from
      // localStorage would shadow a peer's fresh Date.now()-based edits as
      // "older". Revisions are session-local; content is what we persist.
      return {
        title: parsed.title,
        bodyHtml: sanitizeRichTextHtml(parsed.bodyHtml),
        revision: fallback.revision,
      };
    }
  } catch {
    removeStored(draftStorageKey);
  }
  return fallback;
}

export function loadStoredComments(): Comment[] {
  const storage = getBrowserStorage();
  if (!storage) return [];
  try {
    const stored = storage.getItem(commentsStorageKey);
    if (!stored) return [];
    return normalizeComments(JSON.parse(stored));
  } catch {
    removeStored(commentsStorageKey);
    return [];
  }
}

// Storage access can throw (blocked site data, private mode, quota), and the
// loaders run during state initialization, so no storage error may escape.
function removeStored(key: string): void {
  try {
    getBrowserStorage()?.removeItem(key);
  } catch {
    // Nothing to clean up when storage itself is unavailable.
  }
}

export function writeStored(key: string, value: string): boolean {
  try {
    const storage = getBrowserStorage();
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

// Must match the server's WebSocket maxPayload (apps/server/src/main.ts):
// a larger frame makes the server close the socket with 1009.
export const maxSocketMessageBytes = 1024 * 1024;

export function encodeSocketMessage(message: unknown): string | null {
  const text = JSON.stringify(message);
  return new TextEncoder().encode(text).byteLength > maxSocketMessageBytes ? null : text;
}
