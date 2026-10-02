-- 2026-10-02: Premium "Soalan Lazim" -- the school answers common parent questions.
-- Public SELECT only; writes go through claim-code-checked functions (same pattern
-- as school_testimonials, CLAUDE.md "Owner content writes").
create table if not exists public.school_faqs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  question text not null,
  answer text not null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists school_faqs_school_idx on public.school_faqs(school_id, sort);
alter table public.school_faqs enable row level security;
drop policy if exists school_faqs_public_read on public.school_faqs;
create policy school_faqs_public_read on public.school_faqs for select using (true);
grant select on public.school_faqs to anon, authenticated;

-- Premium only (Fadly, 2026-10-02), max 8 per school.
create or replace function public.owner_add_faq(p_school_id uuid, p_claim_code text, p_question text, p_answer text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not private.claim_code_ok(p_school_id, p_claim_code) then return false; end if;
  if not exists (select 1 from schools where id = p_school_id and is_premium) then return false; end if;
  if coalesce(length(trim(p_question)), 0) = 0 or coalesce(length(trim(p_answer)), 0) = 0 then return false; end if;
  if (select count(*) from school_faqs where school_id = p_school_id) >= 8 then return false; end if;
  insert into school_faqs (school_id, question, answer, sort)
  values (p_school_id, left(trim(p_question), 200), left(trim(p_answer), 1000),
          coalesce((select max(sort) + 1 from school_faqs where school_id = p_school_id), 0));
  return true;
end $$;

create or replace function public.owner_delete_faq(p_school_id uuid, p_claim_code text, p_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not private.claim_code_ok(p_school_id, p_claim_code) then return false; end if;
  delete from school_faqs where id = p_id and school_id = p_school_id;
  return found;
end $$;

revoke all on function public.owner_add_faq(uuid, text, text, text) from public;
revoke all on function public.owner_delete_faq(uuid, text, uuid) from public;
grant execute on function public.owner_add_faq(uuid, text, text, text) to anon, authenticated;
grant execute on function public.owner_delete_faq(uuid, text, uuid) to anon, authenticated;
notify pgrst, 'reload schema';
