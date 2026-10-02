-- 2026-10-02 (applied live): allow Instagram + TikTok links again (iframe player retry, demo-gated in the UI).
create or replace function public.owner_add_reel(p_school_id uuid, p_claim_code text, p_url text, p_platform text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not private.claim_code_ok(p_school_id, p_claim_code) then return false; end if;
  if p_url !~* '^https?://([a-z0-9-]+\.)?(facebook\.com|fb\.watch|instagram\.com|tiktok\.com)/' then return false; end if;
  if coalesce(p_platform, 'facebook') not in ('facebook', 'instagram', 'tiktok') then return false; end if;
  insert into school_reels (school_id, url, platform) values (p_school_id, p_url, coalesce(p_platform, 'facebook'));
  return true;
end $$;
notify pgrst, 'reload schema';
