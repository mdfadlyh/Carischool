// analytics-sync — Supabase Edge Function (added 2026-10-01)
//
// Pulls Google Search Console and Microsoft Clarity data into private.* tables
// once a day (pg_cron), so search performance can be analysed with SQL instead
// of hand-exported zips. Runs on Supabase, NOT Vercel: it does not count toward
// the Hobby plan's 12-function cap (CLAUDE.md M62).
//
// Secrets (Supabase dashboard -> Edge Functions -> Secrets):
//   GSC_SA_JSON    full JSON key of the gsc-reader service account (read-only,
//                  added as a Restricted user on the Search Console property)
//   CLARITY_TOKEN  Clarity Data Export API token (10 calls/day, last 1-3 days)
//   BING_API_KEY   Bing Webmaster Tools API key (Settings -> API access). Bing returns its
//                  whole retained window per call (totals are daily; query/page stats are
//                  bucketed by Bing), so every run simply re-upserts everything.
//   ADSENSE_CLIENT_ID / ADSENSE_CLIENT_SECRET / ADSENSE_REFRESH_TOKEN
//                  OAuth client + refresh token (scope adsense.readonly). AdSense does not
//                  accept service accounts, so this is Fadly's own login, granted once via the
//                  OAuth Playground. The consent screen must be "In production": a Testing-mode
//                  refresh token expires after 7 days.
//   SUPABASE_DB_URL is provided automatically by Supabase.
//
// Query params:
//   ?days=N          re-fetch the last N days of GSC (default 5; GSC data settles
//                    over ~3 days, so recent days are re-upserted each run)
//   ?start=YYYY-MM-DD&end=YYYY-MM-DD   explicit GSC range (backfill in chunks)
//   ?clarity=0       skip Clarity (it only allows 10 calls/day)
//   ?bing=0          skip Bing
//   ?adsense=0       skip AdSense
//   ?only=adsense    run just one source (for backfills/tests without spending Clarity calls)
//
// Writes are idempotent upserts keyed on (date, dimension), so re-running any
// range is safe.

import postgres from "npm:postgres@3.4.4";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 2, prepare: false });

function b64url(data: ArrayBuffer | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function googleToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claim}`));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claim}.${b64url(sig)}` }),
  });
  const j = await res.json();
  if (!res.ok || !j.access_token) throw new Error(`google token: ${res.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j.access_token;
}

async function gscSiteUrl(token: string, email: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", { headers: { Authorization: `Bearer ${token}` } });
  const j = await res.json();
  if (!res.ok) throw new Error(`gsc sites list: ${res.status} ${JSON.stringify(j).slice(0, 300)}`);
  const sites: string[] = (j.siteEntry || []).map((s: { siteUrl: string }) => s.siteUrl);
  // Prefer the domain property (covers www + non-www + http/https).
  const pick = sites.find((s) => s === "sc-domain:carischools.com")
    || sites.find((s) => s.includes("carischools.com"));
  // Name the account in the error: the usual cause is that this exact email was never added
  // as a user on the Search Console property (or was added to a different property).
  if (!pick) throw new Error(`service account ${email} sees no carischools.com property (sees: ${JSON.stringify(sites)})`);
  return pick;
}

type Row = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };

async function gscQuery(token: string, site: string, start: string, end: string, dims: string[]): Promise<Row[]> {
  const out: Row[] = [];
  for (let startRow = 0; ; startRow += 25000) {
    const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: start, endDate: end, dimensions: dims, rowLimit: 25000, startRow, dataState: "all" }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`gsc ${dims.join(",")}: ${res.status} ${JSON.stringify(j).slice(0, 300)}`);
    const rows: Row[] = j.rows || [];
    out.push(...rows);
    if (rows.length < 25000) break;
  }
  return out;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

async function syncGsc(start: string, end: string) {
  const sa = JSON.parse(Deno.env.get("GSC_SA_JSON") || "null");
  if (!sa?.client_email) throw new Error("GSC_SA_JSON secret missing or not valid JSON");
  const token = await googleToken(sa);
  const site = await gscSiteUrl(token, sa.client_email);

  const counts: Record<string, number> = {};
  const total = await gscQuery(token, site, start, end, ["date"]);
  for (const r of total) {
    await sql`insert into private.gsc_daily_total values (${r.keys[0]}, ${r.clicks}, ${r.impressions}, ${r.ctr}, ${r.position})
      on conflict (date) do update set clicks=excluded.clicks, impressions=excluded.impressions, ctr=excluded.ctr, position=excluded.position`;
  }
  counts.total = total.length;

  const batches: [string, string[], (r: Row) => Record<string, unknown>, string][] = [
    ["gsc_daily_page", ["date", "page"], (r) => ({ date: r.keys[0], page: r.keys[1] }), "date, page"],
    ["gsc_daily_query", ["date", "query"], (r) => ({ date: r.keys[0], query: r.keys[1] }), "date, query"],
    ["gsc_daily_page_query", ["date", "page", "query"], (r) => ({ date: r.keys[0], page: r.keys[1], query: r.keys[2] }), "date, page, query"],
  ];
  for (const [table, dims, keyOf, conflict] of batches) {
    const rows = await gscQuery(token, site, start, end, dims);
    const recs = rows.map((r) => ({ ...keyOf(r), clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));
    for (let i = 0; i < recs.length; i += 1000) {
      const chunk = recs.slice(i, i + 1000);
      // ($1::jsonb #>> '{}')::json unwraps the param if the driver delivered it as a JSON *string*
      // scalar (it did: "cannot call json_populate_recordset on a scalar", 2026-10-01) and is a
      // no-op re-parse if it arrives as a real array -- correct whichever way postgres.js encodes it.
      await sql.unsafe(
        `insert into private.${table} select * from json_populate_recordset(null::private.${table}, (($1::jsonb) #>> '{}')::json)
         on conflict (${conflict}) do update set clicks=excluded.clicks, impressions=excluded.impressions, ctr=excluded.ctr, position=excluded.position`,
        [JSON.stringify(chunk)],
      );
    }
    counts[table] = recs.length;
  }
  return { site, start, end, counts };
}

async function syncClarity() {
  const tokenC = Deno.env.get("CLARITY_TOKEN");
  if (!tokenC) throw new Error("CLARITY_TOKEN secret missing");
  const today = iso(new Date());
  // Clarity allows only 10 calls/day -- never call twice for the same day.
  const [done] = await sql`select count(*)::int n from private.clarity_daily where fetched_on = ${today}`;
  if (done.n > 0) return { skipped: "already fetched today" };
  const out: Record<string, number> = {};
  for (const dims of [[], ["URL"], ["Device"], ["Source"]]) {
    const qs = new URLSearchParams({ numOfDays: "1" });
    dims.forEach((d, i) => qs.set(`dimension${i + 1}`, d));
    const res = await fetch(`https://www.clarity.ms/export-data/api/v1/project-live-insights?${qs}`, {
      headers: { Authorization: `Bearer ${tokenC}`, "Content-Type": "application/json" },
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`clarity ${dims.join(",") || "none"}: ${res.status} ${body.slice(0, 200)}`);
    const key = dims.join(",") || "none";
    // sql.json, not ${body}::jsonb: postgres.js sends a JS string as a JSON *string*,
    // so the cast stored the whole payload as one quoted text value (fixed 2026-10-01).
    await sql`insert into private.clarity_daily values (${today}, ${key}, ${sql.json(JSON.parse(body))})
      on conflict (fetched_on, dims) do update set payload = excluded.payload`;
    out[key] = body.length;
  }
  return out;
}

// ── BING ──
// Bing serialises dates as "/Date(1727654400000)/" or "/Date(1727654400000-0700)/".
function bingDate(v: string): string {
  const ms = Number((/\/Date\((-?\d+)/.exec(v) || [])[1]);
  return iso(new Date(ms));
}

async function bingCall(method: string, key: string, site?: string) {
  const qs = new URLSearchParams({ apikey: key });
  if (site) qs.set("siteUrl", site);
  const res = await fetch(`https://ssl.bing.com/webmaster/api.svc/json/${method}?${qs}`);
  const body = await res.text();
  if (!res.ok) throw new Error(`bing ${method}: ${res.status} ${body.slice(0, 200)}`);
  return JSON.parse(body).d;
}

async function syncBing() {
  const key = Deno.env.get("BING_API_KEY");
  if (!key) throw new Error("BING_API_KEY secret missing");
  const sites: { Url: string; IsVerified?: boolean }[] = await bingCall("GetUserSites", key);
  // Prefer the www https property -- that is the canonical host (see vercel redirects).
  const urls = sites.map((s) => s.Url);
  const site = urls.find((u) => /^https:\/\/www\.carischools\.com\/?$/.test(u)) || urls.find((u) => u.includes("carischools.com"));
  if (!site) throw new Error(`bing key sees no carischools.com site (sees: ${JSON.stringify(urls)})`);

  const traffic: { Date: string; Clicks: number; Impressions: number }[] = await bingCall("GetRankAndTrafficStats", key, site);
  for (const r of traffic) {
    await sql`insert into private.bing_total values (${bingDate(r.Date)}, ${r.Clicks}, ${r.Impressions})
      on conflict (period) do update set clicks=excluded.clicks, impressions=excluded.impressions`;
  }
  type Q = { Date: string; Query: string; Clicks: number; Impressions: number; AvgClickPosition: number; AvgImpressionPosition: number };
  const counts: Record<string, number> = { total: traffic.length };
  // GetPageStats reuses the QueryStats shape: the page URL arrives in the "Query" field.
  for (const [table, method, col] of [["bing_query", "GetQueryStats", "query"], ["bing_page", "GetPageStats", "page"]] as const) {
    const rows: Q[] = await bingCall(method, key, site);
    const recs = rows.map((r) => ({ period: bingDate(r.Date), [col]: r.Query, clicks: r.Clicks, impressions: r.Impressions,
      avg_click_pos: r.AvgClickPosition, avg_imp_pos: r.AvgImpressionPosition }));
    // Bing can repeat a (week, query) pair; keep the last so the upsert never hits the same key twice.
    const dedup = [...new Map(recs.map((r) => [`${r.period}|${r[col]}`, r])).values()];
    for (let i = 0; i < dedup.length; i += 1000) {
      await sql.unsafe(
        `insert into private.${table} select * from json_populate_recordset(null::private.${table}, (($1::jsonb) #>> '{}')::json)
         on conflict (period, ${col}) do update set clicks=excluded.clicks, impressions=excluded.impressions,
         avg_click_pos=excluded.avg_click_pos, avg_imp_pos=excluded.avg_imp_pos`,
        [JSON.stringify(dedup.slice(i, i + 1000))],
      );
    }
    counts[table] = dedup.length;
  }
  return { site, counts };
}

// ---------- AdSense ----------
async function adsenseToken(): Promise<string> {
  const id = Deno.env.get("ADSENSE_CLIENT_ID"), secret = Deno.env.get("ADSENSE_CLIENT_SECRET"),
    refresh = Deno.env.get("ADSENSE_REFRESH_TOKEN");
  if (!id || !secret || !refresh) throw new Error("ADSENSE_CLIENT_ID / _SECRET / _REFRESH_TOKEN secret missing");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: "refresh_token" }),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(`adsense token: ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j.access_token;
}

async function adsenseReport(token: string, account: string, start: string, end: string, dims: string[]) {
  const q = new URLSearchParams({ dateRange: "CUSTOM" });
  for (const [k, d] of [["startDate", start], ["endDate", end]]) {
    const [y, m, dd] = d.split("-").map(Number);
    q.set(`${k}.year`, String(y)); q.set(`${k}.month`, String(m)); q.set(`${k}.day`, String(dd));
  }
  for (const d of dims) q.append("dimensions", d);
  for (const m of ["PAGE_VIEWS", "IMPRESSIONS", "CLICKS", "ESTIMATED_EARNINGS"]) q.append("metrics", m);
  const r = await fetch(`https://adsense.googleapis.com/v2/${account}/reports:generate?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`adsense report ${dims.join(",")}: ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  const names: string[] = (j.headers || []).map((h: { name: string }) => h.name);
  const currency = (j.headers || []).find((h: { currencyCode?: string }) => h.currencyCode)?.currencyCode || null;
  const rows = (j.rows || []).map((row: { cells: { value: string }[] }) =>
    Object.fromEntries(names.map((n, i) => [n, row.cells[i]?.value])));
  return { rows, currency };
}

async function syncAdsense(start: string, end: string) {
  const token = await adsenseToken();
  const acc = await fetch("https://adsense.googleapis.com/v2/accounts", { headers: { Authorization: `Bearer ${token}` } });
  const accJ = await acc.json();
  const account = accJ.accounts?.[0]?.name;
  if (!account) throw new Error(`adsense: no account visible (${acc.status} ${JSON.stringify(accJ).slice(0, 200)})`);
  const n = (v: unknown) => Number(v || 0);
  const counts: Record<string, number> = {};

  const tot = await adsenseReport(token, account, start, end, ["DATE"]);
  for (const r of tot.rows) {
    await sql`insert into private.adsense_daily values (${r.DATE}, ${n(r.PAGE_VIEWS)}, ${n(r.IMPRESSIONS)}, ${n(r.CLICKS)},
      ${n(r.ESTIMATED_EARNINGS)}, ${tot.currency})
      on conflict (date) do update set page_views=excluded.page_views, impressions=excluded.impressions,
      clicks=excluded.clicks, earnings=excluded.earnings, currency=excluded.currency`;
  }
  counts.adsense_daily = tot.rows.length;

  for (const [table, dim, col] of [["adsense_daily_page", "PAGE_URL", "page"], ["adsense_daily_platform", "PLATFORM_TYPE_NAME", "platform"]] as const) {
    const rep = await adsenseReport(token, account, start, end, ["DATE", dim]);
    const recs = rep.rows.map((r: Record<string, string>) => ({ date: r.DATE, [col]: r[dim] || "(unknown)",
      page_views: n(r.PAGE_VIEWS), impressions: n(r.IMPRESSIONS), clicks: n(r.CLICKS), earnings: n(r.ESTIMATED_EARNINGS) }));
    for (let i = 0; i < recs.length; i += 1000) {
      await sql.unsafe(
        `insert into private.${table} select * from json_populate_recordset(null::private.${table}, (($1::jsonb) #>> '{}')::json)
         on conflict (date, ${col}) do update set page_views=excluded.page_views, impressions=excluded.impressions,
         clicks=excluded.clicks, earnings=excluded.earnings`,
        [JSON.stringify(recs.slice(i, i + 1000))],
      );
    }
    counts[table] = recs.length;
  }
  return { account, start, end, currency: tot.currency, counts };
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const days = Math.min(Number(u.searchParams.get("days") || 5), 31);
  const end = u.searchParams.get("end") || iso(new Date(Date.now() - 86400000));
  const start = u.searchParams.get("start") || iso(new Date(Date.now() - days * 86400000));
  const result: Record<string, unknown> = {};

  for (const [name, fn] of [
    ["gsc", () => syncGsc(start, end)],
    ["clarity", () => u.searchParams.get("clarity") === "0" ? Promise.resolve({ skipped: "clarity=0" }) : syncClarity()],
    ["bing", () => u.searchParams.get("bing") === "0" ? Promise.resolve({ skipped: "bing=0" }) : syncBing()],
    ["adsense", () => u.searchParams.get("adsense") === "0" ? Promise.resolve({ skipped: "adsense=0" }) : syncAdsense(start, end)],
  ] as [string, () => Promise<unknown>][]) {
    const only = u.searchParams.get("only");
    if (only && only !== name) continue;
    try {
      result[name] = await fn();
      await sql`insert into private.analytics_sync_log (source, ok, detail) values (${name}, true, ${JSON.stringify(result[name])})`;
    } catch (e) {
      result[name] = { error: String(e) };
      await sql`insert into private.analytics_sync_log (source, ok, detail) values (${name}, false, ${String(e).slice(0, 1000)})`;
    }
  }
  return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
});
