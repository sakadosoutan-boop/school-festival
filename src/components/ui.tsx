import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Minus, Plus, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { freshness, THEME } from "../lib/festival";
import type { Booth } from "../types";

export const Pill = ({ children, color = "#78716c", soft = "#f5f5f4", ring = "#e7e5e4" }: { children: ReactNode; color?: string; soft?: string; ring?: string }) => (
  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full border"
    style={{ color, backgroundColor: soft, borderColor: ring }}>
    {children}
  </span>
);

// ブースアイコン: アップロード画像があれば画像を、なければ絵文字を表示
export const BoothIcon = ({ booth, size = 56, rounded = 16, emojiClass = "text-4xl" }: { booth: Booth; size?: number; rounded?: number; emojiClass?: string }) => {
  if (booth.iconImage) {
    return (
      <img src={booth.iconImage} alt={booth.name || "icon"}
        style={{ width: size, height: size, borderRadius: rounded, objectFit: "cover" }}
        className="flex-shrink-0" />
    );
  }
  return <span className={emojiClass} style={{ lineHeight: 1 }}>{booth.emoji}</span>;
};

export const IconButton = ({ icon: Icon, onClick, label, variant = "ghost", size = "md" }: { icon: LucideIcon; onClick?: () => void; label: string; variant?: "ghost" | "solid" | "soft"; size?: "sm" | "md" | "lg" }) => {
  const sizes = { sm: "w-8 h-8", md: "w-10 h-10", lg: "w-12 h-12" };
  const variants = {
    ghost: "hover:bg-stone-100 text-stone-700",
    solid: "bg-stone-900 text-white hover:bg-stone-800",
    soft: "bg-stone-100 text-stone-900 hover:bg-stone-200",
  };
  return (
    <button onClick={onClick} aria-label={label}
      className={`${sizes[size]} ${variants[variant]} rounded-full flex items-center justify-center transition-all active:scale-95`}>
      <Icon size={size === "sm" ? 16 : size === "lg" ? 22 : 18} strokeWidth={2} />
    </button>
  );
};

export const Spinner = () => (
  <div className="w-5 h-5 rounded-full border-2 border-stone-200 border-t-stone-900 animate-spin" />
);

// 依存ライブラリなしのスパークライン
export const Sparkline = ({ history, color = "#dc2626" }: { history: Booth["history"]; color?: string }) => {
  if (!history || history.length < 2) {
    return <div className="h-8 flex items-end gap-0.5">
      {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="w-1 bg-stone-200 rounded-full" style={{ height: 8 }} />)}
    </div>;
  }
  const pts = history.slice(-12).map((h) => h.wait);
  const W = 96, H = 32, P = 2;
  const min = Math.min(...pts), max = Math.max(...pts);
  const span = max - min || 1;
  const step = pts.length > 1 ? (W - P * 2) / (pts.length - 1) : 0;
  const coords = pts.map((v, i) => {
    const x = P + i * step;
    const y = H - P - ((v - min) / span) * (H - P * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      <polyline points={coords.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// 詳細画面用の大きめ推移グラフ(recharts の代替。外部依存なし)
export const WaitChart = ({ history, color }: { history: Booth["history"]; color: string }) => {
  const pts = history.slice(-20);
  if (pts.length < 2) return null;
  const W = 100, H = 40;
  const max = Math.max(10, ...pts.map((p) => p.wait)) + 5;
  const step = (W - 4) / (pts.length - 1);
  const coords = pts.map((p, i) => `${(2 + i * step).toFixed(1)},${(H - 3 - (p.wait / max) * (H - 6)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full" aria-hidden="true">
      <polyline points={coords} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 2.5 }} />
    </svg>
  );
};

/* 汎用ボトムシート(Escキーでも閉じられる) */
export const Sheet = ({ onClose, title, children }: { onClose: () => void; title: string; children: ReactNode }) => {
  useEffect(() => {
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = orig;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose}>
      <div
        className="w-full max-w-xl mx-auto bg-stone-50 rounded-t-3xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          maxHeight: "calc(100dvh - max(env(safe-area-inset-top), 24px))",
          animation: "slideUp 0.25s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        <div className="flex-shrink-0 bg-stone-50 border-b border-stone-200 px-5 pt-4 pb-3 flex items-center gap-3 rounded-t-3xl relative">
          <div className="w-10 h-1 bg-stone-300 rounded-full absolute top-2 left-1/2 -translate-x-1/2" />
          <div className="flex-1 font-bold text-stone-900 mt-1">{title}</div>
          <IconButton icon={X} onClick={onClose} label="閉じる" variant="soft" size="sm" />
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </div>
  );
};

export type ToastType = "success" | "error" | "info" | "warn";
export const Toast = ({ message, type = "success" }: { message: string; type?: ToastType }) => {
  const map = {
    success: { bg: "#16a34a", icon: CheckCircle2 },
    error: { bg: "#dc2626", icon: AlertTriangle },
    info: { bg: "#1c1917", icon: Info },
    warn: { bg: "#d97706", icon: AlertTriangle },
  } as const;
  const c = map[type];
  const Icon = c.icon;
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 text-white font-bold text-sm max-w-[90vw]"
      style={{ backgroundColor: c.bg, animation: "slideDown 0.25s cubic-bezier(0.16,1,0.3,1)" }} role="status">
      <Icon size={18} strokeWidth={2.5} /><span>{message}</span>
    </div>
  );
};

export const Confirm = ({ title, message, confirmLabel = "OK", danger, onConfirm, onCancel }: { title: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center px-6" style={{ background: "rgba(0,0,0,0.55)" }} onClick={onCancel}>
    <div className="bg-white rounded-3xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}
      style={{ animation: "slideUp 0.2s cubic-bezier(0.16,1,0.3,1)" }} role="alertdialog" aria-label={title}>
      <div className={`w-12 h-12 mx-auto rounded-2xl flex items-center justify-center mb-3 ${danger ? "bg-red-50" : "bg-stone-100"}`}>
        <AlertTriangle size={22} className={danger ? "text-red-600" : "text-stone-700"} strokeWidth={2.2} />
      </div>
      <h3 className="text-lg font-black text-stone-900 text-center mb-1">{title}</h3>
      <p className="text-sm text-stone-500 text-center mb-5 leading-relaxed">{message}</p>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-3 rounded-2xl border border-stone-200 font-bold text-sm bg-white active:scale-95">キャンセル</button>
        <button onClick={onConfirm} className={`flex-1 py-3 rounded-2xl text-white font-bold text-sm active:scale-95 ${danger ? "bg-red-600" : "bg-stone-900"}`}>{confirmLabel}</button>
      </div>
    </div>
  </div>
);

export const StaleBadge = ({ booth }: { booth: Booth }) => {
  const f = freshness(booth);
  if (f === "fresh") return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200">
      <AlertTriangle size={10} strokeWidth={2.5} />
      {f === "very_stale" ? "情報が古い" : "更新待ち"}
    </span>
  );
};

export const StatCard = ({ label, value, unit }: { label: string; value: string; unit?: string }) => (
  <div className="bg-white/90 backdrop-blur rounded-2xl px-3 py-2 shadow-sm">
    <div className="text-[10px] font-bold" style={{ color: "#9b5de5" }}>{label}</div>
    <div className="flex items-baseline gap-0.5 mt-0.5"><span className="text-lg font-black tabular-nums" style={{ color: "#3b1f4f" }}>{value}</span>{unit && <span className="text-[10px] font-bold text-stone-500">{unit}</span>}</div>
  </div>
);

export const TabButton = ({ active, icon: Icon, label, onClick }: { active: boolean; icon: LucideIcon; label: string; onClick: () => void }) => (
  <button onClick={onClick} className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5">
    <div className="flex items-center justify-center w-12 h-8 rounded-full transition-all"
      style={active ? { background: "linear-gradient(135deg,#ff4d8d,#9b5de5)" } : {}}>
      <Icon size={20} strokeWidth={active ? 2.6 : 2} className={active ? "text-white" : "text-stone-400"} />
    </div>
    <span className="text-[10px] font-extrabold" style={{ color: active ? "#e6206b" : "#a8a29e" }}>{label}</span>
  </button>
);

export const EmptyState = ({ icon, title, message }: { icon: string; title: string; message: string }) => (
  <div className="text-center py-16"><div className="text-5xl mb-3">{icon}</div><div className="font-bold text-stone-700 mb-1">{title}</div><div className="text-sm text-stone-500">{message}</div></div>
);

/* ═══════════ フォーム部品 ═══════════ */

export const NumberStepper = ({ value, onChange, min, max, step, unit, display }: { value: number; onChange: (v: number) => void; min: number; max: number; step: number; unit?: string; display?: string }) => (
  <div className="flex items-center gap-2">
    <button onClick={() => onChange(Math.max(min, value - step))} className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center active:scale-95" aria-label="減らす"><Minus size={18} strokeWidth={3} className="text-stone-700" /></button>
    <div className="flex-1 text-center bg-stone-50 rounded-2xl py-2.5 px-3 border border-stone-100">
      <div className="text-3xl font-black text-stone-900 tabular-nums leading-none">{display || value}</div>
      {!display && <div className="text-xs font-bold text-stone-500 mt-1">{unit}</div>}
    </div>
    <button onClick={() => onChange(Math.min(max, value + step))} className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center active:scale-95" aria-label="増やす"><Plus size={18} strokeWidth={3} className="text-stone-700" /></button>
  </div>
);

export const QuickPick = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) => (
  <button onClick={onClick} className={`py-2 px-1 text-xs font-bold rounded-xl border transition-colors ${active ? "bg-stone-900 text-white border-stone-900" : "bg-white text-stone-700 border-stone-200 hover:border-stone-300"}`}>{children}</button>
);

export const Field = ({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) => (
  <div><label className="block text-xs font-bold text-stone-700 mb-1.5">{label} {required && <span className="text-red-600">*</span>}</label>{children}</div>
);
export const Hint = ({ children }: { children: ReactNode }) => <div className="text-[11px] text-stone-400 mt-1.5">{children}</div>;

/* ドラムロール式ピッカー(縦スクロールスナップ) */
export const Wheel = ({ label, options, value, onChange, suffix = "" }: { label: string; options: number[]; value: number; onChange: (v: number) => void; suffix?: string }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const timer = useRef<number | null>(null);
  const ITEM_H = 40;
  const idx = Math.max(0, options.indexOf(value));

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const target = idx * ITEM_H;
    if (Math.abs(el.scrollTop - target) > 2) el.scrollTop = target;
  }, [idx]);

  const onScroll = () => {
    const el = ref.current; if (!el) return;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const i = Math.round(el.scrollTop / ITEM_H);
      const clamped = Math.max(0, Math.min(options.length - 1, i));
      const next = options[clamped];
      if (next !== undefined && next !== value) onChange(next);
      el.scrollTo({ top: clamped * ITEM_H, behavior: "smooth" });
    }, 90);
  };

  return (
    <div className="flex-1">
      <div className="text-[10px] font-bold text-stone-400 text-center mb-1">{label}</div>
      <div className="relative" style={{ height: ITEM_H * 3 }}>
        <div className="absolute inset-x-1 rounded-xl pointer-events-none" style={{ top: ITEM_H, height: ITEM_H, background: "linear-gradient(135deg,#ff4d8d22,#9b5de522)", border: "1.5px solid #ff4d8d55" }} />
        <div ref={ref} onScroll={onScroll}
          className="h-full overflow-y-auto scrollbar-none snap-y snap-mandatory"
          style={{ scrollSnapType: "y mandatory" }}>
          <div style={{ height: ITEM_H }} />
          {options.map((o) => (
            <div key={o}
              onClick={() => { onChange(o); }}
              className="snap-center flex items-center justify-center font-black tabular-nums cursor-pointer transition-all"
              style={{ height: ITEM_H, color: o === value ? THEME.ink : "#c4bcc9", fontSize: o === value ? 22 : 17 }}>
              {o}{suffix}
            </div>
          ))}
          <div style={{ height: ITEM_H }} />
        </div>
      </div>
    </div>
  );
};

export const TimeStepper = ({ value, onMinus, onPlus }: { value: string; onMinus: () => void; onPlus: () => void }) => (
  <div className="flex items-center gap-1.5">
    <button onClick={onMinus} className="w-10 h-12 rounded-xl bg-stone-100 flex items-center justify-center active:scale-95" aria-label="5分早める"><Minus size={16} strokeWidth={3} className="text-stone-700" /></button>
    <div className="flex-1 text-center bg-stone-50 rounded-xl py-3 border border-stone-100"><span className="text-xl font-black text-stone-900 tabular-nums">{value}</span></div>
    <button onClick={onPlus} className="w-10 h-12 rounded-xl bg-stone-100 flex items-center justify-center active:scale-95" aria-label="5分遅らせる"><Plus size={16} strokeWidth={3} className="text-stone-700" /></button>
  </div>
);
