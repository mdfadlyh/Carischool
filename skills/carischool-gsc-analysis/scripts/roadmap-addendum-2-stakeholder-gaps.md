# Roadmap Addendum 2 — Stakeholder Gaps & Enhancements (data-grounded)

Prepared 2026-07-15. Basis: the GSC export (7 days, 2026-07-06 → 07-13), the new files
(vercel.json, sitemap.js, send-claim-email.js, monetization addendum), and the live pages.
This slots into carischool-roadmap.md; it does not replace it. Standing decisions are
respected as-is: premium pricing deferred to the 100-founding-school threshold, crawl paused
pending its three conditions, JKM review backlog non-urgent, panduan.html waits for ~8 guides.

---

## 1. What the data actually says (first real numbers)

Week of 7–13 July: **~1,277 clicks, ~56k impressions, avg position 6.7, 77% mobile.**

**Finding 1 — school profiles ARE the business: 91% of all clicks (1,158/1,277) come from
individual profile pages**, earned by brand+town queries ("taska ibunda", "tadika murni setia
alam"). The long-tail programmatic engine works. Every strategic question should now be read
as: "does this feed, convert, or monetize profile-page traffic?"

**Finding 2 — the sekolah agama cohort is a fifth of impressions and converts at ~0%.**
56 queries / ~2,900 impressions (19.5% of query impressions) are people searching for
sekolah agama (religious primary schools) and their *photos*; our pages rank pos 4–9 and get
almost no clicks (top page: 976 impressions, 0 clicks). The searcher wants the primary
school; we show a preschool-directory profile. This drags site-wide CTR and wastes our best
rankings. Needs a decision, not a reflex (see §4, Gap A).

**Finding 3 — "near me" is the best-converting theme and has no home.** "taska near me" /
"tadika near me" / "playschool near me": 621 impressions, 6.9% CTR — the highest thematic
CTR on the site, and the theme memory says is growing 6x. There is no dedicated page serving
this intent. Important: this does NOT need the paused lat/lng crawl — a town/postcode picker
covers it (98.4% postcode coverage already in DB).

**Finding 4 — kawasan pages punch below their weight and are artificially capped.** 14
kawasan pages earned 1,959 impressions at only 2.55% CTR, and the sitemap hardcodes exactly
14 towns — yet /kawasan.html?bandar=Kota%20Bharu ranks and earns clicks despite NOT being in
the sitemap. Google is telling us the template scales beyond our hand-picked list.

**Finding 5 — "photos" is a named search intent we can't serve.** Multiple query variants
append "photos"/"照片" to school names. Unclaimed profiles have no photos (and crawler
photo enrichment is paused after the mismatch cleanup). This is simultaneously a parent gap
and the sharpest outreach hook we've ever had (see §3).

**Finding 6 — jobs and fee queries barely register in search (2 and 1 queries respectively).**
The jobs board and fee content are conversion/retention assets, not search-demand magnets —
at least not yet. Calibrate expectations for the yuran guide accordingly (it may build
slowly; that's normal, not failure).

**Finding 7 — Search appearance report is empty.** The FAQ/JobPosting structured data shipped
in Move 6 hasn't yet registered rich results in this window. Monitor next export; if still
empty in 4–6 weeks, validate with the Rich Results test.

---

## 2. Per-stakeholder gaps and the move that fills each

### Parents (the traffic)
- **Gap: "near me" intent has no landing experience.** Move: a `berdekatan.html` (or a mode
  of index) — one screen, "Di mana anda?" town/postcode picker (reuse the town data that
  powers kawasan), instant list. No geolocation API needed for v1; no school coordinates
  needed. Serves the best-CTR growing theme within house style. *Small build; high fit.*
- **Gap: profiles are text-only for unclaimed schools while parents search for photos.**
  Partially blocked (crawl paused), but claimed schools CAN have photos today — which makes
  photo coverage a claim-conversion problem, not a crawler problem (see Schools below).
- **Already handled, don't duplicate:** guides funnel live, affiliate strip live, favourites/
  compare live.

### Schools (the revenue)
- **Sharpest new asset: query-level proof for outreach.** We can now tell a specific school
  "parents searched for photos of your taska N times this week and found a profile with
  none." That is a materially stronger WhatsApp opener than generic engagement counts.
  Move: fold GSC evidence into the Move-3 outreach engine — the new gsc-analysis skill
  (§5) extracts an "outreach ammunition" list (school-name queries with impressions but
  no/low clicks, mapped to unclaimed profiles) from each export.
- **Gap: SLA copy inconsistency.** send-claim-email.js promises review in "1-2 hari
  bekerja"; on-site claim copy says 2–5. Pick one number (recommend 2–5 — under-promise)
  and unify. Small, but schools notice broken promises.
- **Standing decision respected:** premium price stays unpublished until the 100-school
  threshold; nothing in this addendum reopens that.

### Business partners / advertisers (future)
- The honest number for a partner pitch is now known: ~1,277 clicks/week. That is below the
  bar for brand partnerships (the addendum's Phase 1 trigger stands — correctly parked).
  What changes: we now have a *trend line to show later*. Move: keep monthly GSC exports in
  a folder; the gsc-analysis skill turns them into the eventual pitch-deck traffic chart at
  zero extra effort.

### Internal (Fadly + models)
- **The weekly digest cron exists** (vercel.json: `/api/cron-weekly-digest`, Mondays) —
  Move 2's spirit is automated. Enhancement: add the month's GSC export analysis as a
  monthly manual companion (15 minutes with the skill).
- **Gap: sitemap drift.** The sitemap hardcodes 14 kawasan towns and a static-page list
  that must be hand-edited every time a guide ships (6 guides live; sitemap lists 4).
  Move: generate kawasan entries dynamically (towns with ≥ N active schools, same threshold
  philosophy as the neighbourhood chips) and add the two missing guide URLs now. Also:
  static pages emit `lastmod = today` on every generation — Google learns to ignore
  perpetually-fresh lastmod; use real dates or omit.

---

## 3. Monetization, tailored to what the data permits

Blunt version: **the data says the constraint is traffic volume and claim conversion, not
missing revenue mechanisms.** Consumer streams are live (affiliate + guides), AdSense and
partnerships are correctly trigger-parked, premium pricing is a standing decision. The
monetization work this month is therefore *indirect*: grow the engine that produces the
audience the mechanisms need.

Priority order the numbers support:
1. **Claim conversion via query-evidence outreach** (Schools gap above) — every claim adds
  photos/fees (wajib at claim), which lifts profile CTR, which compounds the 91% engine.
2. **Kawasan expansion + near-me page** — grows the non-brand traffic share, which is the
  inventory AdSense/partners will eventually buy.
3. **Guide funnel patience** — fee/job search demand is near-zero *today* (Finding 6);
  let the shipped guides age before judging or expanding them past the panduan.html trigger.

No new revenue mechanism is proposed. Adding one now would be motion, not progress.

---

## 4. Mistakes to fix and codify (routed per the learning law)

**Gap A — intent-mismatch rankings (sekolah agama cohort).** Decide, don't drift. Options:
(a) leave as-is (harmless impressions, some spillover), (b) sharpen titles to
"Tadika/Taska di {name}" so the SERP self-selects correct intent, (c) if any of these rows
are actually mis-categorized non-preschool entities, that's a data-integrity fix
(needs_review-style human check on a ~56-school list — small and bounded, unlike the JKM
backlog). Recommend (b)+(c) audit on just the cohort list the skill script outputs.
→ **New named mistake M19 — Ranking ≠ winning:** a page ranking top-10 with ~0% CTR is an
intent mismatch, not an SEO success; treat sustained high-impression/zero-click pages as
bugs with a title/data investigation, never as vanity wins.

**Gap B — hardcoded lists that the data outgrows (sitemap towns, guide URLs).**
→ **New named mistake M20 — The stale hand-list:** any hardcoded content list that mirrors
DB state (towns, guides, states) will silently drift; either generate it from the DB or
attach it to a checklist item that fires when the source changes. (Kota Bharu ranking
outside the sitemap is the proof case.)

**Gap C — SLA copy divergence between email and site.** One number, everywhere. Route: add
to CLAUDE.md §4.4 checklist line (claims consistency) — the rule already exists ("review-
turnaround promises"); this is its first caught violation. Fix in the same session as any
next email/claim edit.

**Gap D — sitemap `lastmod=today` for static pages.** Cosmetic-to-minor; fix opportunistically
when next touching sitemap.js (Gap B work).

---

## 5. Skill proposal (one, not three — the others aren't earned yet)

**carischool-gsc-analysis** — written in full alongside this addendum. Monthly ritual:
export GSC zip → run bundled script → get the standard report (totals/trends, page-type
breakdown, striking-distance list, intent-mismatch cohort, **outreach-ammunition list**,
kawasan candidates). Turns a 2-hour manual analysis into 15 minutes, and its outputs feed
Moves 3 and this addendum's items directly. The script is the analysis performed for this
addendum, made repeatable.

Not proposed (deliberately): an "seo-content skill" — the guide pipeline is working and
young; codify it after 2–3 more guides reveal the stable pattern. A "sitemap skill" — Gap B
is a one-time fix plus an M-number, not a recurring craft.

---

## 6. Execution order (all weaker-model-safe, briefs per CLAUDE.md rules)

1. **Sitemap fixes** (Gap B+D): dynamic kawasan towns ≥ threshold, add missing guide URLs,
   real lastmod. Half-day. Escalation trigger: none expected.
2. **Outreach ammunition integration**: run gsc-analysis, hand the ammunition list to the
   Move-3 Monday batch with the photo-evidence template variant. No build — process change.
3. **Sekolah agama cohort audit** (Gap A): script outputs the list; human pass (bounded,
   ~56 rows) decides per-row: title sharpen / recategorize / leave. Then title template
   tweak if (b) chosen.
4. **berdekatan.html near-me page**: page-builder + i18n skills; town/postcode picker,
   no geolocation v1, no dependency on the paused crawl.
5. **SLA unification** (Gap C): bundled into the next touch of claim.html or the email
   function.

Learnings note for this session is appended to learnings-log.md; M19/M20 routed to CLAUDE.md.
