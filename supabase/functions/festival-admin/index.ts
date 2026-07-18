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
// カンマ区切りで複数オリジンを許可(本番 + ローカル検証など)。
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGIN") ?? "*").split(",").map((value) => value.trim()).filter(Boolean);

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Supabase admin credentials are not available to the Edge Function.");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CATEGORY_SET = new Set(["attraction", "food", "game", "experience", "stage", "exhibition", "other"]);
const BUILDING_SET = new Set(["hr", "special", "admin", "extra", "gaikoku", "outdoor", "legacy"]);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ID_RE = /^[A-Za-z0-9:_-]{1,64}$/;
const ICON_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_WAIT_MINUTES = 600;
const MAX_BOOTHS = 300;
const MAX_DOC_CHARS = 160_000;
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

/* ── PIN総当たり対策: 端末別 + 全体の二段レート制限 ── */

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

async function recordFailedPin(identifier: string): Promise<void> {
  await bumpFailure(identifier, 8, 15);
  await bumpFailure(GLOBAL_LIMIT_ID, 40, 10);
}

async function clearFailedPins(identifier: string): Promise<void> {
  const { error } = await supabase.from("staff_pin_attempts").delete().eq("identifier", identifier);
  if (error) throw error;
  await supabase.from("staff_pin_attempts").delete()
    .neq("identifier", GLOBAL_LIMIT_ID)
    .lt("updated_at", new Date(Date.now() - 24 * 60 * 60_000).toISOString());
}

async function resolvePinRole(pin: unknown): Promise<"admin" | "staff" | null> {
  if (typeof pin !== "string" || !/^\d{4,8}$/.test(pin)) return null;
  const { data, error } = await supabase.rpc("resolve_pin_role", { p_pin: pin });
  if (error) throw error;
  return data === "admin" || data === "staff" ? data : null;
}

async function audit(action: string, target: string, caller: string, detail: Record<string, unknown> = {}): Promise<void> {
  const { error } = await supabase.from("audit_log").insert({ action, target, caller, detail });
  if (error) console.error("audit_log insert failed", error);
}

/* ── サニタイズ(サーバー側のmakeBooth相当)。
     クライアント検証をすり抜けた値を既定値へ矯正し、サイズ上限で肥大を防ぐ。 ── */

function num(v: unknown, d: number, min: number, max: number): number {
  const parsed = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(parsed)) return d;
  return Math.min(max, Math.max(min, parsed));
}
function int(v: unknown, d: number, min: number, max: number): number {
  return Math.round(num(v, d, min, max));
}
function str(v: unknown, max: number, d = ""): string {
  return typeof v === "string" ? v.slice(0, max) : d;
}
function bool(v: unknown, d: boolean): boolean {
  return typeof v === "boolean" ? v : d;
}

function waitFor(people: number, capacity: number, cycleSeconds: number): number {
  if (people <= 0 || capacity <= 0) return 0;
  return Math.min(MAX_WAIT_MINUTES, Math.max(1, Math.round((Math.ceil(people / capacity) * cycleSeconds) / 60)));
}

type Sanitized = { ok: true; value: Record<string, unknown> } | { ok: false; reason: string };

function sanitizeBooth(raw: Record<string, unknown>): Sanitized {
  const id = str(raw.id, 64).trim();
  if (!ID_RE.test(id)) return { ok: false, reason: `id「${id || "(空)"}」が不正です` };
  const name = str(raw.name, 30).trim();
  if (!name) return { ok: false, reason: `id「${id}」のブース名が空です` };

  const iconImage = str(raw.iconImage, 120_000);
  if (iconImage && !ICON_RE.test(iconImage)) return { ok: false, reason: `id「${id}」のアイコン画像の形式が不正です` };

  const products = (Array.isArray(raw.products) ? raw.products : [])
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .slice(0, 20)
    .map((p) => ({
      id: str(p.id, 32) || `p_${Math.random().toString(36).slice(2, 7)}`,
      name: str(p.name, 15),
      stock: int(p.stock, 0, 0, 9999),
      soldOut: bool(p.soldOut, false),
    }))
    .filter((p) => p.name);

  const peopleInLine = int(raw.peopleInLine, 0, 0, 500);
  const capacity = int(raw.capacity, 2, 1, 200);
  const cycleSeconds = int(raw.cycleSeconds, 180, 15, 3600);

  const history = (Array.isArray(raw.history) ? raw.history : [])
    .filter((h): h is Record<string, unknown> => !!h && typeof h === "object" && Number.isFinite(Number((h as Record<string, unknown>).wait)))
    .slice(-30)
    .map((h) => ({ ts: int(h.ts, Date.now(), 0, 9_999_999_999_999), wait: int(h.wait, 0, 0, MAX_WAIT_MINUTES) }));

  const cycleHistory = (Array.isArray(raw.cycleHistory) ? raw.cycleHistory : [])
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    .slice(-10)
    .map((v) => int(v, 180, 15, 3600));

  const undoRaw = raw.undoSnapshot;
  const undoSnapshot = undoRaw && typeof undoRaw === "object"
    ? {
      peopleInLine: int((undoRaw as Record<string, unknown>).peopleInLine, 0, 0, 500),
      cycleHistory: (Array.isArray((undoRaw as Record<string, unknown>).cycleHistory) ? (undoRaw as Record<string, unknown>).cycleHistory as unknown[] : [])
        .filter((v): v is number => typeof v === "number").slice(-10),
      lastServedAt: typeof (undoRaw as Record<string, unknown>).lastServedAt === "number" ? (undoRaw as Record<string, unknown>).lastServedAt : null,
      waitMinutes: int((undoRaw as Record<string, unknown>).waitMinutes, 0, 0, MAX_WAIT_MINUTES),
      ts: int((undoRaw as Record<string, unknown>).ts, 0, 0, 9_999_999_999_999),
    }
    : null;

  const building = BUILDING_SET.has(str(raw.building, 16)) ? str(raw.building, 16) : "hr";
  const value: Record<string, unknown> = {
    id,
    name,
    emoji: str(raw.emoji, 16) || "🎪",
    iconImage,
    category: CATEGORY_SET.has(str(raw.category, 20)) ? str(raw.category, 20) : "other",
    products,
    organizer: str(raw.organizer, 80),
    orgType: raw.orgType === "club" ? "club" : raw.orgType === "other" ? "other" : "class",
    grade: int(raw.grade, 2, 1, 9),
    classNum: int(raw.classNum, 1, 1, 9),
    orgName: str(raw.orgName, 30),
    building,
    floor: int(raw.floor, 1, 1, 9),
    room: str(raw.room, 20),
    location: str(raw.location, 120),
    description: str(raw.description, 120),
    isOpen: bool(raw.isOpen, true),
    peopleInLine,
    capacity,
    cycleSeconds,
    waitMinutes: waitFor(peopleInLine, capacity, cycleSeconds),
    history,
    cycleHistory,
    // 端末の時計ズレで鮮度表示が壊れないよう、更新時刻はサーバーが刻む
    lastUpdated: Date.now(),
    lastServedAt: typeof raw.lastServedAt === "number" ? raw.lastServedAt : null,
    undoSnapshot,
    rev: int(raw.rev, 0, 0, Number.MAX_SAFE_INTEGER),
  };

  if (JSON.stringify(value).length > MAX_DOC_CHARS) {
    return { ok: false, reason: `id「${id}」のデータが大きすぎます(画像を小さくしてください)` };
  }
  return { ok: true, value };
}

function sanitizeStage(raw: Record<string, unknown>): Sanitized {
  const itemsRaw = Array.isArray(raw.items) ? raw.items : [];
  if (itemsRaw.length > 100) return { ok: false, reason: "公演が多すぎます(最大100件)" };
  const items = [];
  for (const it of itemsRaw) {
    if (!it || typeof it !== "object") continue;
    const item = it as Record<string, unknown>;
    const start = str(item.start, 5);
    const end = str(item.end, 5);
    if (!TIME_RE.test(start) || !TIME_RE.test(end)) return { ok: false, reason: `公演「${str(item.title, 30) || "(無題)"}」の時刻はHH:MM形式にしてください` };
    items.push({
      id: ID_RE.test(str(item.id, 64)) ? str(item.id, 64) : `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: str(item.title, 30),
      performer: str(item.performer, 30),
      start,
      end,
      note: str(item.note, 40),
      canceled: bool(item.canceled, false),
      day: item.day === 2 ? 2 : 1,
    });
  }
  return {
    ok: true,
    value: {
      stageName: str(raw.stageName, 30) || "体育館ステージ",
      dayLabel: str(raw.dayLabel, 30) || "文化祭ステージ",
      days: raw.days === 1 ? 1 : 2,
      rev: int(raw.rev, 0, 0, Number.MAX_SAFE_INTEGER),
      lastUpdated: Date.now(),
      items,
    },
  };
}

/* ── データ読み出し ── */

async function dataEtag(): Promise<string> {
  const { data, error } = await supabase.rpc("get_data_etag");
  if (error) throw error;
  return String(data ?? "");
}

async function getPublicData(version?: string) {
  const [settingsResult, boothsResult, stageResult] = await Promise.all([
    supabase.from("festival_settings").select("festival_name,emergency_notice").eq("id", true).single(),
    supabase.from("booth_docs").select("doc").order("updated_at", { ascending: false }),
    supabase.from("stage_docs").select("doc").eq("id", true).maybeSingle(),
  ]);
  const error = settingsResult.error ?? boothsResult.error ?? stageResult.error;
  if (error) throw error;
  return {
    booths: (boothsResult.data ?? []).map((row) => row.doc),
    stage: stageResult.data?.doc ?? null,
    settings: {
      festivalName: settingsResult.data.festival_name,
      emergencyNotice: settingsResult.data.emergency_notice,
    },
    version: version ?? await dataEtag(),
    fetchedAt: Date.now(),
  };
}

async function upsertBoothDoc(doc: Record<string, unknown>): Promise<Record<string, unknown>> {
  const id = doc.id as string;
  const { data: existing } = await supabase.from("booth_docs").select("rev").eq("id", id).maybeSingle();
  const nextRev = Math.max(Number(existing?.rev ?? 0) + 1, Number(doc.rev ?? 0));
  const stored = { ...doc, rev: nextRev };
  const { error } = await supabase.from("booth_docs").upsert({
    id,
    doc: stored,
    rev: nextRev,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return stored;
}

async function storeSnapshot(label: string): Promise<{ id: number; createdAt: string; label: string; boothCount: number; eventCount: number }> {
  const data = await getPublicData("snapshot");
  const stage = data.stage as { items?: unknown[] } | null;
  const { data: inserted, error } = await supabase
    .from("backups")
    .insert({
      label,
      booth_count: data.booths.length,
      event_count: Array.isArray(stage?.items) ? stage.items.length : 0,
      payload: { booths: data.booths, stage: data.stage, settings: data.settings },
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

async function replaceAllDocs(booths: Record<string, unknown>[], stage: Record<string, unknown> | null): Promise<void> {
  const { error: delError } = await supabase.from("booth_docs").delete().neq("id", "");
  if (delError) throw delError;
  if (booths.length > 0) {
    const now = new Date().toISOString();
    const rows = booths.map((doc) => ({ id: doc.id as string, doc, rev: Number(doc.rev ?? 1) || 1, updated_at: now }));
    const { error } = await supabase.from("booth_docs").insert(rows);
    if (error) throw error;
  }
  if (stage) {
    const { error } = await supabase.from("stage_docs").upsert({ id: true, doc: stage, rev: Number(stage.rev ?? 1) || 1, updated_at: new Date().toISOString() });
    if (error) throw error;
  }
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

    if (action === "save_booth") {
      const booth = body.booth as Record<string, unknown> | undefined;
      if (!booth || typeof booth !== "object") {
        return respond({ ok: false, error: "更新データが不正です。", code: "INVALID_PAYLOAD" }, 400);
      }
      const sanitized = sanitizeBooth(booth);
      if (!sanitized.ok) return respond({ ok: false, error: `更新データが不正です：${sanitized.reason}`, code: "INVALID_PAYLOAD" }, 400);

      const { count } = await supabase.from("booth_docs").select("id", { count: "exact", head: true });
      const { data: exists } = await supabase.from("booth_docs").select("id").eq("id", sanitized.value.id as string).maybeSingle();
      if (!exists && (count ?? 0) >= MAX_BOOTHS) {
        return respond({ ok: false, error: `ブース数の上限(${MAX_BOOTHS})に達しています。`, code: "TOO_MANY_BOOTHS" }, 400);
      }

      const stored = await upsertBoothDoc(sanitized.value);
      await audit("save_booth", String(sanitized.value.id), identifier, {
        people: sanitized.value.peopleInLine,
        isOpen: sanitized.value.isOpen,
        name: sanitized.value.name,
      });
      return respond({ ok: true, data: stored });
    }

    if (action === "delete_booth") {
      const boothId = typeof body.boothId === "string" ? body.boothId : "";
      if (!ID_RE.test(boothId)) return respond({ ok: false, error: "対象が不正です。", code: "INVALID_PAYLOAD" }, 400);
      const { data: existing } = await supabase.from("booth_docs").select("doc").eq("id", boothId).maybeSingle();
      const { error } = await supabase.from("booth_docs").delete().eq("id", boothId);
      if (error) throw error;
      // 誤削除に備え、消したドキュメント全体を監査ログへ残す(手動復旧の材料)
      await audit("delete_booth", boothId, identifier, { doc: existing?.doc ?? null });
      return respond({ ok: true, data: { deleted: true } });
    }

    if (action === "save_stage") {
      const stage = body.stage as Record<string, unknown> | undefined;
      if (!stage || typeof stage !== "object") return respond({ ok: false, error: "ステージデータが不正です。", code: "INVALID_PAYLOAD" }, 400);
      const sanitized = sanitizeStage(stage);
      if (!sanitized.ok) return respond({ ok: false, error: `ステージデータが不正です：${sanitized.reason}`, code: "INVALID_PAYLOAD" }, 400);

      const { data: existing } = await supabase.from("stage_docs").select("rev").eq("id", true).maybeSingle();
      const nextRev = Math.max(Number(existing?.rev ?? 0) + 1, Number(sanitized.value.rev ?? 0));
      const stored = { ...sanitized.value, rev: nextRev };
      const { error } = await supabase.from("stage_docs").upsert({ id: true, doc: stored, rev: nextRev, updated_at: new Date().toISOString() });
      if (error) throw error;
      await audit("save_stage", "stage", identifier, { items: (stored.items as unknown[]).length });
      return respond({ ok: true, data: stored });
    }

    if (action === "update_settings") {
      if (role !== "admin") return respond({ ok: false, error: "全体お知らせの更新は管理者PINが必要です。", code: "ADMIN_ONLY" }, 403);
      const patch = body.patch as Record<string, unknown> | undefined;
      if (!patch || typeof patch.emergencyNotice !== "string") {
        return respond({ ok: false, error: "設定データが不正です。", code: "INVALID_PAYLOAD" }, 400);
      }
      const emergencyNotice = patch.emergencyNotice.trim();
      if (emergencyNotice.length > 180) {
        return respond({ ok: false, error: "お知らせは180文字以内にしてください。", code: "NOTICE_TOO_LONG" }, 400);
      }
      const { error } = await supabase.rpc("set_emergency_notice", { p_notice: emergencyNotice });
      if (error) throw error;
      await audit("update_settings", "emergency_notice", identifier, { length: emergencyNotice.length });
      const data = await getPublicData();
      return respond({ ok: true, data: data.settings });
    }

    if (action === "change_pin") {
      if (role !== "admin") return respond({ ok: false, error: "PIN変更は管理者PINが必要です。", code: "ADMIN_ONLY" }, 403);
      const target = body.target === "admin" ? "admin" : "staff";
      const nextPin = body.nextPin;
      if (typeof nextPin !== "string" || !/^\d{4,8}$/.test(nextPin)) {
        return respond({ ok: false, error: "新しいPINは4〜8桁の数字にしてください。", code: "INVALID_PIN_FORMAT" }, 400);
      }
      const { error } = await supabase.rpc(target === "admin" ? "set_admin_pin" : "set_staff_pin", { p_pin: nextPin });
      if (error) throw error;
      await audit("change_pin", target, identifier);
      return respond({ ok: true, data: { changed: true } });
    }

    if (action === "replace_all") {
      if (role !== "admin") return respond({ ok: false, error: "全データの入替は管理者PINが必要です。", code: "ADMIN_ONLY" }, 403);
      const boothsRaw = Array.isArray(body.booths) ? body.booths : [];
      if (boothsRaw.length > MAX_BOOTHS) return respond({ ok: false, error: `一度に入れ替えられるのは${MAX_BOOTHS}件までです。`, code: "TOO_MANY_ROWS" }, 400);
      const booths: Record<string, unknown>[] = [];
      for (let i = 0; i < boothsRaw.length; i += 1) {
        const raw = boothsRaw[i];
        if (!raw || typeof raw !== "object") return respond({ ok: false, error: `${i + 1}件目のデータ形式が不正です。`, code: "INVALID_ROW" }, 400);
        const sanitized = sanitizeBooth(raw as Record<string, unknown>);
        if (!sanitized.ok) return respond({ ok: false, error: `${i + 1}件目：${sanitized.reason}`, code: "INVALID_ROW" }, 400);
        booths.push(sanitized.value);
      }
      let stage: Record<string, unknown> | null = null;
      if (body.stage && typeof body.stage === "object") {
        const sanitized = sanitizeStage(body.stage as Record<string, unknown>);
        if (!sanitized.ok) return respond({ ok: false, error: `ステージ：${sanitized.reason}`, code: "INVALID_ROW" }, 400);
        stage = sanitized.value;
      }

      await storeSnapshot("入替前の自動保存");
      await replaceAllDocs(booths, stage);
      await audit("replace_all", "all", identifier, { booths: booths.length, stage: Boolean(stage) });
      return respond({ ok: true, data: await getPublicData() });
    }

    if (action === "create_snapshot") {
      if (role !== "admin") return respond({ ok: false, error: "スナップショットの保存は管理者PINが必要です。", code: "ADMIN_ONLY" }, 403);
      const label = (typeof body.label === "string" ? body.label : "").slice(0, 40).trim() || "手動保存";
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
      const snapshotId = int(body.snapshotId, 0, 0, Number.MAX_SAFE_INTEGER);
      const { data: row, error } = await supabase.from("backups").select("id,payload").eq("id", snapshotId).maybeSingle();
      if (error) throw error;
      if (!row) return respond({ ok: false, error: "対象のスナップショットが見つかりません。", code: "NOT_FOUND" }, 404);

      const payload = row.payload as { booths?: unknown[]; stage?: unknown };
      const boothsRaw = Array.isArray(payload.booths) ? payload.booths : [];
      const booths: Record<string, unknown>[] = [];
      for (const raw of boothsRaw) {
        if (!raw || typeof raw !== "object") continue;
        const sanitized = sanitizeBooth(raw as Record<string, unknown>);
        if (sanitized.ok) booths.push(sanitized.value);
      }
      let stage: Record<string, unknown> | null = null;
      if (payload.stage && typeof payload.stage === "object") {
        const sanitized = sanitizeStage(payload.stage as Record<string, unknown>);
        if (sanitized.ok) stage = sanitized.value;
      }

      await storeSnapshot("復元前の自動保存");
      await replaceAllDocs(booths, stage);
      await audit("restore_snapshot", String(snapshotId), identifier, { booths: booths.length });
      return respond({ ok: true, data: await getPublicData() });
    }

    return respond({ ok: false, error: "未対応の操作です。", code: "UNKNOWN_ACTION" }, 400);
  } catch (error) {
    console.error(error);
    return respond({ ok: false, error: "サーバー処理に失敗しました。運営本部に連絡してください。", code: "SERVER_ERROR" }, 500);
  }
});
