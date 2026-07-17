import { defaultFestivalData } from "../data/defaults";
import type {
  ApiResult,
  Booth,
  FestivalData,
  FestivalSettings,
  ImportMode,
  PendingMutation,
  SnapshotMeta,
  StaffRole,
  TimetableEvent,
} from "../types";

const API_URL = (import.meta.env.VITE_FESTIVAL_API_URL as string | undefined)?.trim();
const PUBLIC_KEY = ((import.meta.env.VITE_FESTIVAL_PUBLIC_KEY as string | undefined) ?? (import.meta.env.VITE_FESTIVAL_ANON_KEY as string | undefined))?.trim();
const CACHE_KEY = "machitime:v5:cache";
const DEMO_KEY = "machitime:v5:demo";
const PENDING_KEY = "machitime:v5:pending";
const DEMO_PIN_KEY = "machitime:v5:demo-pin";
const DEMO_ADMIN_PIN_KEY = "machitime:v5:demo-admin-pin";
const DEMO_SNAPSHOTS_KEY = "machitime:v5:demo-snapshots";

// 校内Wi-Fiでは応答が返らないままハングする接続が珍しくない。
// タイムアウトを切らないと「読み込み中」のまま画面が固まり続ける。
const REQUEST_TIMEOUT_MS = 12_000;

export const backendConfigured = Boolean(API_URL && PUBLIC_KEY);

export const DEMO_STAFF_PIN = "202608";
export const DEMO_ADMIN_PIN = "202609";

function cloneDefault(): FestivalData {
  return structuredClone(defaultFestivalData);
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
    // Storage can be unavailable in private mode. The app still works in memory.
  }
}

async function remote<T>(action: string, payload: Record<string, unknown> = {}): Promise<ApiResult<T>> {
  if (!API_URL || !PUBLIC_KEY) return { ok: false, error: "共有APIが設定されていません。", code: "NOT_CONFIGURED" };
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: PUBLIC_KEY,
      },
      body: JSON.stringify({ action, ...payload }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok || body.ok === false) {
      return {
        ok: false,
        error: typeof body.error === "string" ? body.error : `通信に失敗しました (${response.status})`,
        code: typeof body.code === "string" ? body.code : `HTTP_${response.status}`,
        current: body.current as Booth | undefined,
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
  return readJson<FestivalData>(CACHE_KEY, readJson<FestivalData>(DEMO_KEY, cloneDefault()));
}

export function hasCachedData(): boolean {
  try {
    return localStorage.getItem(backendConfigured ? CACHE_KEY : DEMO_KEY) !== null;
  } catch {
    return false;
  }
}

// knownVersionが最新と一致する間はサーバーが notModified を返し、
// 大きなペイロードの転送とDB読取をスキップできる(全端末ポーリングの負荷対策)。
export async function fetchFestivalData(knownVersion?: string): Promise<ApiResult<FestivalData>> {
  if (!backendConfigured) {
    const data = readJson<FestivalData>(DEMO_KEY, cloneDefault());
    writeJson(DEMO_KEY, data);
    return { ok: true, data };
  }
  const result = await remote<FestivalData & { notModified?: boolean }>("get_public", knownVersion ? { knownVersion } : {});
  if (result.ok && result.data?.notModified) return { ok: true, notModified: true };
  if (result.ok && result.data) writeJson(CACHE_KEY, result.data);
  return result;
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

export async function updateBooth(pin: string, booth: Booth, expectedRevision: number): Promise<ApiResult<Booth>> {
  if (!backendConfigured) {
    if (!demoRole(pin)) return { ok: false, error: "スタッフPINが違います。", code: "INVALID_PIN" };
    const data = readJson<FestivalData>(DEMO_KEY, cloneDefault());
    const index = data.booths.findIndex((item) => item.id === booth.id);
    if (index < 0) return { ok: false, error: "対象の企画が見つかりません。", code: "NOT_FOUND" };
    const current = data.booths[index];
    if (current && current.revision !== expectedRevision) return { ok: false, error: "別の端末で更新されています。", code: "CONFLICT", current };
    data.booths[index] = { ...booth, revision: expectedRevision + 1, lastUpdated: new Date().toISOString() };
    data.fetchedAt = new Date().toISOString();
    writeJson(DEMO_KEY, data);
    writeJson(CACHE_KEY, data);
    return { ok: true, data: data.booths[index] };
  }
  return remote("update_booth", { pin, booth, expectedRevision });
}

export async function applyImport(
  pin: string,
  mode: ImportMode,
  booths?: Booth[],
  timetable?: TimetableEvent[],
): Promise<ApiResult<FestivalData>> {
  if (!backendConfigured) {
    if (demoRole(pin) !== "admin") return { ok: false, error: "データ取込は管理者PINが必要です。", code: "ADMIN_ONLY" };
    if (mode === "replace") await createSnapshot(pin, "全件置換前の自動保存");
    const data = readJson<FestivalData>(DEMO_KEY, cloneDefault());
    if (booths) {
      if (mode === "replace") data.booths = booths;
      else {
        const map = new Map(data.booths.map((item) => [item.id, item]));
        booths.forEach((item) => map.set(item.id, { ...map.get(item.id), ...item }));
        data.booths = [...map.values()];
      }
    }
    if (timetable) {
      if (mode === "replace") data.timetable = timetable;
      else {
        const map = new Map(data.timetable.map((item) => [item.id, item]));
        timetable.forEach((item) => map.set(item.id, item));
        data.timetable = [...map.values()];
      }
    }
    data.settings.lastPublishedAt = new Date().toISOString();
    data.version = `demo-${Date.now()}`;
    data.fetchedAt = new Date().toISOString();
    writeJson(DEMO_KEY, data);
    writeJson(CACHE_KEY, data);
    return { ok: true, data };
  }
  return remote("apply_import", { pin, mode, booths, timetable });
}

export async function updateFestivalSettings(pin: string, patch: Partial<FestivalSettings>): Promise<ApiResult<FestivalData>> {
  if (!backendConfigured) {
    if (demoRole(pin) !== "admin") return { ok: false, error: "重要なお知らせの更新は管理者PINが必要です。", code: "ADMIN_ONLY" };
    const data = readJson<FestivalData>(DEMO_KEY, cloneDefault());
    data.settings = { ...data.settings, ...patch, lastPublishedAt: new Date().toISOString() };
    data.version = `demo-${Date.now()}`;
    data.fetchedAt = new Date().toISOString();
    writeJson(DEMO_KEY, data);
    writeJson(CACHE_KEY, data);
    return { ok: true, data };
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

interface DemoSnapshot extends SnapshotMeta {
  payload: { booths: Booth[]; timetable: TimetableEvent[] };
}

export async function createSnapshot(pin: string, label: string): Promise<ApiResult<SnapshotMeta>> {
  if (!backendConfigured) {
    if (demoRole(pin) !== "admin") return { ok: false, error: "スナップショットは管理者PINが必要です。", code: "ADMIN_ONLY" };
    const data = readJson<FestivalData>(DEMO_KEY, cloneDefault());
    const snapshots = readJson<DemoSnapshot[]>(DEMO_SNAPSHOTS_KEY, []);
    const snapshot: DemoSnapshot = {
      id: Date.now(),
      createdAt: new Date().toISOString(),
      label,
      boothCount: data.booths.length,
      eventCount: data.timetable.length,
      payload: { booths: data.booths, timetable: data.timetable },
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
    return applyImport(pin, "replace", snapshot.payload.booths, snapshot.payload.timetable);
  }
  return remote("restore_snapshot", { pin, snapshotId });
}

export function pendingMutations(): PendingMutation[] {
  return readJson<PendingMutation[]>(PENDING_KEY, []);
}

export function queueMutation(mutation: PendingMutation): void {
  const pending = pendingMutations().filter((item) => item.id !== mutation.id);
  pending.push(mutation);
  writeJson(PENDING_KEY, pending.slice(-50));
}

export function removePendingMutation(id: string): void {
  writeJson(PENDING_KEY, pendingMutations().filter((item) => item.id !== id));
}

export async function flushPending(pin: string): Promise<{ completed: number; conflicts: number; failed: number }> {
  const pending = pendingMutations();
  let completed = 0;
  let conflicts = 0;
  let failed = 0;
  for (const mutation of pending) {
    const data = cachedData();
    const current = data.booths.find((item) => item.id === mutation.boothId);
    if (!current) {
      removePendingMutation(mutation.id);
      failed += 1;
      continue;
    }
    const next = { ...current, ...mutation.patch };
    const result = await updateBooth(pin, next, mutation.expectedRevision);
    if (result.ok) {
      removePendingMutation(mutation.id);
      completed += 1;
    } else if (result.code === "CONFLICT") {
      removePendingMutation(mutation.id);
      conflicts += 1;
    } else {
      failed += 1;
    }
  }
  return { completed, conflicts, failed };
}
