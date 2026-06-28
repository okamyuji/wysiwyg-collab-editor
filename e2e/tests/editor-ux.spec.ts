import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { strFromU8, unzipSync } from "fflate";

test.describe("Editor UX scaffold", () => {
  test.use({ locale: "en-US" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test("supports the main document editing flow", async ({ page }) => {
    await expect(page.getByRole("navigation", { name: "Workspace" })).toBeVisible();
    await page.getByTestId("document-title").fill("Roadmap review");
    await page
      .getByTestId("document-body")
      .fill("Draft the launch review notes and invite collaborators.");
    await page.getByRole("button", { name: "Save draft" }).click();

    await expect(page.getByTestId("sync-status")).toContainText(/Saved: \d/);
  });

  test("opens comments, share, and export panels", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Comments" }).click();
    await expect(page.getByTestId("side-panel")).toContainText("Comments");
    await page.getByPlaceholder("Add a review note").fill("Clarify launch scope");

    await page.getByRole("button", { name: "Share" }).click();
    await expect(page.getByTestId("side-panel")).toContainText("Share");
    await page.getByLabel("Anyone with link can view").check();
    await expect(page.getByLabel("Anyone with link can view")).toBeChecked();

    await page.getByRole("button", { name: "Export" }).click();
    await expect(page.getByTestId("side-panel")).toContainText("Export");
    await page.getByTestId("side-panel").getByLabel("Format").selectOption("Markdown");
    await expect(page.getByTestId("side-panel").getByLabel("Format")).toHaveValue("Markdown");
  });

  test("keeps key surfaces inside the viewport on desktop and mobile", async ({ page }) => {
    for (const size of [
      { width: 1280, height: 800 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(size);
      await page.goto("/");
      await page.evaluate(() => localStorage.clear());
      await page.reload();

      for (const locator of [
        page.getByRole("navigation", { name: "Workspace" }),
        page.getByLabel("Editor workspace"),
        page.getByTestId("side-panel"),
      ]) {
        const box = await locator.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.width).toBeLessThanOrEqual(size.width);
      }
    }
  });

  test("syncs online edits between two active collaborators", async ({ context }) => {
    const alice = await context.newPage();
    const bob = await context.newPage();

    await alice.goto("/");
    await alice.evaluate(() => localStorage.clear());
    await bob.goto("/");
    await alice.reload();
    await bob.reload();

    await alice.getByTestId("document-title").fill("Shared launch notes");
    await expect(bob.getByTestId("document-title")).toHaveValue("Shared launch notes");

    await bob.getByTestId("document-body").fill("Bob adds the acceptance criteria.");
    await expect(alice.getByTestId("document-body")).toContainText(
      "Bob adds the acceptance criteria.",
    );

    await expect(alice.getByTestId("presence-status")).toContainText("Online");
    await expect(bob.getByTestId("presence-status")).toContainText("Online");
  });

  test("applies rich text decorations to the document body", async ({ page }) => {
    const editor = page.getByTestId("document-body");

    await editor.fill("Decorated text");
    await editor.focus();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await page.getByRole("button", { name: "Bold" }).click();
    await expect(editor.locator("b, strong")).toContainText("Decorated text");

    await editor.focus();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await page.getByRole("button", { name: "Italic" }).click();
    await expect(editor.locator("i, em")).toContainText("Decorated text");

    await editor.focus();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await page.getByRole("button", { name: "Underline" }).click();
    await expect(editor.locator("u")).toContainText("Decorated text");

    await editor.focus();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await page.getByRole("button", { name: "Highlight" }).click();
    await expect(editor.locator("mark")).toContainText("Decorated text");
  });

  test("exports a decorated document as PDF, DOCX, and Markdown without text loss", async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    const exportOutputDir = testInfo.outputPath("exports");
    await mkdir(exportOutputDir, { recursive: true });
    await page.getByTestId("document-title").fill("Decorated export 日本語");
    await page.getByTestId("document-body").evaluate((element) => {
      element.innerHTML =
        "<strong>Bold Export</strong><br><em>Italic Export</em><br><u>Underline Export</u><br><mark>Highlight Export 日本語</mark>";
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
    });
    await page.getByRole("button", { name: "Export" }).click();

    const markdownPath = await downloadExport(page, "Markdown", exportOutputDir);
    const markdown = await readFile(markdownPath, "utf8");
    expect(markdown).toContain("# Decorated export 日本語");
    expect(markdown).toContain("**Bold Export**");
    expect(markdown).toContain("_Italic Export_");
    expect(markdown).toContain("<u>Underline Export</u>");
    expect(markdown).toContain("<mark>Highlight Export 日本語</mark>");

    const docxPath = await downloadExport(page, "DOCX", exportOutputDir);
    const docx = unzipSync(new Uint8Array(await readFile(docxPath)));
    const documentXmlBytes = docx["word/document.xml"];
    expect(documentXmlBytes).toBeDefined();
    const documentXml = strFromU8(documentXmlBytes!);
    expect(documentXml).toContain("Decorated export 日本語");
    expect(documentXml).toContain("Bold Export");
    expect(documentXml).toContain("Italic Export");
    expect(documentXml).toContain("Underline Export");
    expect(documentXml).toContain("Highlight Export 日本語");
    expect(documentXml).toContain("<w:b");
    expect(documentXml).toContain("<w:i");
    expect(documentXml).toContain("<w:u");
    expect(documentXml).toContain("<w:highlight");

    const pdfPath = await downloadExport(page, "PDF", exportOutputDir);
    const pdfBytes = await readFile(pdfPath);
    const pdf = await PDFDocument.load(pdfBytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    const extractedPdfText = execFileSync("pdftotext", [pdfPath, "-"], { encoding: "utf8" });
    expect(extractedPdfText).toContain("Decorated export 日本語");
    expect(extractedPdfText).toContain("Bold Export");
    expect(extractedPdfText).toContain("Highlight Export 日本語");
    const pdfPreviewPrefix = path.join(exportOutputDir, "decorated-export-preview");
    execFileSync("pdftoppm", ["-png", "-singlefile", pdfPath, pdfPreviewPrefix]);
    const preview = await readFile(`${pdfPreviewPrefix}.png`);
    expect(preview.byteLength).toBeGreaterThan(10_000);
  });

  test("sanitizes executable markup before rendering and export", async ({ page }, testInfo) => {
    const exportOutputDir = testInfo.outputPath("exports");
    await mkdir(exportOutputDir, { recursive: true });
    await page.evaluate(() => {
      localStorage.setItem(
        "wysiwyg-collab-editor:draft",
        JSON.stringify({
          title: "Security export",
          bodyHtml:
            '<img src=x onerror="window.__xss=1"><script>window.__xss=1</script><strong onclick="window.__xss=1">Safe text</strong>',
          revision: 10,
        }),
      );
    });
    await page.reload();

    await expect(
      page.getByTestId("document-body").locator("script,img,[onerror],[onclick]"),
    ).toHaveCount(0);
    await expect(page.getByTestId("document-body")).toContainText("Safe text");
    await expect(page.evaluate(() => Reflect.get(window, "__xss"))).resolves.toBeUndefined();

    await page.getByRole("button", { name: "Export" }).click();
    const markdownPath = await downloadExport(page, "Markdown", exportOutputDir);
    const markdown = await readFile(markdownPath, "utf8");
    expect(markdown).toContain("Safe text");
    expect(markdown).not.toContain("script");
    expect(markdown).not.toContain("onerror");
    expect(markdown).not.toContain("onclick");
  });
});

async function downloadExport(
  page: import("@playwright/test").Page,
  format: string,
  exportOutputDir: string,
) {
  await page.getByTestId("side-panel").getByLabel("Format").selectOption(format);
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-button").click();
  const download = await downloadPromise;
  const extension = format === "PDF" ? "pdf" : format === "DOCX" ? "docx" : "md";
  const exportPath = path.join(exportOutputDir, `decorated-export.${extension}`);
  await download.saveAs(exportPath);
  await expect(page.getByTestId("export-status")).toContainText(format);
  return exportPath;
}

test.describe("Japanese locale", () => {
  test.use({ locale: "ja-JP" });

  test("switches UI copy from browser language", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await expect(page.getByRole("navigation", { name: "ワークスペース" })).toBeVisible();
    await expect(page.getByRole("button", { name: "下書きを保存" })).toBeVisible();
    await expect(page.getByLabel("文書タイトル")).toHaveValue("リリース計画");
    await page.getByRole("button", { name: "共有" }).click();
    await expect(page.getByTestId("side-panel")).toContainText("共有");
    await expect(page.getByLabel("リンクを知っている全員が閲覧可能")).toBeVisible();
  });
});
