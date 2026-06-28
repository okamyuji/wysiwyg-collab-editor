interface RichTextState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  highlight: boolean;
}

const allowedTags = new Set(["B", "BR", "DIV", "EM", "I", "MARK", "P", "SPAN", "STRONG", "U"]);

export function sanitizeRichTextHtml(html: string) {
  // Parse into an inert document so scripts never execute and the tree is
  // never attached to the live DOM. The sanitizer walks this tree and
  // rebuilds output from an allowlist; nothing from the parsed input ever
  // reaches a live sink. CodeQL accepts DOMParser where it flags
  // `template.innerHTML = html`.
  const doc = new DOMParser().parseFromString(html, "text/html");
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
