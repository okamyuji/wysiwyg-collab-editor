import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { App, detectLocale } from "../src/app.js";

describe("App", () => {
  test("renders the editor shell", () => {
    expect(renderToString(<App />)).toContain("WYSIWYG Collab");
  });

  test("detects supported browser languages", () => {
    expect(detectLocale(["ja-JP", "en-US"])).toBe("ja");
    expect(detectLocale(["en-US", "ja-JP"])).toBe("en");
  });
});
