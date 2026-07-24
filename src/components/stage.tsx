import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronLeft, Clock, Plus, RefreshCw, Settings, Sparkles, Trash2, Upload, X } from "lucide-react";
import {
  EMOJI_PALETTE, itemStatus, MAIN_STAGE, makeStageItem, minToHHMM, nowMin, seedStage, sortItems, STAGE_VENUES, stageNowNext, THEME, toMin, todayFestivalDay,
} from "../lib/festival";
import type { StageItem, StageProgram } from "../types";
import { Confirm, EmptyState, Field, fileToIconDataUrl, Hint, IconButton, Sheet, TimeStepper } from "./ui";

/* ── 公演アイコン: ブースと同じく画像 or 絵文字 ── */
const StageIcon = ({ item, size = 40, rounded = 12, emojiClass = "text-xl" }: { item: StageItem; size?: number; rounded?: number; emojiClass?: string }) => (
  item.iconImage
    ? <img src={item.iconImage} alt={item.title || "icon"} style={{ width: size, height: size, borderRadius: rounded, objectFit: "cover" }} className="flex-shrink-0" />
    : <span className={emojiClass} style={{ lineHeight: 1 }}>{item.emoji || "🎤"}</span>
);

/* ── 公演の詳細シート(来場者向け) ── */
const StageItemDetailSheet = ({ item, refMin, onClose }: { item: StageItem; refMin: number; onClose: () => void }) => {
  const st = itemStatus(item, refMin);
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
        {item.note && <div className="mb-4 p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-900 leading-relaxed">📢 {item.note}</div>}
        {item.description
          ? <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">{item.description}</p>
          : <p className="text-sm text-stone-400">紹介文はまだ登録されていません</p>}
      </div>
    </Sheet>
  );
};

/* ═══════════ STAGE — GUEST VIEW ═══════════ */

export const StageView = ({ program, tick }: { program: StageProgram; tick: number }) => {
  const dayCount = program?.days || 1;
  // 開催当日は自動でその日のタブを開く(それ以外は1日目)
  const [day, setDay] = useState(() => Math.min(todayFestivalDay() ?? 1, program?.days || 1));
  const [mode, setMode] = useState<"grid" | "list">("grid");
  const [detail, setDetail] = useState<StageItem | null>(null);

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

  const DayTabs = dayCount > 1 ? (
    <div className="flex gap-2 mb-3">
      {Array.from({ length: dayCount }).map((_, i) => {
        const d = i + 1;
        return (
          <button key={d} onClick={() => setDay(d)}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-black transition-all active:scale-95 ${day === d ? "text-white shadow-md" : "bg-white text-stone-600 border border-stone-200"}`}
            style={day === d ? { background: "linear-gradient(135deg,#ff4d8d,#9b5de5)" } : {}}>
            {d}日目
          </button>
        );
      })}
    </div>
  ) : null;

  // 会場が2つ以上あるときだけ会場切り替えを表示する
  const VenueTabs = activeVenues.length > 1 ? (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1 mb-3">
      {activeVenues.map((v) => (
        <button key={v} onClick={() => setVenue(v)}
          className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-extrabold transition-all active:scale-95 border ${activeVenue === v ? "text-white shadow-sm border-transparent" : "bg-white text-stone-600 border-stone-200"}`}
          style={activeVenue === v ? { background: "linear-gradient(135deg,#9b5de5,#4cc9f0)" } : {}}>
          {v === MAIN_STAGE ? "🎤 " : "🎭 "}{v}
        </button>
      ))}
    </div>
  ) : null;

  const ModeToggle = (
    <div className="flex items-center gap-1 p-1 bg-white rounded-full border border-stone-200 mb-4 w-fit">
      {([{ id: "grid", label: "タイムテーブル" }, { id: "list", label: "リスト" }] as const).map((m) => (
        <button key={m.id} onClick={() => setMode(m.id)}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${mode === m.id ? "text-white" : "text-stone-500"}`}
          style={mode === m.id ? { background: "linear-gradient(135deg,#ff4d8d,#9b5de5)" } : {}}>
          {m.label}
        </button>
      ))}
    </div>
  );

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
        <div className="rounded-[26px] p-5 mb-4 relative overflow-hidden" style={{ background: THEME.festGradient }}>
          <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle,#fff 1.5px,transparent 1.5px)", backgroundSize: "20px 20px" }} />
          <div className="relative">
            {live ? (
              <>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 text-xs font-black mb-2" style={{ color: THEME.pinkDeep }}>
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> ただいま上演中
                </div>
                <div className="text-2xl font-black text-white drop-shadow-sm leading-tight">{live.title}</div>
                <div className="text-sm text-white/90 font-bold mt-0.5">{live.performer}</div>
                <div className="text-xs text-white/80 mt-1">{live.start} 〜 {live.end}</div>
              </>
            ) : next ? (
              <>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 text-xs font-black mb-2" style={{ color: THEME.purple }}>
                  🎬 まもなく開演
                </div>
                <div className="text-2xl font-black text-white drop-shadow-sm leading-tight">{next.title}</div>
                <div className="text-sm text-white/90 font-bold mt-0.5">{next.performer}</div>
                <div className="text-xs text-white/90 mt-1 font-bold">
                  {next.start} 開演（あと{Math.max(0, (toMin(next.start) ?? ref) - ref)}分）
                </div>
              </>
            ) : (
              <>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 text-xs font-black mb-2 text-stone-600">本日終了</div>
                <div className="text-xl font-black text-white drop-shadow-sm">本日のステージは終了しました</div>
                <div className="text-sm text-white/90 mt-0.5">ご来場ありがとうございました！</div>
              </>
            )}
          </div>
        </div>

        {ModeToggle}

        {mode === "grid" ? (
          <>
            <RockinGrid items={items} refMin={ref} onTap={setDetail} />
            {items.length > 0 && (
              <div className="mt-5">
                <div className="text-xs font-bold mb-2" style={{ color: THEME.ink }}>出演団体（タップで紹介を表示）</div>
                <div className="grid grid-cols-1 gap-2">
                  {items.map((item) => {
                    const st = itemStatus(item, ref);
                    return (
                      <button key={item.id} onClick={() => setDetail(item)}
                        className="w-full text-left flex items-center gap-3 p-3 bg-white rounded-2xl border border-stone-200 hover:border-stone-300 active:scale-[0.99] transition-all">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0" style={{ background: "#f3ecff" }}>
                          <StageIcon item={item} size={40} rounded={12} emojiClass="text-xl" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`font-bold truncate text-sm ${item.canceled ? "line-through text-stone-400" : "text-stone-900"}`}>{item.title || "(無題)"}</div>
                          <div className="text-xs text-stone-500 truncate">{item.performer || "出演者未設定"}</div>
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
            )}
          </>
        ) : (
          <>
            <div className="text-xs font-bold mb-2" style={{ color: THEME.ink }}>タイムテーブル（{items.length}公演）</div>
            <div className="relative pl-4">
              <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-stone-200" />
              <div className="space-y-2.5">
                {items.map((item) => {
                  const st = itemStatus(item, ref);
                  const dot = st === "live" ? THEME.pink : st === "done" ? "#d6d3d1" : st === "canceled" ? "#d6d3d1" : THEME.purple;
                  return (
                    <div key={item.id} className="relative">
                      <div className="absolute -left-[13px] top-4 w-3 h-3 rounded-full ring-4 ring-white"
                        style={{ background: dot, boxShadow: st === "live" ? `0 0 0 4px ${THEME.pink}33` : "none" }} />
                      <div className="rounded-2xl p-3.5 border bg-white transition-all cursor-pointer active:scale-[0.99]"
                        onClick={() => setDetail(item)} role="button" tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetail(item); } }}
                        style={{
                          borderColor: st === "live" ? `${THEME.pink}66` : "#e7e5e4",
                          opacity: st === "done" || st === "canceled" ? 0.55 : 1,
                          boxShadow: st === "live" ? `0 4px 16px ${THEME.pink}22` : "none",
                        }}>
                        <div className="flex items-start gap-3">
                          <div className="text-center flex-shrink-0 w-12">
                            <div className="text-sm font-black tabular-nums" style={{ color: THEME.ink }}>{item.start}</div>
                            <div className="text-[10px] text-stone-400 tabular-nums">{item.end}</div>
                          </div>
                          <div className="w-9 h-9 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0" style={{ background: "#f3ecff" }}>
                            <StageIcon item={item} size={36} rounded={8} emojiClass="text-lg" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`font-bold ${item.canceled ? "line-through text-stone-400" : ""}`} style={{ color: THEME.ink }}>{item.title}</span>
                              {st === "live" && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full text-white" style={{ background: THEME.pink }}>上演中</span>}
                              {st === "done" && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-400">終了</span>}
                              {item.canceled && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">中止</span>}
                            </div>
                            {item.performer && <div className="text-xs text-stone-500 mt-0.5">{item.performer}</div>}
                            {item.note && <div className="text-xs mt-1 px-2 py-1 rounded-lg bg-amber-50 text-amber-800 inline-block">📢 {item.note}</div>}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <div className="text-center text-[11px] text-stone-400 mt-6 font-medium">
          ⏱ 自動更新 · 進行状況は時刻から自動判定されます
        </div>
      </main>

      {detail && <StageItemDetailSheet item={detail} refMin={ref} onClose={() => setDetail(null)} />}
    </>
  );
};

/* ── ロッキン風タイムテーブル(単一ステージ): 時間軸の縦グリッド + ブロック配置 ── */
const RockinGrid = ({ items, refMin, onTap }: { items: StageItem[]; refMin: number; onTap: (item: StageItem) => void }) => {
  const PX_PER_MIN = 3.0;
  const TIME_COL = 52;
  const accent = THEME.pink;
  const nowLineRef = useRef<HTMLDivElement | null>(null);
  // ページ全体のスクロールに頼らず、表の中だけで縦スクロールできる独立コンテナ。
  // 環境や端末設定に左右されず、▲▼ボタンでも確実に動かせる。
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollBy = (dy: number) => scrollRef.current?.scrollBy({ top: dy, behavior: "smooth" });

  // 開いた瞬間に現在時刻の位置まで自動で移動しておく(開催時間外なら何もしない)
  useEffect(() => {
    const el = scrollRef.current;
    const line = nowLineRef.current;
    if (!el || !line) return;
    el.scrollTop = Math.max(0, line.offsetTop - el.clientHeight / 2);
  }, []);

  const starts = items.map((i) => toMin(i.start)).filter((v): v is number => v != null);
  const ends = items.map((i) => toMin(i.end)).filter((v): v is number => v != null);
  if (starts.length === 0) {
    return <EmptyState icon="🎤" title="この日の公演はありません" message="別の日を選んでください" />;
  }
  const minT = Math.floor(Math.min(...starts) / 60) * 60;
  const maxT = Math.ceil(Math.max(...ends, ...starts) / 60) * 60;
  const totalH = (maxT - minT) * PX_PER_MIN;

  const ticks: number[] = [];
  for (let t = minT; t <= maxT; t += 30) ticks.push(t);

  const nowOffset = (refMin - minT) * PX_PER_MIN;
  const nowVisible = refMin >= minT && refMin <= maxT;

  const sorted = sortItems(items);

  return (
    <div>
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="text-xs font-bold" style={{ color: THEME.ink }}>タイムテーブル（{items.length}公演）</div>
        <div className="flex items-center gap-1.5">
          {nowVisible && (
            <button onClick={() => nowLineRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
              className="text-[10px] font-black px-2.5 py-1 rounded-full text-white active:scale-95 shadow-sm" style={{ background: accent }}>
              🕒 現在時刻へ
            </button>
          )}
          {/* マウス派・スクロールが効かない環境向けの明示ボタン(PCのみ表示) */}
          <button onClick={() => scrollBy(-260)} aria-label="上へスクロール"
            className="hidden md:flex w-7 h-7 rounded-full bg-white border border-stone-200 items-center justify-center text-stone-600 font-black active:scale-95 shadow-sm">▲</button>
          <button onClick={() => scrollBy(260)} aria-label="下へスクロール"
            className="hidden md:flex w-7 h-7 rounded-full bg-white border border-stone-200 items-center justify-center text-stone-600 font-black active:scale-95 shadow-sm">▼</button>
        </div>
      </div>
      <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
        <div className="flex items-center justify-center text-xs font-black text-white py-2.5" style={{ background: THEME.festGradient }}>
          🎤 ステージ進行表
        </div>

        <div ref={scrollRef} className="overflow-y-auto overscroll-contain" style={{ maxHeight: "min(66vh, 720px)" }}>
        <div className="flex">
          <div className="flex-shrink-0 relative border-r border-stone-200 bg-stone-50/50" style={{ width: TIME_COL, height: totalH }}>
            {ticks.map((t) => (
              <div key={t} className="absolute left-0 right-0 flex items-start justify-end pr-1.5"
                style={{ top: (t - minT) * PX_PER_MIN - 6 }}>
                <span className={`tabular-nums ${t % 60 === 0 ? "text-[11px] font-black text-stone-500" : "text-[9px] font-bold text-stone-300"}`}>{minToHHMM(t)}</span>
              </div>
            ))}
          </div>

          <div className="flex-1 relative" style={{ height: totalH }}>
            {ticks.map((t) => (
              <div key={t} className="absolute left-0 right-0" style={{ top: (t - minT) * PX_PER_MIN, borderTop: t % 60 === 0 ? "1px solid #e7e5e4" : "1px dashed #f0efed" }} />
            ))}
            {nowVisible && (
              <div ref={nowLineRef} className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: nowOffset }}>
                <div className="h-0.5" style={{ background: accent }} />
                <div className="absolute right-1 -top-2.5 px-1.5 py-0.5 rounded-full text-[9px] font-black text-white shadow" style={{ background: accent }}>NOW {minToHHMM(refMin)}</div>
              </div>
            )}
            {sorted.map((item) => {
              const st = toMin(item.start), en = toMin(item.end);
              if (st == null) return null;
              const top = (st - minT) * PX_PER_MIN;
              const h = Math.max(34, ((en ?? st + 20) - st) * PX_PER_MIN);
              const status = itemStatus(item, refMin);
              const isLive = status === "live";
              const faded = status === "done" || status === "canceled";
              return (
                <div key={item.id} className="absolute rounded-xl px-3 py-2 overflow-hidden transition-all cursor-pointer"
                  onClick={() => onTap(item)} role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTap(item); } }}
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
                </div>
              );
            })}
          </div>
        </div>
        </div>
      </div>
      <div className="text-[11px] text-stone-400 mt-2 flex items-center gap-1.5">
        <span className="w-2.5 h-0.5 rounded-full" style={{ background: accent }} /> ピンクの線が現在時刻 · 表の中を上下にスクロールできます
      </div>
    </div>
  );
};

const StageHeader = ({ program }: { program: StageProgram | null }) => (
  <header className="sticky top-0 z-30 overflow-hidden" style={{ background: "linear-gradient(120deg,#9b5de5 0%,#4cc9f0 60%,#3ddc97 100%)" }}>
    <div className="absolute inset-0 opacity-25 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle,#fff 1.5px,transparent 1.5px)", backgroundSize: "22px 22px" }} />
    <div className="relative max-w-xl mx-auto px-4 pt-4 pb-4">
      <div className="text-[10px] font-extrabold text-white/90 tracking-[0.25em] uppercase flex items-center gap-1"><span>🎤</span> STAGE</div>
      <h1 className="text-[26px] font-black text-white tracking-tight" style={{ letterSpacing: "-0.02em", textShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>ステージ進行</h1>
      <div className="text-xs text-white/90 font-bold mt-0.5">{program?.stageName || "メインステージ"}</div>
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

  return (
    <div className="pb-28">
      <div className="sticky top-0 z-10 bg-stone-50/90 backdrop-blur-xl border-b border-stone-200 px-4 py-3 flex items-center gap-2">
        <IconButton icon={ChevronLeft} onClick={onBack} label="戻る" variant="ghost" />
        <div className="flex-1 min-w-0"><div className="text-xs text-stone-500">ステージ管理</div><div className="font-bold text-stone-900 truncate">{draft.stageName}</div></div>
      </div>

      <div className="px-4 pt-5">
        {dayCount > 1 && (
          <div className="flex gap-2 mb-3">
            {Array.from({ length: dayCount }).map((_, i) => {
              const d = i + 1;
              return (
                <button key={d} onClick={() => setDay(d)}
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
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1 mb-4">
          {venues.map((v) => {
            const count = draft.items.filter((i) => (i.venue || MAIN_STAGE) === v && (i.day || 1) === day).length;
            return (
              <button key={v} onClick={() => setVenue(v)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-extrabold transition-all active:scale-95 border ${venue === v ? "text-white border-transparent shadow-sm" : "bg-white text-stone-600 border-stone-200"}`}
                style={venue === v ? { background: "linear-gradient(135deg,#9b5de5,#4cc9f0)" } : {}}>
                {v === MAIN_STAGE ? "🎤 " : "🎭 "}{v}{count > 0 ? `（${count}）` : ""}
              </button>
            );
          })}
        </div>

        <div className="rounded-2xl p-4 mb-4 border" style={{ background: "#fff7ed", borderColor: "#ff8a3d44" }}>
          <div className="flex items-center gap-2 mb-2.5"><Clock size={16} style={{ color: THEME.orange }} strokeWidth={2.4} /><div className="font-bold text-sm" style={{ color: THEME.ink }}>進行が押している/巻いているとき</div></div>
          <p className="text-xs text-stone-500 mb-3 leading-relaxed">{dayCount > 1 ? `${day}日目の` : ""}これから始まる公演の時刻をまとめてずらせます（終了済みは動きません）。</p>
          <div className="grid grid-cols-4 gap-2">
            <button onClick={() => shiftAll(-5)} className="py-2.5 rounded-xl bg-white border border-stone-200 font-bold text-sm active:scale-95">−5分</button>
            <button onClick={() => shiftAll(5)} className="py-2.5 rounded-xl bg-white border border-stone-200 font-bold text-sm active:scale-95">+5分</button>
            <button onClick={() => shiftAll(10)} className="py-2.5 rounded-xl bg-white border border-stone-200 font-bold text-sm active:scale-95">+10分</button>
            <button onClick={() => shiftAll(15)} className="py-2.5 rounded-xl bg-white border border-stone-200 font-bold text-sm active:scale-95">+15分</button>
          </div>
        </div>

        <button onClick={() => setCreating(true)}
          className="w-full mb-3 flex items-center gap-3 p-4 bg-white rounded-2xl border-2 border-dashed border-stone-300 hover:border-stone-900 active:scale-[0.99] transition-all text-left">
          <div className="w-11 h-11 rounded-xl bg-stone-100 flex items-center justify-center flex-shrink-0"><Plus size={20} className="text-stone-700" strokeWidth={2.5} /></div>
          <div className="flex-1"><div className="font-bold text-stone-900">公演を追加（{venue}{dayCount > 1 ? `・${day}日目` : ""}）</div><div className="text-xs text-stone-500">タイトル・時刻・出演者を登録</div></div>
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
              「{venue}」の{dayCount > 1 ? `${day}日目の` : ""}公演はまだありません。<br />上の「公演を追加」から登録できます。
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

const StageItemEditor = ({ item, isNew, venues, onClose, onSave, onDelete }: { item: StageItem; isNew: boolean; venues: string[]; onClose: () => void; onSave: (i: StageItem) => void; onDelete: () => void }) => {
  const [form, setForm] = useState<StageItem>(item || makeStageItem({}));
  const [confirmDel, setConfirmDel] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const set = <K extends keyof StageItem>(k: K, v: StageItem[K]) => setForm((p) => ({ ...p, [k]: v }));
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
          <Hint>体育館ステージのほか、演劇部・音楽部・放送部など会場ごとに登録できます（新しい会場名を入力すると一覧に追加されます）</Hint>
        </Field>
        <Field label="紹介文（任意）">
          <textarea value={form.description} onChange={(e) => set("description", e.target.value)} maxLength={120} rows={3}
            className="w-full px-4 py-3 rounded-xl border border-stone-200 text-base bg-white outline-none focus:border-stone-900 resize-none leading-relaxed" placeholder="例: 3年間の集大成をお届けします！全4曲、ぜひ最後まで！" />
          <Hint>来場者が公演をタップすると表示されます（{form.description.length}/120）</Hint>
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
        <Field label="お知らせ（任意）">
          <input type="text" value={form.note} onChange={(e) => set("note", e.target.value)} maxLength={40}
            className="w-full px-4 py-3 rounded-xl border border-stone-200 text-base bg-white outline-none focus:border-stone-900" placeholder="例: 雨天のため室内に変更" />
          <Hint>来場者のタイムテーブルに黄色いお知らせとして表示されます</Hint>
        </Field>
      </div>
      <div className="sticky bottom-0 bg-stone-50/95 backdrop-blur-xl border-t border-stone-200 px-5 py-3 flex gap-2" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}>
        {!isNew && <button onClick={() => setConfirmDel(true)} className="px-4 py-3 rounded-2xl border border-red-200 bg-white text-red-600 font-bold text-sm active:scale-95 flex items-center justify-center" aria-label="削除"><Trash2 size={16} strokeWidth={2.5} /></button>}
        <button onClick={onClose} className="flex-1 px-4 py-3 rounded-2xl border border-stone-200 bg-white text-stone-700 font-bold text-sm active:scale-95">キャンセル</button>
        <button onClick={() => valid && onSave({ ...form, title: form.title.trim(), performer: form.performer.trim(), note: form.note.trim(), description: form.description.trim(), emoji: (form.emoji || "🎤").trim() || "🎤", venue: (form.venue || MAIN_STAGE).trim() || MAIN_STAGE })} disabled={!valid}
          className="flex-1 px-4 py-3 rounded-2xl text-white font-bold text-sm active:scale-95 disabled:opacity-40" style={{ background: valid ? "linear-gradient(135deg,#ff4d8d,#9b5de5)" : "#a8a29e" }}>{isNew ? "追加する" : "保存する"}</button>
      </div>
      {confirmDel && <Confirm title="削除しますか?" message={`「${form.title}」を削除します。`} confirmLabel="削除する" danger onConfirm={() => { onDelete(); setConfirmDel(false); }} onCancel={() => setConfirmDel(false)} />}
    </Sheet>
  );
};
