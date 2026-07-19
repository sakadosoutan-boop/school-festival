-- 運用堅牢化:
--  1. revを使った楽観ロックで、古い端末が新しい更新を上書きするのを防ぐ。
--  2. 全件入替・スナップショット復元を1トランザクションで完了させる。
--  3. PIN失敗回数を原子的に加算し、並列試行によるレート制限回避を防ぐ。
-- すべてservice_role専用。ブラウザからRPCを直接呼ぶ権限は与えない。

create or replace function public.upsert_booth_doc_if_rev(
  p_id text,
  p_doc jsonb,
  p_next_rev bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  stored jsonb;
begin
  if p_id is null or p_id = '' or p_next_rev < 1 then
    raise exception 'invalid booth revision';
  end if;

  update public.booth_docs
  set doc = jsonb_set(p_doc, '{rev}', to_jsonb(p_next_rev), true),
      rev = p_next_rev,
      updated_at = now()
  where id = p_id and rev = p_next_rev - 1
  returning doc into stored;

  if stored is not null then
    return stored;
  end if;

  if p_next_rev = 1 then
    insert into public.booth_docs (id, doc, rev, updated_at)
    values (p_id, jsonb_set(p_doc, '{rev}', '1'::jsonb, true), 1, now())
    on conflict (id) do nothing
    returning doc into stored;
  end if;

  -- nullは競合。呼出側が409と現在値を返す。
  return stored;
end;
$$;

create or replace function public.upsert_stage_doc_if_rev(
  p_doc jsonb,
  p_next_rev bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  stored jsonb;
begin
  if p_next_rev < 1 then
    raise exception 'invalid stage revision';
  end if;

  update public.stage_docs
  set doc = jsonb_set(p_doc, '{rev}', to_jsonb(p_next_rev), true),
      rev = p_next_rev,
      updated_at = now()
  where id = true and rev = p_next_rev - 1
  returning doc into stored;

  if stored is not null then
    return stored;
  end if;

  if p_next_rev = 1 then
    insert into public.stage_docs (id, doc, rev, updated_at)
    values (true, jsonb_set(p_doc, '{rev}', '1'::jsonb, true), 1, now())
    on conflict (id) do nothing
    returning doc into stored;
  end if;

  return stored;
end;
$$;

create or replace function public.replace_festival_docs(
  p_booths jsonb,
  p_stage jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if jsonb_typeof(p_booths) <> 'array' then
    raise exception 'booths must be a JSON array';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_booths) item
    group by item->>'id'
    having item->>'id' is null or item->>'id' = '' or count(*) > 1
  ) then
    raise exception 'booth ids must be present and unique';
  end if;

  delete from public.booth_docs;

  insert into public.booth_docs (id, doc, rev, updated_at)
  select
    item->>'id',
    jsonb_set(
      item,
      '{rev}',
      to_jsonb(greatest(1, coalesce((item->>'rev')::bigint, 1))),
      true
    ),
    greatest(1, coalesce((item->>'rev')::bigint, 1)),
    now()
  from jsonb_array_elements(p_booths) item;

  if p_stage is not null then
    insert into public.stage_docs (id, doc, rev, updated_at)
    values (
      true,
      jsonb_set(
        p_stage,
        '{rev}',
        to_jsonb(greatest(1, coalesce((p_stage->>'rev')::bigint, 1))),
        true
      ),
      greatest(1, coalesce((p_stage->>'rev')::bigint, 1)),
      now()
    )
    on conflict (id) do update
    set doc = excluded.doc, rev = excluded.rev, updated_at = excluded.updated_at;
  end if;
end;
$$;

create or replace function public.record_pin_failure(
  p_identifier text,
  p_max_attempts integer,
  p_block_minutes integer
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_identifier is null or p_identifier = ''
     or p_max_attempts < 1 or p_block_minutes < 1 then
    raise exception 'invalid rate limit parameters';
  end if;

  insert into public.staff_pin_attempts (
    identifier, window_started, attempts, blocked_until, updated_at
  )
  values (
    p_identifier,
    now(),
    1,
    case when p_max_attempts <= 1 then now() + make_interval(mins => p_block_minutes) else null end,
    now()
  )
  on conflict (identifier) do update
  set attempts = case
        when now() - staff_pin_attempts.window_started < interval '10 minutes'
          then staff_pin_attempts.attempts + 1
        else 1
      end,
      window_started = case
        when now() - staff_pin_attempts.window_started < interval '10 minutes'
          then staff_pin_attempts.window_started
        else now()
      end,
      blocked_until = case
        when (
          case
            when now() - staff_pin_attempts.window_started < interval '10 minutes'
              then staff_pin_attempts.attempts + 1
            else 1
          end
        ) >= p_max_attempts
          then now() + make_interval(mins => p_block_minutes)
        else null
      end,
      updated_at = now();
end;
$$;

revoke all on function public.upsert_booth_doc_if_rev(text, jsonb, bigint) from public, anon, authenticated;
revoke all on function public.upsert_stage_doc_if_rev(jsonb, bigint) from public, anon, authenticated;
revoke all on function public.replace_festival_docs(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.record_pin_failure(text, integer, integer) from public, anon, authenticated;

grant execute on function public.upsert_booth_doc_if_rev(text, jsonb, bigint) to service_role;
grant execute on function public.upsert_stage_doc_if_rev(jsonb, bigint) to service_role;
grant execute on function public.replace_festival_docs(jsonb, jsonb) to service_role;
grant execute on function public.record_pin_failure(text, integer, integer) to service_role;
