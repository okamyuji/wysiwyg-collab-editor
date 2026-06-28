import { type ClipboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { sanitizeRichTextHtml } from "./rich-text.js";

const draftStorageKey = "wysiwyg-collab-editor:draft";
const commentsStorageKey = "wysiwyg-collab-editor:comments";
const draftSocketPath = "/ws/draft";
const reconnectDelayMs = 2_000;

// Same-origin WS, both dev and prod. In dev the Vite plugin attaches the
// collab WebSocketServer to Vite's own HTTP server so the browser never has
// to cross origins (Brave shields, proxy churn, and helmet headers all stop
// being a factor). VITE_COLLAB_WS_URL overrides for niche deployments.
function resolveDraftSocketUrl(): string {
  const override = import.meta.env.VITE_COLLAB_WS_URL;
  if (typeof override === "string" && override.length > 0) return override;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${draftSocketPath}`;
}

type ServerMessage =
  | { type: "presence"; count: number }
  | { type: "snapshot"; data: DraftState }
  | { type: "draft"; data: DraftState }
  | { type: "comment"; data: Comment }
  | { type: "comments"; data: Comment[] };

const messages = {
  en: {
    brand: "WYSIWYG Collab",
    saved: "Saved",
    notSaved: "Not saved",
    saveDraft: "Save draft",
    online: "Online",
    collaborator: (count: number) => (count === 1 ? "1 collaborator" : `${count} collaborators`),
    workspaceNav: "Workspace",
    workspace: "Editor workspace",
    documentTools: "Document tools",
    comments: "Comments",
    share: "Share",
    export: "Export",
    documentTitle: "Document title",
    body: "Body",
    titleDefault: "Launch plan",
    bodyDefault:
      "Write the first collaborative document here. Changes are tracked as a shared online draft in this scaffold.",
    word: "word",
    words: "words",
    localScaffold: "Online collaboration scaffold",
    toolPanel: "Tool panel",
    newComment: "New comment",
    addComment: "Add comment",
    commentEmpty: "No comments yet.",
    commentPlaceholder: "Add a review note",
    shareToggle: "Anyone with link can view",
    format: "Format",
    exportDocument: "Export document",
    exported: "Exported",
    exportFailed: "Export failed",
    toolbar: "Formatting toolbar",
    bold: "Bold",
    italic: "Italic",
    underline: "Underline",
    highlight: "Highlight",
    panel: {
      comments: {
        title: "Comments",
        body: "Resolve reviewer notes without leaving the editor.",
      },
      share: {
        title: "Share",
        body: "Create viewer or commenter links with clear expiry.",
      },
      export: {
        title: "Export",
        body: "Queue PDF, DOCX, or Markdown output from the current version.",
      },
    },
  },
  ja: {
    brand: "WYSIWYG Collab",
    saved: "保存済み",
    notSaved: "未保存",
    saveDraft: "下書きを保存",
    online: "オンライン",
    collaborator: (count: number) => `共同編集中 ${count} 名`,
    workspaceNav: "ワークスペース",
    workspace: "エディターワークスペース",
    documentTools: "文書ツール",
    comments: "コメント",
    share: "共有",
    export: "エクスポート",
    documentTitle: "文書タイトル",
    body: "本文",
    titleDefault: "リリース計画",
    bodyDefault:
      "共同編集する最初の文書をここに入力します。このスキャフォールドでは変更をオンライン下書きとして同期します。",
    word: "語",
    words: "語",
    localScaffold: "オンライン共同編集スキャフォールド",
    toolPanel: "ツールパネル",
    newComment: "新しいコメント",
    addComment: "コメントを追加",
    commentEmpty: "コメントはまだありません。",
    commentPlaceholder: "レビューコメントを追加",
    shareToggle: "リンクを知っている全員が閲覧可能",
    format: "形式",
    exportDocument: "文書をエクスポート",
    exported: "エクスポート済み",
    exportFailed: "エクスポート失敗",
    toolbar: "装飾ツールバー",
    bold: "太字",
    italic: "斜体",
    underline: "下線",
    highlight: "ハイライト",
    panel: {
      comments: {
        title: "コメント",
        body: "エディターから離れずにレビューコメントを確認できます。",
      },
      share: {
        title: "共有",
        body: "有効期限が明確な閲覧・コメント用リンクを作成します。",
      },
      export: {
        title: "エクスポート",
        body: "現在の版から PDF、DOCX、Markdown の出力をキューに入れます。",
      },
    },
  },
} as const;

type Locale = keyof typeof messages;
type PanelKey = keyof (typeof messages)["en"]["panel"];
type ExportFormat = "PDF" | "DOCX" | "Markdown";
export type Comment = {
  id: string;
  text: string;
  createdAt: number;
};
// Comments live OUTSIDE DraftState. If they rode on the draft, a peer with no
// new comments would still broadcast `comments: []` and clobber the partner's
// additions via last-write-wins. Append-only event stream avoids this.
type DraftState = {
  title: string;
  bodyHtml: string;
  revision: number;
  // Optional server-assigned monotonic sequence. Local edits omit it; the
  // server fills it in when accepting a draft. Receivers compare on
  // (revision, seq) so equal-Date.now() ties resolve deterministically
  // instead of silently dropping one peer's write.
  seq?: number;
};

function safeRandomId(): string {
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
    const candidate = typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now();
    const createdAt = Number.isNaN(new Date(candidate).getTime()) ? Date.now() : candidate;
    if (text.length === 0) return [];
    return [{ id, text, createdAt }];
  });
}

export function detectLocale(languages: readonly string[] = navigator.languages): Locale {
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

function textToHtml(text: string) {
  const escaped = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return escaped.replaceAll("\n", "<br>");
}

function textFromHtml(html: string) {
  // String-only transformation: strip tags and decode the few entities the
  // sanitizer emits. No DOM API touched, so CodeQL has no taint path to
  // worry about. Acceptable here because the input passes through
  // sanitizeRichTextHtml at every entry point and uses a tiny tag allowlist.
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function getBrowserStorage(): Storage | null {
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
  const stored = storage.getItem(draftStorageKey);
  if (!stored) return fallback;
  try {
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
    storage.removeItem(draftStorageKey);
  }
  return fallback;
}

export function loadStoredComments(): Comment[] {
  const storage = getBrowserStorage();
  if (!storage) return [];
  const stored = storage.getItem(commentsStorageKey);
  if (!stored) return [];
  try {
    return normalizeComments(JSON.parse(stored));
  } catch {
    storage.removeItem(commentsStorageKey);
    return [];
  }
}

export function App() {
  const locale = detectLocale();
  const t = messages[locale];
  const fallbackDraft = useMemo<DraftState>(
    () => ({
      title: t.titleDefault,
      bodyHtml: textToHtml(t.bodyDefault),
      revision: 1,
    }),
    [t.bodyDefault, t.titleDefault],
  );
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [draft, setDraft] = useState<DraftState>(fallbackDraft);
  const [activePanel, setActivePanel] = useState<PanelKey>("comments");
  const [savedAt, setSavedAt] = useState<string>(t.notSaved);
  const [shareEnabled, setShareEnabled] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("PDF");
  const [exportStatus, setExportStatus] = useState("");
  const [collaboratorCount, setCollaboratorCount] = useState(1);
  const editorRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  // Mirrors of the latest state for use in WS callbacks. The replay-on-open
  // path needs them but reads them outside any render closure.
  const draftRef = useRef<DraftState>(fallbackDraft);
  const commentsRef = useRef<Comment[]>([]);
  const sentDraftRevisionRef = useRef(0);
  const sentCommentIdsRef = useRef<Set<string>>(new Set());

  const bodyText = useMemo(() => textFromHtml(draft.bodyHtml), [draft.bodyHtml]);
  const wordCount = useMemo(() => {
    return bodyText.trim().split(/\s+/).filter(Boolean).length;
  }, [bodyText]);

  useEffect(() => {
    setDraft(loadStoredDraft(fallbackDraft));
    setComments(loadStoredComments());
  }, [fallbackDraft]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    commentsRef.current = comments;
  }, [comments]);

  useEffect(() => {
    getBrowserStorage()?.setItem(commentsStorageKey, JSON.stringify(comments));
  }, [comments]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    // Sink-side sanitize through DOMPurify, then mount via replaceChildren
    // on inert nodes — no innerHTML setter on an attached element, no
    // script execution. draft.bodyHtml is already sanitized upstream;
    // running through the same barrier here keeps CodeQL satisfied.
    const safe = sanitizeRichTextHtml(draft.bodyHtml);
    if (editor.innerHTML === safe) return;
    const parsed = new DOMParser().parseFromString(safe, "text/html");
    editor.replaceChildren(...Array.from(parsed.body.childNodes));
  }, [draft.bodyHtml]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.WebSocket === "undefined") return undefined;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let disposed = false;

    function applyIncomingDraft(data: DraftState) {
      const next: DraftState = {
        ...data,
        bodyHtml: sanitizeRichTextHtml(data.bodyHtml),
      };
      setDraft((current) => (compareDraftKey(next, current) > 0 ? next : current));
    }

    function applyIncomingComment(incoming: Comment) {
      const safe = normalizeComments([incoming])[0];
      if (!safe) return;
      setComments((current) => (current.some((c) => c.id === safe.id) ? current : [...current, safe]));
    }

    function applyIncomingComments(incoming: Comment[]) {
      const safe = normalizeComments(incoming);
      if (safe.length === 0) return;
      setComments((current) => {
        const seen = new Set(current.map((c) => c.id));
        const merged = [...current];
        for (const c of safe) if (!seen.has(c.id)) merged.push(c);
        return merged;
      });
    }

    function flushPending(ws: WebSocket) {
      if (ws.readyState !== WebSocket.OPEN) return;
      // Replay any draft/comment changes that were typed while the socket
      // was CONNECTING or closed for reconnect. Without this, work made in
      // those windows is persisted locally but never reaches peers.
      const currentDraft = draftRef.current;
      if (currentDraft.revision > sentDraftRevisionRef.current) {
        ws.send(JSON.stringify({ type: "draft", data: currentDraft }));
        sentDraftRevisionRef.current = currentDraft.revision;
      }
      for (const c of commentsRef.current) {
        if (!sentCommentIdsRef.current.has(c.id)) {
          ws.send(JSON.stringify({ type: "comment", data: c }));
          sentCommentIdsRef.current.add(c.id);
        }
      }
    }

    function connect() {
      const ws = new WebSocket(resolveDraftSocketUrl());
      socket = ws;
      socketRef.current = ws;
      ws.onopen = () => flushPending(ws);
      ws.onmessage = (event) => {
        let message: ServerMessage;
        try {
          message = JSON.parse(event.data) as ServerMessage;
        } catch {
          return;
        }
        if (message.type === "presence") {
          setCollaboratorCount(Math.max(1, message.count));
        } else if (message.type === "draft" || message.type === "snapshot") {
          applyIncomingDraft(message.data);
        } else if (message.type === "comment") {
          applyIncomingComment(message.data);
        } else if (message.type === "comments") {
          applyIncomingComments(message.data);
        }
      };
      ws.onclose = () => {
        // Identity check: in React StrictMode the first effect's socket gets
        // closed AFTER the second effect has already installed a new socket
        // in socketRef. Unguarded `socketRef.current = null` would clobber
        // the live socket; the publish() path would then silently no-op and
        // every keystroke vanish — the exact symptom users reported.
        if (socketRef.current === ws) socketRef.current = null;
        if (!disposed) {
          setCollaboratorCount(1);
          reconnectTimer = window.setTimeout(connect, reconnectDelayMs);
        }
      };
      ws.onerror = () => {
        ws.close();
      };
    }

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      // Do NOT null socketRef here. The cleanup runs synchronously between
      // strict-mode mount cycles; if we clear it the *next* mount's
      // assignment is still safe, but the *previous* socket's onclose fires
      // asynchronously afterwards and would mis-clear the new socket. We
      // rely on the identity check in onclose instead.
      socket?.close();
    };
  }, []);

  function publish(next: DraftState) {
    getBrowserStorage()?.setItem(draftStorageKey, JSON.stringify(next));
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "draft", data: next }));
      sentDraftRevisionRef.current = next.revision;
    }
    // If socket isn't OPEN yet, flushPending() will pick this up on the next
    // open/reconnect because we only update sentDraftRevisionRef after a
    // successful send.
  }

  function updateDraft(partial: Omit<Partial<DraftState>, "revision">) {
    setDraft((current) => {
      const next = { ...current, ...partial, revision: nextRevision(current.revision) };
      publish(next);
      return next;
    });
  }

  function submitComment() {
    const text = commentDraft.trim();
    if (text.length === 0) return;
    const newComment: Comment = { id: safeRandomId(), text, createdAt: Date.now() };
    // Optimistic local append. Server echoes back; the receive path dedupes
    // by id so this is idempotent.
    setComments((current) => (current.some((c) => c.id === newComment.id) ? current : [...current, newComment]));
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "comment", data: newComment }));
      sentCommentIdsRef.current.add(newComment.id);
    }
    // If socket isn't OPEN yet, flushPending() will replay this on reconnect
    // because it's not in sentCommentIdsRef.
    setCommentDraft("");
  }

  function onEditorInput() {
    updateDraft({ bodyHtml: sanitizeRichTextHtml(editorRef.current?.innerHTML ?? "") });
  }

  function onEditorPaste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
  }

  function applyCommand(command: "bold" | "italic" | "underline" | "backColor") {
    editorRef.current?.focus();
    document.execCommand(command, false, command === "backColor" ? "#fff4a3" : undefined);
    onEditorInput();
  }

  function saveDraft() {
    setSavedAt(
      new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date()),
    );
  }

  async function exportDocument() {
    try {
      const { createExportBlob, exportFilename } = await import("./exporters.js");
      const blob = await createExportBlob(draft, exportFormat);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = exportFilename(draft.title, exportFormat);
      link.click();
      URL.revokeObjectURL(url);
      setExportStatus(`${t.exported}: ${exportFormat}`);
    } catch {
      setExportStatus(t.exportFailed);
    }
  }

  return (
    <main className="app-shell">
      <nav className="topbar" aria-label={t.workspaceNav}>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            W
          </span>
          <span>{t.brand}</span>
        </div>
        <div className="topbar-actions">
          <span className="presence-pill" data-testid="presence-status">
            {t.online} · {t.collaborator(collaboratorCount)}
          </span>
          <span className="sync-status" data-testid="sync-status">
            {t.saved}: {savedAt}
          </span>
          <button className="primary-action" type="button" onClick={saveDraft}>
            {t.saveDraft}
          </button>
        </div>
      </nav>

      <section className="workspace" aria-label={t.workspace}>
        <aside className="rail" aria-label={t.documentTools}>
          <button
            aria-pressed={activePanel === "comments"}
            className="rail-button"
            type="button"
            onClick={() => setActivePanel("comments")}
          >
            {t.comments}
          </button>
          <button
            aria-pressed={activePanel === "share"}
            className="rail-button"
            type="button"
            onClick={() => setActivePanel("share")}
          >
            {t.share}
          </button>
          <button
            aria-pressed={activePanel === "export"}
            className="rail-button"
            type="button"
            onClick={() => setActivePanel("export")}
          >
            {t.export}
          </button>
        </aside>

        <article className="editor-card">
          <label id="document-title-label" className="field-label" htmlFor="document-title">
            {t.documentTitle}
          </label>
          <input
            id="document-title"
            className="title-input"
            data-testid="document-title"
            value={draft.title}
            onChange={(event) => updateDraft({ title: event.target.value })}
          />

          <div className="format-toolbar" aria-label={t.toolbar}>
            <button
              aria-label={t.bold}
              className="format-button"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyCommand("bold")}
            >
              B
            </button>
            <button
              aria-label={t.italic}
              className="format-button"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyCommand("italic")}
            >
              I
            </button>
            <button
              aria-label={t.underline}
              className="format-button"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyCommand("underline")}
            >
              U
            </button>
            <button
              aria-label={t.highlight}
              className="format-button"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyCommand("backColor")}
            >
              H
            </button>
          </div>

          <label className="field-label" htmlFor="document-body">
            {t.body}
          </label>
          <div
            id="document-body"
            ref={editorRef}
            aria-label={t.body}
            className="body-input rich-editor"
            contentEditable
            data-testid="document-body"
            role="textbox"
            suppressContentEditableWarning
            onInput={onEditorInput}
            onPaste={onEditorPaste}
          />

          <footer className="editor-meta">
            <span>
              {wordCount} {wordCount === 1 ? t.word : t.words}
            </span>
            <span>{t.localScaffold}</span>
          </footer>
        </article>

        <aside className="side-panel" aria-live="polite" data-testid="side-panel">
          <p className="eyebrow">{t.toolPanel}</p>
          <h1>{t.panel[activePanel].title}</h1>
          <p>{t.panel[activePanel].body}</p>

          {activePanel === "comments" && (
            <div className="panel-control">
              <ul className="comment-list" data-testid="comment-list">
                {comments.length === 0 ? (
                  <li className="comment-empty" data-testid="comment-empty">
                    {t.commentEmpty}
                  </li>
                ) : (
                  comments.map((comment) => (
                    <li key={comment.id} className="comment-item" data-testid="comment-item">
                      <p className="comment-text">{comment.text}</p>
                      <time className="comment-time" dateTime={new Date(comment.createdAt).toISOString()}>
                        {new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(
                          new Date(comment.createdAt),
                        )}
                      </time>
                    </li>
                  ))
                )}
              </ul>
              <label className="field-label" htmlFor="comment-note">
                {t.newComment}
              </label>
              <input
                id="comment-note"
                data-testid="comment-input"
                placeholder={t.commentPlaceholder}
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    submitComment();
                  }
                }}
              />
              <button
                className="secondary-action"
                data-testid="comment-submit"
                type="button"
                onClick={submitComment}
              >
                {t.addComment}
              </button>
            </div>
          )}

          {activePanel === "share" && (
            <label className="toggle-row" htmlFor="share-toggle">
              <input
                id="share-toggle"
                checked={shareEnabled}
                type="checkbox"
                onChange={(event) => setShareEnabled(event.target.checked)}
              />
              {t.shareToggle}
            </label>
          )}

          {activePanel === "export" && (
            <div className="panel-control">
              <label className="field-label" htmlFor="export-format">
                {t.format}
              </label>
              <select
                id="export-format"
                value={exportFormat}
                onChange={(event) => setExportFormat(event.target.value as ExportFormat)}
              >
                <option>PDF</option>
                <option>DOCX</option>
                <option>Markdown</option>
              </select>
              <button
                className="secondary-action"
                data-testid="export-button"
                type="button"
                onClick={exportDocument}
              >
                {t.exportDocument}
              </button>
              <p className="export-status" data-testid="export-status">
                {exportStatus}
              </p>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
