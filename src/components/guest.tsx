import { useMemo, useState } from "react";
import { AlertTriangle, BookOpen, ChevronRight, Heart, HelpCircle, Info, MapPin, Minus as MinusIcon, RefreshCw, TrendingDown, TrendingUp, WifiOff } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  accentFor, allSoldOut, CATEGORIES, computeTrend, formatLocation, formatOrganizer, formatRelative, formatTime,
  FESTIVAL_STALE_MINUTES, FESTIVAL_VERY_STALE_MINUTES, freshness, getStatus, isSoldOut, minutesSince, STALE_MINUTES, THEME, venueEmoji, VERY_STALE_MINUTES,
} from "../lib/festival";
import { countNoticeKinds, fallbackDescription, isKidsFriendly, sortNotices, summarizeWaitHistory } from "../lib/guest-helpers";
import { DEMO_ADMIN_PIN, DEMO_STAFF_PIN, backendConfigured } from "../lib/api";
import { forceUpdate } from "../lib/pwa";
import type { Booth, FestivalNotice } from "../types";
import { BoothIcon, Pill, Sheet, Sparkline, StaleBadge, WaitChart } from "./ui";
import logoSrc from "../assets/logo.png";

/* ═══════════ GUEST: BOOTH CARD ═══════════ */

// 小さなお子さま向けの企画であることを、カードにも詳細にも同じ見た目で示す
const KidsBadge = ({ short }: { short?: boolean }) => (
  <span className="inline-flex items-center gap-0.5 px-2 py-0.5 text-[11px] font-black rounded-full border"
    style={{ color: "#0e7490", backgroundColor: "#ecfeff", borderColor: "#a5f3fc" }}>
    👶 {short ? "お子さま向け" : "小さなお子さま向け"}
  </span>
);

// オフライン中は「いま取れている値」ではないことを、カード単位でも分かるようにする
const CachedBadge = () => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-full bg-stone-100 text-stone-500 border border-stone-200">
    <WifiOff size={10} strokeWidth={2.6} />最後の情報
  </span>
);

export const BoothCard = ({ booth, onTap, isFavorite, onToggleFavorite, compact, offline }: { booth: Booth; onTap: (b: Booth) => void; isFavorite: boolean; onToggleFavorite: (id: string) => void; compact?: boolean; offline?: boolean }) => {
  const f = freshness(booth);
  const showNumber = booth.isOpen && f !== "very_stale";
  const status = getStatus(booth.waitMinutes, booth.isOpen);
  const trend = computeTrend(booth.history);
  const TrendIcon: LucideIcon = trend.dir === "up" ? TrendingUp : trend.dir === "down" ? TrendingDown : MinusIcon;
  const trendColor = trend.dir === "up" ? "#e6206b" : trend.dir === "down" ? "#3ddc97" : "#a8a29e";
  const accent = accentFor(booth.id);
  const soldOut = allSoldOut(booth);
  const kids = isKidsFriendly(booth);

  /* ── コンパクト表示: 1行カード。1画面に5〜6件入るようにする ── */
  if (compact) {
    const marks = soldOut || kids || offline || f !== "fresh";
    return (
      <article
        className="group relative w-full rounded-2xl transition-all active:scale-[0.99] hover:-translate-y-0.5 cursor-pointer overflow-hidden"
        style={{ background: "var(--surface)", boxShadow: `0 1px 0 ${accent}22, 0 4px 12px ${accent}14`, border: `2px solid ${accent}33` }}
      >
        <button
          type="button"
          onClick={() => onTap(booth)}
          aria-label={`${booth.name}の詳細を見る`}
          className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pink-500/50 focus-visible:ring-inset"
        />
        <div className="relative z-[1] flex items-center gap-2.5 px-2.5 py-2 pointer-events-none">
          <div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${accent}22, ${accent}0f)`, border: `1.5px solid ${accent}33` }}>
            <BoothIcon booth={booth} size={48} rounded={10} emojiClass="text-2xl" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[14px] font-extrabold leading-tight line-clamp-2" style={{ color: "var(--ink)" }}>{booth.name}</h3>
            <div className="text-xs text-stone-500 truncate font-medium">{formatLocation(booth)} · {formatOrganizer(booth)}</div>
            {marks && (
              <div className="flex items-center gap-1 flex-wrap mt-1">
                {/* 1行に収めるため、コンパクト表示のバッジは小さめで揃える */}
                {soldOut && (
                  <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-black rounded-full border"
                    style={{ color: "#dc2626", backgroundColor: "#fee2e2", borderColor: "#fecaca" }}>完売</span>
                )}
                {kids && <KidsBadge short />}
                <StaleBadge booth={booth} />
                {offline && <CachedBadge />}
              </div>
            )}
          </div>
          <div className="flex-shrink-0 w-[52px] text-right">
            {showNumber ? (
              <>
                <div className="text-[26px] font-black tabular-nums leading-none" style={{ color: status.color, letterSpacing: "-0.04em" }}>{booth.waitMinutes}</div>
                <div className="text-[11px] font-bold text-stone-400 mt-0.5">分待ち</div>
              </>
            ) : booth.isOpen ? (
              <div className="text-xs font-black" style={{ color: THEME.orange }}>確認中…</div>
            ) : (
              <div className="text-xs font-black text-stone-400">準備中</div>
            )}
          </div>
          <button
            type="button"
            onClick={() => onToggleFavorite(booth.id)}
            className="pointer-events-auto relative z-10 flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center hover:scale-110 transition-transform before:content-[''] before:absolute before:-inset-1"
            aria-label={`${booth.name}を${isFavorite ? "お気に入りから外す" : "お気に入りに追加"}`}
            aria-pressed={isFavorite}
          >
            <Heart size={16} fill={isFavorite ? "#ff4d8d" : "none"} stroke={isFavorite ? "#ff4d8d" : "#c4b5cf"} strokeWidth={2.4} />
          </button>
        </div>
      </article>
    );
  }

  return (
    <article
      className="group relative w-full text-left rounded-[26px] p-5 transition-all active:scale-[0.98] hover:-translate-y-1 cursor-pointer overflow-hidden anim-pop"
      style={{
        background: "var(--surface)",
        boxShadow: `0 2px 0 ${accent}22, 0 10px 24px ${accent}1f`,
        border: `2px solid ${accent}33`,
      }}
    >
      <button
        type="button"
        onClick={() => onTap(booth)}
        aria-label={`${booth.name}の詳細を見る`}
        className="absolute inset-0 z-0 rounded-[24px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pink-500/50 focus-visible:ring-inset"
      />
      <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-15 pointer-events-none anim-floaty2"
        style={{ background: accent }} />

      <button
        type="button"
        onClick={() => onToggleFavorite(booth.id)}
        className={`absolute top-3.5 right-3.5 z-10 w-9 h-9 rounded-full flex items-center justify-center bg-white/70 backdrop-blur hover:scale-110 transition-transform ${isFavorite ? "anim-bobble" : ""}`}
        aria-label={`${booth.name}を${isFavorite ? "お気に入りから外す" : "お気に入りに追加"}`}
        aria-pressed={isFavorite}
      >
        <Heart size={17} fill={isFavorite ? "#ff4d8d" : "none"} stroke={isFavorite ? "#ff4d8d" : "#c4b5cf"} strokeWidth={2.4} />
      </button>

      <div className="flex items-start gap-4 relative z-[1] pointer-events-none">
        <div className="flex-shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center shadow-sm overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${accent}22, ${accent}0f)`, border: `2px solid ${accent}33` }}>
          <BoothIcon booth={booth} size={64} rounded={14} emojiClass="text-4xl" />
        </div>
        <div className="flex-1 min-w-0 pr-9">
          <h3 className="text-[17px] font-extrabold truncate mb-0.5" style={{ color: "var(--ink)" }}>{booth.name}</h3>
          <div className="text-xs text-stone-500 truncate mb-2 font-medium">{formatOrganizer(booth)} · {formatLocation(booth)}</div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* 「準備中」は下の大きな文字で示すため、ここでは営業中の状態だけをピルで出す(二重表示の解消) */}
            {booth.isOpen && <Pill color={status.color} soft={status.soft} ring={status.ring}>{status.label}</Pill>}
            {soldOut && <Pill color="#dc2626" soft="#fee2e2" ring="#fecaca">完売</Pill>}
            {kids && <KidsBadge />}
            <StaleBadge booth={booth} />
            {offline && <CachedBadge />}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between relative z-[1] pointer-events-none">
        <div>
          {showNumber ? (
            <div className="flex items-baseline gap-1.5">
              <span className="text-[56px] font-black tracking-tight tabular-nums leading-none"
                style={{ color: status.color, letterSpacing: "-0.05em" }}>{booth.waitMinutes}</span>
              <span className="text-sm font-extrabold text-stone-500">分待ち</span>
              {booth.history.length >= 2 && (
                <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded-full"
                  style={{ color: trendColor, background: `${trendColor}1a` }}>
                  <TrendIcon size={12} strokeWidth={3} />{trend.delta > 0 ? `+${trend.delta}` : trend.delta}
                </span>
              )}
            </div>
          ) : booth.isOpen ? (
            <div className="text-xl font-black" style={{ color: THEME.orange }}>確認中…</div>
          ) : (
            <div className="text-2xl font-black text-stone-400">準備中</div>
          )}
          <div className="text-xs text-stone-400 mt-1 font-medium">更新: {formatRelative(booth.lastUpdated)}</div>
        </div>
        {showNumber && <div className="w-24 h-8"><Sparkline history={booth.history} color={status.color} /></div>}
      </div>
    </article>
  );
};

/* ═══════════ GUEST: BOOTH DETAIL ═══════════ */

const InfoRow = ({ icon: Icon, label, value, multiline }: { icon: LucideIcon; label: string; value: string; multiline?: boolean }) => (
  <div className="flex gap-3">
    <div className="w-9 h-9 rounded-xl bg-stone-100 flex items-center justify-center flex-shrink-0">
      <Icon size={16} strokeWidth={2} className="text-stone-600" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-xs font-semibold text-stone-500 mb-0.5">{label}</div>
      <div className={`text-sm text-stone-900 ${multiline ? "leading-relaxed" : "truncate"}`}>{value || "—"}</div>
    </div>
  </div>
);

export const BoothDetailSheet = ({ booth, onClose, isFavorite, onToggleFavorite, onShowOnMap, offline, stamped, onToggleStamp, stageVenue, onShowStage }: { booth: Booth; onClose: () => void; isFavorite: boolean; onToggleFavorite: (id: string) => void; onShowOnMap?: (booth: Booth) => void; offline?: boolean; stamped?: boolean; onToggleStamp?: (id: string) => void; stageVenue?: string | null; onShowStage?: (venue: string) => void }) => {
  const f = freshness(booth);
  const showNumber = booth.isOpen && f !== "very_stale";
  const status = getStatus(booth.waitMinutes, booth.isOpen);
  const recent = useMemo(() => (booth.history || []).slice(-20), [booth.history]);
  const waitSummary = useMemo(() => summarizeWaitHistory(recent), [recent]);
  const kids = isKidsFriendly(booth);

  // このブースへ直接飛べるURL(QRポスターやSNS共有用)
  const [copied, setCopied] = useState(false);
  const shareBooth = async () => {
    const url = `${location.origin}${location.pathname}?b=${encodeURIComponent(booth.id)}`;
    try {
      if (navigator.share) { await navigator.share({ title: `${booth.name} | まちたいむ`, url }); return; }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { /* 共有キャンセル */ }
  };

  return (
    <Sheet onClose={onClose} title="ブース詳細">
      <div className="px-6 pt-2 pb-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center overflow-hidden"
            style={{ backgroundColor: status.soft, border: `1px solid ${status.ring}` }}><BoothIcon booth={booth} size={80} rounded={22} emojiClass="text-5xl" /></div>
          <div className="flex-1 min-w-0 pt-1">
            <div className="text-xs font-semibold text-stone-500 mb-1">{CATEGORIES.find((c) => c.id === booth.category)?.label}</div>
            <h2 className="text-2xl font-black text-stone-900 mb-1 tracking-tight">{booth.name}</h2>
            <div className="text-sm text-stone-500">{formatOrganizer(booth)}</div>
            {kids && <div className="mt-1.5"><KidsBadge /></div>}
          </div>
          <button onClick={() => onToggleFavorite(booth.id)} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-stone-100" aria-label="お気に入り">
            <Heart size={20} fill={isFavorite ? "#dc2626" : "none"} stroke={isFavorite ? "#dc2626" : "#a8a29e"} strokeWidth={2} />
          </button>
        </div>

        {f !== "fresh" && booth.isOpen && (
          <div className="mb-4 p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" strokeWidth={2.4} />
            <div className="text-xs text-amber-900 leading-relaxed">
              <strong className="font-bold">この情報は{Math.floor(minutesSince(booth.lastUpdated))}分前のものです。</strong>
              {f === "very_stale" ? "実際の待ち時間と大きく異なる可能性があります。直接ブースでご確認ください。" : "最新でない可能性があります。"}
            </div>
          </div>
        )}

        <div className="rounded-3xl p-6 mb-5" style={{ backgroundColor: status.soft, border: `1px solid ${status.ring}` }}>
          <div className="flex items-center justify-between gap-2 mb-2">
            {/* 準備中は下の大きな文字だけで示す(ピルと重ねて2回書かない) */}
            {booth.isOpen ? <Pill color={status.color} soft="#ffffff" ring={status.ring}>{status.label}</Pill> : <span />}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {offline && <CachedBadge />}
              <div className="text-xs text-stone-500">更新: {formatRelative(booth.lastUpdated)}</div>
            </div>
          </div>
          {showNumber ? (
            <div className="flex items-baseline gap-2">
              <span className="text-7xl font-black tracking-tight tabular-nums" style={{ color: status.color, letterSpacing: "-0.05em", lineHeight: 1 }}>{booth.waitMinutes}</span>
              <span className="text-2xl font-bold" style={{ color: status.color }}>分待ち</span>
            </div>
          ) : booth.isOpen ? (
            <div className="text-3xl font-black text-amber-600">確認中…</div>
          ) : (
            <div className="text-3xl font-black text-stone-400">準備中</div>
          )}
          {showNumber && (
            <div className="text-xs text-stone-500 mt-2">🧮 現在 約{booth.peopleInLine}人が待機 · 1回に{booth.capacity}人ずつ案内</div>
          )}
        </div>

        {recent.length >= 2 && (
          <div className="rounded-2xl p-4 mb-5 bg-white border border-stone-200">
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <div className="text-xs font-semibold text-stone-500">▼ 待ち時間の推移</div>
              {waitSummary && (
                <div className="text-[10px] font-bold text-stone-400 tabular-nums flex-shrink-0">
                  最短{waitSummary.min}分 / 最長{waitSummary.max}分
                </div>
              )}
            </div>
            <div className="h-24"><WaitChart history={recent} color={status.color} /></div>
            <div className="flex items-center justify-between text-[10px] font-bold text-stone-400 mt-1">
              <span>{waitSummary?.startLabel ?? ""}</span>
              <span>→</span>
              <span>現在</span>
            </div>
            {waitSummary && (
              <div className="mt-2.5 rounded-xl px-3 py-2 text-xs font-black" style={{ backgroundColor: status.soft, color: status.color }}>
                {waitSummary.sentence}
              </div>
            )}
          </div>
        )}

        {(booth.products || []).length > 0 && (
          <div className="rounded-2xl p-4 mb-5 bg-white border border-stone-200">
            <div className="text-xs font-semibold text-stone-500 mb-2.5">🛍️ 販売商品</div>
            <div className="flex flex-wrap gap-2">
              {booth.products.map((p) => {
                const sold = isSoldOut(p);
                const low = !sold && p.stock <= 5;
                return (
                  <span key={p.id} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${sold ? "bg-stone-100 border-stone-200 text-stone-400 line-through" : low ? "bg-amber-50 border-amber-300 text-amber-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`}>
                    {p.name}
                    {(p.allergens ?? []).length > 0 && (
                      <span className="text-[9px] font-black text-rose-600 no-underline" style={{ textDecoration: "none" }}>⚠{(p.allergens ?? []).join("・")}</span>
                    )}
                    {sold ? <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-red-600 text-white no-underline" style={{ textDecoration: "none" }}>売り切れ</span>
                      : low ? <span className="text-[9px] font-black text-amber-600">残りわずか</span>
                      : <span className="text-[9px] font-black text-emerald-600">販売中</span>}
                  </span>
                );
              })}
            </div>
            {booth.products.some((p) => (p.allergens ?? []).length > 0) && (
              <div className="text-[10px] text-stone-400 mt-2.5 leading-relaxed">⚠ はアレルギー表示(特定原材料8品目・目安)です。必ずブースの掲示とスタッフにご確認ください。</div>
            )}
          </div>
        )}

        <div className="space-y-2.5">
          {onShowOnMap ? (
            /* 場所は文字だけだと辿り着けない。タップでマップへ飛べるようにする */
            <button type="button" onClick={() => onShowOnMap(booth)}
              className="w-full flex gap-3 items-center text-left rounded-2xl bg-white border border-stone-200 p-2.5 active:scale-[0.99] transition-transform">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${THEME.purple}1a` }}>
                <MapPin size={16} strokeWidth={2.2} style={{ color: THEME.purple }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-stone-500 mb-0.5">場所</div>
                <div className="text-sm text-stone-900 truncate">{formatLocation(booth) || "—"}</div>
              </div>
              <span className="text-xs font-black flex-shrink-0" style={{ color: THEME.purple }}>マップで見る →</span>
            </button>
          ) : (
            <InfoRow icon={MapPin} label="場所" value={formatLocation(booth)} />
          )}
          {/* 演劇部・音楽部・放送部などは上演スケジュールを持つ。
              ブースの詳細からそのままタイムテーブルへ飛べるようにする */}
          {stageVenue && onShowStage && (
            <button type="button" onClick={() => onShowStage(stageVenue)}
              className="w-full flex gap-3 items-center text-left rounded-2xl p-2.5 border-2 active:scale-[0.99] transition-transform"
              style={{ background: "#f3ecff", borderColor: `${THEME.purple}44` }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-lg" style={{ background: "#fff" }}>
                {venueEmoji(stageVenue)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold mb-0.5" style={{ color: THEME.purple }}>上演スケジュール</div>
                <div className="text-sm font-bold truncate" style={{ color: "var(--ink)" }}>{stageVenue}</div>
              </div>
              <span className="text-xs font-black flex-shrink-0" style={{ color: THEME.purple }}>時間割を見る →</span>
            </button>
          )}
          {/* 紹介文が空でも「まだ登録されていません」で終わらせず、
              分かっている情報からかわり文を出す(表示だけ・保存はしない) */}
          <InfoRow icon={Info} label="紹介" value={booth.description || fallbackDescription(booth)} multiline />
        </div>

        {onToggleStamp && (
          <button onClick={() => onToggleStamp(booth.id)} aria-pressed={!!stamped}
            className="w-full mt-5 py-3.5 rounded-2xl text-sm font-black flex items-center justify-center gap-1.5 active:scale-[0.98] border-2"
            style={stamped
              ? { background: "linear-gradient(120deg,#ffd23f,#ff8a3d)", borderColor: "transparent", color: "#fff" }
              : { background: "var(--surface)", borderColor: `${THEME.purple}55`, color: "var(--ink)" }}>
            <span className={stamped ? "anim-stamp-press" : ""}>{stamped ? "🎫 スタンプ済み（タップで取り消し）" : "🎫 ここに行った！スタンプを押す"}</span>
          </button>
        )}

        <button onClick={() => void shareBooth()}
          className="w-full mt-2.5 py-3 rounded-2xl border border-stone-200 bg-white text-stone-600 text-sm font-bold flex items-center justify-center gap-1.5 active:scale-[0.98]">
          🔗 {copied ? "リンクをコピーしました！" : "このブースを共有"}
        </button>
      </div>
    </Sheet>
  );
};

/* ═══════════ ONBOARDING ═══════════ */

export const Onboarding = ({ onDone }: { onDone: () => void }) => {
  const [step, setStep] = useState(0);
  const slides = [
    { emoji: "🎪", title: "ようこそ！", body: "文化祭の待ち時間が、スマホでリアルタイムに分かるアプリです。並ぶ前にサッと確認できます。" },
    { emoji: "👀", title: "お客さんの使い方", body: "「ホーム」タブで全ブースの混み具合がひと目で。緑=空いてる、赤=混雑。♡でお気に入り登録もできます。" },
    { emoji: "🛠", title: "スタッフの使い方", body: "「スタッフ」タブからPINを入力。担当ブースを選び、お客さんを案内するたびにボタンを押すだけ。待ち時間は自動計算されます。" },
    { emoji: "📲", title: "ホーム画面に追加", body: "ブラウザの共有メニューから「ホーム画面に追加」すると、アプリのように一発で開けます。当日URLを探さずに済みます。" },
  ];
  const last = step === slides.length - 1;
  const s = slides[step]!;
  return (
    <div className="fixed inset-0 z-[90] flex flex-col" style={{ background: THEME.festGradientSoft }}>
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        {step === 0
          ? <img src={logoSrc} alt="まちたいむ" className="w-64 max-w-[80%] mb-6" style={{ animation: "bounceIn 0.5s" }} />
          : <div className="text-8xl mb-8" style={{ animation: "bounceIn 0.5s" }}>{s.emoji}</div>}
        <h2 className="text-3xl font-black mb-3 tracking-tight" style={{ color: "var(--ink)" }}>{s.title}</h2>
        <p className="text-sm text-stone-600 leading-relaxed max-w-xs font-medium">{s.body}</p>
      </div>
      <div className="px-8 pb-10">
        <div className="flex justify-center gap-1.5 mb-6">
          {slides.map((_, i) => (
            <div key={i} className="h-2 rounded-full transition-all" style={{ width: i === step ? 26 : 8, background: i === step ? THEME.pink : "#e7c9d9" }} />
          ))}
        </div>
        <div className="flex gap-2">
          {step > 0 && (
            <button onClick={() => setStep(step - 1)} className="px-5 py-3.5 rounded-2xl border-2 bg-white font-bold text-sm active:scale-95" style={{ color: "var(--ink)", borderColor: `${THEME.purple}33` }}>戻る</button>
          )}
          <button onClick={() => (last ? onDone() : setStep(step + 1))}
            className="flex-1 py-3.5 rounded-2xl text-white font-black text-sm active:scale-95 shadow-lg" style={{ background: THEME.festGradient }}>
            {last ? "はじめる 🎉" : "次へ"}
          </button>
        </div>
        {!last && <button onClick={onDone} className="w-full mt-3 text-xs text-stone-400 font-semibold">スキップ</button>}
      </div>
    </div>
  );
};

/* ═══════════ HELP SHEET ═══════════ */

// 来場者向けQ&A(やなぎ祭マニュアル第1部・第2部の内容に基づく)
const GUEST_FAQS = [
  { q: "開催日と時間は？", a: "8月29日(土)・30日(日)の2日間、午前10時〜午後4時です。校舎への入場は15:30まで、各ステージ発表は15:20ごろまでです。" },
  { q: "待ち時間や混雑はどこで見られる？", a: "このアプリのホームで、各企画の待ち時間・混雑・売り切れがリアルタイムに分かります。上の「⚡すぐ入れる」で空いている企画だけを絞り込めます。マップタブで場所も確認できます。" },
  { q: "どんな企画があるの？", a: "各クラスの体験・ゲーム・お化け屋敷、食品販売、部活動の展示・発表、体育館ステージでの音楽・ダンス発表、グラウンドでの招待試合(野球部・ハンドボール部)などがあります。" },
  { q: "ステージ発表は何時から？", a: "体育館ステージは両日とも10:30〜15:20ごろに発表があります。ステージタブでタイムテーブルと「まもなく開演」を確認できます。演劇部・音楽部・放送部などの公演も、決まり次第ステージタブに追加されます。" },
  { q: "食べ物は買える？食べ歩きはできる？", a: "食品販売のクラスがあります(個包装の市販食品が中心です)。食べ歩きはできません。「かえる広場」のイートインスペースや、各団体が案内する飲食エリアでお召し上がりください。" },
  { q: "アレルギーが心配です", a: "アプリではアレルギーの情報をご案内していません。召し上がる前に、必ず各企画の掲示と担当の生徒に直接ご確認ください。" },
  { q: "落とし物・迷子になったら？", a: "お預かりしている落とし物は、ホーム画面いちばん上の「🧳 落とし物・お知らせ」に掲示しています。「落とし物の一覧を見る」から全件をご覧いただけます（落とし物・迷子でしぼりこめます）。掲示に無いときや、お心当たりの品を見つけたときは、案内所（HR棟2階・2-1と2-2の間）か近くのスタッフ・教員へお声がけください。" },
  { q: "けがをした・体調が悪い", a: "近くのスタッフ、または教員にお声がけください。すぐに対応します。" },
  { q: "トイレや休憩場所は？", a: "トイレは各校舎にあります。マップタブでおおよその位置を確認できます。飲食はイートインスペース(かえる広場)などをご利用ください。" },
  { q: "写真撮影・SNSは？", a: "撮影は可能ですが、他の来場者や生徒が写り込んだ写真のSNS公開はご配慮ください。各企画で撮影をお断りしている場合は、スタッフの案内に従ってください。" },
  { q: "アプリの表示がおかしい・最新にならない", a: "一度ページを再読み込みしてください(パソコンは Ctrl+F5)。ホーム画面に追加している場合は、一度閉じて開き直すと最新になります。" },
];

const STAFF_FAQS = [
  { q: "PINを忘れた / 知らない", a: "ブース班長か実行委員に確認してください。お客さんとして見るだけなら「ホーム」タブでPINなしで閲覧できます。全体管理(お知らせ・復元・PIN変更)は管理者PINが必要です。" },
  { q: "待ち時間が0分なのに行列がある", a: "そのブースの担当者が人数を入力していません。スタッフモードから列の人数を入力してください。" },
  { q: "情報が古いと表示される", a: `しばらく更新がないと「更新待ち」、さらに時間が経つと数字が隠れます(開催日は${FESTIVAL_STALE_MINUTES}分/${FESTIVAL_VERY_STALE_MINUTES}分、準備期間は${STALE_MINUTES}分/${VERY_STALE_MINUTES}分)。担当者がアプリを開いて操作すれば自動で新しくなります。` },
  { q: "「ご案内しました」を押し間違えた", a: "1分以内なら、ボタンのすぐ下に「取り消す」が出ます。それを押せば元に戻ります。" },
  { q: "ステージ発表の時間割を追加したい", a: "スタッフ→ステージ進行を管理→会場を選んで「公演を追加」。体育館ステージのほか、演劇部・音楽部・放送部など会場ごとに登録できます(新しい会場名を入力すると一覧に追加されます)。" },
  { q: "2人で同じブースを操作したい", a: "同時更新による上書きは防止され、競合時は最新情報の再読込を案内します。混乱を防ぐため、通常は1ブース1端末を推奨します。" },
  { q: "電波が悪くて更新できない", a: "更新は端末に保留され、電波が戻ると自動で送信されます。画面上部にオフライン表示が出ている間は、紙やホワイトボードの掲示も併用してください。" },
  { q: "データが消えないか心配", a: "各ブースは別々に保存されるので、他のブースの操作で消えることはありません。設定画面からバックアップ(書き出し)ができ、管理者はサーバー側のスナップショットからワンタップで復元できます。" },
  { q: "ホーム画面に追加するには", a: "iPhone(Safari)は共有ボタン→「ホーム画面に追加」。Android(Chrome)はメニュー→「ホーム画面に追加」。" },
  { q: "表示がおかしい・最新にならない", a: "新しいバージョンは自動で取り込まれますが、直らない場合はページを再読み込みしてください(PCはCtrl+F5)。それでも直らなければ、下のビルド日時を添えて実行委員へ連絡してください。" },
];

export const HelpSheet = ({ onClose }: { onClose: () => void }) => {
  const [tab, setTab] = useState<"guest" | "staff">("guest");
  const [open, setOpen] = useState<string | null>(null);
  const faqs = tab === "guest" ? GUEST_FAQS : STAFF_FAQS;
  return (
    <Sheet onClose={onClose} title="よくある質問・使い方">
      <div className="px-5 pb-8 pt-2">
        <div className="flex items-center gap-1 p-1 bg-white rounded-full border border-stone-200 mb-4 w-full">
          {([{ id: "guest", label: "🙋 来場者の方へ" }, { id: "staff", label: "🛠 スタッフの方へ" }] as const).map((t) => (
            <button key={t.id} onClick={() => { setTab(t.id); setOpen(null); }}
              className={`flex-1 py-2 rounded-full text-xs font-black transition-all ${tab === t.id ? "text-white" : "text-stone-500"}`}
              style={tab === t.id ? { background: "linear-gradient(135deg,#ff4d8d,#9b5de5)" } : {}}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "staff" && (
          <div className="rounded-2xl bg-indigo-50 border border-indigo-200 p-4 mb-4">
            <div className="flex items-center gap-2 mb-1"><BookOpen size={16} className="text-indigo-600" strokeWidth={2.4} /><span className="font-bold text-indigo-900 text-sm">かんたん3ステップ(スタッフ)</span></div>
            <ol className="text-xs text-indigo-900 space-y-1 mt-2 list-decimal list-inside leading-relaxed">
              <li>「スタッフ」タブ → PINを入力</li>
              <li>担当ブースを選んで「運用する」</li>
              <li>お客さんを案内したら「ご案内しました」を押すだけ</li>
            </ol>
          </div>
        )}
        {tab === "guest" && (
          <div className="rounded-2xl p-4 mb-4 text-white" style={{ background: "linear-gradient(120deg,#3ddc97,#4cc9f0)" }}>
            <div className="font-black text-sm mb-0.5">🌿 第53回 やなぎ祭へようこそ！</div>
            <div className="text-xs font-bold text-white/90 leading-relaxed">8/29(土)・30(日) 10:00〜16:00。待ち時間・混雑・売り切れをホームで確認して、楽しい1日を！</div>
          </div>
        )}
        {tab === "staff" && !backendConfigured && (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 mb-4 text-xs text-amber-900 leading-relaxed">
            <strong className="font-bold">デモモードで動作中：</strong>データはこの端末の中だけに保存されます。初期PINは 更新用 <span className="font-mono font-black">{DEMO_STAFF_PIN}</span> / 管理者 <span className="font-mono font-black">{DEMO_ADMIN_PIN}</span> です。
          </div>
        )}
        <div className="space-y-2">
          {faqs.map((f) => {
            const key = `${tab}-${f.q}`;
            return (
              <div key={key} className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
                <button onClick={() => setOpen(open === key ? null : key)} className="w-full flex items-center gap-2 p-4 text-left active:bg-stone-50">
                  <HelpCircle size={16} className="text-stone-400 flex-shrink-0" strokeWidth={2.2} />
                  <span className="flex-1 font-bold text-stone-900 text-sm">{f.q}</span>
                  <ChevronRight size={16} className={`text-stone-300 transition-transform ${open === key ? "rotate-90" : ""}`} />
                </button>
                {open === key && <div className="px-4 pb-4 text-sm text-stone-600 leading-relaxed">{f.a}</div>}
              </div>
            );
          })}
        </div>
        {/* 当日の朝、全員を確実に最新版へ揃えるための最後の手段。
            通常は自動更新されるので、ここは「それでも直らないとき」用。 */}
        <button onClick={() => void forceUpdate()}
          className="w-full mt-5 py-3 rounded-2xl border-2 border-stone-200 bg-white text-stone-700 font-bold text-sm active:scale-95 flex items-center justify-center gap-1.5">
          <RefreshCw size={15} strokeWidth={2.6} /> アプリを最新版にする
        </button>
        <div className="text-center text-[11px] text-stone-400 mt-2">
          保存済みの表示データを捨てて読み込み直します（お気に入り・スタンプは残ります）
        </div>
        <div className="text-center text-[11px] text-stone-400 mt-3">ビルド {__BUILD_ID__}</div>
      </div>
    </Sheet>
  );
};

/* ═══════════ GUEST: 落とし物・お知らせ ═══════════
   実行委員が掲示した内容を、来場者がホームから読めるようにする。
   当日は落とし物が積み上がる(最大30件)ため、ホームには新しい数件だけを出し、
   全部はシートで開く。ホームに全件並べると企画一覧が画面外へ押し出される。 */

// 絵文字チップの地の色は固定。ラベルの文字色だけ、夜間モードで明るい側へ振れるよう変数にする
const NOTICE_META = {
  lost: { emoji: "🧳", label: "落とし物", color: "var(--notice-lost)", bg: "#fffbeb", border: "#fde68a" },
  child: { emoji: "👶", label: "迷子", color: "var(--notice-child)", bg: "#ecfeff", border: "#a5f3fc" },
  info: { emoji: "📢", label: "お知らせ", color: "var(--notice-info)", bg: "#f5f3ff", border: "#ddd6fe" },
} as const;

const noticeMeta = (kind: FestivalNotice["kind"]) => NOTICE_META[kind] ?? NOTICE_META.info;

/** 掲示1件ぶんの行。
    compact=ホーム用。1件を1行に収める。種類は絵文字で分かるのでラベルを出さず、
    掲示時刻も省く(生徒が本文に拾った時刻を書くので、2つ時刻が並ぶと読みにくい)。
    2行で切り、全文と詳しい情報は一覧シートで見せる。 */
const NoticeRow = ({ notice, compact }: { notice: FestivalNotice; compact?: boolean }) => {
  const meta = noticeMeta(notice.kind);
  return (
    <div className={`flex items-start gap-2 ${compact ? "py-1.5" : "py-2"}`}>
      <span className={`${compact ? "w-5 h-5 text-[11px] rounded-md" : "w-7 h-7 text-sm rounded-lg"} flex items-center justify-center flex-shrink-0 mt-px`}
        style={{ backgroundColor: meta.bg, border: `1px solid ${meta.border}` }} aria-hidden="true">{meta.emoji}</span>
      <div className="min-w-0 flex-1">
        <div className={`leading-snug break-words ${compact ? "text-[13px] line-clamp-2" : "text-sm"}`} style={{ color: "var(--ink)" }}>{notice.text}</div>
        {!compact && (
          <div className="text-[11px] font-bold mt-0.5" style={{ color: meta.color }}>
            {meta.label}<span className="text-stone-400 font-normal"> · {formatTime(notice.ts)} 掲示</span>
          </div>
        )}
      </div>
    </div>
  );
};

/** 引き取り場所の案内。一覧シートの末尾に置く。
    地のクリーム色は夜間モードでも変わらないので、文字色も固定にしないと
    「薄いグレー on クリーム」になって読めなくなる。 */
const NoticeFooter = () => (
  <div className="text-xs leading-relaxed" style={{ color: "#78350f" }}>
    お心当たりのある方は、<strong className="font-bold" style={{ color: "#451a03" }}>案内所（HR棟2階・2-1と2-2の間）</strong>か、近くのスタッフ・教員へお声がけください。
  </div>
);

/** ホームに並べる件数。これを増やすと企画一覧が下へ押し出される。 */
const PREVIEW_COUNT = 2;

/** ホームに出すカード。新しい順に数件だけ見せて、続きは一覧シートへ送る。 */
export const NoticeBoardCard = ({ notices, onOpenList }: { notices: FestivalNotice[]; onOpenList: () => void }) => {
  const sorted = useMemo(() => sortNotices(notices), [notices]);
  const lostCount = countNoticeKinds(sorted).lost;
  const preview = sorted.slice(0, PREVIEW_COUNT);
  const rest = sorted.length - preview.length;
  if (sorted.length === 0) return null;

  return (
    <div className="mb-3 rounded-2xl bg-white border overflow-hidden" style={{ borderColor: "#fde68a" }}>
      <div className="px-3 pt-2 pb-0.5 flex items-center gap-1.5">
        <span className="text-[13px]" aria-hidden="true">🧳</span>
        <span className="font-black text-[13px]" style={{ color: "var(--ink)" }}>落とし物・お知らせ</span>
        <span className="ml-auto text-[10px] font-black px-1.5 py-0.5 rounded-full"
          style={{ backgroundColor: "#fffbeb", color: "#b45309", border: "1px solid #fde68a" }}>
          {lostCount > 0 ? `落とし物 ${lostCount}件` : `${sorted.length}件`}
        </span>
      </div>
      <div className="px-3 pb-1 divide-y divide-stone-100">
        {preview.map((n) => <NoticeRow key={n.id} notice={n} compact />)}
      </div>
      {/* 一覧はいつでも開けるようにする。掲示が少ないうちは件数だけ変えて同じ場所に出す。
          引き取り場所もここに1行だけ添える(詳しい場所は一覧シートで案内する)。 */}
      <button onClick={onOpenList}
        className="w-full px-3 py-2 flex items-center justify-center gap-1 text-[11px] font-black border-t active:scale-[0.99] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        style={{ color: "#b45309", backgroundColor: "#fffbeb", borderColor: "#fef3c7" }}>
        {rest > 0 ? `ほか${rest}件 · 一覧を見る（受け取りは案内所へ）` : "一覧を見る（受け取りは案内所へ）"}
        <ChevronRight size={13} strokeWidth={3} />
      </button>
    </div>
  );
};

type NoticeFilter = "all" | FestivalNotice["kind"];

/** 掲示の全件一覧。種類でしぼれる(落とし物だけ見たい人が大半のため)。 */
export const NoticeListSheet = ({ notices, onClose }: { notices: FestivalNotice[]; onClose: () => void }) => {
  const [filter, setFilter] = useState<NoticeFilter>("all");
  const sorted = useMemo(() => sortNotices(notices), [notices]);
  const counts = useMemo(() => countNoticeKinds(sorted), [sorted]);
  const shown = filter === "all" ? sorted : sorted.filter((n) => n.kind === filter);

  // 0件の種類は押しても空になるだけなので出さない
  const tabs: { id: NoticeFilter; label: string }[] = [
    { id: "all", label: `すべて ${counts.all}` },
    ...(counts.lost > 0 ? [{ id: "lost" as const, label: `🧳 落とし物 ${counts.lost}` }] : []),
    ...(counts.child > 0 ? [{ id: "child" as const, label: `👶 迷子 ${counts.child}` }] : []),
    ...(counts.info > 0 ? [{ id: "info" as const, label: `📢 お知らせ ${counts.info}` }] : []),
  ];

  return (
    <Sheet onClose={onClose} title="落とし物・お知らせ">
      <div className="p-4">
        {tabs.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none touch-pan-x -mx-1 px-1 pb-3">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setFilter(t.id)}
                aria-pressed={filter === t.id}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-extrabold border-2 transition-all active:scale-95 ${filter === t.id ? "text-white" : "bg-white text-stone-600 border-stone-200"}`}
                style={filter === t.id ? { backgroundColor: "#b45309", borderColor: "#b45309" } : {}}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {shown.length === 0 ? (
          <div className="py-10 text-center">
            <div className="text-3xl mb-2" aria-hidden="true">🧳</div>
            <div className="text-sm font-bold text-stone-500">いまは掲示がありません</div>
            <div className="text-xs text-stone-400 mt-1">落とし物が届くと、ここに掲示されます</div>
          </div>
        ) : (
          <div className="divide-y divide-stone-100" role="list">
            {shown.map((n) => <div key={n.id} role="listitem"><NoticeRow notice={n} /></div>)}
          </div>
        )}

        <div className="mt-4 p-3.5 rounded-2xl" style={{ backgroundColor: "#fffbeb", border: "1px solid #fde68a" }}>
          <NoticeFooter />
          <div className="text-[11px] mt-2 leading-relaxed" style={{ color: "#a16207" }}>
            掲示は実行委員が手作業で更新しています。届いたばかりの物はまだ載っていないことがあります。
          </div>
        </div>
      </div>
    </Sheet>
  );
};
