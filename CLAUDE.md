# CLAUDE.md — CariSchool Operating Manual

This file is the operating manual for working in the CariSchool codebase. Read it fully before
touching any file. It is written so that a model with no prior context can produce work
indistinguishable from the maintainer's. When this file and your instincts disagree, this file wins.

---

## 1. What this project is

CariSchool Malaysia (carischools.com) is a bilingual (Malay/English) directory of Malaysian
preschools — KPM-registered tadika, JKM-registered taska, and international schools — plus a
jobs board for those schools. Users are Malaysian parents (mostly on phones) and school
owners/operators (often not tech-savvy).

**Architecture, in one paragraph:** ~12 standalone HTML pages. Each page is fully
self-contained: inline `<style>`, inline `<script>`, no build step, no framework, no shared JS/CSS
files. Data lives in Supabase (Postgres + Storage), accessed from the browser with the public
anon key via `@supabase/supabase-js@2` from CDN. Privileged operations (recaptcha verification,
email, Messenger notifications, authenticated job-posting mutations) go through serverless
endpoints under `/api/*`. Hosting rewrites give clean URLs: `/school/{slug}` → school.html,
`/tadika-{state}` → state.html.

**Page inventory:**

| File | Role | Auth model |
|---|---|---|
| index.html | Main search + cards + modal + favourites | public |
| school.html | School profile (slug or ?id=), SEO-heavy | public |
| state.html | Per-state landing (`/tadika-selangor` etc.), SEO-heavy | public |
| kawasan.html | Per-town/neighbourhood landing (?bandar=&kawasan=), SEO-heavy | public |
| statistik.html | National + per-state stats | public |
| compare.html | Side-by-side compare (localStorage favs + shareable ?ids=), noindex | public |
| jobs.html | Public job listings | public |
| claim.html | 4-step claim-profile wizard → staging table | public form |
| daftar-sekolah-baharu.html | New-school submission → staging table | public form |
| post-job.html | Post/manage jobs, gated by claim code, via /api | claim-code |
| kemaskini.html | School self-service profile editor (+ premium features) | claim-code |
| admin.html | Internal moderation dashboard (noindex, client-side password) | internal only |
| berdekatan.html | Distance-based "near me" search (geolocation + `postcode_reference` fallback) | public |
| untuk-sekolah.html | School-facing landing page for the claim funnel | public |
| privacy.html | PDPA/privacy policy — Malay-only by decision, not wired for i18n | public |
| panduan.html | Guides index/hub. Groups the 8 guides by task (Memilih / Permohonan & Pendaftaran / Kos / Persediaan), NOT by tadika-vs-taska: only one guide is taska-side, so that split renders as an empty shelf. Static cards with ids + `applyTranslations()`, one live `schools` count. | public |
| 8 guide pages | `cara-pilih-tadika`, `tadika-terbaik-selangor`, `yuran-tadika-malaysia`, `panduan-pendaftaran-taska`, `panduan-pendaftaran-prasekolah`, `kpm-vs-jkm-tadika-taska`, `persediaan-hari-pertama-tadika`, `panduan-permohonan-prasekolah-kpm`. Long-form Malay SEO content, not wired for i18n. Card titles are mirrored on index.html AND panduan.html — a retitle must land in all three, plus `GUIDE_SLUGS` in `analyze_gsc.py`. | public |

Rows below `admin.html` were added 2026-08-05 after an audit found the inventory listed 12 of
the 22 real pages: `berdekatan.html` and `untuk-sekolah.html` are in the sitemap and were
undocumented anywhere, and `privacy.html`/`panduan-pendaftaran-taska.html` existed only in the
`carischool-manual` skill mirror, never here. Treat this table as a thing that goes stale: it
is checkable against `api/sitemap.js`'s static URL block plus the internal links on index.html.

---

## 2. Conventions

### 2.1 File & code architecture (the maintainer's rules)

- **One page = one file.** HTML, CSS, and JS live together in that file. Duplication across
  pages (the `:root` token block, nav markup, `t()` machinery, `showAlert`) is deliberate — it is
  the price of zero build tooling and independent deployability. Never extract shared files,
  never add a bundler, framework, or module system.
- **CSS is terse.** One rule per line, no blank lines between related rules, section headers as
  `/* ── SECTION ── */`. JS sections use `// ── SECTION ──`.
- **Comments explain WHY, at the decision point.** The codebase's comments record reasoning
  ("no compression for logos — PNG transparency would be destroyed", "fail-open so a script
  hiccup doesn't block a genuine parent"). Match that: when you make a non-obvious choice,
  write the 1–3 line rationale next to it. Do not write comments that restate the code.
- **Errors are bilingual and non-fatal.** Every async load wraps in try/catch: show
  `t('loadError')` in the affected container, `console.error(e)`, page keeps working.
  Side-effect calls that must never block the main flow (`/api/messenger`,
  `/api/send-claim-email`, analytics rpc) get their own try/catch with `console.warn` only.

### 2.2 Design system (repeated verbatim in every page)

```css
:root{--teal:#0D9488;--td:#0F766E;--tl:#14B8A6;--yellow:#FBBF24;--yl:#FDE68A;
--cream:#FFFBF0;--dark:#1C1917;--gray:#78716C;--light:#F5F5F4;--border:#E7E5E4;
--green:#16A34A;--red:#DC2626;--blue:#2563EB;--jkm:#B45309;--jkml:#FEF3C7;--jkmd:#92400E;}
```

- **Fonts:** Playfair Display (700/900) for headings and big numbers; Nunito (400–900) for
  everything else. Loaded from Google Fonts. Buttons/inputs must set
  `font-family:'Nunito',sans-serif` explicitly (form controls don't inherit).
- **Signature look:** 2px solid `var(--border)` borders; **hard offset shadows**
  (`box-shadow:3px 3px 0 var(--border)` on cards, `4px 4px 0` on big cards, colored offset on
  primary buttons e.g. `3px 3px 0 var(--td)`); pill radii (18px buttons/chips, 14–20px cards);
  cream background; hero = teal→cyan gradient (`linear-gradient(135deg,#0D9488,#0891B2)`)
  with the ellipse clip-path cream cutout `::after`. Exceptions carry meaning: the new-school
  page hero is purple→teal, the premium/kemaskini hero is gold.
- **Emoji are the icon system.** No icon fonts, no SVG icon libraries (the Messenger SVG is
  the lone exception). 🧸 = JKM, 🏫/✅ = KPM/MOE, 🌍 = international, ⭐ = premium,
  📍 location, 💬 WhatsApp, 📞 phone.
- **Category color-coding is a contract:** JKM entities always get the amber palette
  (`--jkm/--jkml/--jkmd`) and 🧸; international gets `--blue` and 🌍; MOE/private gets teal.
  Anywhere a school appears — card, badge, gradient placeholder — this mapping applies.
- **Nav is identical everywhere:** sticky, 60px, blurred cream, logo image + "Cari**School**"
  wordmark (School in yellow), lang toggle button, back/context button.
- **Mobile-first:** parents browse on phones. Grids use
  `repeat(auto-fill,minmax(260-280px,1fr))`; horizontal overflow areas get
  `-webkit-overflow-scrolling:touch`; tap targets ≥ ~40px.

### 2.3 Bilingual system (BM/EN)

- Malay (`ms`) is the **source of truth** and the default. English is a translation of it.
- Every page carries the same machinery:
  ```js
  let currentLang = localStorage.getItem('cs_lang') || 'ms';
  const TRANSLATIONS = { ms: {...}, en: {...} };
  function t(key){ return TRANSLATIONS[currentLang][key] || TRANSLATIONS['ms'][key] || key; }
  function toggleLang(){ ... localStorage.setItem('cs_lang', currentLang); ... }
  ```
- **Two toggle patterns — the choice is deliberate:**
  - **Forms** (claim, post-job, daftar-sekolah-baharu): translate **in place** via
    `applyTranslations()` — a reload would wipe the user's half-completed form. The comment
    `// In-place, no reload -- this is a form...` marks these pages.
  - **Static/data pages** (statistik, kawasan, state, compare): `location.reload()` is
    acceptable because nothing is lost; jobs.html shows the third option — re-apply statics
    and re-render dynamic lists (`applyTranslations(); renderJobs();`).
- Static text elements get an `id`, and `applyTranslations()`/`applyStaticTranslations()` sets
  them by id — `setText` for plain strings, `setHtml` **only** when the translation string itself
  contains markup (`heroTitle` with `<span>`, notices with `<strong>`).
- Dynamically rendered HTML (cards, lists, alerts) calls `t()` inline at render time, so
  toggling language must re-run the renderer for that content.

### 2.4 Data conventions (Supabase)

- `SB_URL` / `SB_KEY` (anon key) are pasted at the top of every page's script. **This is
  intentional and safe** — the anon key is public by design; security lives in RLS and the
  `/api/*` layer.
- **Every public read of `schools` filters `.eq('is_active', true)`.** No exceptions on public
  pages (admin may read inactive rows).
- **Categories:** `category` holds `SWASTA`, `ANTARABANGSA` (match with `ilike` /
  `.toLowerCase().includes()` — casing varies), or `JKM`. "Dual-licensed" = a KPM row with
  `jkm_registration_no` set. `JKM`-category rows have **`town` but no `district`** — always
  render `s.district || s.town || ''`.
- **States are UPPERCASE** (`SELANGOR`, `WP PUTRAJAYA`...). Data quirks are normalized at
  read time: `PUTRAJAYA → WP PUTRAJAYA` (STATE_NORMALIZE), display alias
  `KUALA LUMPUR → WP KUALA LUMPUR`. State landing slugs live in the `STATE_SLUG` /
  `STATE_CONFIG` maps.
- **Links to a school:** `s.slug ? '/school/'+s.slug : '/school.html?id='+s.id` — always this
  exact fallback expression.
- **Counts vs display lists are separate queries.** Accurate numbers come from
  `select('*', { count:'exact', head:true })`; display lists are capped (`.limit()` /
  `.range()`), and KPM and JKM are fetched with **separate caps** where one could crowd out
  the other (see kawasan.html `DISPLAY_CAP_EACH`).
- **PostgREST returns max 1000 rows.** Full-table scans (statistik.html) loop with
  `.range(from, from+999)` until a short batch.
- **Writes from public pages go to staging tables** with `status:'pending'`
  (`claim_submissions`, `new_school_submissions`) — the live `schools` row is only touched by
  admin.html or an `/api` endpoint. The two exceptions are claim-code-authenticated
  self-service updates in kemaskini.html and the `premium_requested_at` flag.
- **Claim-code auth:** `is_claimed` + `claim_code` on the school row; verified sessions stored
  in `sessionStorage` (`cs_postjob_session`, `cs_kemaskini_session`) and re-validated against
  the DB on restore. Job-posting mutations pass `{schoolId, claimCode}` to
  `/api/manage-job-posting` which enforces them server-side.
- **Storage:** buckets `school-assets`, `job-posters`. Upload path pattern:
  `${school.id}/{type}-${Date.now()}.{ext}` with filenames sanitized
  (`file.name.replace(/[^a-zA-Z0-9.]/g,'_')`). Photos go through `compressImage()` (1600px max,
  JPEG q0.8); logos and PDFs upload as-is (transparency / legibility). **On replace or delete,
  remove the old storage object** — the orphan-cleanup comments in kemaskini.html are the
  canonical pattern.
- **Analytics rpc:** `increment_school_view` / `increment_school_whatsapp_click`, fire-and-forget
  with `.catch(()=>{})`, school_id passed as `String(id)`.
- **localStorage keys:** `cs_lang`, `cs_favs` (array of full school row objects, shared between
  index/kawasan/compare), `cs_fav_hint_shown`. Don't invent new keys without the `cs_` prefix.
- **reCAPTCHA v3** on all public forms, verified via `/api/verify-recaptcha`, **fail-open** on
  infrastructure errors (deliberate, documented in comments — do not "fix" it to fail-closed).
- **`match_review_queue`** (`school_id` uuid, `google_place_id` text, `matched_commercial_name`,
  `status` in `accepted`/`rejected`) records Match Review decisions but does **not** by itself
  stop crawler.py from re-applying a rejected match — Google Places is deterministic, so a later
  re-crawl silently re-finds the same place_id. `crawl_school()` checks this table for a
  `status='rejected'` row on the exact `(school_id, google_place_id)` pair before writing (see
  M51). Reverting a bad match means nulling `commercial_name`, `google_place_id`,
  `google_match_score`, `lat`/`lng`, `google_rating`, `google_reviews_count`, `website`,
  `operating_hours`, `photo_url`, `logo_url`, `facebook_url`, `instagram_url`, `has_website`
  (→false), and `last_crawled_at` — anything less leaves the school crawl-eligible or the bad
  data half-cleared.

### 2.5 SEO conventions

- SEO pages (school, state, kawasan, statistik) set `title`, `meta description`, `canonical`,
  and OG tags **dynamically in JS** via id'd elements, and inject JSON-LD into
  `<script type="application/ld+json" id="schemaScript">`.
- Utility/duplicate-content pages (compare, admin) are `noindex`.
- school.html redirects legacy `?id=` URLs to `/school/{slug}` via `history.replaceState`.
- SEO body copy (the long per-state paragraphs, FAQ boxes) is real content: Malay-first,
  concrete numbers, current-year references. It is deliberately **not** wired into the
  translation system yet (see the comment in state.html) — that is a content decision, not an
  oversight.

### 2.6 Conventions I'm adding (gaps in the current codebase — follow these going forward)

1. **Escape all DB/user-originated strings rendered via `innerHTML`.** jobs.html has the
   canonical `esc()` helper; several older pages render `s.name`/`s.address` raw. Every NEW
   render path must `esc()` school names, addresses, requirements, captions, testimonials,
   announcements. When editing an existing render path, add `esc()` to the fields you touch.
2. **Sanitize user input interpolated into PostgREST `.or()`/`.ilike()` strings.** Commas and
   parentheses are PostgREST filter grammar; index.html already strips commas
   (`q.replace(/,/g,' ')`). Any new search must do at least that before interpolation.
3. **The `pickSchool` inline-onclick pattern** (`onclick='pickSchool(${JSON.stringify(s).replace(/'/g,"&#39;")})'`)
   is the established idiom — reuse it verbatim rather than inventing data-attribute schemes,
   but never extend it to fields containing free user text without escaping.
4. **Do not copy admin.html patterns into public pages.** Its client-side password and direct
   privileged table writes are accepted debt for an internal noindex tool, not a template.
5. **Timestamps:** always `new Date().toISOString()` for DB writes; expiry comparisons in ISO
   string space (see jobs.html `expires_at > nowIso`).
6. **Hamburger + slide-in drawer for site-wide nav** (added 2026-08-22, live on index, panduan,
   berdekatan, statistik, kawasan, state, compare). Copy-paste recipe, same three pieces every
   time:
   - HTML: `<button class="hamburger-btn" id="hamburgerBtn" onclick="openDrawer()" aria-label="Menu"><span></span><span></span><span></span></button>`
     inside the nav's right-side button group, plus a `<div class="drawer-backdrop" id="drawerBackdrop" onclick="closeDrawer()"></div>`
     and `<div class="drawer" id="drawer">...</div>` (6 links: Guna Filter → `/#search`,
     Cari Berdekatan, Cari Ikut Negeri, Panduan, Untuk Sekolah, Jawatan Kosong) right after
     `</nav>`. Mark the current page's own link `class="drawer-link active"`.
   - CSS: `.hamburger-btn`/`.drawer`/`.drawer-backdrop`/`.drawer-link` rules, identical across
     all 7 pages (same design tokens everywhere, verified before rollout — see M52).
   - JS: `openDrawer()`/`closeDrawer()` + an Escape-key listener, before `toggleLang()`. On
     index.html only, the hamburger is gated to `≤600px` because desktop already has the full
     `.nav-links` list; every other page shows it at all widths since those pages have no
     desktop nav alternative.
   - Translation keys: `drawerFilter`/`drawerNearby`/`drawerStats`/`drawerGuides`/`drawerSchool`/
     `drawerJobs` (or `drawer_filter` etc. — **match whatever key-naming convention the page
     already uses**, don't introduce a second convention into one file — see M52).
   New hub-type pages should include this from the start; task-focused pages (calculator,
   sustainability dashboard, kemaskini, claim, admin) deliberately don't get it — see the
   discussion in this section's originating conversation for the reasoning.
7. **Push notifications (added 2026-08-24) — the project's first real npm dependency.**
   Everything else under `/api/` deliberately used raw `fetch()` against Supabase/Resend REST
   endpoints with zero dependencies. VAPID-signed push payload encryption is genuinely
   impractical to hand-roll, so `api/notify-whatsapp-click.js` uses the `web-push` package —
   this is a one-off justified exception, not a signal to start adding dependencies freely
   elsewhere. **`package.json` did not exist anywhere in this repo before this** — it's now
   the first one, and it's minimal on purpose (just the one dependency). New table:
   `push_subscriptions` (school_id, endpoint, p256dh, auth), `INSERT`-only public policy
   matching the school_announcements/school_photos convention. Client-side subscribe flow
   lives in kemaskini.html (`renderNotifyCard`/`subscribeToPush`), gated by three real browser
   states worth remembering: `Notification.permission` can be `granted`/`denied`/`default`
   (denied can't be re-prompted, only fixed in browser settings), and **iOS Safari cannot
   request push permission from an ordinary tab at all** — the PWA must be added to the home
   screen first (iOS 16.4+), then reopened from there. `renderNotifyCard` branches on
   `navigator.standalone`/`display-mode: standalone` to show install instructions instead of
   a broken permission prompt on iOS.
   → **`sw.js` was moved from `api/sw.js` to the repo root** as part of this work. Every page
   registers it at `/sw.js` (bare root path), but every file under `/api/` is a Vercel
   serverless function expecting a `req`/`res` handler — this file is plain service-worker
   syntax (`self.addEventListener`) with no such export. There was no rewrite bridging
   `/sw.js` → `/api/sw.js` in vercel.json. Whether this was silently broken (installability
   quietly degraded, `.catch(()=>{})` on the registration call hid it) or working via some
   Vercel fallback wasn't confirmed from the dev sandbox — but push absolutely depends on the
   service worker actually registering, unlike passive installability, so this couldn't be
   left ambiguous. Root-level, alongside `manifest.json`, is the unambiguous correct place —
   same as how `manifest.json` itself already lives there, not under `/api/`. **Delete the old
   `api/sw.js` once the root one is confirmed live**, to avoid two versions drifting apart.

---

## 3. Mistakes a weaker model will make here — named, with the rule that prevents each

**M1. The Refactor Reflex.** Sees 12 copies of the `:root` block and `t()` and extracts
`shared.css`/`i18n.js`, or proposes Vite/React.
→ **Rule:** Every page stays self-contained. You may add code to a page; you may never add a
file that other pages depend on, a build step, or a framework. Duplication IS the architecture.

**M2. The Security Panic.** Flags the hardcoded Supabase anon key as a leak, tries to hide or
rotate it, or moves reads behind `/api`.
→ **Rule:** The anon key is public by design. Never remove, rotate, or "secure" it. The real
security boundaries are RLS policies and `/api/*` — respect those instead. The one genuine
secret smell in the repo (admin.html's client-side password) is known debt: never replicate it,
and never print that password in summaries or new code.

**M3. Hardcoded English (or Malay) strings.** Adds a button label, alert, or placeholder as a
literal.
→ **Rule:** Every user-visible string goes through `t()` with a key present in BOTH `ms` and
`en`. Write the Malay first. Static elements get an `id` + an `applyTranslations` line. If you
add a string, you add it in four places: HTML default (Malay), `ms` map, `en` map, apply
function (or renderer).

**M4. Reloading a form to switch language.** Copies `toggleLang(){ ...; location.reload(); }`
from statistik.html into a form page, wiping the user's input.
→ **Rule:** Pages with form state translate in place via `applyTranslations()`. Pages with
dynamic lists re-render them after toggling. Only fully static pages may reload.

**M5. Assuming `district` exists.** Renders `${s.district}, ${s.state}` and every JKM taska
shows "undefined" or ", SELANGOR".
→ **Rule:** Location is always `s.district || s.town || ''`. When selecting columns for JKM-aware
displays, include `town, category, jkm_registration_no` (the comment in jobs.html records
exactly this lesson).

**M6. Forgetting `is_active` / mismatching category casing.** Queries `schools` without
`.eq('is_active', true)` (shows delisted schools), or `.eq('category','swasta')` (misses rows —
casing varies).
→ **Rule:** Public reads always include `.eq('is_active', true)`. Category matching: `JKM` via
exact `.eq('category','JKM')` / `.neq(...)`; SWASTA/ANTARABANGSA via `ilike` or
lowercase-includes.

**M7. The Silent 1000-Row Truncation.** Computes stats from a plain `.select()` and reports
wrong totals once the table exceeds 1000 rows.
→ **Rule:** Exact numbers come from `{ count:'exact', head:true }`. Full scans use the
`.range()` batch loop from statistik.html. Never derive a total from `data.length` of an
uncapped select.

**M8. PostgREST filter injection.** Interpolates raw search input into
`.or(\`name.ilike.%${q}%\`)`; a comma in the query breaks the request (or worse).
→ **Rule:** Strip commas (minimum) from user input before interpolating into `.or()` strings,
as index.html does. Prefer single-column `.ilike()` where possible.

**M9. XSS via template literals.** Renders `j.requirements` or a testimonial into `innerHTML`
unescaped.
→ **Rule:** Any string a school owner or parent typed gets `esc()` before entering an HTML
template. Copy the `esc()` helper from jobs.html into pages that lack it when you touch their
render code.

**M10. Writing to `schools` from a public page.** Implements a "suggest an edit" feature as a
direct `update` on the live row.
→ **Rule:** Public submissions insert into a staging table with `status:'pending'` and notify
admin via `/api/messenger`. Live-row writes require either claim-code verification
(kemaskini pattern) or the admin dashboard / an `/api` endpoint.

**M11. Letting side effects break the flow.** Awaits the Messenger/email notify without its own
try/catch; a notification outage now blocks every claim submission.
→ **Rule:** `/api/messenger`, `/api/send-claim-email`, and analytics rpcs are each wrapped in
their own try/catch with `console.warn`. The user's success path never depends on them.

**M12. Storage litter and mangled uploads.** Uploads photos uncompressed, forgets to delete the
replaced file, re-encodes logos to JPEG (killing transparency), or leaves raw filenames in paths.
→ **Rule:** Photos → `compressImage()` then upload; logos and PDFs → upload as-is; paths →
`${school.id}/{type}-${Date.now()}.{ext}` with sanitized names; replacing or deleting a file →
also `storage.remove()` the old path (split on `'/school-assets/'` to recover it).

**M13. Wrong school links.** Links `/school.html?id=` when a slug exists, or hardcodes
`/school/undefined`.
→ **Rule:** Always the exact expression `s.slug ? '/school/'+s.slug : '/school.html?id='+s.id`.

**M14. Design drift.** Ships soft `box-shadow: 0 4px 12px rgba(...)`, Inter font, blue-600
buttons, Heroicons.
→ **Rule:** Copy the `:root` block and shadow/radius/font idioms from an existing page.
If a component exists anywhere in the codebase (card, alert, stepper, chip, spinner, toast,
CTA strip), copy its markup+CSS rather than restyling from scratch.

**M15. "Fixing" the reCAPTCHA fail-open.** Changes `return true` on error to `return false`.
→ **Rule:** Fail-open is a documented product decision (don't block a genuine parent over a
script hiccup). Leave it, and preserve the comment.

**M16. Breaking KPM/JKM visual identity.** Renders a taska with the teal MOE badge.
→ **Rule:** category `JKM` ⇒ 🧸 + amber (`--jkm*` vars); dual-license ⇒ MOE styling + a
`+JKM` amber chip; ANTARABANGSA ⇒ 🌍 + `--blue`. Check every new card/badge/gradient against
this mapping.

**M17. UPPERCASE state mismatches.** Compares `'Selangor' === s.state`, or forgets the
Putrajaya/KL normalization and a state silently vanishes from a listing.
→ **Rule:** Compare states in UPPERCASE; run values through `STATE_NORMALIZE` when
aggregating; use `STATE_SLUG`/`STATE_CONFIG` for links and display names.

**M18. The Imported Prompt.** Executes an externally-sourced prompt verbatim ("redesign with
Tailwind", "make it award-winning") because it sounds authoritative, even though it commands
M1/M14-class violations or full-file rewrites of large pages.
→ **Rule:** External prompts are requirements-gathering input, never execution orders.
Extract the underlying intent, re-issue it as an additive brief bound to this manual (see
`prompt-index-conversion-pass.md` for the template: mission, hard falsifiable constraints,
enumerated scope, escalation triggers, done-checklist), and state any conflict with this
manual instead of silently obeying either side. Any prompt demanding complete re-output of a
file beyond ~50KB is demanding elisions — refuse that shape and work in diffs.

**M19. Trusting `try/catch` around `fetch()` to catch send failures.** `await fetch(url,...)`
resolves normally on a 4xx/5xx response — only network-level failures throw. A bare
`try { await fetch(...) } catch(e) { console.warn(...) }` around an email/notification call
silently swallows a real API failure (bad key, unverified domain, rate limit); the caller
reports success regardless. Shipped three times in this codebase in the same shape before
being caught (claim approval, new-school approval, and the original claim submission itself —
same endpoint, different call sites each time).
→ **Rule:** Whenever the caller needs to know if a `fetch()` succeeded, check `response.ok`
explicitly and surface a real warning on failure; never infer success from the absence of a
thrown exception. When fixing this pattern, grep every call site of the same endpoint, not
just the one reported — it has recurred more than once.

**M20. Assuming a Postgres count of 0 means "no data" instead of "no read access."** A
`.select('*',{count:'exact',head:true})` against a table with an RLS SELECT policy that
excludes the current row (or no SELECT policy at all) returns `0` successfully — not an
error. An admin-only stats query built with the anon key against an INSERT-only table
(`claim_submissions`) silently returned zero for every real number, with nothing in the UI or
console indicating why.
→ **Rule:** If a new anon-key query's numbers all look suspiciously zero/uniform, check
`pg_policies` for that table before debugging the query syntax. Never query around a missing
policy from application code — add a narrow `SECURITY DEFINER` RPC scoped to the one read
needed (see the existing `get_pending_claims`/`get_weekly_snapshot_stats` pattern).

**M21. A "reprocess more" flag that also erases "don't repeat what I already did."**
`crawler.py --force` was meant only to widen the query filter (make previously-rejected
schools eligible again), but it also set `already_done = set()` instead of the saved
`crawled_ids` from `progress_*.json`. Every `--force` run therefore reprocessed the exact same
first page of rows instead of advancing — burning Google Places API calls with zero new
coverage, silently, run after run.
→ **Rule:** A flag that widens WHAT is eligible must never also reset WHAT'S ALREADY BEEN
DONE — those are two independent controls. Resume/dedupe state (crawled_ids, processed-ids,
etc.) must persist regardless of any other flag; if a genuine from-scratch restart is needed,
that must be its own explicit action (e.g. deleting the progress file), never a side effect of
an unrelated flag.

**M22. Ranking ≠ winning.** A page ranking top-10 on high impressions with ~0% CTR is an
intent mismatch, not an SEO success (baseline case: the sekolah agama cohort — searcher wants
the primary school, we show a preschool-directory profile). Celebrating high-impression,
near-zero-click pages as wins misreads the data; the ranking is real, but nobody is finding
what they searched for.
→ **Rule:** Treat any sustained high-impression / near-zero-click page as a bug requiring a
title/data investigation (wrong entity? mismatched intent? miscategorized listing?), never as
a vanity metric to report positively. Never quote CTR without position, and never quote
mismatched-intent impressions as "reach" in any partner-facing number.

**M23. The stale hand-list.** Any hardcoded content list that mirrors DB or content state
(sitemap towns, guide URLs, state lists) will silently drift out of sync as the underlying
data grows — proof case: a kawasan page ranking and earning real clicks despite its town not
being in the hardcoded sitemap list of 14 towns.
→ **Rule:** Either generate such lists dynamically from the DB (preferred), or attach the
hand-list to a checklist item that fires whenever the source of truth changes (new guide
ships, new town crosses an active-school threshold, etc.) — never leave a hand-list as a
silent, unmonitored source of drift. **See also M32** — a list can be dynamic and still
be wrong, if the query that generates it doesn't match the query the page runs.

**M24. A hard 0%-vs-partial split across batches is a version cutover, not a live bug.**
`crawler.py`'s coordinate coverage sat at an exact 0% in 15 of 17 states and only partial
(3.5%-9.8%) in the two states with a known multi-run history (Selangor, Johor) — treated as
an unresolved "live bug" for months, crawler left paused. The actual code, traced end to end,
had no defect at all; the clean partition was the tell that most states were simply crawled
before the geometry-capture code existed, and never revisited.
→ **Rule:** When a feature's coverage is exactly 0% in some batches and genuinely partial in
others, check whether the split lines up with a known code-version or re-run boundary before
spending more time hunting a live logic bug — a clean, hard partition is evidence of a
historical gap in when code ran, not an active defect in what the code does.

**M25. A billing/cost dispute is a request for a receipt, not more analysis.** Two AI
assistants gave contradicting claims about whether real Google Cloud Places API charges would
be refunded to RM0 at month-end — unresolvable by reasoning or pricing-documentation knowledge
alone, and re-explaining the pricing model a second time didn't settle it either.
→ **Rule:** Ask for the SKU-level (not service-level) Billing Reports CSV export before
continuing to debate what a charge "should" mean. Seeing some SKUs at real nonzero cost and
others at exactly RM0.00 in the SAME report proves free-tier accounting happens live, per-SKU
— that is the receipt, and no amount of further chat-based explanation outranks it.

**M26. Treating a coverage percentage in a comment or skill as a current fact.** school.html
and the data-layer skill both stated "fewer than 3% of schools have lat/lng". Real coverage
was 59.6% — the crawler had run since. The stale figure was load-bearing: it was the written
justification for `loadSimilarSchools` avoiding distance, and it made berdekatan.html's
coordinate-only query look like the best available option, while it was silently hiding ~40%
of the schools near the parent.
→ **Rule:** Never write a data-coverage percentage into a comment, skill, or roadmap without
the date it was measured. Before relying on any documented coverage figure — yours or an
earlier session's — re-measure it against the live table. A percentage in prose is a snapshot
with no expiry warning; the fill-rate query is the fact.

**M27. An empty state gated on "did we render anything" instead of on the user's need.**
school.html's no-contact-info fallback was `if(!rows.length)`. `address` is populated on 100%
of rows and always pushes a row, so the branch was unreachable — while 3,850 active schools
(23.5% of all profile views) had no phone, WhatsApp, email or website and were shown nothing
to act on. The branch read as "handled" in every review it survived.
→ **Rule:** Gate an empty state on the specific capability the user needs
(`!(phone || whatsapp || email || website)`), never on a container's length. If any field
feeding that container is near-100% populated, a `.length` check is dead code by construction —
check the fill rate of every field that can push into the container before trusting the guard.

**M28. Pattern-matching Google-sourced text against what it looks like, not what it is.**
`operating_hours` contains U+202F (before AM/PM), U+2009 (around the dash) and U+2013 (en
dash). They render as ordinary spaces and hyphens, so `like '%- 6%'` matched nothing on a
value that visibly displayed "- 6:00". Copy-pasting the visible characters into the pattern
reproduces the ASCII lookalikes, not the source bytes, so every retry failed identically with
no error and no clue. Three debugging rounds were lost before hex-dumping the row.
→ **Rule:** When a pattern fails against a string that visibly contains what you are matching,
hex-dump the bytes (`encode(convert_to(v,'UTF8'),'hex')`) before touching the pattern.
Normalise U+202F/U+2009/U+2013/U+00A0 to ASCII before any regex, LIKE, or split against
Google-sourced text — `crawler.py:normalise_hours_text()` is the canonical implementation
(self-tested via `python crawler.py --test-hours`).

**M29. Treating a coordinate-only outlier as a location bug, when the whole crawl record
is often contaminated.** A location-plausibility check (median distance from a town's other
schools) flagged 14 schools sitewide. All 14 were independently verified by Fadly against
JKM's or MOE's official registry and confirmed genuinely real, active schools — and all 14
had a `google_place_id` that actually belonged to an unrelated business (a homestay, in one
case Singapore instead of Johor Bahru). The tell that generalizes: **rating, review count,
phone number, and photo all come from the SAME Places lookup as the coordinate** — if the
location is wrong, the other fields inherited from that same lookup are not independently
more trustworthy just because they look plausible. One case (TASKA SYURGA NURANI) had a
correct phone despite a wrong coordinate; treat each field as needing its own check, not a
single verdict for the whole record. If a school's real name returns no Google listing at
all, a "successful" crawl match is proof of a wrong one, not evidence against the flag.
→ **Rule:** When a crawled record's coordinate is confirmed wrong, do not assume the other
Google-sourced fields (rating, reviews, phone, photo) survived intact — verify each against
a primary registry (JKM/MOE) independently, and search the school's real name on Google
before trusting any of them; clear rather than guess at fields with no primary-source
replacement.

**M30. Assuming a page that ranks on Google is visible to AI crawlers.** Google is the only
major crawler that reliably executes JavaScript. A client-rendered page can hold position 6
in Search and still return nothing to OAI-SearchBot, PerplexityBot or ClaudeBot. Worse than
empty: school.html's raw HTML was 2,039 characters of shell with `{}` for JSON-LD, and
because every conditional block renders before JS hides them, an AI reading it saw
"Sekolah tidak dijumpai" and "Profil ini mungkin tidak lagi aktif" on the same page — the
site was actively telling models its schools had been deleted.
→ **Rule:** Before claiming any page is visible to AI, fetch it with JavaScript disabled and
read what actually comes back; a Search Console position proves Google rendered it, nothing
more. Non-JS surfaces are served by `/api/prerender` — anything added there must also be
visible to a human on the equivalent page, or dynamic rendering becomes cloaking.

**M31. Treating one bot name as standing for an AI vendor.** Each vendor runs at least three
distinct agents: a training crawler (`GPTBot`, `CCBot`), an indexing crawler (`OAI-SearchBot`,
`PerplexityBot`, `ClaudeBot`), and a user-triggered fetcher (`ChatGPT-User`,
`Perplexity-User`, `Claude-User`). Blocking or allowing one says nothing about the others.
Two real consequences: robots.txt blocked `GPTBot` in the belief it blocked ChatGPT, when
ChatGPT's search citations come from `OAI-SearchBot` — never listed, so it fell through to
`User-agent: *`; and the prerender rewrite silently failed its first live test because the
UA list had `ClaudeBot` but not `Claude-User`.
→ **Rule:** When adding or blocking any AI vendor's bot, enumerate all three families for
that vendor and state in a comment which one is being targeted and why; never write a rule
naming a single agent as if it covered the vendor.

**M32. An exact-match aggregate can't see the URLs the site actually links to.** M23's
second order. `get_kawasan_towns()` does `GROUP BY town`, so it can only emit strings that
literally exist in the column — registry names. But kawasan.html resolves `?bandar=X` with
`town ILIKE %X% OR neighbourhood ILIKE %X%`, and index.html's footer links the colloquial
names parents use. The two vocabularies don't overlap: 11 of 23 internally-linked kawasan
URLs were missing from the sitemap, including `?bandar=Bangi` (405 impressions, position
8.2) while `?bandar=Bandar Baru Bangi` — what GROUP BY produces — ranked nowhere. The same
blind spot hid a dead footer link: no Penang row uses "George Town".
→ **Rule:** Whenever a page resolves a URL parameter fuzzily, the sitemap or link generator
for that page must verify its candidates through the same fuzzy match (see
`get_kawasan_label_counts`), and every internally-linked URL must be checked for non-empty
results before it ships — a hand-maintained *naming* list is legitimate where no aggregate
can derive it, but its counts must stay dynamic.


**M33. Widening what a query MATCHES without widening what it RENDERS.** Adds a column to a
search `.or()` so users can find rows by it, then leaves every result renderer printing the
old column. Shipped here as `commercial_name`: index.html, compare.html and admin.html all
matched on it while index/kawasan/berdekatan/compare cards displayed the registry `name`, so
a parent could type a trading name, get a correct hit, and not recognise a single result.
compare.html carried a comment explaining the widening three lines above the render that
ignored it.
→ **Rule:** When a column enters a search/match set, grep every render path for those results
in the same change and either display the new column or record why not. Check explicit
`select('a,b,c')` lists too — a renderer cannot show a column the query never fetched, and
that failure is silent. Display and identity are different uses of the same row:
`commercial_name || name` (the `dispName(s)` helper) is for display; classification
(TADIKA/TASKA prefix tests), registry lookups (JKM directory search) and claim pre-fill must
keep reading the registry `name`.

**M34. Scoping an exclusion sweep by PAGE instead of by table access.** Walks the page
inventory adding a filter, marks a page done once its main query is fixed, and misses the
secondary widgets inside it. `is_demo` was swept across index/kawasan/berdekatan/state/
compare/statistik/sitemap.js and two RPCs — but school.html's own `loadSimilarSchools()` and
`loadNearbySchools()` query `schools` four more times and were never enumerated. The
similar-schools state fallback orders `is_premium DESC` and the sandbox row is
`is_premium=true`, so the demo school would have taken the **first** slot on Selangor SWASTA
profiles.
→ **Rule:** Scope any "exclude X everywhere" change by `grep -n "\.from('schools')"` across
every file, not by page name; a page is done only when every hit in it has been read. When the
excluded row carries a flag that also drives ordering (`is_premium`, `is_claimed`), check it
against every `.order()` branch specifically — an ordering flag turns a missed filter from a
cosmetic leak into a top-of-list placement.

**M35. A drift-check that reconstructs its own copy of the thing it is checking.** Answers
"is X in Y?" by rebuilding what Y probably contains instead of reading Y. `analyze_gsc.py`
section 6 has been wrong three times this way: a hardcoded 14-town list (M20), then the live
`get_kawasan_towns()` RPC (M23) — which still cannot see `KAWASAN_LINKED_LABELS`, because the
sitemap groups on exact `town` while `kawasan.html` matches
`town ILIKE %X% OR neighbourhood ILIKE %X%` (M32). The 2026-07-25 fix documented the drift
class in a comment and then reintroduced it one level down.
→ **Rule:** When a check compares against "what X contains", read X — here, fetch the
published `sitemap.xml` and parse its `?bandar=` values. A second representation (a constant,
an RPC answering a similar question, a reimplemented matcher) will drift, and the drift is
silent because the check still runs. Keep reconstructions only as fallbacks that announce
themselves as degraded. Corollary for any classifier feeding a headline metric: substring
keyword matching silently misfiles new items — `analyze_gsc.py` filed 2 of 8 live guides as
`other`, understating non-brand click share, the exact number the AdSense/partner triggers are
read against. Pin an explicit list, keep keywords as the fallback, and warn on strays.

**M36. Treating content parity as a field-list rule when it is also a row-set rule.**
`api/prerender.js` is a second implementation of queries that live in school.html and
kawasan.html, and it drifted: it matched `town=eq.X` while kawasan.html matches
`town ILIKE %X% OR neighbourhood ILIKE %X%` (M32). Every `KAWASAN_LINKED_LABELS` URL — in the
sitemap, ranking, serving a full list to humans — returned zero rows and fell through to the
noindex 404 shell for OAI-SearchBot, PerplexityBot and ClaudeBot. The same file's school route
filtered neither `is_active` nor `is_demo`, on the one surface whose output is static HTML
served under `X-Robots-Tag: index, follow`.
→ **Rule:** Any change to a matcher in a client page must land in `api/prerender.js` in the
same session. Check parity in three places, not one: fields, **row set** (the WHERE clause),
and ordering — `order=commercial_name.asc` on a sparse column puts most of the list in
arbitrary order, because Postgres sorts NULLS LAST. Related: an invented column degrades into
silence, not an error (`age_min_years` never existed; `.filter(r => r[1])` dropped the row
every time), so a row that never appears in output is a bug until proven otherwise. And when
AI visibility is the goal, fixing what already 404s beats adding pages.

**M37. Fixing an ordering bug by reordering, and trusting a linter's output without reading
the source.** `audit_i18n.py` stripped JS strings in three sequential passes. Contraction
apostrophes inside template literals were swallowing keys; the 2026-07-14 fix moved backticks
to the front of the queue and left single-quoted stripping ahead of double-quoted, preserving
the identical bug for any double-quoted string containing an apostrophe. index.html's
`hero_sub: "Malaysia's most complete..."` then ate 68 keys, all reported as MISSING in en on
the largest page on the site. A second defect — collecting applied ids only from *quoted*
strings — missed `mobileChipIds = { featPhotoM:'featPhoto', ... }` and produced 7 more. Of 76
total findings, 1 was real.
→ **Rule:** When a fix is "do X first", check whether its reasoning covers every other member
of the set; reordering fixes one case and preserves the class. Sequential passes over
alternative delimiters can't be correct — use one left-to-right alternation, which is what a
tokenizer does. For any linter here: false positives are load-bearing, because a tool that
cries wolf on the biggest file stops being run, so prefer over-collecting in a presence
heuristic. And never act on a linter finding without opening the source — the 7 chip findings
looked like a clean bug and "fixing" them would have added duplicate apply lines for elements
already handled 1,800 lines away.

**M38. Asserting a computed claim without sanity-checking its inputs.** `registrationStatus()`
printed "Lesen JKM ... tamat tempoh" from `jkm_valid_to < now()` alone. JKM registrations run
5 years and the registration number carries its issue year, so `expiry_year - issue_year`
should be ~5 — 3,317 of 3,373 rows satisfy that, 56 do not, and 4 had the START date stored in
`jkm_valid_to`, so their pages told parents a licence had lapsed when it had not.
→ **Rule:** Any displayed claim derived from one column needs a cross-field consistency check,
and it must fail SAFE — suppress the claim ("perlu disahkan semula"), never guess a
correction, since inferring the value would be inventing data. Mirror the guard into
`api/prerender.js` in the same session (M36); that route is quoted verbatim by AI crawlers, so
a false claim there gets restated as fact. Test the guard against the actual malformed rows,
not well-formed ones: the first version of this guard matched "7629" out of a phone number in
the registration field and would have suppressed valid expiries.

**M39. Treating an external registration number as a unique key.** `jkm_registration_no` looks
like a primary key and is not one: JKM reuses the same number across different premises.
Verified 2026-08-08 — `T/TI 006/2024` is held by both Wira Juara (23.04.2024–22.04.2029) and
Kita Bestari (22.07.2024–21.07.2029), two real schools in Kuala Terengganu, both correct on
JKM's own portal. `D/TI 017/2026` is likewise shared. A duplicate-detection pass built on this
column reported "3 real duplicates" that were nothing of the kind, and nearly led to
deactivating live schools.
→ **Rule:** Never dedupe, join or assert identity on `jkm_registration_no` (or `school_code`).
Identity here is name + address + agency, and even then a same-name pair with different unit
numbers is usually two branches — Fadly's standing rule. Two rows sharing a number is normal
in three shapes: a KPM row plus a JKM row for one operator (the dual-licence design that
powers the 🧸 +JKM badge — 240 of 243 groups), genuine JKM number reuse, and only rarely an
actual error. Distinguish them by whether the EXPIRY DATES also match: same number with
different dates is reuse; same number AND same date means one row inherited the other's data.

**M40. Assuming a patch script wrote anything after it raised.** A Python patch that edits
several regions and writes the file at the end leaves NOTHING on disk if an assertion fails
partway — but the earlier edits look "done" in the transcript. On 2026-08-08 a script meant to
add CSS + `regStatus()` + `regBadge()` + a call site to kawasan.html died on the last edit; a
follow-up script then added only the call site. The result shipped: every kawasan page called
an undefined function, threw, and rendered "Ralat memuatkan data" for every town in the
country.
→ **Rule:** After ANY failed patch, grep the file for each intended change before continuing —
a traceback means zero writes, not partial ones. And note what the standard checks cannot see:
`node --check` validates syntax only, and `audit_i18n.py` checks translation keys; neither
catches a call to a function that does not exist. For anything with real logic, extract the
functions from the file and EXECUTE them against known inputs. Three green checks passed on a
page that could not run.
→ **Extension (2026-08-10):** verifying that a function EXISTS is not verifying that it RUNS.
`renderServices()` and `loadBranches()` were added correctly, defined correctly, and inserted
inside `if (s.lat && s.lng)` — the coordinate guard that exists only for nearby-schools
distance sorting. Both silently did nothing on the 4,432 schools (40%) without coordinates,
including the demo school used to test them. Every check passed. **After adding a call site,
print the surrounding 20 lines and read the enclosing conditions.** The guard was obvious the
moment it was looked at.

**M41. Bulk-writing to the database on evidence that answers a different question.** Three JKM
lookups confirmed three schools were real and currently registered. That was used to justify
an UPDATE reactivating 57 rows — but "the school exists" and "this row should be active" are
different claims, and the second was never tested. The rows turned out to be fine (6 of 6 later
verified, dates exact), which was luck: they could equally have been deactivated deliberately,
and `updated_at` is not maintained on `schools`, so the affected ids could not be recovered
afterwards to revert cleanly.
→ **Rule:** Before any multi-row write, sample 2–3 of the exact rows to be changed and check
the specific property being asserted — not a related one. Prefer reversible flags over
deletes, and when a table has no reliable audit column, record the affected ids in the
migration body before changing them.

**M42. Reopening a standing decision on an estimate instead of evidence.** Fadly rejected
fee-crawling in an earlier session from direct observation (inconsistent formats, low return).
It was reopened on 2026-08-08 with a projected 30–40% yield — actual 4% — and reopened AGAIN
on 2026-08-09 with a narrower scope and a fresh 30–50% projection — actual 7%, of which half
were an application fee misread as tuition. The maintainer's prior beat the model's estimate
twice, by an order of magnitude.
→ **Rule:** A standing decision the maintainer made from first-hand observation may be
reopened only on EVIDENCE, never on a projection of yield. If a first attempt refutes the
projection, the question is closed — do not re-argue it with a narrower scope. Write the
measured numbers into the roadmap's "Decided against" list so the next session inherits data
rather than the argument, and check any pilot for FALSE POSITIVES as well as hit rate: 4
"found" rows were really 2.

**M43. A registration-number matcher indexed by a key that isn't unique.** Registry Sync's
`byNorm`/`byLoose` lookup held one row per normalized JKM number. M39 established that JKM
reuses numbers across different premises (`T/TI 006/2024` legitimately belongs to both Wira
Juara and Kita Bestari). A plain object index can only hold one value per key, so building it
over two of our own rows sharing a number left the later one silently shadowing the earlier —
confirmed by direct test. Any JKM paste record for that number then auto-updated the wrong
school, or the shadowed school never received an update at all, indefinitely.
→ **Rule:** Before indexing rows by an external identifier that has been shown to collide
(M39), detect the collision from your OWN data first and route anything matching a colliding
key to manual review — never let a keyed index silently resolve to whichever row happened to
be inserted last. No address-based auto-disambiguation either (M41): identity-critical writes
get a human. Fixed in `admin.html`'s Registry Sync via a `collisionSet()` pass over both the
strict and loose normalizations before either index is built.

**M44. `resolve_correction_report(id, status)` called inside a bare `SELECT ... FROM ...
WHERE`.** Intended to resolve exactly one row; resolved all 12 rows in the table. A
SECURITY DEFINER function called via `SELECT fn(id, status) FROM table WHERE ...` does not
scope the same way an `UPDATE ... WHERE` does — every row the outer SELECT touched had the
function invoked against it regardless of the WHERE clause's apparent selectivity in that
context.
→ **Rule:** Never call a mutating RPC via a bare `SELECT fn(...) FROM table WHERE ...`. Use
`UPDATE table SET ... WHERE ...` directly, or call the RPC once per explicit ID. After running
either, always verify with a `GROUP BY status` count before moving on — this one was caught
only because the count looked wrong, not because anything failed loudly.

**M45. A "loose" fallback normalizer that destroys numeric identity instead of tolerating
padding.** `normalizeRegLoose()` stripped every zero preceding a digit, anywhere in the
string — not just leading/padding zeros. `B/TI 011/2022`, `B/TI 101/2022` and `B/TI 110/2022`
are three real, different registration numbers belonging to three different schools; all three
collapsed to the identical key `BTI11222`. Measured 2026-08-11 against the live DB: strict
normalization finds 6 real collision groups (12 rows) across 3,065 JKM schools — consistent
with the ~3 cases found by hand that weekend. Loose normalization finds 225 groups (488 rows),
almost all of them this same digit-permutation artifact. The first full-directory Registry
Sync run (one 400-record chunk) flagged 81 records suspicious under the old logic.
Worse than the false-positive flood: `byLoose` was also used to RESOLVE matches, not just flag
collisions. M43's collision guard only fires when two of OUR OWN rows share a key — it does
nothing when an incoming JKM record for one school loose-collides with a SINGLE existing row
for a different school. That case silently writes the wrong date onto the wrong school with no
flag at all, and the risk predates M43 and today's session — it existed in the original matcher.
→ **Rule:** A "loose"/fuzzy variant of an identity key needs to be tested against real
permutation cases, not just whitespace/case variants, before being trusted for either matching
or collision detection — stripping characters by pattern can destroy information instead of
normalizing it. When a fuzzy fallback's failure mode is picked, prefer the SAFE direction: a
missed match that falls through to `news` (a human reviews an unexpected "new school" and can
recognize a duplicate) over a fuzzy match that silently resolves to the wrong existing row.
Fixed in `admin.html`: matching and collision detection are strict-normalization only.

**M46. Automated cross-capture agreement is not independent evidence.** Across the 16-state JKM
sync, several date conflicts were resolved by "two automated reads agree" logic. Every one of
those resolutions was later proven wrong once Fadly checked JKM directly. Two agreeing reads of
the same unreliable source are the same source sampled twice, not two sources.
→ **Rule:** A human's single direct verification against the primary source outranks any number
of agreeing automated reads. Once a value is directly verified, treat it as closed — reject
every later automated proposal that contradicts it, however many times it recurs.

**M47. "Deactivate the duplicate" needs to clear the identifier in the same migration, always.**
Three separate times (I Fifi, Al-Maqwa, Permata Kecilku Sayang) a duplicate row was deactivated
without clearing its `jkm_registration_no`, so the dead row kept poisoning collision detection
even while invisible on the site (matching intentionally scans `is_active=false` rows too, so
renewals can be detected).
→ **Rule:** Deactivating a duplicate that carries an external identifier is not one action, it's
two: `is_active=false` AND clear the identifier, in the same migration, every time. Not a
judgment call per instance.

**M48. Before inserting into a categorical column, check its own existing distinct values.**
Nine schools inserted during the JKM sync got `state='WP KUALA LUMPUR'` because that was the
literal text in JKM's address field, while the existing 751 rows for the same real place all use
`state='KUALA LUMPUR'`. Source-text formatting leaked into a normalized column.
→ **Rule:** Before a batch of INSERTs into a categorical field (state, category, agency), run
`SELECT DISTINCT` on that column first and match its existing convention — never carry a source
document's formatting directly into a field meant to be normalized.

**M49. Testing JS logic in isolation doesn't catch HTML/DOM structural bugs.** `parseMoePaste()`
and `runMoeSync()` were extracted and run against real data via Node.js and passed cleanly --
129/129 parsed, correct matching, correct buckets. Declared the MOE importer "ready to use, no
bugs found." It wasn't: `<div id="rsHelpJkm">` was missing its closing tag, silently nesting
`rsHelpMoe`, the textarea, and the Analisa/Kosongkan buttons as its children. Switching to MOE
mode set `rsHelpJkm` to `display:none` to hide the JKM instructions -- and hid its own accidental
children with it, including the input box needed to use the tool at all. First real use surfaced
it immediately; no amount of testing the JS functions in isolation could have.
→ **Rule:** Extracting and unit-testing a function's logic verifies the logic, not the page it
lives on. Before declaring a UI-facing tool "ready," either render/parse-check the actual HTML
structure it depends on, or have the person exercise the real control at least once. Structural
HTML bugs (unclosed tags, accidental nesting) are invisible to logic tests and only surface in
the real DOM.

**M50. A boolean column's real default can silently defeat an IS NULL filter, database-wide.**
crawler.py's "skip already-crawled" logic checked `has_website IS NULL` to mean "never touched."
The column actually defaults to `false`, not `NULL` -- so this filter matched zero rows across
the ENTIRE schools table, not just one batch, for an unknown length of time before a 40-school
run returned suspiciously empty and got investigated. The same false assumption existed in three
separate places in the same file (`--retry-rejected` had the identical bug in the opposite
direction: it always matched, since `has_website` is never actually null).

**M51. Rejecting a match doesn't stop it from coming back if the flag that gates re-processing
gets reset.** Rejecting a bad Google Places match in admin.html's Match Review nulls the
school's crawl fields including `last_crawled_at`, which makes the school eligible for
re-crawling. Google Places is deterministic — same query, same API key, same result — so the
very next crawl of that state/category silently re-found and re-applied the identical rejected
match. All 105 rejected matches on file had been re-applied this way by the time it was caught.
→ **Rule:** Any table whose "reject"/"undo" action resets a re-processing-eligibility flag
(here: `last_crawled_at`) must be cross-checked by the process that flag gates, or the rejection
has no lasting effect. `crawl_school()` now checks `match_review_queue` for a `status='rejected'`
row on the exact `(school_id, google_place_id)` pair before writing, and skips only that pair —
not the whole school, since a genuinely different place_id should still be eligible.

**M52. Assuming every page's `t()`/translation wiring uses the same key-naming rule.** Building
the hamburger+drawer nav (see §2.6 item 6) across 7 pages, most pages use `key === element id`
(e.g. `t('drawerFilter')` requires a `drawerFilter:` key) via a shared `setText`/array-loop
pattern — but this isn't universal, and blindly copying `drawer_filter:` (underscore style, the
first convention tried) into a `key === id` page silently produces a key that falls through to
the fallback and renders the literal string "drawerFilter" on screen instead of throwing.
→ **Rule:** Before adding translation keys to any page, grep that specific file's own
`applyTranslations`/`applyStaticTranslations` function first — check whether it does individual
`setText(id, t('someKey'))` calls with `someKey` chosen freely, or `setText(id, t(id))`
loops/calls where the key MUST equal the id verbatim. Don't assume the convention from the last
file you edited carries over; audit_i18n.py catches the *unwired* case (missing setText line)
but not this key-mismatch case, since `t(id)` and `t('drawer_filter')` are both syntactically
valid calls — only a human (or a diff against expected rendered output) catches the wrong string
silently rendering. Also worth noting while we're here: index.html's `.nav-links{display:none}`
at ≤600px had **zero replacement** until this same pass — every phone visitor lost access to
"Cara Guna", "Untuk Sekolah", "Jawatan Kosong", "Cari Ikut Negeri" with no way back except the
browser back button. Caught only by actually reading the CSS breakpoints, not by any functional
test. Any future audit of nav/menu changes should check what a hidden/removed element's mobile
replacement actually is, not just that the desktop version still renders.

---

## 4. Quality bar per deliverable — checkable criteria

A deliverable is DONE only when every applicable box below checks. "Looks right" is not a
criterion; each item is verifiable by reading the diff or opening the page.

### 4.1 New page

- [ ] Single self-contained file; no new shared/external CSS or JS files introduced.
- [ ] `<html lang="ms">`, charset, viewport, favicon links, Google Fonts link, supabase CDN
      script present; title and meta description written in Malay.
- [ ] Full `:root` token block copied; nav markup matches existing pages byte-for-byte except
      the context/back button.
- [ ] Hero uses the gradient + ellipse cutout pattern (or a documented deliberate variant).
- [ ] Complete `TRANSLATIONS` object: every `t()` key exists in **both** `ms` and `en`; zero
      user-visible literals outside the maps; every static text element has an `id` and an
      apply line; correct toggle pattern for the page type (form ⇒ in-place).
- [ ] All `schools` reads filter `is_active` **and** `is_demo` — counted by
      `grep -n "\.from('schools')"` on the file, not from memory (M34); location fields use
      `district||town`; JKM/Intl color-coding applied; school links use the slug-fallback
      expression; school names render via `dispName(s)` = `commercial_name || name`, with
      `commercial_name` present in every `select()` feeding a renderer (M33).
- [ ] All async loads: try/catch → `t('loadError')` in-container + `console.error`; loading
      state shown before data arrives; empty state designed (icon + message), not a blank div.
- [ ] `esc()` helper present and applied to every DB/user string rendered via innerHTML.
- [ ] Indexable page: dynamic title/canonical/OG + JSON-LD set. Utility page: `noindex` meta.
- [ ] Renders correctly at 360px width (no horizontal scroll except designed scroll areas).

### 4.2 Edit to an existing page

- [ ] Diff is minimal: untouched sections byte-identical; no reformatting, no reordering, no
      drive-by "cleanup".
- [ ] New strings added to both language maps + apply function/renderer; language toggled once
      mentally (or actually) to confirm nothing new is monolingual.
- [ ] Any new render path escapes user-originated fields; any touched render path gains `esc()`
      on the fields touched.
- [ ] Non-obvious decisions carry a WHY comment in the established style.
- [ ] If the edit changes a query: `is_active` still filtered, counts still exact-count-based,
      caps still per-category where relevant.

### 4.3 Query / data-layer change

- [ ] Column list explicitly includes everything the renderer touches (especially
      `town, category, jkm_registration_no, slug` for school displays).
- [ ] User input sanitized before `.or()`/`ilike` interpolation.
- [ ] No total derived from an uncapped `.select()`'s `data.length`.
- [ ] Writes: staging-table + pending status for public, claim-code or admin path for live rows;
      `updated_at`/timestamps as ISO strings.
- [ ] Side-effect calls individually try/caught.

### 4.4 Copy / SEO / translation work

- [ ] Malay written first, natural register (the site says "ibu bapa", "si kecil", "tuntut
      profil" — match it); English is a faithful translation, not a rewrite.
- [ ] Factual claims (counts, fees, agency names KPM/JKM, "2-5 hari bekerja") consistent with
      what other pages state; the "Bukan afiliasi rasmi KPM" disclaimer never weakened.
- [ ] Titles ≤ ~60 chars pattern `{Topic} — {Qualifier} | CariSchool`; meta descriptions
      mention KPM/JKM registration and "percuma" where true.

### 4.5 Reporting the work (how Fadly wants it)

- [ ] Deliverables are **complete artifacts** — full files or full functions, never outlines,
      never "..." elisions, never "add the remaining translations similarly".
- [ ] Work executed autonomously, then a **summary report**: what changed per file, why, any
      assumptions made (explicitly listed), any risks or follow-ups. Short prose, no padding.
- [ ] Anything you were uncertain about appears in the summary even if you resolved it yourself.
- [ ] A cross-item pattern claimed across an audit or batch is labelled a **working note**
      until it survives at least five observations. Three data points is not a finding —
      four such claims were made in the 2026-07-27 AI audit and three needed retracting.
- [ ] A file is read to its end before any bug in it is reported. (`metaDesc` was called
      never-assigned; the assignment was 300 lines further down.)
- [ ] When an investigation is hunting for a dramatic result, the boring explanation is
      checked first and the negative result is reported as plainly as a positive one.

---

## 5. When uncertain — exact escalation rules

Default posture: **proceed autonomously, document the assumption in your summary.** Fadly
prefers finished work with logged assumptions over questions. Escalate (stop and ask before
acting) only when a trigger below fires.

**Proceed with a logged assumption when:**
- The ambiguity has one clearly dominant reading given the codebase's conventions
  (e.g., "add a filter" ⇒ styled like the existing `.fi` selects, bilingual, re-rendering).
- Both readings are cheap to reverse (< ~30 min rework) — pick the convention-consistent one.
- Data is missing but a safe fallback exists (unknown field ⇒ render the `t('noInfo')` italic
  empty-value pattern, never invent values).

**STOP and ask when ANY of these is true:**
1. **Schema changes** — the task seems to require a new table/column/RLS policy or a Supabase
   storage bucket. You cannot see the real schema or policies; never guess them into existence.
   State exactly what you'd add and why, then wait.
2. **Destructive or irreversible data operations** — bulk updates/deletes on `schools` or
   submissions, storage mass-deletion, changing `claim_code` semantics.
3. **Auth-flow changes** — anything altering claim-code verification, session restore, the
   `/api/manage-job-posting` contract, or admin access. A wrong guess here locks schools out
   or opens the door.
4. **Money, plans, or legal-ish copy** — premium pricing/feature boundaries, the KPM/JKM
   affiliation disclaimer, "percuma" claims, review-turnaround promises (2-5 days). These are
   business commitments, not UI strings.
5. **SEO-structural changes** — changing slugs, canonical URL patterns, or deleting/renaming an
   indexable page. Ranked URLs are an asset; breaking them is expensive.
6. **The task contradicts this manual** — if the request seems to require violating a rule here
   (e.g., "extract the shared CSS"), don't silently comply and don't silently refuse: state the
   conflict in one paragraph and ask which wins.
7. **You'd need to invent a fact** — an API endpoint's request shape you haven't seen, an RLS
   behavior, a table column not referenced anywhere in the repo. Inventing interfaces is how
   silent breakage ships.

**Format for escalation:** one message — (a) the single specific question, (b) your
recommended answer with one-line rationale, (c) what you'll do in the meantime (usually:
complete everything not blocked by the question). Never ask more than one question per
blocker; never restate the whole task.

**Format for assumptions in summaries:**
`ASSUMED: <thing> because <one line>. Reversal cost: <low/med>.`

---

## 6. Skills

Reusable skills live in `skills/`. Consult them before starting the matching task type:

- `skills/carischool-page-builder/` — building or restyling any page/section/component.
- `skills/carischool-i18n/` — adding strings, translating a page, auditing translation coverage.
- `skills/carischool-data-layer/` — any Supabase query, write flow, storage upload, or auth-gated
  feature.
- `skills/extract-approach/` — mandatory post-solution step (the learning law); run immediately
  after solving any non-trivial problem, before reporting done.
- `skills/carischool-gsc-analysis/` — whenever a Google Search Console export is uploaded, or
  Fadly asks how search is performing, what to tell schools in outreach, or for SEO priorities.

**`carischool-manual/SKILL.md` is a generated mirror of this file: 4 lines of YAML frontmatter
followed by a byte-identical copy.** Never hand-patch it — hand-patching is what let it fall
18 mistake-entries behind (M19 while this file was at M37) and what stranded two page-inventory
rows in the copy that never existed here. Regenerate and verify:

```
{ printf -- '---\nname: carischool-manual\ndescription: <one line>\n---\n\n'; cat CLAUDE.md; } > skills/carischool-manual/SKILL.md
diff <(tail -n +6 skills/carischool-manual/SKILL.md) CLAUDE.md   # must be empty
```

**Regeneration is a merge, not an overwrite.** Diff both directions first: a stale mirror can
be AHEAD of its source on some sections while behind on others, and a one-way regeneration
silently deletes whatever only the copy had.

**Skills drift from the docs they mirror, and the drift is silent.** Before starting, check
`grep -o "^\*\*M[0-9]*\." CLAUDE.md` against every `M[0-9]+` reference in
`learnings-log.md` and in the skills. On 2026-08-05 the bundled `carischool-manual` copy
stopped at M19 while this file was at M32 and `carischool-gsc-analysis` cited M22 and M32 by
number; `extract-approach`'s trigger list still says "M1–M17". A learnings note's ROUTED TO
line is **not discharged until the destination file has actually been edited** — if that file
isn't in the session, ship the paste-ready block and list the routing in the handover's open
items. A `get_kawasan_label_counts` routing sat undischarged for 9 days exactly this way.
