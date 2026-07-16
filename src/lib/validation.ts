import { BOOTH_CATEGORIES, BOOTH_STATUSES, FESTIVAL_DAYS, type Booth, type TimetableEvent, type ValidationIssue } from "../types";
import type { CsvRow } from "./csv";
import { calculateWait, toMinutes } from "./time";

const DAY_SET = new Set<string>(FESTIVAL_DAYS);
const CATEGORY_SET = new Set<string>(BOOTH_CATEGORIES);
const STATUS_SET = new Set<string>(BOOTH_STATUSES);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ID_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;

function integer(value: string, fallback: number): number {
  if (value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

function decimal(value: string, fallback: number): number {
  if (value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function splitDays(value: string): string[] {
  return value.split(/[|／/]/).map((day) => day.trim()).filter(Boolean);
}

function issue(level: "error" | "warning", row: number, message: string, field?: string): ValidationIssue {
  return { level, row, field, message };
}

export const BOOTH_HEADERS = [
  "id", "name", "organizer", "category", "location", "description", "emoji", "days", "open_time", "close_time",
  "capacity", "cycle_minutes", "queue_length", "status", "notice", "sort_order",
] as const;

export const TIMETABLE_HEADERS = [
  "id", "day", "start_time", "end_time", "title", "organizer", "venue", "category", "description", "audience", "sort_order",
] as const;

export function validateBoothRows(rows: CsvRow[]): { rows: Booth[]; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const result: Booth[] = [];
  const seenIds = new Set<string>();
  const seenPlacement = new Map<string, number>();
  const timestamp = new Date().toISOString();

  rows.forEach((source, index) => {
    const row = index + 2;
    const id = source.id?.trim() ?? "";
    const name = source.name?.trim() ?? "";
    const organizer = source.organizer?.trim() ?? "";
    const category = source.category?.trim() ?? "";
    const location = source.location?.trim() ?? "";
    const description = source.description?.trim() ?? "";
    const emoji = source.emoji?.trim() || "🎪";
    const rawDays = splitDays(source.days ?? "");
    const openTime = source.open_time?.trim() ?? "";
    const closeTime = source.close_time?.trim() ?? "";
    const capacity = integer(source.capacity ?? "", 1);
    const cycleMinutes = decimal(source.cycle_minutes ?? "", 5);
    const queueLength = integer(source.queue_length ?? "", 0);
    const status = source.status?.trim() || "closed";
    const notice = source.notice?.trim() ?? "";
    const sortOrder = integer(source.sort_order ?? "", (index + 1) * 10);

    if (!id) issues.push(issue("error", row, "idは必須です。", "id"));
    else if (!ID_RE.test(id)) issues.push(issue("error", row, "idは英小文字・数字・ハイフン・アンダースコアの2〜64文字にしてください。", "id"));
    else if (seenIds.has(id)) issues.push(issue("error", row, `id「${id}」が重複しています。`, "id"));
    seenIds.add(id);

    if (!name) issues.push(issue("error", row, "企画名は必須です。", "name"));
    if (!organizer) issues.push(issue("warning", row, "運営団体が空欄です。", "organizer"));
    if (!CATEGORY_SET.has(category)) issues.push(issue("error", row, `categoryは ${BOOTH_CATEGORIES.join(" / ")} のいずれかです。`, "category"));
    if (!location) issues.push(issue("error", row, "場所は必須です。", "location"));
    if (description.length > 240) issues.push(issue("error", row, "紹介文は240文字以内です。", "description"));
    if (notice.length > 120) issues.push(issue("error", row, "お知らせは120文字以内です。", "notice"));

    if (rawDays.length === 0) issues.push(issue("error", row, "daysは1日以上指定してください。", "days"));
    const invalidDays = rawDays.filter((day) => !DAY_SET.has(day));
    if (invalidDays.length > 0) issues.push(issue("error", row, `開催日は2026-08-29または2026-08-30です: ${invalidDays.join(", ")}`, "days"));

    if (!TIME_RE.test(openTime)) issues.push(issue("error", row, "open_timeはHH:MM形式です。", "open_time"));
    if (!TIME_RE.test(closeTime)) issues.push(issue("error", row, "close_timeはHH:MM形式です。", "close_time"));
    if (TIME_RE.test(openTime) && TIME_RE.test(closeTime) && toMinutes(openTime) >= toMinutes(closeTime)) {
      issues.push(issue("error", row, "close_timeはopen_timeより後にしてください。", "close_time"));
    }

    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) issues.push(issue("error", row, "capacityは1〜500の整数です。", "capacity"));
    if (!Number.isFinite(cycleMinutes) || cycleMinutes < 0.25 || cycleMinutes > 180) issues.push(issue("error", row, "cycle_minutesは0.25〜180の数値です。", "cycle_minutes"));
    if (!Number.isInteger(queueLength) || queueLength < 0 || queueLength > 5000) issues.push(issue("error", row, "queue_lengthは0〜5000の整数です。", "queue_length"));
    if (!STATUS_SET.has(status)) issues.push(issue("error", row, `statusは ${BOOTH_STATUSES.join(" / ")} のいずれかです。`, "status"));
    if (!Number.isInteger(sortOrder)) issues.push(issue("error", row, "sort_orderは整数です。", "sort_order"));

    const placementKey = `${name.toLowerCase()}::${location.toLowerCase()}`;
    const previousRow = seenPlacement.get(placementKey);
    if (name && location && previousRow) issues.push(issue("warning", row, `企画名と場所が${previousRow}行目と重複しています。`));
    else if (name && location) seenPlacement.set(placementKey, row);

    result.push({
      id,
      name,
      organizer,
      category: CATEGORY_SET.has(category) ? category as Booth["category"] : "other",
      location,
      description,
      emoji,
      days: rawDays.filter((day): day is Booth["days"][number] => DAY_SET.has(day)),
      openTime,
      closeTime,
      capacity: Number.isFinite(capacity) ? capacity : 1,
      cycleMinutes: Number.isFinite(cycleMinutes) ? cycleMinutes : 5,
      queueLength: Number.isFinite(queueLength) ? queueLength : 0,
      waitMinutes: calculateWait(queueLength, capacity, cycleMinutes),
      status: STATUS_SET.has(status) ? status as Booth["status"] : "closed",
      notice,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : (index + 1) * 10,
      revision: 1,
      lastUpdated: timestamp,
      history: [],
    });
  });

  if (rows.length === 0) issues.push(issue("error", 1, "データ行がありません。"));
  if (rows.length > 300) issues.push(issue("warning", 1, "300件を超えています。読み込み後の表示速度を確認してください。"));
  return { rows: result, issues };
}

export function validateTimetableRows(rows: CsvRow[]): { rows: TimetableEvent[]; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const result: TimetableEvent[] = [];
  const seenIds = new Set<string>();

  rows.forEach((source, index) => {
    const row = index + 2;
    const id = source.id?.trim() ?? "";
    const day = source.day?.trim() ?? "";
    const startTime = source.start_time?.trim() ?? "";
    const endTime = source.end_time?.trim() ?? "";
    const title = source.title?.trim() ?? "";
    const organizer = source.organizer?.trim() ?? "";
    const venue = source.venue?.trim() ?? "";
    const category = source.category?.trim() ?? "その他";
    const description = source.description?.trim() ?? "";
    const audience = source.audience?.trim() ?? "全来場者";
    const sortOrder = integer(source.sort_order ?? "", (index + 1) * 10);

    if (!id) issues.push(issue("error", row, "idは必須です。", "id"));
    else if (!ID_RE.test(id)) issues.push(issue("error", row, "idは英小文字・数字・ハイフン・アンダースコアの2〜64文字にしてください。", "id"));
    else if (seenIds.has(id)) issues.push(issue("error", row, `id「${id}」が重複しています。`, "id"));
    seenIds.add(id);

    if (!DAY_SET.has(day)) issues.push(issue("error", row, "dayは2026-08-29または2026-08-30です。", "day"));
    if (!TIME_RE.test(startTime)) issues.push(issue("error", row, "start_timeはHH:MM形式です。", "start_time"));
    if (!TIME_RE.test(endTime)) issues.push(issue("error", row, "end_timeはHH:MM形式です。", "end_time"));
    if (TIME_RE.test(startTime) && TIME_RE.test(endTime) && toMinutes(startTime) >= toMinutes(endTime)) issues.push(issue("error", row, "end_timeはstart_timeより後にしてください。", "end_time"));
    if (!title) issues.push(issue("error", row, "演目名は必須です。", "title"));
    if (!organizer) issues.push(issue("warning", row, "出演・運営団体が空欄です。", "organizer"));
    if (!venue) issues.push(issue("error", row, "会場は必須です。", "venue"));
    if (description.length > 300) issues.push(issue("error", row, "説明は300文字以内です。", "description"));
    if (!Number.isInteger(sortOrder)) issues.push(issue("error", row, "sort_orderは整数です。", "sort_order"));

    result.push({
      id,
      day: DAY_SET.has(day) ? day as TimetableEvent["day"] : "2026-08-29",
      startTime,
      endTime,
      title,
      organizer,
      venue,
      category,
      description,
      audience,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : (index + 1) * 10,
    });
  });

  const byVenueDay = new Map<string, Array<{ event: TimetableEvent; row: number }>>();
  result.forEach((event, index) => {
    const key = `${event.day}::${event.venue.toLowerCase()}`;
    const group = byVenueDay.get(key) ?? [];
    group.push({ event, row: index + 2 });
    byVenueDay.set(key, group);
  });

  byVenueDay.forEach((group) => {
    const sorted = group.sort((a, b) => toMinutes(a.event.startTime) - toMinutes(b.event.startTime));
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1];
      const current = sorted[i];
      if (previous && current && toMinutes(current.event.startTime) < toMinutes(previous.event.endTime)) {
        issues.push(issue("warning", current.row, `同じ会場で「${previous.event.title}」と時間が重なっています。`, "start_time"));
      }
    }
  });

  if (rows.length === 0) issues.push(issue("error", 1, "データ行がありません。"));
  return { rows: result, issues };
}
