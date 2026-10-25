import { afterEach, describe, expect, test, vi } from "vitest";
import {
  encodeSocketMessage,
  loadStoredComments,
  loadStoredDraft,
  maxSocketMessageBytes,
  writeStored,
} from "../src/draft-state.js";

const fallback = { title: "fallback", bodyHtml: "<p>x</p>", revision: 7 };

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("storage failures", () => {
  test("loadStoredDraft returns the fallback when getItem throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(loadStoredDraft(fallback)).toEqual(fallback);
  });

  test("loadStoredDraft returns the fallback when removeItem throws after bad JSON", () => {
    localStorage.setItem("wysiwyg-collab-editor:draft", "not json");
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(loadStoredDraft(fallback)).toEqual(fallback);
  });

  test("loadStoredComments returns [] when getItem throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(loadStoredComments()).toEqual([]);
  });

  test("loadStoredComments returns [] when removeItem throws after bad JSON", () => {
    localStorage.setItem("wysiwyg-collab-editor:comments", "not json");
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(loadStoredComments()).toEqual([]);
  });

  test("writeStored stores the value and reports success", () => {
    expect(writeStored("k", "v")).toBe(true);
    expect(localStorage.getItem("k")).toBe("v");
  });

  test("writeStored reports failure instead of throwing when the quota is exceeded", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(writeStored("k", "v")).toBe(false);
  });
});

describe("encodeSocketMessage", () => {
  test("serializes a message within the limit", () => {
    expect(encodeSocketMessage({ type: "draft", data: { a: 1 } })).toBe(
      '{"type":"draft","data":{"a":1}}',
    );
  });

  test("accepts a message of exactly the limit in bytes", () => {
    const overhead = JSON.stringify({ s: "" }).length;
    const text = "a".repeat(maxSocketMessageBytes - overhead);
    expect(encodeSocketMessage({ s: text })).not.toBeNull();
  });

  test("rejects a message one byte over the limit", () => {
    const overhead = JSON.stringify({ s: "" }).length;
    const text = "a".repeat(maxSocketMessageBytes - overhead + 1);
    expect(encodeSocketMessage({ s: text })).toBeNull();
  });

  test("counts UTF-8 bytes, not characters", () => {
    // 3 bytes per character, so this is under the limit in characters but over it in bytes.
    const text = "あ".repeat(Math.floor(maxSocketMessageBytes / 3) + 1);
    expect(text.length).toBeLessThan(maxSocketMessageBytes);
    expect(encodeSocketMessage({ s: text })).toBeNull();
  });
});
