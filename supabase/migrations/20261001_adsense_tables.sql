-- AdSense daily reporting (added 2026-10-01), filled by the analytics-sync edge function.
-- Private schema: not exposed to PostgREST. Earnings are in the account currency (USD).
create table if not exists private.adsense_daily (
  date date primary key,
  page_views bigint, impressions bigint, clicks bigint,
  earnings numeric(12,4), currency text
);
create table if not exists private.adsense_daily_page (
  date date not null, page text not null,
  page_views bigint, impressions bigint, clicks bigint,
  earnings numeric(12,4),
  primary key (date, page)
);
-- Per platform (mobile/desktop/tablet): watch click-through rate by device, since a
-- high mobile CTR is the usual sign of accidental taps.
create table if not exists private.adsense_daily_platform (
  date date not null, platform text not null,
  page_views bigint, impressions bigint, clicks bigint,
  earnings numeric(12,4),
  primary key (date, platform)
);
