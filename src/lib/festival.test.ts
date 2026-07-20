import { describe, expect, it } from "vitest";
import {
  avgCycle, allSoldOut, boothsForRoom, calcWait, formatLocation, isSoldOut, itemStatus, makeBooth,
  makeStageItem, MAX_WAIT_MINUTES, minToHHMM, normRoom, sanitizeStage, seedBooths, seedStage, sortItems, toMin,
  todayFestivalDay,
} from "./festival";
import type { Booth } from "../types";

describe("calcWait", () => {
  it("computes minutes from people ÷ capacity × cycleSeconds", () => {
    expect(calcWait(30, 2, 180)).toBe(45); // 15組 × 3分
    expect(calcWait(0, 2, 180)).toBe(0);
    expect(calcWait(1, 4, 60)).toBe(1); // 最低1分
  });

  it("caps extreme inputs so the value stays displayable and storable", () => {
    expect(calcWait(500, 1, 3600)).toBe(MAX_WAIT_MINUTES);
  });
});

describe("avgCycle", () => {
  it("averages the 5 most recent measured cycles", () => {
    expect(avgCycle([100, 100, 200, 200, 200, 200, 200], 60)).toBe(200);
    expect(avgCycle([], 60)).toBe(60);
    expect(avgCycle(undefined, 90)).toBe(90);
  });
});

describe("products / sold-out", () => {
  it("treats zero stock or the manual flag as sold out", () => {
    expect(isSoldOut({ id: "p1", name: "焼きそば", stock: 0, soldOut: false })).toBe(true);
    expect(isSoldOut({ id: "p2", name: "たこ焼き", stock: 3, soldOut: true })).toBe(true);
    expect(isSoldOut({ id: "p3", name: "クレープ", stock: 3, soldOut: false })).toBe(false);
  });

  it("marks the booth 完売 only when every registered product is gone", () => {
    const booth = makeBooth({ products: [{ name: "A", stock: 0 }, { name: "B", stock: 0, soldOut: true }] });
    expect(allSoldOut(booth)).toBe(true);
    expect(allSoldOut(makeBooth({ products: [] }))).toBe(false);
  });
});

describe("makeBooth", () => {
  it("repairs corrupted or legacy documents instead of crashing", () => {
    const booth = makeBooth({ name: 42, products: null, capacity: "abc", peopleInLine: -5, history: "x" }, "b1");
    expect(booth.id).toBe("b1");
    expect(booth.name).toBe("");
    expect(booth.products).toEqual([]);
    expect(booth.capacity).toBe(2);
    expect(booth.peopleInLine).toBe(0);
    expect(booth.history).toEqual([]);
  });

  it("recomputes waitMinutes from the stored line state", () => {
    const booth = makeBooth({ peopleInLine: 30, capacity: 2, cycleSeconds: 180, waitMinutes: 1 });
    expect(booth.waitMinutes).toBe(45);
  });
});

describe("formatLocation", () => {
  it("formats building × floor × room, hiding the floor outdoors", () => {
    expect(formatLocation(makeBooth({ building: "hr", floor: 3, room: "301" }))).toBe("HR棟 3階 301");
    expect(formatLocation(makeBooth({ building: "outdoor", room: "屋台エリア" }))).toBe("野外 屋台エリア");
  });

  it("falls back to the legacy free-text location for converted data", () => {
    const legacy = makeBooth({ building: "legacy", location: "本館3階 301教室" });
    expect(formatLocation(legacy)).toBe("本館3階 301教室");
  });
});

describe("stage timetable", () => {
  it("derives live/done/upcoming from the clock and respects cancellation", () => {
    const item = makeStageItem({ start: "10:00", end: "10:30" });
    expect(itemStatus(item, toMin("10:15")!)).toBe("live");
    expect(itemStatus(item, toMin("09:59")!)).toBe("upcoming");
    expect(itemStatus(item, toMin("10:30")!)).toBe("done");
    expect(itemStatus({ ...item, canceled: true }, toMin("10:15")!)).toBe("canceled");
  });

  it("sorts by start time and wraps HH:MM math past midnight", () => {
    const sorted = sortItems([makeStageItem({ id: "b", start: "11:00" }), makeStageItem({ id: "a", start: "09:30" })]);
    expect(sorted[0]?.id).toBe("a");
    expect(minToHHMM(toMin("23:55")! + 10)).toBe("00:05");
  });

  it("normalizes legacy stage documents", () => {
    const program = sanitizeStage({ items: [{ title: "劇", start: "10:00", end: "10:30", day: 7 }] });
    expect(program.items).toHaveLength(1);
    expect(program.items[0]?.day).toBe(1);
    expect(program.days).toBe(2);
  });
});

describe("map room matching", () => {
  const booths: Booth[] = [
    makeBooth({ orgType: "class", grade: 2, classNum: 6, room: "" }, "class26"),
    makeBooth({ orgType: "club", orgName: "美術部", room: "３０１" }, "art"),
  ];

  it("normalizes full-width digits and hyphen variants", () => {
    expect(normRoom("２−６")).toBe("2-6");
    expect(normRoom(" 301 ")).toBe("301");
  });

  it("matches a cell by room name or by class (2年6組 → 2-6)", () => {
    expect(boothsForRoom(booths, "2-6").map((b) => b.id)).toEqual(["class26"]);
    expect(boothsForRoom(booths, "301").map((b) => b.id)).toEqual(["art"]);
    expect(boothsForRoom(booths, "1-1")).toEqual([]);
  });

  it("does not light up the homeroom cell for outdoor class booths", () => {
    const outdoor = [makeBooth({ orgType: "class", grade: 1, classNum: 3, building: "outdoor", room: "屋台エリア" }, "stall")];
    expect(boothsForRoom(outdoor, "1-3")).toEqual([]);
  });
});

describe("やなぎ祭2026 初期データ", () => {
  it("seeds all 43 groups closed, with unique ids and map-matching rooms", () => {
    const seeds = seedBooths();
    expect(seeds).toHaveLength(43);
    expect(new Set(seeds.map((b) => b.id)).size).toBe(43);
    expect(seeds.every((b) => !b.isOpen)).toBe(true);

    const haunted = seeds.find((b) => b.id === "c1-3")!;
    expect(haunted.building).toBe("hr");
    expect(haunted.floor).toBe(3); // 1年はHR棟3F
    expect(boothsForRoom(seeds, "1-3").map((b) => b.id)).toEqual(["c1-3"]);

    const annex = seeds.find((b) => b.id === "c3-9")!;
    expect(annex.building).toBe("extra");
    expect(annex.floor).toBe(1);

    expect(boothsForRoom(seeds, "視聴覚室").map((b) => b.id)).toEqual(["club-engeki"]);
  });

  it("seeds the real two-day stage program (5 + 7 performances)", () => {
    const stage = seedStage();
    expect(stage.items).toHaveLength(12);
    expect(stage.items.filter((i) => i.day === 1)).toHaveLength(5);
    expect(stage.items.filter((i) => i.day === 2)).toHaveLength(7);
    expect(stage.stageName).toBe("体育館ステージ");
  });
});

describe("todayFestivalDay", () => {
  const jst = (iso: string) => new Date(iso).getTime();
  it("maps the public days to 1 and 2 in JST", () => {
    expect(todayFestivalDay(jst("2026-08-29T00:00:00+09:00"))).toBe(1);
    expect(todayFestivalDay(jst("2026-08-29T23:59:00+09:00"))).toBe(1);
    expect(todayFestivalDay(jst("2026-08-30T10:30:00+09:00"))).toBe(2);
  });
  it("returns null outside the festival and respects the JST boundary", () => {
    expect(todayFestivalDay(jst("2026-08-28T12:00:00+09:00"))).toBeNull();
    expect(todayFestivalDay(jst("2026-08-31T00:10:00+09:00"))).toBeNull();
    // UTCでは28日でも、JSTでは29日 → 1日目
    expect(todayFestivalDay(jst("2026-08-28T23:30:00+00:00"))).toBe(1);
  });
});
