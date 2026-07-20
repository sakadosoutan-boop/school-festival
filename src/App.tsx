import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, HelpCircle, Map as MapIcon, Megaphone, Music, RefreshCw, ShieldCheck, Star, WifiOff } from "lucide-react";
import {
  avgCycle, calcWait, CATEGORIES, formatTime, HEARTBEAT_MS, makeBooth, REFRESH_MS, sanitizeStage, seedBooths, seedStage,
  STALE_MINUTES, THEME, VOTE_FORM_URL,
} from "./lib/festival";
import {
  apiConfigError, backendConfigured, cachedData, changePin, createSnapshot, deleteBooth as apiDeleteBooth, fetchAll,
  flushPending, hasCachedData, listSnapshots, pendingWrites, replaceAll, restoreSnapshot, saveBooth,
  saveStage as apiSaveStage, updateSettings, verifyPin,
} from "./lib/api";
import { normalizeForSearch } from "./lib/text";
import type { Booth, FestivalSettings, SnapshotMeta, StaffRole, StageProgram } from "./types";
import { EmptyState, Spinner, StatCard, TabButton, Toast, Confirm, useDragScroll } from "./components/ui";
import type { ToastType } from "./components/ui";
import { BoothCard, BoothDetailSheet, HelpSheet, Onboarding } from "./components/guest";
import { InstallAppCard, InstallInstructionsSheet } from "./components/install";
import { CalculatorSheet, EditBoothSheet, SettingsSheet, SnapshotSheet, StaffBoothPanel, StaffBoothSelector, StaffLogin } from "./components/staff";
import { StageEditor, StageView } from "./components/stage";
import { MapView } from "./components/map";
import logoSrc from "./assets/logo.png";
import { usePwaInstall } from "./lib/pwa";

const LOCAL_KEY = "machitime:v6:local";
const SESSION_PIN_KEY = "machitime:v6:staff-pin";
const SESSION_ROLE_KEY = "machitime:v6:staff-role";

interface LocalPrefs { favorites: string[]; onboarded: boolean }

function readLocal(): LocalPrefs {
  try {
    const value = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "null") as LocalPrefs | null;
    return { favorites: Array.isArray(value?.favorites) ? value.favorites : [], onboarded: !!value?.onboarded };
  } catch {
    return { favorites: [], onboarded: false };
  }
}

function AppInner(): React.JSX.Element {
  const initial = useMemo(() => cachedData(), []);
  const [booths, setBooths] = useState<Booth[]>(initial.booths);
  const [stage, setStage] = useState<StageProgram>(initial.stage);
  const [settings, setSettings] = useState<FestivalSettings>(initial.settings);
  const [fetchedAt, setFetchedAt] = useState<number>(initial.fetchedAt);
  const [loading, setLoading] = useState(() => backendConfigured && !hasCachedData());
  const [offline, setOffline] = useState(!navigator.onLine);

  const [prefs] = useState(readLocal);
  const [favorites, setFavorites] = useState<string[]>(prefs.favorites);
  const [onboarded, setOnboarded] = useState(prefs.onboarded);

  const [view, setView] = useState<"home" | "stage" | "map" | "staff">("home");
  const categoryPan = useDragScroll<HTMLDivElement>();
  const [category, setCategory] = useState("all");
  const [sortBy, setSortBy] = useState("default");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [staffPin, setStaffPin] = useState(() => sessionStorage.getItem(SESSION_PIN_KEY) ?? "");
  const [staffRole, setStaffRole] = useState<StaffRole | null>(() => {
    const stored = sessionStorage.getItem(SESSION_ROLE_KEY);
    return stored === "admin" || stored === "staff" ? stored : null;
  });
  const staffAuthed = Boolean(staffPin && staffRole);
  const [staffBoothId, setStaffBoothId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [staffStageOpen, setStaffStageOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotMeta[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingCount, setPendingCount] = useState(() => pendingWrites().length);

  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [tick, setTick] = useState(0);
  const { platform: installPlatform, installed: appInstalled, promptAvailable, shouldShow: showInstall, requestInstall } = usePwaInstall();

  const toastTimer = useRef<number | null>(null);
  const showToast = useCallback((message: string, type: ToastType = "success") => {
    setToast({ message, type });
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2500);
  }, []);

  const handleInstall = useCallback(async () => {
    try {
      const result = await requestInstall();
      if (result === "manual") setInstallHelpOpen(true);
      else if (result === "accepted") showToast("ホーム画面への追加を開始しました");
      else if (result === "installed") showToast("すでにホーム画面から利用できます", "info");
      else showToast("ブラウザのメニューからいつでも追加できます", "info");
    } catch {
      setInstallHelpOpen(true);
    }
  }, [requestInstall, showToast]);

  /* ── 同期。編集中のブースはリモートで上書きしない(v4の防衝突設計) ── */
  const protectedRef = useRef<string | null>(null);
  useEffect(() => {
    protectedRef.current = (view === "staff" && (staffBoothId || editingId)) ? (staffBoothId || editingId) : null;
  }, [view, staffBoothId, editingId]);

  const stageEditingRef = useRef(false);
  useEffect(() => { stageEditingRef.current = staffStageOpen; }, [staffStageOpen]);

  const versionRef = useRef<string | undefined>(initial.version || undefined);
  const inFlightRef = useRef(false);

  const mergeBooths = useCallback((prev: Booth[], remote: Booth[]): Booth[] => {
    const protectedId = protectedRef.current;
    const now = Date.now();
    const pendingIds = new Set(pendingWrites().map((p) => p.boothId));
    const byId = new Map(remote.map((b) => [b.id, b]));
    const merged = remote.map((r) => {
      const local = prev.find((b) => b.id === r.id);
      if (!local) return r;
      if (local.id === protectedId) return local;
      return (local.rev || 0) > (r.rev || 0) || (local.lastUpdated || 0) > (r.lastUpdated || 0) ? local : r;
    });
    // 直前に作成したばかり・保留送信中・編集中のローカル限定ブースは消さない
    const localOnly = prev.filter((b) => !byId.has(b.id) && ((b.lastUpdated || 0) > now - 15_000 || b.id === protectedId || pendingIds.has(b.id)));
    return [...merged, ...localOnly];
  }, []);

  const refresh = useCallback(async (silent = true): Promise<boolean> => {
    if (inFlightRef.current) return true;
    inFlightRef.current = true;
    try {
      const result = await fetchAll(versionRef.current);
      if (result.ok && result.notModified) {
        setFetchedAt(Date.now());
        setOffline(false);
        if (!silent) showToast("表示は最新の状態です", "info");
        return true;
      }
      if (result.ok && result.data) {
        const data = result.data;
        versionRef.current = data.version;
        setBooths((prev) => mergeBooths(prev, data.booths));
        setStage((prev) => {
          if (stageEditingRef.current) return prev;
          if ((prev.rev || 0) >= (data.stage.rev || 0) && (prev.lastUpdated || 0) >= (data.stage.lastUpdated || 0)) return prev;
          return data.stage;
        });
        setSettings(data.settings);
        setFetchedAt(Date.now());
        setOffline(false);
        if (!silent) showToast("最新情報を取得しました", "info");
        return true;
      }
      setOffline(true);
      if (!silent) showToast("通信できません。保存済みの情報を表示しています", "warn");
      return false;
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [mergeBooths, showToast]);

  // ポーリング: デモは8秒固定。共有APIはスタッフ12秒/来場者25秒＋ゆらぎ、失敗時は間隔延長、
  // 非表示タブは停止して復帰時に即時更新(数百台が一斉に叩いて飽和しないための設計)。
  useEffect(() => {
    let cancelled = false;
    let paused = false;
    let timer: number | null = null;
    const schedule = (ok: boolean) => {
      if (cancelled) return;
      const base = !backendConfigured ? REFRESH_MS : staffAuthed ? 12_000 : 25_000;
      const delay = (ok ? base : Math.min(base * 3, 75_000)) * (0.85 + Math.random() * 0.3);
      timer = window.setTimeout(() => void run(), delay);
    };
    const run = async () => {
      if (cancelled) return;
      if (document.hidden) { paused = true; return; }
      setTick((t) => t + 1);
      const ok = await refresh(true);
      schedule(ok);
    };
    const onVisibility = () => {
      if (!document.hidden && paused && !cancelled) {
        paused = false;
        void run();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    void run();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh, staffAuthed]);

  // 相対時刻・鮮度表示を進める
  useEffect(() => { const t = window.setInterval(() => setTick((x) => x + 1), 20_000); return () => window.clearInterval(t); }, []);

  /* ── オンライン復帰時: 保留分を再送してから再取得 ── */
  const flushQueued = useCallback(async (pin: string) => {
    if (pendingWrites().length === 0) return;
    const result = await flushPending(pin);
    setPendingCount(pendingWrites().length);
    if (result.completed > 0) showToast(`保留していた${result.completed}件を送信しました`);
  }, [showToast]);

  useEffect(() => {
    const online = () => {
      void (async () => {
        setOffline(false);
        if (staffPin) await flushQueued(staffPin);
        await refresh(true);
      })();
    };
    const offlineHandler = () => setOffline(true);
    window.addEventListener("online", online);
    window.addEventListener("offline", offlineHandler);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offlineHandler);
    };
  }, [flushQueued, refresh, staffPin]);

  /* ── 起動時の再認証。ネットワーク不通の間は前回ログインを維持する
        (書込はサーバー側で必ずPINを再検証するため安全)。 ── */
  useEffect(() => {
    if (!staffPin) return;
    void verifyPin(staffPin).then(async (result) => {
      if (result.ok && result.data?.valid) {
        const role = result.data.role ?? "staff";
        setStaffRole(role);
        sessionStorage.setItem(SESSION_ROLE_KEY, role);
        if (navigator.onLine) await flushQueued(staffPin);
      } else if (result.ok) {
        sessionStorage.removeItem(SESSION_PIN_KEY);
        sessionStorage.removeItem(SESSION_ROLE_KEY);
        setStaffPin("");
        setStaffRole(null);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── ハートビート: スタッフがブースを開いている間は生存を知らせ続ける ── */
  useEffect(() => {
    if (!staffAuthed || !staffBoothId || !navigator.onLine) return;
    const hb = window.setInterval(() => {
      setBooths((prev) => prev.map((b) => {
        if (b.id !== staffBoothId) return b;
        const beat = { ...b, lastUpdated: Date.now(), rev: (b.rev || 0) + 1 };
        void saveBooth(staffPin, beat);
        return beat;
      }));
    }, HEARTBEAT_MS);
    return () => window.clearInterval(hb);
  }, [staffAuthed, staffBoothId, staffPin]);

  /* ── ローカル設定の永続化 ── */
  useEffect(() => {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ favorites, onboarded })); } catch { /* private mode */ }
  }, [favorites, onboarded]);

  /* ── ブース書込: ローカル即時反映 + リモートへ送信(通信断は自動保留) ── */
  const queueToastAt = useRef(0);
  const persistBooth = useCallback((next: Booth, rollback?: Booth) => {
    void saveBooth(staffPin, next).then((result) => {
      setPendingCount(pendingWrites().length);
      if (result.queued && Date.now() - queueToastAt.current > 8_000) {
        queueToastAt.current = Date.now();
        showToast("通信が不安定です。更新は保留し、回復後に自動送信します", "warn");
      } else if (!result.ok && result.code === "CONFLICT") {
        // サーバーの現在値へ同期し、古い端末の表示のまま操作を続けさせない
        if (result.current && typeof result.current === "object") {
          const server = makeBooth(result.current, (result.current as Booth).id);
          setBooths((prev) => prev.map((b) => (b.id === server.id ? server : b)));
        }
        showToast("別の端末で先に更新されました。最新の値を表示しています", "warn");
      } else if (!result.ok && result.code !== "NETWORK") {
        // 保存に失敗したのに画面だけ変わったままだと「押したのに反映されない」
        // 事故になる。元の値へ戻して、失敗を確実に見せる。
        if (rollback) {
          setBooths((prev) => prev.map((b) => (b.id === rollback.id ? rollback : b)));
        }
        showToast(`保存できませんでした：${result.error ?? "サーバーエラー"}`, "error");
      }
    });
  }, [showToast, staffPin]);

  const updateBooth = useCallback((id: string, updates: Partial<Booth>) => {
    setBooths((prev) => {
      const cur = prev.find((b) => b.id === id);
      if (!cur) return prev;
      const nextWait = "waitMinutes" in updates ? (updates.waitMinutes ?? cur.waitMinutes) : cur.waitMinutes;
      const record = nextWait !== cur.waitMinutes || updates.isOpen !== undefined;
      const history = record ? [...(cur.history || []), { ts: Date.now(), wait: nextWait }].slice(-30) : cur.history;
      const next: Booth = { ...cur, ...updates, history, lastUpdated: Date.now(), rev: (cur.rev || 0) + 1 };
      persistBooth(next, cur);
      return prev.map((b) => b.id === id ? next : b);
    });
  }, [persistBooth]);

  // 開会・閉会のタイミングで、管理者が全ブースの営業状態をまとめて切り替える
  const bulkOpen = useCallback((open: boolean) => {
    const targets = booths.filter((b) => b.isOpen !== open);
    if (targets.length === 0) {
      showToast(open ? "すべて営業中になっています" : "すべて準備中になっています", "info");
      return;
    }
    targets.forEach((b) => updateBooth(b.id, { isOpen: open }));
    showToast(open ? `${targets.length}ブースを営業中にしました` : `${targets.length}ブースを準備中にしました`);
  }, [booths, showToast, updateBooth]);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }, []);

  /* ── 作成・編集・削除 ── */
  const handleSaveBooth = useCallback((data: Booth) => {
    if (creating) {
      const nb = makeBooth(data, data.id);
      nb.rev = 1;
      setBooths((prev) => [...prev, nb]);
      persistBooth(nb);
      showToast(`「${nb.name}」を追加しました`);
      setCreating(false);
    } else {
      const next = makeBooth({ ...data, lastUpdated: Date.now(), rev: (data.rev || 0) + 1 }, data.id);
      next.waitMinutes = calcWait(next.peopleInLine, next.capacity, avgCycle(next.cycleHistory, next.cycleSeconds));
      setBooths((prev) => prev.map((b) => b.id === next.id ? next : b));
      persistBooth(next);
      showToast("ブース情報を更新しました");
    }
    setEditingId(null);
  }, [creating, persistBooth, showToast]);

  const handleDeleteBooth = useCallback(async (id: string) => {
    const target = booths.find((b) => b.id === id);
    setBooths((prev) => prev.filter((b) => b.id !== id));
    if (staffBoothId === id) setStaffBoothId(null);
    setFavorites((prev) => prev.filter((x) => x !== id));
    setEditingId(null);
    const result = await apiDeleteBooth(staffPin, id);
    if (!result.ok && result.code === "NETWORK") showToast("通信できないため、削除は反映されていない可能性があります", "warn");
    else showToast(`「${target?.name || "ブース"}」を削除しました`, "info");
  }, [booths, showToast, staffBoothId, staffPin]);

  /* ── ステージ保存 ── */
  const handleSaveStage = useCallback((next: StageProgram) => {
    const stamped = { ...next, rev: (next.rev || 0) + 1, lastUpdated: Date.now() };
    setStage(stamped);
    void apiSaveStage(staffPin, stamped).then((result) => {
      if (result.ok && result.data) {
        // サーバーが確定したrevを取り込む(次の保存が競合扱いにならないように)
        setStage(sanitizeStage(result.data));
      } else if (result.code === "CONFLICT") {
        if (result.current && typeof result.current === "object") setStage(sanitizeStage(result.current));
        showToast("別の端末で先にステージが更新されました。最新を読み込みました。もう一度保存してください", "warn");
      } else if (result.code === "NETWORK") {
        showToast("通信できません。ステージの変更は再接続後にもう一度保存してください", "warn");
      } else if (!result.ok) {
        showToast(result.error ?? "ステージを保存できませんでした", "error");
      }
    });
  }, [showToast, staffPin]);

  /* ── ログイン/ログアウト ── */
  const handleLogin = useCallback(async (pin: string): Promise<boolean> => {
    setBusy(true);
    const result = await verifyPin(pin);
    setBusy(false);
    if (!result.ok) {
      showToast(result.error ?? "通信できません。電波の良い場所で再試行してください", "error");
      return false;
    }
    if (!result.data?.valid) return false;
    const role = result.data.role ?? "staff";
    setStaffPin(pin);
    setStaffRole(role);
    sessionStorage.setItem(SESSION_PIN_KEY, pin);
    sessionStorage.setItem(SESSION_ROLE_KEY, role);
    showToast(role === "admin" ? "管理者としてログインしました" : "スタッフモードへようこそ");
    if (navigator.onLine) void flushQueued(pin);
    return true;
  }, [flushQueued, showToast]);

  const handleLogout = useCallback(() => {
    if (pendingCount > 0 && !window.confirm(`未送信の更新が${pendingCount}件この端末に残っています。ログアウトしますか？(次回ログイン時に再送されます)`)) return;
    sessionStorage.removeItem(SESSION_PIN_KEY);
    sessionStorage.removeItem(SESSION_ROLE_KEY);
    setStaffPin("");
    setStaffRole(null);
    setStaffBoothId(null);
    setStaffStageOpen(false);
    setView("home");
    showToast("ログアウトしました", "info");
  }, [pendingCount, showToast]);

  /* ── 設定操作 ── */
  const savePin = useCallback(async (target: StaffRole, pin: string) => {
    setBusy(true);
    const result = await changePin(staffPin, target, pin);
    setBusy(false);
    if (!result.ok) { showToast(result.error ?? "PINを変更できませんでした", "error"); return; }
    if (target === "admin") {
      // 管理者は自分のPINでログインしているため、セッションも新PINへ切り替える
      setStaffPin(pin);
      sessionStorage.setItem(SESSION_PIN_KEY, pin);
    }
    showToast(target === "admin" ? "管理者PINを変更しました" : "更新用PINを変更しました");
  }, [showToast, staffPin]);

  const saveEmergency = useCallback(async (notice: string) => {
    setBusy(true);
    const result = await updateSettings(staffPin, { emergencyNotice: notice });
    setBusy(false);
    if (!result.ok || !result.data) { showToast(result.error ?? "お知らせを更新できませんでした", "error"); return; }
    setSettings(result.data);
    showToast(notice ? "全体お知らせを公開しました" : "全体お知らせを解除しました");
  }, [showToast, staffPin]);

  const exportData = useCallback(() => {
    // PINはバックアップに含めない(ファイル共有経由の漏えい防止)
    const payload = { app: "まちたいむ", version: 6, exportedAt: new Date().toISOString(), booths, stage };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `festival-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
    showToast("バックアップを書き出しました");
  }, [booths, stage, showToast]);

  const importData = useCallback(async (raw: unknown) => {
    const data = raw as { booths?: unknown[]; stage?: unknown };
    const imported = (data.booths || []).map((b) => makeBooth(b, (b as Booth).id));
    setBusy(true);
    const result = await replaceAll(staffPin, imported, data.stage ? (data.stage as StageProgram) : undefined);
    setBusy(false);
    if (!result.ok || !result.data) { showToast(result.error ?? "読み込みに失敗しました", "error"); return; }
    setBooths(result.data.booths);
    setStage(result.data.stage);
    versionRef.current = result.data.version;
    setSettingsOpen(false);
    showToast(`${result.data.booths.length}ブースを読み込みました`);
  }, [showToast, staffPin]);

  const resetSeed = useCallback(async () => {
    setConfirmReset(false);
    setBusy(true);
    const result = await replaceAll(staffPin, seedBooths(), seedStage());
    setBusy(false);
    if (!result.ok || !result.data) { showToast(result.error ?? "リセットに失敗しました", "error"); return; }
    setBooths(result.data.booths);
    setStage(result.data.stage);
    versionRef.current = result.data.version;
    setSettingsOpen(false);
    setStaffBoothId(null);
    showToast("初期データにリセットしました", "info");
  }, [showToast, staffPin]);

  /* ── スナップショット ── */
  const handleSaveSnapshot = useCallback(async () => {
    setBusy(true);
    const result = await createSnapshot(staffPin, "手動保存");
    setBusy(false);
    if (!result.ok) { showToast(result.error ?? "サーバーへ保存できませんでした", "error"); return; }
    showToast("現在のデータをサーバーへ保存しました");
  }, [showToast, staffPin]);

  const handleOpenSnapshots = useCallback(async () => {
    setSnapshots([]);
    const result = await listSnapshots(staffPin);
    if (!result.ok || !result.data) {
      setSnapshots(null);
      showToast(result.error ?? "履歴を取得できませんでした", "error");
      return;
    }
    setSnapshots(result.data);
  }, [showToast, staffPin]);

  const handleRestore = useCallback(async (snapshot: SnapshotMeta) => {
    const stamp = new Date(snapshot.createdAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    if (!window.confirm(`${stamp} 時点(ブース${snapshot.boothCount}件)へ全体を戻します。現在の状態は復元前に自動保存されます。よろしいですか？`)) return;
    setBusy(true);
    const result = await restoreSnapshot(staffPin, snapshot.id);
    setBusy(false);
    if (!result.ok || !result.data) { showToast(result.error ?? "復元に失敗しました", "error"); return; }
    setBooths(result.data.booths);
    setStage(result.data.stage);
    versionRef.current = result.data.version;
    setSnapshots(null);
    showToast("スナップショットから復元しました");
  }, [showToast, staffPin]);

  /* ── 派生 ── */
  const filtered = useMemo(() => {
    let list = booths;
    if (category !== "all") list = list.filter((b) => b.category === category);
    const normalized = normalizeForSearch(query);
    if (normalized) {
      list = list.filter((b) => [b.name, b.orgName, b.organizer, b.room, b.description, `${b.grade}年${b.classNum}組`]
        .some((value) => normalizeForSearch(String(value ?? "")).includes(normalized)));
    }
    if (sortBy === "wait_asc") list = [...list].sort((a, b) => (!a.isOpen && b.isOpen ? 1 : a.isOpen && !b.isOpen ? -1 : a.waitMinutes - b.waitMinutes));
    else if (sortBy === "wait_desc") list = [...list].sort((a, b) => b.waitMinutes - a.waitMinutes);
    else if (sortBy === "favorites") list = list.filter((b) => favorites.includes(b.id));
    return list;
  }, [booths, category, favorites, query, sortBy]);

  const openBooths = booths.filter((b) => b.isOpen);
  const avgWait = openBooths.length === 0 ? 0 : Math.round(openBooths.reduce((s, b) => s + b.waitMinutes, 0) / openBooths.length);
  const staffBooth = booths.find((b) => b.id === staffBoothId);
  const selectedBooth = booths.find((b) => b.id === selectedId);
  void tick; // 20秒ごとの再レンダリングで相対時刻・進行状況を進める

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-stone-50"><Spinner /></div>;
  if (!onboarded) return <Onboarding onDone={() => setOnboarded(true)} />;

  return (
    <div className="min-h-screen pb-24" style={{ background: "linear-gradient(180deg,#fff7ed 0%,#fef0f5 100%)", fontFamily: '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* Sheets */}
      {selectedBooth && <BoothDetailSheet booth={selectedBooth} onClose={() => setSelectedId(null)} isFavorite={favorites.includes(selectedBooth.id)} onToggleFavorite={toggleFavorite} />}
      {calcOpen && staffBooth && <CalculatorSheet booth={staffBooth} onClose={() => setCalcOpen(false)} onApply={(u) => { updateBooth(staffBooth.id, u); setCalcOpen(false); showToast(`待ち時間を ${u.waitMinutes}分 に更新しました`); }} />}
      {(editingId || creating) && <EditBoothSheet booth={creating ? null : booths.find((b) => b.id === editingId) ?? null} isNew={creating} onClose={() => { setEditingId(null); setCreating(false); }} onSave={handleSaveBooth} onDelete={() => { if (editingId) void handleDeleteBooth(editingId); }} />}
      {helpOpen && <HelpSheet onClose={() => setHelpOpen(false)} />}
      {installHelpOpen && <InstallInstructionsSheet platform={installPlatform} onClose={() => setInstallHelpOpen(false)} />}
      {settingsOpen && staffRole && (
        <SettingsSheet
          role={staffRole}
          booths={booths}
          emergencyNotice={settings.emergencyNotice}
          busy={busy}
          onClose={() => setSettingsOpen(false)}
          onSavePin={(target, pin) => void savePin(target, pin)}
          onSaveEmergency={(notice) => void saveEmergency(notice)}
          onExport={exportData}
          onImport={(data) => void importData(data)}
          onResetSeed={() => setConfirmReset(true)}
          onSaveSnapshot={() => void handleSaveSnapshot()}
          onOpenSnapshots={() => void handleOpenSnapshots()}
          onBulkOpen={bulkOpen}
          showToast={showToast}
        />
      )}
      {snapshots !== null && <SnapshotSheet snapshots={snapshots} busy={busy} onRestore={(s) => void handleRestore(s)} onClose={() => setSnapshots(null)} />}
      {confirmReset && <Confirm title="初期データに戻しますか?" message="現在の全ブース・ステージを削除し、やなぎ祭の初期データ(43団体)で作り直します。実行前の状態は自動保存されます。" confirmLabel="リセット" danger onConfirm={() => void resetSeed()} onCancel={() => setConfirmReset(false)} />}

      {/* HOME (guest) */}
      {view === "home" && (
        <>
          <header className="sticky top-0 z-30 overflow-hidden" style={{ background: THEME.festGradient }}>
            <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle, #fff 1.5px, transparent 1.5px)", backgroundSize: "20px 20px" }} />
            <div className="absolute top-3 right-24 text-lg anim-twinkle pointer-events-none" style={{ animationDelay: "0.2s" }}>⭐</div>
            <div className="absolute top-7 right-14 text-sm anim-twinkle pointer-events-none" style={{ animationDelay: "0.9s" }}>✨</div>
            <div className="absolute bottom-16 left-3 text-base anim-floaty pointer-events-none">🎈</div>
            <div className="relative max-w-xl mx-auto px-4 pt-4 pb-3">
              <div className="flex items-center justify-between mb-3">
                <img src={logoSrc} alt="まちたいむ" className="h-12 w-auto anim-bobble" style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.18))" }} />
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setHelpOpen(true)} aria-label="ヘルプ" className="w-10 h-10 rounded-full bg-white/25 hover:bg-white/40 backdrop-blur text-white flex items-center justify-center transition-all active:scale-95"><HelpCircle size={18} strokeWidth={2.2} /></button>
                  <button onClick={() => void refresh(false)} aria-label="更新" className="w-10 h-10 rounded-full bg-white/25 hover:bg-white/40 backdrop-blur text-white flex items-center justify-center transition-all active:scale-95"><RefreshCw size={18} strokeWidth={2.2} /></button>
                </div>
              </div>
              {offline && (
                <div className="mb-3 p-2.5 rounded-xl bg-white/25 backdrop-blur flex items-center gap-2 text-xs font-bold text-white"><WifiOff size={14} /> オフライン表示中（最後に取得した情報を表示しています）</div>
              )}
              {apiConfigError && (
                <div className="mb-3 p-2.5 rounded-xl bg-red-600/95 flex items-center gap-2 text-xs font-black text-white">⚠ 設定エラー：{apiConfigError}</div>
              )}
              {import.meta.env.PROD && !backendConfigured && (
                <div className="mb-3 p-2.5 rounded-xl bg-amber-500/90 flex items-center gap-2 text-xs font-black text-white">⚠ デモ表示中：端末間でデータは共有されません(共有APIが未設定です)</div>
              )}
              <div className="grid grid-cols-3 gap-2">
                <StatCard label="営業中" value={`${openBooths.length}`} unit="店舗" />
                <StatCard label="平均待ち" value={`${avgWait}`} unit="分" />
                <StatCard label="最終同期" value={backendConfigured ? formatTime(fetchedAt) : (booths.length ? formatTime(Math.max(...booths.map((b) => b.lastUpdated || 0))) : "—")} />
              </div>
            </div>
            <div className="relative max-w-xl mx-auto px-4 pb-3.5">
              <div {...categoryPan} className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1 cursor-grab active:cursor-grabbing select-none">
                {CATEGORIES.map((c) => (
                  <button key={c.id} onClick={() => setCategory(c.id)}
                    className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-extrabold transition-all active:scale-95 ${category === c.id ? "bg-white shadow-md" : "bg-white/25 text-white backdrop-blur hover:bg-white/40"}`}
                    style={category === c.id ? { color: THEME.pinkDeep } : {}}>
                    {c.emoji} {c.label}
                  </button>
                ))}
              </div>
            </div>
          </header>

          <main className="max-w-xl mx-auto px-4 pt-4">
            {settings.emergencyNotice && (
              <div className="mb-4 p-3.5 rounded-2xl bg-red-50 border-2 border-red-300 flex items-start gap-2.5" role="alert">
                <Megaphone size={18} className="text-red-600 mt-0.5 flex-shrink-0" strokeWidth={2.4} />
                <div className="text-sm text-red-900 leading-relaxed"><strong className="font-black">お知らせ：</strong>{settings.emergencyNotice}</div>
              </div>
            )}

            {showInstall && !appInstalled && <InstallAppCard promptAvailable={promptAvailable} onInstall={() => void handleInstall()} />}

            {VOTE_FORM_URL && (
              <a href={VOTE_FORM_URL} target="_blank" rel="noopener noreferrer"
                className="block mb-4 rounded-2xl p-4 relative overflow-hidden active:scale-[0.98] transition-transform shadow-md anim-pop"
                style={{ background: "linear-gradient(120deg,#9b5de5,#ff4d8d,#ff8a3d)" }}>
                <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle,#fff 1.5px,transparent 1.5px)", backgroundSize: "16px 16px" }} />
                <div className="absolute top-2 right-3 text-lg anim-wiggle pointer-events-none">🗳️</div>
                <div className="relative flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-white/25 backdrop-blur flex items-center justify-center flex-shrink-0 anim-bobble">
                    <Star size={22} className="text-white" strokeWidth={2.4} fill="white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-black text-base leading-tight">好きな企画に投票しよう！</div>
                    <div className="text-white/90 text-xs font-bold mt-0.5">タップして投票フォームへ →</div>
                  </div>
                </div>
              </a>
            )}

            <div className="mb-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="🔍 ブース名・クラス・教室で検索"
                className="w-full px-4 py-3 rounded-2xl border-2 bg-white text-sm font-bold outline-none"
                style={{ borderColor: `${THEME.purple}33`, color: THEME.ink }}
              />
            </div>

            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-bold" style={{ color: THEME.ink }}>{filtered.length}件のブース</div>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="text-xs font-bold bg-white border-2 rounded-full px-3 py-1.5 outline-none" style={{ color: THEME.ink, borderColor: `${THEME.purple}44` }} aria-label="並び順">
                <option value="default">並び順: デフォルト</option>
                <option value="wait_asc">空いてる順</option>
                <option value="wait_desc">混んでる順</option>
                <option value="favorites">お気に入り</option>
              </select>
            </div>
            <div className="grid grid-cols-1 gap-3.5">
              {filtered.map((b) => <BoothCard key={b.id} booth={b} onTap={(x) => setSelectedId(x.id)} isFavorite={favorites.includes(b.id)} onToggleFavorite={toggleFavorite} />)}
            </div>
            {filtered.length === 0 && (
              <EmptyState icon={booths.length === 0 ? "🎪" : "🔍"} title={booths.length === 0 ? "まだブースがありません" : "該当する店舗がありません"} message={booths.length === 0 ? "スタッフタブから追加してください" : sortBy === "favorites" ? "♡をタップしてお気に入りに追加できます" : "検索語やカテゴリを変えてお試しください"} />
            )}
            <div className="text-center text-[11px] text-stone-400 mt-6 font-medium">⏱ 自動更新 · {STALE_MINUTES}分以上更新がないと「情報が古い」と表示されます</div>
          </main>
        </>
      )}

      {/* STAFF */}
      {view === "staff" && (
        <div className="max-w-xl mx-auto">
          {!staffAuthed && <StaffLogin onSubmit={handleLogin} busy={busy} onBack={() => setView("home")} />}
          {staffAuthed && staffStageOpen && <StageEditor program={stage} onSave={handleSaveStage} onBack={() => setStaffStageOpen(false)} showToast={showToast} />}
          {staffAuthed && !staffStageOpen && !staffBoothId && (
            <StaffBoothSelector
              booths={booths}
              role={staffRole ?? "staff"}
              pendingCount={pendingCount}
              onSelect={setStaffBoothId}
              onCreate={() => setCreating(true)}
              onEdit={setEditingId}
              onLogout={handleLogout}
              onOpenSettings={() => setSettingsOpen(true)}
              onOpenStage={() => setStaffStageOpen(true)}
            />
          )}
          {staffAuthed && !staffStageOpen && staffBoothId && staffBooth && <StaffBoothPanel booth={staffBooth} onUpdate={(u) => updateBooth(staffBoothId, u)} onBack={() => setStaffBoothId(null)} onOpenCalculator={() => setCalcOpen(true)} onEdit={() => setEditingId(staffBoothId)} />}
          {staffAuthed && !staffStageOpen && staffBoothId && !staffBooth && <div className="p-8 text-center text-stone-400"><div className="text-4xl mb-2">🗑️</div><div className="font-bold text-stone-600">このブースは削除されました</div><button onClick={() => setStaffBoothId(null)} className="mt-4 px-5 py-2.5 rounded-xl bg-stone-900 text-white font-bold text-sm">一覧に戻る</button></div>}
        </div>
      )}

      {/* STAGE (guest) */}
      {view === "stage" && <StageView program={stage} tick={tick} />}

      {/* MAP (guest) */}
      {view === "map" && <MapView booths={booths} onJump={(id) => setSelectedId(id)} onOpenStage={() => setView("stage")} />}

      {/* 全体お知らせ(ホーム以外でも見えるように、ナビ直上へ常時表示) */}
      {settings.emergencyNotice && view !== "home" && (
        <div className="fixed bottom-[68px] inset-x-0 z-30 px-3 pb-1" role="alert">
          <div className="max-w-xl mx-auto p-3 rounded-2xl bg-red-600 text-white text-xs font-bold shadow-lg flex items-start gap-2">
            <Megaphone size={16} className="flex-shrink-0 mt-0.5" strokeWidth={2.4} />
            <span className="leading-relaxed">{settings.emergencyNotice}</span>
          </div>
        </div>
      )}

      {/* Bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white/90 backdrop-blur-xl border-t-2" style={{ borderColor: "#ff4d8d22" }}>
        <div className="max-w-xl mx-auto px-3 py-2 flex items-center">
          <TabButton active={view === "home"} icon={Eye} label="ホーム" onClick={() => setView("home")} />
          <TabButton active={view === "stage"} icon={Music} label="ステージ" onClick={() => setView("stage")} />
          <TabButton active={view === "map"} icon={MapIcon} label="マップ" onClick={() => setView("map")} />
          <TabButton active={view === "staff"} icon={ShieldCheck} label="スタッフ" onClick={() => setView("staff")} />
        </div>
      </nav>
    </div>
  );
}

/* ═══════════ TOP-LEVEL ERROR BOUNDARY ═══════════
   どんな描画エラーでも白画面にせず、復旧カードを表示する。 */
interface BoundaryState { error: Error | null; showDetail: boolean; resetting: boolean }

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, BoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null, showDetail: false, resetting: false };
  }
  static getDerivedStateFromError(error: Error): Partial<BoundaryState> { return { error }; }
  override componentDidCatch(error: Error, info: React.ErrorInfo): void { try { console.error("App crashed:", error, info); } catch { /* noop */ } }

  resetData(): void {
    this.setState({ resetting: true });
    try {
      // 壊れた保存データが原因の場合に備え、このアプリのキーを全消去してから再読み込み
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && key.startsWith("machitime:")) keys.push(key);
      }
      keys.forEach((key) => localStorage.removeItem(key));
      sessionStorage.removeItem(SESSION_PIN_KEY);
      sessionStorage.removeItem(SESSION_ROLE_KEY);
    } catch { /* noop */ }
    try { window.location.reload(); } catch { /* noop */ }
  }

  override render(): React.ReactNode {
    if (this.state.error) {
      const msg = this.state.error.message || String(this.state.error);
      const stack = this.state.error.stack || "";
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "linear-gradient(180deg,#fff7ed 0%,#fef0f5 100%)", fontFamily: '"Hiragino Sans","Noto Sans JP",sans-serif' }}>
          <div style={{ maxWidth: 380, width: "100%", textAlign: "center", background: "#fff", borderRadius: 24, padding: 28, boxShadow: "0 10px 40px rgba(0,0,0,0.1)" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎪</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#3b1f4f", marginBottom: 8 }}>読み込みでエラーが発生しました</div>
            <div style={{ fontSize: 13, color: "#78716c", marginBottom: 18, lineHeight: 1.7 }}>
              以前の保存データが原因のことがあります。<br />まず下の「保存データをリセット」をお試しください。
            </div>
            <button
              onClick={() => this.resetData()}
              disabled={this.state.resetting}
              style={{ width: "100%", padding: "12px 0", borderRadius: 14, border: "none", color: "#fff", fontWeight: 800, fontSize: 14, background: "linear-gradient(135deg,#ff4d8d,#9b5de5)", cursor: "pointer", marginBottom: 10, opacity: this.state.resetting ? 0.6 : 1 }}>
              {this.state.resetting ? "リセット中…" : "保存データをリセットして再読み込み"}
            </button>
            <button
              onClick={() => { try { window.location.reload(); } catch { /* noop */ } }}
              style={{ width: "100%", padding: "10px 0", borderRadius: 14, border: "1px solid #e7e5e4", color: "#78716c", fontWeight: 700, fontSize: 13, background: "#fff", cursor: "pointer", marginBottom: 14 }}>
              そのまま再読み込み
            </button>
            <button
              onClick={() => this.setState({ showDetail: !this.state.showDetail })}
              style={{ background: "none", border: "none", color: "#a8a29e", fontSize: 11, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>
              {this.state.showDetail ? "エラー詳細を隠す" : "エラー詳細を表示"}
            </button>
            {this.state.showDetail && (
              <div style={{ marginTop: 12, padding: 12, background: "#faf7f2", borderRadius: 10, textAlign: "left", maxHeight: 180, overflow: "auto" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#dc2626", marginBottom: 6, wordBreak: "break-word" }}>{msg}</div>
                <pre style={{ fontSize: 9, color: "#78716c", whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>{stack.slice(0, 600)}</pre>
              </div>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App(): React.JSX.Element {
  return (
    <AppErrorBoundary>
      <AppInner />
    </AppErrorBoundary>
  );
}
