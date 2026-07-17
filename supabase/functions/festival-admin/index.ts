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
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Supabase admin credentials are not available to the Edge Function.");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsHeaders = {
  "access-control-allow-origin": ALLOWED_ORIGIN,
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
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
    .select("window_started,attempts,blocked_until")
    .eq("identifier", identifier)
    .maybeSingle();
  if (error) throw error;
  if (!data?.blocked_until) return { blocked: false, retryAfterSeconds: 0 };
  const retry = Math.ceil((Date.parse(data.blocked_until) - Date.now()) / 1000);
  return retry > 0 ? { blocked: true, retryAfterSeconds: retry } : { blocked: false, retryAfterSeconds: 0 };
}

async function recordFailedPin(identifier: string): Promise<void> {
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
  const blockedUntil = attempts >= 8 ? new Date(now + 15 * 60_000).toISOString() : null;

  const { error: upsertError } = await supabase.from("staff_pin_attempts").upsert({
    identifier,
    window_started: withinWindow ? data?.window_started : new Date(now).toISOString(),
    attempts,
    blocked_until: blockedUntil,
    updated_at: new Date(now).toISOString(),
  });
  if (upsertError) throw upsertError;
}

async function clearFailedPins(identifier: string): Promise<void> {
  const { error } = await supabase.from("staff_pin_attempts").delete().eq("identifier", identifier);
  if (error) throw error;
}

async function validPin(pin: unknown): Promise<boolean> {
  if (typeof pin !== "string" || !/^\d{6,8}$/.test(pin)) return false;
  const { data, error } = await supabase.rpc("verify_staff_pin", { p_pin: pin });
  if (error) throw error;
  return data === true;
}

function boothFromDb(row: Record<string, unknown>) {
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
    history: row.history ?? [],
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

async function getPublicData() {
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
    version: String(settings.version),
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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  try {
    const apiKey = request.headers.get("apikey") ?? "";
    if (PUBLISHABLE_KEYS.size === 0) {
      return json({ ok: false, error: "公開キーがサーバーに設定されていません。", code: "SERVER_MISCONFIGURED" }, 500);
    }
    if (!PUBLISHABLE_KEYS.has(apiKey)) {
      return json({ ok: false, error: "公開キーが正しくありません。", code: "INVALID_API_KEY" }, 401);
    }

    const body = await request.json() as Record<string, unknown>;
    const action = body.action;

    if (action === "get_public") return json({ ok: true, data: await getPublicData() });

    const identifier = await callerFingerprint(request);
    const limit = await rateLimitState(identifier);
    if (limit.blocked) {
      return json({ ok: false, error: `PIN入力が一時的にロックされています。約${Math.ceil(limit.retryAfterSeconds / 60)}分後に再試行してください。`, code: "RATE_LIMITED" }, 429);
    }

    const pinIsValid = await validPin(body.pin);
    if (!pinIsValid) {
      await recordFailedPin(identifier);
      if (action === "verify_pin") return json({ ok: true, data: { valid: false } });
      return json({ ok: false, error: "スタッフPINが違います。", code: "INVALID_PIN" }, 401);
    }
    await clearFailedPins(identifier);

    if (action === "verify_pin") return json({ ok: true, data: { valid: true } });

    if (action === "update_booth") {
      const booth = body.booth as Record<string, unknown> | undefined;
      const expectedRevision = Number(body.expectedRevision);
      if (!booth || typeof booth.id !== "string" || !Number.isInteger(expectedRevision)) {
        return json({ ok: false, error: "更新データが不正です。", code: "INVALID_PAYLOAD" }, 400);
      }

      const { data, error } = await supabase
        .from("booths")
        .update(boothToDb(booth, expectedRevision))
        .eq("id", booth.id)
        .eq("revision", expectedRevision)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        const { data: current } = await supabase.from("booths").select("*").eq("id", booth.id).maybeSingle();
        return json({ ok: false, error: "別の端末で先に更新されています。", code: "CONFLICT", current: current ? boothFromDb(current) : null }, 409);
      }
      return json({ ok: true, data: boothFromDb(data) });
    }

    if (action === "apply_import") {
      const mode = body.mode;
      if (mode !== "merge" && mode !== "replace") return json({ ok: false, error: "反映方法が不正です。", code: "INVALID_MODE" }, 400);
      if (!Array.isArray(body.booths) && !Array.isArray(body.timetable)) return json({ ok: false, error: "取込データがありません。", code: "EMPTY_IMPORT" }, 400);
      if ((Array.isArray(body.booths) && body.booths.length > 500) || (Array.isArray(body.timetable) && body.timetable.length > 1000)) {
        return json({ ok: false, error: "一度に取り込める件数を超えています。", code: "TOO_MANY_ROWS" }, 400);
      }
      const { error } = await supabase.rpc("apply_festival_import", {
        p_mode: mode,
        p_booths: Array.isArray(body.booths) ? body.booths : null,
        p_timetable: Array.isArray(body.timetable) ? body.timetable : null,
      });
      if (error) throw error;
      return json({ ok: true, data: await getPublicData() });
    }

    if (action === "update_settings") {
      const patch = body.patch as Record<string, unknown> | undefined;
      if (!patch || typeof patch.emergencyNotice !== "string") {
        return json({ ok: false, error: "設定データが不正です。", code: "INVALID_PAYLOAD" }, 400);
      }
      const emergencyNotice = patch.emergencyNotice.trim();
      if (emergencyNotice.length > 180) {
        return json({ ok: false, error: "重要なお知らせは180文字以内にしてください。", code: "NOTICE_TOO_LONG" }, 400);
      }
      const { error } = await supabase.rpc("set_emergency_notice", { p_notice: emergencyNotice });
      if (error) throw error;
      return json({ ok: true, data: await getPublicData() });
    }

    if (action === "change_pin") {
      const nextPin = body.nextPin;
      if (typeof nextPin !== "string" || !/^\d{6,8}$/.test(nextPin)) {
        return json({ ok: false, error: "新しいPINは6〜8桁の数字にしてください。", code: "INVALID_PIN_FORMAT" }, 400);
      }
      const { error } = await supabase.rpc("set_staff_pin", { p_pin: nextPin });
      if (error) throw error;
      return json({ ok: true, data: { changed: true } });
    }

    return json({ ok: false, error: "未対応の操作です。", code: "UNKNOWN_ACTION" }, 400);
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: "サーバー処理に失敗しました。運営本部に連絡してください。", code: "SERVER_ERROR" }, 500);
  }
});
