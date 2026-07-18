export const BOOTH_CATEGORIES = ["attraction", "food", "game", "experience", "stage", "exhibition", "other"] as const;
export type BoothCategory = (typeof BOOTH_CATEGORIES)[number];

export type BuildingId = "hr" | "special" | "admin" | "extra" | "outdoor";
export type OrgType = "class" | "club" | "other";

export interface Product {
  id: string;
  name: string;
  stock: number;
  soldOut: boolean;
}

export interface Booth {
  id: string;
  name: string;
  emoji: string;
  iconImage: string;
  category: string;
  products: Product[];
  organizer: string; // 旧データ互換(自由入力)
  orgType: OrgType;
  grade: number;
  classNum: number;
  orgName: string;
  building: string;
  floor: number;
  room: string;
  location: string; // 旧データ互換(自由入力)
  description: string;
  isOpen: boolean;
  peopleInLine: number;
  capacity: number;
  cycleSeconds: number;
  waitMinutes: number;
  history: Array<{ ts: number; wait: number }>;
  cycleHistory: number[];
  lastUpdated: number;
  lastServedAt: number | null;
  undoSnapshot: {
    peopleInLine: number;
    cycleHistory: number[];
    lastServedAt: number | null;
    waitMinutes: number;
    ts: number;
  } | null;
  rev: number;
}

export interface StageItem {
  id: string;
  title: string;
  performer: string;
  start: string;
  end: string;
  note: string;
  canceled: boolean;
  day: number;
}

export interface StageProgram {
  stageName: string;
  dayLabel: string;
  days: number;
  rev: number;
  lastUpdated: number;
  items: StageItem[];
}

export interface FestivalSettings {
  festivalName: string;
  emergencyNotice: string;
}

export interface FestivalData {
  booths: Booth[];
  stage: StageProgram;
  settings: FestivalSettings;
  version: string;
  fetchedAt: number;
}

// staff: ブース運用・作成・編集・ステージ進行の管理ができる。
// admin: 上記に加え、PIN変更・重要なお知らせ・全データ入替・スナップショット復元ができる。
export type StaffRole = "staff" | "admin";

export interface SnapshotMeta {
  id: number;
  createdAt: string;
  label: string;
  boothCount: number;
  eventCount: number;
}

export interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
  notModified?: boolean;
}
