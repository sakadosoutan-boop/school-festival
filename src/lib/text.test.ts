import { describe, expect, it } from "vitest";
import { normalizeForSearch } from "./text";

describe("normalizeForSearch", () => {
  it("matches hiragana queries against katakana names", () => {
    expect(normalizeForSearch("カフェ")).toBe(normalizeForSearch("かふぇ"));
  });

  it("normalizes half-width katakana and full-width alphanumerics", () => {
    expect(normalizeForSearch("ｶﾌｪ")).toBe(normalizeForSearch("かふぇ"));
    expect(normalizeForSearch("ＣＡＦＥ　１０１")).toBe("cafe 101");
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(normalizeForSearch("  Haunted House  ")).toBe("haunted house");
  });
});
