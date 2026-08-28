import { describe, expect, it } from "vitest";
import { fallbackDescription } from "./guest-helpers";
import { makeBooth } from "./festival";

describe("fallbackDescription", () => {
  it("builds a sentence from organizer, category and location", () => {
    const booth = makeBooth({
      name: "たこ焼き屋", category: "food",
      orgType: "class", grade: 2, classNum: 6,
      building: "hr", floor: 3, room: "2-6",
    }, "b1");
    const text = fallbackDescription(booth);
    expect(text).toContain("2年6組");
    expect(text).toContain("フード企画");
    expect(text).toContain("HR棟");
  });

  it("lists up to three product names when they exist", () => {
    const booth = makeBooth({
      name: "屋台", category: "food", orgType: "club", orgName: "野球部",
      products: [
        { id: "p1", name: "焼きそば", stock: 10, soldOut: false },
        { id: "p2", name: "からあげ", stock: 10, soldOut: false },
        { id: "p3", name: "かき氷", stock: 10, soldOut: false },
        { id: "p4", name: "ラムネ", stock: 10, soldOut: false },
      ],
    }, "b2");
    const text = fallbackDescription(booth);
    expect(text).toContain("焼きそば・からあげ・かき氷");
    expect(text).not.toContain("ラムネ");
  });

  it("still reads as a sentence when almost nothing is filled in", () => {
    const text = fallbackDescription(makeBooth({ name: "なぞの企画" }, "b3"));
    expect(text.length).toBeGreaterThan(5);
    expect(text).not.toContain("undefined");
    expect(text).not.toMatch(/。。/);
  });

  it("never invents a category label for その他", () => {
    const booth = makeBooth({ name: "展示", category: "other", orgType: "club", orgName: "写真部" }, "b4");
    expect(fallbackDescription(booth)).toContain("写真部の企画です");
  });
});
