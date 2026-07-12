# CariSchool Learnings Log

Chronological record of learnings notes per the learning law (see
skills/extract-approach/SKILL.md). Every note here has also been routed to its durable home —
this file is the audit trail, not the reference. Newest first.

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
