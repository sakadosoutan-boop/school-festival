import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, MouseEvent } from "react";
import {
  applyImport,
  backendConfigured,
  cachedData,
  changePin,
  createSnapshot,
  DEMO_ADMIN_PIN,
  DEMO_STAFF_PIN,
  fetchFestivalData,
  flushPending,
  hasCachedData,
  listSnapshots,
  pendingMutations,
  queueMutation,
  restoreSnapshot,
  updateBooth,
  updateFestivalSettings,
  verifyPin,
} from "./lib/api";
import { downloadText, parseCsv, toCsv, type CsvRow } from "./lib/csv";
import { calculateWait, displayWait, eventPhase, formatRelative, freshness, jstNowMinutes, jstToday, minutesSince, todayFestivalDay, toMinutes } from "./lib/time";
import { normalizeForSearch } from "./lib/text";
import {
  BOOTH_HEADERS,
  TIMETABLE_HEADERS,
  validateBoothRows,
  validateTimetableRows,
} from "./lib/validation";
import type {
  Booth,
  BoothCategory,
  FestivalData,
  FestivalDay,
  ImportKind,
  ImportMode,
  ImportPreview,
  SnapshotMeta,
  StaffRole,
  TimetableEvent,
} from "./types";

const DAY_LABELS: Record<FestivalDay, string> = {
  "2026-08-29": "8/29（土）",
  "2026-08-30": "8/30（日）",
};

const CATEGORY_LABELS: Record<BoothCategory | "all", string> = {
  all: "すべて",
  attraction: "アトラクション",
  food: "飲食",
  game: "ゲーム",
  experience: "体験",
  stage: "ステージ",
  exhibition: "展示",
  other: "その他",
};

const CATEGORY_EMOJI: Record<BoothCategory, string> = {
  attraction: "🎢",
  food: "🍴",
  game: "🎯",
  experience: "🎨",
  stage: "🎤",
  exhibition: "🖼️",
  other: "✨",
};

const STATUS_LABELS: Record<Booth["status"], string> = {
  open: "営業中",
  paused: "一時停止",
  closed: "準備中・終了",
  sold_out: "受付終了・売切",
};

type SortMode = "recommended" | "wait" | "name";

const SORT_LABELS: Record<SortMode, string> = {
  recommended: "おすすめ順",
  wait: "待ち時間が短い順",
  name: "名前順",
};

const FAVORITES_KEY = "machitime:v5:favorites";
const SESSION_PIN_KEY = "machitime:v5:staff-pin";
const SESSION_ROLE_KEY = "machitime:v5:staff-role";

function loadFavorites(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function downloadBoothTemplate(): void {
  const sample = {
    id: "3a-haunted-house",
    name: "お化け屋敷",
    organizer: "3年A組",
    category: "attraction",
    location: "本館3階 301教室",
    description: "企画の紹介文（240文字以内）",
    emoji: "👻",
    days: "2026-08-29|2026-08-30",
    open_time: "09:30",
    close_time: "15:00",
    capacity: 4,
    cycle_minutes: 5,
    queue_length: 0,
    status: "closed",
    notice: "整理券配布などのお知らせ",
    sort_order: 10,
  };
  downloadText("booths-template.csv", toCsv([...BOOTH_HEADERS], [sample]), "text/csv;charset=utf-8");
}

function downloadTimetableTemplate(): void {
  const sample = {
    id: "day1-band-live",
    day: "2026-08-29",
    start_time: "11:00",
    end_time: "11:35",
    title: "軽音楽部ライブ",
    organizer: "軽音楽部",
    venue: "体育館ステージ",
    category: "音楽",
    description: "演目紹介（300文字以内）",
    audience: "全来場者",
    sort_order: 10,
  };
  downloadText("timetable-template.csv", toCsv([...TIMETABLE_HEADERS], [sample]), "text/csv;charset=utf-8");
}

function statusMeta(booth: Booth): { label: string; tone: string; waitText: string } {
  const state = freshness(booth);
  if (booth.status !== "open") return { label: STATUS_LABELS[booth.status], tone: booth.status, waitText: "—" };
  if (state === "very_stale") return { label: "現地で確認", tone: "stale", waitText: "確認中" };
  if (booth.waitMinutes <= 10) return { label: "空いています", tone: "calm", waitText: displayWait(booth.waitMinutes) };
  if (booth.waitMinutes <= 25) return { label: "やや混雑", tone: "medium", waitText: displayWait(booth.waitMinutes) };
  return { label: "混雑", tone: "busy", waitText: displayWait(booth.waitMinutes) };
}

function useClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

// Escで閉じる＋開いた直後にシートへフォーカスを移す。画面回転や誤タップで
// 背面が操作できなくなる事故と、キーボード利用者が閉じられない問題への対策。
function useSheetBehavior(onClose: () => void) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return ref;
}

interface ToastState {
  message: string;
  tone: "success" | "error" | "info" | "warning";
}

function App(): React.JSX.Element {
  const [data, setData] = useState<FestivalData>(() => cachedData());
  const [loading, setLoading] = useState(() => !hasCachedData());
  const [offline, setOffline] = useState(!navigator.onLine);
  const [view, setView] = useState<"booths" | "timetable" | "staff">("booths");
  const [day, setDay] = useState<FestivalDay>(() => todayFestivalDay());
  const [category, setCategory] = useState<BoothCategory | "all">("all");
  const [sortMode, setSortMode] = useState<SortMode>("recommended");
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>(loadFavorites);
  const [selectedBooth, setSelectedBooth] = useState<Booth | null>(null);
  const [staffPin, setStaffPin] = useState(() => sessionStorage.getItem(SESSION_PIN_KEY) ?? "");
  const [staffAuthed, setStaffAuthed] = useState(() => Boolean(sessionStorage.getItem(SESSION_PIN_KEY)));
  const [staffRole, setStaffRole] = useState<StaffRole | null>(() => {
    const stored = sessionStorage.getItem(SESSION_ROLE_KEY);
    return stored === "admin" || stored === "staff" ? stored : null;
  });
  const [staffBooth, setStaffBooth] = useState<Booth | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview<Booth | TimetableEvent> | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const [snapshots, setSnapshots] = useState<SnapshotMeta[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [pendingCount, setPendingCount] = useState(() => pendingMutations().length);
  const toastTimer = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const importKindRef = useRef<ImportKind>("booths");
  const versionRef = useRef<string | undefined>(undefined);
  const inFlightRef = useRef(false);
  const now = useClock();

  const notify = useCallback((message: string, tone: ToastState["tone"] = "success") => {
    setToast({ message, tone });
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => {
      setToast(null);
      toastTimer.current = null;
    }, 3200);
  }, []);

  useEffect(() => {
    versionRef.current = data.version;
  }, [data.version]);

  const refresh = useCallback(async (silent = false): Promise<boolean> => {
    if (inFlightRef.current) return true;
    inFlightRef.current = true;
    try {
      const result = await fetchFestivalData(versionRef.current);
      if (result.ok && result.notModified) {
        setData((current) => ({ ...current, fetchedAt: new Date().toISOString() }));
        setOffline(false);
        if (!silent) notify("表示は最新の状態です", "info");
        return true;
      }
      if (result.ok && result.data) {
        const pending = pendingMutations();
        const latestPending = new Map<string, (typeof pending)[number]>();
        pending.forEach((mutation) => latestPending.set(mutation.boothId, mutation));
        const hydrated: FestivalData = {
          ...result.data,
          booths: result.data.booths.map((booth) => {
            const mutation = latestPending.get(booth.id);
            return mutation
              ? { ...booth, ...mutation.patch, revision: mutation.expectedRevision + 1 } as Booth
              : booth;
          }),
        };
        versionRef.current = result.data.version;
        setData(hydrated);
        setStaffBooth((current) => current ? hydrated.booths.find((booth) => booth.id === current.id) ?? current : null);
        setSelectedBooth((current) => current ? hydrated.booths.find((booth) => booth.id === current.id) ?? current : null);
        setPendingCount(pending.length);
        setOffline(false);
        if (!silent) notify("最新情報に更新しました", "info");
        return true;
      }
      setOffline(true);
      if (!silent) notify("通信できないため、端末に保存した情報を表示しています", "warning");
      return false;
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [notify]);

  // ポーリング：来場者25秒・スタッフ12秒を基準に±15%のゆらぎを入れ、
  // 失敗時は間隔を3倍へ延ばす。バックグラウンドのタブは止め、復帰時に即時更新する。
  // 全端末が同じ10秒で一斉に叩いてバックエンドを飽和させないための設計。
  useEffect(() => {
    let cancelled = false;
    let paused = false;
    let timer: number | null = null;
    const schedule = (ok: boolean) => {
      if (cancelled) return;
      const base = staffAuthed ? 12_000 : 25_000;
      const delay = (ok ? base : Math.min(base * 3, 75_000)) * (0.85 + Math.random() * 0.3);
      timer = window.setTimeout(() => void run(), delay);
    };
    const run = async () => {
      if (cancelled) return;
      if (document.hidden) {
        paused = true;
        return;
      }
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

  const flushQueued = useCallback(async (pin: string) => {
    const result = await flushPending(pin);
    setPendingCount(pendingMutations().length);
    if (result.completed > 0) notify(`保留していた${result.completed}件を同期しました`);
    if (result.conflicts > 0) notify(`${result.conflicts}件は他端末の更新と競合しました`, "warning");
    if (result.failed > 0) notify(`${result.failed}件は送信できませんでした。通信状態を確認してください`, "warning");
  }, [notify]);

  useEffect(() => {
    const online = () => {
      void (async () => {
        setOffline(false);
        if (staffAuthed && staffPin && pendingMutations().length > 0) await flushQueued(staffPin);
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
  }, [flushQueued, refresh, staffAuthed, staffPin]);

  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => () => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
  }, []);

  // 起動時の再認証。オフラインで判定できない間は前回のログインを維持する
  // （更新は端末に保留され、送信時にサーバーが必ずPINを再検証する）。
  // 明確に「PINが無効」と返った場合だけログアウトさせる。
  useEffect(() => {
    if (!staffPin) return;
    void verifyPin(staffPin).then(async (result) => {
      if (result.ok && result.data?.valid) {
        const role = result.data.role ?? "staff";
        setStaffAuthed(true);
        setStaffRole(role);
        sessionStorage.setItem(SESSION_ROLE_KEY, role);
        if (navigator.onLine && pendingMutations().length > 0) await flushQueued(staffPin);
      } else if (result.ok) {
        sessionStorage.removeItem(SESSION_PIN_KEY);
        sessionStorage.removeItem(SESSION_ROLE_KEY);
        setStaffAuthed(false);
        setStaffRole(null);
        setStaffPin("");
      }
    });
  }, []); // intentionally check only once on boot

  const visibleBooths = useMemo(() => {
    const normalized = normalizeForSearch(query);
    return data.booths
      .filter((booth) => booth.days.includes(day))
      .filter((booth) => category === "all" || booth.category === category)
      .filter((booth) => !normalized || [booth.name, booth.organizer, booth.location, booth.description].some((value) => normalizeForSearch(value).includes(normalized)))
      .sort((a, b) => {
        if (sortMode === "wait") {
          const rank = (booth: Booth) => booth.status === "open" ? (freshness(booth) === "very_stale" ? 1 : 0) : 2;
          const rankDiff = rank(a) - rank(b);
          if (rankDiff !== 0) return rankDiff;
          if (rank(a) === 0 && a.waitMinutes !== b.waitMinutes) return a.waitMinutes - b.waitMinutes;
          return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ja");
        }
        if (sortMode === "name") return a.name.localeCompare(b.name, "ja");
        const favoriteDiff = Number(favorites.includes(b.id)) - Number(favorites.includes(a.id));
        if (favoriteDiff !== 0) return favoriteDiff;
        return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ja");
      });
  }, [category, data.booths, day, favorites, now, query, sortMode]);

  const visibleEvents = useMemo(() => data.timetable
    .filter((event) => event.day === day)
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.sortOrder - b.sortOrder), [data.timetable, day]);

  const nextEvent = visibleEvents.find((event) => eventPhase(event, now) !== "ended");
  const liveEvent = visibleEvents.find((event) => eventPhase(event, now) === "live");
  const fetchedAgeMinutes = minutesSince(data.fetchedAt);
  const dataStale = !offline && fetchedAgeMinutes >= 2;

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^\d{6,8}$/.test(staffPin)) {
      notify("PINは6〜8桁の数字で入力してください", "error");
      return;
    }
    setBusy(true);
    const result = await verifyPin(staffPin);
    setBusy(false);
    if (!result.ok || !result.data?.valid) {
      notify(result.error ?? "PINが違います", "error");
      return;
    }
    const role = result.data.role ?? "staff";
    sessionStorage.setItem(SESSION_PIN_KEY, staffPin);
    sessionStorage.setItem(SESSION_ROLE_KEY, role);
    setStaffAuthed(true);
    setStaffRole(role);
    notify(role === "admin" ? "管理者モードに入りました" : "スタッフモードに入りました");
    if (navigator.onLine && pendingMutations().length > 0) await flushQueued(staffPin);
  };

  const commitBooth = async (next: Booth, expectedRevision: number) => {
    setBusy(true);
    const result = await updateBooth(staffPin, next, expectedRevision);
    setBusy(false);
    if (result.ok && result.data) {
      setData((current) => ({ ...current, booths: current.booths.map((booth) => booth.id === result.data!.id ? result.data! : booth) }));
      setStaffBooth(result.data);
      notify("表示を更新しました");
      return;
    }
    if (result.code === "CONFLICT" && result.current) {
      setData((current) => ({ ...current, booths: current.booths.map((booth) => booth.id === result.current!.id ? result.current! : booth) }));
      setStaffBooth(result.current);
      notify("別の端末で先に更新されました。最新値を読み込みました", "warning");
      return;
    }
    if (result.code === "NETWORK" || !navigator.onLine) {
      const optimistic = { ...next, revision: expectedRevision + 1, lastUpdated: new Date().toISOString() };
      queueMutation({
        id: `${next.id}-${Date.now()}`,
        createdAt: new Date().toISOString(),
        type: "update_booth",
        boothId: next.id,
        expectedRevision,
        patch: next,
      });
      setPendingCount(pendingMutations().length);
      setData((current) => ({ ...current, booths: current.booths.map((booth) => booth.id === optimistic.id ? optimistic : booth) }));
      setStaffBooth(optimistic);
      notify("通信が戻ったら自動送信します。現地掲示も併用してください", "warning");
      return;
    }
    notify(result.error ?? "更新に失敗しました", "error");
  };

  const patchStaffBooth = (patch: Partial<Booth>) => {
    if (!staffBooth) return;
    const queueLength = patch.queueLength ?? staffBooth.queueLength;
    const capacity = patch.capacity ?? staffBooth.capacity;
    const cycleMinutes = patch.cycleMinutes ?? staffBooth.cycleMinutes;
    const waitMinutes = calculateWait(queueLength, capacity, cycleMinutes);
    const next: Booth = {
      ...staffBooth,
      ...patch,
      queueLength,
      capacity,
      cycleMinutes,
      waitMinutes,
      lastUpdated: new Date().toISOString(),
      history: [...staffBooth.history, { at: new Date().toISOString(), waitMinutes }].slice(-48),
    };
    void commitBooth(next, staffBooth.revision);
  };

  const markServed = () => {
    if (!staffBooth) return;
    patchStaffBooth({ queueLength: Math.max(0, staffBooth.queueLength - staffBooth.capacity) });
  };

  const openImport = (kind: ImportKind) => {
    importKindRef.current = kind;
    fileInput.current?.click();
  };

  const parseImportFile = async (file: File, kind: ImportKind) => {
    if (file.size > 2_000_000) {
      notify("ファイルは2MB以下にしてください", "error");
      return;
    }
    const text = await file.text();
    try {
      let rawRows: CsvRow[];
      if (file.name.toLowerCase().endsWith(".json")) {
        const parsed = JSON.parse(text) as Partial<FestivalData> | unknown[];
        const source = Array.isArray(parsed) ? parsed : kind === "booths" ? parsed.booths : parsed.timetable;
        if (!Array.isArray(source)) throw new Error("対象の配列がありません。");
        rawRows = source.map((item): CsvRow => {
          const value = item as Record<string, unknown>;
          if (kind === "booths") {
            return {
              id: String(value.id ?? ""), name: String(value.name ?? ""), organizer: String(value.organizer ?? ""), category: String(value.category ?? ""),
              location: String(value.location ?? ""), description: String(value.description ?? ""), emoji: String(value.emoji ?? ""),
              days: Array.isArray(value.days) ? value.days.join("|") : String(value.days ?? ""), open_time: String(value.openTime ?? value.open_time ?? ""),
              close_time: String(value.closeTime ?? value.close_time ?? ""), capacity: String(value.capacity ?? ""), cycle_minutes: String(value.cycleMinutes ?? value.cycle_minutes ?? ""),
              queue_length: String(value.queueLength ?? value.queue_length ?? ""), status: String(value.status ?? ""), notice: String(value.notice ?? ""), sort_order: String(value.sortOrder ?? value.sort_order ?? ""),
            };
          }
          return {
            id: String(value.id ?? ""), day: String(value.day ?? ""), start_time: String(value.startTime ?? value.start_time ?? ""), end_time: String(value.endTime ?? value.end_time ?? ""),
            title: String(value.title ?? ""), organizer: String(value.organizer ?? ""), venue: String(value.venue ?? ""), category: String(value.category ?? ""),
            description: String(value.description ?? ""), audience: String(value.audience ?? ""), sort_order: String(value.sortOrder ?? value.sort_order ?? ""),
          };
        });
      } else {
        rawRows = parseCsv(text);
      }
      const validation = kind === "booths" ? validateBoothRows(rawRows) : validateTimetableRows(rawRows);
      setImportPreview({ kind, rows: validation.rows, issues: validation.issues, sourceName: file.name });
      setImportMode("merge");
    } catch (error) {
      notify(error instanceof Error ? error.message : "ファイルを解析できませんでした", "error");
    }
  };

  const executeImport = async () => {
    if (!importPreview || importPreview.issues.some((item) => item.level === "error")) return;
    if (importMode === "replace") {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      downloadText(`machitime-auto-backup-${timestamp}.json`, JSON.stringify(data, null, 2), "application/json;charset=utf-8");
    }
    setBusy(true);
    const result = await applyImport(
      staffPin,
      importMode,
      importPreview.kind === "booths" ? importPreview.rows as Booth[] : undefined,
      importPreview.kind === "timetable" ? importPreview.rows as TimetableEvent[] : undefined,
    );
    setBusy(false);
    if (!result.ok || !result.data) {
      notify(result.error ?? "取り込みに失敗しました", "error");
      return;
    }
    setData(result.data);
    setImportPreview(null);
    notify(`${importPreview.rows.length}件を反映しました`);
  };

  const exportBackup = () => {
    downloadText(`machitime-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), "application/json;charset=utf-8");
    notify("バックアップを書き出しました", "info");
  };

  const saveSnapshot = async () => {
    setBusy(true);
    const result = await createSnapshot(staffPin, "手動保存");
    setBusy(false);
    if (!result.ok) {
      notify(result.error ?? "サーバーへの保存に失敗しました", "error");
      return;
    }
    notify("現在のデータをサーバーへ保存しました");
  };

  const openSnapshots = async () => {
    setSnapshots([]);
    const result = await listSnapshots(staffPin);
    if (!result.ok || !result.data) {
      setSnapshots(null);
      notify(result.error ?? "スナップショット一覧を取得できませんでした", "error");
      return;
    }
    setSnapshots(result.data);
  };

  const executeRestore = async (snapshot: SnapshotMeta) => {
    const stamp = new Date(snapshot.createdAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    if (!window.confirm(`${stamp} 時点（企画${snapshot.boothCount}件・演目${snapshot.eventCount}件）へ全件置換で復元します。現在のデータは復元前に自動保存されます。よろしいですか？`)) return;
    setBusy(true);
    const result = await restoreSnapshot(staffPin, snapshot.id);
    setBusy(false);
    if (!result.ok || !result.data) {
      notify(result.error ?? "復元に失敗しました", "error");
      return;
    }
    setData(result.data);
    setSnapshots(null);
    notify("スナップショットから復元しました");
  };

  const saveEmergencyNotice = async (notice: string) => {
    if (notice.length > 180) {
      notify("重要なお知らせは180文字以内にしてください", "error");
      return;
    }
    setBusy(true);
    const result = await updateFestivalSettings(staffPin, { emergencyNotice: notice.trim() });
    setBusy(false);
    if (!result.ok || !result.data) {
      notify(result.error ?? "重要なお知らせの更新に失敗しました", "error");
      return;
    }
    setData(result.data);
    notify(notice.trim() ? "重要なお知らせを公開しました" : "重要なお知らせを解除しました");
  };

  const handlePinChange = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const target: StaffRole = form.get("target") === "admin" ? "admin" : "staff";
    const nextPin = String(form.get("nextPin") ?? "");
    if (!/^\d{6,8}$/.test(nextPin)) {
      notify("新しいPINは6〜8桁の数字にしてください", "error");
      return;
    }
    setBusy(true);
    const result = await changePin(staffPin, target, nextPin);
    setBusy(false);
    if (!result.ok) {
      notify(result.error ?? "PIN変更に失敗しました", "error");
      return;
    }
    if (target === "admin") {
      // 管理者は自分のPINでログインしているため、セッションも新PINへ切り替える。
      setStaffPin(nextPin);
      sessionStorage.setItem(SESSION_PIN_KEY, nextPin);
    }
    event.currentTarget.reset();
    notify(target === "admin" ? "管理者PINを変更しました" : "更新用PIN（スタッフ）を変更しました");
  };

  const handleLogout = () => {
    if (pendingCount > 0 && !window.confirm(`未送信の更新が${pendingCount}件この端末に残っています。ログアウトしますか？（次回ログイン時に再送を試みます）`)) return;
    sessionStorage.removeItem(SESSION_PIN_KEY);
    sessionStorage.removeItem(SESSION_ROLE_KEY);
    setStaffAuthed(false);
    setStaffRole(null);
    setStaffPin("");
    setView("booths");
  };

  return (
    <div className="app-shell">
      {toast && <div className={`toast toast--${toast.tone}`} role="status">{toast.message}</div>}
      <header className="hero">
        <div className="hero__pattern" aria-hidden="true" />
        <div className="hero__inner">
          <div>
            <p className="eyebrow">SCHOOL FESTIVAL 2026</p>
            <h1>{data.settings.festivalName}</h1>
            <p className="hero__subtitle">{data.settings.subtitle} · まちたいむ</p>
          </div>
          <button className="icon-button" onClick={() => void refresh()} aria-label="最新情報に更新">↻</button>
        </div>
        <div className="status-strip">
          <span className={offline || dataStale ? "status-dot status-dot--warn" : "status-dot"} />
          {offline
            ? "オフライン：最後に取得した情報を表示中"
            : dataStale
              ? `接続が不安定：最終取得は${formatRelative(data.fetchedAt)}`
              : backendConfigured ? "共有データに接続中" : "デモモード：この端末内だけで動作"}
          <span className="status-strip__right">更新 {new Date(data.fetchedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      </header>

      {import.meta.env.PROD && !backendConfigured && (
        <div className="demo-banner" role="alert">
          <strong>デモ表示中：データは他の端末と共有されていません</strong>
          <span>本番運用には共有APIの設定（VITE_FESTIVAL_API_URL / VITE_FESTIVAL_PUBLIC_KEY）が必要です。運営本部はREADMEの手順を確認してください。</span>
        </div>
      )}

      {data.settings.emergencyNotice && (
        <div className="emergency" role="alert"><strong>重要なお知らせ</strong><span>{data.settings.emergencyNotice}</span></div>
      )}

      <main className="main">
        {view !== "staff" && (
          <section className="day-switch" aria-label="開催日を選択">
            {data.settings.dates.map((date) => (
              <button key={date} className={day === date ? "is-active" : ""} onClick={() => setDay(date)}>{DAY_LABELS[date]}</button>
            ))}
          </section>
        )}

        {view === "booths" && (
          <>
            <section className="summary-grid">
              <div><span>営業中</span><strong>{visibleBooths.filter((booth) => booth.status === "open").length}</strong><small>企画</small></div>
              <div><span>平均待ち</span><strong>{Math.round(visibleBooths.filter((booth) => booth.status === "open" && freshness(booth) !== "very_stale").reduce((sum, booth) => sum + booth.waitMinutes, 0) / Math.max(1, visibleBooths.filter((booth) => booth.status === "open" && freshness(booth) !== "very_stale").length))}</strong><small>分</small></div>
              <div><span>お気に入り</span><strong>{favorites.length}</strong><small>件</small></div>
            </section>

            <section className="filters">
              <label className="search"><span>⌕</span><input value={query} onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} placeholder="企画名・団体・場所を検索" /></label>
              <div className="chip-row">
                {(Object.keys(CATEGORY_LABELS) as Array<BoothCategory | "all">).map((item) => (
                  <button key={item} className={category === item ? "chip is-active" : "chip"} onClick={() => setCategory(item)}>{CATEGORY_LABELS[item]}</button>
                ))}
              </div>
            </section>

            <div className="sort-row" role="group" aria-label="並び替え">
              {(Object.keys(SORT_LABELS) as SortMode[]).map((item) => (
                <button key={item} className={sortMode === item ? "chip chip--sort is-active" : "chip chip--sort"} onClick={() => setSortMode(item)}>{SORT_LABELS[item]}</button>
              ))}
            </div>

            <section className="card-list" aria-live="polite">
              {visibleBooths.map((booth) => {
                const meta = statusMeta(booth);
                const stale = freshness(booth);
                const favorite = favorites.includes(booth.id);
                return (
                  <article className="booth-card" key={booth.id}>
                    <button className="booth-card__main" onClick={() => setSelectedBooth(booth)}>
                      <div className="booth-card__icon">{booth.emoji || CATEGORY_EMOJI[booth.category]}</div>
                      <div className="booth-card__body">
                        <div className="booth-card__headline"><h2>{booth.name}</h2><span className={`badge badge--${meta.tone}`}>{meta.label}</span></div>
                        <p>{booth.organizer} · {booth.location}</p>
                        <div className="booth-card__footer">
                          <span className="wait"><strong>{meta.waitText}</strong>{booth.status === "open" && stale !== "very_stale" && <small>待ち</small>}</span>
                          <span className={stale === "fresh" ? "freshness" : "freshness freshness--warn"}>{stale === "fresh" ? `更新 ${formatRelative(booth.lastUpdated)}` : stale === "stale" ? `更新待ち · ${formatRelative(booth.lastUpdated)}` : `情報が古い · ${formatRelative(booth.lastUpdated)}`}</span>
                        </div>
                      </div>
                    </button>
                    <button className={favorite ? "favorite is-active" : "favorite"} onClick={() => setFavorites((current) => current.includes(booth.id) ? current.filter((id) => id !== booth.id) : [...current, booth.id])} aria-label={`${booth.name}をお気に入り${favorite ? "から外す" : "に追加"}`}>{favorite ? "♥" : "♡"}</button>
                  </article>
                );
              })}
              {visibleBooths.length === 0 && <EmptyState title="条件に合う企画がありません" body="日付・カテゴリ・検索語を変えてお試しください。" />}
            </section>
          </>
        )}

        {view === "timetable" && (
          <section>
            <div className="section-heading"><div><p className="eyebrow eyebrow--dark">TIME TABLE</p><h2>タイムテーブル</h2></div><span>{DAY_LABELS[day]}</span></div>
            {(liveEvent || nextEvent) && (
              <div className="now-card">
                <span>{liveEvent ? "ただいま開催中" : "次のプログラム"}</span>
                <strong>{(liveEvent ?? nextEvent)?.title}</strong>
                <small>{(liveEvent ?? nextEvent)?.startTime}–{(liveEvent ?? nextEvent)?.endTime} · {(liveEvent ?? nextEvent)?.venue}</small>
              </div>
            )}
            <div className="timeline">
              {visibleEvents.map((event) => {
                const phase = eventPhase(event, now);
                return (
                  <article key={event.id} className={`timeline-item timeline-item--${phase}`}>
                    <div className="timeline-item__time"><strong>{event.startTime}</strong><span>{event.endTime}</span></div>
                    <div className="timeline-item__line"><i /></div>
                    <div className="timeline-item__card">
                      <div><span className="program-category">{event.category}</span>{phase === "live" && <span className="live-label">LIVE</span>}</div>
                      <h3>{event.title}</h3>
                      <p>{event.organizer} · {event.venue}</p>
                      {event.description && <small>{event.description}</small>}
                    </div>
                  </article>
                );
              })}
              {visibleEvents.length === 0 && <EmptyState title="登録されたプログラムがありません" body="運営画面からタイムテーブルCSVを取り込んでください。" />}
            </div>
          </section>
        )}

        {view === "staff" && !staffAuthed && (
          <section className="login-card">
            <div className="login-card__icon">🔐</div>
            <p className="eyebrow eyebrow--dark">STAFF ONLY</p>
            <h2>スタッフモード</h2>
            <p>待ち時間の更新とデータ取込は、文化祭実行委員・各団体の担当者のみ利用してください。</p>
            <form onSubmit={handleLogin}>
              <label>スタッフPIN<input type="password" inputMode="numeric" autoComplete="off" value={staffPin} onChange={(event: ChangeEvent<HTMLInputElement>) => setStaffPin(event.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="6〜8桁" /></label>
              <button className="primary-button" disabled={busy}>{busy ? "確認中…" : "ログイン"}</button>
            </form>
            {!backendConfigured && <div className="demo-note">デモモードの初期PINは 更新用 <strong>{DEMO_STAFF_PIN}</strong> / 管理用 <strong>{DEMO_ADMIN_PIN}</strong> です。本番では共有APIを設定してください。</div>}
          </section>
        )}

        {view === "staff" && staffAuthed && (
          <StaffDashboard
            data={data}
            day={day}
            setDay={setDay}
            now={now}
            role={staffRole ?? "staff"}
            pendingCount={pendingCount}
            busy={busy}
            onOpenBooth={(booth) => setStaffBooth(booth)}
            onRefresh={() => void refresh()}
            onOpenImport={openImport}
            onExportBackup={exportBackup}
            onSaveSnapshot={() => void saveSnapshot()}
            onOpenSnapshots={() => void openSnapshots()}
            onSaveEmergencyNotice={(notice) => void saveEmergencyNotice(notice)}
            onChangePin={handlePinChange}
            onLogout={handleLogout}
          />
        )}
      </main>

      <nav className="bottom-nav" aria-label="メインメニュー">
        <button className={view === "booths" ? "is-active" : ""} onClick={() => setView("booths")}><span>🎪</span>企画一覧</button>
        <button className={view === "timetable" ? "is-active" : ""} onClick={() => setView("timetable")}><span>🗓️</span>タイムテーブル</button>
        <button className={view === "staff" ? "is-active" : ""} onClick={() => setView("staff")}><span>🛠️</span>運営</button>
      </nav>

      <input
        ref={fileInput}
        type="file"
        accept=".csv,text/csv,.json,application/json"
        hidden
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const file = event.target.files?.[0];
          if (file) void parseImportFile(file, importKindRef.current);
          event.target.value = "";
        }}
      />

      {selectedBooth && <BoothDetail booth={selectedBooth} favorite={favorites.includes(selectedBooth.id)} onFavorite={() => setFavorites((current) => current.includes(selectedBooth.id) ? current.filter((id) => id !== selectedBooth.id) : [...current, selectedBooth.id])} onClose={() => setSelectedBooth(null)} />}
      {staffBooth && <StaffBoothModal booth={staffBooth} busy={busy} onPatch={patchStaffBooth} onServed={markServed} onClose={() => setStaffBooth(null)} />}
      {importPreview && <ImportModal preview={importPreview} mode={importMode} setMode={setImportMode} busy={busy} onApply={() => void executeImport()} onClose={() => setImportPreview(null)} />}
      {snapshots !== null && <SnapshotModal snapshots={snapshots} busy={busy} onRestore={(snapshot) => void executeRestore(snapshot)} onClose={() => setSnapshots(null)} />}
      {loading && <div className="loading-overlay"><div className="spinner" /><span>読み込み中</span></div>}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }): React.JSX.Element {
  return <div className="empty-state"><span>🎪</span><strong>{title}</strong><p>{body}</p></div>;
}

function WaitSparkline({ history }: { history: Booth["history"] }): React.JSX.Element | null {
  const points = history.filter((point) => Number.isFinite(Date.parse(point.at))).slice(-24);
  if (points.length < 3) return null;
  const max = Math.max(10, ...points.map((point) => point.waitMinutes));
  const coords = points
    .map((point, index) => `${((index / (points.length - 1)) * 100).toFixed(1)},${(40 - (point.waitMinutes / max) * 34).toFixed(1)}`)
    .join(" ");
  const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  const first = points[0];
  const last = points[points.length - 1];
  return (
    <div className="sparkline">
      <div className="sparkline__head"><span>待ち時間の推移</span><small>最大 {max}分</small></div>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
        <polyline points={coords} />
      </svg>
      {first && last && <div className="sparkline__axis"><small>{timeLabel(first.at)}</small><small>{timeLabel(last.at)}</small></div>}
    </div>
  );
}

function BoothDetail({ booth, favorite, onFavorite, onClose }: { booth: Booth; favorite: boolean; onFavorite: () => void; onClose: () => void }): React.JSX.Element {
  const meta = statusMeta(booth);
  const state = freshness(booth);
  const sheetRef = useSheetBehavior(onClose);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section ref={sheetRef} tabIndex={-1} className="sheet" onMouseDown={(event: MouseEvent<HTMLElement>) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${booth.name}の詳細`}>
        <div className="sheet__handle" />
        <div className="sheet__header"><button onClick={onFavorite}>{favorite ? "♥" : "♡"}</button><button onClick={onClose}>閉じる</button></div>
        <div className="detail-hero"><div>{booth.emoji}</div><span>{CATEGORY_LABELS[booth.category]}</span><h2>{booth.name}</h2><p>{booth.organizer}</p></div>
        {state !== "fresh" && booth.status === "open" && <div className="warning-box"><strong>待ち時間情報が古くなっています</strong><span>表示は{formatRelative(booth.lastUpdated)}のものです。現地の案内を優先してください。</span></div>}
        <div className={`detail-wait detail-wait--${meta.tone}`}><span>{meta.label}</span><strong>{meta.waitText}</strong>{booth.status === "open" && state !== "very_stale" && <small>現在 約{booth.queueLength}人待ち</small>}</div>
        <WaitSparkline history={booth.history} />
        <dl className="detail-list"><div><dt>場所</dt><dd>{booth.location}</dd></div><div><dt>開催時間</dt><dd>{booth.openTime}–{booth.closeTime}</dd></div><div><dt>紹介</dt><dd>{booth.description || "紹介文はありません。"}</dd></div>{booth.notice && <div><dt>お知らせ</dt><dd>{booth.notice}</dd></div>}</dl>
      </section>
    </div>
  );
}

function StaffDashboard({
  data, day, setDay, now, role, pendingCount, busy, onOpenBooth, onRefresh, onOpenImport, onExportBackup, onSaveSnapshot, onOpenSnapshots, onSaveEmergencyNotice, onChangePin, onLogout,
}: {
  data: FestivalData;
  day: FestivalDay;
  setDay: (day: FestivalDay) => void;
  now: Date;
  role: StaffRole;
  pendingCount: number;
  busy: boolean;
  onOpenBooth: (booth: Booth) => void;
  onRefresh: () => void;
  onOpenImport: (kind: ImportKind) => void;
  onExportBackup: () => void;
  onSaveSnapshot: () => void;
  onOpenSnapshots: () => void;
  onSaveEmergencyNotice: (notice: string) => void;
  onChangePin: (event: React.FormEvent<HTMLFormElement>) => void;
  onLogout: () => void;
}): React.JSX.Element {
  const booths = data.booths.filter((booth) => booth.days.includes(day)).sort((a, b) => a.sortOrder - b.sortOrder);
  const [emergencyNotice, setEmergencyNotice] = useState(data.settings.emergencyNotice);
  useEffect(() => setEmergencyNotice(data.settings.emergencyNotice), [data.settings.emergencyNotice]);
  // 開催日当日だけ警告する。todayFestivalDayは祭日以外を8/29へ丸めるため使わない。
  const isToday = day === jstToday(now);
  const nowMinutes = jstNowMinutes(now);
  const isAdmin = role === "admin";
  return (
    <section className="staff-dashboard">
      <div className="staff-heading"><div><p className="eyebrow eyebrow--dark">OPERATION</p><h2>運営ダッシュボード</h2><small className="role-tag">{isAdmin ? "管理者PINでログイン中" : "更新用PINでログイン中"}</small></div><button className="text-button" onClick={onLogout}>ログアウト</button></div>
      {pendingCount > 0 && <div className="warning-box"><strong>未送信の更新が{pendingCount}件あります</strong><span>通信が戻ると自動送信します。競合した場合は最新値を確認してください。</span></div>}
      <div className="day-switch">{data.settings.dates.map((date) => <button key={date} className={day === date ? "is-active" : ""} onClick={() => setDay(date)}>{DAY_LABELS[date]}</button>)}</div>

      {isAdmin && (
        <form className="emergency-form" onSubmit={(event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); onSaveEmergencyNotice(emergencyNotice); }}>
          <div><h3>全来場者への重要なお知らせ</h3><p>中止、会場変更、入場制限など、全画面上部へ直ちに表示する内容だけを入力してください。</p></div>
          <textarea value={emergencyNotice} maxLength={180} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setEmergencyNotice(event.target.value)} placeholder="例：雷雨のため、中庭企画を一時中止しています。" />
          <small>{emergencyNotice.length}/180文字</small>
          <div className="emergency-form__actions"><button type="button" className="secondary-button" disabled={busy || !data.settings.emergencyNotice} onClick={() => { setEmergencyNotice(""); onSaveEmergencyNotice(""); }}>表示を解除</button><button className="primary-button" disabled={busy || emergencyNotice.trim() === data.settings.emergencyNotice}>{busy ? "送信中…" : "お知らせを公開"}</button></div>
        </form>
      )}

      <div className="staff-section-heading"><div><h3>待ち時間を更新</h3><p>担当企画を選び、列の人数と営業状況を更新します。</p></div><button className="small-button" onClick={onRefresh}>再読込</button></div>
      <div className="staff-booth-list">
        {booths.map((booth) => {
          const meta = statusMeta(booth);
          const overdue = isToday && booth.status === "open" && Number.isFinite(toMinutes(booth.closeTime)) && nowMinutes > toMinutes(booth.closeTime);
          return <button key={booth.id} onClick={() => onOpenBooth(booth)}><span className="staff-booth-list__emoji">{booth.emoji}</span><span><strong>{booth.name}</strong><small>{booth.location} · 更新 {formatRelative(booth.lastUpdated)}{overdue && <em className="overdue-flag"> · ⚠ 終了時刻を過ぎています</em>}</small></span><b>{meta.waitText}</b><i>›</i></button>;
        })}
      </div>

      <div className="staff-section-heading"><div><h3>データ管理</h3><p>{isAdmin ? "取り込む前に自動検証し、エラーがあるファイルは反映しません。" : "この端末からはバックアップの書き出しのみできます。"}</p></div></div>
      <div className="action-grid">
        {isAdmin && <button onClick={() => onOpenImport("booths")}><span>🏫</span><strong>企画・団体一覧を取込</strong><small>CSV / JSON</small></button>}
        {isAdmin && <button onClick={() => onOpenImport("timetable")}><span>🗓️</span><strong>時間割を取込</strong><small>CSV / JSON</small></button>}
        {isAdmin && <button onClick={downloadBoothTemplate}><span>⬇️</span><strong>企画テンプレート</strong><small>CSVを出力</small></button>}
        {isAdmin && <button onClick={downloadTimetableTemplate}><span>⬇️</span><strong>時間割テンプレート</strong><small>CSVを出力</small></button>}
        <button onClick={onExportBackup}><span>💾</span><strong>全体バックアップ</strong><small>JSONを出力</small></button>
        {isAdmin && <button onClick={onSaveSnapshot} disabled={busy}><span>🗄️</span><strong>サーバーへ保存</strong><small>スナップショット</small></button>}
        {isAdmin && <button onClick={onOpenSnapshots}><span>⏪</span><strong>保存履歴・復元</strong><small>スナップショット</small></button>}
        <a href="./OPERATION_MANUAL.md" target="_blank" rel="noreferrer"><span>📘</span><strong>運用マニュアル</strong><small>別ファイルで開く</small></a>
      </div>
      {!isAdmin && <div className="operation-note">データ取込・全件置換・重要なお知らせ・PIN変更・スナップショット復元は、管理者PINでログインした端末だけが操作できます。必要な場合は運営本部へ連絡してください。</div>}

      {isAdmin && (
        <>
          <form className="pin-form" onSubmit={onChangePin}>
            <input type="hidden" name="target" value="staff" />
            <div><h3>更新用PIN（スタッフ）を変更</h3><p>各企画の担当者が使うPINです。本番前に必ず初期値から変更し、口頭または紙で共有してください。</p></div>
            <input name="nextPin" type="password" inputMode="numeric" autoComplete="off" placeholder="新しい6〜8桁PIN" required minLength={6} maxLength={8} />
            <button className="secondary-button" disabled={busy}>PINを変更</button>
          </form>
          <form className="pin-form" onSubmit={onChangePin}>
            <input type="hidden" name="target" value="admin" />
            <div><h3>管理者PINを変更</h3><p>取込・置換・お知らせ・PIN変更ができる強い権限です。システム責任者と運営本部の数名だけに共有してください。</p></div>
            <input name="nextPin" type="password" inputMode="numeric" autoComplete="off" placeholder="新しい6〜8桁PIN" required minLength={6} maxLength={8} />
            <button className="secondary-button" disabled={busy}>PINを変更</button>
          </form>
        </>
      )}
    </section>
  );
}

function StaffBoothModal({ booth, busy, onPatch, onServed, onClose }: { booth: Booth; busy: boolean; onPatch: (patch: Partial<Booth>) => void; onServed: () => void; onClose: () => void }): React.JSX.Element {
  const [queue, setQueue] = useState(booth.queueLength);
  const [notice, setNotice] = useState(booth.notice);
  const sheetRef = useSheetBehavior(onClose);
  // ポーリングで booth オブジェクトは10秒ごとに新しくなる。毎回リセットすると
  // 入力途中の人数やお知らせが消えるため、サーバー側で実際に書き込みがあった
  // （= revision が変わった）ときだけ入力値を同期する。
  useEffect(() => {
    setQueue(booth.queueLength);
    setNotice(booth.notice);
  }, [booth.id, booth.revision]);
  const preview = calculateWait(queue, booth.capacity, booth.cycleMinutes);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section ref={sheetRef} tabIndex={-1} className="sheet sheet--staff" onMouseDown={(event: MouseEvent<HTMLElement>) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${booth.name}の運営`}>
        <div className="sheet__handle" />
        <div className="sheet__header"><div><small>運用中</small><strong>{booth.name}</strong></div><button onClick={onClose}>閉じる</button></div>
        <div className="operation-status"><span>来場者への表示</span><strong>{booth.status === "open" ? `${displayWait(preview)}待ち` : STATUS_LABELS[booth.status]}</strong><small>{queue}人 ÷ {booth.capacity}人/回 × {booth.cycleMinutes}分</small></div>
        <div className="operation-block"><label>営業状況</label><div className="segmented">{(["open", "paused", "closed", "sold_out"] as Booth["status"][]).map((status) => <button key={status} className={booth.status === status ? "is-active" : ""} onClick={() => onPatch({ status })} disabled={busy}>{STATUS_LABELS[status]}</button>)}</div></div>
        <div className="operation-block"><label>列に並んでいる人数</label><div className="counter"><button onClick={() => setQueue(Math.max(0, queue - 1))}>−</button><input type="number" inputMode="numeric" min="0" max="5000" value={queue} onChange={(event: ChangeEvent<HTMLInputElement>) => setQueue(Math.max(0, Math.min(5000, Number(event.target.value) || 0)))} /><button onClick={() => setQueue(Math.min(5000, queue + 1))}>＋</button></div><div className="quick-count">{[0, 5, 10, 20, 50].map((value) => <button key={value} onClick={() => setQueue(value)}>{value}人</button>)}</div><button className="primary-button" onClick={() => onPatch({ queueLength: queue })} disabled={busy || queue === booth.queueLength}>{busy ? "送信中…" : `約${preview}分待ちとして更新`}</button></div>
        <button className="served-button" onClick={onServed} disabled={busy || booth.status !== "open" || booth.queueLength === 0}>✓ {booth.capacity}人をご案内しました</button>
        <div className="operation-block"><label>来場者向けのお知らせ</label><textarea maxLength={120} value={notice} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setNotice(event.target.value)} placeholder="整理券、売切、入口変更など" /><small>{notice.length}/120文字</small><button className="secondary-button" onClick={() => onPatch({ notice })} disabled={busy || notice === booth.notice}>お知らせを更新</button></div>
        <div className="operation-note">同じ企画を複数端末で同時更新した場合、後から送った端末には競合警告が表示されます。1企画1端末を基本にしてください。</div>
      </section>
    </div>
  );
}

function SnapshotModal({ snapshots, busy, onRestore, onClose }: { snapshots: SnapshotMeta[]; busy: boolean; onRestore: (snapshot: SnapshotMeta) => void; onClose: () => void }): React.JSX.Element {
  const sheetRef = useSheetBehavior(onClose);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section ref={sheetRef} tabIndex={-1} className="dialog" onMouseDown={(event: MouseEvent<HTMLElement>) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="サーバーに保存したスナップショット">
        <div className="dialog__header"><div><small>SNAPSHOT</small><h2>サーバー保存の履歴</h2></div><button onClick={onClose} aria-label="閉じる">×</button></div>
        <div className="snapshot-list">
          {snapshots.map((snapshot) => (
            <div key={snapshot.id} className="snapshot-row">
              <div>
                <strong>{new Date(snapshot.createdAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</strong>
                <small>{snapshot.label || "自動保存"} · 企画{snapshot.boothCount}件 / 演目{snapshot.eventCount}件</small>
              </div>
              <button className="secondary-button" disabled={busy} onClick={() => onRestore(snapshot)}>この時点へ復元</button>
            </div>
          ))}
          {snapshots.length === 0 && <p className="snapshot-empty">保存されたスナップショットはまだありません。「サーバーへ保存」や全件置換時の自動保存で作成されます。</p>}
        </div>
        <div className="operation-note" style={{ margin: "0 18px 16px" }}>復元は「全件置換」で行われ、実行直前の状態も自動でサーバーに保存されます。</div>
      </section>
    </div>
  );
}

function ImportModal({ preview, mode, setMode, busy, onApply, onClose }: { preview: ImportPreview<Booth | TimetableEvent>; mode: ImportMode; setMode: (mode: ImportMode) => void; busy: boolean; onApply: () => void; onClose: () => void }): React.JSX.Element {
  const errors = preview.issues.filter((item) => item.level === "error");
  const warnings = preview.issues.filter((item) => item.level === "warning");
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const sheetRef = useSheetBehavior(onClose);
  const selectMode = (nextMode: ImportMode) => {
    setMode(nextMode);
    if (nextMode !== "replace") setReplaceConfirmed(false);
  };
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section ref={sheetRef} tabIndex={-1} className="dialog" onMouseDown={(event: MouseEvent<HTMLElement>) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="取込内容の確認">
        <div className="dialog__header"><div><small>{preview.sourceName}</small><h2>{preview.kind === "booths" ? "企画一覧" : "タイムテーブル"}の取込確認</h2></div><button onClick={onClose}>×</button></div>
        <div className="import-summary"><div><strong>{preview.rows.length}</strong><span>データ件数</span></div><div className={errors.length ? "has-error" : ""}><strong>{errors.length}</strong><span>エラー</span></div><div className={warnings.length ? "has-warning" : ""}><strong>{warnings.length}</strong><span>警告</span></div></div>
        <div className="operation-block"><label>反映方法</label><div className="segmented segmented--two"><button className={mode === "merge" ? "is-active" : ""} onClick={() => selectMode("merge")}><strong>追加・更新</strong><small>同じidだけ上書き</small></button><button className={mode === "replace" ? "is-active" : ""} onClick={() => selectMode("replace")}><strong>全件置換</strong><small>未記載データは削除</small></button></div>{mode === "replace" && <div className="warning-box"><strong>全件置換を選択しています</strong><span>現在登録中の同種データはファイル内容へ置き換わります。反映直前に、この端末とサーバーの両方へ自動バックアップを保存します。</span><label className="confirm-check"><input type="checkbox" checked={replaceConfirmed} onChange={(event: ChangeEvent<HTMLInputElement>) => setReplaceConfirmed(event.target.checked)} /> 未記載データが削除されることを確認しました</label></div>}</div>
        <div className="issue-list">
          {preview.issues.slice(0, 100).map((item, index) => <div key={`${item.row}-${index}`} className={`issue issue--${item.level}`}><strong>{item.level === "error" ? "エラー" : "警告"} · {item.row}行目{item.field ? ` · ${item.field}` : ""}</strong><span>{item.message}</span></div>)}
          {preview.issues.length === 0 && <div className="success-box">✓ 自動検証を通過しました。内容を確認して反映してください。</div>}
          {preview.issues.length > 100 && <p>ほか{preview.issues.length - 100}件あります。ファイルを修正して再度取り込んでください。</p>}
        </div>
        <div className="dialog__footer"><button className="secondary-button" onClick={onClose}>キャンセル</button><button className="primary-button" disabled={busy || errors.length > 0 || (mode === "replace" && !replaceConfirmed)} onClick={onApply}>{busy ? "反映中…" : errors.length > 0 ? "エラーを修正してください" : mode === "replace" && !replaceConfirmed ? "削除確認にチェックしてください" : `${preview.rows.length}件を反映`}</button></div>
      </section>
    </div>
  );
}

export default App;
