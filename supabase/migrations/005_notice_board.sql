-- 005: 落とし物・迷子などの掲示板(notices)
--
-- festival_settings に掲示板の配列を追加します。再実行しても安全です。
-- Edge Function側の読取は select("*") のためこのマイグレーション未実行でも
-- 壊れませんが、掲示板の保存にはこのカラムが必要です。
--
-- notices の中身(Edge Functionが検証して書き込む):
--   [{ "id": "...", "kind": "lost" | "child" | "info", "text": "...", "ts": 0 }]

alter table public.festival_settings
  add column if not exists notices jsonb not null default '[]'::jsonb;
