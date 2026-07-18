import { useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import {
  AlertTriangle, BellRing, Calculator, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock, Download,
  Info, Lock, LogOut, Megaphone, Music, Plus, Minus, RefreshCw, Settings, Smartphone, Sparkles, Trash2, Undo2, Upload, Users, X, Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  APP_NAME, avgCycle, BUILDINGS, calcWait, CATEGORIES, CLASS_NUMS, EMOJI_PALETTE, FLOORS, formatCycle,
  formatLocation, formatOrganizer, formatTime, freshness, getStatus, GRADES, isSoldOut, makeBooth,
  minutesSince, NAG_MINUTES, ORG_TYPES, THEME,
} from "../lib/festival";
import { backendConfigured, DEMO_ADMIN_PIN, DEMO_STAFF_PIN } from "../lib/api";
import type { Booth, Product, SnapshotMeta, StaffRole } from "../types";
import { BoothIcon, Confirm, Field, Hint, IconButton, NumberStepper, QuickPick, Sheet, Wheel } from "./ui";

/* ═══════════ STAFF: PIN LOGIN ═══════════ */

export const StaffLogin = ({ onSubmit, onBack, busy }: { onSubmit: (pin: string) => Promise<boolean>; onBack: () => void; busy: boolean }) => {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  const submit = async () => {
    if (!/^\d{4,8}$/.test(pin)) { setError(true); setTimeout(() => setError(false), 700); return; }
    const ok = await onSubmit(pin);
    if (!ok) {
      setError(true);
      setPin("");
      setTimeout(() => setError(false), 700);
    }
  };

  return (
    <div>
      <div className="sticky top-0 z-10 bg-stone-50/90 backdrop-blur-xl border-b border-stone-200 px-4 py-3 flex items-center gap-2">
        <IconButton icon={ChevronLeft} onClick={onBack} label="戻る" variant="ghost" />
        <div className="flex-1 font-bold text-stone-900">スタッフログイン</div>
      </div>
      <div className="min-h-[55vh] flex flex-col items-center justify-center px-6 py-12">
        <div className="w-16 h-16 rounded-3xl flex items-center justify-center mb-6 shadow-lg" style={{ background: "linear-gradient(135deg,#ff4d8d,#9b5de5)" }}>
          <Lock size={28} className="text-white" strokeWidth={2.2} />
        </div>
        <h2 className="text-2xl font-black text-stone-900 mb-1 tracking-tight">スタッフモード</h2>
        <p className="text-sm text-stone-500 mb-8 text-center max-w-xs">担当ブースの待ち時間を更新するには<br />スタッフPIN(4〜8桁)を入力してください</p>
        <form className={`w-full max-w-xs ${error ? "animate-shake" : ""}`} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <input
            value={pin}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
            inputMode="numeric"
            type="password"
            autoComplete="off"
            placeholder="••••"
            className={`w-full h-16 text-3xl font-black text-center rounded-2xl border-2 outline-none focus:border-stone-900 transition-colors tabular-nums tracking-[0.3em] ${error ? "border-red-500 bg-red-50" : "border-stone-200 bg-white"}`}
          />
          <button type="submit" disabled={busy || pin.length < 4}
            className="w-full mt-3 py-3.5 rounded-2xl text-white font-black text-sm active:scale-95 disabled:opacity-40"
            style={{ background: "linear-gradient(135deg,#ff4d8d,#9b5de5)" }}>
            {busy ? "確認中…" : "ログイン"}
          </button>
        </form>
        {error && <div className="mt-3 text-sm font-semibold text-red-600 flex items-center gap-1.5"><AlertTriangle size={14} /> PINが正しくありません</div>}
        {!backendConfigured && (
          <div className="mt-8 text-xs text-stone-400 text-center max-w-xs">💡 デモの初期PIN: 更新用 <span className="font-mono font-bold">{DEMO_STAFF_PIN}</span> / 管理者 <span className="font-mono font-bold">{DEMO_ADMIN_PIN}</span></div>
        )}
      </div>
    </div>
  );
};

/* ═══════════ STAFF: BOOTH SELECTOR ═══════════ */

export const StaffBoothSelector = ({ booths, role, pendingCount, onSelect, onCreate, onEdit, onLogout, onOpenSettings, onOpenStage }: {
  booths: Booth[]; role: StaffRole; pendingCount: number;
  onSelect: (id: string) => void; onCreate: () => void; onEdit: (id: string) => void;
  onLogout: () => void; onOpenSettings: () => void; onOpenStage: () => void;
}) => (
  <div>
    <div className="sticky top-0 z-10 bg-stone-50/90 backdrop-blur-xl border-b border-stone-200 px-4 py-3 flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div className="font-bold text-stone-900">スタッフメニュー</div>
        <div className="text-[10px] font-bold text-stone-400">{role === "admin" ? "管理者PINでログイン中" : "更新用PINでログイン中"}</div>
      </div>
      <IconButton icon={Settings} onClick={onOpenSettings} label="設定" variant="soft" size="sm" />
      <button onClick={onLogout} className="text-xs font-bold text-stone-500 hover:text-stone-900 px-2 py-1.5 flex items-center gap-1">
        <LogOut size={14} /> ログアウト
      </button>
    </div>

    <div className="px-4 py-5">
      {pendingCount > 0 && (
        <div className="mb-3 p-3.5 rounded-2xl bg-amber-50 border border-amber-300 flex items-start gap-2.5">
          <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" strokeWidth={2.4} />
          <div className="text-xs text-amber-900 leading-relaxed"><strong className="font-bold">未送信の更新が{pendingCount}件あります。</strong>電波が戻ると自動で送信されます。</div>
        </div>
      )}

      <button onClick={onOpenStage}
        className="w-full mb-3 flex items-center gap-3 p-4 rounded-2xl active:scale-[0.99] transition-all text-left text-white shadow-md"
        style={{ background: "linear-gradient(120deg,#9b5de5,#4cc9f0)" }}>
        <div className="w-12 h-12 rounded-xl bg-white/25 flex items-center justify-center flex-shrink-0">
          <Music size={22} className="text-white" strokeWidth={2.4} />
        </div>
        <div className="flex-1"><div className="font-black">ステージ進行を管理</div><div className="text-xs text-white/85">タイムテーブルの編集・時刻のずらし・中止</div></div>
        <ChevronRight size={18} className="text-white/70" />
      </button>

      <div className="mb-4 p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-start gap-2.5">
        <Info size={16} className="text-indigo-600 mt-0.5 flex-shrink-0" strokeWidth={2.4} />
        <div className="text-xs text-indigo-900 leading-relaxed">
          待ち時間を更新するには<strong className="font-bold"> 運用する</strong>、
          ブース名や場所を変えるには<strong className="font-bold"> 編集 </strong>を押してください。
        </div>
      </div>

      <button onClick={onCreate}
        className="w-full mb-3 flex items-center gap-3 p-4 bg-white rounded-2xl border-2 border-dashed border-stone-300 hover:border-stone-900 hover:bg-stone-50 active:scale-[0.99] transition-all text-left">
        <div className="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center flex-shrink-0">
          <Plus size={22} className="text-stone-700" strokeWidth={2.5} />
        </div>
        <div className="flex-1"><div className="font-bold text-stone-900">新しいブースを追加</div><div className="text-xs text-stone-500">名前・場所・運営団体を登録</div></div>
      </button>

      {booths.length === 0 && (
        <div className="text-center py-12 text-stone-400">
          <div className="text-4xl mb-2">🎪</div>
          <div className="font-bold text-stone-600">まだブースがありません</div>
          <div className="text-sm mt-1">上のボタンから追加してください</div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        {booths.map((b) => {
          const status = getStatus(b.waitMinutes, b.isOpen);
          const f = freshness(b);
          return (
            <div key={b.id} className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
              <div className="flex items-center gap-3 p-3.5">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 overflow-hidden" style={{ backgroundColor: status.soft }}><BoothIcon booth={b} size={48} rounded={12} emojiClass="text-2xl" /></div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-stone-900 truncate">{b.name || "(無題)"}</div>
                  <div className="text-xs text-stone-500 truncate">{formatOrganizer(b) || "未設定"} · {formatLocation(b) || "場所未設定"}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-lg font-black tabular-nums" style={{ color: status.color }}>{b.isOpen ? `${b.waitMinutes}分` : "休"}</div>
                  {b.isOpen && f !== "fresh" && <div className="text-[10px] font-bold text-amber-600">要更新</div>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-px bg-stone-200 border-t border-stone-200">
                <button onClick={() => onSelect(b.id)} className="bg-white hover:bg-stone-50 active:bg-stone-100 py-3 flex items-center justify-center gap-1.5 transition-colors">
                  <CheckCircle2 size={16} className="text-emerald-600" strokeWidth={2.4} /><span className="text-sm font-bold text-stone-900">運用する</span>
                </button>
                <button onClick={() => onEdit(b.id)} className="bg-white hover:bg-stone-50 active:bg-stone-100 py-3 flex items-center justify-center gap-1.5 transition-colors">
                  <Settings size={16} className="text-indigo-600" strokeWidth={2.4} /><span className="text-sm font-bold text-stone-900">編集</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </div>
);

/* ═══════════ STAFF: BOOTH EDITOR ═══════════ */

export const EditBoothSheet = ({ booth, onClose, onSave, onDelete, isNew }: { booth: Booth | null; onClose: () => void; onSave: (b: Booth) => void; onDelete: () => void; isNew: boolean }) => {
  const [form, setForm] = useState<Booth>(booth || makeBooth({}));
  const [confirmDel, setConfirmDel] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const set = <K extends keyof Booth>(k: K, v: Booth[K]) => setForm((p) => ({ ...p, [k]: v }));

  // 画像を正方形256pxにリサイズ → data URLにしてiconImageへ。容量を抑える。
  const handleImageFile = (file: File | undefined) => {
    setUploadError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) { setUploadError("画像ファイルを選んでください"); return; }
    if (file.size > 8 * 1024 * 1024) { setUploadError("8MB以下の画像にしてください"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const S = 256;
          const canvas = document.createElement("canvas");
          canvas.width = S; canvas.height = S;
          const ctx = canvas.getContext("2d");
          if (!ctx) { setUploadError("画像を処理できませんでした"); return; }
          const side = Math.min(img.width, img.height);
          const sx = (img.width - side) / 2, sy = (img.height - side) / 2;
          ctx.drawImage(img, sx, sy, side, side, 0, 0, S, S);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
          set("iconImage", dataUrl);
        } catch { setUploadError("画像を処理できませんでした"); }
      };
      img.onerror = () => setUploadError("画像を読み込めませんでした");
      img.src = String(reader.result);
    };
    reader.onerror = () => setUploadError("ファイルを読み込めませんでした");
    reader.readAsDataURL(file);
  };

  const save = () => {
    if (!form.name.trim()) return;
    onSave({
      ...form,
      name: form.name.trim(),
      orgName: (form.orgName || "").trim(),
      organizer: "", // 旧フィールドはクリアし新形式に統一
      room: (form.room || "").trim(),
      location: "",
      description: form.description.trim(),
      emoji: (form.emoji || "🎪").trim() || "🎪",
    });
  };

  const isOutdoor = form.building === "outdoor";

  return (
    <Sheet onClose={onClose} title={isNew ? "新しいブースを追加" : "ブース情報を編集"}>
      <div className="px-5 pb-4 space-y-4 pt-1">
        <Field label="アイコン">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl flex-shrink-0 border-2 overflow-hidden"
              style={{ background: "#fff7ed", borderColor: "#ff8a3d44" }}>
              {form.iconImage
                ? <img src={form.iconImage} alt="icon" style={{ width: 64, height: 64, objectFit: "cover" }} />
                : <span>{form.emoji}</span>}
            </div>
            <div className="flex-1 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { setEmojiOpen((o) => !o); }}
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
                <button
                  key={`${e}-${i}`}
                  type="button"
                  onClick={() => { set("emoji", e); set("iconImage", ""); setEmojiOpen(false); }}
                  className={`aspect-square rounded-lg text-2xl flex items-center justify-center active:scale-90 transition-transform ${(!form.iconImage && form.emoji === e) ? "ring-2 ring-offset-1" : "hover:bg-stone-100"}`}
                  style={(!form.iconImage && form.emoji === e) ? { background: "#fff0f6", boxShadow: "inset 0 0 0 2px #ff4d8d" } : {}}
                >{e}</button>
              ))}
            </div>
          )}
          <Hint>絵文字から選ぶか、写真・イラストをアップロードできます（自動で正方形に調整されます）</Hint>
        </Field>

        <Field label="ブース名" required>
          <input type="text" value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={20}
            className="w-full px-4 py-3 rounded-xl border border-stone-200 text-base font-bold bg-white outline-none focus:border-stone-900" placeholder="例: お化け屋敷" />
        </Field>

        <Field label="カテゴリ">
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.filter((c) => c.id !== "all").map((c) => (
              <button key={c.id} type="button" onClick={() => set("category", c.id)}
                className={`px-3 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 ${form.category === c.id ? "text-white" : "bg-white text-stone-700 border border-stone-200"}`}
                style={form.category === c.id ? { background: "linear-gradient(135deg,#ff4d8d,#9b5de5)" } : {}}>{c.emoji} {c.label}</button>
            ))}
          </div>
          <Hint>来場者が「フード」「ゲーム」などで絞り込むときに使われます</Hint>
        </Field>

        <Field label="運営団体">
          <div className="grid grid-cols-3 gap-2 mb-2">
            {ORG_TYPES.map((t) => (
              <button key={t.id} type="button" onClick={() => set("orgType", t.id)}
                className={`py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 ${form.orgType === t.id ? "text-white" : "bg-white text-stone-700 border border-stone-200"}`}
                style={form.orgType === t.id ? { background: "linear-gradient(135deg,#ff8a3d,#ff4d8d)" } : {}}>{t.label}</button>
            ))}
          </div>
          {form.orgType === "class" ? (
            <div className="bg-white rounded-2xl border border-stone-200 p-3">
              <div className="flex items-stretch gap-2">
                <Wheel label="学年" options={GRADES} value={form.grade} onChange={(v) => set("grade", v)} suffix="年" />
                <Wheel label="組" options={CLASS_NUMS} value={form.classNum} onChange={(v) => set("classNum", v)} suffix="組" />
              </div>
              <div className="text-center mt-2 text-sm font-black" style={{ color: THEME.ink }}>
                表示: {form.grade}年{form.classNum}組
              </div>
            </div>
          ) : (
            <input type="text" value={form.orgName} onChange={(e) => set("orgName", e.target.value)} maxLength={30}
              className="w-full px-4 py-3 rounded-xl border border-stone-200 text-base bg-white outline-none focus:border-stone-900"
              placeholder={form.orgType === "club" ? "例: 軽音部 / 生徒会" : "例: 有志チーム"} />
          )}
        </Field>

        <Field label="場所 — 棟">
          <div className="grid grid-cols-2 gap-2">
            {BUILDINGS.map((b) => (
              <button key={b.id} type="button" onClick={() => set("building", b.id)}
                className={`px-3 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 ${form.building === b.id ? "text-white" : "bg-white text-stone-700 border border-stone-200"}`}
                style={form.building === b.id ? { background: "linear-gradient(135deg,#ff8a3d,#ff4d8d)" } : {}}>{b.label}</button>
            ))}
          </div>
        </Field>

        {!isOutdoor && (
          <Field label="場所 — 階">
            <div className="grid grid-cols-4 gap-2">
              {FLOORS.map((f) => (
                <button key={f} type="button" onClick={() => set("floor", f)}
                  className={`py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 ${form.floor === f ? "text-white" : "bg-white text-stone-700 border border-stone-200"}`}
                  style={form.floor === f ? { background: "linear-gradient(135deg,#9b5de5,#4cc9f0)" } : {}}>{f}階</button>
              ))}
            </div>
          </Field>
        )}

        <Field label={isOutdoor ? "エリア名(任意)" : "教室名・部屋番号(任意)"}>
          <input type="text" value={form.room} onChange={(e) => set("room", e.target.value)} maxLength={20}
            className="w-full px-4 py-3 rounded-xl border border-stone-200 text-base bg-white outline-none focus:border-stone-900"
            placeholder={isOutdoor ? "例: 中庭 屋台エリア" : "例: 301 / 視聴覚室"} />
          <Hint>表示: <span className="font-bold text-stone-600">{formatLocation(form) || "（未設定）"}</span> — 教室名(301など)を入れるとマップにも表示されます</Hint>
        </Field>

        <Field label="紹介文">
          <textarea value={form.description} onChange={(e) => set("description", e.target.value)} maxLength={120} rows={3}
            className="w-full px-4 py-3 rounded-xl border border-stone-200 text-base bg-white outline-none focus:border-stone-900 resize-none leading-relaxed" placeholder="例: 本格ホラー体験。心臓の弱い方はご遠慮ください。" />
          <Hint>{form.description.length} / 120 文字</Hint>
        </Field>

        <Field label="1回に同時案内できる人数">
          <NumberStepper value={form.capacity} onChange={(v) => set("capacity", v)} min={1} max={200} step={1} unit="人/回" />
          <Hint>例: たこ焼き5人前同時提供なら「5」、脱出ゲーム4人1組なら「4」</Hint>
        </Field>
      </div>

      <div className="sticky bottom-0 bg-stone-50/95 backdrop-blur-xl border-t border-stone-200 px-5 py-3 flex gap-2" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}>
        {!isNew && (
          <button type="button" onClick={() => setConfirmDel(true)} className="px-4 py-3 rounded-2xl border border-red-200 bg-white text-red-600 font-bold text-sm active:scale-95 flex items-center justify-center" aria-label="削除"><Trash2 size={16} strokeWidth={2.5} /></button>
        )}
        <button type="button" onClick={onClose} className="flex-1 px-4 py-3 rounded-2xl border border-stone-200 bg-white text-stone-700 font-bold text-sm active:scale-95">キャンセル</button>
        <button type="button" onClick={save} disabled={!form.name.trim()} className="flex-1 px-4 py-3 rounded-2xl text-white font-bold text-sm active:scale-95 disabled:opacity-40" style={{ background: form.name.trim() ? "linear-gradient(135deg,#ff4d8d,#9b5de5)" : "#a8a29e" }}>{isNew ? "追加する" : "保存する"}</button>
      </div>

      {confirmDel && (
        <Confirm title="削除しますか?" message={`「${form.name}」を削除します。この操作は元に戻せません。`} confirmLabel="削除する" danger
          onConfirm={() => { onDelete(); setConfirmDel(false); }} onCancel={() => setConfirmDel(false)} />
      )}
    </Sheet>
  );
};

/* ═══════════ STAFF: BOOTH PANEL ═══════════ */

export const StaffBoothPanel = ({ booth, onUpdate, onBack, onOpenCalculator, onEdit }: { booth: Booth; onUpdate: (patch: Partial<Booth>) => void; onBack: () => void; onOpenCalculator: () => void; onEdit: () => void }) => {
  const [pulse, setPulse] = useState(false);
  const [newProdName, setNewProdName] = useState("");
  const [newProdStock, setNewProdStock] = useState("20");
  const status = getStatus(booth.waitMinutes, booth.isOpen);
  const learnedCycle = avgCycle(booth.cycleHistory, booth.cycleSeconds);
  const nag = booth.isOpen && minutesSince(booth.lastUpdated) >= NAG_MINUTES;

  const products = booth.products || [];
  const setProducts = (next: Product[]) => onUpdate({ products: next });
  const addProduct = () => {
    const name = newProdName.trim();
    if (!name) return;
    const stock = Math.max(0, Math.min(9999, parseInt(newProdStock || "0", 10) || 0));
    setProducts([...products, { id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`, name, stock, soldOut: false }]);
    setNewProdName(""); setNewProdStock("20");
  };
  const updProduct = (id: string, patch: Partial<Product>) => setProducts(products.map((p) => p.id === id ? { ...p, ...patch } : p));
  const delProduct = (id: string) => setProducts(products.filter((p) => p.id !== id));

  const adjustLine = (delta: number) => {
    const n = Math.max(0, booth.peopleInLine + delta);
    onUpdate({ peopleInLine: n, waitMinutes: calcWait(n, booth.capacity, learnedCycle), cycleSeconds: learnedCycle });
  };
  const setLine = (n: number) => {
    const v = Math.max(0, Math.min(500, n));
    onUpdate({ peopleInLine: v, waitMinutes: calcWait(v, booth.capacity, learnedCycle) });
  };

  const markServed = () => {
    const now = Date.now();
    const snapshot = { peopleInLine: booth.peopleInLine, cycleHistory: booth.cycleHistory, lastServedAt: booth.lastServedAt, waitMinutes: booth.waitMinutes, ts: now };
    let ch = booth.cycleHistory || [];
    if (booth.lastServedAt) {
      const elapsed = Math.max(15, Math.min(3600, Math.round((now - booth.lastServedAt) / 1000)));
      ch = [...ch, elapsed].slice(-10);
    }
    const newCycle = avgCycle(ch, booth.cycleSeconds);
    const n = Math.max(0, booth.peopleInLine - booth.capacity);
    onUpdate({ peopleInLine: n, waitMinutes: calcWait(n, booth.capacity, newCycle), cycleSeconds: newCycle, cycleHistory: ch, lastServedAt: now, undoSnapshot: snapshot });
    setPulse(true); setTimeout(() => setPulse(false), 600);
  };

  const undo = () => {
    const s = booth.undoSnapshot; if (!s) return;
    onUpdate({ peopleInLine: s.peopleInLine, cycleHistory: s.cycleHistory, lastServedAt: s.lastServedAt, waitMinutes: s.waitMinutes, cycleSeconds: avgCycle(s.cycleHistory, booth.cycleSeconds), undoSnapshot: null });
  };

  const canUndo = booth.undoSnapshot && (Date.now() - booth.undoSnapshot.ts) < 60_000;

  return (
    <div className="pb-32">
      <div className="sticky top-0 z-10 bg-stone-50/90 backdrop-blur-xl border-b border-stone-200">
        <div className="flex items-center gap-2 px-4 py-3">
          <IconButton icon={ChevronLeft} onClick={onBack} label="戻る" variant="ghost" />
          <div className="flex-1 min-w-0"><div className="text-xs text-stone-500">スタッフモード</div><div className="font-bold text-stone-900 truncate">{booth.name}</div></div>
          <button onClick={() => onUpdate({ isOpen: !booth.isOpen })}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${booth.isOpen ? "bg-emerald-100 text-emerald-700" : "bg-stone-200 text-stone-600"}`}>
            {booth.isOpen ? "🟢 営業中" : "🔴 準備中"}
          </button>
        </div>
      </div>

      <div className="px-4 pt-5">
        {nag && (
          <div className="mb-4 p-3.5 rounded-2xl bg-amber-50 border border-amber-300 flex items-start gap-2.5" style={{ animation: "slideUp 0.3s" }}>
            <BellRing size={18} className="text-amber-600 mt-0.5 flex-shrink-0" strokeWidth={2.4} />
            <div className="flex-1">
              <div className="text-sm font-bold text-amber-900">{Math.floor(minutesSince(booth.lastUpdated))}分間更新されていません</div>
              <div className="text-xs text-amber-800 mt-0.5">お客さんには「情報が古い」と表示されています。今の人数に合わせて更新してください。</div>
            </div>
          </div>
        )}

        <div className="rounded-3xl p-6 mb-4 relative overflow-hidden" style={{ backgroundColor: status.soft, border: `1px solid ${status.ring}` }}>
          <div className="flex items-center justify-between mb-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full border bg-white" style={{ color: status.color, borderColor: status.ring }}><Sparkles size={11} /> 現在の表示</span>
            <div className="text-xs text-stone-500">{formatTime(booth.lastUpdated)}更新</div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-7xl font-black tracking-tight tabular-nums ${pulse ? "animate-pulse" : ""}`} style={{ color: status.color, letterSpacing: "-0.05em", lineHeight: 1 }}>{booth.waitMinutes}</span>
            <span className="text-2xl font-bold" style={{ color: status.color }}>分</span>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-stone-600"><Info size={12} /><span>{booth.peopleInLine}人 ÷ {booth.capacity}組 × {formatCycle(learnedCycle)} で自動算出</span></div>
        </div>

        <button onClick={markServed} disabled={!booth.isOpen || booth.peopleInLine <= 0}
          className="w-full text-white rounded-2xl py-5 px-5 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-40 shadow-lg"
          style={{ background: (!booth.isOpen || booth.peopleInLine <= 0) ? "#a8a29e" : "linear-gradient(135deg,#ff4d8d,#9b5de5)" }}>
          <CheckCircle2 size={22} strokeWidth={2.5} /><span className="font-black text-base">{booth.capacity}人ご案内しました</span>
        </button>

        {canUndo ? (
          <>
            <button onClick={undo} className="w-full mt-2 py-2.5 rounded-xl bg-white border border-stone-200 text-stone-700 text-xs font-bold flex items-center justify-center gap-1.5 active:scale-[0.98]">
              <Undo2 size={14} strokeWidth={2.5} /> 直前の操作を取り消す
            </button>
            <div className="text-xs text-stone-400 text-center mt-2 mb-5">💡 1分以内なら誤タップを取り消せます</div>
          </>
        ) : (
          <div className="text-xs text-stone-500 text-center mt-2 mb-5 px-4">💡 押すたびに「1組あたりの時間」を自動学習し、精度が上がります</div>
        )}

        <div className="bg-white rounded-2xl p-5 mb-3 border border-stone-200">
          <div className="flex items-center gap-2 mb-3"><Users size={18} className="text-stone-700" strokeWidth={2.2} /><div className="flex-1"><div className="font-bold text-stone-900">列に並んでいる人数</div><div className="text-xs text-stone-500">現在の見込み人数を調整</div></div></div>
          <div className="flex items-center gap-3">
            <button onClick={() => adjustLine(-1)} disabled={booth.peopleInLine <= 0} className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center active:scale-95 disabled:opacity-40" aria-label="1人減らす"><Minus size={20} strokeWidth={3} className="text-stone-700" /></button>
            <div className="flex-1 text-center">
              <input type="number" inputMode="numeric" value={booth.peopleInLine} min={0} max={500}
                onChange={(e) => setLine(parseInt(e.target.value || "0", 10) || 0)}
                className="w-full text-4xl font-black text-stone-900 tabular-nums text-center bg-transparent border-0 outline-none focus:bg-stone-50 rounded-xl py-1" />
              <span className="text-xs font-bold text-stone-500 block mt-0.5">人 (タップで直接入力)</span>
            </div>
            <button onClick={() => adjustLine(1)} className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center active:scale-95" aria-label="1人増やす"><Plus size={20} strokeWidth={3} className="text-stone-700" /></button>
          </div>
          <div className="grid grid-cols-4 gap-2 mt-3">
            {[5, 10, 20, 50].map((n) => <button key={n} onClick={() => setLine(n)} className="py-2 text-xs font-bold text-stone-700 bg-stone-50 hover:bg-stone-100 rounded-xl border border-stone-200">{n}人</button>)}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 mb-3 border border-stone-200">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🛍️</span>
            <div className="flex-1"><div className="font-bold text-stone-900">商品の在庫</div><div className="text-xs text-stone-500">売り切れはお客さんの画面にも表示されます</div></div>
          </div>

          {products.length > 0 && (
            <div className="space-y-2 mt-3">
              {products.map((p) => {
                const sold = isSoldOut(p);
                const low = !sold && p.stock <= 5;
                return (
                  <div key={p.id} className={`p-3 rounded-xl border ${sold ? "bg-red-50 border-red-200" : low ? "bg-amber-50 border-amber-200" : "bg-stone-50 border-stone-200"}`}>
                    <div className="flex items-center gap-2">
                      <span className={`flex-1 font-bold text-sm truncate ${sold ? "text-red-700" : "text-stone-900"}`}>{p.name}</span>
                      {sold && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-600 text-white flex-shrink-0">売り切れ</span>}
                      {low && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500 text-white flex-shrink-0">残りわずか</span>}
                      <button onClick={() => delProduct(p.id)} className="w-7 h-7 rounded-lg bg-white border border-stone-200 flex items-center justify-center active:scale-90 flex-shrink-0" aria-label="商品を削除">
                        <Trash2 size={13} className="text-stone-400" strokeWidth={2.4} />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mt-2.5">
                      <button onClick={() => updProduct(p.id, { stock: Math.max(0, (p.stock || 0) - 1) })} disabled={(p.stock || 0) <= 0}
                        className="w-10 h-10 rounded-xl bg-white border border-stone-200 flex items-center justify-center active:scale-95 disabled:opacity-40" aria-label="在庫を1減らす">
                        <Minus size={16} strokeWidth={3} className="text-stone-700" />
                      </button>
                      <div className="flex-1 text-center">
                        <span className={`text-2xl font-black tabular-nums ${sold ? "text-red-600" : "text-stone-900"}`}>{p.stock ?? 0}</span>
                        <span className="text-xs font-bold text-stone-500 ml-1">個</span>
                      </div>
                      <button onClick={() => updProduct(p.id, { stock: Math.min(9999, (p.stock || 0) + 1) })}
                        className="w-10 h-10 rounded-xl bg-white border border-stone-200 flex items-center justify-center active:scale-95" aria-label="在庫を1増やす">
                        <Plus size={16} strokeWidth={3} className="text-stone-700" />
                      </button>
                      <button onClick={() => updProduct(p.id, { soldOut: !p.soldOut })}
                        className={`px-3 h-10 rounded-xl text-xs font-black active:scale-95 ${p.soldOut ? "bg-red-600 text-white" : "bg-white border border-stone-200 text-stone-600"}`}>
                        {p.soldOut ? "売り切れ中" : "売り切れに"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex gap-2 mt-3">
            <input type="text" value={newProdName} onChange={(e) => setNewProdName(e.target.value)} maxLength={15}
              placeholder="商品名(例: 焼きそば)" className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-stone-200 text-sm font-semibold bg-white outline-none focus:border-stone-900" />
            <input type="number" inputMode="numeric" value={newProdStock} onChange={(e) => setNewProdStock(e.target.value)} min={0} max={9999}
              className="w-16 px-2 py-2.5 rounded-xl border border-stone-200 text-sm font-bold bg-white outline-none focus:border-stone-900 text-center" aria-label="初期在庫" />
            <button onClick={addProduct} disabled={!newProdName.trim()}
              className="px-4 py-2.5 rounded-xl text-white text-sm font-black active:scale-95 disabled:opacity-40 flex-shrink-0"
              style={{ background: "linear-gradient(135deg,#ff4d8d,#9b5de5)" }}>追加</button>
          </div>
          <div className="text-[11px] text-stone-400 mt-2">在庫が0になると自動で「売り切れ」表示になります</div>
        </div>

        <button onClick={onOpenCalculator} className="w-full bg-white rounded-2xl p-4 flex items-center gap-3 border border-stone-200 hover:border-stone-300 active:scale-[0.99] transition-all">
          <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center"><Calculator size={20} className="text-red-600" strokeWidth={2.2} /></div>
          <div className="flex-1 text-left"><div className="font-bold text-stone-900">待ち時間 計算ガイド</div><div className="text-xs text-stone-500">迷ったらここから。順番に答えるだけ</div></div>
          <ChevronRight size={18} className="text-stone-300" />
        </button>

        <button onClick={onEdit} className="w-full mt-3 bg-white rounded-2xl p-4 flex items-center gap-3 border border-stone-200 hover:border-stone-300 active:scale-[0.99] transition-all">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center"><Settings size={20} className="text-indigo-600" strokeWidth={2.2} /></div>
          <div className="flex-1 text-left"><div className="font-bold text-stone-900">ブース情報を編集</div><div className="text-xs text-stone-500">名前・場所・運営団体・紹介文を変更</div></div>
          <ChevronRight size={18} className="text-stone-300" />
        </button>

        <div className="mt-5 bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
          <div className="flex items-start gap-2"><Zap size={16} className="text-emerald-700 mt-0.5 flex-shrink-0" strokeWidth={2.5} />
            <div className="flex-1"><div className="text-sm font-bold text-emerald-900">学習中: 1組あたり {formatCycle(learnedCycle)}</div>
              <div className="text-xs text-emerald-700 mt-0.5">{booth.cycleHistory.length > 0 ? `直近${booth.cycleHistory.length}回の実測平均から算出` : "「ご案内しました」を押すと自動学習が始まります"}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ═══════════ STAFF: WAIT-TIME CALCULATOR ═══════════ */

const PeopleVisualizer = ({ count }: { count: number }) => {
  const shown = Math.min(count, 30); const extra = count - shown;
  if (count === 0) return <div className="mt-3 text-center text-xs text-stone-400 py-3 bg-stone-50 rounded-xl">列に誰もいません</div>;
  return (
    <div className="mt-3 p-3 bg-stone-50 rounded-xl">
      <div className="flex flex-wrap gap-0.5 leading-none">
        {Array.from({ length: shown }).map((_, i) => <span key={i} className="text-sm">🧍</span>)}
        {extra > 0 && <span className="text-xs font-bold text-stone-600 self-center ml-1.5">+{extra}人</span>}
      </div>
    </div>
  );
};

const CalcSection = ({ step, title, hint, icon: Icon, children }: { step: number; title: string; hint: string; icon: LucideIcon; children: ReactNode }) => (
  <div className="mb-5 bg-white rounded-2xl p-5 border border-stone-200">
    <div className="flex items-start gap-2 mb-3">
      <div className="w-7 h-7 rounded-full bg-stone-900 text-white flex items-center justify-center font-black text-xs flex-shrink-0">{step}</div>
      <div className="flex-1 min-w-0"><div className="flex items-center gap-1.5"><Icon size={14} className="text-stone-700" strokeWidth={2.5} /><h3 className="font-bold text-stone-900 text-sm">{title}</h3></div><p className="text-xs text-stone-500 mt-0.5 leading-relaxed">{hint}</p></div>
    </div>
    {children}
  </div>
);

export const CalculatorSheet = ({ booth, onClose, onApply }: { booth: Booth; onClose: () => void; onApply: (u: Partial<Booth>) => void }) => {
  const learnedCycle = avgCycle(booth.cycleHistory, booth.cycleSeconds);
  const [people, setPeople] = useState(booth.peopleInLine);
  const [cycleSec, setCycleSec] = useState(learnedCycle);
  const [capacity, setCapacity] = useState(booth.capacity);
  const result = calcWait(people, capacity, cycleSec);
  const status = getStatus(result, true);

  return (
    <Sheet onClose={onClose} title="待ち時間を計算">
      <div className="px-5 pb-6 pt-1">
        <CalcSection step={1} title="列に並んでいる人数" hint="列の最後尾から数えた人数。だいたいでOK" icon={Users}>
          <NumberStepper value={people} onChange={setPeople} min={0} max={500} step={1} unit="人" />
          <div className="grid grid-cols-5 gap-1.5 mt-3">{[0, 5, 10, 20, 50].map((n) => <QuickPick key={n} active={people === n} onClick={() => setPeople(n)}>{n}</QuickPick>)}</div>
          <PeopleVisualizer count={people} />
        </CalcSection>
        <CalcSection step={2} title="1回(1組)のご案内にかかる時間" hint="お客様1組を最初から最後まで案内する時間" icon={Clock}>
          <NumberStepper value={cycleSec} onChange={setCycleSec} min={15} max={3600} step={cycleSec < 120 ? 15 : cycleSec < 600 ? 30 : 60} unit="秒" display={formatCycle(cycleSec)} />
          <div className="grid grid-cols-4 gap-1.5 mt-3">
            {[{ l: "30秒", v: 30 }, { l: "1分", v: 60 }, { l: "3分", v: 180 }, { l: "5分", v: 300 }, { l: "10分", v: 600 }, { l: "15分", v: 900 }, { l: "20分", v: 1200 }, { l: "30分", v: 1800 }].map((p) => <QuickPick key={p.v} active={cycleSec === p.v} onClick={() => setCycleSec(p.v)}>{p.l}</QuickPick>)}
          </div>
          {booth.cycleHistory.length > 0 && (
            <button onClick={() => setCycleSec(learnedCycle)} className="mt-3 w-full py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-700 flex items-center justify-center gap-1.5"><Zap size={12} strokeWidth={2.5} /> 実測値を使う ({formatCycle(learnedCycle)})</button>
          )}
        </CalcSection>
        <CalcSection step={3} title="1回に何人(何組)ご案内できる?" hint="同時に体験できる人数" icon={Sparkles}>
          <NumberStepper value={capacity} onChange={setCapacity} min={1} max={200} step={1} unit="人/回" />
          <div className="grid grid-cols-5 gap-1.5 mt-3">{[1, 2, 4, 6, 10].map((n) => <QuickPick key={n} active={capacity === n} onClick={() => setCapacity(n)}>{n}</QuickPick>)}</div>
        </CalcSection>

        <div className="sticky bottom-0 -mx-5 px-5 pt-2 pb-4 bg-gradient-to-t from-stone-50 via-stone-50 to-transparent">
          <div className="rounded-3xl p-5 mb-3" style={{ backgroundColor: status.soft, border: `1.5px solid ${status.ring}` }}>
            <div className="flex items-center justify-between mb-2"><div className="text-xs font-bold text-stone-700">📊 計算結果</div><span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full border bg-white" style={{ color: status.color, borderColor: status.ring }}>{status.label}</span></div>
            <div className="flex items-baseline gap-1.5"><span className="text-6xl font-black tracking-tight tabular-nums" style={{ color: status.color, letterSpacing: "-0.04em", lineHeight: 1 }}>{result}</span><span className="text-xl font-bold" style={{ color: status.color }}>分待ち</span></div>
            <div className="mt-3 text-xs text-stone-700 font-mono">{people}人 ÷ {capacity}人/回 × {formatCycle(cycleSec)} ≈ <strong>{result}分</strong></div>
          </div>
          <button onClick={() => onApply({ peopleInLine: people, capacity, cycleSeconds: cycleSec, waitMinutes: result })} className="w-full bg-stone-900 text-white rounded-2xl py-4 font-bold flex items-center justify-center gap-2 active:scale-[0.98]"><Check size={20} strokeWidth={2.5} /> この時間で更新する</button>
        </div>
      </div>
    </Sheet>
  );
};

/* ═══════════ SETTINGS ═══════════ */

export const SettingsSheet = ({ role, booths, emergencyNotice, busy, onClose, onSavePin, onSaveEmergency, onExport, onImport, onResetSeed, onSaveSnapshot, onOpenSnapshots, showToast }: {
  role: StaffRole;
  booths: Booth[];
  emergencyNotice: string;
  busy: boolean;
  onClose: () => void;
  onSavePin: (target: StaffRole, pin: string) => void;
  onSaveEmergency: (notice: string) => void;
  onExport: () => void;
  onImport: (data: unknown) => void;
  onResetSeed: () => void;
  onSaveSnapshot: () => void;
  onOpenSnapshots: () => void;
  showToast: (message: string, type?: "success" | "error" | "info" | "warn") => void;
}) => {
  const [staffPin, setStaffPin] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [notice, setNotice] = useState(emergencyNotice);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const isAdmin = role === "admin";

  const handleImportFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as { booths?: unknown };
        if (!data.booths || !Array.isArray(data.booths)) throw new Error("invalid");
        onImport(data);
      } catch { showToast("ファイルを読み込めませんでした", "error"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <Sheet onClose={onClose} title="設定">
      <div className="px-5 pb-8 pt-2 space-y-5">
        {/* 全体お知らせ(管理者) */}
        {isAdmin && (
          <div className="bg-white rounded-2xl p-5 border border-stone-200">
            <div className="flex items-center gap-2 mb-3"><Megaphone size={16} className="text-stone-700" strokeWidth={2.2} /><div className="font-bold text-stone-900">全体へのお知らせ</div></div>
            <p className="text-xs text-stone-500 mb-3 leading-relaxed">中止・会場変更・入場制限など、全員の画面の最上部に表示する内容だけを書いてください。解除するには空にして公開します。</p>
            <textarea value={notice} maxLength={180} rows={3} onChange={(e) => setNotice(e.target.value)}
              placeholder="例: 雷雨のため、屋外企画を一時中止しています。"
              className="w-full px-4 py-3 rounded-xl border border-stone-200 text-sm bg-white outline-none focus:border-stone-900 resize-none leading-relaxed" />
            <div className="text-[11px] text-stone-400 text-right mt-1">{notice.length}/180</div>
            <button onClick={() => onSaveEmergency(notice.trim())} disabled={busy || notice.trim() === emergencyNotice}
              className="w-full mt-2 py-3 rounded-xl bg-stone-900 text-white font-bold text-sm active:scale-95 disabled:opacity-40">{notice.trim() ? "お知らせを公開" : "お知らせを解除"}</button>
          </div>
        )}

        {/* PIN */}
        {isAdmin ? (
          <div className="bg-white rounded-2xl p-5 border border-stone-200">
            <div className="flex items-center gap-2 mb-3"><Lock size={16} className="text-stone-700" strokeWidth={2.2} /><div className="font-bold text-stone-900">PINの変更</div></div>
            <p className="text-xs text-stone-500 mb-3 leading-relaxed">本番前に必ず両方変更してください。更新用PINは各ブース班長へ、管理者PINは実行委員の数名だけに共有します(4〜8桁)。</p>
            <div className="space-y-3">
              <div>
                <div className="text-xs font-bold text-stone-600 mb-1">更新用PIN(スタッフ)</div>
                <div className="flex gap-2">
                  <input type="password" inputMode="numeric" maxLength={8} value={staffPin} autoComplete="off"
                    onChange={(e) => setStaffPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    className="flex-1 px-4 py-3 rounded-xl border border-stone-200 text-xl font-black tabular-nums text-center bg-white outline-none focus:border-stone-900 tracking-[0.2em]" placeholder="新しいPIN" />
                  <button onClick={() => { if (/^\d{4,8}$/.test(staffPin)) { onSavePin("staff", staffPin); setStaffPin(""); } else showToast("PINは4〜8桁で入力してください", "error"); }}
                    disabled={busy || staffPin.length < 4}
                    className="px-4 rounded-xl bg-stone-900 text-white font-bold text-sm active:scale-95 disabled:opacity-40">変更</button>
                </div>
              </div>
              <div>
                <div className="text-xs font-bold text-stone-600 mb-1">管理者PIN</div>
                <div className="flex gap-2">
                  <input type="password" inputMode="numeric" maxLength={8} value={adminPin} autoComplete="off"
                    onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    className="flex-1 px-4 py-3 rounded-xl border border-stone-200 text-xl font-black tabular-nums text-center bg-white outline-none focus:border-stone-900 tracking-[0.2em]" placeholder="新しいPIN" />
                  <button onClick={() => { if (/^\d{4,8}$/.test(adminPin)) { onSavePin("admin", adminPin); setAdminPin(""); } else showToast("PINは4〜8桁で入力してください", "error"); }}
                    disabled={busy || adminPin.length < 4}
                    className="px-4 rounded-xl bg-stone-900 text-white font-bold text-sm active:scale-95 disabled:opacity-40">変更</button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-5 border border-stone-200">
            <div className="flex items-center gap-2 mb-2"><Lock size={16} className="text-stone-700" strokeWidth={2.2} /><div className="font-bold text-stone-900">権限について</div></div>
            <p className="text-xs text-stone-500 leading-relaxed">PIN変更・全体お知らせ・バックアップの復元は、<strong className="font-bold">管理者PIN</strong>でログインした端末だけが操作できます。必要な場合は実行委員(運営本部)へ連絡してください。</p>
          </div>
        )}

        {/* Backup */}
        <div className="bg-white rounded-2xl p-5 border border-stone-200">
          <div className="flex items-center gap-2 mb-3"><Download size={16} className="text-stone-700" strokeWidth={2.2} /><div className="font-bold text-stone-900">バックアップ</div></div>
          <p className="text-xs text-stone-500 mb-3 leading-relaxed">全ブースとステージの設定をファイルに保存・復元できます。当日のトラブルや来年への引き継ぎに使えます。</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onExport} className="py-3 rounded-xl border border-stone-200 bg-white text-stone-900 font-bold text-sm active:scale-95 flex items-center justify-center gap-1.5"><Download size={15} strokeWidth={2.4} /> 書き出す</button>
            <button onClick={() => { if (isAdmin) fileRef.current?.click(); else showToast("読み込みは管理者PINが必要です", "error"); }} className="py-3 rounded-xl border border-stone-200 bg-white text-stone-900 font-bold text-sm active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-40"><Upload size={15} strokeWidth={2.4} /> 読み込む</button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={handleImportFile} className="hidden" />
          {isAdmin && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button onClick={onSaveSnapshot} disabled={busy} className="py-3 rounded-xl border border-stone-200 bg-white text-stone-900 font-bold text-sm active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-40">🗄️ サーバーへ保存</button>
              <button onClick={onOpenSnapshots} className="py-3 rounded-xl border border-stone-200 bg-white text-stone-900 font-bold text-sm active:scale-95 flex items-center justify-center gap-1.5">⏪ 保存履歴・復元</button>
            </div>
          )}
          <div className="text-[11px] text-stone-400 mt-2">現在 {booths.length} ブースを登録中</div>
        </div>

        {/* Reset to sample */}
        {isAdmin && (
          <div className="bg-white rounded-2xl p-5 border border-stone-200">
            <div className="flex items-center gap-2 mb-3"><RefreshCw size={16} className="text-stone-700" strokeWidth={2.2} /><div className="font-bold text-stone-900">サンプルに戻す</div></div>
            <p className="text-xs text-stone-500 mb-3 leading-relaxed">全ブースを削除し、サンプル6件で作り直します。練習用です。実行前にサーバーへ自動保存されます。</p>
            <button onClick={onResetSeed} className="w-full py-3 rounded-xl border border-red-200 bg-white text-red-600 font-bold text-sm active:scale-95">サンプルデータにリセット</button>
          </div>
        )}

        {/* Add to home screen */}
        <div className="bg-indigo-50 rounded-2xl p-5 border border-indigo-200">
          <div className="flex items-center gap-2 mb-2"><Smartphone size={16} className="text-indigo-600" strokeWidth={2.2} /><div className="font-bold text-indigo-900">ホーム画面に追加</div></div>
          <p className="text-xs text-indigo-900 leading-relaxed">iPhone(Safari): 共有ボタン → ホーム画面に追加<br />Android(Chrome): メニュー → ホーム画面に追加</p>
        </div>

        <div className="text-center text-[11px] text-stone-400">{APP_NAME} v6 · {backendConfigured ? "同期: 共有APIに接続" : "同期: デモ(この端末のみ)"}</div>
      </div>
    </Sheet>
  );
};

/* ═══════════ SNAPSHOTS ═══════════ */

export const SnapshotSheet = ({ snapshots, busy, onRestore, onClose }: { snapshots: SnapshotMeta[]; busy: boolean; onRestore: (s: SnapshotMeta) => void; onClose: () => void }) => (
  <Sheet onClose={onClose} title="サーバー保存の履歴">
    <div className="px-5 pb-8 pt-2 space-y-2">
      {snapshots.map((snapshot) => (
        <div key={snapshot.id} className="flex items-center justify-between gap-3 p-3.5 bg-white rounded-2xl border border-stone-200">
          <div className="min-w-0">
            <div className="font-bold text-stone-900 text-sm">{new Date(snapshot.createdAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
            <div className="text-xs text-stone-500 truncate">{snapshot.label || "自動保存"} · ブース{snapshot.boothCount}件 / 公演{snapshot.eventCount}件</div>
          </div>
          <button onClick={() => onRestore(snapshot)} disabled={busy}
            className="flex-shrink-0 px-3 py-2 rounded-xl border border-stone-200 bg-white text-stone-900 font-bold text-xs active:scale-95 disabled:opacity-40">この時点へ復元</button>
        </div>
      ))}
      {snapshots.length === 0 && <div className="text-center text-sm text-stone-400 py-10">保存されたスナップショットはまだありません。<br />「サーバーへ保存」や入替前の自動保存で作成されます。</div>}
      <p className="text-[11px] text-stone-400 leading-relaxed pt-2">復元は全ブース・ステージの置き換えで行われ、実行直前の状態も自動でサーバーに保存されます。</p>
    </div>
  </Sheet>
);
