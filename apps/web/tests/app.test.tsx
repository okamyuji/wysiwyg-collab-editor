import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, test } from "vitest";
import { App, compareDraftKey, detectLocale, loadStoredDraft, nextRevision, normalizeComments } from "../src/app.js";

describe("App", () => {
  test("renders the editor shell", () => {
    expect(renderToString(<App />)).toContain("WYSIWYG Collab");
  });

  test("detects supported browser languages", () => {
    expect(detectLocale(["ja-JP", "en-US"])).toBe("ja");
    expect(detectLocale(["en-US", "ja-JP"])).toBe("en");
  });
});

describe("normalizeComments", () => {
  test("keeps well-formed comments verbatim", () => {
    const input = [{ id: "a", text: "hi", createdAt: 1_700_000_000_000 }];
    expect(normalizeComments(input)).toEqual(input);
  });

  test("drops null/string/empty-text entries and synthesizes missing id+createdAt", () => {
    const result = normalizeComments([null, "x", { id: "c", text: "  " }, { text: "needs id" }]);
    expect(result).toHaveLength(1);
    expect(result[0]?.text).toBe("needs id");
    expect(typeof result[0]?.id).toBe("string");
    expect(result[0]?.id.length).toBeGreaterThan(0);
    expect(typeof result[0]?.createdAt).toBe("number");
  });

  test("returns [] for non-array input", () => {
    expect(normalizeComments(undefined)).toEqual([]);
    expect(normalizeComments(null)).toEqual([]);
    expect(normalizeComments({ id: "x", text: "y", createdAt: 0 })).toEqual([]);
  });
});

describe("loadStoredDraft", () => {
  const fallback = { title: "fallback", bodyHtml: "<p>fb</p>", revision: 1 };

  afterEach(() => {
    localStorage.clear();
  });

  test("loads persisted title and bodyHtml", () => {
    localStorage.setItem(
      "wysiwyg-collab-editor:draft",
      JSON.stringify({ title: "stored", bodyHtml: "<p>kept</p>", revision: 999 }),
    );
    const loaded = loadStoredDraft(fallback);
    expect(loaded.title).toBe("stored");
    expect(loaded.bodyHtml).toContain("kept");
  });

  test("discards the persisted revision so a stale stored value can never shadow peer edits", () => {
    // Regression: tab2 carried revision=1782622968874 from an old session.
    // tab1's fresh Date.now() edits were filtered out as "older" and never
    // rendered. The persisted revision must be replaced with the fallback.
    localStorage.setItem(
      "wysiwyg-collab-editor:draft",
      JSON.stringify({ title: "x", bodyHtml: "<p/>", revision: 9_999_999_999_999 }),
    );
    const loaded = loadStoredDraft(fallback);
    expect(loaded.revision).toBe(fallback.revision);
  });

  test("falls back when the stored payload is malformed", () => {
    localStorage.setItem("wysiwyg-collab-editor:draft", "not json");
    expect(loadStoredDraft(fallback)).toEqual(fallback);
  });
});

describe("normalizeComments createdAt range guard", () => {
  test("replaces createdAt values Date cannot render", () => {
    const result = normalizeComments([{ id: "a", text: "ok", createdAt: 1e20 }]);
    expect(result).toHaveLength(1);
    expect(() => new Date(result[0]!.createdAt).toISOString()).not.toThrow();
  });
});

describe("compareDraftKey", () => {
  test("orders by revision when they differ", () => {
    expect(compareDraftKey({ revision: 2 }, { revision: 1 })).toBeGreaterThan(0);
    expect(compareDraftKey({ revision: 1 }, { revision: 2 })).toBeLessThan(0);
  });
  test("falls back to seq when revisions tie — server-assigned tie-breaker", () => {
    expect(compareDraftKey({ revision: 5, seq: 2 }, { revision: 5, seq: 1 })).toBeGreaterThan(0);
    expect(compareDraftKey({ revision: 5 }, { revision: 5, seq: 1 })).toBeLessThan(0);
  });
});

describe("nextRevision", () => {
  test("anchors a fresh edit on the wall clock so peers stay comparable", () => {
    expect(nextRevision(1, 1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  test("always advances even when the wall clock stalls or rewinds", () => {
    expect(nextRevision(1_700_000_000_000, 1_699_999_999_000)).toBe(1_700_000_000_001);
    expect(nextRevision(5, 5)).toBe(6);
  });

  test("a tiny local revision yields a timestamp-scale next revision so the peer can't shadow it", () => {
    // Regression: with the old `current + 1` scheme a fresh client (rev=1)
    // would emit rev=2, which a peer carrying a stale localStorage revision
    // of e.g. 999 would discard. The Lamport anchor lifts every edit into
    // the timestamp range so the peer always sees it as newer.
    const next = nextRevision(1, 1_700_000_000_000);
    expect(next).toBeGreaterThan(999);
  });
});
