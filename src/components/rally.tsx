import { useCallback, useEffect, useState } from "react";
import { Award, RotateCcw, Ticket } from "lucide-react";
import { THEME } from "../lib/festival";
import { RallyCertificate, RankBadge, rallyRank } from "./celebrate";

/* ═══════════ スタンプラリー ═══════════
   企画の詳細を開くと、この端末だけに「回った企画」として記録する。
   サーバーには一切送らない(個人の行動履歴を預からないための設計)。 */

const RALLY_KEY = "machitime:v6:rally";
const MILESTONES = [5, 10, 20, 30];

interface RallyStore { visited: string[] }

const readRally = (): string[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(RALLY_KEY) ?? "null") as RallyStore | string[] | null;
    const list = Array.isArray(raw) ? raw : Array.isArray(raw?.visited) ? raw.visited : [];
    return list.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
};

export interface StampRally {
  visited: string[];
  record: (id: string) => void;
  /** 押し間違えたときに取り消せるようにする */
  remove: (id: string) => void;
  reset: () => void;
}

export function useStampRally(): StampRally {
  const [visited, setVisited] = useState<string[]>(readRally);

  useEffect(() => {
    try { localStorage.setItem(RALLY_KEY, JSON.stringify({ visited })); } catch { /* プライベートモード */ }
  }, [visited]);

  // 同じ企画を何度開いても増えない(冪等)。再レンダリングも起こさない。
  const record = useCallback((id: string) => {
    setVisited((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const remove = useCallback((id: string) => {
    setVisited((prev) => prev.filter((x) => x !== id));
  }, []);

  const reset = useCallback(() => setVisited([]), []);

  return { visited, record, remove, reset };
}

export const StampRallyCard = ({ count, total, onReset }: { count: number; total: number; onReset: () => void }) => {
  const [confirming, setConfirming] = useState(false);
  const [certOpen, setCertOpen] = useState(false);
  const rank = rallyRank(count, total);
  const goal = Math.max(1, total);
  const percent = Math.min(100, Math.round((count / goal) * 100));
  const complete = total > 0 && count >= total;
  const justReached = !complete && MILESTONES.includes(count);
  const next = MILESTONES.find((m) => m > count) ?? total;
  const celebrating = complete || justReached;

  return (
    <div
      className="mb-3 rounded-2xl p-3 relative overflow-hidden border-2"
      style={celebrating
        ? { background: "linear-gradient(120deg,#ffd23f,#ff8a3d,#ff4d8d)", borderColor: "#ffffff66" }
        : { background: "var(--surface)", borderColor: `${THEME.purple}33` }}
    >
      {celebrating && (
        <div className="absolute inset-0 opacity-25 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle,#fff 1.5px,transparent 1.5px)", backgroundSize: "16px 16px" }} />
      )}
      <div className="relative flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={celebrating ? { background: "rgba(255,255,255,0.3)" } : { background: `${THEME.purple}1a` }}>
          <Ticket size={20} strokeWidth={2.4} style={{ color: celebrating ? "#fff" : THEME.purple }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-black" style={{ color: celebrating ? "#ffffffdd" : THEME.purple }}>🎫 スタンプラリー</div>
          <div className="font-black text-base leading-tight" style={{ color: celebrating ? "#fff" : "var(--ink)" }}>
            回った企画 <span className="tabular-nums">{count}</span>/<span className="tabular-nums">{total}</span>
          </div>
          <div className="mt-1"><RankBadge rank={rank} /></div>
        </div>
        {count > 0 && (
          <button
            onClick={() => { if (confirming) { onReset(); setConfirming(false); } else setConfirming(true); }}
            onBlur={() => setConfirming(false)}
            className="flex-shrink-0 px-2.5 py-2 rounded-full text-xs font-black flex items-center gap-1 active:scale-95 transition-transform"
            style={confirming
              ? { background: "#dc2626", color: "#fff" }
              : { background: celebrating ? "rgba(255,255,255,0.3)" : "#f5f5f4", color: celebrating ? "#fff" : "#78716c" }}
          >
            <RotateCcw size={11} strokeWidth={2.8} />{confirming ? "本当に消す？" : "リセット"}
          </button>
        )}
      </div>

      <div className="relative mt-2 h-2 rounded-full overflow-hidden" style={{ background: celebrating ? "rgba(255,255,255,0.35)" : "#f0ecf5" }}>
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${percent}%`, background: celebrating ? "#fff" : THEME.festGradient }} />
      </div>

      <div className="relative text-[11px] font-bold mt-1.5" style={{ color: celebrating ? "#fff" : "#78716c" }}>
        {complete
          ? `🏆 全${total}企画コンプリート！ほんとうにすごい！`
          : justReached
            ? `🎉 ${count}企画達成！この調子でいこう！`
            : count === 0
              ? "企画の詳細で「ここに行った！」を押すとたまります"
              : rank.next != null
                ? `あと${Math.max(1, rank.next - count)}企画で「${rank.nextTitle}」になれる 🎉`
                : `あと${Math.max(1, next - count)}企画で ${next}企画達成 🎉`}
      </div>

      {complete && (
        <button onClick={() => setCertOpen(true)}
          className="relative w-full mt-2.5 py-2.5 rounded-xl bg-white/90 text-sm font-black flex items-center justify-center gap-1.5 active:scale-95"
          style={{ color: THEME.orange }}>
          <Award size={16} strokeWidth={2.6} /> 認定証を見る
        </button>
      )}
      {certOpen && <RallyCertificate count={count} total={total} onClose={() => setCertOpen(false)} />}
    </div>
  );
};
