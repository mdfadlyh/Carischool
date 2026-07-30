---
name: carischool-gsc-analysis
description: Turn a Google Search Console performance export (zip) for carischools.com into the standard monthly report - totals and trends, page-type breakdown, striking-distance opportunities, intent-mismatch cohort, outreach-ammunition list, and kawasan expansion candidates. Use this skill whenever Fadly uploads a GSC export zip, asks how search is performing, asks what to tell schools in outreach, or asks for SEO priorities. Run the bundled script first; interpret second; never eyeball raw CSVs.
---

# CariSchool GSC Analysis

GSC exports are the only ground truth about who finds CariSchool and what they do next.
This skill standardizes the monthly read so numbers are comparable across months and every
export produces the same six artifacts.

## Procedure

1. Unzip the export to a working dir. Expected files: Chart.csv, Queries.csv, Pages.csv,
   Countries.csv, Devices.csv, Search appearance.csv, Filters.csv. Check Filters.csv for
   the date window — GSC exports are usually last-7-days or last-28-days; NAME THE WINDOW
   in every number you report (a "clicks doubled" claim across different windows is noise).
   **Filters.csv can lie about the window.** The 2026-07-27 export was labelled "Last 3
   months" but Chart.csv held 46 days (2026-06-09 onward). Always derive the real window
   from Chart.csv's first and last row and report that, not the filter label.
2. Run: `python3 scripts/analyze_gsc.py <dir-with-csvs>`
   If the script is not present in the skill bundle, reimplement the six sections below
   rather than eyeballing the CSVs, and say in the report that the bundled script was
   missing — a hand-rolled analysis that isn't flagged silently breaks month-over-month
   comparability.
3. Interpret using the reading guide below. Never report script output raw — every section
   of the report ends with a one-line "so what".
4. Route follow-ups: outreach ammunition → the Move-3 Monday batch; intent-mismatch cohort →
   Gap-A style audit; kawasan candidates → sitemap/expansion work; anything recurring and
   surprising → a learnings note per the learning law.
5. Archive the export zip and the report together (one folder per month) — the month-over-
   month trend is the artifact partners will eventually be shown.

## What the script outputs (six sections)

1. **Totals & window** — clicks, impressions, CTR, avg position, device split. Compare to
   the previous archived report by hand (GSC exports don't include history).
2. **Page-type breakdown** — home / school-profile / kawasan / state / guide / jobs / other.
   The strategic ratio to watch: profile share of clicks vs non-brand pages
   (kawasan+state+guides) — the second number is the one that must grow for AdSense/partner
   triggers. Baselines: profile share 91% (Jul 2026 early), **81.5% on 2026-07-27** with
   non-brand at **4.8%**.
3. **Striking distance** — pages with impressions ≥ 150 and position 4–15. These are the
   cheapest wins: usually a title/meta sharpening away from meaningful clicks.
4. **Intent-mismatch cohort** — pages with impressions ≥ 150 and CTR < 1%. Baseline case:
   the sekolah agama cohort. Per M22, these are bugs to investigate (title mismatch,
   miscategorized entity, or wrong-audience ranking), never vanity wins.
5. **Outreach ammunition** — school-name-shaped queries with impressions but ≤1 click,
   including "photos"-intent variants, joined to their profile URLs. Format: school, query,
   impressions, position. This feeds the WhatsApp outreach template variant: real search
   demand the school is currently losing.
6. **Kawasan candidates** — town-shaped queries and kawasan pages ranking but absent from
   the sitemap. The sitemap town list has been dynamic since 2026-07-15, so "not in the
   hardcoded list" is no longer the test. **Per M32, the current test is whether a ranking
   kawasan URL survives `get_kawasan_label_counts`**: the sitemap groups on exact `town`
   values while kawasan.html matches `town ILIKE %X% OR neighbourhood ILIKE %X%`, so
   colloquial labels the site links to can rank while being invisible to the generator.
   Cross-check any ranking `?bandar=` value against both the town list and
   `KAWASAN_LINKED_LABELS` in api/sitemap.js.

## Reading guide (judgment the script can't make)

- **CTR must always be read against position.** 5% CTR at position 3 is weak; at position 9
  it's strong. The script prints both; never quote CTR alone.
- **7-day exports are noisy.** Single-school swings of ±5 clicks mean nothing; only quote
  cohort-level and theme-level movements from 7-day windows. Structural claims ("theme X is
  growing") need two consecutive exports minimum.
- **Query CSV is top-1000 rows only** — the true long tail is bigger than the file. Totals
  from Pages.csv and Queries.csv will disagree; that's sampling, not an error. Use Pages.csv
  totals as the authoritative click count. **Pages.csv is also capped at 1,000 rows**, and
  school profiles now fill ~972 of them — so guides and other page types can be entirely
  absent from the export while still earning traffic. Never read "no guide pages in the
  export" as "guides earn nothing"; use Chart.csv for true totals.
- **GSC cannot see AI-surface demand.** Verification-intent queries totalled 94 impressions
  in the 2026-07-27 export, yet that is the exact query class that earned CariSchool's only
  AI citation. People phrase things to a chatbot in full sentences they never type into
  Google. Do not size an AI-visibility opportunity from GSC — say so explicitly instead.
- **Brand+town queries are claim-side evidence, not SEO work.** Don't propose "optimizing"
  for a school's own name — we already rank; the gap is what the searcher finds (photos,
  fees), which is claim conversion, not content.
- **Do not turn every finding into a build task.** The default follow-ups are: outreach
  ammunition (process), title sharpening (small edit), sitemap list update (small edit).
  Anything bigger goes to the roadmap as a proposal, respecting standing decisions
  (premium-price deferral, crawl pause, trigger-parked items).

## Report format (paste-ready)

```
GSC REPORT — {window}, exported {date}
Totals: {clicks} clicks ({±% vs last}), {impr} impressions, CTR {x}%, pos {y}, mobile {z}%
Profile-click share: {n}% | Non-brand share: {m}%
Top movers: {2-3 lines}
Striking distance: {count} pages — top 3: ...
Intent-mismatch cohort: {count} pages / {impr} impressions — action: ...
Outreach ammunition: {count} schools attached (see list)
Kawasan candidates: {list or "none new"}
So what (3 lines max): ...
```

## Failure modes to avoid

- Reporting without naming the date window (incomparable numbers), or trusting Filters.csv's
  label over Chart.csv's actual first and last row.
- Averaging positions across pages yourself — use GSC's own position values; they're
  impression-weighted in ways a naive mean isn't.
- Treating an empty "Search appearance.csv" as proof structured data failed — it lags;
  flag only after two consecutive empty exports, then validate with the Rich Results test.
- Quoting the sekolah-agama-style cohort's impressions as "reach" in any partner-facing
  number — wrong-intent impressions inflate nothing but vanity.
- Reading a page type's absence from Pages.csv as absence of traffic (see the 1,000-row cap
  above).
