# Learnings — 2026-07-27 AI visibility session

Append these to `learnings-log.md`, then apply the routed edit for each.

**Process note first:** the skill says deferring means never. I deferred this four times
today waiting for "deploy verified." That was wrong — notes 2 and 4 below were both fully
learned by mid-morning and would have been sharper written then. Trigger on the learning,
not on the milestone.

---

### 2026-07-27 — Client-rendered pages are invisible to non-JS AI crawlers
PROBLEM: school.html and kawasan.html ranked fine on Google but returned nothing usable to AI crawlers. Googlebot renders JS; OAI-SearchBot, PerplexityBot and ClaudeBot largely do not.
WORKED: A Vercel serverless route (`/api/prerender`) server-rendering real HTML — populated title, canonical, JSON-LD, body — routed by user-agent via `has` conditions in vercel.json. No build step, no framework, page files untouched. Verified end-to-end by fetching the live URL with a bot UA.
FAILED: Assuming Google ranking implied general crawlability. It doesn't — Google is the only major crawler that reliably executes JavaScript. Raw HTML for school.html was 2,039 chars of shell with `{}` for JSON-LD, and worse than empty: every conditional block rendered at once, so an AI read "Sekolah tidak dijumpai" and "Profil ini mungkin tidak lagi aktif" simultaneously.
RULE: Before claiming any page is visible to AI, fetch it without JavaScript and read what comes back; Google Search Console position is not evidence of AI crawlability.
ROUTED TO: CLAUDE.md §3 as next M-number. Also carischool-manual (prerender route now exists; keep content parity with the client-rendered page or dynamic rendering becomes cloaking).

---

### 2026-07-27 — Crawler UAs and user-triggered UAs are different agents
PROBLEM: The bot-routing rewrite silently failed for the first live test. The UA list had `ClaudeBot` and the retired `Claude-Web` but not `Claude-User`.
WORKED: Treating each AI vendor as having at least two agents — an indexing crawler (`OAI-SearchBot`, `PerplexityBot`, `ClaudeBot`) and a user-triggered fetcher (`ChatGPT-User`, `Perplexity-User`, `Claude-User`) — plus training crawlers (`GPTBot`, `CCBot`) that are separately blockable.
FAILED: Nothing structural — the fix was one line. But the same confusion had already produced a real robots.txt outcome: blocking `GPTBot` was believed to block ChatGPT, when ChatGPT's search citations come from `OAI-SearchBot`, which was never listed and so fell through to `User-agent: *`.
RULE: When adding or blocking an AI vendor's bot, enumerate all three families for that vendor — training, indexing, user-triggered — and state explicitly which is being targeted; never treat one name as standing for the vendor.
ROUTED TO: CLAUDE.md §3 as next M-number, cross-referenced from the robots.txt comment block.

---

### 2026-07-27 — Sitemaps that GROUP BY can't see colloquial URL labels
PROBLEM: 11 of 23 internally-linked kawasan URLs were absent from the sitemap, including `?bandar=Bangi` (405 impressions, pos 8.2) — while `?bandar=Bandar Baru Bangi`, the version GROUP BY produces, ranked nowhere.
WORKED: A second RPC (`get_kawasan_label_counts`) that counts the way the PAGE queries — `town ILIKE %X% OR neighbourhood ILIKE %X%` — over an explicit label list mirroring index.html's footer. Union with the town list, dedupe case-insensitively. Dead labels drop out automatically; that is what caught `?bandar=George Town` returning zero schools because no Penang row uses that name.
FAILED: Trying to derive the labels from data. `GROUP BY town` can only emit strings that literally exist in the column — "Bangi" appears in 2 rows, so no threshold reaches it. Adding neighbourhood counting doesn't help either: only 724 of 10,923 rows have one, across 101 values, none near 50.
RULE: Whenever a page resolves a URL parameter fuzzily, any sitemap or link generator for that page must verify candidate values through the same fuzzy match — an exact-match aggregate silently omits every label the site actually links to.
ROUTED TO: carischool-data-layer SKILL.md (canonical patterns — the label-count RPC and why two vocabularies exist). CLAUDE.md M23 gets a "second order" cross-reference.

---

### 2026-07-27 — Pattern claims from three data points kept needing retraction
PROBLEM: Across a 13-query audit I stated four patterns as findings and had to retract three: "Google AI Mode cites only itself" (broke at Q4), "language isn't the variable" (broke at Q4), "no surface states registration status" (broke at Q7), and a claimed `metaDesc` bug that didn't exist (the assignment was 300 lines below where I stopped reading).
WORKED: Verifying against the database before asserting. The Al Kauthar brand-vs-premises finding held up precisely because it was checked first — 17 rows, all validly registered — which turned a would-be scandal claim into an accurate structural one.
FAILED: Three hypotheses hunting for a dramatic result — "AI recommends expired schools", "AI spreads false registration claims", "AI recommends unregistered centres". All three were checked and all three were false. The AI surfaces were consistently accurate about registration; they simply cannot verify it.
RULE: Label any cross-query pattern as a working note until it survives at least five observations, and read a file to its end before reporting a bug in it; when an investigation is hunting for a dramatic finding, check the boring explanation first.
ROUTED TO: CLAUDE.md §4.5 (reporting discipline). Working-relationship half → Claude's memory.
