import { describe, expect, it } from "vitest";
import { buildCourses, fallbackDescription, festivalFinished, isCultureClub } from "./guest-helpers";
import { makeBooth, seedBooths } from "./festival";

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

describe("buildCourses", () => {
  const all = seedBooths();

  it("keeps 文化部めぐり to actual culture clubs", () => {
    const club = buildCourses(all).find((c) => c.id === "club");
    expect(club).toBeDefined();
    const names = club!.booths.map((b) => b.orgName);
    // 運動部の招待試合・同窓会・PTAは文化部ではないので入らない
    expect(names).not.toContain("野球部");
    expect(names).not.toContain("ハンドボール部");
    expect(names).not.toContain("同窓会");
    expect(names).not.toContain("PTA・後援会");
    expect(club!.booths.every(isCultureClub)).toBe(true);
  });

  it("offers up to five courses", () => {
    const courses = buildCourses(all);
    expect(courses.length).toBeGreaterThanOrEqual(4);
    expect(courses.length).toBeLessThanOrEqual(5);
    expect(new Set(courses.map((c) => c.id)).size).toBe(courses.length);
  });

  it("gives every course at least two stops", () => {
    expect(buildCourses(all).every((c) => c.booths.length >= 2)).toBe(true);
  });

  it("drops courses that have nothing to visit", () => {
    // 開場前は誰も営業していないので「今すぐ回れる」は出ない
    expect(buildCourses(all).some((c) => c.id === "quick")).toBe(false);
  });
});

describe("festivalFinished", () => {
  const at = (iso: string) => new Date(iso).getTime();

  it("is not finished while booths are still open after entry closes", () => {
    expect(festivalFinished(at("2026-08-29T15:29:00+09:00"))).toBe(false);
    // 15:30は校舎への入場が終わるだけ。中の企画は16:00まで営業している
    expect(festivalFinished(at("2026-08-29T15:40:00+09:00"))).toBe(false);
    expect(festivalFinished(at("2026-08-29T15:59:00+09:00"))).toBe(false);
  });

  it("is finished from 16:00 on a festival day", () => {
    expect(festivalFinished(at("2026-08-29T16:00:00+09:00"))).toBe(true);
    expect(festivalFinished(at("2026-08-30T16:30:00+09:00"))).toBe(true);
  });

  it("is finished on any non-festival day", () => {
    expect(festivalFinished(at("2026-08-28T12:00:00+09:00"))).toBe(true);
    expect(festivalFinished(at("2026-08-31T10:00:00+09:00"))).toBe(true);
  });
});
