-- 実運用向けハードニング:
--   1. 管理者PINの分離（漏えいした更新用PINで全件置換・PIN変更をさせない）
--   2. サーバー側スナップショット（端末紛失時でも復元できるバックアップ）
--   3. 監査ログ（誰が・いつ・何を更新したかの記録。いたずら/事故の切り分け用）
--   4. データ版数のETag（ポーリングの転送量とDB読取を削減）

-- 1. 管理者PIN。初期値は 202609（本番前に必ず変更すること）。
alter table public.festival_settings add column if not exists admin_pin_hash text;
update public.festival_settings
set admin_pin_hash = crypt('202609', gen_salt('bf', 12))
where id = true and admin_pin_hash is null;
alter table public.festival_settings alter column admin_pin_hash set not null;

-- 2. サーバー側スナップショット。
create table if not exists public.backups (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  label text not null default '',
  booth_count integer not null default 0,
  event_count integer not null default 0,
  payload jsonb not null
);

-- 3. 監査ログ。callerはIP+UAのSHA-256ハッシュで、個人情報は保存しない。
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  action text not null,
  target text not null default '',
  caller text not null default '',
  detail jsonb not null default '{}'::jsonb
);

alter table public.backups enable row level security;
alter table public.audit_log enable row level security;
-- ブラウザ向けポリシーは作らない。Edge Function（service_role）だけが読み書きする。

create index if not exists booths_updated_idx on public.booths (updated_at desc);
create index if not exists audit_log_at_idx on public.audit_log (at desc);

-- 4. データ版数。設定versionは取込・お知らせ更新で、booths.updated_atは待ち時間更新で変わる。
create or replace function public.get_data_etag()
returns text
language sql
security definer
set search_path = public, extensions
as $$
  select (select version::text from public.festival_settings where id = true)
    || ':' || (select count(*)::text from public.booths)
    || ':' || coalesce((select max(updated_at)::text from public.booths), 'none');
$$;

-- PINを1回のRPCで判定する。管理者→スタッフの順に照合する。
create or replace function public.resolve_pin_role(p_pin text)
returns text
language sql
security definer
set search_path = public, extensions
as $$
  select case
    when exists (
      select 1 from public.festival_settings
      where id = true and admin_pin_hash = crypt(p_pin, admin_pin_hash)
    ) then 'admin'
    when exists (
      select 1 from public.festival_settings
      where id = true and staff_pin_hash = crypt(p_pin, staff_pin_hash)
    ) then 'staff'
    else null
  end;
$$;

create or replace function public.set_admin_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_pin !~ '^[0-9]{6,8}$' then
    raise exception 'invalid pin format';
  end if;
  update public.festival_settings
  set admin_pin_hash = crypt(p_pin, gen_salt('bf', 12)), updated_at = now()
  where id = true;
end;
$$;

revoke all on function public.get_data_etag() from public, anon, authenticated;
revoke all on function public.resolve_pin_role(text) from public, anon, authenticated;
revoke all on function public.set_admin_pin(text) from public, anon, authenticated;
grant execute on function public.get_data_etag() to service_role;
grant execute on function public.resolve_pin_role(text) to service_role;
grant execute on function public.set_admin_pin(text) to service_role;
