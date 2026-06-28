import DOMPurify, { type Config as PurifyConfig } from "dompurify";

interface RichTextState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  highlight: boolean;
}

const allowedTags = new Set(["B", "BR", "DIV", "EM", "I", "MARK", "P", "SPAN", "STRONG", "U"]);
// DOMPurify already neutralizes javascript: URLs, expressions, and unsafe
// css inside style attributes. The walker that runs after purify only reads
// `style.backgroundColor` for highlight detection — everything else is
// ignored — so a permissive ALLOWED_ATTR is safe here.
const purifyConfig: PurifyConfig = {
  ALLOWED_TAGS: ["b", "br", "div", "em", "i", "mark", "p", "span", "strong", "u"],
  ALLOWED_ATTR: ["style"],
  RETURN_TRUSTED_TYPE: false,
};

export function sanitizeRichTextHtml(html: string) {
  // DOMPurify is a CodeQL-recognized sanitizer barrier. After purify the
  // string contains only allowlisted tags; the DOMParser walk that follows
  // is on already-trusted markup, so the parse-then-rebuild pipeline does
  // not propagate any taint to a DOM sink.
  const purified = DOMPurify.sanitize(html, purifyConfig);
  const doc = new DOMParser().parseFromString(purified, "text/html");
  const segments: Array<RichTextState & { text: string }> = [];
  collectSegments(
    doc.body,
    { bold: false, italic: false, underline: false, highlight: false },
    segments,
  );
  return segments
    .map((segment) => {
      if (segment.text === "\n") return "<br>";
      let safe = escapeHtml(segment.text);
      if (segment.highlight) safe = `<mark>${safe}</mark>`;
      if (segment.underline) safe = `<u>${safe}</u>`;
      if (segment.italic) safe = `<em>${safe}</em>`;
      if (segment.bold) safe = `<strong>${safe}</strong>`;
      return safe;
    })
    .join("");
}

function collectSegments(
  node: Node,
  inherited: RichTextState,
  segments: Array<RichTextState & { text: string }>,
) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      segments.push({ ...inherited, text: child.textContent ?? "" });
      continue;
    }
    if (!(child instanceof HTMLElement) || !allowedTags.has(child.tagName)) continue;
    if (child.tagName === "BR") {
      segments.push({ ...inherited, text: "\n" });
      continue;
    }
    collectSegments(
      child,
      {
        bold: inherited.bold || child.tagName === "B" || child.tagName === "STRONG",
        italic: inherited.italic || child.tagName === "I" || child.tagName === "EM",
        underline: inherited.underline || child.tagName === "U",
        highlight:
          inherited.highlight ||
          child.tagName === "MARK" ||
          Boolean(child.style.backgroundColor && child.style.backgroundColor !== "transparent"),
      },
      segments,
    );
    if (child.tagName === "DIV" || child.tagName === "P") {
      segments.push({ ...inherited, text: "\n" });
    }
  }
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
