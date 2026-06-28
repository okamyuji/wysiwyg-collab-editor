import fontkit from "@pdf-lib/fontkit";
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
  UnderlineType,
  type IRunOptions,
} from "docx";
import { PDFDocument, rgb } from "pdf-lib";
import notoSansJpRegularUrl from "@expo-google-fonts/noto-sans-jp/400Regular/NotoSansJP_400Regular.ttf?url";

export type ExportFormat = "PDF" | "DOCX" | "Markdown";

export interface DraftExportInput {
  title: string;
  bodyHtml: string;
}

interface RichSegment {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  highlight: boolean;
}

const allowedTags = new Set(["B", "BR", "DIV", "EM", "I", "MARK", "P", "SPAN", "STRONG", "U"]);

export function sanitizeRichTextHtml(html: string) {
  return segmentsToHtml(htmlToSegments(html));
}

export async function createExportBlob(draft: DraftExportInput, format: ExportFormat) {
  const safeDraft = {
    title: draft.title,
    bodyHtml: sanitizeRichTextHtml(draft.bodyHtml),
  };
  if (format === "PDF") return createPdfBlob(safeDraft);
  if (format === "DOCX") return createDocxBlob(safeDraft);
  return createMarkdownBlob(safeDraft);
}

export function exportFilename(title: string, format: ExportFormat) {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ぁ-んァ-ヶ一-龠ー]+/giu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const extension = format === "PDF" ? "pdf" : format === "DOCX" ? "docx" : "md";
  return `${base || "document"}.${extension}`;
}

async function createPdfBlob(draft: DraftExportInput) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fontBytes = await fetch(notoSansJpRegularUrl).then((response) => response.arrayBuffer());
  // ponytail: subset:false because @pdf-lib/fontkit drops CJK glyphs when subsetting.
  // Upgrade path: pre-subset the font offline (pyftsubset) and re-enable subset:true.
  const font = await pdf.embedFont(fontBytes, { subset: false });
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 54;
  const maxLineWidth = pageWidth - margin * 2;
  let page = pdf.addPage([pageWidth, pageHeight]);
  let cursorY = pageHeight - margin;

  const drawLine = (segments: RichSegment[], size: number) => {
    let cursorX = margin;
    for (const segment of segments) {
      if (!segment.text) continue;
      const width = font.widthOfTextAtSize(segment.text, size);
      if (segment.highlight) {
        page.drawRectangle({
          x: cursorX - 1,
          y: cursorY - 2,
          width: width + 2,
          height: size + 4,
          color: rgb(1, 0.96, 0.64),
        });
      }
      page.drawText(segment.text, {
        x: cursorX,
        y: cursorY,
        size,
        font,
        color: rgb(0.06, 0.13, 0.2),
      });
      if (segment.bold) {
        page.drawText(segment.text, {
          x: cursorX + 0.35,
          y: cursorY,
          size,
          font,
          color: rgb(0.06, 0.13, 0.2),
        });
      }
      if (segment.underline) {
        page.drawLine({
          start: { x: cursorX, y: cursorY - 2 },
          end: { x: cursorX + width, y: cursorY - 2 },
          thickness: 0.75,
          color: rgb(0.06, 0.13, 0.2),
        });
      }
      cursorX += width;
    }
    cursorY -= size + 9;
    if (cursorY < margin) {
      page = pdf.addPage([pageWidth, pageHeight]);
      cursorY = pageHeight - margin;
    }
  };

  for (const line of wrapSegmentsByWidth(
    [{ text: draft.title, bold: true, italic: false, underline: false, highlight: false }],
    font,
    20,
    maxLineWidth,
  )) {
    drawLine(line, 20);
  }
  cursorY -= 12;
  for (const line of wrapSegmentsByWidth(htmlToSegments(draft.bodyHtml), font, 12, maxLineWidth)) {
    drawLine(line, 12);
  }
  const bytes = await pdf.save();
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

async function createDocxBlob(draft: DraftExportInput) {
  const lines = splitSegmentsIntoLines(htmlToSegments(draft.bodyHtml));
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: draft.title, heading: HeadingLevel.HEADING_1 }),
          ...lines.map(
            (line) =>
              new Paragraph({
                children: line.map((segment) => {
                  const options: IRunOptions = {
                    text: segment.text,
                    bold: segment.bold,
                    italics: segment.italic,
                    ...(segment.underline ? { underline: { type: UnderlineType.SINGLE } } : {}),
                    ...(segment.highlight ? { highlight: "yellow" as const } : {}),
                  };
                  return new TextRun(options);
                }),
              }),
          ),
        ],
      },
    ],
  });
  return Packer.toBlob(doc);
}

function createMarkdownBlob(draft: DraftExportInput) {
  const lines = splitSegmentsIntoLines(htmlToSegments(draft.bodyHtml));
  const body = lines.map((line) => line.map(markdownForSegment).join("")).join("\n");
  return new Blob([`# ${escapeMarkdownText(draft.title)}\n\n${body}\n`], {
    type: "text/markdown;charset=utf-8",
  });
}

function htmlToSegments(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;
  const segments: RichSegment[] = [];
  collectSegments(
    template.content,
    { bold: false, italic: false, underline: false, highlight: false },
    segments,
  );
  return coalesceSegments(segments);
}

function collectSegments(
  node: Node,
  inherited: Omit<RichSegment, "text">,
  segments: RichSegment[],
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
    const next = {
      bold: inherited.bold || child.tagName === "B" || child.tagName === "STRONG",
      italic: inherited.italic || child.tagName === "I" || child.tagName === "EM",
      underline: inherited.underline || child.tagName === "U",
      highlight:
        inherited.highlight ||
        child.tagName === "MARK" ||
        Boolean(child.style.backgroundColor && child.style.backgroundColor !== "transparent"),
    };
    collectSegments(child, next, segments);
    if (child.tagName === "DIV" || child.tagName === "P") {
      segments.push({ ...inherited, text: "\n" });
    }
  }
}

function coalesceSegments(segments: RichSegment[]) {
  const coalesced: RichSegment[] = [];
  for (const segment of segments) {
    const previous = coalesced.at(-1);
    if (
      previous &&
      previous.bold === segment.bold &&
      previous.italic === segment.italic &&
      previous.underline === segment.underline &&
      previous.highlight === segment.highlight
    ) {
      previous.text += segment.text;
    } else {
      coalesced.push({ ...segment });
    }
  }
  return coalesced;
}

function segmentsToHtml(segments: RichSegment[]) {
  return segments
    .map((segment) => {
      if (segment.text === "\n") return "<br>";
      let html = escapeHtml(segment.text);
      if (segment.highlight) html = `<mark>${html}</mark>`;
      if (segment.underline) html = `<u>${html}</u>`;
      if (segment.italic) html = `<em>${html}</em>`;
      if (segment.bold) html = `<strong>${html}</strong>`;
      return html;
    })
    .join("");
}

function splitSegmentsIntoLines(segments: RichSegment[]) {
  const lines: RichSegment[][] = [[]];
  for (const segment of segments) {
    const chunks = segment.text.split(/(\n)/);
    for (const chunk of chunks) {
      if (chunk === "\n") {
        lines.push([]);
      } else if (chunk) {
        lines.at(-1)!.push({ ...segment, text: chunk });
      }
    }
  }
  return lines.filter((line) => line.length > 0);
}

interface WidthFont {
  widthOfTextAtSize(text: string, size: number): number;
}

function wrapSegmentsByWidth(
  segments: RichSegment[],
  font: WidthFont,
  size: number,
  maxWidth: number,
) {
  const lines: RichSegment[][] = [[]];
  let lineWidth = 0;
  const pushSegment = (style: RichSegment, text: string) => {
    if (!text) return;
    const last = lines.at(-1)!;
    const prev = last.at(-1);
    if (
      prev &&
      prev.bold === style.bold &&
      prev.italic === style.italic &&
      prev.underline === style.underline &&
      prev.highlight === style.highlight
    ) {
      prev.text += text;
    } else {
      last.push({ ...style, text });
    }
  };
  // Iterate by grapheme cluster, not code point, so combining marks and ZWJ
  // emoji sequences don't get split across line breaks.
  const segmenter =
    typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
      ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
      : null;
  const graphemes = (text: string) =>
    segmenter ? Array.from(segmenter.segment(text), (s) => s.segment) : Array.from(text);
  for (const inputLine of splitSegmentsIntoLines(segments)) {
    for (const segment of inputLine) {
      let buffer = "";
      let bufferWidth = 0;
      for (const ch of graphemes(segment.text)) {
        const chWidth = font.widthOfTextAtSize(ch, size);
        if (lineWidth + bufferWidth + chWidth > maxWidth && (buffer || lineWidth > 0)) {
          pushSegment(segment, buffer);
          lines.push([]);
          lineWidth = 0;
          buffer = ch;
          bufferWidth = chWidth;
        } else {
          buffer += ch;
          bufferWidth += chWidth;
        }
      }
      pushSegment(segment, buffer);
      lineWidth += bufferWidth;
    }
    lines.push([]);
    lineWidth = 0;
  }
  return lines.filter((line) => line.length > 0);
}

function markdownForSegment(segment: RichSegment) {
  let text = escapeMarkdownText(segment.text);
  if (segment.highlight) text = `<mark>${text}</mark>`;
  if (segment.underline) text = `<u>${text}</u>`;
  if (segment.italic) text = `_${text}_`;
  if (segment.bold) text = `**${text}**`;
  return text;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeMarkdownText(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("*", "\\*").replaceAll("_", "\\_");
}
