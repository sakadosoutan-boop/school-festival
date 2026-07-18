-- v4データモデルへの移行:
--   ブースは1件=1ドキュメント(booth_docs)、ステージは1枚のプログラム(stage_docs)。
--   v4プロトタイプの「ブース単位のキーで書込衝突を無くす」設計をそのままDBに写す。
--   旧テーブル(booths/timetable_events)は残すが、以後は使用しない。

create table if not exists public.booth_docs (
  id text primary key,
  doc jsonb not null,
  rev bigint not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.stage_docs (
  id boolean primary key default true check (id),
  doc jsonb not null,
  rev bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.booth_docs enable row level security;
alter table public.stage_docs enable row level security;
-- ブラウザ向けポリシーは作らない。Edge Function(service_role)だけが読み書きする。

create index if not exists booth_docs_updated_idx on public.booth_docs (updated_at desc);

-- PINを4〜8桁に緩和(v4は4桁PIN運用。レート制限は端末別+全体の二段で維持)。
create or replace function public.set_staff_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_pin !~ '^[0-9]{4,8}$' then
    raise exception 'invalid pin format';
  end if;
  update public.festival_settings
  set staff_pin_hash = crypt(p_pin, gen_salt('bf', 12)), updated_at = now()
  where id = true;
end;
$$;

create or replace function public.set_admin_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_pin !~ '^[0-9]{4,8}$' then
    raise exception 'invalid pin format';
  end if;
  update public.festival_settings
  set admin_pin_hash = crypt(p_pin, gen_salt('bf', 12)), updated_at = now()
  where id = true;
end;
$$;

-- ETag v2: 設定version + ブースdocの件数/最終更新 + ステージdocの最終更新。
-- どれかが変わるまで get_public はペイロードを送らない。
create or replace function public.get_data_etag()
returns text
language sql
security definer
set search_path = public
as $$
  select (select version::text from public.festival_settings where id = true)
    || ':' || (select count(*)::text from public.booth_docs)
    || ':' || coalesce((select max(updated_at)::text from public.booth_docs), 'none')
    || ':' || coalesce((select max(updated_at)::text from public.stage_docs), 'none');
$$;

revoke all on function public.set_staff_pin(text) from public, anon, authenticated;
revoke all on function public.set_admin_pin(text) from public, anon, authenticated;
revoke all on function public.get_data_etag() from public, anon, authenticated;
grant execute on function public.set_staff_pin(text) to service_role;
grant execute on function public.set_admin_pin(text) to service_role;
grant execute on function public.get_data_etag() to service_role;

-- 旧スキーマ(booths)に既に入力済みのデータがあれば、初回だけ新モデルへ変換する。
-- 場所の自由入力は building='legacy' として location に残す(アプリ側で表示互換)。
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'booths')
     and not exists (select 1 from public.booth_docs limit 1) then
    insert into public.booth_docs (id, doc, rev, updated_at)
    select
      b.id,
      jsonb_build_object(
        'id', b.id,
        'name', left(b.name, 20),
        'emoji', b.emoji,
        'iconImage', '',
        'category', case when b.category in ('attraction','food','game','experience','stage','exhibition','other') then b.category else 'other' end,
        'products', '[]'::jsonb,
        'organizer', b.organizer,
        'orgType', 'other',
        'grade', 2,
        'classNum', 1,
        'orgName', left(b.organizer, 30),
        'building', 'legacy',
        'floor', 1,
        'room', '',
        'location', b.location,
        'description', left(b.description, 120),
        'isOpen', (b.status = 'open'),
        'peopleInLine', least(b.queue_length, 500),
        'capacity', least(b.capacity, 200),
        'cycleSeconds', greatest(15, least(3600, round(b.cycle_minutes * 60)::int)),
        'waitMinutes', b.wait_minutes,
        'history', '[]'::jsonb,
        'cycleHistory', '[]'::jsonb,
        'lastUpdated', (extract(epoch from b.last_updated) * 1000)::bigint,
        'lastServedAt', null,
        'undoSnapshot', null,
        'rev', b.revision
      ),
      b.revision,
      b.updated_at
    from public.booths b
    on conflict (id) do nothing;
  end if;
end;
$$;
