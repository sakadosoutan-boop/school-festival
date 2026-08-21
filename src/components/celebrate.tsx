import { useEffect, useMemo, useState } from "react";
import { THEME } from "../lib/festival";

/* ═══════════ 演出とデジタル報酬 ═══════════
   スタンプラリーは現地で景品を配るのが難しいため、報酬はアプリの中で完結させる。
   ・スタンプを押した瞬間の紙吹雪
   ・件数に応じた「称号」バッジ
   ・全制覇したら共有できる認定証
   いずれも端末内で完結し、サーバーへは何も送らない。 */

const CONFETTI_COLORS = ["#ff4d8d", "#ff8a3d", "#ffd23f", "#9b5de5", "#4cc9f0", "#3ddc97"];

/** スタンプを押した瞬間に画面へ舞う紙吹雪。表示後 1.2 秒で自動的に消える。 */
export const Confetti = ({ onDone }: { onDone: () => void }) => {
  const pieces = useMemo(() => Array.from({ length: 26 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    dx: `${Math.round((Math.random() - 0.5) * 120)}px`,
    rot: `${Math.round(180 + Math.random() * 540)}deg`,
    delay: Math.random() * 0.25,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
    size: 6 + Math.round(Math.random() * 6),
  })), []);

  useEffect(() => {
    const t = window.setTimeout(onDone, 1400);
    return () => window.clearTimeout(t);
  }, [onDone]);

  return (
    <div className="fixed inset-x-0 top-0 h-1/2 z-[95] pointer-events-none overflow-hidden" aria-hidden="true">
      {pieces.map((p) => (
        <span key={p.id} className="absolute top-0 anim-confetti rounded-sm"
          style={{
            left: `${p.left}%`, width: p.size, height: p.size * 1.6, background: p.color,
            animationDelay: `${p.delay}s`,
            ["--dx" as string]: p.dx, ["--rot" as string]: p.rot,
          }} />
      ))}
    </div>
  );
};

/* ── 称号(デジタル報酬) ── */
export interface RallyRank { level: number; title: string; emoji: string; need: number; next: number | null; nextTitle: string | null }

const RANKS = [
  { need: 0, title: "やなぎ祭ビギナー", emoji: "🌱" },
  { need: 3, title: "さんぽ名人", emoji: "🚶" },
  { need: 7, title: "やなぎ探検隊", emoji: "🔎" },
  { need: 15, title: "文化祭マスター", emoji: "⭐" },
  { need: 25, title: "やなぎ祭の主(ぬし)", emoji: "👑" },
  { need: 43, title: "全制覇レジェンド", emoji: "🏆" },
] as const;

export function rallyRank(count: number, total: number): RallyRank {
  // 参加団体数が43でない年でも破綻しないよう、最後の段位だけ実際の総数に合わせる
  const table = RANKS.map((r, i) => ({ ...r, need: i === RANKS.length - 1 ? Math.max(1, total) : r.need }));
  let level = 0;
  for (let i = 0; i < table.length; i++) if (count >= (table[i]?.need ?? 0)) level = i;
  const current = table[level]!;
  const upcoming = table[level + 1];
  return {
    level,
    title: current.title,
    emoji: current.emoji,
    need: current.need,
    next: upcoming ? upcoming.need : null,
    nextTitle: upcoming ? upcoming.title : null,
  };
}

/** 称号バッジ。最高位のときだけ光る。 */
export const RankBadge = ({ rank }: { rank: RallyRank }) => (
  <span className={`relative inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black overflow-hidden ${rank.next === null ? "text-white" : ""}`}
    style={rank.next === null
      ? { background: "linear-gradient(120deg,#ffd23f,#ff8a3d,#ff4d8d)" }
      : { background: `${THEME.purple}1a`, color: THEME.purple }}>
    {rank.next === null && <span className="absolute inset-0 anim-badge-shine" aria-hidden="true" />}
    <span className="relative">{rank.emoji} {rank.title}</span>
  </span>
);

/* ── 全制覇の認定証(共有できるデジタル報酬) ── */
export const RallyCertificate = ({ count, total, onClose }: { count: number; total: number; onClose: () => void }) => {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const text = `やなぎ祭の企画を${count}/${total}こ回りました！ #やなぎ祭 #まちたいむ`;
    try {
      if (navigator.share) { await navigator.share({ title: "やなぎ祭 スタンプラリー", text }); return; }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { /* 共有をキャンセルした場合は何もしない */ }
  };
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center px-6 bg-black/45 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="スタンプラリー認定証">
      <div className="w-full max-w-sm rounded-3xl p-6 text-center relative overflow-hidden anim-stamp-press"
        style={{ background: "linear-gradient(150deg,#fff7ed,#fff0f6)", border: "3px solid #ffd23f" }}>
        <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle,#ff8a3d 1.5px,transparent 1.5px)", backgroundSize: "18px 18px" }} />
        <div className="relative">
          <div className="text-5xl mb-1">🏆</div>
          <div className="text-xs font-black tracking-[0.2em]" style={{ color: THEME.orange }}>CERTIFICATE</div>
          <h2 className="text-2xl font-black mt-1 mb-2" style={{ color: THEME.ink }}>全制覇 おめでとう！</h2>
          <p className="text-sm font-bold leading-relaxed" style={{ color: THEME.ink }}>
            第53回やなぎ祭の<br /><span className="text-lg font-black" style={{ color: THEME.pinkDeep }}>{total}企画すべて</span>を回りました
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <button onClick={() => void share()} className="py-3 rounded-2xl text-white font-black text-sm active:scale-95"
              style={{ background: "linear-gradient(135deg,#ff4d8d,#9b5de5)" }}>
              {copied ? "コピーしました！" : "🎉 記録を共有する"}
            </button>
            <button onClick={onClose} className="py-2.5 rounded-2xl border border-stone-200 bg-white text-stone-600 font-bold text-sm active:scale-95">閉じる</button>
          </div>
        </div>
      </div>
    </div>
  );
};
