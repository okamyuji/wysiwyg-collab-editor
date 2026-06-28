import { describe, expect, test } from "vitest";
import { parsePollIntervalMs } from "./main.js";

describe("export worker scaffold", () => {
  test("parses valid poll interval", () => {
    expect(parsePollIntervalMs("2500")).toBe(2500);
  });

  test("falls back for invalid poll interval", () => {
    expect(parsePollIntervalMs("0")).toBe(5000);
    expect(parsePollIntervalMs("not-a-number")).toBe(5000);
  });
});
