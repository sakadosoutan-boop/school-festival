import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "./csv";
import { calculateWait } from "./time";
import { validateBoothRows, validateTimetableRows } from "./validation";

const boothCsv = `id,name,organizer,category,location,description,emoji,days,open_time,close_time,capacity,cycle_minutes,queue_length,status,notice,sort_order\nhaunted,お化け屋敷,3年A組,attraction,301教室,"怖い,楽しい",👻,2026-08-29|2026-08-30,09:30,15:00,4,5,8,open,,10\n`;

describe("CSV parser", () => {
  it("parses quoted commas and round-trips", () => {
    const rows = parseCsv(boothCsv);
    expect(rows[0]?.description).toBe("怖い,楽しい");
    expect(parseCsv(toCsv(Object.keys(rows[0] ?? {}), rows))).toEqual(rows);
  });

  it("accepts UTF-8 BOM and CRLF", () => {
    const rows = parseCsv("\uFEFFid,name\r\na,企画A\r\n");
    expect(rows).toEqual([{ id: "a", name: "企画A" }]);
  });

  it("rejects an unclosed quoted field", () => {
    expect(() => parseCsv('id,name\na,"閉じていない')).toThrow("引用符");
  });
});

describe("wait-time calculation", () => {
  it("rounds up by service capacity and handles empty queues", () => {
    expect(calculateWait(0, 4, 5)).toBe(0);
    expect(calculateWait(5, 4, 5)).toBe(10);
  });
});

describe("import validation", () => {
  it("accepts a valid booth row", () => {
    const result = validateBoothRows(parseCsv(boothCsv));
    expect(result.issues.filter((item) => item.level === "error")).toHaveLength(0);
    expect(result.rows[0]?.waitMinutes).toBe(10);
  });

  it("rejects duplicated IDs and invalid festival dates", () => {
    const rows = parseCsv(`id,name,organizer,category,location,description,emoji,days,open_time,close_time,capacity,cycle_minutes,queue_length,status,notice,sort_order\nsame,A,1組,game,101,,,2026-08-29,09:00,10:00,2,5,0,closed,,10\nsame,B,2組,game,102,,,2026-08-31,09:00,10:00,2,5,0,closed,,20\n`);
    const result = validateBoothRows(rows);
    expect(result.issues.some((item) => item.field === "id" && item.message.includes("重複"))).toBe(true);
    expect(result.issues.some((item) => item.field === "days" && item.message.includes("2026-08-31"))).toBe(true);
  });

  it("detects venue overlap", () => {
    const rows = parseCsv(`id,day,start_time,end_time,title,organizer,venue,category,description,audience,sort_order\na,2026-08-29,10:00,11:00,A,部活,体育館,音楽,,,10\nb,2026-08-29,10:30,11:30,B,部活,体育館,演劇,,,20\n`);
    const result = validateTimetableRows(rows);
    expect(result.issues.some((item) => item.level === "warning" && item.message.includes("時間が重なって"))).toBe(true);
  });
});
