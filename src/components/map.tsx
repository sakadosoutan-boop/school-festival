import { useMemo, useRef } from "react";
import { MapPin } from "lucide-react";
import { allSoldOut, boothsForRoom, BUILDINGS, formatLocation, getStatus, THEME } from "../lib/festival";
import type { Booth } from "../types";
import { BoothIcon, useDragScroll } from "./ui";

/* ═══════════ MAP VIEW ═══════════
   文化祭マップ(校内図に忠実)。教室を個別セルで表示。viewBox 240x166。
   食事マーク🍴はブースデータ(category:food)から自動表示。学食のみ固定。
   🥤=自販機(赤マーカー位置) / 🗑️=ゴミ箱(かえる広場) */

const MAP_W = 240, MAP_H = 166;

interface MapMisc { id: string; label: string; x: number; y: number; w: number; h: number; kind: string; vertical?: boolean; bId?: string }

// 校内マップPDF(やなぎ祭)に合わせた配置。bIdを持つ施設は、その棟の企画があると点灯し、タップで一覧へ移動する。
const MAP_MISC: MapMisc[] = [
  { id: "note", label: "※空白は立入禁止", x: 6, y: 2, w: 44, h: 7, kind: "note" },
  { id: "bike_top", label: "自転車置き場", x: 54, y: 2, w: 70, h: 7, kind: "misc" },
  { id: "trash_area", label: "ゴミ捨て場", x: 130, y: 2, w: 28, h: 7, kind: "misc" },
  { id: "bike_left", label: "自転車置き場", x: 4, y: 12, w: 8, h: 80, kind: "misc", vertical: true },
  { id: "gate", label: "正門", x: 4, y: 112, w: 8, h: 16, kind: "gate" },
  { id: "panel", label: "顔出し\nパネル", x: 16, y: 92, w: 14, h: 11, kind: "misc" },
  { id: "fountain", label: "噴水", x: 18, y: 120, w: 12, h: 11, kind: "misc" },
  { id: "gaikoku", label: "外国語科棟", x: 40, y: 126, w: 24, h: 12, kind: "facility", bId: "gaikoku" },
  { id: "piloti", label: "ピロティー", x: 66, y: 126, w: 20, h: 12, kind: "facility" },
  { id: "shokudo", label: "1F食堂 🍴\n2F合宿棟", x: 96, y: 124, w: 30, h: 14, kind: "facility" },
  { id: "gym", label: "体育館 🎤", x: 40, y: 146, w: 34, h: 14, kind: "gym" },
  { id: "bushitsu", label: "部室棟/卓球場", x: 80, y: 146, w: 34, h: 14, kind: "facility" },
  { id: "ground", label: "グラウンド", x: 178, y: 46, w: 58, h: 76, kind: "ground", bId: "outdoor" },
];

// かえる広場(イートインスペース・アンブレラスカイ☂️・ゴミ箱あり)。
// アイコンと文字が重ならないよう、実マップに合わせて幅を広めに取る。
const FROG_PLAZA = { x: 46, y: 45, w: 68, h: 10, bId: "outdoor", label: "かえる広場" };

interface MapRoom { n: string; w: number; off?: boolean; vend?: boolean }
interface MapBlock { id: string; label: string; lx: number; ly: number; x: number; y: number; w: number; floorH: number; entrance?: { x: number; y: number; w: number; h: number; label: string }; floors: Array<{ f: string; rooms: MapRoom[] }> }

const MAP_BLOCKS: MapBlock[] = [
  { id: "special", label: "特別棟", lx: 42, ly: 11, x: 42, y: 13, w: 100, floorH: 7,
    floors: [
      { f: "4F", rooms: [{ n: "視聴覚室", w: 18 }, { n: "図書室", w: 62 }, { n: "音楽室", w: 20 }] },
      { f: "3F", rooms: [{ n: "地学室", w: 18 }, { n: "社会科室", w: 24 }, { n: "書道室", w: 20 }, { n: "書道準備室", w: 14 }, { n: "美術室", w: 24 }] },
      { f: "2F", rooms: [{ n: "生物室", w: 18 }, { n: "理科第1講義室", w: 26 }, { n: "理科第2講義室", w: 26 }, { n: "数学準備室", w: 14 }, { n: "物理室", w: 16 }] },
      { f: "1F", rooms: [{ n: "化学室", w: 18 }, { n: "被服室", w: 20 }, { n: "家庭科室", w: 22 }, { n: "礼法室", w: 16 }, { n: "調理室", w: 24 }] },
    ] },
  { id: "hr", label: "HR棟", lx: 22, ly: 56, x: 30, y: 58, w: 124, floorH: 9,
    entrance: { x: 22, y: 58, w: 8, h: 27, label: "昇降口" },
    floors: [
      { f: "3F", rooms: [{ n: "多目的室", w: 16 }, { n: "1-1", w: 15.43 }, { n: "1-2", w: 15.43 }, { n: "1-3", w: 15.43 }, { n: "1-4", w: 15.43 }, { n: "1-5", w: 15.43 }, { n: "1-6", w: 15.43 }, { n: "1-7", w: 15.42 }] },
      { f: "2F", rooms: [{ n: "多目的室", w: 16 }, { n: "2-1", w: 15.43 }, { n: "2-2", w: 15.43 }, { n: "2-3", w: 15.43 }, { n: "2-4", w: 15.43 }, { n: "2-5", w: 15.43 }, { n: "2-6", w: 15.43 }, { n: "2-7", w: 15.42 }] },
      { f: "1F", rooms: [{ n: "3-1", w: 15.5 }, { n: "3-2", w: 15.5 }, { n: "3-3", w: 15.5 }, { n: "3-4", w: 15.5 }, { n: "3-5", w: 15.5 }, { n: "3-6", w: 15.5 }, { n: "3-7", w: 15.5 }, { n: "3-8", w: 15.5 }] },
    ] },
  { id: "admin", label: "管理棟", lx: 40, ly: 90, x: 40, y: 92, w: 100, floorH: 8,
    floors: [
      { f: "2F", rooms: [{ n: "会議室", w: 20 }, { n: "放送室", w: 20 }, { n: "職員室", w: 60 }] },
      { f: "1F", rooms: [{ n: "事務室", w: 20 }, { n: "校長室", w: 20 }, { n: "応接室", w: 20 }, { n: "保健室", w: 20 }, { n: "進路資料室", w: 20 }] },
    ] },
  // 増設棟は管理棟と繋がっているため、横に密着させて階数表示は出さない
  // (HR棟とは離す)。自販機は自習室の中にあるので、セル内アイコンで示す。
  { id: "extra", label: "増設棟", lx: 140, ly: 90, x: 140, y: 92, w: 30, floorH: 8,
    floors: [
      { f: "", rooms: [{ n: "1-8", w: 15 }, { n: "1-9", w: 15 }] },
      { f: "", rooms: [{ n: "2-8", w: 15 }, { n: "2-9", w: 15 }] },
      { f: "", rooms: [{ n: "自習室", w: 15, vend: true }, { n: "3-9", w: 15 }] },
    ] },
];

// 自販機(建物内は該当セルのアイコンで表示):
//   HR棟1F 昇降口と3-1の間 / 食堂入口
const VENDING_SPOTS = [
  { x: 30.8, y: 81.2 },
  { x: 101, y: 121.5 },
];

export const MapView = ({ booths, onJump, onOpenStage }: { booths: Booth[]; onJump: (id: string) => void; onOpenStage: () => void }) => {
  const grouped = useMemo(() => {
    const g: Record<string, Booth[]> = {};
    BUILDINGS.forEach((b) => { g[b.id] = []; });
    booths.forEach((b) => { (g[b.building] || (g[b.building] = [])).push(b); });
    return g;
  }, [booths]);

  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollTo = (bId: string | undefined) => {
    if (!bId) return;
    const el = refs.current[bId];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // PCのマウスでも地図を横に動かせるように、ドラッグでスクロールさせる
  // (ホイールやスクロールバーに気づかない人が多いため)。
  const pan = useDragScroll<HTMLDivElement>();

  return (
    <>
      <header className="sticky top-0 z-30 overflow-hidden" style={{ background: "linear-gradient(120deg,#3ddc97 0%,#4cc9f0 55%,#9b5de5 100%)" }}>
        <div className="absolute inset-0 opacity-25 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle,#fff 1.5px,transparent 1.5px)", backgroundSize: "22px 22px" }} />
        <div className="absolute top-4 right-10 text-base anim-twinkle pointer-events-none">⭐</div>
        <div className="absolute bottom-3 right-20 text-sm anim-twinkle pointer-events-none" style={{ animationDelay: "1s" }}>✨</div>
        <div className="relative max-w-xl mx-auto px-4 pt-4 pb-4">
          <div className="text-[10px] font-extrabold text-white/90 tracking-[0.25em] uppercase flex items-center gap-1"><span>🗺️</span> MAP</div>
          <h1 className="text-[26px] font-black text-white tracking-tight" style={{ letterSpacing: "-0.02em", textShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>会場マップ</h1>
          <div className="text-xs text-white/90 font-bold mt-0.5">棟をタップすると企画一覧へジャンプ</div>
        </div>
      </header>

      <main className="max-w-xl md:max-w-4xl mx-auto px-4 pt-4">
        <div className="rounded-3xl border-2 border-stone-200 bg-white p-3 mb-3 shadow-sm relative">
          <div {...pan} className="overflow-x-auto scrollbar-none -mx-1 px-1 cursor-grab active:cursor-grabbing select-none">
            <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} style={{ width: "100%", minWidth: 760, display: "block" }}>
              <rect x="0" y="0" width={MAP_W} height={MAP_H} rx="2.5" fill="#f6f8f4" />

              {MAP_MISC.map((m) => {
                const lines = (m.label || "").split("\n");
                if (m.kind === "note") {
                  return <text key={m.id} x={m.x} y={m.y + 5} fontSize="2.8" fontWeight="700" fill="#b3aca0">{m.label}</text>;
                }
                const fill = m.kind === "gate" ? "#efe9df"
                  : m.kind === "facility" ? "#ffffff"
                  : m.kind === "gym" ? "#fdf3f7"
                  : m.kind === "court" ? "#eaf3f7"
                  : m.kind === "ground" ? "#e9f5e4"
                  : "#efeeec";
                const stroke = m.kind === "gate" ? "#d8d0c0"
                  : m.kind === "facility" ? "#d8d5cf"
                  : m.kind === "gym" ? "#eeb6cd"
                  : m.kind === "court" ? "#a8cbdc"
                  : m.kind === "ground" ? "#b9d9ad"
                  : "#ddd9d2";
                const tfill = m.kind === "gate" ? "#8a8273"
                  : m.kind === "gym" ? "#8a5570"
                  : m.kind === "court" ? "#6e9cb4"
                  : m.kind === "ground" ? "#7ba56b"
                  : m.kind === "facility" ? "#7a756c"
                  : "#9b968e";
                const mcx = m.x + m.w / 2, mcy = m.y + m.h / 2;
                const linked = m.bId ? (grouped[m.bId] || []) : [];
                const clickable = m.kind === "gym" || linked.length > 0;
                return (
                  <g key={m.id} style={{ cursor: clickable ? "pointer" : "default" }}
                    onClick={() => { if (m.kind === "gym") onOpenStage(); else if (m.bId && linked.length > 0) scrollTo(m.bId); }}>
                    <title>{m.label.replace("\n", "")}</title>
                    {linked.length > 0 && <rect x={m.x - 1} y={m.y - 1} width={m.w + 2} height={m.h + 2} rx="2.2" fill="#ffb157" opacity="0.22" />}
                    <rect x={m.x} y={m.y} width={m.w} height={m.h} rx="1.4"
                      fill={linked.length > 0 ? "#fff3e0" : fill} stroke={linked.length > 0 ? "#ff9e3d" : stroke} strokeWidth={linked.length > 0 ? 0.9 : 0.5}
                      strokeDasharray={m.kind === "court" ? "1.6 1.2" : "none"} />
                    {m.vertical ? (
                      m.label.split("").map((ch, i) => (
                        <text key={i} x={mcx} y={m.y + 7 + i * 5.4} textAnchor="middle" fontSize="3" fontWeight="600" fill={tfill}>{ch}</text>
                      ))
                    ) : (
                      lines.map((line, i) => (
                        <text key={i} x={mcx} y={mcy + (i - (lines.length - 1) / 2) * 4 + 1.1}
                          textAnchor="middle" fontSize={m.kind === "misc" ? 2.7 : 3.1} fontWeight="800" fill={tfill}>{line}</text>
                      ))
                    )}
                  </g>
                );
              })}

              {(() => {
                const list = grouped[FROG_PLAZA.bId] || [];
                const has = list.length > 0;
                const hasFood = list.some((bt) => bt.category === "food");
                const open = list.filter((bt) => bt.isOpen);
                const wait = open.length ? Math.max(...open.map((bt) => bt.waitMinutes)) : null;
                const fcx = FROG_PLAZA.x + FROG_PLAZA.w / 2, fcy = FROG_PLAZA.y + FROG_PLAZA.h / 2;
                return (
                  <g style={{ cursor: has ? "pointer" : "default" }} onClick={() => has && scrollTo("outdoor")}>
                    <title>かえる広場</title>
                    {has && <rect x={FROG_PLAZA.x - 1} y={FROG_PLAZA.y - 1} width={FROG_PLAZA.w + 2} height={FROG_PLAZA.h + 2} rx="2.2" fill="#ffb157" opacity="0.22" />}
                    <rect x={FROG_PLAZA.x} y={FROG_PLAZA.y} width={FROG_PLAZA.w} height={FROG_PLAZA.h} rx="1.6"
                      fill={has ? "#fff3e0" : "#f7f1e6"} stroke={has ? "#ff9e3d" : "#e0d8c8"} strokeWidth={has ? 0.9 : 0.5} />
                    <text x={FROG_PLAZA.x + 5} y={fcy + 1.3} textAnchor="middle" fontSize="3">☂️</text>
                    {hasFood && <text x={FROG_PLAZA.x + 11} y={fcy + 1.3} textAnchor="middle" fontSize="3">🍴</text>}
                    <text x={fcx} y={fcy - 0.6} textAnchor="middle" fontSize="3.1" fontWeight="800" fill={has ? "#5b3a1e" : "#9b968e"}>{FROG_PLAZA.label}</text>
                    <text x={fcx} y={fcy + 3.6} textAnchor="middle" fontSize="2.2" fontWeight="800" fill={has ? "#a06a35" : "#b3aca0"}>イートインスペース</text>
                    {has && wait != null && <text x={FROG_PLAZA.x + FROG_PLAZA.w - 15} y={fcy + 1.1} textAnchor="middle" fontSize="2.7" fontWeight="900" fill="#e6206b">{wait}分</text>}
                    <text x={FROG_PLAZA.x + FROG_PLAZA.w - 5} y={fcy + 1.4} textAnchor="middle" fontSize="3.4">🗑️</text>
                  </g>
                );
              })()}

              {MAP_BLOCKS.map((blk) => (
                <g key={blk.id}>
                  <text x={blk.lx} y={blk.ly} fontSize="4" fontWeight="900" fill="#6b6660">{blk.label}</text>
                  {blk.entrance && (
                    <g>
                      <rect x={blk.entrance.x} y={blk.entrance.y} width={blk.entrance.w} height={blk.entrance.h}
                        fill="#fff" stroke="#c9c4bb" strokeWidth="0.6" />
                      {blk.entrance.label.split("").map((ch, i) => (
                        <text key={i} x={blk.entrance!.x + blk.entrance!.w / 2} y={blk.entrance!.y + 7 + i * 7.5}
                          textAnchor="middle" fontSize="3.1" fontWeight="800" fill="#7a756c">{ch}</text>
                      ))}
                    </g>
                  )}
                  {blk.floors.map((fl, fi) => {
                    const fy = blk.y + fi * blk.floorH;
                    const labelX = (blk.entrance ? blk.entrance.x : blk.x) - 2;
                    let cursorX = blk.x;
                    return (
                      <g key={fi}>
                        {fl.f && <text x={labelX} y={fy + blk.floorH / 2 + 1.1} textAnchor="end" fontSize="2.9" fontWeight="800" fill="#9b968e">{fl.f}</text>}
                        {fl.rooms.map((rm, ri) => {
                          const rx = cursorX; cursorX += rm.w;
                          const matched = (rm.n && !rm.off) ? boothsForRoom(booths, rm.n) : [];
                          const has = matched.length > 0;
                          const bt = matched[0];
                          const isFood = matched.some((mm) => mm.category === "food");
                          const sold = has && matched.every((mm) => allSoldOut(mm));
                          return (
                            <g key={ri} style={{ cursor: has ? "pointer" : "default" }}
                              onClick={() => { if (has && bt) onJump(bt.id); }}>
                              {rm.n ? <title>{rm.vend ? `${rm.n}(室内に自販機あり)` : rm.n}</title> : null}
                              {has && <rect x={rx - 0.5} y={fy - 0.5} width={rm.w + 1} height={blk.floorH + 1} rx="1.4" fill="#ffb157" opacity="0.22" />}
                              <rect x={rx} y={fy} width={rm.w} height={blk.floorH} rx="0.8"
                                fill={rm.off ? "#eceae6" : has ? "#fff3e0" : rm.n ? "#ffffff" : "#fbfaf8"}
                                stroke={has ? "#ff9e3d" : "#ddd9d2"} strokeWidth={has ? 0.8 : 0.35} />
                              {rm.off && (
                                <text x={rx + rm.w / 2} y={fy + blk.floorH / 2 + 1} textAnchor="middle" fontSize="2.8" fontWeight="700" fill="#b0aaa0">{rm.n}</text>
                              )}
                              {rm.n && !rm.off && (
                                <text x={rx + rm.w / 2} y={has ? fy + blk.floorH / 2 - 0.7 : fy + blk.floorH / 2 + 1.1}
                                  textAnchor="middle" fontSize={rm.n.length >= 6 ? 2.1 : rm.n.length >= 4 ? 2.6 : 3} fontWeight="800"
                                  fill={has ? "#5b3a1e" : "#8a857c"}>{rm.n}</text>
                              )}
                              {has && bt && (
                                sold
                                  ? <text x={rx + rm.w / 2} y={fy + blk.floorH - 1.2} textAnchor="middle" fontSize="2.5" fontWeight="900" fill="#dc2626">完売</text>
                                  : <text x={rx + rm.w / 2} y={fy + blk.floorH - 1.2} textAnchor="middle" fontSize="2.5" fontWeight="900" fill="#e6206b">{bt.isOpen ? `${bt.waitMinutes}分` : "休"}</text>
                              )}
                              {isFood && <text x={rx + rm.w - 2.2} y={fy + 3} textAnchor="middle" fontSize="2.7">🍴</text>}
                              {rm.vend && <text x={rx + (isFood ? rm.w - 7.7 : rm.w - 3.2)} y={fy + 3} textAnchor="middle" fontSize="2.7">🥤</text>}
                            </g>
                          );
                        })}
                      </g>
                    );
                  })}
                </g>
              ))}

              {VENDING_SPOTS.map((v, i) => (
                <g key={i}>
                  <circle cx={v.x} cy={v.y} r="3.2" fill="#fff" stroke="#e2dcd2" strokeWidth="0.45" />
                  <text x={v.x} y={v.y + 1.3} textAnchor="middle" fontSize="3.6">🥤</text>
                </g>
              ))}
            </svg>
          </div>
          <button onClick={() => scrollTo(BUILDINGS.find((b) => (grouped[b.id] || []).length > 0)?.id)}
            className="absolute bottom-5 right-5 px-3.5 py-2 rounded-full flex items-center gap-1.5 text-white text-xs font-black shadow-lg active:scale-95 transition-transform"
            style={{ background: "#1d3461" }}>
            <MapPin size={13} strokeWidth={2.6} /> 一覧へ
          </button>
          <div className="flex items-center justify-center gap-3 mt-2 text-[10px] text-stone-500 font-bold flex-wrap">
            <span className="flex items-center gap-1">🍴 食品販売</span>
            <span className="flex items-center gap-1">☂️ アンブレラスカイ</span>
            <span className="flex items-center gap-1">🥤 自販機</span>
            <span className="flex items-center gap-1">🗑️ ゴミ箱</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border" style={{ borderColor: "#ff9e3d", background: "#fff3e0" }} /> 企画あり(タップで詳細)</span>
            <span className="flex items-center gap-1"><span className="font-black" style={{ color: "#e6206b" }}>12分</span> 待ち時間</span>
          </div>
        </div>
        <div className="text-[11px] text-stone-400 mb-5 text-center md:hidden">↔ スワイプで横に動かせます</div>

        <div className="space-y-4 max-w-xl mx-auto">
          {BUILDINGS.map((b) => {
            const list = grouped[b.id] || [];
            if (list.length === 0) return null;
            return (
              <div key={b.id} ref={(el) => { refs.current[b.id] = el; }} style={{ scrollMarginTop: 80 }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${THEME.purple}1a` }}>
                    <MapPin size={15} style={{ color: THEME.purple }} strokeWidth={2.4} />
                  </div>
                  <h2 className="font-black text-sm" style={{ color: THEME.ink }}>{b.label}</h2>
                  <span className="text-xs text-stone-400">({list.length})</span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {list.slice().sort((x, y) => (x.floor || 0) - (y.floor || 0)).map((booth) => {
                    const status = getStatus(booth.waitMinutes, booth.isOpen);
                    return (
                      <button key={booth.id} onClick={() => onJump(booth.id)}
                        className="w-full text-left flex items-center gap-3 p-3 bg-white rounded-2xl border border-stone-200 hover:border-stone-300 active:scale-[0.99] transition-all">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0" style={{ background: status.soft }}>
                          <BoothIcon booth={booth} size={40} rounded={12} emojiClass="text-xl" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-stone-900 truncate text-sm">{booth.name}</div>
                          <div className="text-xs text-stone-500 truncate">{formatLocation(booth)}</div>
                        </div>
                        <div className="text-base font-black tabular-nums flex-shrink-0" style={{ color: status.color }}>{booth.isOpen ? `${booth.waitMinutes}分` : "休"}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-center text-[11px] text-stone-400 mt-6 font-medium max-w-xl mx-auto">
          会場の位置関係を表した模式マップです · 棟をタップすると企画一覧へ移動します
        </div>
      </main>
    </>
  );
};
