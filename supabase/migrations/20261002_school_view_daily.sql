-- 2026-10-02 (applied live via MCP): per-day profile views for Kemaskini's "this month vs last month".
create table if not exists public.school_view_daily (
  school_id text not null,
  day date not null,
  views int not null default 0,
  primary key (school_id, day)
);
alter table public.school_view_daily enable row level security;

create or replace function public.increment_school_view(p_school_id text)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
DECLARE v_count INTEGER;
BEGIN
  INSERT INTO school_views (school_id, view_count, last_viewed)
  VALUES (p_school_id, 1, NOW())
  ON CONFLICT (school_id)
  DO UPDATE SET view_count = school_views.view_count + 1, last_viewed = NOW()
  RETURNING view_count INTO v_count;
  INSERT INTO school_view_daily (school_id, day, views)
  VALUES (p_school_id, (now() at time zone 'Asia/Kuala_Lumpur')::date, 1)
  ON CONFLICT (school_id, day) DO UPDATE SET views = school_view_daily.views + 1;
  RETURN v_count;
END;
$$;

create or replace function public.get_school_month_stats(p_school_id uuid)
returns table (views_this int, views_prev int, wa_this int, wa_prev int, views_tracked_since date, views_total int)
language sql stable security definer set search_path = public, pg_temp as $$
  with b as (
    select date_trunc('month', (now() at time zone 'Asia/Kuala_Lumpur'))::date m0,
           (date_trunc('month', (now() at time zone 'Asia/Kuala_Lumpur')) - interval '1 month')::date m1
  )
  select
    coalesce((select sum(views) from school_view_daily d, b where d.school_id = p_school_id::text and d.day >= b.m0), 0)::int,
    coalesce((select sum(views) from school_view_daily d, b where d.school_id = p_school_id::text and d.day >= b.m1 and d.day < b.m0), 0)::int,
    (select count(*) from whatsapp_click_events e, b where e.school_id::text = p_school_id::text and (e.created_at at time zone 'Asia/Kuala_Lumpur')::date >= b.m0)::int,
    (select count(*) from whatsapp_click_events e, b where e.school_id::text = p_school_id::text and (e.created_at at time zone 'Asia/Kuala_Lumpur')::date >= b.m1 and (e.created_at at time zone 'Asia/Kuala_Lumpur')::date < b.m0)::int,
    (select min(day) from school_view_daily where school_id = p_school_id::text),
    coalesce((select view_count from school_views where school_id = p_school_id::text), 0)::int
$$;
grant execute on function public.get_school_month_stats(uuid) to anon, authenticated;
notify pgrst, 'reload schema';
