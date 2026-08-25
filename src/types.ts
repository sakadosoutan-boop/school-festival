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
  // 小さなお子さま向け企画かどうか(任意・既定false)。ゲスト側のバッジ表示用(このアプリでは編集のみ扱う)。
  kidsFriendly?: boolean;
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

// 1つの公演に複数人が出演する場合の、出演者ひとりぶんの情報。
// (例: SKD自慢王×歌謡祭 = 自慢王2名 + 歌うま王5名)
// ステージ全体で1ドキュメントのため、画像は持たせず絵文字だけにしている。
export interface StagePerformer {
  id: string;
  name: string;
  // 役割。「自慢王」「歌うま王」などの肩書き(自由入力)
  role: string;
  emoji: string;
  // 意気込み・自己紹介。来場者が公演の詳細を開くと表示される
  description: string;
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
  // 会場(体育館ステージ / 演劇部 / 音楽部 / 放送部 など)。空なら体育館ステージ扱い
  venue: string;
  // 個人で出演する場合の出演者一覧。未設定の公演もあるので任意
  performers?: StagePerformer[];
}

export interface StageProgram {
  stageName: string;
  dayLabel: string;
  days: number;
  rev: number;
  lastUpdated: number;
  items: StageItem[];
  // 選択できる会場の一覧。演劇部・音楽部・放送部などの公演を後から追加できる
  venues: string[];
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
