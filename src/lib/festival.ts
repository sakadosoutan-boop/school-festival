import type { Booth, Product, StageItem, StageProgram } from "../types";
import { YANAGI_BOOTHS, YANAGI_STAGE_ITEMS, YANAGI_STAGE_LABEL, YANAGI_STAGE_NAME } from "./yanagi2026";

/* ═══════════ CONFIG(v4プロトタイプ準拠) ═══════════ */

export const APP_NAME = "まちたいむ";
export const REFRESH_MS = 8_000; // デモモード(端末内)の更新間隔。共有APIは可視状態に応じて調整する。
export const HEARTBEAT_MS = 60_000;
export const STALE_MINUTES = 12;
export const VERY_STALE_MINUTES = 30;
export const NAG_MINUTES = 8;

// やなぎ祭の一般公開日(JST)。1日目・2日目の自動判定に使う。
export const FESTIVAL_DATES = ["2026-08-29", "2026-08-30"] as const;

/** 今日が開催何日目かを返す(開催日以外はnull)。日付はJSTで判定する。 */
export function todayFestivalDay(now = Date.now()): number | null {
  const jstDate = new Date(now + 9 * 3600_000).toISOString().slice(0, 10);
  const idx = (FESTIVAL_DATES as readonly string[]).indexOf(jstDate);
  return idx === -1 ? null : idx + 1;
}

// 企画投票用GoogleフォームのURL。空ならバナー自体を表示しない
// (プレースホルダーの死にリンクを本番に出さないため、環境変数で注入する)。
export const VOTE_FORM_URL = ((import.meta.env?.VITE_VOTE_FORM_URL as string | undefined) ?? "").trim();

export const THEME = {
  cream: "#fff7ed",
  ink: "#3b1f4f",
  pink: "#ff4d8d",
  pinkDeep: "#e6206b",
  orange: "#ff8a3d",
  yellow: "#ffd23f",
  purple: "#9b5de5",
  blue: "#4cc9f0",
  mint: "#3ddc97",
  festGradient: "linear-gradient(120deg,#ff4d8d 0%,#ff8a3d 38%,#ffd23f 70%,#9b5de5 100%)",
  festGradientSoft: "linear-gradient(120deg,#fff0f6 0%,#fff7e6 50%,#f3ecff 100%)",
};

const POP_ACCENTS = ["#ff4d8d", "#ff8a3d", "#ffd23f", "#9b5de5", "#4cc9f0", "#3ddc97"];
export const accentFor = (id: string): string => {
  let h = 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return POP_ACCENTS[h % POP_ACCENTS.length]!;
};

export const CATEGORIES = [
  { id: "all", label: "すべて", emoji: "✨" },
  { id: "attraction", label: "アトラクション", emoji: "🎢" },
  { id: "food", label: "フード", emoji: "🍡" },
  { id: "game", label: "ゲーム", emoji: "🎯" },
  { id: "experience", label: "体験", emoji: "🎨" },
  { id: "stage", label: "ステージ", emoji: "🎤" },
  { id: "exhibition", label: "展示", emoji: "🖼️" },
  { id: "other", label: "その他", emoji: "🎪" },
] as const;

export const EMOJI_PALETTE = [
  // 定番・お祭り
  "🎪","🎡","🎢","🎠","🎆","🎇","🏮","🎐","🎏","🎍","🪅","🎊","🎉","✨",
  // アトラクション・ゲーム
  "👻","🔐","🧩","🎯","🎰","🃏","🎲","🕹️","🎮","🔫","🏹","🎳","🪀","🧸",
  // フード
  "🍡","🍜","🍕","🍔","🍟","🌭","🥞","🐙","🍦","🍧","🍨","🧋","☕","🧃",
  "🍓","🍩","🍪","🍫","🍬","🍭","🧁","🎂","🍿","🥤","🍺","🍶","🍙","🍢",
  // 体験・文化系
  "🎨","🎭","🎬","🎤","🎸","🎹","🎻","🥁","🎺","🪕","🎼","🎵","📸","🖼️",
  "🔮","🪄","🧪","🔬","📚","✏️","🖌️","🧶","🪡","🎎","🏺","♟️",
  // スポーツ・アクティブ
  "🏀","⚽","⚾","🏐","🏓","🎾","🥊","🤺","🛹","🎽",
  // 装飾・かわいい
  "🌟","🔥","💎","🎁","🦄","🐰","🐱","🐶","🐼","🐧","🦊","🌈","💫","⭐",
  "❤️","💛","💚","💙","💜","🩷","🌸","🌺","🌻","🍀","👑","🏆",
];

// 場所: 棟 × 階の選択式(やなぎ祭の校内マップ準拠)
export const BUILDINGS = [
  { id: "hr", label: "HR棟" },
  { id: "special", label: "特別棟" },
  { id: "extra", label: "増設棟" },
  { id: "admin", label: "管理棟" },
  { id: "gaikoku", label: "外国語科棟" },
  { id: "outdoor", label: "野外" },
] as const;
export const FLOORS = [1, 2, 3, 4];
export const buildingLabel = (id: string): string => BUILDINGS.find((b) => b.id === id)?.label || "";

// 表示用: 「HR棟 3階」/ 野外は階を出さない
export const formatLocation = (booth: Pick<Booth, "building" | "floor" | "room" | "location">): string => {
  const bld = buildingLabel(booth.building);
  if (!bld) return booth.location || ""; // 旧データ互換(自由入力のlocation)
  if (booth.building === "outdoor") return bld + (booth.room ? ` ${booth.room}` : "");
  const fl = booth.floor ? `${booth.floor}階` : "";
  return [bld, fl, booth.room].filter(Boolean).join(" ");
};

// 運営団体: クラスは学年×組のドラムロール選択 → 「2年1組」に自動統一
export const ORG_TYPES = [
  { id: "class", label: "クラス" },
  { id: "club", label: "部活・委員会" },
  { id: "other", label: "その他" },
] as const;
export const GRADES = [1, 2, 3];
export const CLASS_NUMS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export const formatOrganizer = (booth: Pick<Booth, "orgType" | "grade" | "classNum" | "orgName" | "organizer"> | null | undefined): string => {
  if (!booth) return "";
  if (booth.orgType === "class" && booth.grade) return `${booth.grade}年${booth.classNum || 1}組`;
  if (booth.orgName) return booth.orgName;
  return booth.organizer || ""; // 旧データ互換(自由入力)
};

/* ═══════════ PURE HELPERS ═══════════ */

export const MAX_WAIT_MINUTES = 600;

export const calcWait = (people: number, capacity: number, cycleSeconds: number): number => {
  if (people <= 0 || capacity <= 0) return 0;
  return Math.min(MAX_WAIT_MINUTES, Math.max(1, Math.round((Math.ceil(people / capacity) * cycleSeconds) / 60)));
};

// 商品の売り切れ判定: 手動フラグ or 在庫0
export const isSoldOut = (p: Product): boolean => !!p.soldOut || (typeof p.stock === "number" && p.stock <= 0);
// ブースの全商品が売り切れか(商品登録がある場合のみ)
export const allSoldOut = (booth: Booth): boolean => {
  const ps = booth.products || [];
  return ps.length > 0 && ps.every(isSoldOut);
};

export const avgCycle = (history: number[] | undefined, fallback: number): number => {
  if (!history || history.length === 0) return fallback;
  const recent = history.slice(-5);
  return Math.round(recent.reduce((s, v) => s + v, 0) / recent.length);
};

export const minutesSince = (ts: number | null | undefined): number => (ts ? (Date.now() - ts) / 60000 : Infinity);

export const freshness = (booth: Booth): "fresh" | "stale" | "very_stale" => {
  const m = minutesSince(booth.lastUpdated);
  if (m >= VERY_STALE_MINUTES) return "very_stale";
  if (m >= STALE_MINUTES) return "stale";
  return "fresh";
};

export interface StatusMeta { key: string; label: string; color: string; soft: string; ring: string }
export const getStatus = (minutes: number, isOpen: boolean): StatusMeta => {
  if (!isOpen) return { key: "closed", label: "準備中", color: "#78716c", soft: "#f5f5f4", ring: "#e7e5e4" };
  if (minutes <= 10) return { key: "open", label: "すぐ入れます", color: "#059669", soft: "#ecfdf5", ring: "#a7f3d0" };
  if (minutes <= 20) return { key: "mid", label: "少し混雑", color: "#d97706", soft: "#fffbeb", ring: "#fde68a" };
  if (minutes <= 30) return { key: "busy", label: "混雑中", color: "#ea580c", soft: "#fff7ed", ring: "#fed7aa" };
  return { key: "packed", label: "大変混雑", color: "#dc2626", soft: "#fef2f2", ring: "#fecaca" };
};

export const formatRelative = (ts: number | null | undefined): string => {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  if (diff < 30_000) return "たった今";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}秒前`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分前`;
  return `${Math.floor(diff / 3_600_000)}時間前`;
};

export const formatTime = (ts: number | null | undefined): string => (ts
  ? new Date(ts).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })
  : "—");

export const formatCycle = (s: number): string => {
  if (s < 60) return `${s}秒`;
  const m = Math.floor(s / 60), r = s % 60;
  return r === 0 ? `${m}分` : `${m}分${r}秒`;
};

export const computeTrend = (history: Booth["history"]): { dir: "flat" | "up" | "down"; delta: number } => {
  if (!history || history.length < 2) return { dir: "flat", delta: 0 };
  const last = history[history.length - 1]!.wait;
  const prev = history[history.length - 2]!.wait;
  const delta = last - prev;
  if (Math.abs(delta) < 3) return { dir: "flat", delta };
  return { dir: delta > 0 ? "up" : "down", delta };
};

/* ═══════════ DATA MODEL ═══════════ */

export function makeBooth(partial: unknown, id?: string): Booth {
  const base: Booth = {
    id: id || `b_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: "", emoji: "🎪", iconImage: "", category: "attraction",
    products: [],
    organizer: "",
    orgType: "class", grade: 2, classNum: 1, orgName: "",
    building: "hr", floor: 1, room: "",
    location: "",
    description: "",
    isOpen: true,
    peopleInLine: 0, capacity: 2, cycleSeconds: 180,
    waitMinutes: 0,
    history: [], cycleHistory: [],
    lastUpdated: Date.now(), lastServedAt: null, undoSnapshot: null,
    rev: 0,
  };
  const src = (partial && typeof partial === "object") ? partial as Record<string, unknown> : {};
  const merged = { ...base, ...src, id: id || (src.id as string) || base.id } as Booth & Record<string, unknown>;

  // 破損・旧データ対策: null/型不一致のフィールドを安全な既定値に矯正する。
  const num = (v: unknown, d: number): number => (typeof v === "number" && !Number.isNaN(v)) ? v : d;
  const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
  const arr = <T,>(v: unknown): T[] => Array.isArray(v) ? v as T[] : [];
  const bool = (v: unknown, d: boolean): boolean => (typeof v === "boolean" ? v : d);

  merged.name = str(merged.name);
  merged.emoji = str(merged.emoji) || "🎪";
  merged.iconImage = str(merged.iconImage);
  merged.category = str(merged.category) || "attraction";
  merged.products = arr<Record<string, unknown>>(merged.products).filter((p) => p && typeof p === "object").map((p) => ({
    id: str(p.id) || `p_${Math.random().toString(36).slice(2, 7)}`,
    name: str(p.name),
    stock: num(p.stock, 0),
    soldOut: bool(p.soldOut, false),
  }));
  merged.organizer = str(merged.organizer);
  merged.orgType = merged.orgType === "club" ? "club" : merged.orgType === "other" ? "other" : "class";
  merged.grade = num(merged.grade, 2);
  merged.classNum = num(merged.classNum, 1);
  merged.orgName = str(merged.orgName);
  merged.building = str(merged.building) || "hr";
  merged.floor = num(merged.floor, 1);
  merged.room = str(merged.room);
  merged.location = str(merged.location);
  merged.description = str(merged.description);
  merged.isOpen = bool(merged.isOpen, true);
  merged.peopleInLine = Math.max(0, num(merged.peopleInLine, 0));
  merged.capacity = Math.max(1, num(merged.capacity, 2));
  merged.cycleSeconds = Math.max(1, num(merged.cycleSeconds, 180));
  merged.history = arr<{ ts: number; wait: number }>(merged.history)
    .filter((h) => h && typeof h === "object" && typeof h.wait === "number")
    .slice(-30);
  merged.cycleHistory = arr<number>(merged.cycleHistory).filter((v) => typeof v === "number").slice(-10);
  merged.lastUpdated = num(merged.lastUpdated, Date.now());
  merged.lastServedAt = typeof merged.lastServedAt === "number" ? merged.lastServedAt : null;
  merged.undoSnapshot = merged.undoSnapshot && typeof merged.undoSnapshot === "object" ? merged.undoSnapshot as Booth["undoSnapshot"] : null;
  merged.rev = num(merged.rev, 0);

  merged.waitMinutes = calcWait(merged.peopleInLine, merged.capacity, merged.cycleSeconds);
  return merged as Booth;
}

// 初期データ = やなぎ祭2026の実データ(参加団体一覧より43団体)。
// 開場までは全ブース「準備中」で始め、当日各担当が営業中へ切り替える。
export const seedBooths = (): Booth[] =>
  YANAGI_BOOTHS.map((b) => makeBooth({ ...b, isOpen: false }, b.id));

/* ═══════════ STAGE TIMETABLE MODEL ═══════════ */

export const toMin = (hhmm: string | null | undefined): number | null => {
  if (!hhmm || typeof hhmm !== "string") return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};
export const minToHHMM = (min: number): string => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
export const nowMin = (): number => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

export const makeStageItem = (partial: Partial<StageItem> = {}): StageItem => ({
  id: partial.id || `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  title: "", performer: "", start: "10:00", end: "10:20", note: "", canceled: false,
  day: 1,
  ...partial,
});

// 初期プログラム = 体育館当日スケジュール(8/29・8/30)の実データ。
export const seedStage = (): StageProgram => ({
  stageName: YANAGI_STAGE_NAME,
  dayLabel: YANAGI_STAGE_LABEL,
  days: 2,
  rev: 0,
  lastUpdated: Date.now(),
  items: YANAGI_STAGE_ITEMS.map((item) => makeStageItem(item)),
});

// 旧バージョン(複数ステージ)のデータを単一ステージ形式に正規化
export const sanitizeStage = (sp: unknown): StageProgram => {
  const source = sp as Partial<StageProgram> | null;
  if (!source || !Array.isArray(source.items)) return seedStage();
  const items = source.items
    .filter((it) => it && typeof it === "object")
    .map((it) => makeStageItem({
      id: it.id,
      title: typeof it.title === "string" ? it.title : "",
      performer: typeof it.performer === "string" ? it.performer : "",
      start: typeof it.start === "string" ? it.start : "10:00",
      end: typeof it.end === "string" ? it.end : "10:20",
      note: typeof it.note === "string" ? it.note : "",
      canceled: !!it.canceled,
      day: it.day === 2 ? 2 : 1,
    }));
  if (items.length === 0) return seedStage();
  return {
    stageName: typeof source.stageName === "string" ? source.stageName : "体育館ステージ",
    dayLabel: source.dayLabel || "文化祭ステージ",
    days: source.days === 1 ? 1 : 2,
    rev: typeof source.rev === "number" ? source.rev : 0,
    lastUpdated: typeof source.lastUpdated === "number" ? source.lastUpdated : Date.now(),
    items,
  };
};

export const sortItems = (items: StageItem[]): StageItem[] => [...items].sort((a, b) => (toMin(a.start) ?? 9999) - (toMin(b.start) ?? 9999));

export const itemStatus = (item: StageItem, ref = nowMin()): "canceled" | "done" | "live" | "upcoming" => {
  if (item.canceled) return "canceled";
  const s = toMin(item.start), e = toMin(item.end);
  if (s == null) return "upcoming";
  if (e != null && ref >= e) return "done";
  if (ref >= s && (e == null || ref < e)) return "live";
  return "upcoming";
};

export const stageNowNext = (items: StageItem[]): { live: StageItem | null; next: StageItem | null } => {
  const sorted = sortItems(items.filter((i) => !i.canceled));
  const ref = nowMin();
  const live = sorted.find((i) => itemStatus(i, ref) === "live") || null;
  const next = sorted.find((i) => itemStatus(i, ref) === "upcoming") || null;
  return { live, next };
};

/* ═══════════ MAP HELPERS ═══════════ */

// 教室名の正規化(全角数字・各種ハイフンを統一)
export const normRoom = (s: string | null | undefined): string => String(s || "")
  .replace(/\s/g, "")
  .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0))
  .replace(/[ー−―‐]/g, "-");

// セル(教室)に対応するブースを検索: room名一致 or クラス(2年6組→2-6)一致。
// 野外企画はホームルーム教室に点灯させない(場所が二重表示されて迷子のもとになる)。
export const boothsForRoom = (booths: Booth[], name: string): Booth[] => {
  const cn = normRoom(name);
  if (!cn) return [];
  return booths.filter((bt) =>
    normRoom(bt.room) === cn ||
    (bt.orgType === "class" && bt.building !== "outdoor" && `${bt.grade}-${bt.classNum}` === cn));
};
