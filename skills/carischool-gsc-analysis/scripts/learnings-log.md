# CariSchool Learnings Log

Chronological record of learnings notes per the learning law (see
skills/extract-approach/SKILL.md). Every note here has also been routed to its durable home —
this file is the audit trail, not the reference. Newest first.

---

### 2026-07-15 — First real search data changes the strategic picture
PROBLEM: Strategy advice had been running on inference; a GSC export made ground truth available for the first time.
WORKED: Analyzed the export BEFORE writing any recommendation. Three findings inverted assumptions: school profiles are 91% of clicks (the long tail IS the business); the sekolah agama cohort is 14% of impressions at ~0% CTR (rankings that look like wins are intent-mismatch bugs); jobs/fee search demand is near-zero today (those assets are conversion tools, not traffic magnets). Made the analysis repeatable as a skill+script, validated against the real export, and caught the script feeding intent-mismatch queries into the outreach list before shipping.
FAILED: First script draft counted 'sekolah agama' queries as outreach ammunition and made one loose slug join ("bandar pontian" → bandar-kulai) — excluded the cohort and required a 24-char prefix match.
RULE: No strategic recommendation ships while unanalyzed first-party data sits in the uploads folder; and any generated outreach list must exclude the intent-mismatch cohort and be identity-verified against Supabase before a single message is sent.
ROUTED TO: skills/carischool-gsc-analysis/ (the repeatable version); CLAUDE.md M22 + M23 (renumbered from the other session's M19/M20 to avoid colliding with existing M19/M20 — see the 2026-07-15 cross-session-merge entry below); roadmap-addendum-2 (the findings themselves).

---

### 2026-07-15 — A second session's CLAUDE.md/learnings-log update collided with existing content
PROBLEM: A batch of files from another session (CLAUDE.md, learnings-log.md, a new GSC-analysis
skill+script, a roadmap addendum) was handed over for review. The new CLAUDE.md was missing M21
entirely, and its "M19"/"M20" entries were BRAND NEW rules that collided with and would have
silently overwritten the real, already-existing M19 (fetch() failures swallowed) and M20
(Postgres count-zero ambiguity). The accompanying learnings-log.md was also missing every entry
from 07-13 and 07-14. This is the exact failure mode already documented in the 2026-07-12 entry
below — a newer timestamp is not evidence of being a superset — recurring a second time.
WORKED: Verified by content (grepped for the actual M19/M20/M21 rule text on disk, not just
numbers) before touching anything. Confirmed the other session had worked from a stale snapshot
predating both the original M19/M20 restoration AND all of this session's 07-13/07-14 work.
Merged rather than replaced: kept real M19/M20/M21 untouched, renumbered the two new genuinely-
good rules to M22/M23, completed the skills list (also missing extract-approach and the new
gsc-analysis skill), and prepended (not replaced) the new learnings-log entry onto the complete
existing log.
FAILED: n/a — blind adoption was the failure avoided.
RULE: Any handoff of CLAUDE.md/learnings-log.md/skills from another session or model gets the
same by-content verification as any other "newer revision" — diff the actual rule text and
skills list against what's on disk, never trust that a new batch is a strict superset, and merge
by appending/renumbering rather than overwriting when in doubt.
ROUTED TO: this log; CLAUDE.md (merge applied in place).

---

### 2026-07-14 — audit_i18n.py misparsed English contractions as string delimiters
PROBLEM: Building the first long-form English guide content, the audit script reported
several TRANSLATIONS.en keys as "missing" when they were actually present. Root cause:
extract_keys() stripped single-quoted JS strings BEFORE backtick template literals.
English prose inside backticks is full of contraction apostrophes (don't, you're,
school's) — the single-quote regex treated these as real string delimiters and
consumed everything up to the next unrelated apostrophe/quote, silently swallowing
subsequent keys (s2Title, s3Content, etc.) from the parsed output.
WORKED: Reordered extract_keys() to strip backtick blocks FIRST, before single- or
double-quote stripping — verified against a synthetic contraction-heavy snippet
(confirmed the script still correctly flags genuine missing keys, it just no longer
misfires on apostrophes) and against the real page (clean pass after the reorder).
FAILED: Initially worked around it per-page by replacing contraction apostrophes with
`&rsquo;` inside content strings — a reasonable typographic choice on its own, but
doesn't fix the tool for the next person who writes contractions naturally.
RULE: Static analysis tools on this codebase must strip nested-safe delimiters
(backtick blocks) before less-safe ones (single/double quotes) whenever content can
contain the less-safe character legitimately as data (e.g. English apostrophes)
rather than as a delimiter.
ROUTED TO: skills/carischool-i18n/scripts/audit_i18n.py (fixed in place, order swapped).

---

### 2026-07-13 — --force silently discarded resume progress in crawler.py
PROBLEM: A --force flag intended only to relax a query filter (skip has_website IS NULL, so
previously-rejected schools become eligible again) was ALSO zeroing the already_done skip-set
that comes from progress_*.json's crawled_ids — so every --force run reprocessed the exact
same first page of rows instead of advancing, burning Google Places API calls with no new
coverage. Caught before real damage: the live run was paused after a screenshot showed
"Resuming — 2921 previously crawled" immediately followed by re-attempting a school already
marked has_website:false with no new match.
WORKED: Split the two concerns — `already_done` now always comes from progress_*.json's
crawled_ids regardless of --force; --force only widens the QUERY FILTER (which rows are
eligible at all). To genuinely restart a force campaign from zero, delete/rename the
progress_*.json file instead.
FAILED: nothing — this was a design flaw in the original script, not a rejected alternative.
RULE: Any "reprocess more broadly" flag must never also erase "don't reprocess what THIS run
already did" tracking — a filter-widening flag and a resume/dedupe mechanism are independent
and must be independently controllable.
ROUTED TO: CLAUDE.md §3 as M21; crawler.py fixed in place (already_done always = crawled_ids).

---

### 2026-07-13 — The 1000-row PostgREST cap recurred in the Python crawler, not just JS
PROBLEM: The 1000-row Supabase/PostgREST cap (already documented and paginated-around in
list_states() and generate_slugs_all() within the same crawler.py) still hit the MAIN batch
fetch: a single `.limit(batch_size).execute()` call with batch_size=4000 silently returned
only 1000 rows, with no error — script printed "1000 schools this batch" despite `--limit
4000` being requested.
WORKED: Paged in 1000-row chunks via `.range()`, accumulating rows (skipping already_done)
until batch_size new rows are collected or the table is exhausted — same pattern already
proven elsewhere in this exact file.
FAILED: nothing — the fix pattern already existed in the same codebase; it just hadn't been
applied to every query in the file that could exceed 1000 rows.
RULE: The 1000-row PostgREST cap applies to EVERY Supabase query call, in Python or JS alike,
regardless of a larger .limit()/batch_size value passed — when adding or auditing a query,
check every call site in the file, not just the ones already known to be paginated.
ROUTED TO: carischool-data-layer SKILL.md (added Python-crawler cross-reference to the
existing "Full-table scan past the 1000-row cap" pattern); crawler.py fixed in place.

---

### 2026-07-12 — Two verified rules were missing from a newer CLAUDE.md revision
PROBLEM: A CLAUDE.md brought in for review (alongside a well-constructed defensive prompt
from a separate session) was missing M19/M20-equivalent entries for two real, previously-
verified bugs (silent `fetch()` failures on 3 separate call sites; RLS SELECT policy gaps
returning 0 instead of erroring) — present in an earlier revision of this file, absent here.
WORKED: Diffed by content (grepped for the actual rule text, not just M-numbers, since
numbering had already shifted) before assuming the gap was real, rather than trusting that
"the file looks complete" meant nothing was missing.
FAILED: Nothing — but note the near-miss avoided: silently accepting the newer file as more
current/authoritative just because it was more recently produced ("stronger model") would
have permanently dropped two hard-won, real rules with no visible sign anything was wrong.
RULE: When handed a newer revision of a durable doc from another source or session, verify
by content that nothing present in an older known-good version was silently dropped — a more
recent timestamp or a more polished single new entry is not evidence the whole file is a
superset of what came before.
ROUTED TO: CLAUDE.md §3 (restored as M19 and M20, after M18 "The Imported Prompt" which was
itself confirmed intact and correctly cross-referencing prompt-index-conversion-pass.md).

---

### 2026-07-12 — Generic "elite redesign" prompts vs. an established system
PROBLEM: An externally-sourced prompt commanded a full Tailwind redesign of index.html — well-written, but it directly ordered named mistakes M1 and M14, plus SEO and JS-regression risk on the highest-traffic page.
WORKED: Analyzed before executing; separated the prompt's legitimate intent (dual-audience hero, scannable metrics, trust signals) from its destructive directives, and rewrote it as a scoped, additive, house-style conversion pass with hard constraints and escalation triggers.
FAILED: n/a — executing as-written was the failure avoided. Note the tell: "avoid custom vanilla CSS" + "completeness guarantee" on a 142KB file are both physically incompatible with this codebase.
RULE: Never execute a redesign prompt against a page that 11 sibling pages share an identity with; extract the conversion INTENT, then re-issue it as an additive brief bound to CLAUDE.md — and any prompt promising full-file output beyond ~50KB is promising elisions.
ROUTED TO: prompt-index-conversion-pass.md (the reusable artifact); pattern reinforces CLAUDE.md M1/M14.

---

### 2026-07-10 — Documenting a codebase for a weaker model (CLAUDE.md + skills)
PROBLEM: Turning an undocumented solo codebase into an operating manual a less capable model can execute against without drifting.
WORKED: Read every page first, then wrote rules in three escalating forms — convention (what to do), named mistake with preventing rule (what a weaker model WILL do wrong), and checkable done-criteria (how to verify). Named mistakes (M1–M17) outperform prose conventions because they're searchable and falsifiable. Escalation rules framed as "proceed with logged assumption by default; 7 hard stop-triggers" match how the founder actually wants to work.
FAILED: Nothing structural — but the first audit-script draft shipped with 3 false-positive classes; caught only because it was tested against all real pages before delivery (see next note).
RULE: Documentation for models must be written as named failure modes + checkable criteria, never adjectives; and any bundled tooling must be validated against the real corpus before it ships.
ROUTED TO: CLAUDE.md itself (the artifact IS the routing); testing rule added to extract-approach worked example.

---

### 2026-07-10 — Naive parsing of house-style JS object literals
PROBLEM: A static analyzer of TRANSLATIONS maps missed keys, producing false "missing key" reports.
WORKED: Brace-matching with in-string tracking for block extraction; key regex anchored to `(?:^|[,{])\s*` so keys sharing a line after a comma are caught; skip template-literal HTML (`${`), void `<input>` trailing text, and JS-managed elements (`getElementById` present); tested against all 11 real pages before shipping.
FAILED: `^\s*key:` line-anchored regex — the house style packs multiple keys per line, so end-of-map keys silently vanished. `t\(` without a lookbehind matched `.select('...')` and `params.get('...')`. Static-element check flagged JS-rendered template HTML.
RULE: Any tool that parses this codebase must be run against every real page and its false positives fixed BEFORE it ships; the house style breaks textbook regexes in at least three known ways (multi-key lines, template-literal HTML, void elements).
ROUTED TO: skills/carischool-i18n/scripts/audit_i18n.py (fixed in place); extract-approach SKILL.md worked example.

---

### 2026-07-10 — Auditing where a solo founder's time goes without a time log
PROBLEM: Strategy audit requested, but traffic, revenue, and calendar are unobservable from the outside.
WORKED: Read the admin tooling as the time log — every hand-curation tool in admin.html is proof of a recurring manual workflow; every "we'll contact you" string is proof of a manual sales step. Marked every unobservable input `ASSUMED:` with its reversal cost, and stated which ranking changes flip if an assumption is wrong.
FAILED: Nothing — but note the temptation resisted: inventing market prices as facts. Launch price was framed as a hypothesis with a 20-transaction learning loop instead.
RULE: When auditing a system you can't fully observe, treat built tooling as revealed behavior, mark every inference ASSUMED with reversal cost, and never present a hypothesis (price, conversion rate) as a finding.
ROUTED TO: carischool-roadmap.md §0 (assumptions block) and Move 1 (price-as-hypothesis framing).

---

### 2026-07-10 — Real audit finding worth acting on: kemaskini.html is not i18n'd
PROBLEM: The audit script's only unresolvable finding across 11 pages: kemaskini.html has no TRANSLATIONS machinery at all — the school-facing self-service editor is Malay-only.
WORKED: Verified it's genuine (no ms/en maps present), not a script failure. Logged rather than silently "fixed" — translating a 45KB form page is a deliberate task, not a drive-by.
FAILED: n/a — discovery note.
RULE: Audit-tool findings that survive false-positive review become backlog items with an owner decision, never silent fixes bundled into unrelated work.
ROUTED TO: this log (backlog: decide whether school owners need EN on kemaskini — likely yes for international-school operators; pairs with any Move 1 premium work since the locked panel lives there).
