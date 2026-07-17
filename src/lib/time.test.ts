import { describe, expect, it } from "vitest";
import { calculateWait, displayWait, eventPhase, MAX_WAIT_MINUTES, todayFestivalDay } from "./time";
import type { TimetableEvent } from "../types";

describe("calculateWait", () => {
  it("caps extreme inputs below the DB constraint instead of failing the save", () => {
    // 列5000人 × 1人/回 × 180分 = 90万分。以前はDBのwait_minutes制約に当たり500エラーで更新不能だった。
    expect(calculateWait(5000, 1, 180)).toBe(MAX_WAIT_MINUTES);
  });

  it("keeps normal values unchanged", () => {
    expect(calculateWait(16, 4, 5)).toBe(20);
  });
});

describe("displayWait", () => {
  it("shows exact minutes up to 10", () => {
    expect(displayWait(0)).toBe("0分");
    expect(displayWait(10)).toBe("10分");
  });

  it("rounds up to 5-minute steps above 10 to avoid false precision", () => {
    expect(displayWait(11)).toBe("15分");
    expect(displayWait(23)).toBe("25分");
    expect(displayWait(25)).toBe("25分");
  });

  it("labels the cap as an open range", () => {
    expect(displayWait(MAX_WAIT_MINUTES)).toBe(`${MAX_WAIT_MINUTES}分以上`);
  });
});

describe("eventPhase / todayFestivalDay (JST)", () => {
  const event: TimetableEvent = {
    id: "band", day: "2026-08-29", startTime: "11:00", endTime: "11:35",
    title: "軽音楽部ライブ", organizer: "軽音楽部", venue: "体育館", category: "音楽",
    description: "", audience: "全来場者", sortOrder: 10,
  };

  it("reports live during the slot", () => {
    expect(eventPhase(event, new Date("2026-08-29T11:10:00+09:00"))).toBe("live");
    expect(eventPhase(event, new Date("2026-08-29T10:59:00+09:00"))).toBe("upcoming");
    expect(eventPhase(event, new Date("2026-08-29T11:35:00+09:00"))).toBe("ended");
  });

  it("falls back to day 1 outside the festival and keeps day 2 on day 2", () => {
    expect(todayFestivalDay(new Date("2026-07-17T12:00:00+09:00"))).toBe("2026-08-29");
    expect(todayFestivalDay(new Date("2026-08-30T09:00:00+09:00"))).toBe("2026-08-30");
  });
});
