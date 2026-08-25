import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronLeft, Clock, Coffee, MapPin, Plus, RefreshCw, Settings, Sparkles, Trash2, Upload, X } from "lucide-react";
import {
  EMOJI_PALETTE, itemStatus, MAIN_STAGE, makeStageItem, makeStagePerformer, MAX_PERFORMERS, minToHHMM, nowMin,
  PERFORMER_DESC_MAX, PERFORMER_EMOJI_PALETTE, PERFORMER_NAME_MAX, PERFORMER_ROLE_MAX, PERFORMER_ROLE_PRESETS,
  seedStage, sortItems, STAGE_VENUES, stageNowNext, THEME, toMin, todayFestivalDay,
} from "../lib/festival";
import type { StageItem, StagePerformer, StageProgram } from "../types";
import { Confirm, EmptyState, Field, fileToIconDataUrl, Hint, IconButton, Sheet, TimeStepper } from "./ui";

/* ── 公演アイコン: ブースと同じく画像 or 絵文字 ── */
const StageIcon = ({ item, size = 40, rounded = 12, emojiClass = "text-xl" }: { item: StageItem; size?: number; rounded?: number; emojiClass?: string }) => (
  item.iconImage
    ? <img src={item.iconImage} alt={item.title || "icon"} style={{ width: size, height: size, borderRadius: rounded, objectFit: "cover" }} className="flex-shrink-0" />
    : <span className={emojiClass} style={{ lineHeight: 1 }}>{item.emoji || "🎤"}</span>
);

/* ── 時刻まわりの小さなヘルパー(あと◯分・進行度%・所要時間の表示) ── */
const minutesUntil = (hhmm: string, ref: number): number => Math.max(0, (toMin(hhmm) ?? ref) - ref);
const minutesLeftOf = (item: StageItem, ref: number): number => Math.max(0, (toMin(item.end) ?? ref) - ref);
const progressOf = (item: StageItem, ref: number): number => {
  const s = toMin(item.start), e = toMin(item.end);
  if (s == null || e == null || e <= s) return 0;
  return Math.min(100, Math.max(0, ((ref - s) / (e - s)) * 100));
};
const formatStageDuration = (min: number): string => {
  if (min <= 0) return "0分";
  if (min < 60) return `${min}分`;
  const h = Math.floor(min / 60), m = min % 60;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
};
// スクリーンリーダー向けの読み上げ名(タイトル・出演者・時刻・会場をひとまとめに)
const stageItemAriaLabel = (item: StageItem, venue: string): string => {
  const parts = [item.title || "無題の公演"];
  if (item.performer) parts.push(item.performer);
  parts.push(`${item.start}から${item.end}`);
  parts.push(venue);
  if (item.canceled) parts.push("中止");
  return parts.join("・");
};

/* ── 出演者(個人)の表示 ──
   同じ肩書きごとにまとめて並べる。意気込みが未入力の人も名前だけは出す。 */
const performerGroups = (list: StagePerformer[]): { role: string; members: StagePerformer[] }[] => {
  const order: string[] = [];
  const byRole = new Map<string, StagePerformer[]>();
  for (const p of list) {
    const key = p.role.trim();
    if (!byRole.has(key)) { byRole.set(key, []); order.push(key); }
    byRole.get(key)!.push(p);
  }
  return order.map((role) => ({ role, members: byRole.get(role)! }));
};

const PerformerCard = ({ performer }: { performer: StagePerformer }) => (
  <div className="p-3.5 rounded-2xl border" style={{ background: "var(--surface)", borderColor: `${THEME.purple}26` }}>
    <div className="flex items-center gap-2.5 mb-1.5">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ background: "#f3ecff" }}>
        {performer.emoji || "🎤"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-black text-[15px] truncate" style={{ color: "var(--ink)" }}>{performer.name || "(名前未設定)"}</div>
        {performer.role && (
          <span className="inline-block text-[10px] font-black px-2 py-0.5 rounded-full mt-0.5"
            style={{ background: `${THEME.purple}1a`, color: THEME.purple }}>{performer.role}</span>
        )}
      </div>
    </div>
    {performer.description
      ? <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--ink)" }}>{performer.description}</p>
      : <p className="text-[13px]" style={{ color: "var(--ink-soft)" }}>意気込みはまだ登録されていません</p>}
  </div>
);

export const PerformerList = ({ performers }: { performers: StagePerformer[] }) => (
  <div className="mt-5">
    <div className="flex items-baseline gap-2 mb-2.5">
      <div className="text-sm font-black" style={{ color: "var(--ink)" }}>出演者</div>
      <div className="text-[11px] font-bold" style={{ color: "var(--ink-soft)" }}>{performers.length}名</div>
    </div>
    <div className="space-y-3">
      {performerGroups(performers).map(({ role, members }) => (
        <div key={role || "_"}>
          {role && (
            <div className="text-[11px] font-black mb-1.5 flex items-center gap-1.5" style={{ color: THEME.purple }}>
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: THEME.purple }} />
              {role}（{members.length}名）
            </div>
          )}
          <div className="space-y-2">
            {members.map((p) => <PerformerCard key={p.id} performer={p} />)}
          </div>
        </div>
      ))}
    </div>
  </div>
);

/* ── 公演の詳細シート(来場者向け) ── */
const StageItemDetailSheet = ({ item, refMin, onClose }: { item: StageItem; refMin: number; onClose: () => void }) => {
  const st = itemStatus(item, refMin);
  const performers = item.performers ?? [];
  return (
    <Sheet onClose={onClose} title="公演の詳細">
      <div className="px-6 pt-2 pb-8">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center overflow-hidden flex-shrink-0 border"
            style={{ background: "#f3ecff", borderColor: `${THEME.purple}33` }}>
            <StageIcon item={item} size={80} rounded={22} emojiClass="text-5xl" />
          </div>
          <div className="flex-1 min-w-0 pt-1">
            <div className="text-xs font-semibold text-stone-500 mb-1">{item.day || 1}日目 · {item.start}〜{item.end}</div>
            <h2 className={`text-2xl font-black tracking-tight mb-1 ${item.canceled ? "line-through text-stone-400" : "text-stone-900"}`}>{item.title || "(無題)"}</h2>
            {item.performer && <div className="text-sm text-stone-500">{item.performer}</div>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 mb-4 flex-wrap">
          {item.canceled ? <span className="text-xs font-black px-2.5 py-1 rounded-full bg-red-100 text-red-600">中止</span>
            : st === "live" ? <span className="text-xs font-black px-2.5 py-1 rounded-full text-white" style={{ background: THEME.pink }}>● ただいま上演中</span>
            : st === "done" ? <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-stone-100 text-stone-500">終了</span>
            : <span className="text-xs font-black px-2.5 py-1 rounded-full" style={{ background: "#f3ecff", color: THEME.purple }}>これから上演</span>}
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-stone-100 text-stone-600">🎤 {item.venue || MAIN_STAGE}</span>
        </div>
        {st === "live" && !item.canceled && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-[11px] text-stone-500 font-bold mb-1">
              <span>進行状況</span><span>あと{minutesLeftOf(item, refMin)}分で終了</span>
            </div>
            <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden" role="progressbar"
              aria-valuenow={Math.round(progressOf(item, refMin))} aria-valuemin={0} aria-valuemax={100} aria-label="上演の進行状況">
              <div className="h-full rounded-full" style={{ width: `${progressOf(item, refMin)}%`, background: THEME.pink }} />
            </div>
          </div>
        )}
        {item.note && <div className="mb-4 p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-900 leading-relaxed">📢 {item.note}</div>}
        {item.description
          ? <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">{item.description}</p>
          : performers.length === 0 && <p className="text-sm text-stone-400">紹介文はまだ登録されていません</p>}
        {performers.length > 0 && <PerformerList performers={performers} />}
      </div>
    </Sheet>
  );
};

/* ═══════════ STAGE — GUEST VIEW ═══════════ */

/* タイムテーブルの表示密度(ズーム)。ゆったり=旧来どおりの詳細表示、コンパクト=間隔を圧縮してスマホ1画面に収める。 */
type StageDensity = "spacious" | "normal" | "compact";
const DENSITY_LEVELS: { id: StageDensity; label: string }[] = [
  { id: "spacious", label: "ゆったり" },
  { id: "normal", label: "ふつう" },
  { id: "compact", label: "コンパクト" },
];
const DENSITY_CONFIG: Record<StageDensity, { pxPerMin: number; gapThreshold: number; minBlockH: number }> = {
  // gapThreshold(分)以上の空き時間は「休憩」として圧縮する。ゆったりは無限大=圧縮なし(旧来の見た目)
  spacious: { pxPerMin: 3.0, gapThreshold: Infinity, minBlockH: 40 },
  normal: { pxPerMin: 2.0, gapThreshold: 26, minBlockH: 36 },
  compact: { pxPerMin: 1.5, gapThreshold: 16, minBlockH: 32 },
};
const STAGE_DENSITY_KEY = "festival:stageDensity";
// 初期表示密度: 前回選んだ設定を保存していればそれを、無ければ画面幅で決める(スマホ幅はコンパクト寄りに)
const initialStageDensity = (): StageDensity => {
  try {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(STAGE_DENSITY_KEY) : null;
    if (saved === "spacious" || saved === "normal" || saved === "compact") return saved;
  } catch { /* プライベートブラウズ等でlocalStorageが使えなくても無視 */ }
  return (typeof window !== "undefined" && window.innerWidth >= 640) ? "normal" : "compact";
};

export const StageView = ({ program, tick }: { program: StageProgram; tick: number }) => {
  const dayCount = program?.days || 1;
  // 開催当日は自動でその日のタブを開く(それ以外は1日目)
  const [day, setDay] = useState(() => Math.min(todayFestivalDay() ?? 1, program?.days || 1));
  const [mode, setMode] = useState<"grid" | "list">("grid");
  const [density, setDensity] = useState<StageDensity>(initialStageDensity);
  const [detail, setDetail] = useState<StageItem | null>(null);

  useEffect(() => {
    try { window.localStorage.setItem(STAGE_DENSITY_KEY, density); } catch { /* 保存できなくても表示自体には影響しない */ }
  }, [density]);

  // 実際に公演がある会場だけをタブに出す(演劇部・音楽部・放送部などは登録されるまで隠す)。
  // 体育館ステージは常に先頭。
  const venueOf = (i: StageItem) => i.venue || MAIN_STAGE;
  const activeVenues = useMemo(() => {
    const set = new Set<string>();
    (program?.items || []).forEach((i) => set.add(venueOf(i)));
    const list = [...set];
    return [MAIN_STAGE, ...list.filter((v) => v !== MAIN_STAGE)].filter((v) => set.has(v));
  }, [program]);
  const [venue, setVenue] = useState(MAIN_STAGE);
  const activeVenue = activeVenues.includes(venue) ? venue : (activeVenues[0] ?? MAIN_STAGE);

  const dayItems = useMemo(
    () => (program ? sortItems(program.items.filter((i) => (i.day || 1) === day && venueOf(i) === activeVenue)) : []),
    // tickで20秒ごとに再計算し、上演中/終了の表示を時刻に追従させる
    [program, day, activeVenue, tick],
  );
  const { live, next } = useMemo(
    () => (program ? stageNowNext(program.items.filter((i) => (i.day || 1) === day && venueOf(i) === activeVenue)) : { live: null, next: null }),
    [program, day, activeVenue, tick],
  );
  const ref = nowMin();
  const items = dayItems;
  const allCanceled = items.length > 0 && items.every((i) => i.canceled);
  const untilNext = next ? minutesUntil(next.start, ref) : 0;

  // 空表示のヒント用: 他の日・他の会場に公演が登録されているか
  const otherDaysWithItems = useMemo(() => {
    if (!program || dayCount <= 1) return [];
    const set = new Set<number>();
    program.items.forEach((i) => { if ((i.day || 1) !== day) set.add(i.day || 1); });
    return [...set].sort((a, b) => a - b);
  }, [program, day, dayCount]);
  const otherVenuesToday = useMemo(() => {
    if (!program || activeVenues.length <= 1) return [];
    const set = new Set<string>();
    program.items.forEach((i) => { if ((i.day || 1) === day && venueOf(i) !== activeVenue) set.add(venueOf(i)); });
    return [...set];
  }, [program, day, activeVenue, activeVenues.length]);

  const DayTabs = dayCount > 1 ? (
    <div className="flex gap-2 mb-3" role="group" aria-label="開催日を選択">
      {Array.from({ length: dayCount }).map((_, i) => {
        const d = i + 1;
        return (
          <button key={d} type="button" onClick={() => setDay(d)} aria-pressed={day === d}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-black transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-400 ${day === d ? "text-white shadow-md" : "bg-white text-stone-600 border border-stone-200"}`}
            style={day === d ? { background: "linear-gradient(135deg,#ff4d8d,#9b5de5)" } : {}}>
            {d}日目
          </button>
        );
      })}
    </div>
  ) : null;

  // 会場が2つ以上あるときだけ会場切り替えを表示する
  const VenueTabs = activeVenues.length > 1 ? (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-none touch-pan-x -mx-1 px-1 mb-3" role="group" aria-label="会場を選択">
      {activeVenues.map((v) => (
        <button key={v} type="button" onClick={() => setVenue(v)} aria-pressed={activeVenue === v}
          className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-extrabold transition-all active:scale-95 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-purple-400 ${activeVenue === v ? "text-white shadow-sm border-transparent" : "bg-white text-stone-600 border-stone-200"}`}
          style={activeVenue === v ? { background: "linear-gradient(135deg,#9b5de5,#4cc9f0)" } : {}}>
          {v === MAIN_STAGE ? "🎤 " : "🎪 "}{v}
        </button>
      ))}
    </div>
  ) : null;

  const ModeToggle = (
    <div className="flex items-center gap-1 p-1 bg-white rounded-full border border-stone-200 w-fit" role="group" aria-label="表示形式を選択">
      {([{ id: "grid", label: "タイムテーブル" }, { id: "list", label: "リスト" }] as const).map((m) => (
        <button key={m.id} type="button" onClick={() => setMode(m.id)} aria-pressed={mode === m.id}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-pink-400 ${mode === m.id ? "text-white" : "text-stone-500"}`}
          style={mode === m.id ? { background: "linear-gradient(135deg,#ff4d8d,#9b5de5)" } : {}}>
          {m.label}
        </button>
      ))}
    </div>
  );

  // ズーム(表示密度)。リストモードでは使わないのでグリッド表示のときだけ出す
  const DensityControl = mode === "grid" ? (
    <div className="flex items-center gap-1 p-1 bg-white rounded-full border border-stone-200" role="group" aria-label="タイムテーブルの表示密度">
      {DENSITY_LEVELS.map((o) => (
        <button key={o.id} type="button" onClick={() => setDensity(o.id)} aria-pressed={density === o.id}
          className={`px-2.5 py-1.5 rounded-full text-[11px] font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-purple-400 ${density === o.id ? "text-white" : "text-stone-500"}`}
          style={density === o.id ? { background: "linear-gradient(135deg,#9b5de5,#4cc9f0)" } : {}}>
          {o.label}
        </button>
      ))}
    </div>
  ) : null;

  if (!program || (program.items || []).length === 0) {
    return (
      <>
        <StageHeader program={program} />
        <main className="max-w-xl mx-auto px-4 pt-6">
          {DayTabs}
          <EmptyState icon="🎤" title="プログラムは準備中です" message="公演が登録されると、ここにタイムテーブルが表示されます" />
        </main>
      </>
    );
  }

  return (
    <>
      <StageHeader program={program} />
      <main className="max-w-2xl mx-auto px-4 pt-4">
        {DayTabs}
        {VenueTabs}

        {/* 公演が1件もない会場・日はヒーローカードを出さない(「終了しました」等の誤解を避ける) */}
        {items.length > 0 && (
          <div className="rounded-[26px] p-5 mb-4 relative overflow-hidden" style={{ background: THEME.festGradient }}>
            <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle,#fff 1.5px,transparent 1.5px)", backgroundSize: "20px 20px" }} />
            <div className="relative">
              {live ? (
                <>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 text-xs font-black mb-2" style={{ color: THEME.pinkDeep }}>
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> ただいま上演中
                  </div>
                  <div className="text-2xl font-black text-white drop-shadow-sm leading-tight">{live.title}</div>
                  {live.performer && <div className="text-sm text-white/90 font-bold mt-0.5">{live.performer}</div>}
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs text-white/85 font-bold">
                    <MapPin size={12} strokeWidth={2.6} className="flex-shrink-0" />
                    <span className="truncate">{activeVenue}</span>
                    <span className="opacity-60">·</span>
                    <span className="tabular-nums flex-shrink-0">{live.start} 〜 {live.end}</span>
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[11px] text-white/85 font-bold mb-1">
                      <span>進行状況</span>
                      <span>あと{minutesLeftOf(live, ref)}分で終了</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/25 overflow-hidden" role="progressbar"
                      aria-valuenow={Math.round(progressOf(live, ref))} aria-valuemin={0} aria-valuemax={100}
                      aria-label={`${live.title}の進行状況`}>
                      <div className="h-full rounded-full bg-white" style={{ width: `${progressOf(live, ref)}%` }} />
                    </div>
                  </div>
                </>
              ) : next ? (
                <>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 text-xs font-black mb-2" style={{ color: THEME.purple }}>
                    🎬 {untilNext <= 30 ? "まもなく開演" : "次の公演"}
                  </div>
                  <div className="text-2xl font-black text-white drop-shadow-sm leading-tight">{next.title}</div>
                  {next.performer && <div className="text-sm text-white/90 font-bold mt-0.5">{next.performer}</div>}
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs text-white/85 font-bold">
                    <MapPin size={12} strokeWidth={2.6} className="flex-shrink-0" />
                    <span className="truncate">{activeVenue}</span>
                  </div>
                  <div className="text-sm text-white/95 mt-2 font-black">
                    {next.start} 開演（あと{untilNext}分）
                  </div>
                </>
              ) : allCanceled ? (
                <>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 text-xs font-black mb-2 text-stone-600">本日中止</div>
                  <div className="text-xl font-black text-white drop-shadow-sm">本日の公演はすべて中止となりました</div>
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs text-white/85 font-bold">
                    <MapPin size={12} strokeWidth={2.6} className="flex-shrink-0" /> <span className="truncate">{activeVenue}</span>
                  </div>
                  <div className="text-sm text-white/90 mt-1">最新情報は会場の掲示でご確認ください</div>
                </>
              ) : (
                <>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 text-xs font-black mb-2 text-stone-600">本日終了</div>
                  <div className="text-xl font-black text-white drop-shadow-sm">本日のステージは終了しました</div>
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs text-white/85 font-bold">
                    <MapPin size={12} strokeWidth={2.6} className="flex-shrink-0" /> <span className="truncate">{activeVenue}</span>
                  </div>
                  <div className="text-sm text-white/90 mt-0.5">ご来場ありがとうございました！</div>
                </>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          {ModeToggle}
          {DensityControl}
        </div>

        {items.length === 0 ? (
          <StageEmptyBlock
            venue={activeVenue} day={day} dayCount={dayCount}
            otherDays={otherDaysWithItems} otherVenues={otherVenuesToday}
            onJumpDay={setDay} onJumpVenue={setVenue}
          />
        ) : mode === "grid" ? (
          <>
            <RockinGrid items={items} refMin={ref} onTap={setDetail} venue={activeVenue} density={density} />
            <div className="mt-5">
              <div className="text-xs font-bold mb-2" style={{ color: THEME.ink }}>出演団体（タップで紹介を表示）</div>
              <div className="grid grid-cols-1 gap-2">
                {items.map((item) => {
                  const st = itemStatus(item, ref);
                  return (
                    <button key={item.id} type="button" onClick={() => setDetail(item)}
                      aria-label={stageItemAriaLabel(item, activeVenue)}
                      className="w-full text-left flex items-center gap-3 p-3 bg-white rounded-2xl border border-stone-200 hover:border-stone-300 active:scale-[0.99] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0" style={{ background: "#f3ecff" }}>
                        <StageIcon item={item} size={40} rounded={12} emojiClass="text-xl" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`font-bold truncate text-sm ${item.canceled ? "line-through text-stone-400" : "text-stone-900"}`}>{item.title || "(無題)"}</div>
                        <div className="text-xs text-stone-500 truncate">{item.performer || "出演者未設定"}</div>
                        {item.performers && item.performers.length > 0 && (
                          <div className="mt-1 flex items-center gap-1 flex-wrap">
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full" style={{ background: `${THEME.purple}1a`, color: THEME.purple }}>
                              👥 出演{item.performers.length}名
                            </span>
                            <span className="text-[10px] font-bold text-stone-400">意気込みを見る</span>
                          </div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-black tabular-nums" style={{ color: THEME.ink }}>{item.start}</div>
                        {item.canceled ? <div className="text-[10px] font-black text-red-600">中止</div>
                          : st === "live" ? <div className="text-[10px] font-black" style={{ color: THEME.pink }}>上演中</div>
                          : st === "done" ? <div className="text-[10px] font-bold text-stone-400">終了</div>
                          : <div className="text-[10px] font-bold text-stone-400">〜{item.end}</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <StageListView items={items} refMin={ref} venue={activeVenue} nextId={next?.id ?? null} onTap={setDetail} />
        )}

        <div className="text-center text-[11px] text-stone-400 mt-6 font-medium">
          ⏱ 自動更新 · 進行状況は時刻から自動判定されます
        </div>
      </main>

      {detail && <StageItemDetailSheet item={detail} refMin={ref} onClose={() => setDetail(null)} />}
    </>
  );
};

/* ── 公演が1件もない会場・日の案内(他の日程/会場に飛べるヒント付き) ── */
const StageEmptyBlock = ({ venue, day, dayCount, otherDays, otherVenues, onJumpDay, onJumpVenue }: {
  venue: string; day: number; dayCount: number; otherDays: number[]; otherVenues: string[];
  onJumpDay: (d: number) => void; onJumpVenue: (v: string) => void;
}) => (
  <div className="text-center py-14 px-5 bg-white rounded-2xl border border-dashed border-stone-300">
    <div className="text-5xl mb-3">🎤</div>
    <div className="font-bold text-stone-700 mb-1">
      {dayCount > 1 ? `${day}日目の` : ""}「{venue}」の公演はまだ登録されていません
    </div>
    <div className="text-sm text-stone-500 mb-4 leading-relaxed">プログラムが公開されると、ここにタイムテーブルが表示されます</div>
    {(otherDays.length > 0 || otherVenues.length > 0) && (
      <>
        <div className="text-[11px] font-bold text-stone-400 mb-2">
          他の{otherDays.length > 0 && otherVenues.length > 0 ? "日程・会場" : otherDays.length > 0 ? "日程" : "会場"}に公演があります
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {otherDays.map((d) => (
            <button key={`d${d}`} type="button" onClick={() => onJumpDay(d)}
              className="text-xs font-bold px-3 py-1.5 rounded-full text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-pink-400"
              style={{ background: "linear-gradient(135deg,#ff4d8d,#9b5de5)" }}>
              {d}日目を見る
            </button>
          ))}
          {otherVenues.map((v) => (
            <button key={`v${v}`} type="button" onClick={() => onJumpVenue(v)}
              className="text-xs font-bold px-3 py-1.5 rounded-full text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-purple-400"
              style={{ background: "linear-gradient(135deg,#9b5de5,#4cc9f0)" }}>
              {v === MAIN_STAGE ? "🎤 " : "🎪 "}{v}
            </button>
          ))}
        </div>
      </>
    )}
  </div>
);

/* ── リスト表示: 時間帯でゆるくグルーピングし、スマホで縦にスキャンしやすい行にする ── */
const TIME_PERIODS: { id: string; label: string; test: (min: number) => boolean }[] = [
  { id: "am", label: "午前", test: (m) => m < 720 },
  { id: "pm", label: "午後", test: (m) => m >= 720 && m < 1020 },
  { id: "eve", label: "夕方以降", test: (m) => m >= 1020 },
];

const StageListView = ({ items, refMin, venue, nextId, onTap }: { items: StageItem[]; refMin: number; venue: string; nextId: string | null; onTap: (item: StageItem) => void }) => {
  const groups = useMemo(() => {
    const byPeriod = TIME_PERIODS.map((p) => ({ ...p, items: [] as StageItem[] }));
    for (const item of items) {
      const s = toMin(item.start) ?? 0;
      const period = byPeriod.find((p) => p.test(s)) ?? byPeriod[byPeriod.length - 1]!;
      period.items.push(item);
    }
    return byPeriod.filter((p) => p.items.length > 0);
  }, [items]);
  // 全公演が同じ時間帯に収まるなら見出しは出さない(かえって邪魔になるため)
  const showHeaders = groups.length > 1;

  return (
    <div>
      <div className="text-xs font-bold mb-2" style={{ color: THEME.ink }}>タイムテーブル（{items.length}公演）</div>
      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.id}>
            {showHeaders && (
              <div className="flex items-center gap-2 mb-1.5 px-0.5">
                <span className="text-[11px] font-black text-stone-400">{group.label}</span>
                <div className="flex-1 h-px bg-stone-200" />
              </div>
            )}
            <div className="space-y-1.5">
              {group.items.map((item) => {
                const st = itemStatus(item, refMin);
                const isLive = st === "live";
                const isNext = item.id === nextId;
                const faded = st === "done" || st === "canceled";
                const barColor = isLive ? THEME.pink : item.canceled || st === "done" ? "#d6d3d1" : isNext ? THEME.purple : `${THEME.purple}55`;
                return (
                  <button key={item.id} type="button" onClick={() => onTap(item)}
                    aria-label={stageItemAriaLabel(item, venue)}
                    className="w-full text-left flex items-center gap-2.5 pl-2.5 pr-3 py-2.5 rounded-xl border bg-white transition-all active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
                    style={{
                      borderColor: isLive ? `${THEME.pink}66` : "#e7e5e4",
                      borderLeftWidth: 4, borderLeftColor: barColor,
                      opacity: faded ? 0.6 : 1,
                      boxShadow: isLive ? `0 2px 10px ${THEME.pink}22` : "none",
                    }}>
                    <div className="text-center flex-shrink-0 w-11">
                      <div className="text-xs font-black tabular-nums" style={{ color: THEME.ink }}>{item.start}</div>
                      <div className="text-[9px] text-stone-400 tabular-nums">{item.end}</div>
                    </div>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0" style={{ background: "#f3ecff" }}>
                      <StageIcon item={item} size={32} rounded={7} emojiClass="text-base" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-bold text-sm truncate ${item.canceled ? "line-through text-stone-400" : ""}`} style={{ color: faded ? "#a8a29e" : THEME.ink }}>{item.title || "(無題)"}</div>
                      {item.performer && <div className="text-[11px] text-stone-500 truncate">{item.performer}</div>}
                    </div>
                    <div className="flex-shrink-0">
                      {item.canceled ? <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">中止</span>
                        : isLive ? <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full text-white" style={{ background: THEME.pink }}>上演中</span>
                        : st === "done" ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-400">終了</span>
                        : isNext ? <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full text-white" style={{ background: THEME.purple }}>次に開演</span>
                        : <span className="text-[10px] font-bold text-stone-300">開演前</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ── ロッキン風タイムテーブルの内部モデル: 公演がある「busy」区間と、公演のない「gap」区間に分ける。
   長いgapは「休憩◯分」の固定高さバーに圧縮し、縦に間延びしないようにする(表示密度で閾値が変わる)。 ── */
interface StageBusySeg { kind: "busy"; start: number; end: number; items: StageItem[] }
interface StageGapSeg { kind: "gap"; start: number; end: number; compressed: boolean }
type StageTimelineSeg = StageBusySeg | StageGapSeg;

const GAP_ROW_PX = 46;

const buildStageTimeline = (items: StageItem[], gapThreshold: number): { segments: StageTimelineSeg[]; minT: number; maxT: number } => {
  const sorted = sortItems(items);
  const busies: { start: number; end: number; items: StageItem[] }[] = [];
  for (const item of sorted) {
    const s = toMin(item.start);
    if (s == null) continue;
    const e = Math.max(s, toMin(item.end) ?? s + 20);
    const last = busies[busies.length - 1];
    if (last && s <= last.end) {
      last.end = Math.max(last.end, e);
      last.items.push(item);
    } else {
      busies.push({ start: s, end: e, items: [item] });
    }
  }
  if (busies.length === 0) return { segments: [], minT: 0, maxT: 0 };
  const firstStart = busies[0]!.start;
  const lastEnd = busies.reduce((m, b) => Math.max(m, b.end), 0);
  // 軸の開始・終了は10分単位に丸める程度にとどめ、公演の前後に不要な空白を作らない
  const minT = Math.floor(firstStart / 10) * 10;
  const maxT = Math.ceil(lastEnd / 10) * 10;
  const segments: StageTimelineSeg[] = [];
  let cursor = minT;
  for (const b of busies) {
    if (b.start > cursor) segments.push({ kind: "gap", start: cursor, end: b.start, compressed: b.start - cursor >= gapThreshold });
    segments.push({ kind: "busy", start: b.start, end: b.end, items: b.items });
    cursor = b.end;
  }
  if (maxT > cursor) segments.push({ kind: "gap", start: cursor, end: maxT, compressed: maxT - cursor >= gapThreshold });
  return { segments, minT, maxT };
};

// busy区間内の公演ブロック配置。時刻どおりの位置を基本としつつ、最低の高さ(minBlockH)を
// 確保するために前のブロックが伸びた分だけ後ろのブロックを押し下げる(隣接公演が短時間でも重ならないように)。
interface LaidStageItem { item: StageItem; top: number; height: number }
const layoutBusyItems = (seg: StageBusySeg, pxPerMin: number, minBlockH: number): LaidStageItem[] => {
  let cursor = 0;
  const out: LaidStageItem[] = [];
  for (const item of seg.items) {
    const s = toMin(item.start) ?? seg.start;
    const e = Math.max(s, toMin(item.end) ?? s + 20);
    const top = Math.max((s - seg.start) * pxPerMin, cursor);
    const height = Math.max(minBlockH, (e - s) * pxPerMin);
    out.push({ item, top, height });
    cursor = top + height;
  }
  return out;
};

// busy区間の描画高さ: 中の公演ブロック(押し下げ後の位置)がすべて収まるよう必要な高さを計算する
const stageBusyHeight = (seg: StageBusySeg, pxPerMin: number, minBlockH: number): number => {
  const natural = (seg.end - seg.start) * pxPerMin;
  const laidBottom = layoutBusyItems(seg, pxPerMin, minBlockH).reduce((m, l) => Math.max(m, l.top + l.height), 0);
  return Math.max(natural, laidBottom);
};

const stageSegHeight = (seg: StageTimelineSeg, pxPerMin: number, minBlockH: number): number =>
  seg.kind === "busy" ? stageBusyHeight(seg, pxPerMin, minBlockH)
    : seg.compressed ? GAP_ROW_PX
    : Math.max(10, (seg.end - seg.start) * pxPerMin);

// 区間内に表示する時刻ラベル: 区間の開始時刻+30分区切りの目盛り
const ticksForSeg = (seg: StageTimelineSeg): number[] => {
  const out: number[] = [seg.start];
  const first30 = Math.ceil(seg.start / 30) * 30;
  for (let t = first30; t < seg.end; t += 30) if (t > seg.start) out.push(t);
  return out;
};

/* ── ロッキン風タイムテーブル(単一ステージ): 時間軸の縦グリッド + ブロック配置 ── */
const RockinGrid = ({ items, refMin, onTap, venue, density }: { items: StageItem[]; refMin: number; onTap: (item: StageItem) => void; venue: string; density: StageDensity }) => {
  const cfg = DENSITY_CONFIG[density];
  const TIME_COL = 52;
  const accent = THEME.pink;
  const nowMarkerRef = useRef<HTMLDivElement | null>(null);
  // ページ全体のスクロールに頼らず、表の中だけで縦スクロールできる独立コンテナ。
  // 環境や端末設定に左右されず、▲▼ボタンでも確実に動かせる。
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollBy = (dy: number) => scrollRef.current?.scrollBy({ top: dy, behavior: "smooth" });
  const scrollFractionRef = useRef(0);
  const prevDensityRef = useRef(density);

  const { segments, minT, maxT } = useMemo(() => buildStageTimeline(items, cfg.gapThreshold), [items, cfg.gapThreshold]);

  // 内側スクロールの位置を割合で覚えておく(表示密度を切り替えたときに、だいたい同じ場所を保つため)
  const onInnerScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    scrollFractionRef.current = max > 0 ? el.scrollTop / max : 0;
  };

  // 開いた瞬間、または日・会場を切り替えて中身(items)が変わったときは現在時刻の位置まで自動で移動
  // (現在時刻が範囲外なら先頭へ)。表の外側のページはスクロールさせない。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const marker = nowMarkerRef.current;
    if (marker) {
      const elRect = el.getBoundingClientRect();
      const markerRect = marker.getBoundingClientRect();
      const relativeTop = markerRect.top - elRect.top + el.scrollTop;
      el.scrollTop = Math.max(0, relativeTop - el.clientHeight / 2);
    } else {
      el.scrollTop = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // 表示密度だけを切り替えたときは、中身は同じなので直前のスクロール位置(割合)を保つ
  // (itemsが変わったとき=上の効果でも呼ばれるが、その場合はdensityが変化していないのでここは何もしない)
  useEffect(() => {
    if (prevDensityRef.current === density) return;
    prevDensityRef.current = density;
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    el.scrollTop = max > 0 ? scrollFractionRef.current * max : 0;
  }, [density, segments]);

  if (segments.length === 0) {
    return <EmptyState icon="🎤" title="この日の公演はありません" message="別の日や会場を選んでください" />;
  }

  const nowVisible = refMin >= minT && refMin <= maxT;
  let nowSegIdx = segments.findIndex((s) => refMin >= s.start && refMin < s.end);
  if (nowSegIdx === -1 && nowVisible) nowSegIdx = segments.length - 1;

  return (
    <div>
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="text-xs font-bold" style={{ color: THEME.ink }}>タイムテーブル（{items.length}公演）</div>
        <div className="flex items-center gap-1.5">
          {nowVisible && (
            <button type="button" onClick={() => nowMarkerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
              aria-label={`現在時刻 ${minToHHMM(refMin)} の位置へ移動`}
              className="text-[10px] font-black px-2.5 py-1 rounded-full text-white active:scale-95 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-pink-500"
              style={{ background: accent }}>
              🕒 現在時刻へ
            </button>
          )}
          {/* マウス派・スクロールが効かない環境向けの明示ボタン(PCのみ表示) */}
          <button type="button" onClick={() => scrollBy(-260)} aria-label="タイムテーブルを上へスクロール"
            className="hidden md:flex w-7 h-7 rounded-full bg-white border border-stone-200 items-center justify-center text-stone-600 font-black active:scale-95 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-stone-400">▲</button>
          <button type="button" onClick={() => scrollBy(260)} aria-label="タイムテーブルを下へスクロール"
            className="hidden md:flex w-7 h-7 rounded-full bg-white border border-stone-200 items-center justify-center text-stone-600 font-black active:scale-95 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-stone-400">▼</button>
        </div>
      </div>
      <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
        <div ref={scrollRef} onScroll={onInnerScroll} className="overflow-y-auto overscroll-contain" style={{ maxHeight: "min(66vh, 720px)" }}>
          {/* 表の中を上下にスクロールしても見出しバーが流れていかないよう、コンテナ内でsticky指定する */}
          <div className="sticky top-0 z-20 flex items-center justify-center text-xs font-black text-white py-2.5 shadow-sm" style={{ background: THEME.festGradient }}>
            🎤 ステージ進行表
          </div>

          {segments.map((seg, idx) => {
            const isNowSeg = idx === nowSegIdx;

            if (seg.kind === "gap" && seg.compressed) {
              const dur = seg.end - seg.start;
              return (
                <div key={idx} ref={isNowSeg ? nowMarkerRef : undefined} className="flex items-stretch" style={{ height: GAP_ROW_PX }}>
                  <div className="flex-shrink-0 border-r border-stone-200 bg-stone-50/50" style={{ width: TIME_COL }} />
                  <div className="flex-1 flex items-center px-3 gap-2 min-w-0">
                    <div className="flex-1 h-px" style={{ backgroundImage: "repeating-linear-gradient(90deg,#e7e5e4 0,#e7e5e4 4px,transparent 4px,transparent 8px)" }} />
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap flex-shrink-0 ${isNowSeg ? "text-white border-transparent" : "text-stone-500 bg-stone-50 border-stone-200"}`}
                      style={isNowSeg ? { background: THEME.purple } : {}}>
                      <Coffee size={11} strokeWidth={2.4} />
                      {isNowSeg ? `ただいま休憩中・あと${seg.end - refMin}分` : `休憩 ${formatStageDuration(dur)}`}
                      <span className="opacity-70 font-normal tabular-nums">{minToHHMM(seg.start)}〜{minToHHMM(seg.end)}</span>
                    </span>
                    <div className="flex-1 h-px" style={{ backgroundImage: "repeating-linear-gradient(90deg,#e7e5e4 0,#e7e5e4 4px,transparent 4px,transparent 8px)" }} />
                  </div>
                </div>
              );
            }

            const height = stageSegHeight(seg, cfg.pxPerMin, cfg.minBlockH);
            const ticks = ticksForSeg(seg);
            return (
              <div key={idx} className="flex items-stretch">
                <div className="flex-shrink-0 relative border-r border-stone-200 bg-stone-50/50" style={{ width: TIME_COL, height }}>
                  {ticks.map((t) => (
                    <div key={t} className="absolute left-0 right-0 flex items-start justify-end pr-1.5"
                      style={{ top: Math.max(0, (t - seg.start) * cfg.pxPerMin - 6) }}>
                      <span className={`tabular-nums ${t % 60 === 0 ? "text-[11px] font-black text-stone-500" : "text-[9px] font-bold text-stone-300"}`}>{minToHHMM(t)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex-1 relative" style={{ height }}>
                  {ticks.map((t) => (
                    <div key={t} className="absolute left-0 right-0" style={{ top: (t - seg.start) * cfg.pxPerMin, borderTop: t % 60 === 0 ? "1px solid #e7e5e4" : "1px dashed #f0efed" }} />
                  ))}
                  {isNowSeg && (
                    <div ref={nowMarkerRef} className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top: (refMin - seg.start) * cfg.pxPerMin }}>
                      <div className="h-0.5" style={{ background: accent }} />
                      <div className="absolute right-1 -top-2.5 px-1.5 py-0.5 rounded-full text-[9px] font-black text-white shadow" style={{ background: accent }}>NOW {minToHHMM(refMin)}</div>
                    </div>
                  )}
                  {seg.kind === "busy" && layoutBusyItems(seg, cfg.pxPerMin, cfg.minBlockH).map(({ item, top, height: h }) => {
                    const status = itemStatus(item, refMin);
                    const isLive = status === "live";
                    const faded = status === "done" || status === "canceled";
                    return (
                      <button key={item.id} type="button" onClick={() => onTap(item)}
                        aria-label={stageItemAriaLabel(item, venue)}
                        className="absolute rounded-xl px-3 py-2 overflow-hidden transition-all cursor-pointer text-left appearance-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pink-500/50 focus-visible:ring-inset"
                        style={{
                          top: top + 1, left: 8, right: 8, height: h - 2,
                          background: faded ? "#f5f5f4" : isLive ? `${accent}1f` : "#fff",
                          border: `2px solid ${isLive ? accent : faded ? "#e7e5e4" : `${accent}55`}`,
                          opacity: faded ? 0.62 : 1,
                          boxShadow: isLive ? `0 4px 16px ${accent}33` : "0 1px 3px rgba(0,0,0,0.04)",
                        }}>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {isLive && <span className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse" style={{ background: accent }} />}
                          <span className="flex-shrink-0 flex items-center"><StageIcon item={item} size={15} rounded={4} emojiClass="text-[12px]" /></span>
                          <span className={`text-sm font-black leading-tight truncate ${item.canceled ? "line-through text-stone-400" : ""}`} style={{ color: faded ? "#a8a29e" : THEME.ink }}>{item.title}</span>
                          {isLive && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full text-white flex-shrink-0" style={{ background: accent }}>LIVE</span>}
                          {item.canceled && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 flex-shrink-0">中止</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold tabular-nums" style={{ color: faded ? "#a8a29e" : accent }}>{item.start}–{item.end}</span>
                          {h > 50 && item.performer && <span className="text-[10px] text-stone-500 truncate">{item.performer}</span>}
                        </div>
                        {h > 64 && item.note && <div className="text-[9px] mt-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 inline-block truncate max-w-full">📢 {item.note}</div>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="text-[11px] text-stone-400 mt-2 flex items-center gap-1.5 flex-wrap">
        <span className="w-2.5 h-0.5 rounded-full flex-shrink-0" style={{ background: accent }} /> ピンクの線が現在時刻・長い空き時間は「休憩」にまとめて表示しています
      </div>
    </div>
  );
};

const StageHeader = ({ program }: { program: StageProgram | null }) => (
  <header className="sticky top-0 z-30 overflow-hidden" style={{ background: "linear-gradient(120deg,#9b5de5 0%,#4cc9f0 60%,#3ddc97 100%)" }}>
    <div className="absolute inset-0 opacity-25 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle,#fff 1.5px,transparent 1.5px)", backgroundSize: "22px 22px" }} />
    {/* タイムテーブルに使える高さを増やすため、ヘッダーは1行に圧縮する */}
    <div className="relative max-w-2xl mx-auto px-4 py-2.5 flex items-baseline gap-2">
      <h1 className="text-lg font-black text-white tracking-tight" style={{ textShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>🎤 ステージ進行</h1>
      <span className="text-xs text-white/90 font-bold truncate">{program?.stageName || "メインステージ"}</span>
    </div>
  </header>
);

/* ═══════════ STAGE — STAFF EDITOR ═══════════ */

export const StageEditor = ({ program, onSave, onBack, showToast }: { program: StageProgram; onSave: (p: StageProgram) => void; onBack: () => void; showToast: (m: string, t?: "success" | "error" | "info" | "warn") => void }) => {
  const [draft, setDraft] = useState<StageProgram>(() => program || seedStage());
  const [editItem, setEditItem] = useState<StageItem | null>(null);
  const [creating, setCreating] = useState(false);
  // 保存が成功する(=サーバーでrevが進む)たびに、下書きのrevも追従させる。
  // これが無いと2回目以降の保存が常に古いrevで競合扱いになる。
  useEffect(() => {
    if (!program) return;
    setDraft((current) => (program.rev || 0) > (current.rev || 0)
      ? { ...current, rev: program.rev, lastUpdated: program.lastUpdated }
      : current);
  }, [program]);
  const dayCount = draft.days || 1;
  const [day, setDay] = useState(1);
  const venues = draft.venues && draft.venues.length ? draft.venues : STAGE_VENUES;
  const [venue, setVenue] = useState(MAIN_STAGE);
  const items = useMemo(
    () => sortItems(draft.items.filter((i) => (i.day || 1) === day && (i.venue || MAIN_STAGE) === venue)),
    [draft.items, day, venue],
  );

  const persist = (nextItems: StageItem[], nextVenues?: string[], msg?: string) => {
    const next = { ...draft, items: nextItems, ...(nextVenues ? { venues: nextVenues } : {}) };
    setDraft(next);
    onSave(next);
    if (msg) showToast(msg);
  };

  const saveItem = (item: StageItem) => {
    const exists = draft.items.some((i) => i.id === item.id);
    const nextItems = exists ? draft.items.map((i) => i.id === item.id ? item : i) : [...draft.items, item];
    // 新しい会場名が入力されたら、会場一覧にも加える
    const nextVenues = item.venue && !venues.includes(item.venue) ? [...venues, item.venue] : undefined;
    persist(nextItems, nextVenues, exists ? "公演を更新しました" : "公演を追加しました");
    if (nextVenues) setVenue(item.venue);
    setEditItem(null); setCreating(false);
  };
  const deleteItem = (id: string) => { persist(draft.items.filter((i) => i.id !== id), undefined, "公演を削除しました"); setEditItem(null); };
  const toggleCancel = (item: StageItem) => persist(draft.items.map((i) => i.id === item.id ? { ...i, canceled: !i.canceled } : i), undefined, item.canceled ? "中止を解除しました" : "中止にしました");

  // 進行が押しているとき: 表示中の日・会場の、これから始まる公演をまとめてずらす
  const shiftAll = (delta: number) => {
    const ref = nowMin();
    const nextItems = draft.items.map((i) => {
      if ((i.day || 1) !== day || (i.venue || MAIN_STAGE) !== venue) return i;
      const s = toMin(i.start), e = toMin(i.end);
      if (s == null || s < ref) return i; // 終了・進行済みは動かさない
      return { ...i, start: minToHHMM(s + delta), end: e != null ? minToHHMM(e + delta) : i.end };
    });
    persist(nextItems, undefined, `${venue}・${day}日目の以降の公演を${delta > 0 ? `${delta}分後ろ` : `${-delta}分前`}にずらしました`);
  };
  const shiftTargetLabel = `${venue}${dayCount > 1 ? ` / ${day}日目` : ""}`;

  return (
    <div className="pb-28">
      <div className="sticky top-0 z-10 bg-stone-50/90 backdrop-blur-xl border-b border-stone-200 px-4 py-3 flex items-center gap-2">
        <IconButton icon={ChevronLeft} onClick={onBack} label="戻る" variant="ghost" />
        <div className="flex-1 min-w-0"><div className="text-xs text-stone-500">ステージ管理</div><div className="font-bold text-stone-900 truncate">{draft.stageName}</div></div>
      </div>

      <div className="px-4 pt-5">
        {dayCount > 1 && (
          <div className="flex gap-2 mb-3" role="group" aria-label="開催日を選択">
            {Array.from({ length: dayCount }).map((_, i) => {
              const d = i + 1;
              return (
                <button key={d} type="button" onClick={() => setDay(d)} aria-pressed={day === d}
                  className={`flex-1 py-2.5 rounded-2xl text-sm font-black transition-all active:scale-95 ${day === d ? "text-white shadow-md" : "bg-white text-stone-600 border border-stone-200"}`}
                  style={day === d ? { background: "linear-gradient(135deg,#ff4d8d,#9b5de5)" } : {}}>
                  {d}日目
                </button>
              );
            })}
          </div>
        )}

        {/* 会場切り替え。演劇部・音楽部・放送部など、体育館以外の公演もここで管理する */}
        <div className="mb-1 text-[11px] font-bold text-stone-400">会場を選んで公演を登録できます</div>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none touch-pan-x -mx-1 px-1 mb-4" role="group" aria-label="会場を選択">
          {venues.map((v) => {
            const count = draft.items.filter((i) => (i.venue || MAIN_STAGE) === v && (i.day || 1) === day).length;
            return (
              <button key={v} type="button" onClick={() => setVenue(v)} aria-pressed={venue === v}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-extrabold transition-all active:scale-95 border ${venue === v ? "text-white border-transparent shadow-sm" : "bg-white text-stone-600 border-stone-200"}`}
                style={venue === v ? { background: "linear-gradient(135deg,#9b5de5,#4cc9f0)" } : {}}>
                {v === MAIN_STAGE ? "🎤 " : "🎪 "}{v}{count > 0 ? ` ${count}件` : ""}
              </button>
            );
          })}
        </div>

        <div className="rounded-2xl p-4 mb-4 border" style={{ background: "#fff7ed", borderColor: "#ff8a3d44" }}>
          <div className="flex items-center gap-2 mb-2.5"><Clock size={16} style={{ color: THEME.orange }} strokeWidth={2.4} /><div className="font-bold text-sm" style={{ color: THEME.ink }}>進行が押している/巻いているとき</div></div>
          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
            <span className="text-[10px] font-bold text-stone-400">対象</span>
            <span className="text-[11px] font-black px-2 py-0.5 rounded-full text-white" style={{ background: "linear-gradient(135deg,#9b5de5,#4cc9f0)" }}>
              {venue === MAIN_STAGE ? "🎤 " : "🎪 "}{shiftTargetLabel}
            </span>
          </div>
          <p className="text-xs text-stone-500 mb-3 leading-relaxed">これから始まる公演の時刻をまとめてずらせます（終了済みは動きません）。</p>
          <div className="grid grid-cols-4 gap-2">
            <button onClick={() => shiftAll(-5)} aria-label={`${shiftTargetLabel}の公演を5分前にずらす`} className="py-2.5 rounded-xl bg-white border border-stone-200 font-bold text-sm active:scale-95">−5分</button>
            <button onClick={() => shiftAll(5)} aria-label={`${shiftTargetLabel}の公演を5分後ろにずらす`} className="py-2.5 rounded-xl bg-white border border-stone-200 font-bold text-sm active:scale-95">+5分</button>
            <button onClick={() => shiftAll(10)} aria-label={`${shiftTargetLabel}の公演を10分後ろにずらす`} className="py-2.5 rounded-xl bg-white border border-stone-200 font-bold text-sm active:scale-95">+10分</button>
            <button onClick={() => shiftAll(15)} aria-label={`${shiftTargetLabel}の公演を15分後ろにずらす`} className="py-2.5 rounded-xl bg-white border border-stone-200 font-bold text-sm active:scale-95">+15分</button>
          </div>
        </div>

        <button onClick={() => setCreating(true)}
          className="w-full mb-3 flex items-center gap-3 p-4 bg-white rounded-2xl border-2 border-dashed border-stone-300 hover:border-stone-900 active:scale-[0.99] transition-all text-left">
          <div className="w-11 h-11 rounded-xl bg-stone-100 flex items-center justify-center flex-shrink-0"><Plus size={20} className="text-stone-700" strokeWidth={2.5} /></div>
          <div className="flex-1"><div className="font-bold text-stone-900">公演を追加</div><div className="text-xs text-stone-500">{venue}{dayCount > 1 ? ` / ${day}日目` : ""} に登録します</div></div>
        </button>

        <div className="space-y-2">
          {items.map((item) => {
            const st = itemStatus(item);
            return (
              <div key={item.id} className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
                <div className="flex items-center gap-3 p-3.5">
                  <div className="text-center flex-shrink-0 w-12">
                    <div className="text-sm font-black tabular-nums" style={{ color: THEME.ink }}>{item.start}</div>
                    <div className="text-[10px] text-stone-400 tabular-nums">{item.end}</div>
                  </div>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0" style={{ background: "#f3ecff" }}>
                    <StageIcon item={item} size={40} rounded={12} emojiClass="text-xl" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-bold truncate ${item.canceled ? "line-through text-stone-400" : "text-stone-900"}`}>{item.title || "(無題)"}</div>
                    <div className="text-xs text-stone-500 truncate">{item.performer || "出演者未設定"}</div>
                    {item.performers && item.performers.length > 0 && (() => {
                      // 意気込みが未入力の人が残っていないか、一覧のまま分かるようにする
                      const blank = item.performers.filter((p) => !p.description).length;
                      return (
                        <div className="mt-1 flex items-center gap-1 flex-wrap">
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full" style={{ background: `${THEME.purple}1a`, color: THEME.purple }}>👥 {item.performers.length}名</span>
                          {blank > 0 && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">意気込み未入力 {blank}名</span>}
                        </div>
                      );
                    })()}
                  </div>
                  {st === "live" && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full text-white flex-shrink-0" style={{ background: THEME.pink }}>上演中</span>}
                  {st === "done" && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-400 flex-shrink-0">終了</span>}
                </div>
                <div className="grid grid-cols-2 gap-px bg-stone-200 border-t border-stone-200">
                  <button onClick={() => setEditItem(item)} className="bg-white hover:bg-stone-50 py-2.5 flex items-center justify-center gap-1.5"><Settings size={15} className="text-indigo-600" strokeWidth={2.4} /><span className="text-sm font-bold text-stone-900">編集</span></button>
                  <button onClick={() => toggleCancel(item)} className="bg-white hover:bg-stone-50 py-2.5 flex items-center justify-center gap-1.5">
                    {item.canceled ? <><RefreshCw size={15} className="text-emerald-600" strokeWidth={2.4} /><span className="text-sm font-bold text-stone-900">再開</span></> : <><AlertTriangle size={15} className="text-amber-600" strokeWidth={2.4} /><span className="text-sm font-bold text-stone-900">中止</span></>}
                  </button>
                </div>
              </div>
            );
          })}
          {items.length === 0 && (
            <div className="text-center text-sm text-stone-400 py-8 bg-white rounded-2xl border border-dashed border-stone-200">
              {venue}{dayCount > 1 ? ` / ${day}日目` : ""} の公演はまだありません。<br />上の「公演を追加」から登録できます。
            </div>
          )}
        </div>
      </div>

      {(editItem || creating) && (
        <StageItemEditor item={creating ? makeStageItem({ day, venue }) : editItem!} isNew={creating} venues={venues}
          onClose={() => { setEditItem(null); setCreating(false); }} onSave={saveItem} onDelete={() => { if (editItem) deleteItem(editItem.id); }} />
      )}
    </div>
  );
};

/* ── 出演者ひとりぶんの編集(公演の編集シートの上に重ねて開く) ──
   本人にスマホを渡してそのまま打ってもらえるよう、1画面に1人だけを出す。 */
const StagePerformerEditor = ({ performer, isNew, onClose, onSave, onDelete }: {
  performer: StagePerformer; isNew: boolean; onClose: () => void;
  onSave: (p: StagePerformer) => void; onDelete: () => void;
}) => {
  const [form, setForm] = useState<StagePerformer>(performer);
  const [confirmDel, setConfirmDel] = useState(false);
  const set = <K extends keyof StagePerformer>(k: K, v: StagePerformer[K]) => setForm((p) => ({ ...p, [k]: v }));
  const valid = Boolean(form.name.trim());

  return (
    <Sheet onClose={onClose} title={isNew ? "出演者を追加" : "出演者の編集"}>
      <div className="px-5 pb-4 space-y-4 pt-1">
        <Field label="アイコン">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl flex-shrink-0 border-2"
              style={{ background: "#f3ecff", borderColor: `${THEME.purple}44` }}>{form.emoji || "🎤"}</div>
            <Hint>下から1つ選んでください</Hint>
          </div>
          <div className="p-3 bg-white rounded-2xl border border-stone-200 grid grid-cols-8 gap-1 max-h-40 overflow-y-auto">
            {PERFORMER_EMOJI_PALETTE.map((e, i) => (
              <button key={`${e}-${i}`} type="button" onClick={() => set("emoji", e)}
                aria-label={`アイコンを${e}にする`} aria-pressed={form.emoji === e}
                className={`aspect-square rounded-lg text-2xl flex items-center justify-center active:scale-90 transition-transform ${form.emoji === e ? "" : "hover:bg-stone-100"}`}
                style={form.emoji === e ? { background: "#f3ecff", boxShadow: "inset 0 0 0 2px #9b5de5" } : {}}
              >{e}</button>
            ))}
          </div>
        </Field>

        <Field label="名前・ニックネーム" required>
          <input type="text" value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={PERFORMER_NAME_MAX}
            className="w-full px-4 py-3 rounded-xl border border-stone-200 text-base font-bold bg-white outline-none focus:border-stone-900"
            placeholder="例: 坂戸 たろう" />
          <Hint>来場者に見えます。フルネームでもニックネームでもかまいません({form.name.length}/{PERFORMER_NAME_MAX})</Hint>
        </Field>

        <Field label="肩書き">
          <div className="flex gap-1.5 flex-wrap mb-2">
            {PERFORMER_ROLE_PRESETS.map((r) => (
              <button key={r} type="button" onClick={() => set("role", form.role === r ? "" : r)} aria-pressed={form.role === r}
                className={`px-3 py-1.5 rounded-full text-xs font-extrabold border active:scale-95 transition-all ${form.role === r ? "text-white border-transparent" : "bg-white text-stone-600 border-stone-200"}`}
                style={form.role === r ? { background: "linear-gradient(135deg,#9b5de5,#4cc9f0)" } : {}}>{r}</button>
            ))}
          </div>
          <input type="text" value={form.role} onChange={(e) => set("role", e.target.value)} maxLength={PERFORMER_ROLE_MAX}
            className="w-full px-4 py-3 rounded-xl border border-stone-200 text-base bg-white outline-none focus:border-stone-900"
            placeholder="例: 歌うま王" />
          <Hint>同じ肩書きの人は、来場者の画面でまとめて並びます</Hint>
        </Field>

        <Field label="意気込み・自己紹介">
          <textarea value={form.description} onChange={(e) => set("description", e.target.value)} maxLength={PERFORMER_DESC_MAX} rows={4}
            className="w-full px-4 py-3 rounded-xl border border-stone-200 text-base bg-white outline-none focus:border-stone-900 resize-none leading-relaxed"
            placeholder="例: 3年間続けたカラオケの成果を出しきります！サビはぜひ一緒に歌ってください🎤" />
          <Hint>公演をタップすると表示されます({form.description.length}/{PERFORMER_DESC_MAX})</Hint>
        </Field>
      </div>
      <div className="sticky bottom-0 bg-stone-50/95 backdrop-blur-xl border-t border-stone-200 px-5 py-3 flex gap-2" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}>
        {!isNew && (
          <button onClick={() => setConfirmDel(true)} aria-label="この出演者を削除"
            className="px-4 py-3 rounded-2xl border border-red-200 bg-white text-red-600 font-bold text-sm active:scale-95 flex items-center justify-center"><Trash2 size={16} strokeWidth={2.5} /></button>
        )}
        <button onClick={onClose} className="flex-1 px-4 py-3 rounded-2xl border border-stone-200 bg-white text-stone-700 font-bold text-sm active:scale-95">キャンセル</button>
        <button onClick={() => valid && onSave({ ...form, name: form.name.trim(), role: form.role.trim(), description: form.description.trim(), emoji: (form.emoji || "🎤").trim() || "🎤" })} disabled={!valid}
          className="flex-1 px-4 py-3 rounded-2xl text-white font-bold text-sm active:scale-95 disabled:opacity-40"
          style={{ background: valid ? "linear-gradient(135deg,#9b5de5,#4cc9f0)" : "#a8a29e" }}>{isNew ? "追加する" : "保存する"}</button>
      </div>
      {confirmDel && <Confirm title="削除しますか?" message={`「${form.name || "この出演者"}」を出演者から外します。`} confirmLabel="削除する" danger
        onConfirm={() => { onDelete(); setConfirmDel(false); }} onCancel={() => setConfirmDel(false)} />}
    </Sheet>
  );
};

const StageItemEditor = ({ item, isNew, venues, onClose, onSave, onDelete }: { item: StageItem; isNew: boolean; venues: string[]; onClose: () => void; onSave: (i: StageItem) => void; onDelete: () => void }) => {
  const [form, setForm] = useState<StageItem>(item || makeStageItem({}));
  const [confirmDel, setConfirmDel] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [uploadError, setUploadError] = useState("");
  // 出演者(個人)の編集。null=閉じている / "new"=追加 / それ以外=そのidを編集
  const [editingPerformer, setEditingPerformer] = useState<StagePerformer | "new" | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const set = <K extends keyof StageItem>(k: K, v: StageItem[K]) => setForm((p) => ({ ...p, [k]: v }));

  const performers = form.performers ?? [];
  const setPerformers = (list: StagePerformer[]) => set("performers", list.length ? list : undefined);
  const savePerformer = (p: StagePerformer) => {
    setPerformers(performers.some((x) => x.id === p.id) ? performers.map((x) => (x.id === p.id ? p : x)) : [...performers, p]);
    setEditingPerformer(null);
  };
  const removePerformer = (id: string) => { setPerformers(performers.filter((x) => x.id !== id)); setEditingPerformer(null); };
  // 並び替え(1つ上/下へ)。肩書きごとの並び順は、この順番がそのまま来場者の画面に出る
  const movePerformer = (index: number, delta: number) => {
    const next = [...performers];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const a = next[index]!, b = next[target]!;
    next[index] = b; next[target] = a;
    setPerformers(next);
  };
  const bump = (field: "start" | "end", delta: number) => set(field, minToHHMM((toMin(form[field]) ?? 600) + delta));
  const valid = Boolean(form.title.trim()) && toMin(form.start) != null && toMin(form.end) != null && (toMin(form.end) ?? 0) > (toMin(form.start) ?? 0);

  const handleImageFile = (file: File | undefined) => {
    setUploadError("");
    if (!file) return;
    fileToIconDataUrl(file)
      .then((dataUrl) => set("iconImage", dataUrl))
      .catch((e: Error) => setUploadError(e.message));
  };

  return (
    <Sheet onClose={onClose} title={isNew ? "公演を追加" : "公演を編集"}>
      <div className="px-5 pb-4 space-y-4 pt-1">
        <Field label="アイコン">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl flex-shrink-0 border-2 overflow-hidden"
              style={{ background: "#f3ecff", borderColor: `${THEME.purple}44` }}>
              {form.iconImage
                ? <img src={form.iconImage} alt="icon" style={{ width: 64, height: 64, objectFit: "cover" }} />
                : <span>{form.emoji || "🎤"}</span>}
            </div>
            <div className="flex-1 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setEmojiOpen((o) => !o)}
                className="py-2.5 rounded-xl border border-stone-200 bg-white text-xs font-bold text-stone-700 active:scale-95 flex items-center justify-center gap-1">
                <Sparkles size={13} strokeWidth={2.4} /> 絵文字
              </button>
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="py-2.5 rounded-xl border border-stone-200 bg-white text-xs font-bold text-stone-700 active:scale-95 flex items-center justify-center gap-1">
                <Upload size={13} strokeWidth={2.4} /> 画像
              </button>
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { handleImageFile(e.target.files?.[0]); e.target.value = ""; }} />
          {uploadError && <div className="text-xs text-red-600 font-semibold mb-2 flex items-center gap-1"><AlertTriangle size={12} /> {uploadError}</div>}
          {form.iconImage && (
            <button type="button" onClick={() => set("iconImage", "")}
              className="mb-2 w-full py-2 rounded-xl bg-stone-100 text-xs font-bold text-stone-600 active:scale-95 flex items-center justify-center gap-1">
              <X size={12} strokeWidth={2.5} /> 画像を外して絵文字に戻す
            </button>
          )}
          {emojiOpen && (
            <div className="mt-1 p-3 bg-white rounded-2xl border border-stone-200 grid grid-cols-8 gap-1 max-h-56 overflow-y-auto">
              {EMOJI_PALETTE.map((e, i) => (
                <button key={`${e}-${i}`} type="button"
                  onClick={() => { set("emoji", e); set("iconImage", ""); setEmojiOpen(false); }}
                  className={`aspect-square rounded-lg text-2xl flex items-center justify-center active:scale-90 transition-transform ${(!form.iconImage && form.emoji === e) ? "" : "hover:bg-stone-100"}`}
                  style={(!form.iconImage && form.emoji === e) ? { background: "#f3ecff", boxShadow: "inset 0 0 0 2px #9b5de5" } : {}}
                >{e}</button>
              ))}
            </div>
          )}
        </Field>
        <Field label="タイトル" required>
          <input type="text" value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={30}
            className="w-full px-4 py-3 rounded-xl border border-stone-200 text-base font-bold bg-white outline-none focus:border-stone-900" placeholder="例: 吹奏楽部 演奏" />
        </Field>
        <Field label="出演者・団体">
          <input type="text" value={form.performer} onChange={(e) => set("performer", e.target.value)} maxLength={30}
            className="w-full px-4 py-3 rounded-xl border border-stone-200 text-base bg-white outline-none focus:border-stone-900" placeholder="例: 吹奏楽部" />
        </Field>
        <Field label="会場">
          <input type="text" list="stage-venues" value={form.venue} onChange={(e) => set("venue", e.target.value)} maxLength={30}
            className="w-full px-4 py-3 rounded-xl border border-stone-200 text-base bg-white outline-none focus:border-stone-900" placeholder="例: 体育館ステージ" />
          <datalist id="stage-venues">{venues.map((v) => <option key={v} value={v} />)}</datalist>
          <Hint>体育館ステージのほか、演劇部・音楽部・放送部など会場ごとに登録できます(新しい会場名を入力すると一覧に追加されます)</Hint>
        </Field>
        <Field label="紹介文(任意)">
          <textarea value={form.description} onChange={(e) => set("description", e.target.value)} maxLength={120} rows={3}
            className="w-full px-4 py-3 rounded-xl border border-stone-200 text-base bg-white outline-none focus:border-stone-900 resize-none leading-relaxed" placeholder="例: 3年間の集大成をお届けします！全4曲、ぜひ最後まで！" />
          <Hint>来場者が公演をタップすると表示されます({form.description.length}/120)</Hint>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="開始時刻" required>
            <TimeStepper value={form.start} onMinus={() => bump("start", -5)} onPlus={() => bump("start", 5)} />
          </Field>
          <Field label="終了時刻" required>
            <TimeStepper value={form.end} onMinus={() => bump("end", -5)} onPlus={() => bump("end", 5)} />
          </Field>
        </div>
        {!valid && form.title.trim() !== "" && (
          <div className="text-xs text-red-600 font-semibold flex items-center gap-1"><AlertTriangle size={12} /> 終了は開始より後の時刻にしてください</div>
        )}
        <Field label="お知らせ(任意)">
          <input type="text" value={form.note} onChange={(e) => set("note", e.target.value)} maxLength={40}
            className="w-full px-4 py-3 rounded-xl border border-stone-200 text-base bg-white outline-none focus:border-stone-900" placeholder="例: 雨天のため室内に変更" />
          <Hint>来場者のタイムテーブルに黄色いお知らせとして表示されます</Hint>
        </Field>

        {/* 出演者(個人)。複数人が出る公演で、ひとりずつ意気込みを書けるようにする */}
        <Field label="出演者(任意)">
          {performers.length === 0 && (
            <p className="text-xs text-stone-500 mb-2 leading-relaxed">
              複数人で出演する公演は、ひとりずつ登録できます。名前・肩書き・意気込みが来場者の画面に並びます。
            </p>
          )}
          <div className="space-y-2 mb-2">
            {performers.map((p, i) => (
              <div key={p.id} className="flex items-center gap-2 p-2.5 bg-white rounded-2xl border border-stone-200">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style={{ background: "#f3ecff" }}>{p.emoji || "🎤"}</div>
                <button type="button" onClick={() => setEditingPerformer(p)} className="flex-1 min-w-0 text-left active:scale-[0.99] transition-transform">
                  <div className="font-bold text-sm truncate text-stone-900">{p.name || "(名前未設定)"}</div>
                  <div className="text-[11px] truncate text-stone-500">
                    {p.role ? `${p.role}・` : ""}{p.description ? "意気込みあり" : "意気込み未入力"}
                  </div>
                </button>
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                  <button type="button" onClick={() => movePerformer(i, -1)} disabled={i === 0} aria-label={`${p.name || "この出演者"}を1つ上へ`}
                    className="w-7 h-6 rounded-lg bg-stone-100 text-stone-600 text-[11px] font-black active:scale-90 disabled:opacity-30">▲</button>
                  <button type="button" onClick={() => movePerformer(i, 1)} disabled={i === performers.length - 1} aria-label={`${p.name || "この出演者"}を1つ下へ`}
                    className="w-7 h-6 rounded-lg bg-stone-100 text-stone-600 text-[11px] font-black active:scale-90 disabled:opacity-30">▼</button>
                </div>
                <button type="button" onClick={() => setEditingPerformer(p)} aria-label={`${p.name || "この出演者"}を編集`}
                  className="w-9 h-9 rounded-xl bg-stone-100 flex items-center justify-center flex-shrink-0 active:scale-90">
                  <Settings size={15} className="text-indigo-600" strokeWidth={2.4} />
                </button>
              </div>
            ))}
          </div>
          {performers.length < MAX_PERFORMERS ? (
            <button type="button" onClick={() => setEditingPerformer("new")}
              className="w-full flex items-center gap-2.5 p-3 bg-white rounded-2xl border-2 border-dashed border-stone-300 hover:border-stone-900 active:scale-[0.99] transition-all text-left">
              <div className="w-9 h-9 rounded-xl bg-stone-100 flex items-center justify-center flex-shrink-0"><Plus size={17} className="text-stone-700" strokeWidth={2.5} /></div>
              <div>
                <div className="font-bold text-sm text-stone-900">出演者を追加</div>
                <div className="text-[11px] text-stone-500">名前・肩書き・意気込みを登録</div>
              </div>
            </button>
          ) : (
            <Hint>出演者は最大{MAX_PERFORMERS}名までです</Hint>
          )}
          {performers.length > 0 && <Hint>▲▼で並び順を変えられます。この順番のまま来場者に表示されます</Hint>}
        </Field>
      </div>
      <div className="sticky bottom-0 bg-stone-50/95 backdrop-blur-xl border-t border-stone-200 px-5 py-3 flex gap-2" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}>
        {!isNew && <button onClick={() => setConfirmDel(true)} className="px-4 py-3 rounded-2xl border border-red-200 bg-white text-red-600 font-bold text-sm active:scale-95 flex items-center justify-center" aria-label="削除"><Trash2 size={16} strokeWidth={2.5} /></button>}
        <button onClick={onClose} className="flex-1 px-4 py-3 rounded-2xl border border-stone-200 bg-white text-stone-700 font-bold text-sm active:scale-95">キャンセル</button>
        <button onClick={() => valid && onSave({ ...form, title: form.title.trim(), performer: form.performer.trim(), note: form.note.trim(), description: form.description.trim(), emoji: (form.emoji || "🎤").trim() || "🎤", venue: (form.venue || MAIN_STAGE).trim() || MAIN_STAGE })} disabled={!valid}
          className="flex-1 px-4 py-3 rounded-2xl text-white font-bold text-sm active:scale-95 disabled:opacity-40" style={{ background: valid ? "linear-gradient(135deg,#ff4d8d,#9b5de5)" : "#a8a29e" }}>{isNew ? "追加する" : "保存する"}</button>
      </div>
      {confirmDel && <Confirm title="削除しますか?" message={`「${form.title}」を削除します。`} confirmLabel="削除する" danger onConfirm={() => { onDelete(); setConfirmDel(false); }} onCancel={() => setConfirmDel(false)} />}
      {editingPerformer && (
        <StagePerformerEditor
          performer={editingPerformer === "new" ? makeStagePerformer() : editingPerformer}
          isNew={editingPerformer === "new"}
          onClose={() => setEditingPerformer(null)}
          onSave={savePerformer}
          onDelete={() => { if (editingPerformer !== "new") removePerformer(editingPerformer.id); }}
        />
      )}
    </Sheet>
  );
};
