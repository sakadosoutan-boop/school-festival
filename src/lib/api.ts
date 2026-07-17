import { defaultFestivalData } from "../data/defaults";
import type { ApiResult, Booth, FestivalData, FestivalSettings, ImportMode, PendingMutation, TimetableEvent } from "../types";

const API_URL = (import.meta.env.VITE_FESTIVAL_API_URL as string | undefined)?.trim();
const PUBLIC_KEY = ((import.meta.env.VITE_FESTIVAL_PUBLIC_KEY as string | undefined) ?? (import.meta.env.VITE_FESTIVAL_ANON_KEY as string | undefined))?.trim();
const CACHE_KEY = "machitime:v5:cache";
const DEMO_KEY = "machitime:v5:demo";
const PENDING_KEY = "machitime:v5:pending";
const DEMO_PIN_KEY = "machitime:v5:demo-pin";

export const backendConfigured = Boolean(API_URL && PUBLIC_KEY);

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
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: PUBLIC_KEY,
      },
      body: JSON.stringify({ action, ...payload }),
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
    return { ok: false, error: error instanceof Error ? error.message : "ネットワークエラー", code: "NETWORK" };
  }
}

export function cachedData(): FestivalData {
  return readJson<FestivalData>(CACHE_KEY, readJson<FestivalData>(DEMO_KEY, cloneDefault()));
}

export async function fetchFestivalData(): Promise<ApiResult<FestivalData>> {
  if (!backendConfigured) {
    const data = readJson<FestivalData>(DEMO_KEY, cloneDefault());
    writeJson(DEMO_KEY, data);
    return { ok: true, data };
  }
  const result = await remote<FestivalData>("get_public");
  if (result.ok && result.data) writeJson(CACHE_KEY, result.data);
  return result;
}

export async function verifyPin(pin: string): Promise<ApiResult<{ valid: boolean }>> {
  if (!backendConfigured) return { ok: true, data: { valid: pin === (localStorage.getItem(DEMO_PIN_KEY) ?? "202608") } };
  return remote("verify_pin", { pin });
}

export async function updateBooth(pin: string, booth: Booth, expectedRevision: number): Promise<ApiResult<Booth>> {
  if (!backendConfigured) {
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

export async function changePin(currentPin: string, nextPin: string): Promise<ApiResult<{ changed: boolean }>> {
  if (!backendConfigured) {
    const valid = currentPin === (localStorage.getItem(DEMO_PIN_KEY) ?? "202608");
    if (valid) localStorage.setItem(DEMO_PIN_KEY, nextPin);
    return { ok: valid, data: { changed: valid }, error: valid ? undefined : "現在のPINが違います。" };
  }
  return remote("change_pin", { pin: currentPin, nextPin });
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
