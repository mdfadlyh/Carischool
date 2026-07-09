# CariSchool Learnings Log

Chronological record of learnings notes per the learning law (see
skills/extract-approach/SKILL.md). Every note here has also been routed to its durable home —
this file is the audit trail, not the reference. Newest first.

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

---

### 2026-07-10 — Two silent-failure bugs in the same shape, found by user-reported symptom
PROBLEM: Admin approved a real claim, saw a generic success toast, but had no way to know whether the school's notification email actually sent.
WORKED: Traced the full chain (RPC → email API → toast) against real data before touching code. Found `fetch()` resolves normally on HTTP error responses (4xx/5xx) — only network-level failures throw — so a `try/catch` around a bare `await fetch(...)` with no `.ok` check silently swallows real send failures. Found the identical pattern in a second, unrelated approval flow (new-school submissions) by grepping for all call sites of the same endpoint, not just the one reported.
FAILED: First fix attempt added a warning toast inside the email block without checking call order — an unconditional success toast later in the same function would have overwritten it, since `showToast()` has no queue (single textContent slot, last call wins). Caught by re-reading the function's full execution order before shipping, not by testing.
RULE: A `try/catch` around `fetch()` does not catch HTTP error responses — always check `response.ok` explicitly when the caller needs to know if the request succeeded; and when fixing a silent-failure bug, grep for every call site of the same pattern, not just the one that was reported.
ROUTED TO: CLAUDE.md §3 (new M-number); carischool-data-layer SKILL.md (note under /api/* endpoints: check response.ok, fetch() doesn't throw on HTTP errors).

---

### 2026-07-10 — Admin-tool RLS blind spot: direct anon reads of INSERT-only tables silently return zero
PROBLEM: A new admin stats tab queried `claim_submissions` directly with the anon key; every count came back 0 regardless of real data, with no error surfaced.
WORKED: Checked `pg_policies` directly rather than assuming — found the table has an INSERT policy only, no SELECT policy at all, so RLS silently denies all anon reads (returns empty, not an error). Fixed by adding one narrow SECURITY DEFINER RPC (`get_weekly_snapshot_stats`) matching the project's existing admin-RPC pattern, rather than adding a public SELECT policy that would let anyone browse other schools' claim submissions.
FAILED: Nothing — caught before shipping to the user by checking `pg_policies` proactively once the numbers looked suspiciously uniform (all zero) rather than trusting the query syntax was the problem.
RULE: A Postgres count query with no matching RLS SELECT policy returns 0 successfully, not an error — if every number in a new anon-key query looks suspiciously zero, check `pg_policies` for that table before debugging the query logic.
ROUTED TO: carischool-data-layer SKILL.md (pitfall checklist); CLAUDE.md M-number (RLS silent-empty-result trap).
