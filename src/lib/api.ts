import { makeBooth, sanitizeStage, seedBooths, seedStage } from "./festival";
import type { ApiResult, Booth, FestivalData, FestivalSettings, SnapshotMeta, StaffRole, StageProgram } from "../types";

/*
 * v4プロトタイプの `window.storage`(Claude環境専用)を置き換えるデータ層。
 *  - 共有API(Supabase Edge Function)が設定されていれば全端末で同期する。
 *  - 未設定ならデモモードとして、この端末のlocalStorageだけで完結する。
 * 書き込みはブース単位のLWW(後勝ち)。「1ブース1端末」を前提とするv4の設計を踏襲し、
 * 通信断のときは端末に保留して復帰時に再送する。
 */

const API_URL = (import.meta.env.VITE_FESTIVAL_API_URL as string | undefined)?.trim();
const PUBLIC_KEY = ((import.meta.env.VITE_FESTIVAL_PUBLIC_KEY as string | undefined) ?? (import.meta.env.VITE_FESTIVAL_ANON_KEY as string | undefined))?.trim();

const CACHE_KEY = "machitime:v6:cache";
const DEMO_KEY = "machitime:v6:demo";
const PENDING_KEY = "machitime:v6:pending";
const DEMO_PIN_KEY = "machitime:v6:demo-pin";
const DEMO_ADMIN_PIN_KEY = "machitime:v6:demo-admin-pin";
const DEMO_SNAPSHOTS_KEY = "machitime:v6:demo-snapshots";

const REQUEST_TIMEOUT_MS = 12_000;

export const backendConfigured = Boolean(API_URL && PUBLIC_KEY);
export const DEMO_STAFF_PIN = "2025";
export const DEMO_ADMIN_PIN = "202609";

interface PendingWrite {
  boothId: string;
  doc: Booth;
  queuedAt: number;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // プライベートモード等でstorageが使えなくても、メモリ上の状態で動き続ける。
  }
}

const DEFAULT_SETTINGS: FestivalSettings = { festivalName: "文化祭", emergencyNotice: "" };

function makeDemoData(): FestivalData {
  return {
    booths: seedBooths(),
    stage: seedStage(),
    settings: { ...DEFAULT_SETTINGS },
    version: `demo-${Date.now()}`,
    fetchedAt: Date.now(),
  };
}

function readDemo(): FestivalData {
  const stored = readJson<FestivalData | null>(DEMO_KEY, null);
  if (!stored) {
    const seeded = makeDemoData();
    writeJson(DEMO_KEY, seeded);
    return seeded;
  }
  return {
    booths: (Array.isArray(stored.booths) ? stored.booths : []).map((b) => makeBooth(b, (b as Booth).id)),
    stage: sanitizeStage(stored.stage),
    settings: { ...DEFAULT_SETTINGS, ...(stored.settings ?? {}) },
    version: stored.version || `demo-${Date.now()}`,
    fetchedAt: stored.fetchedAt || Date.now(),
  };
}

function writeDemo(data: FestivalData): FestivalData {
  const next = { ...data, version: `demo-${Date.now()}`, fetchedAt: Date.now() };
  writeJson(DEMO_KEY, next);
  writeJson(CACHE_KEY, next);
  return next;
}

async function remote<T>(action: string, payload: Record<string, unknown> = {}): Promise<ApiResult<T>> {
  if (!API_URL || !PUBLIC_KEY) return { ok: false, error: "共有APIが設定されていません。", code: "NOT_CONFIGURED" };
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: PUBLIC_KEY },
      body: JSON.stringify({ action, ...payload }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok || body.ok === false) {
      return {
        ok: false,
        error: typeof body.error === "string" ? body.error : `通信に失敗しました (${response.status})`,
        code: typeof body.code === "string" ? body.code : `HTTP_${response.status}`,
      };
    }
    return { ok: true, data: (body.data ?? body) as T };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, error: "通信がタイムアウトしました。", code: "NETWORK" };
    }
    return { ok: false, error: error instanceof Error ? error.message : "ネットワークエラー", code: "NETWORK" };
  } finally {
    window.clearTimeout(timeout);
  }
}

export function cachedData(): FestivalData {
  if (!backendConfigured) return readDemo();
  const cached = readJson<FestivalData | null>(CACHE_KEY, null);
  if (!cached) return makeDemoData();
  return {
    booths: (Array.isArray(cached.booths) ? cached.booths : []).map((b) => makeBooth(b, (b as Booth).id)),
    stage: sanitizeStage(cached.stage),
    settings: { ...DEFAULT_SETTINGS, ...(cached.settings ?? {}) },
    version: cached.version || "",
    fetchedAt: cached.fetchedAt || 0,
  };
}

export function hasCachedData(): boolean {
  try {
    return localStorage.getItem(backendConfigured ? CACHE_KEY : DEMO_KEY) !== null;
  } catch {
    return false;
  }
}

// knownVersionが最新と一致する間はサーバーが notModified を返し、
// アイコン画像を含む大きなペイロードの転送をスキップする(全端末ポーリングの負荷対策)。
export async function fetchAll(knownVersion?: string): Promise<ApiResult<FestivalData>> {
  if (!backendConfigured) {
    return { ok: true, data: readDemo() };
  }
  const result = await remote<FestivalData & { notModified?: boolean }>("get_public", knownVersion ? { knownVersion } : {});
  if (result.ok && result.data?.notModified) return { ok: true, notModified: true };
  if (result.ok && result.data) {
    const data: FestivalData = {
      booths: (result.data.booths ?? []).map((b) => makeBooth(b, b.id)),
      stage: sanitizeStage(result.data.stage),
      settings: { ...DEFAULT_SETTINGS, ...(result.data.settings ?? {}) },
      version: String(result.data.version ?? ""),
      fetchedAt: Date.now(),
    };
    writeJson(CACHE_KEY, data);
    return { ok: true, data };
  }
  return { ok: false, error: result.error, code: result.code };
}

function demoRole(pin: string): StaffRole | null {
  if (pin === (localStorage.getItem(DEMO_ADMIN_PIN_KEY) ?? DEMO_ADMIN_PIN)) return "admin";
  if (pin === (localStorage.getItem(DEMO_PIN_KEY) ?? DEMO_STAFF_PIN)) return "staff";
  return null;
}

export async function verifyPin(pin: string): Promise<ApiResult<{ valid: boolean; role?: StaffRole }>> {
  if (!backendConfigured) {
    const role = demoRole(pin);
    return { ok: true, data: role ? { valid: true, role } : { valid: false } };
  }
  return remote("verify_pin", { pin });
}

/* ── ブース書込(LWW)。通信断は保留キューへ ── */

export function pendingWrites(): PendingWrite[] {
  return readJson<PendingWrite[]>(PENDING_KEY, []);
}

function queueWrite(booth: Booth): void {
  const pending = pendingWrites().filter((item) => item.boothId !== booth.id);
  pending.push({ boothId: booth.id, doc: booth, queuedAt: Date.now() });
  writeJson(PENDING_KEY, pending.slice(-60));
}

export async function saveBooth(pin: string, booth: Booth): Promise<ApiResult<Booth> & { queued?: boolean }> {
  if (!backendConfigured) {
    if (!demoRole(pin)) return { ok: false, error: "スタッフPINが違います。", code: "INVALID_PIN" };
    const data = readDemo();
    const index = data.booths.findIndex((item) => item.id === booth.id);
    const next = makeBooth({ ...booth, rev: (index >= 0 ? data.booths[index]!.rev : 0) + 1 }, booth.id);
    if (index >= 0) data.booths[index] = next; else data.booths.push(next);
    writeDemo(data);
    return { ok: true, data: next };
  }
  const result = await remote<Booth>("save_booth", { pin, booth });
  if (!result.ok && result.code === "NETWORK") {
    queueWrite(booth);
    return { ok: true, data: booth, queued: true };
  }
  return result;
}

export async function flushPending(pin: string): Promise<{ completed: number; failed: number }> {
  const pending = pendingWrites();
  let completed = 0;
  let failed = 0;
  for (const item of pending) {
    const result = await remote<Booth>("save_booth", { pin, booth: item.doc });
    if (result.ok) {
      writeJson(PENDING_KEY, pendingWrites().filter((p) => p.boothId !== item.boothId || p.queuedAt !== item.queuedAt));
      completed += 1;
    } else if (result.code === "NETWORK") {
      failed += 1;
      break; // まだオフライン。残りは次回に回す。
    } else {
      // PIN無効などの恒久エラーは破棄して数え上げる。
      writeJson(PENDING_KEY, pendingWrites().filter((p) => p.boothId !== item.boothId || p.queuedAt !== item.queuedAt));
      failed += 1;
    }
  }
  return { completed, failed };
}

export async function deleteBooth(pin: string, boothId: string): Promise<ApiResult<{ deleted: boolean }>> {
  if (!backendConfigured) {
    if (!demoRole(pin)) return { ok: false, error: "スタッフPINが違います。", code: "INVALID_PIN" };
    const data = readDemo();
    data.booths = data.booths.filter((item) => item.id !== boothId);
    writeDemo(data);
    return { ok: true, data: { deleted: true } };
  }
  return remote("delete_booth", { pin, boothId });
}

export async function saveStage(pin: string, stage: StageProgram): Promise<ApiResult<StageProgram>> {
  if (!backendConfigured) {
    if (!demoRole(pin)) return { ok: false, error: "スタッフPINが違います。", code: "INVALID_PIN" };
    const data = readDemo();
    data.stage = sanitizeStage(stage);
    writeDemo(data);
    return { ok: true, data: data.stage };
  }
  return remote("save_stage", { pin, stage });
}

export async function updateSettings(pin: string, patch: Partial<FestivalSettings>): Promise<ApiResult<FestivalSettings>> {
  if (!backendConfigured) {
    if (demoRole(pin) !== "admin") return { ok: false, error: "この操作は管理者PINが必要です。", code: "ADMIN_ONLY" };
    const data = readDemo();
    data.settings = { ...data.settings, ...patch };
    writeDemo(data);
    return { ok: true, data: data.settings };
  }
  return remote("update_settings", { pin, patch });
}

export async function changePin(currentPin: string, target: StaffRole, nextPin: string): Promise<ApiResult<{ changed: boolean }>> {
  if (!backendConfigured) {
    if (demoRole(currentPin) !== "admin") return { ok: false, error: "PIN変更は管理者PINが必要です。", code: "ADMIN_ONLY" };
    localStorage.setItem(target === "admin" ? DEMO_ADMIN_PIN_KEY : DEMO_PIN_KEY, nextPin);
    return { ok: true, data: { changed: true } };
  }
  return remote("change_pin", { pin: currentPin, target, nextPin });
}

/* ── 全データ入替(JSONバックアップの読込・サンプルへのリセット) ── */

export async function replaceAll(pin: string, booths: Booth[], stage?: StageProgram): Promise<ApiResult<FestivalData>> {
  if (!backendConfigured) {
    if (demoRole(pin) !== "admin") return { ok: false, error: "全データの入替は管理者PINが必要です。", code: "ADMIN_ONLY" };
    await createSnapshot(pin, "入替前の自動保存");
    const data = readDemo();
    data.booths = booths.map((b) => makeBooth(b, b.id));
    if (stage) data.stage = sanitizeStage(stage);
    const next = writeDemo(data);
    return { ok: true, data: next };
  }
  return remote("replace_all", { pin, booths, stage });
}

/* ── サーバー側スナップショット ── */

interface DemoSnapshot extends SnapshotMeta {
  payload: { booths: Booth[]; stage: StageProgram };
}

export async function createSnapshot(pin: string, label: string): Promise<ApiResult<SnapshotMeta>> {
  if (!backendConfigured) {
    if (demoRole(pin) !== "admin") return { ok: false, error: "スナップショットは管理者PINが必要です。", code: "ADMIN_ONLY" };
    const data = readDemo();
    const snapshots = readJson<DemoSnapshot[]>(DEMO_SNAPSHOTS_KEY, []);
    const snapshot: DemoSnapshot = {
      id: Date.now(),
      createdAt: new Date().toISOString(),
      label,
      boothCount: data.booths.length,
      eventCount: data.stage.items.length,
      payload: { booths: data.booths, stage: data.stage },
    };
    writeJson(DEMO_SNAPSHOTS_KEY, [snapshot, ...snapshots].slice(0, 5));
    return { ok: true, data: snapshot };
  }
  return remote("create_snapshot", { pin, label });
}

export async function listSnapshots(pin: string): Promise<ApiResult<SnapshotMeta[]>> {
  if (!backendConfigured) {
    if (demoRole(pin) !== "admin") return { ok: false, error: "スナップショットは管理者PINが必要です。", code: "ADMIN_ONLY" };
    return { ok: true, data: readJson<DemoSnapshot[]>(DEMO_SNAPSHOTS_KEY, []).map(({ payload: _payload, ...meta }) => meta) };
  }
  return remote("list_snapshots", { pin });
}

export async function restoreSnapshot(pin: string, snapshotId: number): Promise<ApiResult<FestivalData>> {
  if (!backendConfigured) {
    if (demoRole(pin) !== "admin") return { ok: false, error: "復元は管理者PINが必要です。", code: "ADMIN_ONLY" };
    const snapshot = readJson<DemoSnapshot[]>(DEMO_SNAPSHOTS_KEY, []).find((item) => item.id === snapshotId);
    if (!snapshot) return { ok: false, error: "対象のスナップショットが見つかりません。", code: "NOT_FOUND" };
    return replaceAll(pin, snapshot.payload.booths, snapshot.payload.stage);
  }
  return remote("restore_snapshot", { pin, snapshotId });
}
