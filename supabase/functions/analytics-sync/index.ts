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
//   SUPABASE_DB_URL is provided automatically by Supabase.
//
// Query params:
//   ?days=N          re-fetch the last N days of GSC (default 5; GSC data settles
//                    over ~3 days, so recent days are re-upserted each run)
//   ?start=YYYY-MM-DD&end=YYYY-MM-DD   explicit GSC range (backfill in chunks)
//   ?clarity=0       skip Clarity (it only allows 10 calls/day)
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

async function gscSiteUrl(token: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", { headers: { Authorization: `Bearer ${token}` } });
  const j = await res.json();
  const sites: string[] = (j.siteEntry || []).map((s: { siteUrl: string }) => s.siteUrl);
  // Prefer the domain property (covers www + non-www + http/https).
  const pick = sites.find((s) => s === "sc-domain:carischools.com")
    || sites.find((s) => s.includes("carischools.com"));
  if (!pick) throw new Error(`service account sees no carischools.com property (sees: ${JSON.stringify(sites)})`);
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
  const site = await gscSiteUrl(token);

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
      await sql.unsafe(
        `insert into private.${table} select * from json_populate_recordset(null::private.${table}, $1::json)
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
    await sql`insert into private.clarity_daily values (${today}, ${key}, ${body}::jsonb)
      on conflict (fetched_on, dims) do update set payload = excluded.payload`;
    out[key] = body.length;
  }
  return out;
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
  ] as [string, () => Promise<unknown>][]) {
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
