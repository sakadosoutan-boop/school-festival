export const FESTIVAL_DAYS = ["2026-08-29", "2026-08-30"] as const;
export type FestivalDay = (typeof FESTIVAL_DAYS)[number];

export const BOOTH_CATEGORIES = ["attraction", "food", "game", "experience", "stage", "exhibition", "other"] as const;
export type BoothCategory = (typeof BOOTH_CATEGORIES)[number];

export const BOOTH_STATUSES = ["open", "paused", "closed", "sold_out"] as const;
export type BoothStatus = (typeof BOOTH_STATUSES)[number];

export interface Booth {
  id: string;
  name: string;
  organizer: string;
  category: BoothCategory;
  location: string;
  description: string;
  emoji: string;
  days: FestivalDay[];
  openTime: string;
  closeTime: string;
  capacity: number;
  cycleMinutes: number;
  queueLength: number;
  waitMinutes: number;
  status: BoothStatus;
  notice: string;
  sortOrder: number;
  revision: number;
  lastUpdated: string;
  history: Array<{ at: string; waitMinutes: number }>;
}

export interface TimetableEvent {
  id: string;
  day: FestivalDay;
  startTime: string;
  endTime: string;
  title: string;
  organizer: string;
  venue: string;
  category: string;
  description: string;
  audience: string;
  sortOrder: number;
}

export interface FestivalSettings {
  festivalName: string;
  subtitle: string;
  dates: FestivalDay[];
  openingHours: Record<FestivalDay, { start: string; end: string }>;
  emergencyNotice: string;
  lastPublishedAt: string;
}

export interface FestivalData {
  settings: FestivalSettings;
  booths: Booth[];
  timetable: TimetableEvent[];
  version: string;
  fetchedAt: string;
}

export type ImportKind = "booths" | "timetable";
export type ImportMode = "merge" | "replace";

export interface ValidationIssue {
  level: "error" | "warning";
  row: number;
  field?: string;
  message: string;
}

export interface ImportPreview<T> {
  kind: ImportKind;
  rows: T[];
  issues: ValidationIssue[];
  sourceName: string;
}

export interface PendingMutation {
  id: string;
  createdAt: string;
  type: "update_booth";
  boothId: string;
  expectedRevision: number;
  patch: Partial<Booth>;
}

export interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
  current?: Booth;
}
