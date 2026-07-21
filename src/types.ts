export const BOOTH_CATEGORIES = ["attraction", "food", "game", "experience", "stage", "exhibition", "other"] as const;
export type BoothCategory = (typeof BOOTH_CATEGORIES)[number];

export type BuildingId = "hr" | "special" | "admin" | "extra" | "outdoor";
export type OrgType = "class" | "club" | "other";

export interface Product {
  id: string;
  name: string;
  stock: number;
  soldOut: boolean;
  // 特定原材料8品目のうち含むもの(表示は目安。現地掲示が正)
  allergens?: string[];
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
  // ブースと同様に、団体ごとの見た目と紹介文を編集できる
  emoji: string;
  iconImage: string;
  description: string;
}

export interface StageProgram {
  stageName: string;
  dayLabel: string;
  days: number;
  rev: number;
  lastUpdated: number;
  items: StageItem[];
}

// 落とし物・迷子などの掲示板(全体お知らせより軽い情報)
export interface FestivalNotice {
  id: string;
  kind: "lost" | "child" | "info";
  text: string;
  ts: number;
}

export interface FestivalSettings {
  festivalName: string;
  emergencyNotice: string;
  notices?: FestivalNotice[];
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
  // CONFLICT(409)時にサーバーが返す現在値。呼び出し側で最新状態へ同期する。
  current?: unknown;
}
