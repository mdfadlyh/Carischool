-- 2026-10-02: rank premium schools that meet the photo policy (cover photo +
-- at least 5 gallery photos, same bar as api/cron-premium-photo-reversal.js
-- GALLERY_MIN) above premium schools still inside their 30-day grace period.
-- PostgREST can only ORDER BY a real column, so the count lives on schools,
-- kept in sync by a trigger on school_photos (covers owner_add/delete_photo
-- and admin writes alike).
alter table public.schools add column if not exists gallery_count integer not null default 0;

update public.schools s set gallery_count = c.n
from (select school_id, count(*)::int n from public.school_photos group by school_id) c
where c.school_id = s.id;

create or replace function private.sync_gallery_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT','UPDATE') then
    update public.schools set gallery_count = (select count(*) from public.school_photos where school_id = new.school_id) where id = new.school_id;
  end if;
  if tg_op in ('DELETE','UPDATE') then
    update public.schools set gallery_count = (select count(*) from public.school_photos where school_id = old.school_id) where id = old.school_id;
  end if;
  return null;
end $$;
revoke all on function private.sync_gallery_count() from public, anon, authenticated;

drop trigger if exists trg_school_photos_count on public.school_photos;
create trigger trg_school_photos_count after insert or delete or update of school_id on public.school_photos
for each row execute function private.sync_gallery_count();

alter table public.schools add column if not exists premium_ready boolean
  generated always as (coalesce(is_premium, false) and photo_url is not null and gallery_count >= 5) stored;

notify pgrst, 'reload schema';
