import type { Booth } from "../types";
import { allSoldOut, BUILDINGS, CATEGORIES, formatLocation, formatOrganizer, todayFestivalDay } from "./festival";

/* ═══════════ 来場者画面むけの純粋ヘルパー ═══════════
   画面から計算ロジックを切り離し、テストしやすい形にまとめる。 */

/** 一覧の表示密度。compact=1行カード / rich=推移グラフ付きの詳しいカード */
export type Density = "compact" | "rich";

export const isDensity = (value: unknown): value is Density => value === "compact" || value === "rich";

// types.ts は別担当の管理下にあるため、kidsFriendly が未追加のビルドでも
// 型エラーにならない形で読み取る(値がtrueのときだけ表示する)。
export const isKidsFriendly = (booth: Booth): boolean =>
  (booth as unknown as { kidsFriendly?: boolean }).kidsFriendly === true;

/* ── 入場終了のお知らせ(やなぎ祭: 10:00〜16:00・校舎入場は15:30まで) ── */

export const ENTRY_CLOSE_MIN = 15 * 60 + 30; // 校舎への入場終了 15:30
export const GENERAL_CLOSE_MIN = 16 * 60; // 一般公開終了 16:00
const WARN_BEFORE_MIN = 30;

export interface ClosingNotice {
  level: "soon" | "closed";
  title: string;
  body: string;
  minutesLeft: number;
}

/** JSTでの「0時からの経過分」 */
const jstMinutesOfDay = (now: number): number => {
  const d = new Date(now + 9 * 3600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

/**
 * 一般公開が完全に終わったか(16:00以降、または開催日以外)。
 * 15:30〜16:00は校舎への入場が終わっただけで、中の企画はまだ営業しているので終了扱いにしない。
 * 閉店を押し忘れた企画が残っていても、終了後は待ち時間を信じさせないために使う。
 */
export function festivalFinished(now: number = Date.now()): boolean {
  if (todayFestivalDay(now) == null) return true;
  return jstMinutesOfDay(now) >= GENERAL_CLOSE_MIN;
}

/** 開催日だけ、入場終了30分前から案内を出す(開催日以外はnull)。 */
export function closingNotice(now: number = Date.now()): ClosingNotice | null {
  if (todayFestivalDay(now) == null) return null;
  const minutes = jstMinutesOfDay(now);
  if (minutes >= ENTRY_CLOSE_MIN) {
    return {
      level: "closed",
      title: "校舎への入場は終了しました",
      body: minutes >= GENERAL_CLOSE_MIN
        ? "本日の一般公開は終了しました。ご来場ありがとうございました！"
        : "一般公開は16:00までです。校舎内の企画は順次片付けに入ります。",
      minutesLeft: 0,
    };
  }
  if (minutes >= ENTRY_CLOSE_MIN - WARN_BEFORE_MIN) {
    const left = ENTRY_CLOSE_MIN - minutes;
    return {
      level: "soon",
      title: "まもなく校舎入場が終了します(15:30)",
      body: `のこり約${left}分。気になる企画はお早めにどうぞ(ステージ発表は15:20ごろまで)。`,
      minutesLeft: left,
    };
  }
  return null;
}

/* ── 待ち時間の推移サマリー ── */

/** 「◯分前」「◯時間前」。細かすぎる値は5分単位に丸めて読みやすくする。 */
export const agoLabel = (ms: number): string => {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 1) return "たった今";
  if (minutes < 10) return `${minutes}分前`;
  if (minutes < 60) return `${Math.round(minutes / 5) * 5}分前`;
  return `${Math.round(minutes / 60)}時間前`;
};

export interface WaitSummary {
  min: number;
  max: number;
  /** グラフ左端の時刻ラベル(例:「1時間前」) */
  startLabel: string;
  /** ふつうの言葉での要約(例:「30分前より空いています(-8分)」) */
  sentence: string;
  points: number;
}

export function summarizeWaitHistory(history: Booth["history"], now: number = Date.now()): WaitSummary | null {
  const pts = (history ?? []).filter((h) => h && typeof h.wait === "number").slice(-20);
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (pts.length < 2 || !first || !last) return null;

  const waits = pts.map((p) => p.wait);
  // 比較元は「25分以上前で最も新しい記録」。無ければ最古の記録と比べる。
  const older = [...pts].reverse().find((p) => p.ts && now - p.ts >= 25 * 60_000) ?? first;
  const diff = last.wait - older.wait;
  const refLabel = older.ts ? agoLabel(now - older.ts) : "さきほど";
  const sentence = Math.abs(diff) < 3
    ? `${refLabel}とほぼ同じ混み具合です`
    : diff < 0
      ? `${refLabel}より空いています(${diff}分)`
      : `${refLabel}より混んでいます(+${diff}分)`;

  return {
    min: Math.min(...waits),
    max: Math.max(...waits),
    startLabel: first.ts ? agoLabel(now - first.ts) : "はじめ",
    sentence,
    points: pts.length,
  };
}

/* ── おすすめコース ── */

export interface Course {
  id: string;
  emoji: string;
  title: string;
  note: string;
  booths: Booth[];
}

// 校内マップの並び順。同じ棟をまとめて回れるように並べ替える。
const buildingOrder = (id: string): number => {
  const idx = BUILDINGS.findIndex((b) => b.id === id);
  return idx === -1 ? BUILDINGS.length : idx;
};

/** 棟→階の順に並べ替える(棟の行き来を減らすため) */
const routeOrder = (list: Booth[]): Booth[] => [...list].sort((a, b) =>
  buildingOrder(a.building) - buildingOrder(b.building)
  || (a.floor || 0) - (b.floor || 0)
  || a.waitMinutes - b.waitMinutes);

/** 営業中・空いている順を優先して候補を絞る */
const preferOpen = (list: Booth[]): Booth[] => [...list].sort((a, b) =>
  Number(b.isOpen) - Number(a.isOpen)
  || Number(allSoldOut(a)) - Number(allSoldOut(b))
  || a.waitMinutes - b.waitMinutes);

/** 待ち時間＋滞在10分で所要時間をざっくり見積もる(10分単位) */
export const estimateCourseMinutes = (list: Booth[]): number => {
  const total = list.reduce((sum, b) => sum + Math.max(0, b.waitMinutes) + 10, 0);
  return Math.max(10, Math.round(total / 10) * 10);
};

const makeCourse = (id: string, emoji: string, title: string, list: Booth[]): Course => ({
  id, emoji, title,
  note: `所要 約${estimateCourseMinutes(list)}分 · ${list.length}企画`,
  booths: list,
});

/**
 * いまのデータから2〜3本のおすすめコースを自動生成する。
 * 候補が2件未満のコースは出さない(開場前は「今すぐ回れる」が空になるため)。
 */
/* 文化部の判定。orgType が "club" でも、運動部の招待試合(category:other)や
   同窓会・PTAのような団体まで入ってしまい「文化部めぐり」にならなかった。
   作品・体験・上演・お茶を出す企画だけを文化部として拾う。 */
const CULTURE_CATEGORIES = new Set(["exhibition", "experience", "stage", "food"]);
export const isCultureClub = (booth: Booth): boolean =>
  booth.orgType === "club" && CULTURE_CATEGORIES.has(booth.category);

export function buildCourses(booths: Booth[], perCourse = 5): Course[] {
  const usable = booths.filter((b) => b.name);
  const courses: Course[] = [];
  const add = (id: string, emoji: string, title: string, list: Booth[]) => {
    const picked = routeOrder(preferOpen(list).slice(0, perCourse));
    if (picked.length >= 2) courses.push(makeCourse(id, emoji, title, picked));
  };

  // 並べた順に採用され、上限で打ち切られる。当日いちばん役に立つものから並べる。
  add("quick", "⚡", "今すぐ回れるコース", usable.filter((b) => b.isOpen && !allSoldOut(b) && b.waitMinutes <= 10));
  add("food", "🍡", "腹ごしらえコース", usable.filter((b) => b.category === "food" && !allSoldOut(b)));
  add("play", "🎯", "遊びつくすコース", usable.filter((b) => b.category === "game" || b.category === "attraction"));
  add("club", "🎨", "文化部めぐり", usable.filter(isCultureClub));
  add("kids", "👶", "お子さま連れコース", usable.filter(isKidsFriendly));
  add("exhibition", "🖼️", "作品をじっくり見るコース", usable.filter((b) => b.category === "exhibition"));
  add("class", "🏫", "クラス企画めぐり", usable.filter((b) => b.orgType === "class"));

  return courses.slice(0, 5);
}

/* ═══════════ 検索の言い換え ═══════════
   来場者は団体名を知らないまま「食べ物」「ゲーム」など一般語で探すため、
   カテゴリ名とその言い換えも検索対象に含める。 */
const CATEGORY_ALIASES: Record<string, string[]> = {
  food: ["フード", "食べ物", "たべもの", "food", "飲食", "軽食", "food"],
  attraction: ["アトラクション", "乗り物", "体験型"],
  game: ["ゲーム", "遊び", "あそび", "game"],
  experience: ["体験", "たいけん", "ワークショップ", "手作り"],
  stage: ["ステージ", "発表", "公演", "ライブ"],
  exhibition: ["展示", "てんじ", "作品"],
  other: ["その他", "そのほか"],
};

/**
 * 紹介文が未入力のブース向けに、表示だけのかわり文を組み立てる。
 * ここで作った文はあくまで画面表示用で、保存はしない
 * (生徒があとから本文を入れたら、そちらが必ず優先される)。
 */
export function fallbackDescription(booth: Booth): string {
  const org = formatOrganizer(booth);
  const place = formatLocation(booth);
  const category = CATEGORIES.find((c) => c.id === booth.category);
  const label = category && category.id !== "all" && category.id !== "other" ? category.label : "";
  const who = org ? `${org}の` : "";
  const what = label ? `${label}企画` : "企画";
  const where = place ? `${place}で開催します。` : "";
  const products = (booth.products || []).map((p) => p.name).filter(Boolean).slice(0, 3);
  const items = products.length ? `${products.join("・")}などを用意しています。` : "";
  return `${who}${what}です。${where}${items}くわしくは会場でご確認ください。`.replace(/。+/g, "。");
}

/** ブースを検索するときの対象文字列(名前・団体・場所に加え、カテゴリの言い換えも含む) */
export function boothSearchText(booth: Booth): string {
  const parts: unknown[] = [
    booth.name, booth.orgName, booth.organizer, booth.room, booth.description,
    `${booth.grade}年${booth.classNum}組`,
    ...(CATEGORY_ALIASES[booth.category] ?? []),
  ];
  if (isKidsFriendly(booth)) parts.push("お子さま", "子ども", "こども");
  (booth.products ?? []).forEach((p) => { parts.push(p.name); (p.allergens ?? []).forEach((a) => parts.push(a)); });
  return parts.filter(Boolean).join(" ");
}
