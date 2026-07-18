import { describe, expect, it } from "vitest";
import {
  avgCycle, allSoldOut, boothsForRoom, calcWait, formatLocation, isSoldOut, itemStatus, makeBooth,
  makeStageItem, MAX_WAIT_MINUTES, minToHHMM, normRoom, sanitizeStage, sortItems, toMin,
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
