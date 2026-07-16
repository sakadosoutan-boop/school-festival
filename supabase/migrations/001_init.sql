create extension if not exists pgcrypto;

create table if not exists public.festival_settings (
  id boolean primary key default true check (id),
  festival_name text not null default '文化祭 2026',
  subtitle text not null default '8月29日（土）・30日（日）',
  dates jsonb not null default '["2026-08-29","2026-08-30"]'::jsonb,
  opening_hours jsonb not null default '{"2026-08-29":{"start":"09:30","end":"15:30"},"2026-08-30":{"start":"09:30","end":"15:00"}}'::jsonb,
  emergency_notice text not null default '' check (char_length(emergency_notice) <= 180),
  staff_pin_hash text not null,
  version bigint not null default 1,
  last_published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.booths (
  id text primary key,
  name text not null,
  organizer text not null default '',
  category text not null check (category in ('attraction','food','game','experience','stage','exhibition','other')),
  location text not null,
  description text not null default '',
  emoji text not null default '🎪',
  days jsonb not null default '[]'::jsonb,
  open_time text not null,
  close_time text not null,
  capacity integer not null check (capacity between 1 and 500),
  cycle_minutes numeric(8,2) not null check (cycle_minutes between 0.25 and 180),
  queue_length integer not null default 0 check (queue_length between 0 and 5000),
  wait_minutes integer not null default 0 check (wait_minutes between 0 and 10000),
  status text not null default 'closed' check (status in ('open','paused','closed','sold_out')),
  notice text not null default '',
  sort_order integer not null default 0,
  revision bigint not null default 1,
  history jsonb not null default '[]'::jsonb,
  last_updated timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.timetable_events (
  id text primary key,
  day text not null check (day in ('2026-08-29','2026-08-30')),
  start_time text not null,
  end_time text not null,
  title text not null,
  organizer text not null default '',
  venue text not null,
  category text not null default 'その他',
  description text not null default '',
  audience text not null default '全来場者',
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_pin_attempts (
  identifier text primary key,
  window_started timestamptz not null default now(),
  attempts integer not null default 0,
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists booths_sort_idx on public.booths (sort_order, name);
create index if not exists timetable_day_time_idx on public.timetable_events (day, start_time, sort_order);

alter table public.festival_settings enable row level security;
alter table public.booths enable row level security;
alter table public.timetable_events enable row level security;
alter table public.staff_pin_attempts enable row level security;

-- No browser-facing policies are created. The Edge Function uses the service role,
-- so direct table reads and writes from the public browser are denied by default.

insert into public.festival_settings (id, staff_pin_hash)
values (true, crypt('202608', gen_salt('bf', 12)))
on conflict (id) do nothing;

insert into public.booths (
  id, name, organizer, category, location, description, emoji, days, open_time, close_time,
  capacity, cycle_minutes, queue_length, wait_minutes, status, notice, sort_order
) values
  ('3a-haunted-house', 'お化け屋敷', '3年A組', 'attraction', '本館3階 301教室', '暗闇と音響を使った本格ホラー。混雑時は整理券を配布します。', '👻', '["2026-08-29","2026-08-30"]', '09:30', '15:00', 4, 5, 0, 0, 'closed', '怖い演出があります。', 10),
  ('2b-cafe', 'レトロ喫茶', '2年B組', 'food', '本館2階 203教室', 'ドリンクと焼き菓子を販売します。', '☕', '["2026-08-29","2026-08-30"]', '10:00', '14:30', 8, 8, 0, 0, 'closed', 'アレルギー表示は店頭でご確認ください。', 20),
  ('mystery-club-escape', '校内謎解き「消えた校章」', 'ミステリー研究部', 'experience', '受付：昇降口前', '校内を巡る約30分の謎解き。スマートフォンを使用します。', '🧩', '["2026-08-29","2026-08-30"]', '09:30', '14:30', 20, 10, 0, 0, 'closed', '最終受付は終了30分前です。', 30)
on conflict (id) do nothing;

insert into public.timetable_events (
  id, day, start_time, end_time, title, organizer, venue, category, description, audience, sort_order
) values
  ('day1-opening', '2026-08-29', '09:30', '09:45', 'オープニング', '文化祭実行委員会', '体育館ステージ', '式典', '文化祭開幕の案内と注意事項をお知らせします。', '全来場者', 10),
  ('day1-band', '2026-08-29', '11:00', '11:35', '軽音楽部ライブ', '軽音楽部', '体育館ステージ', '音楽', '文化祭スペシャルセット。', '全来場者', 20),
  ('day2-drama', '2026-08-30', '10:30', '11:15', '演劇部公演', '演劇部', '講堂', '演劇', '開演5分前までにご着席ください。', '全来場者', 10),
  ('day2-closing', '2026-08-30', '14:30', '15:00', 'フィナーレ', '文化祭実行委員会', '体育館ステージ', '式典', '表彰・閉祭アナウンスを行います。', '生徒・来場者', 99)
on conflict (id) do nothing;

create or replace function public.verify_staff_pin(p_pin text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.festival_settings
    where id = true and staff_pin_hash = crypt(p_pin, staff_pin_hash)
  );
$$;

create or replace function public.set_staff_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_pin !~ '^[0-9]{6,8}$' then
    raise exception 'invalid pin format';
  end if;
  update public.festival_settings
  set staff_pin_hash = crypt(p_pin, gen_salt('bf', 12)), updated_at = now()
  where id = true;
end;
$$;

revoke all on function public.verify_staff_pin(text) from public, anon, authenticated;
revoke all on function public.set_staff_pin(text) from public, anon, authenticated;
grant execute on function public.verify_staff_pin(text) to service_role;
grant execute on function public.set_staff_pin(text) to service_role;

create or replace function public.set_emergency_notice(p_notice text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if char_length(coalesce(p_notice, '')) > 180 then
    raise exception 'notice too long';
  end if;
  update public.festival_settings
  set emergency_notice = trim(coalesce(p_notice, '')),
      version = version + 1,
      last_published_at = now(),
      updated_at = now()
  where id = true;
end;
$$;

revoke all on function public.set_emergency_notice(text) from public, anon, authenticated;
grant execute on function public.set_emergency_notice(text) to service_role;

create or replace function public.apply_festival_import(
  p_mode text,
  p_booths jsonb default null,
  p_timetable jsonb default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
begin
  if p_mode not in ('merge', 'replace') then
    raise exception 'invalid import mode';
  end if;

  if p_booths is not null then
    if jsonb_typeof(p_booths) <> 'array' then raise exception 'booths must be an array'; end if;
    if p_mode = 'replace' then delete from public.booths; end if;

    for item in select value from jsonb_array_elements(p_booths)
    loop
      insert into public.booths (
        id, name, organizer, category, location, description, emoji, days, open_time, close_time,
        capacity, cycle_minutes, queue_length, wait_minutes, status, notice, sort_order,
        revision, history, last_updated, updated_at
      ) values (
        item->>'id', item->>'name', coalesce(item->>'organizer',''), item->>'category', item->>'location',
        coalesce(item->>'description',''), coalesce(item->>'emoji','🎪'), coalesce(item->'days','[]'::jsonb),
        item->>'openTime', item->>'closeTime', (item->>'capacity')::integer, (item->>'cycleMinutes')::numeric,
        coalesce((item->>'queueLength')::integer,0), coalesce((item->>'waitMinutes')::integer,0),
        coalesce(item->>'status','closed'), coalesce(item->>'notice',''), coalesce((item->>'sortOrder')::integer,0),
        greatest(coalesce((item->>'revision')::bigint,1),1), coalesce(item->'history','[]'::jsonb),
        coalesce((item->>'lastUpdated')::timestamptz, now()), now()
      )
      on conflict (id) do update set
        name = excluded.name,
        organizer = excluded.organizer,
        category = excluded.category,
        location = excluded.location,
        description = excluded.description,
        emoji = excluded.emoji,
        days = excluded.days,
        open_time = excluded.open_time,
        close_time = excluded.close_time,
        capacity = excluded.capacity,
        cycle_minutes = excluded.cycle_minutes,
        queue_length = excluded.queue_length,
        wait_minutes = excluded.wait_minutes,
        status = excluded.status,
        notice = excluded.notice,
        sort_order = excluded.sort_order,
        history = excluded.history,
        last_updated = excluded.last_updated,
        revision = public.booths.revision + 1,
        updated_at = now();
    end loop;
  end if;

  if p_timetable is not null then
    if jsonb_typeof(p_timetable) <> 'array' then raise exception 'timetable must be an array'; end if;
    if p_mode = 'replace' then delete from public.timetable_events; end if;

    for item in select value from jsonb_array_elements(p_timetable)
    loop
      insert into public.timetable_events (
        id, day, start_time, end_time, title, organizer, venue, category, description, audience, sort_order, updated_at
      ) values (
        item->>'id', item->>'day', item->>'startTime', item->>'endTime', item->>'title',
        coalesce(item->>'organizer',''), item->>'venue', coalesce(item->>'category','その他'),
        coalesce(item->>'description',''), coalesce(item->>'audience','全来場者'),
        coalesce((item->>'sortOrder')::integer,0), now()
      )
      on conflict (id) do update set
        day = excluded.day,
        start_time = excluded.start_time,
        end_time = excluded.end_time,
        title = excluded.title,
        organizer = excluded.organizer,
        venue = excluded.venue,
        category = excluded.category,
        description = excluded.description,
        audience = excluded.audience,
        sort_order = excluded.sort_order,
        updated_at = now();
    end loop;
  end if;

  update public.festival_settings
  set version = version + 1, last_published_at = now(), updated_at = now()
  where id = true;
end;
$$;

revoke all on function public.apply_festival_import(text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_festival_import(text, jsonb, jsonb) to service_role;
