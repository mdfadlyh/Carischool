-- Bing Webmaster data (added 2026-10-01). Same private-schema pattern as gsc_daily_*:
-- not exposed to PostgREST, written only by the analytics-sync edge function.
-- "period" not "date": query/page stats come back in Bing's own buckets, not always daily.
create table if not exists private.bing_total (period date primary key, clicks int, impressions int);
create table if not exists private.bing_query (period date, query text, clicks int, impressions int,
  avg_click_pos numeric, avg_imp_pos numeric, primary key (period, query));
create table if not exists private.bing_page (period date, page text, clicks int, impressions int,
  avg_click_pos numeric, avg_imp_pos numeric, primary key (period, page));
revoke all on private.bing_total, private.bing_query, private.bing_page from public, anon, authenticated;
