# CariSchool — Operator's Audit & Execution Roadmap

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
- **Move 1 (pricing): deliberately deferred, not abandoned.** With 1 claimed school and zero
  premium conversions yet, there's no one at the "premium wall" to price for. Revisit once a
  handful of real claims exist and a school actually hits the locked-panel upsell in
  kemaskini.html — that's the real trigger, not a calendar date.
- **Move 3 (industrialize outreach): shipped.** admin.html's outreach tool now has a
  "🎯 Jana Sasaran Minggu Ini" button generating the top 30 unclaimed/high-engagement/
  not-recently-contacted schools with a pre-drafted Malay message, copy/WhatsApp/log-sent
  actions per card. Uses the founding-Premium-free offer as the incentive line since Move 1
  hasn't shipped a real price yet — revisit the template once it does.

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
