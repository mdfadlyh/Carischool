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
- [ ] All `schools` reads filter `is_active`; location fields use `district||town`; JKM/Intl
      color-coding applied; school links use the slug-fallback expression.
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
