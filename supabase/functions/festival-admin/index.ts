import { createClient } from "npm:@supabase/supabase-js@2";

function firstNamedKey(jsonValue: string | undefined): string | undefined {
  if (!jsonValue) return undefined;
  try {
    const parsed = JSON.parse(jsonValue) as Record<string, string>;
    return parsed.default ?? Object.values(parsed)[0];
  } catch {
    return undefined;
  }
}

function allNamedKeys(jsonValue: string | undefined): string[] {
  if (!jsonValue) return [];
  try {
    return Object.values(JSON.parse(jsonValue) as Record<string, string>).filter(Boolean);
  } catch {
    return [];
  }
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = firstNamedKey(Deno.env.get("SUPABASE_SECRET_KEYS"))
  ?? Deno.env.get("SUPABASE_SECRET_KEY")
  ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  ?? "";
const PUBLISHABLE_KEYS = new Set([
  ...allNamedKeys(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")),
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "",
  Deno.env.get("SUPABASE_ANON_KEY") ?? "",
].filter(Boolean));
// カンマ区切りで複数オリジンを許可（本番 + ローカル検証など）。
// 例: ALLOWED_ORIGIN=https://xxx.github.io,http://localhost:5173
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGIN") ?? "*").split(",").map((value) => value.trim()).filter(Boolean);

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Supabase admin credentials are not available to the Edge Function.");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BOOTH_CATEGORY_SET = new Set(["attraction", "food", "game", "experience", "stage", "exhibition", "other"]);
const BOOTH_STATUS_SET = new Set(["open", "paused", "closed", "sold_out"]);
const FESTIVAL_DAY_SET = new Set(["2026-08-29", "2026-08-30"]);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ID_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const MAX_WAIT_MINUTES = 600;
const HISTORY_LIMIT = 48;
const PUBLIC_HISTORY_LIMIT = 24;
const SNAPSHOT_KEEP = 30;
const GLOBAL_LIMIT_ID = "global";

function corsHeadersFor(origin: string | null): Record<string, string> {
  const allowAny = ALLOWED_ORIGINS.includes("*");
  const allowOrigin = allowAny
    ? "*"
    : origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] ?? "*";
  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-max-age": "86400",
    ...(allowAny ? {} : { vary: "origin" }),
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  };
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function callerFingerprint(request: Request): Promise<string> {
  const ip = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-real-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
  const agent = request.headers.get("user-agent") ?? "unknown";
  return sha256(`${ip}|${agent.slice(0, 160)}`);
}

async function rateLimitState(identifier: string): Promise<{ blocked: boolean; retryAfterSeconds: number }> {
  const { data, error } = await supabase
    .from("staff_pin_attempts")
    .select("identifier,blocked_until")
    .in("identifier", [identifier, GLOBAL_LIMIT_ID]);
  if (error) throw error;
  let retry = 0;
  for (const row of data ?? []) {
    if (!row.blocked_until) continue;
    retry = Math.max(retry, Math.ceil((Date.parse(row.blocked_until) - Date.now()) / 1000));
  }
  return retry > 0 ? { blocked: true, retryAfterSeconds: retry } : { blocked: false, retryAfterSeconds: 0 };
}

async function bumpFailure(identifier: string, maxAttempts: number, blockMinutes: number): Promise<void> {
  const now = Date.now();
  const { data, error } = await supabase
    .from("staff_pin_attempts")
    .select("window_started,attempts")
    .eq("identifier", identifier)
    .maybeSingle();
  if (error) throw error;

  const windowStart = data?.window_started ? Date.parse(data.window_started) : 0;
  const withinWindow = now - windowStart < 10 * 60_000;
  const attempts = withinWindow ? Number(data?.attempts ?? 0) + 1 : 1;
  const blockedUntil = attempts >= maxAttempts ? new Date(now + blockMinutes * 60_000).toISOString() : null;

  const { error: upsertError } = await supabase.from("staff_pin_attempts").upsert({
    identifier,
    window_started: withinWindow && data?.window_started ? data.window_started : new Date(now).toISOString(),
    attempts,
    blocked_until: blockedUntil,
    updated_at: new Date(now).toISOString(),
  });
  if (upsertError) throw upsertError;
}

// 端末単位の制限はUAを変えるだけで回避できてしまうため、全体の失敗回数にも
// 上限を設ける。10分間に全体で40回失敗したら、PIN認証全体を10分間停止する。
async function recordFailedPin(identifier: string): Promise<void> {
  await bumpFailure(identifier, 8, 15);
  await bumpFailure(GLOBAL_LIMIT_ID, 40, 10);
}

async function clearFailedPins(identifier: string): Promise<void> {
  const { error } = await supabase.from("staff_pin_attempts").delete().eq("identifier", identifier);
  if (error) throw error;
  // 使い終わった記録が溜まり続けないよう、古い行はログイン成功時に掃除する。
  await supabase.from("staff_pin_attempts").delete()
    .neq("identifier", GLOBAL_LIMIT_ID)
    .lt("updated_at", new Date(Date.now() - 24 * 60 * 60_000).toISOString());
}

async function resolvePinRole(pin: unknown): Promise<"admin" | "staff" | null> {
  if (typeof pin !== "string" || !/^\d{6,8}$/.test(pin)) return null;
  const { data, error } = await supabase.rpc("resolve_pin_role", { p_pin: pin });
  if (error) throw error;
  return data === "admin" || data === "staff" ? data : null;
}

async function audit(action: string, target: string, caller: string, detail: Record<string, unknown> = {}): Promise<void> {
  const { error } = await supabase.from("audit_log").insert({ action, target, caller, detail });
  if (error) console.error("audit_log insert failed", error);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function boundedText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function isoOrNow(value: unknown): string {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : new Date().toISOString();
}

function waitFor(queueLength: number, capacity: number, cycleMinutes: number): number {
  if (queueLength <= 0 || capacity <= 0 || cycleMinutes <= 0) return 0;
  return Math.min(MAX_WAIT_MINUTES, Math.max(1, Math.round(Math.ceil(queueLength / capacity) * cycleMinutes)));
}

type SanitizeResult = { ok: true; value: Record<string, unknown> } | { ok: false; reason: string };

// クライアントの検証をすり抜けた値がDBの制約違反 → 原因の分からない500になる
// のを防ぐため、サーバー側でも同じ規則で正規化してから書き込む。
// waitMinutes はクライアントの申告値を信用せず、必ずここで再計算する。
function sanitizeBooth(raw: Record<string, unknown>): SanitizeResult {
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!ID_RE.test(id)) return { ok: false, reason: `id「${id || "(空)"}」が不正です` };
  const name = boundedText(raw.name, 80).trim();
  if (!name) return { ok: false, reason: `id「${id}」の企画名が空です` };
  const category = typeof raw.category === "string" && BOOTH_CATEGORY_SET.has(raw.category) ? raw.category : null;
  if (!category) return { ok: false, reason: `id「${id}」のcategoryが不正です` };
  const location = boundedText(raw.location, 120).trim();
  if (!location) return { ok: false, reason: `id「${id}」の場所が空です` };
  const days = Array.isArray(raw.days) ? raw.days.filter((day): day is string => typeof day === "string" && FESTIVAL_DAY_SET.has(day)) : [];
  if (days.length === 0) return { ok: false, reason: `id「${id}」の開催日が不正です` };
  const openTime = typeof raw.openTime === "string" && TIME_RE.test(raw.openTime) ? raw.openTime : null;
  const closeTime = typeof raw.closeTime === "string" && TIME_RE.test(raw.closeTime) ? raw.closeTime : null;
  if (!openTime || !closeTime || openTime >= closeTime) return { ok: false, reason: `id「${id}」の開催時間が不正です（HH:MM、開始<終了）` };

  const capacity = clampInt(raw.capacity, 1, 500, 1);
  const cycleMinutes = clampNumber(raw.cycleMinutes, 0.25, 180, 5);
  const queueLength = clampInt(raw.queueLength, 0, 5000, 0);
  const history = (Array.isArray(raw.history) ? raw.history : [])
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
    .filter((entry) => typeof entry.at === "string" && Number.isFinite(Date.parse(entry.at)) && Number.isFinite(Number(entry.waitMinutes)))
    .slice(-HISTORY_LIMIT)
    .map((entry) => ({ at: entry.at, waitMinutes: clampInt(entry.waitMinutes, 0, MAX_WAIT_MINUTES, 0) }));

  return {
    ok: true,
    value: {
      id,
      name,
      organizer: boundedText(raw.organizer, 80),
      category,
      location,
      description: boundedText(raw.description, 240),
      emoji: boundedText(raw.emoji, 8) || "🎪",
      days,
      openTime,
      closeTime,
      capacity,
      cycleMinutes,
      queueLength,
      waitMinutes: waitFor(queueLength, capacity, cycleMinutes),
      status: typeof raw.status === "string" && BOOTH_STATUS_SET.has(raw.status) ? raw.status : "closed",
      notice: boundedText(raw.notice, 120),
      sortOrder: clampInt(raw.sortOrder, -100000, 100000, 0),
      revision: clampInt(raw.revision, 1, Number.MAX_SAFE_INTEGER, 1),
      history,
      lastUpdated: isoOrNow(raw.lastUpdated),
    },
  };
}

function sanitizeEvent(raw: Record<string, unknown>): SanitizeResult {
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!ID_RE.test(id)) return { ok: false, reason: `id「${id || "(空)"}」が不正です` };
  const day = typeof raw.day === "string" && FESTIVAL_DAY_SET.has(raw.day) ? raw.day : null;
  if (!day) return { ok: false, reason: `id「${id}」の開催日が不正です` };
  const startTime = typeof raw.startTime === "string" && TIME_RE.test(raw.startTime) ? raw.startTime : null;
  const endTime = typeof raw.endTime === "string" && TIME_RE.test(raw.endTime) ? raw.endTime : null;
  if (!startTime || !endTime || startTime >= endTime) return { ok: false, reason: `id「${id}」の時間が不正です（HH:MM、開始<終了）` };
  const title = boundedText(raw.title, 80).trim();
  if (!title) return { ok: false, reason: `id「${id}」の演目名が空です` };
  const venue = boundedText(raw.venue, 80).trim();
  if (!venue) return { ok: false, reason: `id「${id}」の会場が空です` };
  return {
    ok: true,
    value: {
      id,
      day,
      startTime,
      endTime,
      title,
      organizer: boundedText(raw.organizer, 80),
      venue,
      category: boundedText(raw.category, 40) || "その他",
      description: boundedText(raw.description, 300),
      audience: boundedText(raw.audience, 60) || "全来場者",
      sortOrder: clampInt(raw.sortOrder, -100000, 100000, 0),
    },
  };
}

function sanitizeRows(
  rows: unknown[],
  sanitize: (raw: Record<string, unknown>) => SanitizeResult,
): { ok: true; values: Record<string, unknown>[] } | { ok: false; reason: string } {
  const values: Record<string, unknown>[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const raw = rows[index];
    if (typeof raw !== "object" || raw === null) return { ok: false, reason: `${index + 1}件目のデータ形式が不正です` };
    const result = sanitize(raw as Record<string, unknown>);
    if (!result.ok) return { ok: false, reason: `${index + 1}件目：${result.reason}` };
    values.push(result.value);
  }
  return { ok: true, values };
}

function boothFromDb(row: Record<string, unknown>) {
  const history = Array.isArray(row.history) ? row.history : [];
  return {
    id: row.id,
    name: row.name,
    organizer: row.organizer,
    category: row.category,
    location: row.location,
    description: row.description,
    emoji: row.emoji,
    days: row.days,
    openTime: row.open_time,
    closeTime: row.close_time,
    capacity: row.capacity,
    cycleMinutes: Number(row.cycle_minutes),
    queueLength: row.queue_length,
    waitMinutes: row.wait_minutes,
    status: row.status,
    notice: row.notice,
    sortOrder: row.sort_order,
    revision: Number(row.revision),
    lastUpdated: row.last_updated,
    // 全端末が数十秒ごとに受信する一覧ペイロードを軽く保つため、
    // 配信する履歴は直近分だけに絞る（DBには最大48件保持）。
    history: history.slice(-PUBLIC_HISTORY_LIMIT),
  };
}

function timetableFromDb(row: Record<string, unknown>) {
  return {
    id: row.id,
    day: row.day,
    startTime: row.start_time,
    endTime: row.end_time,
    title: row.title,
    organizer: row.organizer,
    venue: row.venue,
    category: row.category,
    description: row.description,
    audience: row.audience,
    sortOrder: row.sort_order,
  };
}

async function dataEtag(): Promise<string> {
  const { data, error } = await supabase.rpc("get_data_etag");
  if (error) throw error;
  return String(data ?? "");
}

async function getPublicData(version?: string) {
  const [settingsResult, boothsResult, timetableResult] = await Promise.all([
    supabase.from("festival_settings").select("festival_name,subtitle,dates,opening_hours,emergency_notice,last_published_at,version").eq("id", true).single(),
    supabase.from("booths").select("*").order("sort_order", { ascending: true }).order("name", { ascending: true }),
    supabase.from("timetable_events").select("*").order("day", { ascending: true }).order("start_time", { ascending: true }).order("sort_order", { ascending: true }),
  ]);

  const error = settingsResult.error ?? boothsResult.error ?? timetableResult.error;
  if (error) throw error;
  const settings = settingsResult.data;
  return {
    settings: {
      festivalName: settings.festival_name,
      subtitle: settings.subtitle,
      dates: settings.dates,
      openingHours: settings.opening_hours,
      emergencyNotice: settings.emergency_notice,
      lastPublishedAt: settings.last_published_at,
    },
    booths: (boothsResult.data ?? []).map((row) => boothFromDb(row)),
    timetable: (timetableResult.data ?? []).map((row) => timetableFromDb(row)),
    version: version ?? await dataEtag(),
    fetchedAt: new Date().toISOString(),
  };
}

function boothToDb(booth: Record<string, unknown>, revision: number) {
  return {
    name: booth.name,
    organizer: booth.organizer ?? "",
    category: booth.category,
    location: booth.location,
    description: booth.description ?? "",
    emoji: booth.emoji ?? "🎪",
    days: booth.days ?? [],
    open_time: booth.openTime,
    close_time: booth.closeTime,
    capacity: booth.capacity,
    cycle_minutes: booth.cycleMinutes,
    queue_length: booth.queueLength,
    wait_minutes: booth.waitMinutes,
    status: booth.status,
    notice: booth.notice ?? "",
    sort_order: booth.sortOrder ?? 0,
    history: booth.history ?? [],
    last_updated: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    revision: revision + 1,
  };
}

// 全件置換や復元の直前に、その時点の全データをサーバー側にも保存する。
// 端末側のダウンロードだけだと、その端末を紛失した時点で復元手段が消える。
async function storeSnapshot(label: string): Promise<{ id: number; createdAt: string; label: string; boothCount: number; eventCount: number }> {
  const data = await getPublicData("snapshot");
  const { data: inserted, error } = await supabase
    .from("backups")
    .insert({
      label,
      booth_count: data.booths.length,
      event_count: data.timetable.length,
      payload: { settings: data.settings, booths: data.booths, timetable: data.timetable },
    })
    .select("id,created_at,label,booth_count,event_count")
    .single();
  if (error) throw error;

  const { data: stale } = await supabase
    .from("backups")
    .select("id")
    .order("id", { ascending: false })
    .range(SNAPSHOT_KEEP, SNAPSHOT_KEEP + 200);
  if (stale && stale.length > 0) {
    await supabase.from("backups").delete().in("id", stale.map((row) => row.id));
  }
  return {
    id: Number(inserted.id),
    createdAt: String(inserted.created_at),
    label: String(inserted.label),
    boothCount: Number(inserted.booth_count),
    eventCount: Number(inserted.event_count),
  };
}

Deno.serve(async (request) => {
  const cors = corsHeadersFor(request.headers.get("origin"));
  const respond = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: cors });

  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return respond({ ok: false, error: "POST only" }, 405);

  try {
    const apiKey = request.headers.get("apikey") ?? "";
    if (PUBLISHABLE_KEYS.size === 0) {
      return respond({ ok: false, error: "公開キーがサーバーに設定されていません。", code: "SERVER_MISCONFIGURED" }, 500);
    }
    if (!PUBLISHABLE_KEYS.has(apiKey)) {
      return respond({ ok: false, error: "公開キーが正しくありません。", code: "INVALID_API_KEY" }, 401);
    }

    const body = await request.json() as Record<string, unknown>;
    const action = body.action;

    if (action === "get_public") {
      const knownVersion = typeof body.knownVersion === "string" ? body.knownVersion : undefined;
      const version = await dataEtag();
      if (knownVersion && knownVersion === version) {
        return respond({ ok: true, data: { notModified: true, version } });
      }
      return respond({ ok: true, data: await getPublicData(version) });
    }

    const identifier = await callerFingerprint(request);
    const limit = await rateLimitState(identifier);
    if (limit.blocked) {
      return respond({ ok: false, error: `PIN入力が一時的にロックされています。約${Math.ceil(limit.retryAfterSeconds / 60)}分後に再試行してください。`, code: "RATE_LIMITED" }, 429);
    }

    const role = await resolvePinRole(body.pin);
    if (!role) {
      await recordFailedPin(identifier);
      if (action === "verify_pin") return respond({ ok: true, data: { valid: false } });
      return respond({ ok: false, error: "スタッフPINが違います。", code: "INVALID_PIN" }, 401);
    }
    await clearFailedPins(identifier);

    if (action === "verify_pin") return respond({ ok: true, data: { valid: true, role } });

    if (action === "update_booth") {
      const booth = body.booth as Record<string, unknown> | undefined;
      const expectedRevision = Number(body.expectedRevision);
      if (!booth || typeof booth.id !== "string" || !Number.isInteger(expectedRevision)) {
        return respond({ ok: false, error: "更新データが不正です。", code: "INVALID_PAYLOAD" }, 400);
      }
      const sanitized = sanitizeBooth(booth);
      if (!sanitized.ok) {
        return respond({ ok: false, error: `更新データが不正です：${sanitized.reason}`, code: "INVALID_PAYLOAD" }, 400);
      }

      const { data, error } = await supabase
        .from("booths")
        .update(boothToDb(sanitized.value, expectedRevision))
        .eq("id", sanitized.value.id as string)
        .eq("revision", expectedRevision)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        const { data: current } = await supabase.from("booths").select("*").eq("id", sanitized.value.id as string).maybeSingle();
        return respond({ ok: false, error: "別の端末で先に更新されています。", code: "CONFLICT", current: current ? boothFromDb(current) : null }, 409);
      }
      await audit("update_booth", String(sanitized.value.id), identifier, {
        queueLength: sanitized.value.queueLength,
        status: sanitized.value.status,
        revision: Number(data.revision),
      });
      return respond({ ok: true, data: boothFromDb(data) });
    }

    if (action === "apply_import") {
      if (role !== "admin") return respond({ ok: false, error: "データ取込は管理者PINが必要です。", code: "ADMIN_ONLY" }, 403);
      const mode = body.mode;
      if (mode !== "merge" && mode !== "replace") return respond({ ok: false, error: "反映方法が不正です。", code: "INVALID_MODE" }, 400);
      if (!Array.isArray(body.booths) && !Array.isArray(body.timetable)) return respond({ ok: false, error: "取込データがありません。", code: "EMPTY_IMPORT" }, 400);
      if ((Array.isArray(body.booths) && body.booths.length > 500) || (Array.isArray(body.timetable) && body.timetable.length > 1000)) {
        return respond({ ok: false, error: "一度に取り込める件数を超えています。", code: "TOO_MANY_ROWS" }, 400);
      }

      let booths: Record<string, unknown>[] | null = null;
      if (Array.isArray(body.booths)) {
        const result = sanitizeRows(body.booths, sanitizeBooth);
        if (!result.ok) return respond({ ok: false, error: `取込データが不正です。${result.reason}`, code: "INVALID_ROW" }, 400);
        booths = result.values;
      }
      let timetable: Record<string, unknown>[] | null = null;
      if (Array.isArray(body.timetable)) {
        const result = sanitizeRows(body.timetable, sanitizeEvent);
        if (!result.ok) return respond({ ok: false, error: `取込データが不正です。${result.reason}`, code: "INVALID_ROW" }, 400);
        timetable = result.values;
      }

      if (mode === "replace") await storeSnapshot("全件置換前の自動保存");
      const { error } = await supabase.rpc("apply_festival_import", {
        p_mode: mode,
        p_booths: booths,
        p_timetable: timetable,
      });
      if (error) throw error;
      await audit("apply_import", String(mode), identifier, {
        booths: booths?.length ?? 0,
        timetable: timetable?.length ?? 0,
      });
      return respond({ ok: true, data: await getPublicData() });
    }

    if (action === "update_settings") {
      if (role !== "admin") return respond({ ok: false, error: "重要なお知らせの更新は管理者PINが必要です。", code: "ADMIN_ONLY" }, 403);
      const patch = body.patch as Record<string, unknown> | undefined;
      if (!patch || typeof patch.emergencyNotice !== "string") {
        return respond({ ok: false, error: "設定データが不正です。", code: "INVALID_PAYLOAD" }, 400);
      }
      const emergencyNotice = patch.emergencyNotice.trim();
      if (emergencyNotice.length > 180) {
        return respond({ ok: false, error: "重要なお知らせは180文字以内にしてください。", code: "NOTICE_TOO_LONG" }, 400);
      }
      const { error } = await supabase.rpc("set_emergency_notice", { p_notice: emergencyNotice });
      if (error) throw error;
      await audit("update_settings", "emergency_notice", identifier, { length: emergencyNotice.length });
      return respond({ ok: true, data: await getPublicData() });
    }

    if (action === "change_pin") {
      if (role !== "admin") return respond({ ok: false, error: "PIN変更は管理者PINが必要です。", code: "ADMIN_ONLY" }, 403);
      const target = body.target === "admin" ? "admin" : "staff";
      const nextPin = body.nextPin;
      if (typeof nextPin !== "string" || !/^\d{6,8}$/.test(nextPin)) {
        return respond({ ok: false, error: "新しいPINは6〜8桁の数字にしてください。", code: "INVALID_PIN_FORMAT" }, 400);
      }
      const { error } = await supabase.rpc(target === "admin" ? "set_admin_pin" : "set_staff_pin", { p_pin: nextPin });
      if (error) throw error;
      await audit("change_pin", target, identifier);
      return respond({ ok: true, data: { changed: true } });
    }

    if (action === "create_snapshot") {
      if (role !== "admin") return respond({ ok: false, error: "スナップショットの保存は管理者PINが必要です。", code: "ADMIN_ONLY" }, 403);
      const label = boundedText(body.label, 40).trim() || "手動保存";
      const snapshot = await storeSnapshot(label);
      await audit("create_snapshot", String(snapshot.id), identifier, { label });
      return respond({ ok: true, data: snapshot });
    }

    if (action === "list_snapshots") {
      if (role !== "admin") return respond({ ok: false, error: "スナップショットの参照は管理者PINが必要です。", code: "ADMIN_ONLY" }, 403);
      const { data, error } = await supabase
        .from("backups")
        .select("id,created_at,label,booth_count,event_count")
        .order("id", { ascending: false })
        .limit(20);
      if (error) throw error;
      return respond({
        ok: true,
        data: (data ?? []).map((row) => ({
          id: Number(row.id),
          createdAt: String(row.created_at),
          label: String(row.label),
          boothCount: Number(row.booth_count),
          eventCount: Number(row.event_count),
        })),
      });
    }

    if (action === "restore_snapshot") {
      if (role !== "admin") return respond({ ok: false, error: "復元は管理者PINが必要です。", code: "ADMIN_ONLY" }, 403);
      const snapshotId = clampInt(body.snapshotId, 1, Number.MAX_SAFE_INTEGER, 0);
      const { data: row, error } = await supabase.from("backups").select("id,payload").eq("id", snapshotId).maybeSingle();
      if (error) throw error;
      if (!row) return respond({ ok: false, error: "対象のスナップショットが見つかりません。", code: "NOT_FOUND" }, 404);

      const payload = row.payload as { booths?: unknown[]; timetable?: unknown[] };
      const booths = sanitizeRows(Array.isArray(payload.booths) ? payload.booths : [], sanitizeBooth);
      const timetable = sanitizeRows(Array.isArray(payload.timetable) ? payload.timetable : [], sanitizeEvent);
      if (!booths.ok || !timetable.ok) {
        return respond({ ok: false, error: "スナップショットの内容を検証できませんでした。", code: "INVALID_SNAPSHOT" }, 400);
      }

      await storeSnapshot("復元前の自動保存");
      const { error: importError } = await supabase.rpc("apply_festival_import", {
        p_mode: "replace",
        p_booths: booths.values,
        p_timetable: timetable.values,
      });
      if (importError) throw importError;
      await audit("restore_snapshot", String(snapshotId), identifier, {
        booths: booths.values.length,
        timetable: timetable.values.length,
      });
      return respond({ ok: true, data: await getPublicData() });
    }

    return respond({ ok: false, error: "未対応の操作です。", code: "UNKNOWN_ACTION" }, 400);
  } catch (error) {
    console.error(error);
    return respond({ ok: false, error: "サーバー処理に失敗しました。運営本部に連絡してください。", code: "SERVER_ERROR" }, 500);
  }
});
