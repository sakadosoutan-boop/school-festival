// やなぎ祭の初期データ(src/lib/yanagi2026.ts)から、本番へ取り込むための
// バックアップ形式JSON(public/yanagi2026-import.json)を生成する。
// 実行: npm run data:json   (node --experimental-strip-types を使用)
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { YANAGI_BOOTHS, YANAGI_STAGE_ITEMS, YANAGI_STAGE_LABEL, YANAGI_STAGE_NAME } from "../src/lib/yanagi2026.ts";

const now = Date.now();

// アプリ側 makeBooth と同じ既定値でドキュメントを完成させる(取込時にも再検証される)。
const booth = (raw) => ({
  id: raw.id,
  name: raw.name,
  emoji: raw.emoji ?? "🎪",
  iconImage: "",
  category: raw.category ?? "attraction",
  products: [],
  organizer: "",
  orgType: raw.orgType ?? "class",
  grade: raw.grade ?? 2,
  classNum: raw.classNum ?? 1,
  orgName: raw.orgName ?? "",
  building: raw.building ?? "hr",
  floor: raw.floor ?? 1,
  room: raw.room ?? "",
  location: "",
  description: raw.description ?? "",
  isOpen: false, // 開場までは準備中で配布する
  peopleInLine: 0,
  capacity: raw.capacity ?? 2,
  cycleSeconds: raw.cycleSeconds ?? 180,
  waitMinutes: 0,
  history: [],
  cycleHistory: [],
  lastUpdated: now,
  lastServedAt: null,
  undoSnapshot: null,
  rev: 1,
});

const stageItem = (raw) => ({
  id: raw.id,
  title: raw.title ?? "",
  performer: raw.performer ?? "",
  start: raw.start ?? "10:00",
  end: raw.end ?? "10:20",
  note: raw.note ?? "",
  canceled: false,
  day: raw.day === 2 ? 2 : 1,
  emoji: raw.emoji ?? "🎤",
  iconImage: "",
  description: raw.description ?? "",
  venue: raw.venue ?? "体育館ステージ",
});

const payload = {
  app: "まちたいむ",
  version: 6,
  exportedAt: new Date().toISOString(),
  booths: YANAGI_BOOTHS.map(booth),
  stage: {
    stageName: YANAGI_STAGE_NAME,
    dayLabel: YANAGI_STAGE_LABEL,
    days: 2,
    rev: 1,
    lastUpdated: now,
    items: YANAGI_STAGE_ITEMS.map(stageItem),
    // 演劇部・音楽部・放送部の公演は、後から会場を選んで追加できる
    venues: ["体育館ステージ", "音楽部（音楽室）", "演劇部（視聴覚室）", "放送部"],
  },
};

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "yanagi2026-import.json");
writeFileSync(out, JSON.stringify(payload, null, 2));
console.log(`yanagi2026-import.json  booths=${payload.booths.length}  stage items=${payload.stage.items.length}`);
