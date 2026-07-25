---
name: carischool-data-layer
description: CariSchool's Supabase data layer: schema, query patterns, write flows, claim-code auth, storage uploads. Use for ANY Supabase read/write, or 'wrong count'/'missing school'/'no results' bugs.
---

# CariSchool Data Layer

All data access happens client-side with the **public anon key** (pasted at the top of every
page — intentional; security = RLS + `/api/*` endpoints), except privileged mutations which go
through serverless `/api/*` functions. This skill is the map of what exists and the exact
idioms for touching it.

## Schema reference (as observed in the codebase — do not invent columns)

### `schools` — the core table
Identity: `id`, `name`, `commercial_name`, `slug`, `school_code` (KPM),
`jkm_registration_no` (JKM), `category`, `agency`-implied by category.
Location: `address`, `postcode`, `district` (KPM rows), `town`, `neighbourhood`, `state`
(UPPERCASE).
Contact: `phone`, `whatsapp`, `email`, `website`, `contact_name`,
`facebook_url`, `instagram_url`.
Profile: `description`, `operating_hours`, `age_range`, `languages`, `curriculum`,
`photo_url` (cover), `logo_url`, `video_url` (YouTube).
Fees: `fee_min`, `fee_max`, `monthly_fee` (legacy), `fee_source_url`, `fee_document_url`.
Ratings: `google_rating`, `google_reviews_count` (38.3% as of 2026-07-25).
Geo: `lat`, `lng` — 59.6% as of 2026-07-25, NOT the ~3% an older version of this file and a
school.html comment both claimed (see M26). Still feature-check before use, but distance-based
features are now viable; for the remaining ~40%, join `postcode_reference` for an approximate
centroid rather than treating the school as unplaceable.
Hours: `operating_hours` (39.9%, Google-sourced text — see the Unicode trap below),
`opens_at` / `closes_at` (`time`, 38.4%, backfilled 2026-07-25 from the Monday entry;
maintained going forward by `hours.py` in the crawler).
Flags/state: `is_active`, `is_claimed`, `claim_status`, `claim_code`, `is_premium`,
`premium_requested_at`, `is_enrolling`, `enrollment_note`, `updated_at`.

### Other tables
- `claim_submissions` — staging for profile claims. Columns mirror the claim form + `school_id`,
  `status:'pending'`, `claim_code`, `plan` (`free` | `premium_interest`), `proof_document_url`,
  `fee_*`, `contact_*`.
- `new_school_submissions` — staging for unlisted schools: `school_name`, `category`,
  `proposed_school_code` (KPM) XOR `jkm_registration_no` (JKM), `agency` (`'KPM'|'JKM'`),
  address fields, contacts, `proof_document_url`, `claim_code`, `status:'pending'`.
- `job_postings` — `school_id`, `position`, `position_type` (`Sepenuh Masa`/`Separuh Masa`/
  `Relief`), `num_openings`, `requirements`, `salary_min/max`, `poster_url`,
  `status` (`pending|active|filled|rejected|expired`), `created_at`, `expires_at`
  (~3 months after activation).
- `school_photos` — `school_id`, `photo_url`, `caption`, `created_at`. Cap: 20/school.
- `school_announcements` — `school_id`, `message`, `attachment_url`, `created_at`.
- `school_testimonials` — `school_id`, `parent_name`, `testimonial_text`, `created_at`.
- `school_views` / `school_whatsapp_clicks` — `school_id` (**string**), `view_count` /
  `click_count`. Written only via RPCs.
- `postcode_reference` — `postcode`, `lat`, `lng`, `city`, `state`. 911 Malaysian postcode
  centroids. **This is the geo fallback**: 4,304 of the 4,417 schools without their own
  coordinates have a postcode present here, taking nearby-search coverage from 59.6% to 99%.
  Small enough (911 rows) to load client-side and join in JS — berdekatan.html does exactly
  that and labels results derived this way as approximate. RLS enabled + public SELECT policy,
  writes revoked from anon (2026-07-25); before that it was anon-writable, see the pitfall
  checklist.
- `postcode_lookup` — `postcode`, `town`, `pc_state`. 2,928 rows. **RLS enabled with NO
  policies**, so anon reads return 0 rows, not an error. Use `postcode_reference` instead
  unless a policy is added deliberately.
- **Populated but referenced by no page** (checked 2026-07-25 — candidates, not bugs):
  `jkm_category` (30.5%: Institusi 3,052 / Tempat Kerja 214 / Dirumah 48 / Komuniti 12 /
  Harian 4), `jkm_valid_from`, `fee_est_min/max/updated`, `fee_reports`, `is_verified`
  (0 rows true), `view_month`, `last_digest_views/clicks`. Tables at 0 rows: `reviews`,
  `school_events`, `teacher_interest`, `correction_reports`, `digest_runs`.
- `outreach_campaign` — `school_id` (PK), `contacted_at`, `link_clicked_at`, `click_count`,
  `notes`. Admin-only via RPCs (`mark_outreach_contacted`, `unmark_outreach_contacted`,
  `log_outreach_click`, `get_outreach_stats`, `get_outreach_list`, `delete_outreach_record`) —
  no public RLS policies at all on this table, matches the SECURITY DEFINER pattern below.

### RPCs
`increment_school_view(p_school_id)` and `increment_school_whatsapp_click(p_school_id)` —
always pass `String(id)`, always fire-and-forget:
```js
db.rpc('increment_school_view', { p_school_id: String(id) }).then(()=>{}).catch(()=>{});
```

### Storage buckets
`school-assets` (covers, logos, galleries, fee docs, proof docs, announcements),
`job-posters`.

### `/api/*` endpoints (server-side; do NOT reimplement client-side)
- `POST /api/verify-recaptcha` `{token, action}` → `{success}` — **fail-open** on infra error.
- `POST /api/messenger` `{schoolName, type, ...}` — admin notification; never awaited fatally.
- `POST /api/send-claim-email` `{to, type:'pending'|..., schoolName, claimCode, schoolId?}`.
- `POST /api/manage-job-posting` `{action:'list'|'create'|'markFilled'|'delete', schoolId,
  claimCode, jobId?, payload?}` — enforces claim-code server-side. ALL job mutations go here,
  never direct table writes from the client.

**`fetch()` does not throw on HTTP error responses** — a 4xx/5xx from any `/api/*` endpoint
resolves normally; only network-level failures throw. Any call where the caller needs to know
whether the request actually succeeded (email/notification sends especially) must check
`response.ok` explicitly and surface a real warning on failure — a bare `try/catch` around
`await fetch(...)` will silently swallow a real failure and the caller will report success
regardless. This shipped twice in the same shape in this codebase (claim approval, new-school
approval) before being caught — grep every call site of an endpoint when fixing this, not
just the one reported.

If a task needs an endpoint or column not listed above: **stop and escalate** (CLAUDE.md §5.7).
Never guess an interface into existence.

## Category & agency semantics (source of most listing bugs)

- `category` values: `SWASTA`, `ANTARABANGSA`, `JKM` — but KPM casing varies in data, so:
  - JKM: exact match — `.eq('category','JKM')` / `.neq('category','JKM')`.
  - SWASTA / ANTARABANGSA: `ilike` or `(s.category||'').toLowerCase().includes('antarabangsa')`.
- **Dual-license** = non-JKM row with `jkm_registration_no` set. Gets MOE styling + `+JKM` chip
  and matches JKM filters: `.or('category.eq.JKM,jkm_registration_no.not.is.null')`.
- **JKM rows have `town`, not `district`** for ~23% of rows (77% now backfilled from the
  dominant KPM district per town — genuinely mixed-district towns like Kuala Lumpur and
  Puchong were deliberately left unresolved rather than guessed). Every location render:
  `s.district || s.town || ''`. Every select feeding a school display includes at minimum:
  `id,name,slug,district,town,state,category,jkm_registration_no` (+ what the renderer needs).
- KPM totals exclude JKM (`.neq('category','JKM')`); JKM is counted separately. Never blend
  them into one number without saying so — a page that counts JKM into a headline total but
  then excludes JKM from the actual listing below it is a real bug that has shipped here before.

## Canonical query patterns (copy these)

### Public read (the invariant)
```js
db.from('schools').select('...').eq('is_active', true) // ALWAYS on public pages
```

### Exact counts (never data.length)
```js
const { count } = await db.from('schools')
  .select('*', { count: 'exact', head: true })
  .eq('is_active', true).eq('category','JKM');
```
Run parallel counts with `Promise.all` (see statistik/kawasan/state).

### Full-table scan past the 1000-row cap
```js
let all = [], from = 0; const B = 1000;
while (true) {
  const { data: batch, error } = await db.from('schools')
    .select('state,category').eq('is_active', true).range(from, from + B - 1);
  if (error || !batch || batch.length === 0) break;
  all = all.concat(batch);
  if (batch.length < B) break;
  from += B;
}
```
**This cap is not JS-specific.** It bit `crawler.py` (the local Python crawler using the
`supabase-py` client) too: `list_states()` and `generate_slugs_all()` had already been fixed
with the `.range()` loop above, but the main batch-fetch loop still used a single
`.limit(batch_size).execute()` call and silently returned only 1000 rows even when
`batch_size=4000` was requested — no error, just a quietly wrong batch size. When touching
ANY Supabase query, in this repo's JS or in the Python crawler, check whether it could ever
exceed 1000 rows and page with `.range()` if so — don't assume a fix applied to one call site
in a file covers every call site in that same file.

### Display list with per-category caps
When one category could crowd out another under a single `.limit()`, fetch separately
(kawasan.html's fix — keep the comment explaining why):
```js
const CAP = 60;
const [{ data: kpm }, { data: jkm }] = await Promise.all([
  base(db.from('schools').select('*')).neq('category','JKM')
      .order('is_premium',{ascending:false}).limit(CAP),
  base(db.from('schools').select('*')).eq('category','JKM').limit(CAP),
]);
```
Ordering conventions: premium first (`is_premium desc`) or claimed first
(`is_claimed desc, name asc`), page-dependent — match the page you're editing.

### Ordering on a sparse column — `nullsFirst` is not optional
Postgres puts NULLs **FIRST** on a DESC order, and PostgREST inherits that, not a
client-side "nulls last" default. Sorting by `google_rating` (38% populated) without this
fills page 1 with the 62% of schools that have no rating at all:
```js
query.order(sortField, { ascending, nullsFirst: false })   // ALWAYS on non-100% columns
```
Check a column's fill rate before adding a sort option; treat anything under 100% as sparse.

### Unicode trap in Google-sourced text
`operating_hours` contains U+202F (before AM/PM), U+2009 (around the dash) and U+2013 (en
dash). They render as ordinary spaces and hyphens, so patterns written against the visible
string silently match nothing. Normalise first — in SQL
`translate(v, chr(8239)||chr(8201)||chr(8211), '  -')`, in JS/Python replace the same three
code points. `hours.py:normalise()` is canonical. Full rationale: M28.

### Column fill rates (schools, is_active, measured 2026-07-25)
Re-measure before trusting these; they are a snapshot (M26). Query:
```sql
select e.k, count(*) from schools s, jsonb_each(to_jsonb(s)) e(k,v)
where s.is_active and v <> 'null'::jsonb and btrim(v::text,'"') <> '' group by e.k;
```
address/state/category 100% · postcode 99.1% · town 98.5% · district 93.2% · slug 100%
(971 backfilled 2026-07-25) · school_code 72.4% · phone 64.2% · lat/lng 59.6% ·
photo_url 40.7% · operating_hours 39.9% · google_rating 38.3% · jkm_registration_no 31.0% ·
website 16.0% · email 13.1% · description 7.8% · curriculum 4.4% · fee_min/max 1.1% ·
age_range 0.7% · whatsapp 0.1%.

**Exception:** pages with real pagination (`.range()` + a Load More button, e.g. state.html)
do NOT need the per-category split — nothing is silently capped out, JKM rows simply appear
in their natural sort position as the user pages through. Only split categories when a single
`.limit()` would permanently exclude one category's results.

### Search with sanitized input
```js
const qSafe = q.replace(/,/g, ' ');       // commas are PostgREST filter grammar
query = query.or(`name.ilike.%${qSafe}%,commercial_name.ilike.%${qSafe}%`);
```
Debounce 350–400ms, minimum 2–3 chars, `.limit(8)` for pickers.

### Joining jobs → schools (no FK join; two queries + map)
```js
const schoolIds = [...new Set(jobs.map(j => j.school_id))];
const { data: schools } = await db.from('schools')
  .select('id,name,district,town,category,jkm_registration_no,state,phone,whatsapp')
  .in('id', schoolIds);
const map = {}; (schools||[]).forEach(s => map[s.id] = s);
const joined = jobs.map(j => ({...j, school: map[j.school_id] || {}}))
                   .filter(j => j.school.name);
```
Jobs additionally filter expiry client-side even when status hasn't flipped:
`jobs.filter(j => !j.expires_at || j.expires_at > new Date().toISOString())`.

## Write flows

### Public submission (claim / new school / anything reviewable)
1. Validate client-side; bilingual `val*` messages via `showAlert`.
2. `verifyRecaptcha(action)` — fail-open stays.
3. Upload any files FIRST (a required-proof upload failure aborts before the insert).
4. Insert into the **staging table** with `status:'pending'`, generated `claim_code` where the
   flow issues one (`genClaimCode()` — 8 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, or the
   claim.html variant `'CS'+Date.now().toString(36).toUpperCase().slice(-6)`).
5. Optional flag on the live row only if the existing flow does it
   (claim → `schools.update({claim_status:'pending'})`).
6. Fire notifications, each in its own try/catch `console.warn`:
   `/api/messenger`, then `/api/send-claim-email`.
7. Swap to the success panel. Never leave the button disabled on failure — restore its label.

### Claim-code-authenticated self-service (kemaskini pattern)
- Search → `pickSchool` (reject if `!is_claimed`) → code entry → compare
  `entered.toUpperCase() === (school.claim_code||'').toUpperCase()`.
- Persist `{schoolId, claimCode}` in `sessionStorage` under a page-scoped `cs_*_session` key;
  on load, `tryRestoreSession()` re-fetches the row and re-validates the code, falling back to
  `tryAutoSelectFromUrl()` (`?id=` deep-links from profile pages).
- Direct `schools.update()` is allowed ONLY in this authenticated context and only for the
  self-service columns kemaskini already touches. Include `updated_at: new Date().toISOString()`.
- Job mutations even in this context go through `/api/manage-job-posting`.

### Admin-privileged writes (the SECURITY DEFINER pattern)
- `admin.html` uses the public anon key with only a client-side password gate — RLS policies
  that correctly restrict anon for normal school-facing writes will ALSO block admin's own
  privileged actions (approvals, JKM confirmations, gallery moderation, outreach tracking),
  because RLS `USING`/`WITH CHECK` clauses evaluate the current/target row state regardless of
  who's asking.
- **Fix pattern: never weaken the underlying policy.** Add a narrow `SECURITY DEFINER` RPC
  function scoped to exactly the one admin action needed, `GRANT EXECUTE ... TO anon` in the
  same migration (omitting the grant is a silent-failure trap), and call that RPC from
  admin.html instead of a direct table write. This is how `approve_school_claim()`,
  `admin_delete_school_photo()`, and the whole `outreach_campaign` RPC set were built.

### Storage uploads (the full ritual)
```js
// path: scope by school id, timestamp, sanitize the original name if kept
const path = `${school.id}/${type}-${Date.now()}.${ext}`;          // owned assets
// or: `new-school-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g,'_')}` (pre-school-id flows)
const { error: uploadError } = await db.storage.from('school-assets').upload(path, file);
if (uploadError) { /* user-facing error, restore button, return */ }
const { data: urlData } = db.storage.from('school-assets').getPublicUrl(path);
```
- **Photos** (cover, gallery): run through `compressImage(file)` (1600px longest side, JPEG
  q0.8 — the rationale comment in kemaskini.html travels with the function).
- **Logos**: NO compression (PNG transparency). **PDFs**: upload as-is (legibility).
- **Replacing** a file (cover, logo): capture the old URL first, upload the new, update the DB,
  then `storage.remove([oldUrl.split('/school-assets/')[1]])` with `.catch(console.warn)` —
  otherwise orphans accumulate forever.
- **Deleting** a row that owns a file (gallery photo): fetch `photo_url` first, remove the
  storage object, then delete the row.
- **Raw SQL cannot delete storage objects** — Supabase's `protect_delete` trigger blocks
  `DELETE FROM storage.objects` regardless of role. Use the JS Storage API
  (`db.storage.from('bucket').remove([path])`) from application code, or the Supabase
  Dashboard manually. This has cost real debugging time here before — don't rediscover it.
- Enforce caps before uploading (gallery: count query vs `MAX_PHOTOS = 20`).
- Multi-file uploads loop sequentially with per-file try/catch, count successes, and report
  `${successCount} daripada ${files.length}` — never all-or-nothing.

## Pitfall checklist (run against any data change)

- [ ] `is_active` filtered on every public `schools` read.
- [ ] JKM matched exactly; SWASTA/ANTARABANGSA matched case-insensitively.
- [ ] `district||town` fallback everywhere a location renders; select includes both.
- [ ] No total derived from a capped or uncapped `.select()`'s length — counts are
      `{count:'exact',head:true}`; scans use the range loop.
- [ ] A headline count and the listing beneath it agree on what's included (KPM+JKM
      together, or both filtered the same way) — never count one scope and display another.
- [ ] User input sanitized before `.or()` interpolation.
- [ ] A new anon-key query whose numbers all look suspiciously zero/uniform has been checked
      against `pg_policies` for that table -- a Postgres count with no matching RLS SELECT
      policy returns 0 successfully, not an error (shipped once against `claim_submissions`,
      which is INSERT-only by design). Never add a public SELECT policy to work around this;
      add a narrow SECURITY DEFINER RPC scoped to the one read needed.
- [ ] Same trap on the WRITE side: an anon-key `.update()` against a row that fails the
      table's UPDATE policy (e.g. `schools`' `claimed_schools_can_update_own_profile`,
      `is_claimed = true`) returns success with 0 rows affected -- no exception, nothing in
      the console. `crawler.py` printed "success" for hundreds of coordinate writes to
      UNCLAIMED schools for months before this was caught by cross-checking the actual table.
      **For a web page**, fix it the admin.html way (SECURITY DEFINER RPC). **For a trusted
      local/backend script that never leaves the operator's own machine** (like the crawler),
      just use the `service_role` key directly instead of anon -- there's no public-facing
      constraint forcing the RPC workaround. Either way: never trust a write's console output
      alone -- spot-check the actual table after any batch write against an RLS-protected table.
- [ ] Before a page depends on a table it has never read, check BOTH directions: anon CAN
      select (an RLS SELECT policy exists — otherwise reads silently return 0 rows) and anon
      CANNOT write (RLS enabled AND insert/update/delete/truncate revoked). **RLS disabled
      means exposed, not permissive** — `postcode_reference` sat with RLS off and anon holding
      TRUNCATE until 2026-07-25, and the anon key ships in every page. Verify by impersonation,
      not by assumption: `set local role anon; select count(*) from <table>;`
      Still open: `school_fee_clicks` has the same exposure.
- [ ] Writes from public pages hit staging tables only; job mutations via `/api`; admin
      privileged writes go through a SECURITY DEFINER RPC, never a weakened public policy.
- [ ] Notifications and analytics individually try/caught; main flow never blocked by them.
- [ ] Uploads follow the compression/no-compression rules and clean up replaced files.
- [ ] `school_views`/`school_whatsapp_clicks` ids passed as `String(id)`.
- [ ] State comparisons UPPERCASE; aggregations run through `STATE_NORMALIZE`
      (`PUTRAJAYA → WP PUTRAJAYA`); display alias `KUALA LUMPUR → WP KUALA LUMPUR`.
- [ ] School links use `s.slug ? '/school/'+s.slug : '/school.html?id='+s.id` — and if the
      task involves adding a NEW indexable slug route (a new state, a new landing type),
      remember `vercel.json` needs a matching explicit rewrite entry or the clean URL 404s.
- [ ] Nothing invented: every column, table, bucket, RPC, and endpoint used appears in this
      skill or in the codebase. If not → escalate, don't guess. (A prior "SEO audit" invented
      a `claimed_status` column and a `total_views` column that don't exist, and proposed SQL
      that would have silently overwritten a real, working RPC — verify against the live
      schema before trusting any external audit's specific claims.)
