import { type ClipboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { sanitizeRichTextHtml } from "./rich-text.js";

const draftStorageKey = "wysiwyg-collab-editor:draft";
const draftChannelName = "wysiwyg-collab-editor:draft-sync";
const presenceChannelName = "wysiwyg-collab-editor:presence";
const presenceTimeoutMs = 15_000;
const presenceHeartbeatMs = 5_000;

type PresenceMessage =
  | { kind: "hello"; id: string }
  | { kind: "heartbeat"; id: string }
  | { kind: "bye"; id: string };

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
type DraftState = {
  title: string;
  bodyHtml: string;
  revision: number;
};

export function detectLocale(languages: readonly string[] = navigator.languages): Locale {
  const preferred = languages.find((language) => {
    const normalized = language.toLowerCase();
    return normalized.startsWith("ja") || normalized.startsWith("en");
  });
  return preferred?.toLowerCase().startsWith("ja") ? "ja" : "en";
}

function textToHtml(text: string) {
  const escaped = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return escaped.replaceAll("\n", "<br>");
}

function textFromHtml(html: string) {
  const element = document.createElement("div");
  element.innerHTML = html;
  return element.textContent ?? "";
}

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined" || typeof window.BroadcastChannel === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function loadStoredDraft(fallback: DraftState): DraftState {
  const storage = getBrowserStorage();
  if (!storage) return fallback;
  const stored = storage.getItem(draftStorageKey);
  if (!stored) return fallback;
  try {
    const parsed = JSON.parse(stored) as Partial<DraftState>;
    if (typeof parsed.title === "string" && typeof parsed.bodyHtml === "string") {
      return {
        title: parsed.title,
        bodyHtml: sanitizeRichTextHtml(parsed.bodyHtml),
        revision: typeof parsed.revision === "number" ? parsed.revision : fallback.revision,
      };
    }
  } catch {
    storage.removeItem(draftStorageKey);
  }
  return fallback;
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
  const [draft, setDraft] = useState<DraftState>(fallbackDraft);
  const [activePanel, setActivePanel] = useState<PanelKey>("comments");
  const [savedAt, setSavedAt] = useState<string>(t.notSaved);
  const [shareEnabled, setShareEnabled] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("PDF");
  const [exportStatus, setExportStatus] = useState("");
  const [collaboratorCount, setCollaboratorCount] = useState(1);
  const editorRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const bodyText = useMemo(() => textFromHtml(draft.bodyHtml), [draft.bodyHtml]);
  const wordCount = useMemo(() => {
    return bodyText.trim().split(/\s+/).filter(Boolean).length;
  }, [bodyText]);

  useEffect(() => {
    setDraft(loadStoredDraft(fallbackDraft));
  }, [fallbackDraft]);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.innerHTML !== draft.bodyHtml) {
      editor.innerHTML = draft.bodyHtml;
    }
  }, [draft.bodyHtml]);

  useEffect(() => {
    if (typeof window.BroadcastChannel === "undefined") return undefined;
    const channel = new BroadcastChannel(draftChannelName);
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent<DraftState>) => {
      setDraft((current) => (event.data.revision > current.revision ? event.data : current));
    };

    function onStorage(event: StorageEvent) {
      if (event.key !== draftStorageKey || !event.newValue) return;
      try {
        const parsed = JSON.parse(event.newValue) as DraftState;
        const next = { ...parsed, bodyHtml: sanitizeRichTextHtml(parsed.bodyHtml) };
        setDraft((current) => (next.revision > current.revision ? next : current));
      } catch {
        getBrowserStorage()?.removeItem(draftStorageKey);
      }
    }

    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      channel.close();
      channelRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window.BroadcastChannel === "undefined") return undefined;
    // ponytail: BroadcastChannel only counts same-browser tabs. Real cross-device
    // presence ships with the WebSocket server in ADR-0015; until then this is
    // honest about how many editors are visible.
    const selfId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const peers = new Map<string, number>();
    peers.set(selfId, Date.now());
    const channel = new BroadcastChannel(presenceChannelName);
    const recompute = () => {
      const cutoff = Date.now() - presenceTimeoutMs;
      for (const [id, lastSeen] of peers) {
        if (lastSeen < cutoff && id !== selfId) peers.delete(id);
      }
      setCollaboratorCount(Math.max(1, peers.size));
    };
    channel.onmessage = (event: MessageEvent<PresenceMessage>) => {
      const message = event.data;
      if (message.id === selfId) return;
      if (message.kind === "bye") {
        peers.delete(message.id);
      } else {
        peers.set(message.id, Date.now());
        if (message.kind === "hello") {
          channel.postMessage({ kind: "heartbeat", id: selfId } satisfies PresenceMessage);
        }
      }
      recompute();
    };
    const sayHello = () => {
      peers.set(selfId, Date.now());
      channel.postMessage({ kind: "hello", id: selfId } satisfies PresenceMessage);
      recompute();
    };
    sayHello();
    const heartbeat = window.setInterval(() => {
      peers.set(selfId, Date.now());
      channel.postMessage({ kind: "heartbeat", id: selfId } satisfies PresenceMessage);
      recompute();
    }, presenceHeartbeatMs);
    // Browsers throttle setInterval in hidden tabs down to ~1/min, so a
    // backgrounded peer can miss the 15s timeout. Re-broadcasting hello on
    // visibility/focus regain lets others re-discover us without the count
    // flapping.
    const onVisible = () => {
      if (document.visibilityState === "visible") sayHello();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", sayHello);
    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", sayHello);
      try {
        channel.postMessage({ kind: "bye", id: selfId } satisfies PresenceMessage);
      } catch {
        // channel already closed
      }
      channel.close();
    };
  }, []);

  function publish(next: DraftState) {
    getBrowserStorage()?.setItem(draftStorageKey, JSON.stringify(next));
    channelRef.current?.postMessage(next);
  }

  function updateDraft(partial: Omit<Partial<DraftState>, "revision">) {
    setDraft((current) => {
      const next = { ...current, ...partial, revision: current.revision + 1 };
      publish(next);
      return next;
    });
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
              <label className="field-label" htmlFor="comment-note">
                {t.newComment}
              </label>
              <input id="comment-note" placeholder={t.commentPlaceholder} />
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
