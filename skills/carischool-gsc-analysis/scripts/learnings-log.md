# CariSchool Learnings Log

Chronological record of learnings notes per the learning law (see
skills/extract-approach/SKILL.md). Every note here has also been routed to its durable home —
this file is the audit trail, not the reference. Newest first.

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
