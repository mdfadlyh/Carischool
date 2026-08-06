NOTE 1 — routes to: CLAUDE.md §3 (M26)

### 2026-07-25 — A coverage statistic written into a comment becomes a lie that blocks features
PROBLEM: school.html and carischool-data-layer SKILL.md both asserted "fewer than 3% of schools have lat/lng". Live coverage was 59.6%. The stale figure was load-bearing: it was the stated reason loadSimilarSchools avoided distance, and it framed berdekatan.html's coordinate-only query as the best available.
WORKED: Checked column fill rates against the live DB before accepting any documented constraint -- one jsonb_each fill-rate query over the whole table surfaced this and six other stale assumptions in a single pass.
FAILED: Reading the skill and the code comment as current fact. Both were accurate when written; neither carried a date or a re-check trigger, so nothing signalled they had expired.
RULE: Never write a data-coverage percentage into a comment or skill without the date it was measured; before relying on any documented coverage figure, re-measure it against the live table -- a percentage in prose is a snapshot, not a fact.
ROUTED TO: CLAUDE.md §3 (M26); stale comment corrected in school.html; skill's geo line updated.


NOTE 2 — routes to: carischool-data-layer SKILL.md (canonical query patterns)

### 2026-07-25 — DESC ordering puts NULLs FIRST, filling page 1 with blanks
PROBLEM: Adding a "highest rated" sort to index.html would have shown the ~62% of schools with no google_rating at the top, because Postgres orders NULLs first on DESC and index.html passed only `{ ascending }` to `.order()`.
WORKED: `.order(field, { ascending, nullsFirst: false })` on every sort, applied to all options rather than only the new sparse ones, so the parameter can't be forgotten when the next option is added.
FAILED: Nothing shipped -- caught while writing the sort. The near-miss was assuming PostgREST inherits a "nulls last" default from the client; it inherits Postgres's, which is the opposite for DESC.
RULE: Any `.order()` on a column that is not 100% populated must pass `nullsFirst: false` explicitly; check the column's fill rate before adding a sort option, and treat anything under 100% as sparse.
ROUTED TO: carischool-data-layer SKILL.md (canonical query patterns).


NOTE 3 — routes to: CLAUDE.md §3 (M27)

### 2026-07-25 — An empty-state guarded on "did we render anything" can never fire
PROBLEM: school.html's no-contact-info fallback was gated on `if(!rows.length)`. `address` is populated on 100% of rows and always pushes a row, so the fallback was unreachable -- while 3,850 schools (23.5% of all profile views) genuinely had no phone, WhatsApp, email or website and showed the parent nothing to act on.
WORKED: Gating the empty state on the condition the user actually cares about -- `!(phone || whatsapp || email || website)` -- not on whether the renderer produced output.
FAILED: Trusting that an existing empty-state branch implied the empty state was handled. It read as covered in review and was dead in production.
RULE: Gate an empty state on the specific capability the user needs, never on a container's length; if any field in that container is near-100% populated, a length check is dead code by construction.
ROUTED TO: CLAUDE.md §3 (M27).


NOTE 4 — routes to: carischool-data-layer SKILL.md (schema reference + pitfall checklist)

### 2026-07-25 — Check RLS and grants BEFORE making a table load-bearing
PROBLEM: postcode_reference (911 postcode centroids) was about to become the backbone of nearby search. It had RLS disabled and anon holding INSERT/UPDATE/DELETE/TRUNCATE -- the anon key ships in every page, so any visitor could have truncated it.
WORKED: Auditing rls_enabled + anon write grants across every public table before depending on one. Fixed with the existing public_read_schools shape (RLS on, SELECT policy, writes revoked), then verified as the anon role with `set local role anon` -- reads still return all 911 rows.
FAILED: Assuming "the read works" meant the table was safe to depend on. Read access and write exposure are independent; the read had always worked.
RULE: Before a page depends on a table it has never read, check both directions -- that anon CAN select (RLS SELECT policy exists) and that anon CANNOT write (RLS on, write grants revoked); a table with RLS disabled is exposed, not permissive.
ROUTED TO: carischool-data-layer SKILL.md (schema reference gains postcode_reference/postcode_lookup; pitfall checklist gains the two-direction check). OPEN: school_fee_clicks has the identical exposure, left untouched pending confirmation that admin.html does not read it directly.


NOTE 5 — routes to: carischool-data-layer SKILL.md (schema reference)

### 2026-07-25 — Audit the database's contents, not just what the code references
PROBLEM: The single highest-value fix of the session -- lifting nearby-search coverage from 59.6% to 99% -- required no new data, no API call and no schema change. postcode_reference already held the coordinates and no page had ever queried it. Five more tables (reviews, school_events, teacher_interest, correction_reports, digest_runs) and seven columns (jkm_category at 30.5% fill, jkm_valid_from, fee_est_*, fee_reports, is_verified, view_month, last_digest_*) are likewise referenced nowhere.
WORKED: Two inventory queries run before reading any page code -- per-column fill rates across schools, and row counts across every public table -- then grepping each column name across all pages to build a have-vs-show matrix.
FAILED: Starting from the code. Reading pages first shows what is used and is structurally blind to what exists and is idle.
RULE: Open any "make better use of our data" task with a fill-rate query and a per-table row count, and diff that inventory against a grep of column names in the pages -- the gap between what is stored and what is rendered is the actual backlog.
ROUTED TO: carischool-data-layer SKILL.md (schema reference: postcode_reference, postcode_lookup, and the unused-column list recorded so they are not rediscovered).


NOTE 6 — routes to: CLAUDE.md §3 (M28)

### 2026-07-25 — Google Places strings carry lookalike Unicode that defeats naive parsing
PROBLEM: operating_hours values contain U+202F (before AM/PM), U+2009 (around the dash) and U+2013 (en dash). They render as ordinary spaces and hyphens, so `like '%- 6%'` and `~ '- ([0-9]{1,2}):'` both returned nothing while the value visibly displayed "- 6:00". Three debugging rounds were lost to it.
WORKED: `encode(convert_to(value,'UTF8'),'hex')` on one row exposed the real bytes; normalising with translate() in SQL / str.replace() in Python before any matching. The same normalisation is now the first step in crawler.py's extract_hours().
FAILED: Trusting the rendered value in query output. Copy-pasting the visible characters into a pattern reproduces the ASCII lookalikes, not the source bytes, so every attempt failed identically with no clue why.
RULE: When a pattern fails against a string that visibly contains what you are matching, hex-dump the bytes before touching the pattern; normalise U+202F/U+2009/U+2013/U+00A0 to ASCII before any regex, LIKE, or split against Google-sourced text.
ROUTED TO: CLAUDE.md §3 (M28); normalisation implemented in crawler.py:normalise_hours_text(), regression-tested against the live byte sequence via `--test-hours`.


NOTE 7 — routes to: learnings-log.md (one-off, but the reasoning transfers)

### 2026-07-25 — Fix the writer, not the data, when the derived columns are already right
PROBLEM: The crawler stored only Monday+Tuesday of Google's seven-day weekday_text. The instinct on finding truncated data is to re-crawl and repair the rows.
WORKED: Checking what the missing days would actually change first. opens_at/closes_at derive from weekday hours, Monday matched Tuesday on 4,266 of 4,353 rows (98%), and every filter and badge built this session reads the derived columns -- which are already correct. Only the human-readable display string is incomplete, so the fix is forward-only in the writer and no re-crawl is warranted.
FAILED: Considered and rejected a targeted re-crawl of the 4,353 affected rows -- real Places API spend to improve a display string, while the crawler was still paused for unrelated reasons.
RULE: Before repairing truncated data, identify which downstream consumers actually read the missing part; if the derived columns that features depend on are already correct, fix the write path and let the display gap close naturally on the next crawl.
ROUTED TO: learnings-log.md; crawler.py:extract_hours() implements the corrected write path (the `weekday_text[:2]` truncation at the old line 887).
