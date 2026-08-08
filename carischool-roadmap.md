# CariSchool — Roadmap (consolidated)

**Single source of truth. Last consolidated 2026-08-06.**

This replaces nine separate files: four versions of `carischool-roadmap.md`
(566/532/486/428 lines) and five loose `roadmap-addendum-*.md` files. Nothing was
dropped — the four roadmap versions were strictly cumulative (§0–§3 → +§5 → +§6 → +§7),
and every addendum is reproduced below in full.

**Why the addenda were confusing, concretely:** each was written against an earlier,
shorter roadmap and claimed a section number that the roadmap has since taken for
something else. All four collided:

| Addendum said | Roadmap's actual section | Now |
|---|---|---|
| §4 Monetization | §4 Live progress log | **§8** |
| §5 Education Hub | §5 Parent-matching quiz | **§10** |
| §6 Premium Video | §6 Premium retention | **§11** |
| §7 Coordinates | §7 Special needs | **§12** |

Section numbers below are authoritative. If an older file disagrees, this one wins.

## Contents

| § | Section | Status |
|---|---|---|
| 0 | What the audit found | historical baseline |
| 1 | Ranked moves (Moves 1–7) | active |
| 2 | The three things to stop doing | standing decisions |
| 3 | Operating cadence | active |
| 4 | Live progress log | active |
| 5 | Parent-matching quiz | parked — 100+ claimed schools w/ real data |
| 6 | Premium retention features | parked — claim volume |
| 7 | Special needs / Pendidikan Khas | data exists, not imported |
| 8 | Monetization (consumer revenue) | **partly superseded — see §13** |
| 9 | Stakeholder gaps (GSC-grounded, 2026-07-15) | **several items now shipped — see §13** |
| 10 | Education Hub concept | items 1 & 3 shipped; 2, 4, 5 parked |
| 11 | Premium "Campus Tour" video (60–90s) | parked — Premium sales ramp |
| 12 | School coordinates backfill | **done — items 1 & 2 shipped; 3 & 4 open** |
| 13 | Status corrections as of 2026-08-06 | read this before acting on §8–§12 |

---


Prepared July 2026. Basis: full read of the 12-page codebase (including admin.html's tool
inventory, which is the most honest record of where your time actually goes), memory of your
working patterns, and the product surface itself. I cannot see your analytics, bank account,
or calendar — every place I'm inferring instead of observing is marked `ASSUMED`. Correct the
assumptions and the ranking may shift one or two places; it won't invert.

---

## 0. What the audit found

**The business as built:** a two-sided directory. Parents get free search/compare/contact.
Schools get: free claim → free profile editing → premium tier (photos, announcements, video,
testimonials, badge) → free job posting (claim-gated). Revenue surfaces visible in code:
AdSense (statistik.html), and Premium — which has **no public price, no payment mechanism,
and a fulfillment path of "our team will contact you in 1-2 business days."**

**Where your time goes.** admin.html is a confession. It contains, beyond the necessary
moderation queues (claims, new schools, jobs, gallery), SIX hand-curation tools: fee-link
curation, website browser, Facebook page browser, open-day events entry, JKM dual-license
matching, and a WhatsApp outreach tracker. Each of these is you, personally, doing per-school
data entry against a database of ~11,000+ rows. That is O(n) founder time against an n that
only grows. Meanwhile the promised SLAs (claims 2–5 days, jobs 1–2 days) put you on a
permanent moderation treadmill, and a parallel track of Figma design-system work duplicates a
design system that already exists — in the HTML.

**The three structural problems, plainly:**

1. **Revenue is gated on your calendar.** Every premium ringgit requires a manual sales
   conversation, and the buyer can't even see a price to say yes to.
2. **Your growth engine exists but isn't industrialized.** The pieces are all built — real
   per-school engagement stats, an outreach tracker, a claim funnel with a brilliant
   engagement teaser — but they run on you manually picking schools and typing messages.
3. **You're spending scarce hours on assets no customer touches** (Figma libraries, one-by-one
   data curation) while the assets customers DO touch carry stale "2025" copy in July 2026.

**Key assumptions this roadmap rests on:**
- `ASSUMED:` traffic is meaningfully nonzero (the engagement-teaser and view-counter features
  only make sense if schools see real numbers). Reversal cost if wrong: moves 1–3 reorder
  below move 6.
- `ASSUMED:` Premium is currently sold at low volume (single digits/month) at an ad-hoc or
  unset price. If you already have a working price point, Move 1 becomes "publish and
  self-serve it" and gets even cheaper.
- `ASSUMED:` you are solo or near-solo, and "execution capacity" means you + Claude.

---

## 1. Ranked moves — highest expected return first

Scoring logic: (revenue or hours unlocked) × (probability it works) ÷ (cost to ship with a
model doing the labor). Everything here is executable by a less capable model **if** it's
handed the brief written under each move — the briefs assume the model has your CLAUDE.md and
the three skills.

---

### MOVE 1 — Put a public price on Premium and let schools pay without talking to you

**Why this is #1.** You have a funnel that already generates purchase intent: parents view a
profile → school sees the engagement teaser ("47 parents viewed your profile") → claims →
hits the premium wall in kemaskini → clicks "Mohon Naik Taraf Premium." At that exact moment
of maximum intent, the product's answer is *"we will contact you in 1-2 business days."* That
is where deals go to die, and where the ones that survive consume your hours. Publishing a
price and a payment link converts intent while it's hot, makes every future move (outreach,
jobs) monetizable, and — critically — starts teaching you what schools will actually pay,
which you currently cannot learn because there's no price to reject.

**Exact steps:**
1. Set a launch price as a hypothesis, not a commitment: **RM49/month or RM399/year**
   (annual pushed as default — schools budget annually and churn less). You will adjust
   after 20 paid conversations; the point is to have A number, not the right number.
2. Create a payment path with zero backend work: a Malaysian payment-link provider
   (toyyibPay / Billplz / Stripe Payment Links — pick whichever you can open an account with
   this week). One link per plan. Payment reference = school name + claim code.
3. Build a **premium.html** page in the house style: what's included (the feature list
   already written in kemaskini's locked panel), the price, an FAQ, and the pay button.
   Bilingual, indexable.
4. Rewire the two premium touchpoints: kemaskini's locked panel and claim.html's plan
   selector now show the price and link to premium.html / the payment link, replacing
   "we'll contact you." Keep `premium_requested_at` as a fallback "talk to us" option for
   schools that won't pay online.
5. Fulfillment stays manual for now: payment notification → you flip `is_premium` in admin
   (add a one-click "activate premium" button next to the existing approve buttons) → the
   existing `/api/send-claim-email` pattern sends a welcome email. Manual fulfillment after
   automatic payment is fine at your volume; the bottleneck was the sale, not the flip.
6. Announce it once to every already-claimed school via your outreach channel (Move 3's
   machinery), with their real engagement numbers in the message.

**Done looks like:** a school can go from claimed → paid → premium-active without you
initiating contact; premium.html live and linked from both touchpoints; at least one
end-to-end test payment completed; price visible in three places (premium.html, kemaskini
locked panel, claim step 3).

**Brief for a weaker model:** *"Read CLAUDE.md and all three skills. Build premium.html using
the carischool-page-builder skeleton: hero (gold variant like kemaskini), feature cards
mirroring kemaskini's locked-panel list, a pricing card (RM399/tahun default, RM49/bulan
secondary), FAQ box, and a pay button linking to [PAYMENT_LINK]. Fully bilingual per the i18n
skill; run the audit script. Then edit kemaskini.html's `lockedPanel` and claim.html's premium
plan card to show the price and link to /premium.html — minimal diffs, keep the
premium_requested_at button as a secondary 'Hubungi kami' option. Then add to admin.html's
claims tab an 'Aktifkan Premium' button per school that sets is_premium=true and sends the
approved-type email via the existing /api/send-claim-email pattern. Do NOT invent payment
webhook integration; fulfillment is manual. Escalate if you need any schema change."*

---

### MOVE 2 — A weekly numbers snapshot, so every other move stops being blind

**Why #2 (and why not #1):** it produces no revenue itself, but it's a day of work and every
subsequent decision — price level, outreach targeting, what to kill — depends on numbers you
currently reconstruct by feel. The data already exists in Supabase (`school_views`,
`school_whatsapp_clicks`, `claim_submissions`, `job_postings`, timestamps everywhere) plus GA.
You are one query file away from knowing your business.

**Exact steps:**
1. Define the eight numbers that matter, weekly: new claims submitted / approved; premium
   requests / activations; jobs posted / active; total profile views and WA clicks (delta);
   top 10 schools by WA clicks that are NOT yet claimed (this list feeds Move 3 directly).
2. Implement as a new tab in admin.html ("📊 Mingguan") that runs the count queries
   client-side — no infrastructure, same pattern as the existing stats loaders. Include a
   "copy as text" button so the snapshot can be pasted into a note or a Claude conversation.
3. Every Monday: open the tab, copy, paste into your working doc. Decisions reference it.

**Done looks like:** one admin tab, loads in under 5 seconds, eight numbers plus the
unclaimed-high-engagement list, copy button works. You've recorded at least two consecutive
weeks.

**Brief for a weaker model:** *"Read CLAUDE.md §2.4 and the carischool-data-layer skill. Add a
tab to admin.html following the existing switchTab pattern, named 'Mingguan'. It computes:
counts of claim_submissions and job_postings created in the last 7 days (created_at >= ISO of
now-7d), split by status; count of schools where premium_requested_at is in the last 7 days;
count where is_premium=true (total); sum-style totals from school_views and
school_whatsapp_clicks (fetch all rows with the range-loop pattern — these tables are small);
and a list of the top 10 schools by click_count joined to schools where is_claimed=false,
rendered with name, state, view/click counts, and a link to their profile. Add a 'Salin'
button that assembles a plain-text summary and uses navigator.clipboard.writeText + the
existing showToast. Use exact-count head:true queries everywhere; every schools read that
feeds public-facing logic filters is_active but this admin view may include inactive rows —
label them. Minimal diff to the rest of admin.html."*

---

### MOVE 3 — Industrialize claim outreach: turn the tracker into an engine

**Why:** claims are the top of your entire monetization funnel (claim → premium, claim → job
post), and your single proven conversion asset is showing a school its own real numbers — you
already built that insight into the claim page's engagement teaser. The WhatsApp outreach
tracker in admin proves you do this manually. The upgrade is not a new idea; it's volume and
selection: let the database pick the targets and let a model write the messages, so your only
manual act is pressing send in WhatsApp (which, realistically, must stay manual — automated
WA blasts risk your number).

**Exact steps:**
1. Weekly target list = Move 2's "unclaimed, high engagement" query, extended: top 30
   unclaimed schools by (whatsapp_clicks×3 + views) with a phone number on record, excluding
   anyone already in the outreach tracker within 60 days.
2. Message generation: a model drafts each message from a fixed bilingual template —
   school name, actual view/click counts, the claim link with `?id=` prefill (the deep-link
   auto-select already works in claim.html), and after Move 1, the premium price. Personal
   tone, ≤3 sentences, Malay.
3. Batch UX: extend the existing outreach tool so each target row shows the drafted message
   with a "copy message + copy wa.me link" pair, and logs the send with one tap (the
   copyOutreachLink pattern already exists — extend, don't rebuild).
4. Cadence: 30 sends every Monday, 30 minutes of your time. Track reply→claim conversion in
   the tracker; the weekly snapshot reports it.

**Done looks like:** Monday routine takes ≤30 minutes end-to-end; the tracker shows sends,
and within four weeks you can state your outreach→claim conversion rate as a number.

**Brief for a weaker model:** *"Read the carischool-data-layer skill. Extend admin.html's
outreach tool: add a 'Jana Sasaran Minggu Ini' button that queries the top 30 schools by
engagement (school_whatsapp_clicks and school_views joined to schools, is_claimed=false,
phone not null), excluding school_ids present in the outreach records from the last 60 days.
For each, render a card with the school's stats and a pre-drafted Malay message using this
template: [TEMPLATE — includes name, counts, claim deep-link /claim.html?id={id}, price line].
Buttons: copy message, open wa.me with the message prefilled (reuse the existing phone
sanitization `replace(/\\D/g,'')`), and 'log sent' writing to the existing outreach table via
the existing pattern. No automated sending of any kind. Escalate if the outreach table schema
doesn't support a sent-date query."*

---

### MOVE 4 — Replace hand-curation with a batch enrichment pipeline (fees first)

**Why:** your own UI copy states fee information is "salah satu maklumat yang paling dicari" —
the most-searched data — and fee coverage is also the compare page's weakest column
(`Tiada maklumat`). Yet enrichment currently happens through admin tools where you browse
websites and Facebook pages one school at a time. The move: stop being the crawler. A model
can process schools in batches of hundreds — searching for each school's site/FB, extracting
fee ranges, hours, and links — and write candidates into a staging structure that you approve
in bulk. Your role changes from *doing* the research to *reviewing* it, a 10–50× throughput
change on your single largest recurring time sink.

**Exact steps:**
1. Prioritize the batch: claimed schools first (they'll notice and appreciate it), then
   unclaimed schools in your top-5 traffic states, ordered by views.
2. Define the enrichment record: `fee_min, fee_max, fee_source_url, website, facebook_url,
   operating_hours` + confidence + evidence snippet. **This needs one new staging table —
   a deliberate schema addition, decide it once** (per CLAUDE.md §5.1 this is exactly the
   kind of thing to decide consciously, not have a model improvise).
3. Run enrichment as supervised model sessions: 100–200 schools per session, web search per
   school, strict output format, "no data" is an acceptable answer, guessing is not.
4. Add an admin review queue tab: approve/edit/reject per row; approve writes to the live
   schools row. Repurpose the existing fee-link and website browser tools into this queue —
   their UI patterns are 80% of what's needed.
5. Add the parent-side backstop: a small "Lapor yuran / maklumat" link on school.html that
   inserts into the same staging table, so the crowd maintains what the batch seeded.

**Done looks like:** fee coverage on your top-500-by-views schools goes from current level to
>60%; your weekly curation time drops to a review session; the compare page stops being a
column of "Tiada maklumat" for popular schools.

**Brief for a weaker model (two briefs):** *(a) Enrichment session: "For each school in the
attached list (name, address, state, website if known): search the web for its official
website and Facebook page; extract monthly fee range in RM, operating hours, and the source
URL. Output one JSON object per school with fields [schema], confidence high/medium/low, and
a ≤20-word evidence note. If you cannot verify from a source, output nulls — never estimate a
fee. Malaysian context: tadika fees typically RM100–1500/mo; anything outside that range,
re-check before reporting."* (b) Review queue: "Read the data-layer skill. Build an admin tab
listing rows from [staging table] with approve/edit/reject; approve updates the schools row
(only the enrichment columns, plus updated_at) and marks the staging row done. Follow the
existing fee-link tool's UI. Escalate before creating the table — propose the exact columns."*

---

### MOVE 5 — Make the jobs board earn: featured listings + turn it into the claim wedge

**Why:** teacher recruitment is the most urgent, most recurring pain a tadika operator has —
far more urgent than "get more enrollments someday." Job posting is already claim-gated
(smart: it forces claims), free, and admin-approved. Two upgrades: (a) **sell urgency** — a
"Featured/Segera" job slot (pinned to top, highlighted card, extended duration) at ~RM30–50
per posting, payment-link based like Move 1; (b) **advertise the free tier louder** as your
claim-acquisition hook — "Siarkan jawatan percuma" is a stronger outreach opener than "claim
your profile," because it solves a bleeding-now problem. Don't paywall basic postings yet;
volume and habit first, monetize the top of the list.

**Exact steps:**
1. Add `is_featured` handling to jobs.html rendering (featured first, gold-accent card
   variant per the design system) and a "🌟 Jadikan Featured — RM39" upsell on post-job's
   success panel linking to a payment link with the job reference.
2. Fulfillment manual: payment in → admin's job tool gets a "feature" toggle (the tool
   already has approve/reject/expire — one more action).
3. Rewrite Move 3's outreach template variant B for schools likely hiring: lead with the free
   job board, not the profile claim (claiming happens as a forced step anyway).
4. Cross-promote: school.html profiles of claimed schools show their active jobs; jobs.html
   already has the CTA strip — measure it in the weekly snapshot (jobs posted/week).

**Done looks like:** featured jobs render distinctly and first; a school can buy featured
without talking to you; outreach template B in rotation; jobs/week appears in the snapshot.

**Brief for a weaker model:** *"Read CLAUDE.md and both page-builder and data-layer skills.
(1) jobs.html: sort featured jobs first (order by is_featured desc, created_at desc — confirm
column with me first per escalation rules), give featured cards a gold border
(--yellow/--yl) and a '🌟 Featured' tag, bilingual. (2) post-job.html panel3: add an upsell
card in house style linking to [PAYMENT_LINK] with the position title in the reference field
note. (3) admin.html job tool: add a feature/unfeature toggle following the existing
approveJob pattern. Minimal diffs; run the i18n audit on both public pages."*

---

### MOVE 6 — Freshness & SEO integrity sprint (the cheap compounding move)

**Why:** it is July 2026 and the site says "Tadika Terbaik Selangor **2025**", "Panduan Yuran
**2025**", "© **2025**" in footers, article cards, titles, and per-state SEO copy. Year-stamped
titles are a real CTR factor for exactly the queries you target ("tadika terbaik selangor
2026"), and stale years signal an unmaintained directory — poison for a trust product. While
in there: the neighbourhood-chip system (≥5 schools threshold) and state pages are your
programmatic SEO engine; extend it with FAQPage JSON-LD on kawasan (the FAQ content already
exists as plain HTML) and JobPosting JSON-LD on jobs.html (Google Jobs surface — free
distribution for the jobs wedge).

**Exact steps:**
1. Sweep every page for `2025` and year-stamped copy; update to 2026 (or better: remove years
   from evergreen copy and keep them only in titles, updated annually — decide once).
2. Add FAQPage structured data to kawasan.html generated from the existing t('faqQ*/faqA*')
   strings; add JobPosting structured data to jobs.html per rendered job.
3. Verify canonical/OG integrity across the SEO pages (school, state, kawasan, statistik) —
   the machinery exists; this is a checklist pass.
4. Recurring: put "annual year sweep" in January's task list.

**Done looks like:** zero stale "2025" strings site-wide (grep-verifiable); both structured-
data types validate in Google's Rich Results test; the sweep is documented as a repeatable
model task.

**Brief for a weaker model:** *"Grep all HTML files for '2025'. For each hit, classify:
copyright line (update to 2026), SEO title/heading (update to 2026), body copy (update or
de-year — flag ambiguous ones instead of guessing). Produce the full diff. Then add a
<script type=application/ld+json> FAQPage block to kawasan.html built at render time from the
existing FAQ translation keys, and JobPosting JSON-LD per job in jobs.html's renderJobs
(fields: title, datePosted from created_at, validThrough from expires_at, hiringOrganization
from school name, jobLocation from district||town + state, baseSalary from salary_min/max
when present). Follow CLAUDE.md §2.5; minimal diffs; escalate on nothing here except genuinely
ambiguous copy."*

---

### MOVE 7 — Start the parent asset: a subscribe hook (do last, but start)

**Why last but on the list:** everything above monetizes the school side. Long-term, your
most defensible asset is a *reachable parent audience* — that's what makes "Featured",
open-day promotion, and enrollment campaigns worth real money to schools. Parents currently
visit once and vanish. The cheapest viable start in your market is a **WhatsApp Channel**
(zero build) promoted from the site, plus a one-field "alert me about [town]" capture that
writes to a table for later. Do not build notification infrastructure yet; build the list.

**Exact steps:** create the WhatsApp Channel; add a tasteful follow strip (house CTA-strip
style) to index/kawasan/school; add an optional email/WhatsApp capture on kawasan ("Beritahu
saya bila ada pendaftaran dibuka di {town}") writing to a staging table; report list size in
the weekly snapshot; post to the channel weekly (new schools enrolling, open days — content
your events tool already collects).

**Done looks like:** channel live, follow strip on three pages, capture table filling,
list size a weekly metric.

**Brief for a weaker model:** *"Add a follow-strip component (copy the cta-strip recipe from
the page-builder skill, teal variant) to index.html, kawasan.html, and school.html linking to
[CHANNEL_URL], bilingual. On kawasan.html add a single-field capture form (contact +
implicit town from the page) inserting into [table — escalate first to define it, status
'pending', no verification flow yet]. reCAPTCHA per the existing pattern. Minimal diffs."*

---

## 2. The three things to stop doing — reasoning in full

### STOP #1 — Stop building the Figma design system

The Figma token library, School Card component, and comparison-table components are a
duplicate source of truth for a design system that already exists in its final, executable
form: the `:root` blocks, component CSS, and markup idioms in your HTML — now additionally
codified in CLAUDE.md and the page-builder skill, which is the format your actual "design
implementers" (models) consume. Design systems earn their cost under specific conditions:
multiple humans designing in parallel, designer→developer handoff, or a component count too
large to hold in one head. None of those conditions exists here. You are one person, there is
no handoff (you go idea → HTML directly, usually via a model that reads code, not Figma), and
the component inventory is perhaps fifteen items. Every hour in Figma buys you an artifact
that must now be *kept in sync* with the HTML forever — you've created a maintenance
liability, not leverage. The counterfactual hour spent on Move 1 or Move 3 produces revenue
or claims. The honest test: in the last month, name one shipped page change where the Figma
file was the input rather than a redrawing of output that already existed. If you can't, the
Figma work is documentation theater — comfortable, visually satisfying, and strategically
free-riding on time your funnel needs. **Exception preserved:** if you ever hire a designer
or sell the design as part of the product, resurrect it then, from the HTML, in a day.

### STOP #2 — Stop hand-curating data one school at a time

The fee-link tool, website browser, Facebook browser, open-day entry, and JKM matcher share
one property: they scale linearly with *your* attention across a ~11,000-row dataset that
grows. Grant the premise — the data matters enormously; fees especially are, by your own
product copy, the most-searched information, and data completeness is the moat of a
directory. The error isn't caring about the data; it's the production function. At even two
minutes per school you are looking at hundreds of hours to move coverage meaningfully, and
the data *decays* — fees change yearly, so hand-curation isn't a project, it's a permanent
job you've assigned to the least scalable resource in the company: you. Three substitutes
already exist or are one move away: (a) batch model enrichment (Move 4) does the same
research at two orders of magnitude more throughput with you as reviewer, not researcher;
(b) schools self-report — you already made fees *wajib* at claim time, so every claim Move 3
generates is a data-entry event you don't perform; (c) parents can report, given a button.
Your admin tools shouldn't die — they should be demoted from *browsing instruments* to
*review queues*. The rule going forward: **you may approve data; you may no longer go find
it.** Any task that has you opening a school's Facebook page yourself is a task to hand to a
batch run.

### STOP #3 — Stop selling Premium manually, without a public price

The current flow — locked panel → "Mohon Naik Taraf" → `premium_requested_at` → "our team
will contact you within 1-2 business days" — has three compounding costs. **First, it
converts your scarcest resource into COGS:** every sale requires a conversation, so revenue
is capped by your calendar, and the marginal sale never gets cheaper. **Second, it kills
conversion at the moment of peak intent:** the school that just saw its engagement numbers
and clicked upgrade is maximally ready *now*; a 1–2 day delay hands the decision back to
inertia, and a fraction of that intent never returns — this is the best-documented failure
mode in self-serve conversion, and you've built it in deliberately. **Third — and least
obvious — it prevents learning:** without a posted price there are no price rejections, and
without rejections you cannot discover willingness-to-pay; every "we'll contact you"
conversation anchors on whatever you improvise, so a year from now you still won't know
whether Premium clears at RM29 or RM99. The fear behind manual sales is usually "the price
might be wrong" or "schools need hand-holding." Both are answered by the design in Move 1:
publish a *hypothesis* price with a payment link, keep the "hubungi kami" path as the
secondary option for the hand-holding segment, and let twenty transactions tell you what a
year of calls never will. Stopping manual-first sales is not stopping sales conversations —
it's refusing to make a conversation the *precondition* for money.

---

## 3. Operating cadence to run this roadmap

- **Weekly (Monday, ≤1.5h):** snapshot (Move 2) → outreach batch (Move 3) → moderation queue
  clear → one review session of enrichment queue (Move 4, once live).
- **Model-executed, you-reviewed:** every "brief for a weaker model" above is designed to run
  under your CLAUDE.md escalation rules — expect a small number of legitimate escalations
  (each new table, the payment links, ambiguous copy), which is the system working.
- **Sequencing:** Moves 1+2 in week one (both are ~a day of model work each), Move 3 week
  two, Move 6 whenever a gap appears (it's a half-day), Moves 4–5 weeks three–five, Move 7
  when the school-side loop is demonstrably running.
- **Kill criteria:** any move that hasn't produced its "done looks like" within two working
  sessions gets escalated to a decision, not silently extended — the same discipline you
  demand from models applies to the roadmap.

---

## 4. Live progress log (updated as moves land)

- **Move 2 (weekly snapshot): shipped.** admin.html's Mingguan tab is live. First real week's
  numbers: 10,320 total views, 145 total WhatsApp clicks, 48 schools contacted, 10 clicked —
  and the funnel's first-ever real conversion landed (Little Dreamers Child Care Centre,
  Kuala Lumpur) within days of the tab going live. Two silent-failure bugs found and fixed in
  the process (see learnings-log.md, CLAUDE.md M18/M19).
- **Move 1 (pricing): deliberately deferred, not abandoned.** Claimed schools have grown to
  a handful (Little Dreamers' branches), but all via the founding-Premium-free offer — nobody
  has hit a real *paid* wall yet, so there's still no price to learn from rejecting. Revisit
  once a school actually needs to pay to unlock Premium, not a founding-slot freebie — that's
  the real trigger, not a calendar date or a raw claim count.
- **Move 3 (industrialize outreach): shipped.** admin.html's outreach tool now has a
  "🎯 Jana Sasaran Minggu Ini" button generating the top 30 unclaimed/high-engagement/
  not-recently-contacted schools with a pre-drafted Malay message, copy/WhatsApp/log-sent
  actions per card. Uses the founding-Premium-free offer as the incentive line since Move 1
  hasn't shipped a real price yet — revisit the template once it does.
- **Move 6 (freshness & SEO integrity sprint): shipped.** The 2025→2026 sweep landed earlier
  (index.html, school.html, state.html, statistik.html). FAQPage structured data added to
  kawasan.html, built from the same `t('faqQ*'/'faqA*')` calls as the visible FAQ box so the
  two can never drift apart. JobPosting structured data added to jobs.html per rendered job —
  real upside now, not hypothetical: Little Dreamers' actual live postings (Guru Taska, Guru
  Tadika) get this markup immediately. Tested against real edge cases (missing salary, missing
  requirements, an employment-type string outside schema.org's enum) before shipping — all
  degrade to an omitted field, never a guessed or null value; `description` (required by
  schema.org) always composes a fallback so no posting ships with invalid structured data.

**Added trigger condition (external SEO audit review, 2026-07-10):** the individual
school-page zero-click finding (128 pages ranking top-10, 0 clicks, likely due to
`school.html`'s generic default `<title>`/meta before JS updates it) is a real, evidenced gap
— but the full fix (Vercel Edge Middleware injecting real meta server-side) is genuine new
infrastructure, not a patch, and was deliberately deferred as an accepted tradeoff rather than
built immediately. **Revisit once both are true:** (a) claimed-school count has grown
meaningfully past the current handful, AND (b) organic search traffic has grown enough that
this long-tail slice is worth more in absolute clicks than it costs in new infrastructure risk
and maintenance. Cheap interim mitigation available any time at zero cost: manually request
re-indexing in Search Console for the highest-impression zero-click URLs.

---

## 5. Parent-matching quiz — investigated, genuinely blocked, not by what it first looked like

**Finding (2026-07-10):** a "match my child to a school" quiz (age, budget, curriculum,
priorities → shortlist) was proposed after seeing the pattern validated by real competitors
(Skipsies' "Preschool Personality Match", CareForKids.com.au's resource-first menu). Checked
real data coverage across all 10,726 active schools before building anything:

| Field | Schools with data | Coverage |
|---|---|---|
| Area (district/town) | 10,706 | 99.8% |
| Operating hours | 4,337 | 40.4% |
| Age range | 68 | 0.6% |
| Curriculum | 475 | 4.4% |
| Languages | 471 | 4.4% |
| Fee (min/max) | 6 | 0.06% |

**Conclusion: this was never really an age-format problem — it's a claim-volume problem.**
Fee, age, curriculum, and languages only get filled in via `claim.html`/`kemaskini.html`, and
only a handful of schools have ever claimed. Standardizing the age field (structured min/max
instead of free text) is still worth doing going forward, so new claims start clean — but it
would only clean up ~68 existing rows out of 10,726, and doesn't make the quiz meaningfully
useful on its own. The one field that's actually reliable (area) is exactly what the existing
search bar already filters by.

**Trigger condition — revisit the quiz once 100+ claimed schools have real fee + age +
curriculum data filled in.** Not a calendar date; a measurable readiness bar. Below that
threshold, a quiz asking "what's your budget?" would have almost nothing to actually match
against for the vast majority of users, and would undersell the product rather than help it.

**Also parked, much further out — the "adjacent services marketplace" idea:** CareForKids.com.au's
"Parent Playbook" is a directory of professional parent-services providers (sleep consultants,
lactation consultants, family lawyers, paediatricians) — a genuinely smart adjacent-expansion
pattern, but structurally it's a second, separate directory business (new categories, new
verification flow, no existing KPM/JKM-equivalent registry to crawl against) — comparable in
scope to the original build, not a menu addition. Worth remembering as a long-horizon growth
direction once the core preschool directory has real density, not before.

**Menu structure idea, parked until there's real content to put in it:** a two-tab
"Untuk Ibu Bapa / Untuk Sekolah" menu (matching CareForKids.com.au's structure) is a clean,
buildable-later fix for the current flat menu — but building the shell before the quiz,
guide content, or other real substance exists would just be an empty interaction. The mobile
hamburger menu was removed entirely on 2026-07-10 for exactly this reason: with only one
genuinely menu-only link (Compare) at the time, the button cost more attention than it
returned. Revisit once there's enough real content (quiz, guide, or equivalent) to justify
reintroducing it.

---

## 6. Premium retention features — parked until claim volume justifies a retention strategy

**Trigger condition, not a date:** revisit once there are enough Premium-eligible claimed
schools that "keep them subscribed" is a real, distinct problem from "get more schools to
claim in the first place." Building retention machinery for a handful of founding-free
accounts (current state) solves a problem that doesn't exist yet — every hour here right now
would come directly out of Move 3's outreach work, which is still the actual bottleneck.

**Ranked shortlist, for whenever that trigger hits:**

1. **Automated JKM/KPM renewal reminders (for the school itself).** Genuinely unique to
   CariSchool — no competitor (Kiddy123, or global childcare-CRM platforms like Brightwheel)
   tracks the combined KPM+JKM registry with expiry dates the way this project now does.
   Cheap to build: mostly repurposing the expiry-detection logic already shipped in admin.html
   (2026-07-12), adding a scheduled email/WhatsApp trigger instead of a manual admin list.
   Real, already-proven demand: 43 schools were found sitting silently expired the same night
   this was scoped.
2. **Performance dashboard for the school ("who's interested," not just a raw count).**
   LinkedIn's actual growth mechanic — curiosity about *who* engaged, not a flat number.
   Cheap: the underlying data (`school_views`, `school_whatsapp_clicks`) already exists, this
   is a new UI surface on it, e.g. "3 parents from Petaling Jaya viewed your profile this
   week."
3. **Profile Completeness Score tied to real search ranking**, not just a vanity bar —
   LinkedIn's "profile strength" pattern, but with actual teeth: a more complete profile
   should genuinely outrank a thinner one. Built on data already collected via kemaskini.html.
   Aligned incentive: improves the school's own conversion AND the whole platform's data
   quality from the same feature.
4. **Seasonal "Boost," priced separately from the recurring subscription** — Yelp/Google
   Business Profile's paid-boost model, adapted to Malaysian school-intake timing. Captures
   revenue from schools unwilling to commit to a full year but willing to pay for visibility
   right before a specific intake opens. Complements Move 1's subscription, doesn't replace it.
5. **Lightweight parent inquiry form** (name, child's age, preferred start) in place of a cold
   WhatsApp message. Honest framing: this is a mature, saturated pattern in the *global*
   childcare-CRM category (Brightwheel, IntelliKid Systems, LineLeader all have full versions)
   — not novel in general, but a small independent Malaysian tadika isn't a buyer for those
   platforms. A right-sized version bundled into an existing CariSchool subscription is a
   legitimate "first for *this* underserved segment" pitch, not a "first ever" one.

**Bigger future bet, not scoped, needs a real prerequisite first:** letting a claimed school
message parents who favorited them (Mailchimp-style, built on the existing `cs_favs` system).
Genuinely powerful, but favorites are currently anonymous localStorage, not tied to any
parent identity/opt-in — that's a real prerequisite (parent accounts) to build first, not
something to scope until it exists.

---

## 7. Special Needs / Sekolah Pendidikan Khas — real data now exists, not yet imported

**Investigated 2026-07-13.** The original menu-idea note flagged this as needing real data
support verified before promising anything — now checked properly, on both sides:

**Why this data never showed up in the existing tadika crawl:** special needs early education
in Malaysia splits across two separate regulatory pathways that don't share a registry with
each other or with the regular tadika system:
- **TASKA OKU** (ages 0–4) — still under JKM, a *subset* of the same taska registration
  system already crawled, not a separate department.
- **Sekolah Pendidikan Khas / PPKI** (ages 4+) — under MOE, but administered by the **Special
  Education Division**, a genuinely different division from the Private Education Division
  that governs regular tadika. This is the actual reason it was invisible in the existing
  crawl — it was never in that registry to begin with, not a gap in the crawler.

**Real data collected, saved, not yet imported:** see `special-needs-schools-data.md` —
20 Sekolah Pendidikan Khas (manually sourced from an official MOE listing by Fadly) plus 5
TASKA OKU centres confirmed to already exist inside the live `schools` table (found by name
pattern — `jkm_category` tracks operating setting, not disability focus, so there's no clean
field for this; the 5 is a floor, not a confirmed complete count).

**Honest scope assessment, unchanged from the original caution:** 20 + 5 (floor) is still a
small number relative to the ~11,000-school core directory. Worth preserving the data now
since it was genuinely hard to find and would be expensive to re-collect — but importing it
into a live, publicly-searchable category is still a real schema/categorization decision
(new `category` value? a new boolean flag alongside existing categories? Sekolah Pendidikan
Khas' school-code format doesn't match the existing `school_code` pattern, so an importer
needs to handle that deliberately, not assume it validates the same way) that deserves the
same escalate-before-building treatment as any other new table or category, not a silent
add-on to an unrelated task. **Trigger to actually build this: a specific parent or school
asks for it directly** — not before, given the segment's real size is still unconfirmed.


---


## 8. Monetization — consumer revenue streams

*Originally `roadmap-addendum-monetization.md`, filed as ""; renumbered 8 on consolidation — its original number collided with an existing roadmap section.*

Existing: quarterly security/anti-scraping audits, AdSense stays parked until traffic +
claimed-school count justify it.

### New: Consumer Revenue Streams (added 2026-07-14)

**Phase 0 — start now, no audience/data dependency:**
- Evergreen guide content (enrollment checklist, KSPK vs Montessori vs play-based
  explainer). SEO content takes months to rank — starting now means it's already
  indexed by the time the milestone trigger below is met. First piece shipped:
  "The Ultimate Malaysia Preschool Enrollment Guide & Checklist."
- Quiet affiliate links on regional pages (e.g. small "parents in this area also look
  at" strip under the school list on a "Tadika in [Area]" page) — 5 candidate
  categories: educational toys/Montessori materials, bilingual children's books, kids
  education savings/takaful plans, home-learning subscriptions, parenting books.
  Shopee/Lazada affiliate + Involve Asia (SEA-focused network) as the two easiest
  starting programs. Near-zero build/maintenance cost; revenue will be small until
  traffic grows, but there's no reason to wait to switch it on.

**Phase 1 — same trigger as AdSense (traffic + claimed-school count):**
- Brand partnerships / sponsored newsletter spots (milk brands, enrichment centers,
  kids insurance/takaful, educational toy companies). Not worth approaching until
  there's a real traffic number to show — a pitch deck with near-zero pageviews won't
  close.
- Paid digital products beyond the free guide (e.g. a gated PDF checklist via
  email-capture) — can follow once the free guide is proven to convert/rank.

**Explicitly NOT doing (data blocked, not effort blocked):**
- Fee calculator / comparison matrix — blocked on 0% fee coverage across the DB.
  This is the same shape as the parent-matching quiz already parked in §2 pending
  100+ claimed schools with real fee/age/curriculum data — same trigger applies here,
  don't re-open it separately.
- "Compare real schools by curriculum" tooling — only ~4% of schools have curriculum
  data captured; fine as a generic educational guide (see Phase 0), not as a live
  comparison tool against the actual listings yet.

**Lower-effort alternative to the fee calculator, already on the roadmap:** the
placeholder map view in §2 ("decide fate of placeholder map view") — map-based, no
fee data required, already an open item. Worth prioritizing over a new paid tool.

### 4-week content funnel (once Phase 0 content is live)
Week 1: "How to Choose a Preschool in Malaysia (KPM vs JKM Explained)" — top-of-funnel,
no affiliate push. Week 2: "KSPK vs Montessori vs Play-Based" — light affiliate
mentions (books per method). Week 3: Enrollment checklist (published) — highest
affiliate density (school bag, labels, routine tools). Week 4: "What to Pack for Day
One" — seasonal, timed to actual enrollment season.


---


## 9. Stakeholder gaps & enhancements (data-grounded, 2026-07-15)

*Originally `roadmap-addendum-2-stakeholder-gaps.md`. Its internal §1–§6 are renumbered 9.1–9.6 to avoid clashing with the roadmap's own numbering. **Several items here have since shipped — see §13 before acting.***

Prepared 2026-07-15. Basis: the GSC export (7 days, 2026-07-06 → 07-13), the new files
(vercel.json, sitemap.js, send-claim-email.js, monetization addendum), and the live pages.
This slots into carischool-roadmap.md; it does not replace it. Standing decisions are
respected as-is: premium pricing deferred to the 100-founding-school threshold, crawl paused
pending its three conditions, JKM review backlog non-urgent, panduan.html waits for ~8 guides.

---

### 9.1 What the data actually says (first real numbers)

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

### 9.2 Per-stakeholder gaps and the move that fills each

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

### 9.3 Monetization, tailored to what the data permits

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

### 9.4 Mistakes to fix and codify (routed per the learning law)

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

### 9.5 Skill proposal (one, not three — the others aren't earned yet)

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

### 9.6 Execution order (all weaker-model-safe, briefs per CLAUDE.md rules)

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


---


## 10. Education Hub concept (parked, staged triggers)

*Originally `roadmap-addendum-3-education-hub.md`, filed as ""; renumbered 10 on consolidation — its original number collided with an existing roadmap section.*

Proposed 2026-07-15, inspired by Claude for Teachers launch. Core idea: evolve from
"school directory" toward "trusted early-childhood-education authority" — Learn (philosophy
explainers: Montessori/Reggio/IB/Cambridge/Homeschooling) → Resources (books/toys/activities
by age band) → Schools (existing) → Parent Guides (existing + expanding). Explicitly a
recommendation model, not a shop: curate 5-10 items with why/age/skills-developed/tips,
never a 500-item catalog. This principle is already how the current affiliate strip was
built (Watsons/books/toys/bags chosen for relevance, not commission rate) — this just names
and extends that same discipline going forward.

**Sequencing, re-ordered against actual GSC data rather than Fadly's original instinct-based
ranking (both versions worth keeping on record):**

Fadly's original ranking: (1) School comparison (2) City/area pages (3) Education guides
(4) Books/resources (5) Affiliate/products.

Claude's data-grounded re-ranking, per the 2026-07-15 conversation:

1. **`berdekatan.html` near-me page** — NOT trigger-gated, buildable now. "Near me" is the
   single best-converting search theme on the site today (6.9% CTR, highest on-site, growing
   per memory) with zero dedicated landing page. Cheaper and more proven than generic
   city/area expansion. Ready whenever Fadly wants to build it — no threshold to hit first.

2. **Clarify what "school comparison" actually means, THEN build the honest version.**
   BLOCKED on a scope decision, not a data threshold necessarily — a comparison tool needs
   real data to compare *on*. Fee coverage ~0.08%, curriculum coverage ~4% (same wall that
   already parked the quiz and fee calculator). Two paths: (a) a lightweight comparison using
   data that DOES exist today (location, registration status KPM/JKM, photos, claimed status)
   — buildable now if scoped this way; (b) a fee/curriculum-driven comparison — stays parked
   behind the same 100+-claimed-schools-with-real-data trigger as the quiz. Don't build
   blind; decide (a) vs (b) first.

3. **Let the current guide funnel age before writing more or restructuring nav.**
   TRIGGER: same as the existing panduan.html trigger (~8 guides, currently 6) PLUS real
   traffic signal on which of the current guides actually get read, once GSC data across 2+
   consecutive exports shows a pattern (per the gsc-analysis skill's own "two consecutive
   exports minimum" rule for structural claims). Don't judge or expand guide content on a
   single week's data.

4. **Education Hub nav restructure** (Learn / Resources / Schools / Guides as primary nav,
   replacing flat "Schools"-only framing). TRIGGER: after #3 — needs enough real content to
   organize something substantive, not aspirational category headers with one page each.
   Building this early risks looking thin to both Google and parents during the exact window
   the guide funnel still needs to prove itself.

5. **Books/toys/resources content + affiliate expansion into these categories.**
   TRIGGER: after #4, and after the existing affiliate strip (Watsons/books/toys/bags) has
   enough traffic to show real signal — same "let content compound before expanding it"
   logic as guides. Lowest priority; matches Fadly's own ranking here too.

**Explicitly NOT a new monetization mechanism** — this extends the existing Phase 0/Phase 1
consumer-revenue framing (§4) into education-authority content, it doesn't add a sixth
revenue stream. Affiliate categories stay governed by the same "genuinely useful to the
decision, not highest commission" rule already in place.

**Signal condition for Claude to actively flag this again:** raise §5 item 1
(`berdekatan.html`) unprompted next time Fadly asks "what can we execute now" and outreach/
WhatsApp isn't the active blocker. Raise item 2 only once Fadly explicitly decides (a) vs
(b) scope. Raise items 3-5 automatically alongside the existing panduan.html trigger
check-in (~8 guides).


---


## 11. Premium "Campus Tour" video, 60–90s cut

*Originally `roadmap-addendum-4-premium-video.md`, filed as ""; renumbered 11 on consolidation — its original number collided with an existing roadmap section.*

Proposed 2026-07-20, follow-on from the 30s cinematic profile teaser prototype
(see Path B pipeline built same session: Python/PIL frame renderer + FluidSynth
original score, no licensed/stock footage, fictional demo school "Tadika
Bintang Kecil"). That 30s version is DONE and live on the homepage
(`carischools.com`, standalone section above "Artikel untuk Ibu Bapa") as a
schools-facing soft pitch + parent-facing showcase.

**What this is:** a longer (60-90s) sibling cut, explicitly a SEPARATE asset
from the on-profile teaser, not a replacement or extension of it.

**Why separate, not just "make the profile video longer":** the on-profile
30s teaser exists specifically to fight the 39-second average engagement-time
problem -- a longer video there works against that goal (lower completion
rate, less replayability). The 60-90s cut is meant for a different job: a
downloadable/shareable asset a claimed Premium school can post to their own
Facebook/Instagram, where longer-form "campus tour" content is normal and
expected. Two assets, two jobs -- don't conflate them later.

**Trigger to build this for real:** Premium sales actually opening/ramping up
(Fadly's own phrasing: "when premium open and sell like hot cake"). Not
gated behind a hard number the way §5's quiz is -- more of a "worth having
ready in the toolkit before the sales conversation happens" item. Reasonable
to prototype once, with the fictional demo school, before real demand hits,
so it's not being built from scratch mid-sales-conversation.

**Shot list needed (fictional demo school, same consistency rules as the 30s
version: same style language, daylight, empty rooms, no children's
faces/hands):**
- Reused from 30s teaser: exterior/entrance, classroom, playground (3 photos)
- New photos: reception/entrance interior, reading corner, nap/rest area,
  arts & crafts corner, dining area, learning-materials close-up, corridor
  with children's artwork (7 photos)
- New short video clips (3-6s, looping, ambient motion only -- leaves/plants
  swaying, curtain + light shifting near a window): garden exterior, a
  classroom window (2 clips)
- Total: ~12 assets for a 60-90s cut without repeating any shot too often

**Technical status, honestly logged:** the 30s pipeline (Python/PIL frame
renderer, Ken Burns pan/zoom, FluidSynth score) only handles STATIC PHOTOS.
Compositing real short video clips into the same pipeline is genuinely
untested -- expected to be achievable via ffmpeg but not proven yet the way
the photo path is. First real attempt at this should be treated as a
prototype step (may take a couple of iterations), not assumed to be a
one-shot success like the photo-only version was.

**Not yet decided / revisit when this gets built:**
- Exact beat structure/storyboard for the extended cut (more locations,
  more narrative pacing than the 30s data-reveal structure -- likely needs
  to feel more like a "walkthrough" than a "stat reveal")
- Whether the extended score needs new musical material or just an extended/
  varied version of the existing composed piece
- Where this asset actually lives once built -- likely a Premium-tier
  deliverable a school downloads/receives, not necessarily hosted publicly
  the way the 30s demo is on the homepage

**Signal condition for Claude to raise unprompted:** when Fadly indicates
Premium sales conversations are actually starting to happen (a real inbound
inquiry, not just planning) -- that's the trigger to revisit and actually
build this, per his own framing.


---


## 12. School coordinates: backfill fix + what it unlocks

*Originally `roadmap-addendum-5-coordinates.md`, filed as ""; renumbered 12 on consolidation — its original number collided with an existing roadmap section.*

Proposed 2026-07-21, resolving the long-standing "lat/lng coordinate-write
bug" noted in the crawler-pause section of the operating memory.

**Root cause, finally identified:** not a live bug. Data pattern (checked
2026-07-21) showed 15 of 17 states sitting at an exact, hard 0.0%
coordinate coverage -- not a scattered/partial failure pattern, which is
what a real bug would produce. Only Selangor (3.5%) and Johor (9.8%) had
any coverage at all, and both states are on record as having had TWO
separate crawl runs. Conclusion: the geometry-capture code was added to
crawler.py sometime AFTER most states were already crawled once with an
older version of the script that didn't have it. Selangor/Johor's partial,
nonzero coverage came from their second runs (which did have the code).
Every other state was crawled exactly once, before the code existed, and
never revisited -- hence the clean zero. Traced the full current code path
(extraction in crawl_school -> save_to_supabase -> the actual Supabase
.update() call) end to end and found no logic bug in the current version.

**Fix shipped 2026-07-21:** added `--backfill-coords` to crawler.py.
Purely additive (confirmed zero lines removed/changed in the diff). Fills
lat/lng for the ~5,800 schools that already have a verified
`google_place_id` from a prior crawl but no coordinates. Deliberately
requests ONLY the `geometry` field (Basic-tier, same free category as
name/address) via a new `google_place_geometry_only()` function -- skips
Contact/Atmosphere/Photo entirely, so this pass should cost close to $0
even at full scale, unlike a real crawl (which was confirmed via the
actual July 2026 billing report, RM84.57, to run roughly $15-20 per
1,000-2,000 school batch once Contact+Atmosphere+Photo are included).
Also skips the "Find Place" matching step entirely since place_id is
already known -- cheaper AND faster than a real crawl.

**Status:** script built and delivered, not yet run. Recommended first
step (not yet executed): `--backfill-coords --state PERAK` as a 433-school
test batch -- this is literally the Perak test that was planned months ago
in the original coordinate-bug investigation and never completed. Confirm
it works before running across all 15 remaining un-backfilled states.

**Why this matters -- what coordinates actually unlock, roughly in order
of cheapest-to-ship to biggest-but-later:**

1. **Similar/Nearby Schools widget** (smallest lift). The crawler's own
   code comment already named this as the reason coordinates were being
   captured in the first place: "Powers 'Similar/Nearby Schools' distance
   sorting once enough schools have this populated." A self-contained
   widget on school.html -- "3 other tadika within 2km" -- once coverage
   is broad enough to be useful.

2. **Upgrade Berdekatan from town/district bucketing to true distance
   sorting** (recommended first priority once coordinates exist at
   scale). Berdekatan is already the site's best-converting search theme
   (6.9% CTR) and Microsoft Clarity sessions reviewed 2026-07-21 showed
   real users actively seeking it out mid-search. This is a precision
   upgrade to something already proven to convert, not a bet on something
   new -- real km-based sorting (0.8km, 1.2km, 2.1km...) instead of
   same-town bucketing.

3. **A real map view** (bigger lift, later). Visual pins showing spatial
   layout of nearby schools. Genuinely compelling for commute-conscious
   parents, but real frontend work (map library, UI design) -- treat as
   a "once #1 and #2 are live and validated" item, not a near-term one.

4. **Side benefit, lower priority but free once coordinates exist:** a
   school whose lat/lng lands far from its registered district/postcode
   is a signal the Google Places match may be wrong -- feeds directly
   into the existing JKM needs_review backlog work, no new mechanism
   needed, just a distance-sanity-check query against existing data.

**Signal condition for Claude to raise unprompted:** once Fadly reports
the coordinate backfill has actually run across a meaningful number of
states (not just the Perak test), raise item #2 (Berdekatan distance
upgrade) as the next concrete build -- it's the one with proven demand
already, per the GSC 6.9% CTR figure and the two Clarity session
recordings reviewed this session.

---

## 13. Status corrections as of 2026-08-06

The addenda in §8–§12 were written between 2026-07-14 and 2026-07-21 and are preserved
above **as written**, because the reasoning in them is still worth reading. But several of
their premises have since changed. Read this section before acting on any of them.

### Shipped — do not re-plan these

| Item | Where it was proposed | Status |
|---|---|---|
| `berdekatan.html` near-me page | §9.2 (Parents gap), §10 item 1 | **Live.** Was the top data-grounded recommendation in two addenda. |
| `panduan.html` guides index | §9 preamble, §10 item 3 | **Live 2026-08-05.** The ~8-guide trigger was hit and the page built the same day; grouped by task (Memilih / Permohonan & Pendaftaran / Kos / Persediaan), not by tadika-vs-taska — only one guide is taska-side. |
| Dynamic sitemap kawasan towns | §9.4 Gap B, mistake M20 | **Fixed 2026-07-15.** The hardcoded 14-town list is gone; `get_kawasan_towns()` is the source of truth. |
| SLA copy divergence | §9.4 Gap C | **Resolved.** `claim.html` and `api/send-claim-email.js` both now say "1-2 hari bekerja" — standardised on 1-2, not the 2-5 the addendum recommended. |
| AI-crawler prerender route | not in any addendum | **Live since 2026-07-27** (`/api/prerender`, UA-routed in `vercel.json`). |
| Guide count | §10 item 3 says "currently 6" | **8 live.** |

### Premises that have changed

- **AdSense is no longer parked.** §8 opens by describing AdSense as parked pending traffic
  and claimed-school count. It went live 2026-08-04 (`pub-9310551220875774`, Auto ads on).
  The live problem is now the opposite one: ad density. As of 2026-08-06 the homepage
  serves 8 in-page ads plus a top-pinned anchor, and a **competitor** (Kiddocare, a
  childcare booking app) is advertising above the fold on a childcare directory. Open
  actions: anchor → bottom, vignettes off, block competitor advertiser URLs, cap in-page
  ads. None of this is in §8, which predates the launch.
- **Individual brand affiliates were investigated and declined.** §8 Phase 0 proposes
  affiliate strips; §10 item 5 proposes expanding them. On 2026-08-04 Fadly researched
  real commission rates across toys/books/food/gadgets/insurance and decided *"too
  difficult, sticking with AdSense."* Treat §8/§10 affiliate expansion as closed unless he
  reopens it. If he does: KiwiCo (CJ Affiliate, 10%, 30-day cookie, subscription-recurring)
  was the strongest candidate, untested for Malaysia shipping.
- **Fee coverage is no longer flatly ~0%.** §8 and §10 both block work on "0% / 0.08% fee
  coverage." Since 2026-08-04, fee entry is *mandatory* for Premium schools, and a
  parent-reported `fee_submissions` table exists with a 3-report display threshold. Still
  thin, but the blocker is now a growth curve rather than a wall — re-measure before citing
  the old number.
- **§12's coordinate backfill has run, and its two top items are built.** §12 is preserved
  above as written on 2026-07-21, when 15 of 17 states sat at exactly 0.0% coordinate
  coverage and the `--backfill-coords` script had been delivered but not executed. Measured
  2026-08-06: **every state is now between 47% and 77%** (Perlis 77.0, Johor 67.5, Kedah
  63.6 … Putrajaya 47.3), roughly 6,500 of 10,900 active schools. Downstream, §12 item 1
  (nearby-schools widget in `school.html`) and item 2 (true km distance sorting in
  `berdekatan.html`, haversine with a ±55km bounding-box pre-filter) are both **live**.
  Still open from §12: item 3 (map view) and item 4 (distance-vs-district sanity check
  feeding the JKM `needs_review` backlog). The addendum's stated signal condition — "raise
  item #2 once the backfill has run across a meaningful number of states" — has been met
  and acted on.

- **Curation of free resources replaced "build e-learning."** Not in any addendum. Decided
  2026-08-04: CariSchool will not produce educational content, but a tag-matched curation
  of existing free resources (StoryWeaver, Global Digital Library, PERMATA's public
  curriculum) was approved as a concept sketch (`curation-sketch-v2.html`) and **parked**.
  Homework as a pool was rejected specifically. This sits closest to §10 (Education Hub)
  and should be read alongside it.

### Still genuinely open

1. **§9.4 Gap A, the sekolah agama intent-mismatch cohort.** A title/description fix
   shipped 2026-08-04; the GSC re-check to confirm CTR actually moved is due late
   August 2026.
2. **AI visibility re-audit**, due late August 2026 — blocked on locating the original
   Q1–Q20 query set, without which the two audits aren't comparable.
3. **§7 special-needs import**, **§5 quiz**, **§6 premium retention**, **§11 premium
   video** — all still parked on their original triggers, unchanged.

### Decided against — do not re-propose

- **Crawling school websites to extract fees. CLOSED 2026-08-09 with measured
  evidence — do not reopen.** Two sample runs, both far below the threshold that
  would justify continuing:
  - All categories, 49 schools: **2 found (4%)**. 33 had no RM figure anywhere.
  - `ANTARABANGSA` only, 29 schools: **2 usable (7%)**. Two further "finds" were
    Eaton's RM2,000 *application* fee, not tuition — a false positive that would
    have misled parents if published.
  The misses are policy, not technique: *"fees provided via individual quotation
  after application"*, *"submit a form/enquiry to receive fee information"*,
  *"only available via PDF download"*, *"COMING SOON"*, *"links to Contact Us
  rather than publishing figures"*. International schools deliberately keep fees
  behind an enquiry funnel; tadika and taska mostly publish nothing at all. No
  crawler, model or fetching improvement changes that.
  **Fees come from claims (school-confirmed, mandatory for Premium since
  2026-08-04) and from `fee_submissions` (parent-reported, 3-report threshold,
  fully built and still unused).** Both are free per school and produce figures
  the site can stand behind.
  `extract_fees.py` is kept for reference only.
  *Note on process: Fadly rejected fee crawling in an earlier session on exactly
  these grounds — inconsistent formats, low return. Claude reopened it twice on
  estimates of 30–40% and then 30–50%; actual was 4% and 7%. The maintainer's
  prior judgement was better than the model's projection both times. A standing
  decision backed by his own observation should not be reopened on an estimate —
  only on evidence.*

- **(superseded) Crawling school websites to extract fees.** Raised again 2026-08-06 on the back of the AI
  audit (Google surfaced Tadika Sin Hwa's full fee schedule from a Facebook group post, and
  1,761 schools have a `website` URL already captured — an apparent 13× on the 133 schools
  with fee data today). **Fadly has already evaluated and rejected this in an earlier
  session:** schools publish fees in wildly different formats, so extraction accuracy is poor,
  and a re-crawl carries real Google Places cost against a low expected return. Standing
  decision — the fee gap is closed through claim conversion and parent reports, not crawling.
  Recorded here 2026-08-06 because it was undocumented and got re-proposed; that is the whole
  reason this list exists.

### New items with no home in §0–§12

- **Kawasan matcher misses address-only towns.** `kawasan.html` matches `town` and
  `neighbourhood` only. 22 active schools have "Bukit Jalil" in their **address** and in
  neither of those fields, so they are unreachable by area — including Little Creche's Park
  and Earth branches, whose addresses were hand-corrected on 2026-08-04. Decision needed:
  backfill `neighbourhood` for the affected rows, or widen the matcher to include `address`
  (riskier — address substrings produce false matches).
- **Ad density tuning** — see "Premises that have changed" above.
- **`roadmap-addendum-5-coordinates.md` was never committed.** It existed only in a chat
  session until this consolidation. Its content is now §12 and safe.
