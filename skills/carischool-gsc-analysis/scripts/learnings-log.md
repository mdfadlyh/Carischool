# CariSchool Learnings Log

Chronological record of learnings notes per the learning law (see
skills/extract-approach/SKILL.md). Every note here has also been routed to its durable home —
this file is the audit trail, not the reference. Newest first.

### 2026-07-27 — Client-rendered pages are invisible to non-JS AI crawlers
PROBLEM: school.html and kawasan.html ranked fine on Google but returned nothing usable to AI crawlers. Googlebot renders JS; OAI-SearchBot, PerplexityBot and ClaudeBot largely do not.
WORKED: A Vercel serverless route (`/api/prerender`) server-rendering real HTML — populated title, canonical, JSON-LD, body — routed by user-agent via `has` conditions in vercel.json. No build step, no framework, page files untouched. Verified end-to-end by fetching the live URL with a bot UA.
FAILED: Assuming Google ranking implied general crawlability. Raw HTML for school.html was 2,039 chars of shell with `{}` for JSON-LD — and worse than empty: every conditional block rendered at once, so an AI read "Sekolah tidak dijumpai" and "Profil ini mungkin tidak lagi aktif" on the same page.
RULE: Before claiming any page is visible to AI, fetch it without JavaScript and read what comes back; a Search Console position is not evidence of AI crawlability.
ROUTED TO: CLAUDE.md §3 (M30).

---

### 2026-07-27 — Crawler UAs and user-triggered UAs are different agents
PROBLEM: The bot-routing rewrite silently failed its first live test. The UA list had `ClaudeBot` and the retired `Claude-Web` but not `Claude-User`.
WORKED: Treating each AI vendor as having three agent families — training crawler (`GPTBot`, `CCBot`), indexing crawler (`OAI-SearchBot`, `PerplexityBot`, `ClaudeBot`), user-triggered fetcher (`ChatGPT-User`, `Perplexity-User`, `Claude-User`) — and enumerating all three before writing any rule.
FAILED: Nothing structural; the fix was one line. But the same confusion had already produced a real robots.txt outcome: blocking `GPTBot` was believed to block ChatGPT, when ChatGPT's search citations come from `OAI-SearchBot`, which was never listed and fell through to `User-agent: *`.
RULE: When adding or blocking an AI vendor's bot, enumerate all three families for that vendor and state explicitly which is being targeted; never treat one name as standing for the vendor.
ROUTED TO: CLAUDE.md §3 (M31); cross-referenced from the robots.txt comment block.

---

### 2026-07-27 — Sitemaps that GROUP BY can't see colloquial URL labels
PROBLEM: 11 of 23 internally-linked kawasan URLs were absent from the sitemap, including `?bandar=Bangi` (405 impressions, pos 8.2) — while `?bandar=Bandar Baru Bangi`, the version GROUP BY produces, ranked nowhere.
WORKED: A second RPC (`get_kawasan_label_counts`) counting the way the PAGE queries — `town ILIKE %X% OR neighbourhood ILIKE %X%` — over an explicit label list mirroring index.html's footer. Union with the town list, dedupe case-insensitively. Dead labels drop out automatically; that is what caught `?bandar=George Town` returning zero schools, because no Penang row uses that name.
FAILED: Trying to derive the labels from data. `GROUP BY town` can only emit strings that literally exist in the column — "Bangi" appears in 2 rows, so no threshold reaches it. Adding neighbourhood counting doesn't help: only 724 of 10,923 rows have one, across 101 values, none near 50.
RULE: Whenever a page resolves a URL parameter fuzzily, any sitemap or link generator for that page must verify candidates through the same fuzzy match — an exact-match aggregate silently omits every label the site actually links to.
ROUTED TO: CLAUDE.md §3 (M32) and M23 cross-reference. STILL PENDING: carischool-data-layer SKILL.md needs the label-count RPC added to canonical patterns (file not available this session).

---

### 2026-07-27 — Pattern claims from three data points kept needing retraction
PROBLEM: Across a 13-query AI-visibility audit I stated four cross-query patterns as findings and had to retract three, plus reported a `metaDesc` bug that didn't exist — the assignment was 300 lines below where I stopped reading.
WORKED: Verifying against the database before asserting. The Al Kauthar brand-vs-premises finding held up precisely because it was checked first — 17 rows, all validly registered — which turned a would-be scandal claim into an accurate structural one.
FAILED: Three hypotheses hunting for a dramatic result — "AI recommends expired schools", "AI spreads false registration claims", "AI recommends unregistered centres". All three were checked; all three were false. The surfaces were consistently accurate about registration and simply cannot verify it.
RULE: Label any cross-query pattern a working note until it survives five observations; read a file to its end before reporting a bug in it; when an investigation is hunting for a dramatic finding, check the boring explanation first.
ROUTED TO: CLAUDE.md §4.5 (reporting discipline).

---

### 2026-07-26 — A crawled coordinate error rarely travels alone
PROBLEM: A location-plausibility check flagged 14 schools sitewide as coordinate outliers; the instinct was to treat this as a map/geometry bug.
WORKED: Manual verification (Fadly, JKM/MOE registry lookup + Google search by real name) against all 14 confirmed every one was a wrong `google_place_id` match — rating, reviews, phone, and photo all inherited from the same bad lookup as the coordinate, not independent facts.
FAILED: Assuming a fixed coordinate implied the rating was now trustworthy (TASKA ANGGUN TERATAI) — it didn't; the rating belonged to an unrelated homestay and needed its own separate confirmation and fix.
RULE: When a coordinate is confirmed wrong via crawler mismatch, check every other Google-sourced field independently against a primary registry before trusting any of them — don't assume location and rating share a verdict.
ROUTED TO: CLAUDE.md §3 (M29); carischool-data-layer SKILL.md (canonical query pattern + fix recipe).

---

### 2026-07-25 — A coverage statistic written into a comment becomes a lie that blocks features
PROBLEM: school.html and carischool-data-layer SKILL.md both asserted "fewer than 3% of schools have lat/lng". Live coverage was 59.6%. The stale figure was load-bearing: it was the stated reason loadSimilarSchools avoided distance, and it framed berdekatan.html's coordinate-only query as the best available.
WORKED: Checked column fill rates against the live DB before accepting any documented constraint -- one jsonb_each fill-rate query over the whole table surfaced this and six other stale assumptions in a single pass.
FAILED: Reading the skill and the code comment as current fact. Both were accurate when written; neither carried a date or a re-check trigger, so nothing signalled they had expired.
RULE: Never write a data-coverage percentage into a comment or skill without the date it was measured; before relying on any documented coverage figure, re-measure it against the live table -- a percentage in prose is a snapshot, not a fact.
ROUTED TO: CLAUDE.md §3 (M26); stale comment corrected in school.html; skill's geo line updated.

---

### 2026-07-25 — DESC ordering puts NULLs FIRST, filling page 1 with blanks
PROBLEM: Adding a "highest rated" sort to index.html would have shown the ~62% of schools with no google_rating at the top, because Postgres orders NULLs first on DESC and index.html passed only `{ ascending }` to `.order()`.
WORKED: `.order(field, { ascending, nullsFirst: false })` on every sort, applied to all options rather than only the new sparse ones, so the parameter can't be forgotten when the next option is added.
FAILED: Nothing shipped -- caught while writing the sort. The near-miss was assuming PostgREST inherits a "nulls last" default from the client; it inherits Postgres's, which is the opposite for DESC.
RULE: Any `.order()` on a column that is not 100% populated must pass `nullsFirst: false` explicitly; check the column's fill rate before adding a sort option, and treat anything under 100% as sparse.
ROUTED TO: carischool-data-layer SKILL.md (canonical query patterns).

---

### 2026-07-25 — An empty-state guarded on "did we render anything" can never fire
PROBLEM: school.html's no-contact-info fallback was gated on `if(!rows.length)`. `address` is populated on 100% of rows and always pushes a row, so the fallback was unreachable -- while 3,850 schools (23.5% of all profile views) genuinely had no phone, WhatsApp, email or website and showed the parent nothing to act on.
WORKED: Gating the empty state on the condition the user actually cares about -- `!(phone || whatsapp || email || website)` -- not on whether the renderer produced output.
FAILED: Trusting that an existing empty-state branch implied the empty state was handled. It read as covered in review and was dead in production.
RULE: Gate an empty state on the specific capability the user needs, never on a container's length; if any field in that container is near-100% populated, a length check is dead code by construction.
ROUTED TO: CLAUDE.md §3 (M27).

---

### 2026-07-25 — Check RLS and grants BEFORE making a table load-bearing
PROBLEM: postcode_reference (911 postcode centroids) was about to become the backbone of nearby search. It had RLS disabled and anon holding INSERT/UPDATE/DELETE/TRUNCATE -- the anon key ships in every page, so any visitor could have truncated it.
WORKED: Auditing rls_enabled + anon write grants across every public table before depending on one. Fixed with the existing public_read_schools shape (RLS on, SELECT policy, writes revoked), then verified as the anon role with `set local role anon` -- reads still return all 911 rows.
FAILED: Assuming "the read works" meant the table was safe to depend on. Read access and write exposure are independent; the read had always worked.
RULE: Before a page depends on a table it has never read, check both directions -- that anon CAN select (RLS SELECT policy exists) and that anon CANNOT write (RLS on, write grants revoked); a table with RLS disabled is exposed, not permissive.
ROUTED TO: carischool-data-layer SKILL.md (schema reference gains postcode_reference/postcode_lookup; pitfall checklist gains the two-direction check). OPEN: school_fee_clicks has the identical exposure, left untouched pending confirmation that admin.html does not read it directly.

---

### 2026-07-25 — Audit the database's contents, not just what the code references
PROBLEM: The single highest-value fix of the session -- lifting nearby-search coverage from 59.6% to 99% -- required no new data, no API call and no schema change. postcode_reference already held the coordinates and no page had ever queried it. Five more tables (reviews, school_events, teacher_interest, correction_reports, digest_runs) and seven columns (jkm_category at 30.5% fill, jkm_valid_from, fee_est_*, fee_reports, is_verified, view_month, last_digest_*) are likewise referenced nowhere.
WORKED: Two inventory queries run before reading any page code -- per-column fill rates across schools, and row counts across every public table -- then grepping each column name across all pages to build a have-vs-show matrix.
FAILED: Starting from the code. Reading pages first shows what is used and is structurally blind to what exists and is idle.
RULE: Open any "make better use of our data" task with a fill-rate query and a per-table row count, and diff that inventory against a grep of column names in the pages -- the gap between what is stored and what is rendered is the actual backlog.
ROUTED TO: carischool-data-layer SKILL.md (schema reference: postcode_reference, postcode_lookup, and the unused-column list recorded so they are not rediscovered).

---

### 2026-07-25 — Google Places strings carry lookalike Unicode that defeats naive parsing
PROBLEM: operating_hours values contain U+202F (before AM/PM), U+2009 (around the dash) and U+2013 (en dash). They render as ordinary spaces and hyphens, so `like '%- 6%'` and `~ '- ([0-9]{1,2}):'` both returned nothing while the value visibly displayed "- 6:00". Three debugging rounds were lost to it.
WORKED: `encode(convert_to(value,'UTF8'),'hex')` on one row exposed the real bytes; normalising with translate() in SQL / str.replace() in Python before any matching. The same normalisation is now the first step in crawler.py's extract_hours().
FAILED: Trusting the rendered value in query output. Copy-pasting the visible characters into a pattern reproduces the ASCII lookalikes, not the source bytes, so every attempt failed identically with no clue why.
RULE: When a pattern fails against a string that visibly contains what you are matching, hex-dump the bytes before touching the pattern; normalise U+202F/U+2009/U+2013/U+00A0 to ASCII before any regex, LIKE, or split against Google-sourced text.
ROUTED TO: CLAUDE.md §3 (M28); normalisation implemented in crawler.py:normalise_hours_text(), regression-tested against the live byte sequence via `--test-hours`.

---

### 2026-07-25 — Fix the writer, not the data, when the derived columns are already right
PROBLEM: The crawler stored only Monday+Tuesday of Google's seven-day weekday_text. The instinct on finding truncated data is to re-crawl and repair the rows.
WORKED: Checking what the missing days would actually change first. opens_at/closes_at derive from weekday hours, Monday matched Tuesday on 4,266 of 4,353 rows (98%), and every filter and badge built this session reads the derived columns -- which are already correct. Only the human-readable display string is incomplete, so the fix is forward-only in the writer and no re-crawl is warranted.
FAILED: Considered and rejected a targeted re-crawl of the 4,353 affected rows -- real Places API spend to improve a display string, while the crawler was still paused for unrelated reasons.
RULE: Before repairing truncated data, identify which downstream consumers actually read the missing part; if the derived columns that features depend on are already correct, fix the write path and let the display gap close naturally on the next crawl.
ROUTED TO: learnings-log.md; crawler.py:extract_hours() implements the corrected write path (the `weekday_text[:2]` truncation at the old line 887).

---
### 2026-07-22 — Most "renewal candidates" weren't candidates at all -- the tool just hadn't said so
PROBLEM: Fadly described the registry sync process as tougher than coding, "almost 2 days" of debugging. Reviewing his latest batch by hand (28 renewal candidates) surfaced the actual remaining cost driver: 22 of 28 had a jkm_valid_to date already in the PAST relative to today -- meaning JKM's own directory shows their license already expired too. Per the standing registry-truth doctrine (directory presence != valid license; jkm_valid_to is the signal), these needed zero action, but the tool was presenting all 28 as an undifferentiated list requiring the same manual date-check effort every single chunk, across an ~90-chunk run.
WORKED: Computed the true action-required set by hand first (6 of 28 genuinely still valid) as a baseline, then implemented the identical date-comparison filter in admin.html (jkm_valid_to > today) splitting renewals into renewalsCurrent (rendered as a real review list, copyable) and renewalsExpired (collapsed to a single count line, no action needed). Verified the shipped filter logic in isolation against this exact batch's 28 real dates before considering it done -- reproduced 6/22 exactly, not an approximation. Also used the batch's own new evidence (FIREFLY's separate reg-no/validity-window from its CAWANGAN sibling) to resolve an earlier explicitly-held ambiguity with real confidence instead of asking a third time, and re-confirmed the blank-reg-no fix from the previous session is holding in live production (DAI GENIUS and KIDDOSPHERE both correctly deflected to Disyaki again, not silently matched).
FAILED: n/a -- the fatigue itself was the signal; the fix follows a principle already agreed (registry-truth doctrine), just not yet mechanized into the tool's own filtering.
RULE: When a person describes a process as more effortful than expected, don't just push through the current instance faster -- look for whether an EARLIER decision (a doctrine, a rule already agreed) has gone unmechanized, meaning the human is manually re-deriving it every time instead of the tool applying it automatically. A rule stated once in conversation is not the same as a rule enforced by the code; the gap between them compounds linearly with every future run.
ROUTED TO: admin.html (renewalsCurrent/renewalsExpired split, JKM sync); this log; DAI GENIUS's registration number remains genuinely unresolved (needs a manual JKM lookup by name/address whenever convenient, not urgent).

---

### 2026-07-22 — Making every Registry Sync result copyable, not just the SQL/CSV boxes
PROBLEM: Fadly asked for every result in Registry Sync to be easy to copy-paste. Only the SQL and CSV blocks were even selectable text (in readonly textareas requiring manual select-all on mobile, no copy button); the renewals and suspicious lists were plain HTML divs with no copy path at all.
WORKED: Added a shared, registry-keyed copy helper (window._rsCopy + copyRS()) reusing the proven clipboard-with-fallback + temporary-label pattern from the JKM bookmarklet v6 and kemaskini's share kit -- text is stored by key rather than embedded in inline onclick attributes, since SQL/CSV output routinely contains quotes and apostrophes (school names like "TASKA Anakku Imtiyaz,") that would break attribute-string escaping. Added a "📋 Salin" button to every section (SQL, CSV, renewals, suspicious, and the MOE equivalents) plus a single "📋 Salin SEMUA" button that assembles the whole analysis into one shareable plain-text block -- verified the assembly logic directly (not just syntax-checked) against realistic sample data before shipping, confirming well-formed, section-labeled output.
FAILED: n/a -- additive UI feature, no existing behavior touched.
RULE: Any generated output meant for a human to relay elsewhere (paste to Claude, paste to Supabase, paste into notes) needs an explicit one-tap copy affordance, not just "the text is technically selectable" -- selectable-but-fiddly is a real friction cost on mobile that compounds across every sync session. When multiple copyable sections exist together, also provide a single "copy all" that assembles them with labels, since real workflows (sending a full result to Claude in one message) span multiple sections at once.
ROUTED TO: admin.html (copyRS/copyRSFallback/rsCopyBtn helpers, wired into both JKM and MOE result rendering); this log.

---

### 2026-07-22 — A blank registration number is not "no data" -- it's a collision key
PROBLEM: Fadly re-ran Bahagian 1 and got a 2-row update SQL proposing to change BEA SPACE CITY and DAI GENIUS to EARLIER (regressed) dates than what was already correct in the DB -- for the exact same two IDs already correctly updated minutes earlier. Checking before running (per standing discipline) found DAI GENIUS's own jkm_registration_no in the DB is an empty string, not null.
WORKED: Traced the real bug: normalizeReg('') returns '', so any DB row with a blank registration number gets indexed at hashmap key '' -- and ANY parsed JKM record with an unreadable/blank "No. Pendaftaran" (a real, recurring pattern -- "LITTLE GENIUS HOME BASED" earlier had the identical blank-field shape) normalizes to that SAME empty key and silently "matches" it, proposing to overwrite one school's real dates with a completely unrelated blank-reg-no record's dates. Fixed on both sides: the hashmap-building loop now skips indexing any blank normalized key at all (so key '' is never populated, regardless of how many DB rows have blank reg-nos), and the match loop now checks the PARSED record's own regNoNorm first -- if it's blank, the record is routed straight to the suspicious/human-review bucket, never attempted as a match. Verified in isolation (not just synatx-checked) with a simulation reproducing the exact DAI GENIUS scenario: before the fix, a blank record would have matched and proposed valid_to=2099-01-01; after, it correctly produces 0 updates and 1 suspicious entry.
FAILED: n/a this session -- but see the note below: this bug likely means DAI GENIUS's ALREADY-APPLIED update (run two messages earlier, per its own prior successful pre-check) may itself have been a false match, not confirmed-correct data. Flagged to Fadly for a manual JKM lookup rather than assumed either way.
RULE: An empty/blank identifier is not a null-equivalent for matching purposes -- it is a collision key that any number of unrelated blank records will share. Any matching system keyed by a nullable/optional field must explicitly exclude blank-after-normalization values from both the index being built AND the lookup being attempted, on both sides of the comparison, not just skip true NULLs.
ROUTED TO: admin.html (runRegistrySync matching fix); this log; DAI GENIUS's own current DB value now under a cloud -- needs a manual JKM lookup by name/address since its reg-no was never reliably known.

---
PROBLEM: Fadly asked to import a 4-row new-school CSV; inspecting it before running showed every row with blank phone/email and blank postcode/town/state, with the address field visibly containing "...Tel : X, Faks :, Emel : Y" stuffed into it. Same root-cause SHAPE as the Pendaftaran/Tarikh Tempoh bug fixed two days earlier -- JKM's template splits Tel/Faks/Emel across three separate lines too, not just the registration block -- but this specific field had NOT been covered by that fix, since the address-consuming loop had its own separate single-line assumption.
WORKED: Reproduced the corruption exactly (byte-identical to the bad CSV) before writing any fix. First attempted fix introduced a REAL REGRESSION -- broke the original combined-single-line format while fixing the split-line one, caught by running the full three-case regression suite (original 10-sample, the earlier split-Pendaftaran fix, today's new bug) before shipping, not after. Corrected by checking the combined-line pattern FIRST and falling back to the split-line consumer only when that doesn't match, preserving both shapes. Verified against the ACTUAL function extracted from the delivered admin.html (not a copy) before considering it fixed, per established practice. Separately, before inserting the now-correctly-parsed 4 rows, checked each candidate school's name AND postcode against the existing DB (JKM matching principle: postcode is the location anchor, name alone isn't) -- this caught two real collisions Fadly's raw CSV would have silently duplicated or fragmented: D Rumi Caterpillar (different postcode, genuinely a different branch, inserted with a disambiguating suffix) and Firefly Child Care Centre (same postcode/street as an existing INACTIVE row -- genuinely ambiguous, held back for a human decision rather than guessed).
FAILED: The first one-line "fix" for the split-line Tel/Faks/Emel case, which silently broke the working combined-line case by only checking for the split pattern and removing the combined-pattern check entirely.
RULE: A fix for "field split across lines" in one part of a record's template is a strong prior that OTHER fields in the same template split the same way -- check sibling fields, don't assume the bug was isolated to where it was first noticed. Any fix touching a shared parsing path must be regression-tested against every previously-fixed case in the same run, not just the new one, BEFORE being called done. And: before any INSERT of registry-sourced "new school" data, run the name+postcode collision check as a standing step, not an occasional one -- it caught two of four rows in this batch alone.
ROUTED TO: admin.html (parseJkmPaste contact-block fix); parser.js sandbox; this log; carischool-data-layer skill (candidate addition: pre-insert collision check as a named step in the JKM new-school import procedure).

---

### 2026-07-22 — Registry sync marathon complete: 9 batches, ~3,600 records, what actually made it work
PROBLEM: This session started 2 days ago as "run this SQL" and grew into a full JKM registry sync covering the entire directory (9 Bahagian batches, ~3,600 records) via a founder-run bookmarklet + admin.html pipeline. Fadly named it explicitly harder than coding. Worth capturing what actually got it from "doesn't work" to "processes 400 real records cleanly per batch" -- the pattern, not just the individual bugs (each already has its own note).
WORKED: Four disciplines compounded across the marathon: (1) verify-before-write on every single batch, no exceptions, even after dozens of clean runs in a row -- this is what caught "Taska Khalifah" (would have overwritten a valid listing with an expired one) on batch 8, long after the pattern felt routine; (2) a standing name+postcode+address collision check before every insert, which caught real duplicates in nearly every batch (Salwa Precious, TASKA Aulad Al Akid, TASKA BINTANG CERAH, TASKA DIDIK CEMERLANG, TASKA DOA IBU, TASKA SERI KANDI x2, TASKA PERMATA PUSPANITA) that a blind CSV import would have silently duplicated or fragmented; (3) routing genuine ambiguity to a durable, running verification file instead of trying to hold it in conversation memory across 9 batches -- this let each batch stay fast while still producing a complete, checkable record; (4) fixing structural parser bugs (en dash, split registration lines, split contact lines, blank-key collisions) as soon as REAL production data exposed them, each verified against the actual failing case before being called fixed, rather than patched-and-hoped.
FAILED: Not a single-incident failure this time -- the whole log of prior notes in this file IS the failure record. The meta-lesson is that none of the individual fixes would have been enough alone; it was the STANDING checks (verify, collision-check, log) running on every batch regardless of how routine it felt that caught problems even after the "hard" bugs were fixed.
RULE: For any recurring batch-processing workflow (not just this one), the checks that matter most are the ones applied UNCONDITIONALLY on every iteration, not the ones added reactively after a specific bug -- Taska Khalifah was caught on batch 8, not batch 1, because verify-before-write never got skipped even when it felt like a formality. A tool is "done" when its safety checks survive fifty routine runs in a row without anyone being tempted to skip them.
ROUTED TO: this log (as the marathon's closing entry); jkm-manual-verification-list.md (the durable follow-up artifact — one item, "Taska Khalifah," needs Fadly's direct action; the rest are FYI); admin.html (final fix: new-school CSV now respects expiry the same way renewals do, closing the last known tooling gap); carischool-data-layer skill (candidate addition: the collision-check-before-insert pattern proven across 9 batches deserves to be a named, standard step, not tribal knowledge in a chat transcript).

---
PROBLEM: Immediately after building the Kosongkan button, Fadly asked whether results get captured automatically before clearing -- they don't. The button as shipped wiped BOTH the input textarea AND the results panel (SQL, CSV, suspicious list) with zero persistence anywhere, and nothing in the system has any visibility into the admin's browser session to catch this. A tap made in the moment right after a successful analysis (383 same/7 updates/4 new/5 suspicious) could have silently discarded unrun SQL.
WORKED: Answered the direct question honestly first (no, nothing is captured, Claude has no live session access), THEN fixed the actual design gap rather than only warning verbally -- a warning in chat doesn't protect the NEXT sync session months from now when no one's discussing it. Added a confirm() guard that checks whether the results panel has content and, if so, forces an explicit "have you already run the SQL/CSV?" confirmation naming exactly what's at risk before allowing the clear to proceed.
FAILED: n/a -- the button shipped minutes earlier without this guard was the gap; caught by the user's own good instinct to ask before clicking, not by design.
RULE: Any "clear/reset/discard" action placed next to a "generate output for manual copy" workflow must guard against clearing before the output was captured -- verbal warnings in a chat don't protect future sessions; the guard has to live in the tool itself. When a user asks "does the system remember this for me?", treat a "no" answer as a prompt to check whether it SHOULD, not just to explain that it doesn't.
ROUTED TO: admin.html (rsKosongkan confirm guard); this log; candidate CLAUDE.md pattern -- destructive-adjacent UI actions need in-tool guards, not just documentation.

---

### 2026-07-22 — "I can't copy again" was a UX signal problem, not a real lock
PROBLEM: Fadly reported being unable to re-copy already-tapped "Bahagian" chunk buttons ("cannot deselect disalin to copy again"). Nothing in the code actually prevented a second tap from re-copying -- the button's onclick handler stayed fully functional -- but the label permanently changed to "✅ Disalin!" with no way back, so the button LOOKED done/disabled even though it wasn't, and a second tap gave no visible confirmation it had fired again.
WORKED: Diagnosed as a pure feedback/affordance bug (not a functional one) before writing any fix -- distinguishing "the code is broken" from "the code works but doesn't communicate that it works" avoided over-engineering a heavier fix (e.g. a full resume/persistence system) for what was actually a two-line label-revert fix. Stored the original label in a data attribute so the timeout-based revert is exact, added explicit on-screen copy reassuring repeat taps always work.
FAILED: While updating the shipped markdown doc, hand-constructed a large literal "old_str" block to match against for replacement and mistyped it (undetected typo in a ~5000-character string), causing the str_replace-equivalent operation to silently not match and appear to succeed without actually changing anything -- caught only by re-diffing the doc's actual code against the known-correct sandbox file byte-for-byte afterward, which is now standard practice for this project.
RULE: Before shipping a fix to a UI element with terminal-looking states (checkmarks, "Done" labels, disabled-looking styling), verify explicitly whether the underlying action is actually blocked or just LOOKS blocked -- these have different fixes and the wrong one wastes a round-trip. And: never hand-type a large literal string as a diff anchor for file edits -- locate edit regions programmatically (regex span, unique short markers) so a single mistyped character can't cause a silent no-op; always re-verify the FINAL file's actual bytes after any edit, not just that the edit command reported success.
ROUTED TO: jkm-capture-bookmarklet.md v6; this log.

---

### 2026-07-22 — The real bug was structural, not the dash: raw text extraction doesn't collapse HTML whitespace like a browser does
PROBLEM: After last night's en-dash fix, Fadly reported "same result" on a much larger real paste (pages 401-790+). Every record in that paste showed "No. Pendaftaran : X", "(Tarikh Tempoh : Y - Z)", and "- Category" on THREE SEPARATE lines -- a structure the line-by-line parser could never match, regardless of dash handling. Reproduced with a 3-record excerpt before touching code: 0/3 parsed on the unfixed parser, confirming this -- not the dash -- was the actual production-blocking bug.
WORKED: Root cause: JKM's HTML template has these three fields in separate source elements/lines (likely for template readability); a BROWSER rendering the live page collapses that whitespace per CSS inline-layout rules, so a human's manual "select-all + copy" naturally merges them onto one visual line -- which is exactly why the very FIRST manual test (the one this whole system was built and regression-tested against) never showed the bug. The bookmarklet's raw textContent extraction, working on an UNRENDERED document, preserves the HTML source's literal line breaks with no CSS collapsing applied at all. Fix: a pre-pass that detects an unclosed "No. Pendaftaran" line and merges forward (up to 5 lines) until the Tarikh Tempoh parenthetical closes, optionally swallowing one more line if it's a bare category continuation -- then hands the existing single-line regex an unchanged, already-working input. Verified in four layers before shipping: (1) isolated 3-record repro of the exact bug, (2) full regression on the original single-line 10-record sample (still 10/10, Chung Hwa typo still flagged), (3) the en-dash case from last night (still works -- both fixes compose), (4) a verbatim excerpt of Fadly's actual new paste (5/5) -- all four run against the ACTUAL function extracted from the delivered admin.html, not a hand-copied stand-in.
FAILED: The entire premise of last night's fix and every test built on top of it -- all prior test fixtures (sample.txt, full10.txt) were unknowingly written in the RENDERED single-line format, because that's what a human manually retyping/copying a live page naturally produces, while the deployed tool's actual input source (the bookmarklet) produces the unrendered multi-line format. Passing tests against unrepresentative fixtures is a false confidence signal -- the tests were internally consistent and still missed the shipped tool's real input shape.
RULE: When a tool has two different capture paths (manual copy vs. programmatic extraction), test fixtures must be captured via BOTH paths, not just the more convenient one -- a rendered-page's visual line structure and a raw DOM's literal text are not the same data, and CSS whitespace collapsing is invisible until you diff the two directly. When a user reports "same result" after a fix, do not assume the fix was insufficient in degree -- rule out "fixed the wrong bug entirely" first by reproducing against their ACTUAL new evidence before extending the previous fix.
ROUTED TO: admin.html (parseJkmPaste pre-pass, composes with the en-dash fix); parser.js sandbox reference; this log; carischool-gsc-analysis-adjacent principle for any future scraping/parsing skill -- capture fixtures from every real extraction path, not one.

---

### 2026-07-21 — The real bug was one character wide: JKM's inconsistent dash, not a broken architecture
PROBLEM: Fadly, after three rounds of bookmarklet fixes, concluded the whole approach didn't work and suggested reverting to a scheduled crawler. The actual screenshot showed ONE record failing to parse ("Tiada rekod JKM dikesan"), with a visible en dash (–, U+2013) between the two license dates instead of the ASCII hyphen my regex required.
WORKED: Reproduced the exact failure in isolation BEFORE proposing any fix (en-dash input -> 0 records; hyphen input -> 1 record, using the identical text) -- turning a vague "doesn't work" into a proven, one-character-class root cause. Fixed by widening the date-range separator to a character class covering hyphen plus five Unicode dash variants (en/em dash, hyphen variants, minus sign) -- a well-known necessity when parsing government/CMS-authored web text, which frequently substitutes typographic punctuation. Verified via three layers: (1) targeted repro test, (2) full regression against the original 10-record sample (still 10/10, typo-flagging intact), (3) re-extracted and re-tested the ACTUAL function body from the live admin.html file itself, not a hand-copied approximation, to guarantee the shipped code was what got tested.
FAILED: Mid-session, applied the SAME fix to a sandbox copy (parser.js) using string-concatenated RegExp construction, which requires doubled backslashes for correct escaping -- got confused checking it, misdiagnosed a false "5/10 regression" that was actually just a stale 5-record test file from earlier in the session (mislabeled by me as "10 records"), not a real bug. Also, when checking the LIVE admin.html for the unrelated earlier backslash-doubling failure mode, first used an ambiguous escaped Python search string and got a false positive "doubled backslash" reading, requiring a second, careful byte-count with a plain-text anchor to get the true (and correct) answer.
RULE: A user reporting "the whole feature doesn't work" deserves a reproduction and root-cause search before any architectural conclusion is accepted or offered as an alternative -- the fix here was one regex character class, not a rewrite. And: never verify a fix by testing a hand-copied approximation of shipped code -- extract and test the actual function from the actual file being delivered, because copy/paste drift between "what I tested" and "what I shipped" is exactly how regressions slip through.
ROUTED TO: admin.html (fixed both parseJkmPaste's date-range regex and the Paparan-total regex); this log; candidate CLAUDE.md addition -- "web-scraped text parsers must tolerate typographic punctuation (dashes, quotes) by default, not just ASCII."

---

### 2026-07-21 — Nearly shipped a self-inflicted regression, caught by re-verifying my own output
PROBLEM: v4's single hardcoded footer marker ("HUBUNGI KAMI") likely never matched real JKM markup (case/whitespace mismatch between CSS-display and underlying text), so trimming silently never engaged -- Fadly reported "same result" after re-running all 360 pages. While rewriting v5 with a more robust multi-marker fallback, my first draft of the new file (built via bash heredoc) turned out to contain DOUBLED backslashes throughout (`\\u00bb` instead of `\u00bb`) -- almost certainly carried over by habit from earlier turns where doubling was correct (embedding JS inside a Python string for a different file). Had this shipped, the critical `'\u00bb'` pagination-link comparison would have searched for the literal text "u00bb" instead of the "»" character, finding no next link ever -- reintroducing the ORIGINAL page-1-only bug in a new disguise, in the very fix meant to solve a different problem.
WORKED: Treating "I just generated code with escape sequences" as a mandatory verification trigger, not just a syntax-checkable one. `node --check` passed on the doubled version too (double backslash before a letter is ALSO valid JS syntax, just semantically wrong) -- syntax validity does not imply semantic correctness for hand-authored escape sequences. Caught it by reading raw bytes programmatically (counting literal backslash bytes before each unicode escape) rather than trusting either my own transcription or the tool's stdout display, which itself re-escapes backslashes for its own display and looks "doubled" even when the underlying file is correct -- a second, unrelated confusion layer I had to separately rule out with an unambiguous byte-count check before concluding the fix was real.
FAILED: The first bash-heredoc draft of bookmarklet_v5.js (doubled escapes) -- never shipped, caught before presenting to Fadly.
RULE: `node --check` (or any syntax check) cannot catch wrong-but-valid escape sequences -- any generated code containing hand-typed backslash escapes (\n, \u, \d, etc.) needs an explicit byte-level check that the escape survived exactly as intended, especially when adapting code from a context that needed different escaping (e.g., a string embedded inside another string). When a display layer's output looks suspicious, verify with an unambiguous, non-visual check (byte count) before trusting or distrusting it -- don't debug by eye through nested reprs.
ROUTED TO: jkm-capture-bookmarklet.md v5 (both the trim-robustness fix AND the chunked-delivery redesign, which makes the tool resilient even if trimming heuristics are imperfect); this log; candidate addition to CLAUDE.md's escalation/quality-bar section (generated-code-with-escapes needs a verification step, not just a syntax-check step).

---

### 2026-07-21 — 3596/3596 confirmed complete, then killed by 7 million characters
PROBLEM: v3's pagination self-check succeeded completely (360/360 pages, 3596/3596 records verified) -- but the resulting paste, 6,994,434 characters, froze Safari on paste with no visible progress.
WORKED: Traced the bloat to v2's own fix: reading `.textContent` (needed because DOMParser documents are never rendered, so `.innerText` isn't reliable on them) pulls text from EVERY element regardless of visibility -- including fully-populated but collapsed dropdown `<option>` lists (Negeri/PPD/Agensi, likely 150+ district names) inside the search form, plus the footer contact block and sidebar widget, ALL repeated identically across 360 fetched pages. None of it is data. v4 slices each page to only the text between its "Paparan X - Y daripada Z" line and the footer's "HUBUNGI KAMI" marker before it ever enters the capture -- verified correct against a synthetic test (468 chars -> 222 chars, results block intact, boilerplate gone) before shipping. Paired with a UI-side fix: paste box gets autocorrect/spellcheck disabled (a known iOS lag source on huge text fields), and both Analisa runners now show character count and yield one frame before the synchronous parse, so a large paste is visibly "processing" rather than looking frozen even if it takes a few seconds.
FAILED: v2/v3's silent assumption that `.textContent` on a full page body is "the visible text" -- it is not; it is ALL text, visible or not. This was invisible in small single-page tests (10 records) and only became a problem at full-scale (360 pages), which is exactly why testing at scale, not just correctness, matters before calling a tool done.
RULE: `.textContent` includes hidden/collapsed element text (dropdown options, offscreen widgets) that `.innerText` would exclude on a rendered page -- any tool forced to use textContent (because it's working on an unrendered document) must explicitly scope or trim to the meaningful region, never trust it as "what a human would see." And: a tool can be functionally 100% correct (3596/3596) and still fail in practice at the delivery step -- test the LAST mile (paste, render, click) at real scale, not just the logic.
ROUTED TO: jkm-capture-bookmarklet.md v4; admin.html (textarea attrs + paint-yield in both sync runners); this log.

---

### 2026-07-21 — Silent truncation is worse than a loud failure: pagination self-check
PROBLEM: Fadly ran the bookmarklet intending to capture all 360 JKM pages; the Registry Sync analysis showed exactly 10 records — the same 10 as the very first manual single-page test — meaning the tool almost certainly only ever captured page 1, with no indication that anything had gone wrong.
WORKED: Rather than guess blindly (I cannot fetch jkm.gov.my myself to reproduce it), added a self-check using the source's OWN progress marker: JKM's "Paparan X - Y daripada Z" line. After fetching each next page, the bookmarklet now verifies the range actually advanced; if it sees the same range twice (background fetch silently returning page 1 again -- plausible if pagination depends on search/session state a bare fetch doesn't carry) or no range at all (blocked/redirected page), it stops immediately and displays exactly why, in Malay, on screen. The finished-screen also now states true position ("rekod 3596 drpd 3596") so success and silent-failure no longer look identical.
FAILED: v1/v2's core assumption -- that following a "next" link via background fetch behaves like a real click -- may not hold when pagination depends on session/search state. Not yet confirmed; the tool now surfaces the evidence needed to confirm it on the next run.
RULE: Any unattended-looking step (a loop, a background fetch, a multi-page capture) must validate its own progress against a marker the SOURCE provides, not just "did the code run without throwing" -- a script that completes without erroring is not the same as a script that did what it was asked, and silent truncation is a worse failure mode than a loud, explained stop.
ROUTED TO: jkm-capture-bookmarklet.md v3; this log. Pending: Fadly's next run + the on-screen warning text (if any) to confirm root cause and, if needed, redesign around real-click+resume rather than background fetch.

---

### 2026-07-21 — Applying a sync-surfaced finding: verify before writing, write only the delta
PROBLEM: The Registry Sync tool flagged Perintis Tropika as a renewal candidate; executing "update with latest JKM cert" naively could have meant blindly rewriting every JKM field.
WORKED: Re-queried the live row before writing anything (deploy-verification principle) and found every JKM field (reg no, dates, address, phone, email) already matched the captured registry data exactly — only is_active was stale. Wrote a single-column UPDATE instead of a full-field overwrite, then re-queried to confirm.
FAILED: n/a — the verify-first step is what prevented an unnecessary full rewrite.
RULE: When asked to "update with latest data" after a sync tool already flagged a candidate, re-verify current state first and write only the actual delta — never re-apply fields that already match, even when the instruction implies a full update.
ROUTED TO: this log; reinforces CLAUDE.md's deploy-verification principle (§ approach & patterns).

---

### 2026-07-21 — First production run: the safety layers fired, and innerText lied
PROBLEM: First live Registry Sync run on carischools.com surfaced junk JavaScript ($('#resetfont')...) inside the capture blob — JKM's page scripts leaking into what should have been visible text.
WORKED: The run itself validated the whole design: Chung Hwa typo caught and excluded, 9/10 confirmed current with zero spurious SQL, and one genuine finding (TASKA Perintis Tropika: valid JKM license to 2030, inactive in DB — a real expired-then-renewed case surfaced by the renewals bucket). Root cause of the junk found: DOMParser documents are never rendered, and on unrendered documents innerText silently degrades to textContent — including every script/style. Fix: clone body, strip script/style/noscript, read textContent (bookmarklet v2). The parser's tolerate-all-noise design meant v1 captures still parsed correctly — resilience bought debugging time.
FAILED: v1 bookmarklet's grab() — innerText on DOMParser output is not the innerText you know from live pages.
RULE: innerText semantics require a rendered document; any tool reading text from DOMParser/fetch output must strip script/style/noscript and use textContent — and parsers downstream of ANY capture tool should tolerate raw-source noise, because someday they'll receive it.
ROUTED TO: jkm-capture-bookmarklet.md v2 (fix + explanation embedded); this log.

---

### 2026-07-21 — MOE sync: the same paste means opposite things depending on the search
PROBLEM: MOE's E-Prasekolah forces per-PPD searches with a Status filter — and a matched record's MEANING inverts with that filter: matched under TUTUP/TIDAK AKTIF = deactivation candidate; unmatched under AKTIF = new school. A parser without search-context would generate exactly wrong SQL.
WORKED: Mode selector in the Registry Sync tab so the analysis knows which Status the paste came from; tab-to-newline normalization turns iOS table copies into uniform field-per-line records; parser tested first against Fadly's real Batu Pahat paste, which supplied the edge cases (double-dash phone, +60 prefix, "83000 MELAYU" town typo, truncated final row → flagged incomplete and excluded); declared-total ("Jumlah institusi : 129") vs parsed-count mismatch warns about partial copies. Bonus discovered in the data: MOE publishes per-tadika Kekosongan (vacancy counts) — surfaced as advisory insight (matched schools with vacancies but is_enrolling unset), never auto-written.
FAILED: n/a — test-first against real material prevented the failures.
RULE: Any registry-delta tool must carry the search context that produced its input (a match is not a fact, it's a fact-under-a-filter); and always parse the source's own declared total to detect partial captures before trusting absence.
ROUTED TO: admin.html Registry Sync (mode selector + comments carry it); this log. Vacancy-insight → future outreach ammunition once a full state is pasted.

---

### 2026-07-21 — The 360-page problem: assistive browsing as the middle category
PROBLEM: The compliant human-in-the-loop sync design quietly relocated the robot's labor onto Fadly's thumbs — ~360 pages of select-all-copy per JKM pass, which would have killed the ritual in practice.
WORKED: Recognizing a third category between "unattended robot" (refused — robots.txt) and "fully manual" (impractical): a bookmarklet running in Fadly's own Safari session, user-initiated per run, politely paced (1.2s/page), following the site's own » links, capturing body text the existing parser already tolerates. No scheduling, no servers, no selectors to break — it automates his clicking, not access. Rules baked into the deliverable: never schedule, never server-run, keep the delay.
FAILED: The first "compliant" design — compliance that makes the human the crawler isn't a solution, it's cost-shifting; caught by Fadly, not by me.
RULE: When robots.txt forbids automation, the alternative must still respect the HUMAN's constraints — user-session, user-initiated, rate-limited assistive tooling is the legitimate middle path; and any human-in-the-loop design must be costed in the human's minutes before shipping.
ROUTED TO: jkm-capture-bookmarklet.md (rules embedded in the doc); this log.

---

### 2026-07-21 — "Can be crawled" ≠ "may be crawled": the registry sync pivot
PROBLEM: The plan was an unattended GitHub Actions robot syncing JKM data monthly; inspection before building revealed jkm.gov.my's robots.txt disallows automated access, and the legitimate alternative (data.gov.my TASKA datasets) is annual/stale.
WORKED: Verifying source permissions BEFORE writing a line of scraper code, then pivoting to human-in-the-loop: Fadly browses the public directory as a person, pastes result pages into an admin Registry Sync tab; the tool parses, matches by normalized registration number (JKM's own formats vary: W/TI-018/2023, S/TI 023/2024), and outputs copyable UPDATE SQL + new-school CSV in DB columns. Privileged writes stay with the human via the Supabase SQL editor — no service key needed anywhere. Parser built test-first against Fadly's real paste, which surfaced two things guesswork would have missed: JKM's "postcode Town State" address tail needs state-list splitting, and real JKM data contains typos (a negative validity period) — suspicious records are flagged and excluded from generated SQL, never imported.
FAILED: The original robot design — killed by a fact, not a bug. Also the first state extraction merged town into state until tested against the sample.
RULE: Before designing any automated collector, fetch the source's robots/permissions first — technical crawlability is not permission; and registry parsers must treat the registry itself as a source of typos: validate periods, flag anomalies, and never let a flagged record into generated writes.
ROUTED TO: admin.html Registry Sync tab (the tool + its header comment carries the doctrine); this log; MOE side pending Fadly's sample capture.

---

### 2026-07-21 — Delisting decided: Option A, and why the registry makes it right
PROBLEM: Whether to publish a removal-request path for schools unhappy with their listing.
WORKED: Option A chosen (corrections-only, no public removal path). The operational reality Fadly supplied makes A structurally correct, not just cautious: removal-in-practice already happens through registry truth — the biannual manual MOE comparison (credential-gated, not crawlable) trues up is_active, so closed schools leave the listing via data, not requests. Publishing a removal path would create an obligation the sync already fulfills better.
FAILED: n/a — decision session. Rejected: the internal B-conditions playbook (offered, declined — keep it that way until a real request arrives).
RULE: Registry-truth doctrine — (1) MOE: no crawling possible, biannual manual comparison is the is_active source of truth and the natural moment for mismatch-cleanup reruns; (2) JKM: crawlable, but directory presence ≠ valid license — expired licenses stay listed, so jkm_valid_to is the only validity signal and any future JKM crawl must treat it as such, never directory membership.
ROUTED TO: memory (decision + registry facts); carischool-data-layer skill when next touched (JKM validity rule belongs beside the category semantics).

---

### 2026-07-21 — Phase B shipped live: read the security pattern before inventing one
PROBLEM: Building the corrections pipeline required knowing how admin.html reads RLS-protected staging tables — undocumented, and guessing wrong would either expose reporter contacts publicly or leave the queue unreadable.
WORKED: Interrogating the live DB before writing DDL: claim_submissions is anon INSERT-only under enabled RLS, so admin reads MUST flow through SECURITY DEFINER RPCs granted to anon (confirming the approve_school_claim precedent). correction_reports copies that exact shape: public insert, get/resolve RPCs. Migration applied via apply_migration, then smoke-tested end-to-end (insert → read via RPC → cleanup) before wiring any UI. Deliberate design choice recorded in the admin tab comment: approving a report never auto-writes to schools — suggested values are unverified public input; a human applies the fix.
FAILED: Nothing — but only because the schema questions were asked first; the "obvious" anon-SELECT policy would have exposed reporter contact details sitewide.
RULE: Before adding any table that admin.html must read, check relrowsecurity + existing policies on a sibling staging table and copy that access pattern; and never let a public-submission value auto-write to live schools rows.
ROUTED TO: this log; carischool-data-layer skill (pattern now proven: staging = anon INSERT-only + SECURITY DEFINER RPC pair); migration create_correction_reports in Supabase.

---

### 2026-07-21 — Executing month-old briefs against a codebase that kept moving
PROBLEM: Taking over my own two trust-pass briefs for direct execution, five days and many weaker-model commits after writing them — several "gaps" no longer existed as specified.
WORKED: Re-verifying every brief item against the CURRENT files before editing. Three brief items dissolved on contact: the Google-reviews link already existed (better than specified, with place_id); the SLA inconsistency I'd flagged had already been unified to 1-2 hari (my flag was stale, not the site); the KPM-vs-JKM explainer filename I'd marked as an escalation was resolvable from index.html's guide cards (/kpm-vs-jkm-tadika-taska.html). Also caught mid-execution: a str_replace landed a block inside the wrong brace scope (spotted by re-viewing after the edit, per the re-view rule) and a styling assumption (white-on-white provenance text) corrected by checking the actual banner CSS before shipping.
FAILED: First placement of the guide-strip toggle went inside the claim-banner else block; first provenance styling assumed a colored banner. Both caught by post-edit verification, neither reached delivery.
RULE: A brief older than the codebase's last few commits is a hypothesis list, not a work order — re-verify each item against current files first, and expect roughly a third to have dissolved, improved, or self-resolved; and always re-view an edit region immediately after editing it.
ROUTED TO: this log; reinforces CLAUDE.md's deploy-verification principle and the extract-approach skill's escalation-answers-become-doctrine trigger.

---

### 2026-07-16 — The owner's first emotion is alarm, not opportunity
PROBLEM: All school-facing surfaces (claim page, outreach) pitched benefits, implicitly assuming owners arrive curious; the persona walk showed owners actually arrive alarmed ("who made a page about MY school? is my data right? will this bill me?") — and no page answers those questions.
WORKED: Sequencing the owner's emotional journey (alarm → audit → money-skepticism → marketing interest) before proposing features; each gap mapped to one journey stage. Key derivations: a legitimacy page (untuk-sekolah.html) must exist BEFORE benefits pitches land, and it doubles as the outreach landing link — every future WhatsApp outreach message should link it, pre-answering the skepticism that kills replies. Correction path split into zero-schema v0 + escalation-gated Phase B, respecting the schema stop-trigger.
FAILED: n/a — design session; the rejected instinct: promising delisting in FAQ copy (a business policy decision, pre-flagged as escalation instead of improvised).
RULE: School-facing copy and outreach must answer legitimacy (who/why/free/fix) before pitching benefits; and persona walks should map features to emotional-journey stages, not feature lists.
ROUTED TO: prompt-owner-trust-pass.md (executable form); outreach implication → Move-3 template should link untuk-sekolah.html once live.

---

### 2026-07-16 — Persona walk as a gap-finder, and missing data as a conversion surface
PROBLEM: "Meet parent expectations" was too abstract to produce scoped work; feature ideas kept gravitating toward data we don't have (fees, photos, reviews).
WORKED: Walking the site as one specific parent (10pm, phone, one school name) surfaced ranked gaps in minutes, cross-validated against GSC query intent ("...photos" searches). Core reframe that unlocked scope: every "Tiada maklumat" is a conversion surface — replace the dead end with a prefilled WhatsApp question, so the site's weakest data becomes its strongest action. Trust gaps that need data got bridged with words (question checklist, honest outbound Google-reviews link) instead of waiting on coverage.
FAILED: Nothing executed yet — but the rejected instinct is worth recording: building review/fee features that pretend to coverage we lack would have violated the no-invented-data standard.
RULE: When a stakeholder expectation can't be met with data, ship the ACTION that gets the user the answer (prefilled contact, honest outbound link, checklist) — never a feature that implies data exists; and any profile-surface change ships to BOTH school.html and index.html's modal or not at all.
ROUTED TO: prompt-school-trust-pass.md (the executable form); the dual-markup law elevated into that brief's "Critical structural fact" section.

---

### 2026-07-15 — First real search data changes the strategic picture
PROBLEM: Strategy advice had been running on inference; a GSC export made ground truth available for the first time.
WORKED: Analyzed the export BEFORE writing any recommendation. Three findings inverted assumptions: school profiles are 91% of clicks (the long tail IS the business); the sekolah agama cohort is 14% of impressions at ~0% CTR (rankings that look like wins are intent-mismatch bugs); jobs/fee search demand is near-zero today (those assets are conversion tools, not traffic magnets). Made the analysis repeatable as a skill+script, validated against the real export, and caught the script feeding intent-mismatch queries into the outreach list before shipping.
FAILED: First script draft counted 'sekolah agama' queries as outreach ammunition and made one loose slug join ("bandar pontian" → bandar-kulai) — excluded the cohort and required a 24-char prefix match.
RULE: No strategic recommendation ships while unanalyzed first-party data sits in the uploads folder; and any generated outreach list must exclude the intent-mismatch cohort and be identity-verified against Supabase before a single message is sent.
ROUTED TO: skills/carischool-gsc-analysis/ (the repeatable version); CLAUDE.md M19 + M20; roadmap-addendum-2 (the findings themselves).

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
