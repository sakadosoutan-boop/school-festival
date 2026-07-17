import type { Booth, FestivalDay, TimetableEvent } from "../types";

// DBのwait_minutes制約(<=10000)より十分小さい表示上限。極端な入力(列5000人×3時間周期など)でも保存エラーにしない。
export const MAX_WAIT_MINUTES = 600;

export function calculateWait(queueLength: number, capacity: number, cycleMinutes: number): number {
  if (queueLength <= 0 || capacity <= 0 || cycleMinutes <= 0) return 0;
  return Math.min(MAX_WAIT_MINUTES, Math.max(1, Math.round(Math.ceil(queueLength / capacity) * cycleMinutes)));
}

// 来場者向けは1分単位の見かけの精度を出さず、10分超は5分刻みに切り上げて表示する。
export function displayWait(waitMinutes: number): string {
  if (waitMinutes >= MAX_WAIT_MINUTES) return `${MAX_WAIT_MINUTES}分以上`;
  if (waitMinutes <= 10) return `${waitMinutes}分`;
  return `${Math.ceil(waitMinutes / 5) * 5}分`;
}

export function minutesSince(iso: string): number {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (Date.now() - timestamp) / 60_000);
}

export function freshness(booth: Booth): "fresh" | "stale" | "very_stale" {
  const minutes = minutesSince(booth.lastUpdated);
  if (minutes >= 30) return "very_stale";
  if (minutes >= 12) return "stale";
  return "fresh";
}

export function formatRelative(iso: string): string {
  const minutes = minutesSince(iso);
  if (!Number.isFinite(minutes)) return "未更新";
  if (minutes < 0.5) return "たった今";
  if (minutes < 60) return `${Math.floor(minutes)}分前`;
  return `${Math.floor(minutes / 60)}時間前`;
}

export function jstToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function todayFestivalDay(now = new Date()): FestivalDay {
  return jstToday(now) === "2026-08-30" ? "2026-08-30" : "2026-08-29";
}

export function toMinutes(time: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return Number.NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function jstNowMinutes(now = new Date()): number {
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  return toMinutes(time);
}

export function eventPhase(event: TimetableEvent, now = new Date()): "upcoming" | "live" | "ended" {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  if (date < event.day) return "upcoming";
  if (date > event.day) return "ended";
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  const current = toMinutes(time);
  if (current < toMinutes(event.startTime)) return "upcoming";
  if (current >= toMinutes(event.endTime)) return "ended";
  return "live";
}
