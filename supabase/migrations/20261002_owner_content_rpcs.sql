-- Owner content writes go through claim-code-checked functions (2026-10-02).
--
-- Until now school_photos / _testimonials / _announcements / _reels / _events
-- had RLS policies that only asked "is this school claimed?", so anyone holding
-- the public anon key could add or delete content on ANY claimed school. These
-- functions require the school's claim code (private.claim_code_ok, the same
-- check update_school_cover_photo uses). Step 1 of 3: add functions (this file);
-- step 2: kemaskini.html / admin.html call them; step 3: drop the open policies.
-- Each step is independently safe (M74).

-- ── Photos ──
create or replace function public.owner_add_photo(p_school_id uuid, p_claim_code text, p_photo_url text, p_caption text)
returns boolean language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  if not private.claim_code_ok(p_school_id, p_claim_code) then return false; end if;
  -- Only files under this school's own folder in our bucket.
  if p_photo_url not like '%/school-assets/' || p_school_id::text || '/%' then return false; end if;
  insert into school_photos (school_id, photo_url, caption) values (p_school_id, p_photo_url, nullif(trim(p_caption), ''));
  return true;
end $$;

create or replace function public.owner_update_photo_caption(p_school_id uuid, p_claim_code text, p_photo_id uuid, p_caption text)
returns boolean language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  if not private.claim_code_ok(p_school_id, p_claim_code) then return false; end if;
  update school_photos set caption = nullif(trim(p_caption), '') where id = p_photo_id and school_id = p_school_id;
  return found;
end $$;

-- Returns the deleted photo's URL so the page can remove the storage object; null if refused.
create or replace function public.owner_delete_photo(p_school_id uuid, p_claim_code text, p_photo_id uuid)
returns text language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_url text;
begin
  if not private.claim_code_ok(p_school_id, p_claim_code) then return null; end if;
  delete from school_photos where id = p_photo_id and school_id = p_school_id returning photo_url into v_url;
  return v_url;
end $$;

-- ── Testimonials ──
create or replace function public.owner_add_testimonial(p_school_id uuid, p_claim_code text, p_parent_name text, p_text text)
returns boolean language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  if not private.claim_code_ok(p_school_id, p_claim_code) then return false; end if;
  if coalesce(length(trim(p_text)), 0) = 0 then return false; end if;
  insert into school_testimonials (school_id, parent_name, testimonial_text)
  values (p_school_id, nullif(trim(p_parent_name), ''), left(trim(p_text), 2000));
  return true;
end $$;

create or replace function public.owner_delete_testimonial(p_school_id uuid, p_claim_code text, p_id uuid)
returns boolean language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  if not private.claim_code_ok(p_school_id, p_claim_code) then return false; end if;
  delete from school_testimonials where id = p_id and school_id = p_school_id;
  return found;
end $$;

-- ── Announcements ──
create or replace function public.owner_add_announcement(p_school_id uuid, p_claim_code text, p_message text, p_attachment_url text, p_expires_at timestamptz)
returns boolean language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  if not private.claim_code_ok(p_school_id, p_claim_code) then return false; end if;
  if coalesce(length(trim(p_message)), 0) = 0 and p_attachment_url is null then return false; end if;
  if p_attachment_url is not null and p_attachment_url not like '%/school-assets/' || p_school_id::text || '/%' then return false; end if;
  insert into school_announcements (school_id, message, attachment_url, expires_at)
  values (p_school_id, nullif(trim(p_message), ''), p_attachment_url, p_expires_at);
  return true;
end $$;

create or replace function public.owner_delete_announcement(p_school_id uuid, p_claim_code text, p_id uuid)
returns boolean language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  if not private.claim_code_ok(p_school_id, p_claim_code) then return false; end if;
  delete from school_announcements where id = p_id and school_id = p_school_id;
  return found;
end $$;

-- ── Reels (Facebook only, same rule as kemaskini's REEL_VALIDATE_RE) ──
create or replace function public.owner_add_reel(p_school_id uuid, p_claim_code text, p_url text, p_platform text)
returns boolean language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  if not private.claim_code_ok(p_school_id, p_claim_code) then return false; end if;
  if p_url !~* '^https?://([a-z0-9-]+\.)?(facebook\.com|fb\.watch)/' then return false; end if;
  insert into school_reels (school_id, url, platform) values (p_school_id, p_url, coalesce(p_platform, 'facebook'));
  return true;
end $$;

create or replace function public.owner_delete_reel(p_school_id uuid, p_claim_code text, p_id bigint)
returns boolean language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  if not private.claim_code_ok(p_school_id, p_claim_code) then return false; end if;
  delete from school_reels where id = p_id and school_id = p_school_id;
  return found;
end $$;

-- ── Events (Open Day) ──
create or replace function public.owner_add_event(p_school_id uuid, p_claim_code text, p_event_name text, p_event_date date, p_description text)
returns boolean language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  if not private.claim_code_ok(p_school_id, p_claim_code) then return false; end if;
  if coalesce(length(trim(p_event_name)), 0) = 0 or p_event_date is null or p_event_date < current_date then return false; end if;
  insert into school_events (school_id, event_name, event_date, description)
  values (p_school_id, left(trim(p_event_name), 120), p_event_date, nullif(left(trim(p_description), 600), ''));
  return true;
end $$;

create or replace function public.owner_delete_event(p_school_id uuid, p_claim_code text, p_id uuid)
returns boolean language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  if not private.claim_code_ok(p_school_id, p_claim_code) then return false; end if;
  delete from school_events where id = p_id and school_id = p_school_id;
  return found;
end $$;

-- Admin dashboard's existing event tools, behind the admin session token.
create or replace function public.admin_add_event(p_admin_token uuid, p_school_id uuid, p_event_name text, p_event_date date, p_description text, p_banner_url text)
returns boolean language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  if not is_valid_admin_session(p_admin_token) then return false; end if;
  insert into school_events (school_id, event_name, event_date, description, banner_url)
  values (p_school_id, p_event_name, p_event_date, p_description, p_banner_url);
  return true;
end $$;

create or replace function public.admin_delete_event(p_admin_token uuid, p_id uuid)
returns boolean language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  if not is_valid_admin_session(p_admin_token) then return false; end if;
  delete from school_events where id = p_id;
  return found;
end $$;

-- Callable from the browser (anon) -- the claim code / admin token is the gate.
do $$
declare f text;
begin
  foreach f in array array[
    'owner_add_photo(uuid,text,text,text)','owner_update_photo_caption(uuid,text,uuid,text)','owner_delete_photo(uuid,text,uuid)',
    'owner_add_testimonial(uuid,text,text,text)','owner_delete_testimonial(uuid,text,uuid)',
    'owner_add_announcement(uuid,text,text,text,timestamptz)','owner_delete_announcement(uuid,text,uuid)',
    'owner_add_reel(uuid,text,text,text)','owner_delete_reel(uuid,text,bigint)',
    'owner_add_event(uuid,text,text,date,text)','owner_delete_event(uuid,text,uuid)',
    'admin_add_event(uuid,uuid,text,date,text,text)','admin_delete_event(uuid,uuid)']
  loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;
