# AI Visibility Audit — Block A Report

**Run 2026-08-06 · 60 captures · Q1–Q20 × ChatGPT / Google AI Mode / Perplexity**
**Baseline for the 90-day re-run (due ~2026-11-04)**

---

## Headline

**Citation rate: 0 / 60.** carischools.com was not cited once, on any surface, for any
query, in either language.

That number alone is not the finding. The finding is *why* — it differs by intent block, and
only one of the four is a problem worth spending money on.

| Metric | Result |
|---|---|
| Citation rate | **0/60** (CGPT 0/20, GAI 0/20, PPLX 0/20) |
| By intent — proximity (Q1–5) | 0/15 |
| By intent — town (Q6–10) | 0/15 |
| By intent — trust/registration (Q11–15) | 0/15 |
| By intent — named schools (Q16–20) | 0/15 |
| Named-school rate | 57/60 |
| **BM vs EN gap** | **none detected** |
| Deferred to the parent ("tell me your area", "go verify") | **60/60** |
| Hallucination | 1 (PPLX Q6) |

---

## Method and its limits

Run per the query-set doc: incognito on all three surfaces, exact wording, first answer only,
no follow-ups. One deviation, logged: the very first ChatGPT attempt was made logged-in and
failed to fetch a URL that succeeded logged-out. All 60 scored captures were incognito.

**Three limits worth stating before anyone acts on this.**

1. **This is a baseline, not a verdict on the fixes.** `api/prerender.js` was repaired the
   same day. Crawlers need weeks to re-crawl and re-index. A 0% citation rate today is the
   *before* picture; the 90-day re-run is the measurement.
2. **URL-directed fetching works; organic discovery is what failed.** When handed a URL,
   ChatGPT read `kawasan.html?bandar=Setia Alam` and listed the schools, citing CariSchool.
   Every Block A query gave no URL — the surface had to *choose* us. It never did.
3. **Single run.** Cross-query patterns below are reported only where five or more
   observations support them, per the learning law. Anything thinner is flagged as a working
   note.

---

## Finding 1 — Proximity intent is structurally unwinnable, not lost

**Observations: 10/10 (Q1–Q5, ChatGPT and Google AI Mode).**

Both surfaces answered "near me" queries from a **places/maps database**, not from web
content: star ratings, "Open until 6:30 PM", opening status, category labels, and
`kgmid=` Google Knowledge Graph links. Google AI Mode returned literally zero outbound web
sources on several of these.

There is no directory-shaped slot in those answers to win. No amount of content, SEO or
prerender work reaches a places panel. **Perplexity is the exception** — 0/5 places panels,
5/5 real web retrieval — which makes it the only surface where proximity intent is
contestable at all.

**So what:** stop treating "near me" as an AI-visibility opportunity on ChatGPT and Google.
The lever there is Google Business Profile data, which we cannot create for schools we do not
own — which routes back to claim conversion, not content.

---

## Finding 2 — Registration framing is the door that opens

**Observations: 3/3 flipped, 2/2 did not.**

| Query | Framing | Retrieval mode |
|---|---|---|
| Q7 `taska berdaftar di Ipoh` | "berdaftar" | **web + gov, all 3 surfaces** |
| Q9 `tadika di Kota Bharu yang berdaftar KPM` | "berdaftar KPM" | **web + gov, all 3** |
| Q11–Q15 registration/trust | explicit | **web + gov, all 3** |
| Q6 `senarai tadika di Kuching` | none | places panel (CGPT, GAI) |
| Q8 `preschool in Seremban for 4 year old` | none | places panel (CGPT, GAI) |

Adding a registration word moves every surface off the places panel and onto the open web,
where `jkm.gov.my`, `moe.gov.my` and a handful of weak blogs are the entire competitive set.

**So what:** this is the reachable surface. Title and content work on kawasan/state pages and
guides should lead with *berdaftar / registration status*, not with "near me" or "terbaik".

---

## Finding 3 — Every surface tells parents to verify registration by hand

**Observations: 5+ (Q3, Q7, Q9, Q10, Q11, Q12, Q14, Q15).**

Not one of 60 answers suggested that a public, no-login registration lookup exists. What they
told parents to do instead:

- Log in to SMPK / ePrasekolah and search (PPLX Q9, Q11)
- Filter the JKM portal by state and district, then paginate (all three, repeatedly)
- Look for the JKM plaque near the entrance (GAI Q12)
- Ask to see the Borang C / Perakuan Pendaftaran certificate and check the expiry date
  (GAI Q12, PPLX Q12, PPLX Q14)
- Check the building floor level and whether the premises are overcrowded (GAI Q12)
- Phone the district welfare office (PPLX Q12, Q14)

Google AI Mode (Q12) laid this out as nine numbered steps across two portals plus a site
visit. Perplexity (Q15) and Google AI Mode (Q15) each hand-paginated `jkm.gov.my` across six
to eight page numbers to assemble a Selangor list.

`school.html` answers this in one page load, no login, with `registrationStatus()` computing
`jkm_valid_to < now()` and printing *"Lesen JKM … tamat tempoh pada …"*.

**So what:** the differentiator is real and nobody is contesting it. The problem is that these
systems do not believe the capability exists in Malaysia.

---

## Finding 4 — Facebook is the de facto Malaysian preschool database

**Observations: 20+ Facebook citations across all three surfaces.**

Google AI Mode is the only surface reading it consistently, and it repeatedly found facts the
other two declared unavailable:

- **Q17 Tadika Sin Hwa Langkawi** — full fee schedule (RM250 booking, RM880 annual for 4yo,
  RM980 for 5–6yo, RM450/month full-day, 10% early-bird) sourced from a post in the
  *Langkawi Travel Guide* Facebook group. ChatGPT and Perplexity both said no fee information
  was published online.
- **Q19 Fortis International** — "from RM1,000+/month" from the school's own Facebook posts.
- **Q16 Taska Ibunda** — a *Review Taska/Tadika Kuching* Facebook group recommended as the
  place to get parent feedback.

**So what:** fee and review data that "doesn't exist online" often does — in Facebook groups.
That is a sourcing channel, and it is also the strongest argument yet for the
`fee_submissions` parent-reporting flow already built and unused.

---

## The two moments that matter most

### Q18 — an expired licence reported as current, by two surfaces

`Taska Ummi Nureen`, Kota Bharu. ChatGPT and Perplexity both printed the JKM registration
period **`05.01.2021 – 04.01.2026`** under headings like "Key Details", as current information
for a parent choosing childcare. **That registration expired on 4 January 2026 — seven months
before the query.** Neither compared the end date to today's date. Google AI Mode showed the
place card and never mentioned registration at all.

This is precisely the comparison `registrationStatus()` performs automatically.

**But CariSchool does not have this school.** A database query for `%nureen%` returned
nothing. It is a real Kota Bharu taska with a JKM record and it is absent from our 10,924.

The capability is uniquely ours; on this query the coverage gap meant we would have had
nothing to say either.

### Q16 — exact slug match, cited a competitor instead

Query: `Taska Ibunda Sarawak reviews`. Our slug is **`taska-ibunda-sarawak`** — verbatim.

- ChatGPT: "couldn't find a verified listing", cited **foodpanda**
- Perplexity: "no clear, aggregated rating or review site", cited **Indeed** and a
  **TripAdvisor guest house in Kelantan**
- Google AI Mode: found it, and cited **`kiddy123.com/listing/taska-ibunda/`**

Same school, both directories have a page, only kiddy123 was cited.

---

## Competitor set

The most commercially useful output, per the query-set doc. This is the sales-deck slide.

| Source | Cites | What it is |
|---|---|---|
| jkm.gov.my | 25+ | the primary registry — unstructured, paginated, **does not flag expiry** |
| Facebook (pages, groups, posts) | 20+ | the de facto database |
| kiddy123.com | 8 | closest direct analogue to CariSchool |
| moe.gov.my / malaysia.gov.my | 12+ | primary registry, login-gated search |
| ilmify.app | 5 | an edtech app's blog |
| Anak2U, eduswasta, kidzenrol, schooladvisor, schoolandcollegelistings | 12 | directory rivals |
| harianpost, thestoly, studentportal, mishu, malaysia4u, readnetwork, ainulmustafa | 12 | listicles and blogs, incl. a 2022 blogspot |
| **yelp, indeed, tripadvisor, foodpanda, NCDRC, office-hub** | **6** | **not Malaysian preschool sources at all** |

**No single competitor dominates.** The space is fragmented across weak sources: a coworking
property site, an Indian consumer redressal commission, a food delivery app and a Kelantan
guest house all outranked us. Fragmentation is better news than an entrenched incumbent — but
kiddy123 is the one to watch, and it is winning exactly the queries a directory should win.

---

## Data issues surfaced by the audit

Found while verifying captures against the database. These are separate from the visibility
work and some are more urgent than it.

1. **`jkm_valid_to` may be a year early on at least one record.** Google reports Taska
   Ibunda's `Q/TI 0007/2024` as valid **4 Mar 2024 – 3 Mar 2029**. Our record says
   **2028-03-03**. JKM registrations run five years, which makes 2029 the arithmetically
   consistent date. **If this pattern is systematic, we would flag schools as expired twelve
   months before they are** — and wrongly telling a parent a licence has lapsed is the one
   error this product cannot afford. Audit `jkm_valid_to` against known start dates before
   leaning on expiry publicly.
2. **Registration numbers carry formatting artifacts.** `Q /TI 0007/2024` has a stray space.
   Any exact-match reconciliation against JKM will miss these.
3. **Coverage gap on the exact cohort where expiry matters.** Taska Ummi Nureen (`D/TI
   001/2021`) is in the JKM register and not in our database. Perplexity cited
   `ncdc.upsi.edu.my` — a UPSI-hosted national taska dataset — as another source we do not
   appear to have reconciled against.
4. **International fee coverage is 33%, not ~40%.** The query-set doc says "~109
   international schools with curated fee data". Measured 2026-08-06: **86 of 258
   ANTARABANGSA schools have `fee_min`** set. Block B1 (Q21–Q25, all fee queries) should be
   run with that expectation.
5. **22 Selangor taska in our database are already past `jkm_valid_to`.** That is a list of
   schools where our page states something no source in these 60 captures could.

---

## What this does and does not justify

**Justified by the data:**

- Lead with registration/`berdaftar` framing in titles and content — Finding 2.
- Treat Perplexity as the contestable surface for proximity — Finding 1.
- Fix the `jkm_valid_to` accuracy question before promoting expiry publicly — Data issue 1.
- Use Facebook groups as a fee-sourcing channel; revisit `fee_submissions` — Finding 4.

**Not justified by this audit, and explicitly not proposed:**

- New content production. Q11–Q14 lost to app blogs on questions
  `kpm-vs-jkm-tadika-taska.html` already answers, and that guide is 214 lines of static,
  crawlable, sitemap'd HTML. This is an authority and distribution problem, not a content
  volume problem. Writing more guides would be motion, not progress.
- Any spend against "near me" on ChatGPT or Google AI Mode — Finding 1.

**Open question for Fadly, not decided here:** the strongest asset in this audit is the
combination of registration number + computed expiry + no login. Nothing in these 60 answers
can produce it. Whether that becomes a headline on kawasan pages, an outreach hook, or a
partner pitch is a positioning decision, not an engineering one.

---

## Baseline for the 90-day re-run

Re-run Q1–Q20 on all three surfaces, incognito, same wording, ~2026-11-04. Compare against:

- Citation rate **0/60**
- Places-panel rate: CGPT 8/10, GAI 8/10, PPLX 0/10 on Q1–Q10
- kiddy123 at 8 cites, Anak2U at 3
- Zero surfaces aware of a public no-login registration lookup

From the same GSC window (2026-06-09 → 2026-07-24): school profiles 81.5% of clicks,
non-brand pages 4.8%, "near me" theme 40 queries / 112 clicks / 2,026 impressions.

**The delta is the product.**

---

## Addendum — Block B3 (partial, 2026-08-06)

Q31 and Q32 run on all three surfaces; Q33–Q35 not run. B3 was selected over the rest of
Block B because it is the only block where CariSchool is the *literal* answer — "is there a
directory", "best website to find tadika" — rather than a possible source about schools.

**Result: 0/6. Same as Block A, but a different failure.**

Block A tested whether we get pulled into an answer *about schools*. B3 tested whether these
systems know **CariSchool is a directory that exists**. They do not.

### Q31 — `is there a directory of registered preschools in Malaysia`

Google AI Mode answered with a named list of Malaysian preschool directories:
`kiddy123.com`, **`carehub.kiddocare.my`**, `schooladvisor.my`,
`educationdestinationmalaysia.com`, plus `gogokids.my`. Perplexity added `kidzenrol` and
`mycen.com`. ChatGPT stated the gap outright:

> *"there isn't an official government database that combines all of that information. Those
> are typically available through commercial education directories rather than government
> sources."*

The category is recognised. Four commercial directories are named. We are not among them.

**Note the second entry.** `carehub.kiddocare.my` is described by Google as *"over 1,000
verified and JKM/KPM-registered childcare centres"* — and Kiddocare is the same company whose
ad has been running pinned to the top of every CariSchool page since AdSense went live. We
hold 10,924 schools, are not named, and are currently paying screen space to route parents to
them. This is now the strongest argument for the advertiser-URL block.

### Q32 — `senarai penuh tadika berdaftar KPM Malaysia`

All three said the list does not exist:

- ChatGPT: *"tiada satu dokumen awam yang menyenaraikan semuanya"*
- Google AI Mode: *"Tiada satu dokumen statik tunggal"*
- Perplexity: opened with *"Berikut senarai penuh tadika berdaftar KPM"*, then produced no
  list and invented two portals — **"MySejahtera tadika"** and **"MyPendidik/PPIM"**, neither
  of which is a real KPM system. Second hallucination of the audit; both were Malay queries.

**We hold 7,913 KPM-coded schools.**

Google AI Mode's source [5] for this answer was a **Threads post** (`@lelalalaliyana`) —
a parent complaining that a school wasn't on the KPM register.
`panduan-permohonan-prasekolah-kpm.html` was built from a Threads demand signal. Same
platform, same conversation; the surface is reading the complaint, not the guide.

**One usable fact surfaced:** choosing a KPM-registered tadika qualifies parents for LHDN tax
relief of up to RM3,000. That is a concrete, checkable reason a parent cares about
registration status — a stronger framing than trust and safety alone, and it is not currently
used anywhere on the site.

### What B3 changes

Block A's finding was *these surfaces don't cite us for school queries*. B3 narrows it: **they
do not know we are a directory at all.** That is a naming, positioning and citation-source
problem — being referenced by things these systems already read — not an on-site content
problem. Q33–Q35 would restate it; they were skipped deliberately.

**Running total: 66 captures, 0 citations.**
