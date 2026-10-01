-- Step 3 of 3 (2026-10-02): remove the RLS write policies that only checked
-- "is the school claimed?". Every write now goes through the owner_* / admin_*
-- security-definer functions (claim code / admin token), which bypass RLS.
-- Public SELECT policies stay. Verified first: zero direct insert/update/delete
-- calls on these tables remain in any page or API file on main.
drop policy if exists claimed_school_photos_insert on public.school_photos;
drop policy if exists claimed_school_photos_update on public.school_photos;
drop policy if exists claimed_school_photos_delete on public.school_photos;
drop policy if exists claimed_schools_insert_testimonials on public.school_testimonials;
drop policy if exists claimed_schools_delete_testimonials on public.school_testimonials;
drop policy if exists claimed_school_announcements_insert on public.school_announcements;
drop policy if exists claimed_school_announcements_delete on public.school_announcements;
drop policy if exists claimed_school_reels_insert on public.school_reels;
drop policy if exists claimed_school_reels_delete on public.school_reels;
drop policy if exists claimed_school_events_insert on public.school_events;
drop policy if exists claimed_school_events_delete on public.school_events;
