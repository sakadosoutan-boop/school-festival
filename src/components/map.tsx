import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent as ReactFocusEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { Maximize2, MapPin, Thermometer, ZoomIn, ZoomOut } from "lucide-react";
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
  { id: "gaikoku", label: "外国語科棟", x: 40, y: 126, w: 28, h: 12, kind: "facility", bId: "gaikoku" },
  { id: "piloti", label: "ピロティー", x: 72, y: 126, w: 20, h: 12, kind: "facility" },
  { id: "shokudo", label: "1F食堂 🍴\n2F合宿棟", x: 96, y: 124, w: 30, h: 14, kind: "facility" },
  { id: "gym", label: "体育館 🎤", x: 40, y: 146, w: 44, h: 14, kind: "gym" },
  { id: "bushitsu", label: "部室棟/卓球場", x: 90, y: 146, w: 40, h: 14, kind: "facility" },
  // グラウンドは企画数が少ないので最小限にし、教室棟へ面積を譲る
  { id: "ground", label: "グラウンド", x: 206, y: 46, w: 30, h: 76, kind: "ground", bId: "outdoor" },
];

// かえる広場(イートインスペース・アンブレラスカイ☂️・ゴミ箱あり)。
// アイコンと文字が重ならないよう、実マップに合わせて幅を広めに取る。
const FROG_PLAZA = { x: 46, y: 46, w: 84, h: 11, bId: "outdoor", label: "かえる広場" };

interface MapRoom { n: string; w: number; off?: boolean; vend?: boolean }
interface MapBlock { id: string; label: string; lx: number; ly: number; x: number; y: number; w: number; floorH: number; entrance?: { x: number; y: number; w: number; h: number; label: string }; floors: Array<{ f: string; rooms: MapRoom[] }> }

const MAP_BLOCKS: MapBlock[] = [
  { id: "special", label: "特別棟", lx: 40, ly: 11, x: 40, y: 13, w: 130, floorH: 7.5,
    floors: [
      { f: "4F", rooms: [{ n: "視聴覚室", w: 23.4 }, { n: "図書室", w: 80.6 }, { n: "音楽室", w: 26 }] },
      { f: "3F", rooms: [{ n: "地学室", w: 23.4 }, { n: "社会科室", w: 31.2 }, { n: "書道室", w: 26 }, { n: "書道準備室", w: 18.2 }, { n: "美術室", w: 31.2 }] },
      { f: "2F", rooms: [{ n: "生物室", w: 23.4 }, { n: "理科第1講義室", w: 33.8 }, { n: "理科第2講義室", w: 33.8 }, { n: "数学準備室", w: 18.2 }, { n: "物理室", w: 20.8 }] },
      { f: "1F", rooms: [{ n: "化学室", w: 23.4 }, { n: "被服室", w: 26 }, { n: "家庭科室", w: 28.6 }, { n: "礼法室", w: 20.8 }, { n: "調理室", w: 31.2 }] },
    ] },
  { id: "hr", label: "HR棟", lx: 22, ly: 58, x: 30, y: 60, w: 161.2, floorH: 10,
    entrance: { x: 22, y: 60, w: 8, h: 30, label: "昇降口" },
    floors: [
      { f: "3F", rooms: [{ n: "多目的室", w: 20.8 }, { n: "1-1", w: 20.06 }, { n: "1-2", w: 20.06 }, { n: "1-3", w: 20.06 }, { n: "1-4", w: 20.06 }, { n: "1-5", w: 20.06 }, { n: "1-6", w: 20.06 }, { n: "1-7", w: 20.04 }] },
      { f: "2F", rooms: [{ n: "多目的室", w: 20.8 }, { n: "2-1", w: 20.06 }, { n: "2-2", w: 20.06 }, { n: "2-3", w: 20.06 }, { n: "2-4", w: 20.06 }, { n: "2-5", w: 20.06 }, { n: "2-6", w: 20.06 }, { n: "2-7", w: 20.04 }] },
      { f: "1F", rooms: [{ n: "3-1", w: 20.15 }, { n: "3-2", w: 20.15 }, { n: "3-3", w: 20.15 }, { n: "3-4", w: 20.15 }, { n: "3-5", w: 20.15 }, { n: "3-6", w: 20.15 }, { n: "3-7", w: 20.15 }, { n: "3-8", w: 20.15 }] },
    ] },
  { id: "admin", label: "管理棟", lx: 40, ly: 95, x: 40, y: 97, w: 130, floorH: 9,
    floors: [
      { f: "2F", rooms: [{ n: "会議室", w: 26 }, { n: "放送室", w: 26 }, { n: "職員室", w: 78 }] },
      { f: "1F", rooms: [{ n: "事務室", w: 26 }, { n: "校長室", w: 26 }, { n: "応接室", w: 26 }, { n: "保健室", w: 26 }, { n: "進路資料室", w: 26 }] },
    ] },
  // 増設棟は管理棟と繋がっているため、横に密着させて階数表示は出さない
  // (HR棟とは離す)。自販機は自習室の中にあるので、セル内アイコンで示す。
  { id: "extra", label: "増設棟", lx: 170, ly: 95, x: 170, y: 97, w: 34, floorH: 9,
    floors: [
      { f: "", rooms: [{ n: "1-8", w: 17 }, { n: "1-9", w: 17 }] },
      { f: "", rooms: [{ n: "2-8", w: 17 }, { n: "2-9", w: 17 }] },
      { f: "", rooms: [{ n: "自習室", w: 17, vend: true }, { n: "3-9", w: 17 }] },
    ] },
];

// 自販機(建物内は該当セルのアイコンで表示):
//   HR棟1F 昇降口と3-1の間 / 食堂入口
const VENDING_SPOTS = [
  { x: 30.8, y: 85.5 },
  { x: 101, y: 120.5 },
];

/* ═══════════ ズーム / 混雑ヒートマップ / アクセシビリティ ═══════════
   ズームは実データ(座標)を一切動かさず、SVGラッパーのCSS幅(minWidth)だけを変える。
   モバイルは開いた瞬間に校内全体が見えるよう「全体表示」を既定にし、
   PC・タブレットは従来どおりの見やすい倍率を既定にする。 */

const BASE_MAP_WIDTH = 760; // 従来の固定幅(標準倍率の基準)
const ZOOM_SCALES = [0.72, 1, 1.4] as const; // 縮小 / 標準 / 拡大の3段階
type ZoomStep = "fit" | 0 | 1 | 2;
const ZOOM_ORDER: readonly ZoomStep[] = ["fit", 0, 1, 2];
const MOBILE_BREAKPOINT = 768; // 既存のmd:ブレークポイントに合わせる

// 開場直後に最初に見えてほしいエリア(昇降口〜1年生教室付近=最も混み合うゾーン)
const INITIAL_FOCUS_X = 55;

const clampScrollLeft = (el: HTMLDivElement, left: number): number =>
  Math.max(0, Math.min(left, el.scrollWidth - el.clientWidth));

interface HeatStyle { fill: string; stroke: string; text: string; label: string }
// 混雑ヒートマップ専用の4段階(getStatusの区分とは別に、地図の塗り分け用に少し粗めにする)
const HEAT_LEVELS: Array<HeatStyle & { max: number }> = [
  { max: 5, fill: "#dcfce7", stroke: "#16a34a", text: "#14532d", label: "0-5分" },
  { max: 15, fill: "#fef9c3", stroke: "#ca8a04", text: "#713f12", label: "6-15分" },
  { max: 30, fill: "#ffedd5", stroke: "#ea580c", text: "#7c2d12", label: "16-30分" },
  { max: Infinity, fill: "#fee2e2", stroke: "#dc2626", text: "#7f1d1d", label: "31分+" },
];
const HEAT_CLOSED: HeatStyle = { fill: "#e7e5e4", stroke: "#a8a29e", text: "#44403c", label: "休み" };
const HEAT_SOLDOUT: HeatStyle = { fill: "#44403c", stroke: "#1c1917", text: "#f5f5f4", label: "完売" };

// 団体グループ(1セルに複数ブースがあることもある)の混雑度から塗り色を決める
const heatStyleForGroup = (list: Booth[]): HeatStyle | null => {
  if (list.length === 0) return null;
  if (list.every((b) => allSoldOut(b))) return HEAT_SOLDOUT;
  const open = list.filter((b) => b.isOpen);
  if (open.length === 0) return HEAT_CLOSED;
  const wait = Math.max(...open.map((b) => b.waitMinutes));
  return HEAT_LEVELS.find((lv) => wait <= lv.max) ?? HEAT_LEVELS[HEAT_LEVELS.length - 1]!;
};

const HeatSwatch = ({ heat }: { heat: HeatStyle }) => (
  <span className="flex items-center gap-1">
    <span className="w-3 h-3 rounded border flex-shrink-0" style={{ borderColor: heat.stroke, background: heat.fill }} aria-hidden="true" />
    {heat.label}
  </span>
);

interface CellRect { key: string; x: number; y: number; w: number; h: number }

export const MapView = ({ booths, onJump, onOpenStage, focusBoothId }: { booths: Booth[]; onJump: (id: string) => void; onOpenStage: () => void; focusBoothId?: string | null }) => {
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
  const scrollerRef = pan.ref; // ズーム計算・初期スクロールでも同じ要素を使うのでrefは1本に統一する

  const cardRef = useRef<HTMLDivElement | null>(null);

  /* ── 全体表示・ズーム ── */
  const [fitWidth, setFitWidth] = useState(BASE_MAP_WIDTH);
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () => setFitWidth(Math.max(240, Math.floor(el.clientWidth)));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollerRef]);

  // 既定値: スマホは開いた瞬間に全体が見える「全体表示」、PC/タブレットは従来どおりの倍率
  const [zoomStep, setZoomStep] = useState<ZoomStep>(() => (
    typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT ? "fit" : 1
  ));
  // ピンチ操作中は段階に縛られず連続的に拡大縮小する(ボタン操作でnullに戻す)
  const [pinchWidth, setPinchWidth] = useState<number | null>(null);
  const stepWidthPx = zoomStep === "fit" ? fitWidth : Math.round(BASE_MAP_WIDTH * ZOOM_SCALES[zoomStep]);
  const mapWidthPx = pinchWidth ?? stepWidthPx;

  // ズームの前後で画面中央に見えていた地点がずれないよう、変更直前のSVG座標を控えておく
  const centerXRef = useRef<number | null>(null);
  const captureCenter = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const pxPerUnit = mapWidthPx / MAP_W;
    centerXRef.current = (el.scrollLeft + el.clientWidth / 2) / pxPerUnit;
  };
  const stepZoom = (delta: number) => setZoomStep((s) => {
    const i = ZOOM_ORDER.indexOf(s);
    return ZOOM_ORDER[Math.max(0, Math.min(ZOOM_ORDER.length - 1, i + delta))] ?? s;
  });
  const zoomIn = () => { captureCenter(); setPinchWidth(null); stepZoom(1); };
  const zoomOut = () => { captureCenter(); setPinchWidth(null); stepZoom(-1); };
  const zoomFit = () => { captureCenter(); setPinchWidth(null); setZoomStep("fit"); };

  /* ── 2本指のピンチイン/アウト ──
     ブラウザ標準のページ拡大に取られないよう、要素のtouch-actionでピンチを無効化し、
     ここで自前に処理する(passive:falseでないとpreventDefaultできないため直接登録)。 */
  const pinchRef = useRef({ startDist: 0, startWidth: 0, active: false });
  const widthRef = useRef(mapWidthPx);
  widthRef.current = mapWidthPx;
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const dist = (t: TouchList) => {
      const a = t[0], b = t[1];
      if (!a || !b) return 0;
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      pinchRef.current = { startDist: dist(e.touches), startWidth: widthRef.current, active: true };
    };
    const onMove = (e: TouchEvent) => {
      if (!pinchRef.current.active || e.touches.length !== 2) return;
      const d = dist(e.touches);
      if (d <= 0 || pinchRef.current.startDist <= 0) return;
      e.preventDefault();
      const next = pinchRef.current.startWidth * (d / pinchRef.current.startDist);
      setPinchWidth(Math.round(Math.max(el.clientWidth, Math.min(BASE_MAP_WIDTH * 3, next))));
    };
    const onEnd = (e: TouchEvent) => { if (e.touches.length < 2) pinchRef.current.active = false; };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [scrollerRef]);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || centerXRef.current == null) return;
    const pxPerUnit = mapWidthPx / MAP_W;
    el.scrollLeft = clampScrollLeft(el, centerXRef.current * pxPerUnit - el.clientWidth / 2);
    centerXRef.current = null;
  }, [mapWidthPx, scrollerRef]);

  // 初期表示: 「全体表示」でなければ、開場直後に一番混み合う昇降口付近が見えるようにする
  // (何もしないとスクロール位置が0=マップ左端の駐輪場になり、意味のある初期位置にならないため)
  const didInitialScroll = useRef(false);
  useLayoutEffect(() => {
    if (didInitialScroll.current || zoomStep === "fit") return;
    const el = scrollerRef.current;
    if (!el) return;
    didInitialScroll.current = true;
    const pxPerUnit = mapWidthPx / MAP_W;
    el.scrollLeft = clampScrollLeft(el, INITIAL_FOCUS_X * pxPerUnit - el.clientWidth / 2);
  }, [zoomStep, mapWidthPx, scrollerRef]);

  /* ── 混雑ヒートマップ ── */
  const [heatmapOn, setHeatmapOn] = useState(false);

  /* ── キーボードフォーカス(Tab操作のときだけ枠を出す) ── */
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const cellRefs = useRef<Record<string, SVGGElement | null>>({});

  const focusableProps = (key: string, label: string, onActivate: () => void) => ({
    ref: (el: SVGGElement | null) => { cellRefs.current[key] = el; },
    tabIndex: 0,
    role: "button" as const,
    "aria-label": label,
    onClick: onActivate,
    onKeyDown: (e: ReactKeyboardEvent<SVGGElement>) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onActivate(); }
    },
    onFocus: (e: ReactFocusEvent<SVGGElement>) => {
      // クリック/タップでもfocusは当たるので、キーボード操作(:focus-visible)のときだけ枠を出す
      let visible = true;
      try { visible = e.currentTarget.matches(":focus-visible"); } catch { /* 未対応ブラウザは常に表示 */ }
      if (visible) setFocusedKey(key);
    },
    onBlur: () => setFocusedKey((k) => (k === key ? null : k)),
  });

  // 教室セルのジオメトリを一箇所で計算し、当たり判定(focusBoothIdの逆引き)と描画の両方で使い回す
  const roomCellsByKey = useMemo(() => {
    const map = new Map<string, CellRect & { matched: Booth[] }>();
    MAP_BLOCKS.forEach((blk) => {
      blk.floors.forEach((fl, fi) => {
        const fy = blk.y + fi * blk.floorH;
        let cursorX = blk.x;
        fl.rooms.forEach((rm, ri) => {
          const rx = cursorX; cursorX += rm.w;
          const matched = (rm.n && !rm.off) ? boothsForRoom(booths, rm.n) : [];
          const key = `${blk.id}:${fi}:${ri}`;
          map.set(key, { key, x: rx, y: fy, w: rm.w, h: blk.floorH, matched });
        });
      });
    });
    return map;
  }, [booths]);

  // focusBoothIdからセル(教室 / 連動施設 / かえる広場)を逆引きするための索引
  const boothCellIndex = useMemo(() => {
    const idx = new Map<string, CellRect>();
    roomCellsByKey.forEach((cell) => {
      cell.matched.forEach((b) => { if (!idx.has(b.id)) idx.set(b.id, { key: cell.key, x: cell.x, y: cell.y, w: cell.w, h: cell.h }); });
    });
    MAP_MISC.forEach((m) => {
      if (!m.bId) return;
      (grouped[m.bId] || []).forEach((b) => { if (!idx.has(b.id)) idx.set(b.id, { key: `misc:${m.id}`, x: m.x, y: m.y, w: m.w, h: m.h }); });
    });
    (grouped[FROG_PLAZA.bId] || []).forEach((b) => {
      if (!idx.has(b.id)) idx.set(b.id, { key: "frog", x: FROG_PLAZA.x, y: FROG_PLAZA.y, w: FROG_PLAZA.w, h: FROG_PLAZA.h });
    });
    return idx;
  }, [roomCellsByKey, grouped]);
  // boothCellIndexはboothsが8秒おきに再取得されるたびに新しい参照になる。
  // 中身の再計算はしたいが、それだけでfocusBoothId演出(スクロール/パルス)を再発火させたくないので
  // refで最新値だけ渡し、effectの依存はfocusBoothId自体に絞る。
  const boothCellIndexRef = useRef(boothCellIndex);
  useEffect(() => { boothCellIndexRef.current = boothCellIndex; }, [boothCellIndex]);

  /* ── focusBoothId: 該当ブースのセルへ横スクロール+ページも地図までスクロール+数秒ハイライト ── */
  const [focusPulse, setFocusPulse] = useState<CellRect | null>(null);
  useEffect(() => {
    if (!focusBoothId) return;
    const rect = boothCellIndexRef.current.get(focusBoothId);
    if (!rect) return; // 該当セルなし(旧データ・地図に載らない企画など) → 何もしない

    const el = scrollerRef.current;
    if (el) {
      const pxPerUnit = mapWidthPx / MAP_W;
      const cx = rect.x + rect.w / 2;
      el.scrollTo({ left: clampScrollLeft(el, cx * pxPerUnit - el.clientWidth / 2), behavior: "smooth" });
    }
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    cellRefs.current[rect.key]?.focus({ preventScroll: true });

    setFocusPulse(rect);
    const timer = window.setTimeout(() => setFocusPulse(null), 3000);
    return () => {
      window.clearTimeout(timer);
      setFocusPulse(null); // focusBoothIdが変わった/消えたら前のハイライトを必ず消す
    };
    // boothCellIndexはrefで参照するだけ、mapWidthPx/scrollerRefは「今の見た目」を使うだけでよく、
    // ポーリング更新やズーム操作のたびに再発火させたくないので依存に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusBoothId]);

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

      <main id="main-content" className="max-w-xl md:max-w-4xl mx-auto px-4 pt-4">
        <div ref={cardRef} className="rounded-3xl border-2 border-stone-200 bg-white p-3 mb-3 shadow-sm" style={{ scrollMarginTop: 80 }}>
          {/* 地図の表示エリア(このrelativeの中だけにツールバー/FABを重ねる。凡例はこの外に出して、FABと絶対に重ならないようにする) */}
          <div className="relative">
            {/* pan-x pan-y = 指1本のスクロールは通常どおり、ピンチだけ自前で処理する */}
            <div {...pan} style={{ touchAction: "pan-x pan-y" }}
              className="overflow-x-auto scrollbar-none -mx-1 px-1 cursor-grab active:cursor-grabbing select-none">
              <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} role="img" aria-label="坂戸高校 校内マップ。教室をタップすると企画の詳細が開きます。"
                style={{ width: "100%", minWidth: mapWidthPx, display: "block" }}>
                <style>{`
                  @keyframes mapFocusPulse { 0%, 100% { stroke-opacity: 1; } 50% { stroke-opacity: 0.25; } }
                  .map-focus-pulse { animation: mapFocusPulse 1s ease-in-out infinite; }
                  @media (prefers-reduced-motion: reduce) { .map-focus-pulse { animation: none; } }
                `}</style>
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
                  const tfillDefault = m.kind === "gate" ? "#8a8273"
                    : m.kind === "gym" ? "#8a5570"
                    : m.kind === "court" ? "#6e9cb4"
                    : m.kind === "ground" ? "#7ba56b"
                    : m.kind === "facility" ? "#7a756c"
                    : "#9b968e";
                  const mcx = m.x + m.w / 2, mcy = m.y + m.h / 2;
                  const linked = m.bId ? (grouped[m.bId] || []) : [];
                  const clickable = m.kind === "gym" || linked.length > 0;
                  const heat = heatmapOn && m.kind !== "gym" ? heatStyleForGroup(linked) : null;
                  const tfill = linked.length > 0 && heat ? heat.text : tfillDefault;
                  const miscKey = `misc:${m.id}`;
                  const activate = () => { if (m.kind === "gym") onOpenStage(); else if (m.bId && linked.length > 0) scrollTo(m.bId); };
                  const ariaLabel = m.kind === "gym"
                    ? "体育館ステージ。タップでステージ情報を開きます。"
                    : `${m.label.replace(/\n/g, "")}。企画あり。タップで一覧へ移動します。`;
                  return (
                    <g key={m.id} style={{ cursor: clickable ? "pointer" : "default" }}
                      {...(clickable ? focusableProps(miscKey, ariaLabel, activate) : {})}>
                      <title>{m.label.replace("\n", "")}</title>
                      {linked.length > 0 && <rect x={m.x - 1} y={m.y - 1} width={m.w + 2} height={m.h + 2} rx="2.2" fill={heat ? heat.stroke : "#ffb157"} opacity="0.22" />}
                      <rect x={m.x} y={m.y} width={m.w} height={m.h} rx="1.4"
                        fill={linked.length > 0 ? (heat ? heat.fill : "#fff3e0") : fill} stroke={linked.length > 0 ? (heat ? heat.stroke : "#ff9e3d") : stroke} strokeWidth={linked.length > 0 ? 0.9 : 0.5}
                        strokeDasharray={m.kind === "court" ? "1.6 1.2" : "none"} />
                      {m.vertical ? (
                        m.label.split("").map((ch, i) => (
                          <text key={i} x={mcx} y={m.y + 7 + i * 5.4} textAnchor="middle" fontSize="3" fontWeight="600" fill={tfill}>{ch}</text>
                        ))
                      ) : (
                        lines.map((line, i) => (
                          <text key={i} x={mcx} y={mcy + (i - (lines.length - 1) / 2) * 4 + 1.1}
                            textAnchor="middle" fontSize={m.kind === "misc" ? 2.9 : 3.4} fontWeight="800" fill={tfill}>{line}</text>
                        ))
                      )}
                      {focusedKey === miscKey && (
                        <rect x={m.x - 1.6} y={m.y - 1.6} width={m.w + 3.2} height={m.h + 3.2} rx="2.4"
                          fill="none" stroke="#1d3461" strokeDasharray="1.8 1.1" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 1.6 }} pointerEvents="none" />
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
                  const heat = heatmapOn ? heatStyleForGroup(list) : null;
                  const fillColor = heat ? heat.fill : (has ? "#fff3e0" : "#f7f1e6");
                  const strokeColor = heat ? heat.stroke : (has ? "#ff9e3d" : "#e0d8c8");
                  const labelColor = heat ? heat.text : (has ? "#5b3a1e" : "#9b968e");
                  const subLabelColor = heat ? heat.text : (has ? "#a06a35" : "#b3aca0");
                  return (
                    <g style={{ cursor: has ? "pointer" : "default" }}
                      {...(has ? focusableProps("frog", "かえる広場(イートインスペース)。企画あり。タップで一覧へ移動します。", () => scrollTo("outdoor")) : {})}>
                      <title>かえる広場</title>
                      {has && <rect x={FROG_PLAZA.x - 1} y={FROG_PLAZA.y - 1} width={FROG_PLAZA.w + 2} height={FROG_PLAZA.h + 2} rx="2.2" fill={heat ? heat.stroke : "#ffb157"} opacity="0.22" />}
                      <rect x={FROG_PLAZA.x} y={FROG_PLAZA.y} width={FROG_PLAZA.w} height={FROG_PLAZA.h} rx="1.6"
                        fill={fillColor} stroke={strokeColor} strokeWidth={has ? 0.9 : 0.5} />
                      <text x={FROG_PLAZA.x + 5.5} y={fcy + 1.4} textAnchor="middle" fontSize="3.4">☂️</text>
                      {hasFood && <text x={FROG_PLAZA.x + 12} y={fcy + 1.4} textAnchor="middle" fontSize="3.4">🍴</text>}
                      <text x={fcx} y={fcy - 0.8} textAnchor="middle" fontSize="3.5" fontWeight="800" fill={labelColor}>{FROG_PLAZA.label}</text>
                      <text x={fcx} y={fcy + 3.9} textAnchor="middle" fontSize="2.5" fontWeight="800" fill={subLabelColor}>イートインスペース</text>
                      {has && wait != null && <text x={FROG_PLAZA.x + FROG_PLAZA.w - 15} y={fcy + 1.1} textAnchor="middle" fontSize="3" fontWeight="900" fill={heat ? heat.text : "#e6206b"}>{wait}分</text>}
                      <text x={FROG_PLAZA.x + FROG_PLAZA.w - 5.5} y={fcy + 1.5} textAnchor="middle" fontSize="3.8">🗑️</text>
                      {focusedKey === "frog" && (
                        <rect x={FROG_PLAZA.x - 1.6} y={FROG_PLAZA.y - 1.6} width={FROG_PLAZA.w + 3.2} height={FROG_PLAZA.h + 3.2} rx="2.4"
                          fill="none" stroke="#1d3461" strokeDasharray="1.8 1.1" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 1.6 }} pointerEvents="none" />
                      )}
                    </g>
                  );
                })()}

                {MAP_BLOCKS.map((blk) => (
                  <g key={blk.id}>
                    <text x={blk.lx} y={blk.ly} fontSize="4.4" fontWeight="900" fill="#6b6660">{blk.label}</text>
                    {blk.entrance && (
                      <g>
                        <rect x={blk.entrance.x} y={blk.entrance.y} width={blk.entrance.w} height={blk.entrance.h}
                          fill="#fff" stroke="#c9c4bb" strokeWidth="0.6" />
                        {blk.entrance.label.split("").map((ch, i) => (
                          <text key={i} x={blk.entrance!.x + blk.entrance!.w / 2} y={blk.entrance!.y + 7 + i * 7.5}
                            textAnchor="middle" fontSize="3.4" fontWeight="800" fill="#7a756c">{ch}</text>
                        ))}
                      </g>
                    )}
                    {blk.floors.map((fl, fi) => {
                      const fy = blk.y + fi * blk.floorH;
                      const labelX = (blk.entrance ? blk.entrance.x : blk.x) - 2;
                      return (
                        <g key={fi}>
                          {fl.f && <text x={labelX} y={fy + blk.floorH / 2 + 1.1} textAnchor="end" fontSize="3.2" fontWeight="800" fill="#9b968e">{fl.f}</text>}
                          {fl.rooms.map((rm, ri) => {
                            const cell = roomCellsByKey.get(`${blk.id}:${fi}:${ri}`);
                            if (!cell) return null;
                            const rx = cell.x;
                            const matched = cell.matched;
                            const has = matched.length > 0;
                            const bt = matched[0];
                            const isFood = matched.some((mm) => mm.category === "food");
                            const sold = has && matched.every((mm) => allSoldOut(mm));
                            const heat = heatmapOn ? heatStyleForGroup(matched) : null;
                            const cellFill = heat ? heat.fill : (rm.off ? "#eceae6" : has ? "#fff3e0" : rm.n ? "#ffffff" : "#fbfaf8");
                            const cellStroke = heat ? heat.stroke : (has ? "#ff9e3d" : "#ddd9d2");
                            const textFill = heat ? heat.text : (has ? "#5b3a1e" : "#8a857c");
                            const statusFill = heat ? heat.text : (sold ? "#dc2626" : "#e6206b");
                            const statusLabel = has && bt ? (sold ? "完売" : bt.isOpen ? `待ち${bt.waitMinutes}分` : "準備中") : "";
                            return (
                              <g key={ri} style={{ cursor: has ? "pointer" : "default" }}
                                {...(has && bt ? focusableProps(cell.key, `${rm.n}。${bt.name}。${statusLabel}`, () => onJump(bt.id)) : {})}>
                                {rm.n ? <title>{rm.vend ? `${rm.n}(室内に自販機あり)` : rm.n}</title> : null}
                                {/* タップ判定は見た目の枠より少し広く取り、指での操作を押しやすくする */}
                                {has && <rect x={rx - 0.7} y={fy - 0.7} width={rm.w + 1.4} height={blk.floorH + 1.4} rx="1.5" fill={heat ? heat.stroke : "#ffb157"} opacity="0.22" />}
                                <rect x={rx} y={fy} width={rm.w} height={blk.floorH} rx="0.8"
                                  fill={cellFill} stroke={cellStroke} strokeWidth={has ? 0.8 : 0.35} />
                                {rm.off && (
                                  <text x={rx + rm.w / 2} y={fy + blk.floorH / 2 + 1} textAnchor="middle" fontSize="3" fontWeight="700" fill="#b0aaa0">{rm.n}</text>
                                )}
                                {rm.n && !rm.off && (
                                  <text x={rx + rm.w / 2} y={has ? fy + blk.floorH / 2 - 0.7 : fy + blk.floorH / 2 + 1.1}
                                    textAnchor="middle" fontSize={rm.n.length >= 6 ? 2.4 : rm.n.length >= 4 ? 2.9 : 3.4} fontWeight="800"
                                    fill={textFill}>{rm.n}</text>
                                )}
                                {has && bt && (
                                  sold
                                    ? <text x={rx + rm.w / 2} y={fy + blk.floorH - 1.2} textAnchor="middle" fontSize="2.8" fontWeight="900" fill={statusFill}>完売</text>
                                    : <text x={rx + rm.w / 2} y={fy + blk.floorH - 1.2} textAnchor="middle" fontSize="2.8" fontWeight="900" fill={statusFill}>{bt.isOpen ? `${bt.waitMinutes}分` : "休"}</text>
                                )}
                                {isFood && <text x={rx + rm.w - 2.5} y={fy + 3.2} textAnchor="middle" fontSize="3">🍴</text>}
                                {rm.vend && <text x={rx + (isFood ? rm.w - 8.5 : rm.w - 3.6)} y={fy + 3.2} textAnchor="middle" fontSize="3">🥤</text>}
                                {focusedKey === cell.key && (
                                  <rect x={rx - 0.9} y={fy - 0.9} width={rm.w + 1.8} height={blk.floorH + 1.8} rx="1.4"
                                    fill="none" stroke="#1d3461" strokeDasharray="1.6 1" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 1.6 }} pointerEvents="none" />
                                )}
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
                    <circle cx={v.x} cy={v.y} r="3.4" fill="#fff" stroke="#e2dcd2" strokeWidth="0.45" />
                    <text x={v.x} y={v.y + 1.4} textAnchor="middle" fontSize="3.8">🥤</text>
                  </g>
                ))}

                {focusPulse && (
                  <rect x={focusPulse.x - 1.6} y={focusPulse.y - 1.6} width={focusPulse.w + 3.2} height={focusPulse.h + 3.2} rx="2.6"
                    fill="none" stroke={THEME.pink} vectorEffect="non-scaling-stroke" style={{ strokeWidth: 2.4 }}
                    className="map-focus-pulse" pointerEvents="none" />
                )}
              </svg>
            </div>

            <button type="button" onClick={() => setHeatmapOn((v) => !v)} aria-pressed={heatmapOn}
              className="absolute top-2 left-2 z-10 flex items-center gap-1 h-7 px-2.5 rounded-full text-[10px] font-black shadow-sm border transition-colors active:scale-95"
              style={heatmapOn ? { background: THEME.pink, color: "#fff", borderColor: THEME.pink } : { background: "rgba(255,255,255,0.95)", color: "#57534e", borderColor: "#e7e5e4" }}>
              <Thermometer size={12} strokeWidth={2.6} />混雑で色分け
            </button>

            <div className="absolute top-2 right-2 z-10 flex items-center gap-0.5 bg-white/95 backdrop-blur rounded-full shadow-sm border border-stone-200 p-1">
              <button type="button" onClick={zoomFit} aria-pressed={zoomStep === "fit"} aria-label="全体表示(校内全体を画面に収める)"
                className="h-7 px-2 rounded-full flex items-center gap-1 text-[10px] font-black transition-colors active:scale-95"
                style={zoomStep === "fit" ? { background: THEME.purple, color: "#fff" } : { color: "#57534e" }}>
                <Maximize2 size={11} strokeWidth={2.6} />全体表示
              </button>
              <span className="w-px h-4 bg-stone-200" aria-hidden="true" />
              <button type="button" onClick={zoomOut} disabled={zoomStep === "fit"} aria-label="縮小"
                className="w-7 h-7 rounded-full flex items-center justify-center text-stone-600 disabled:opacity-30 active:scale-90 transition-transform">
                <ZoomOut size={14} strokeWidth={2.4} />
              </button>
              <button type="button" onClick={zoomIn} disabled={zoomStep === 2} aria-label="拡大"
                className="w-7 h-7 rounded-full flex items-center justify-center text-stone-600 disabled:opacity-30 active:scale-90 transition-transform">
                <ZoomIn size={14} strokeWidth={2.4} />
              </button>
            </div>

            <button onClick={() => scrollTo(BUILDINGS.find((b) => (grouped[b.id] || []).length > 0)?.id)}
              className="absolute bottom-3 right-3 z-10 px-3.5 py-2 rounded-full flex items-center gap-1.5 text-white text-xs font-black shadow-lg active:scale-95 transition-transform"
              style={{ background: "#1d3461" }}>
              <MapPin size={13} strokeWidth={2.6} /> 一覧へ
            </button>
          </div>

          {/* 凡例はマップ枠の外(通常フロー)に置く。FABは上のrelative枠の中だけに重なるので、ここは絶対に隠れない */}
          <div className="flex items-center justify-center gap-x-3 gap-y-1.5 mt-2.5 text-[10px] text-stone-500 font-bold flex-wrap px-1">
            <span className="flex items-center gap-1">🍴 食品販売</span>
            <span className="flex items-center gap-1">☂️ アンブレラスカイ</span>
            <span className="flex items-center gap-1">🥤 自販機</span>
            <span className="flex items-center gap-1">🗑️ ゴミ箱</span>
            {heatmapOn ? (
              <>
                {HEAT_LEVELS.map((lv) => <HeatSwatch key={lv.label} heat={lv} />)}
                <HeatSwatch heat={HEAT_CLOSED} />
                <HeatSwatch heat={HEAT_SOLDOUT} />
              </>
            ) : (
              <>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border" style={{ borderColor: "#ff9e3d", background: "#fff3e0" }} /> 企画あり(タップで詳細)</span>
                <span className="flex items-center gap-1"><span className="font-black" style={{ color: "#e6206b" }}>12分</span> 待ち時間</span>
              </>
            )}
          </div>
        </div>
        <div className="text-[11px] text-stone-400 mb-5 text-center md:hidden">
          {pinchWidth != null ? "ピンチで拡大・縮小中(「全体表示」で元に戻せます)" : zoomStep === "fit" ? "全体表示中 · 2本指のピンチかボタンで拡大できます" : "↔ スワイプ・ドラッグで移動 / 2本指のピンチで拡大・縮小"}
        </div>

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
