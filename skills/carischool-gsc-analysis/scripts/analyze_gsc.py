#!/usr/bin/env python3
"""
CariSchool GSC export analyzer.

Usage: python3 analyze_gsc.py <dir containing the unzipped GSC CSVs>

Produces the six standard report sections defined in the carischool-gsc-analysis
skill: totals, page-type breakdown, striking distance, intent-mismatch cohort,
outreach ammunition, kawasan candidates. Interpretation ("so what") is the
model's job, not this script's.
"""

import csv
import os
import re
import sys
import json
import urllib.request
import urllib.parse
from collections import defaultdict

BASE = 'https://www.carischools.com'

SB_URL = 'https://pwbuhlwxnnxvtbqehyvy.supabase.co'
# Public by design -- same anon key already committed in sitemap.js.
SB_KEY = ('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZ'
          'iI6InB3YnVobHd4bm54dnRicWVoeXZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg'
          'xNTc4MTIsImV4cCI6MjA5MzczMzgxMn0.jIPBjCIazqMw6F-luFEebNy_YV6V35f2'
          '-LlnN9SDGiQ')

# Must match the threshold sitemap.js passes to get_kawasan_towns() -- if the
# two ever diverge, section 6 compares against the wrong list again.
KAWASAN_TOWN_MIN_SCHOOLS = 50

# ── Section 6 source of truth, 2026-08-05 ────────────────────────────────
# History of this one check, because it has now drifted twice:
#   2026-07-15 (M20): sitemap.js stopped hardcoding towns, started calling
#                     get_kawasan_towns(). This script kept its own 14-town
#                     copy and silently reported ~39 real sitemap towns as
#                     "missing" for ten days.
#   2026-07-25 (M23): fixed by calling the same RPC -- one source of truth
#                     instead of two lists.
#   2026-08-05 (M32): still wrong, in a subtler way. The sitemap ALSO emits
#                     the colloquial labels in KAWASAN_LINKED_LABELS, which
#                     get_kawasan_towns() does not return, because the two
#                     matchers disagree: the sitemap groups on exact `town`
#                     values while kawasan.html matches
#                     `town ILIKE %X% OR neighbourhood ILIKE %X%`. So every
#                     ranking label-shaped kawasan URL was reported as
#                     "NOT in sitemap" even though the sitemap contains it.
#
# The fix that ends this class of bug: stop reconstructing what the sitemap
# probably contains and read the published sitemap itself. It is the actual
# artifact the question is about, it needs no threshold or label constant to
# stay in sync, and it cannot drift from itself. The RPC and the hardcoded
# set remain as clearly-labelled degraded fallbacks only.
SITEMAP_URL = f'{BASE}/sitemap.xml'

SITEMAP_TOWNS_FALLBACK = {
    'Petaling Jaya', 'Shah Alam', 'Subang Jaya', 'Bangi', 'Klang',
    'Johor Bahru', 'Ipoh', 'George Town', 'Kota Kinabalu', 'Kuching',
    'Seremban', 'Melaka', 'Kuantan', 'Kuala Lumpur',
}

# ── Guide URLs, 2026-08-05 ───────────────────────────────────────────────
# These were being detected by keyword substring, and two of the eight live
# guides matched none of the keywords -- 'kpm-vs-jkm-tadika-taska' and
# 'persediaan-hari-pertama-tadika' both fell through to 'other'. That is not
# cosmetic: section 2's headline ratio is non-brand share
# (kawasan+state+guide) vs profile share, and it is the number the AdSense /
# partner triggers are read against. Misfiling two guides understates the one
# metric the whole report exists to track.
#
# Explicit list first (kept in sync with the static block in api/sitemap.js),
# keyword match second so a new guide still lands in the right bucket on the
# day it ships, before anyone remembers to edit this file.
GUIDE_SLUGS = {
    # Updated 2026-10-21 from api/sitemap.js's static block: the list had
    # stopped at 8, and 18 live content pages (bersedia, menangis, green-flag,
    # semak/check-registered, kos-buka, kalkulator, laporan, how-to-choose...)
    # matched no keyword and were filed as 'other', understating non-brand share.
    'cara-pilih-tadika',
    'tadika-terbaik-selangor',
    'yuran-tadika-malaysia',
    'panduan-pendaftaran-taska',
    'panduan-pendaftaran-prasekolah',
    'kpm-vs-jkm-tadika-taska',
    'persediaan-hari-pertama-tadika',
    'panduan-permohonan-prasekolah-kpm',
    'panduan',
    'adakah-anak-anda-bersedia-ke-tadika',
    'senarai-semak-lawatan-tadika',
    'semak-pendaftaran-taska-tadika',
    'check-registered-taska-tadika-malaysia',
    'pengasuh-rumah-vs-taska-berdaftar',
    'anak-menangis-ke-taska-tadika',
    'rasa-bersalah-hantar-anak-ke-taska',
    'soalan-untuk-tanya-taska-tadika',
    'green-flag-taska-tadika',
    'taska-tempat-kerja-panduan-majikan',
    'workplace-childcare-malaysia-employer-guide',
    'how-to-choose-a-preschool-malaysia',
    'kos-buka-taska',
    'kos-buka-tadika',
    'kalkulator-kos-taska-tadika',
    'panduan-pematuhan-taska',
    'panduan-pematuhan-tadika',
    'panduan-perkembangan-bayi-0-6-bulan',
    'panduan-perkembangan-bayi-6-12-bulan',
    'panduan-perkembangan-anak-1-2-tahun',
    'panduan-perkembangan-anak-2-4-tahun',
    'perkembangan-anak',
    'laporan-prasekolah-malaysia-2026',
}
# Form pages whose slug happens to contain a guide keyword ('yuran').
NOT_GUIDE = {'kongsi-yuran'}
GUIDE_KEYWORDS = ('cara-pilih', 'yuran', 'panduan', 'terbaik', 'guide',
                  'kspk', 'day-one', 'checklist', 'persediaan', 'kpm-vs',
                  'vs-jkm')


def fetch_sitemap_kawasan_labels():
    """
    Every `?bandar=` value actually present in the published sitemap.

    -> (set of labels, source: str). source is 'sitemap' when this is ground
    truth; anything else means a degraded fallback was used and the caller
    MUST say so rather than presenting the result as current.
    """
    try:
        req = urllib.request.Request(
            SITEMAP_URL, headers={'User-Agent': 'carischool-gsc-analysis'})
        with urllib.request.urlopen(req, timeout=15) as resp:
            xml = resp.read().decode('utf-8', 'replace')
        labels = {
            urllib.parse.unquote(m.group(1)).replace('+', ' ').strip()
            for m in re.finditer(r'kawasan\.html\?bandar=([^<&"]+)', xml)
        }
        if labels:
            return labels, 'sitemap'
        print('⚠️  sitemap.xml fetched but contained no kawasan URLs -- '
              'falling back to the RPC town list, which cannot see the '
              'KAWASAN_LINKED_LABELS half of the sitemap (M32).')
    except Exception as e:
        print(f'⚠️  sitemap.xml unreachable ({e}) -- falling back to the RPC '
              f'town list, which cannot see the KAWASAN_LINKED_LABELS half '
              f'of the sitemap (M32), so section 6 will over-report.')

    towns, live = get_sitemap_towns()
    return towns, ('rpc-towns-only' if live else 'hardcoded-stale')


def get_sitemap_towns():
    """
    Fallback only. Live kawasan TOWN list from the same RPC sitemap.js calls.
    Incomplete by construction: it returns exact `town` values and therefore
    never includes the colloquial KAWASAN_LINKED_LABELS the sitemap also
    emits. Use fetch_sitemap_kawasan_labels() instead.

    -> (set of town names, is_live: bool).
    """
    try:
        req = urllib.request.Request(
            f'{SB_URL}/rest/v1/rpc/get_kawasan_towns',
            data=json.dumps({'min_schools': KAWASAN_TOWN_MIN_SCHOOLS}).encode(),
            headers={
                'apikey': SB_KEY,
                'Authorization': f'Bearer {SB_KEY}',
                'Content-Type': 'application/json',
            },
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            rows = json.loads(resp.read())
        towns = {r['town'] for r in rows if r.get('town')}
        if towns:
            return towns, True
    except Exception as e:
        print(f'⚠️  get_kawasan_towns RPC unreachable ({e}) -- falling back '
              f'to the hardcoded 14-town list, which is KNOWN STALE '
              f'(sitemap.js has used the live RPC since 2026-07-15). '
              f'Section 6 results below are unreliable until this is fixed.')
    return SITEMAP_TOWNS_FALLBACK, False


def load(d, name):
    p = os.path.join(d, name)
    if not os.path.exists(p):
        return []
    with open(p, encoding='utf-8-sig') as fh:
        return list(csv.DictReader(fh))


def i(x):
    return int(str(x).replace(',', '') or 0)


def f(x):
    return float(str(x).replace('%', '') or 0)


def page_class(url):
    u = url.replace(BASE, '')
    if u == '/' or u == '':
        return 'home'
    if u.startswith('/school/') or 'school.html' in u:
        return 'school-profile'
    if u.startswith('/kawasan'):
        return 'kawasan'
    if u.startswith('/tadika-') and '.html' not in u:
        return 'state'
    if 'jobs' in u:
        return 'jobs'
    slug = u.strip('/').split('?')[0]
    if slug.endswith('.html'):
        slug = slug[:-5]
    if slug in NOT_GUIDE:
        return 'other'
    if slug in GUIDE_SLUGS or any(g in u for g in GUIDE_KEYWORDS):
        return 'guide'
    return 'other'


def main(d):
    filters = {r.get('Filter'): r.get('Value') for r in load(d, 'Filters.csv')}
    chart = load(d, 'Chart.csv')
    pages = load(d, 'Pages.csv')
    queries = load(d, 'Queries.csv')
    devices = load(d, 'Devices.csv')

    print(f'== 1. TOTALS ==')
    # The window that gets REPORTED is the one Chart.csv actually contains.
    # Filters.csv's label has been wrong before (the 2026-07-27 export said
    # "Last 3 months" over 46 days of data), and a window label that doesn't
    # match the rows makes every month-over-month comparison noise.
    label = filters.get('Date', 'no label')
    dates = [r['Date'] for r in chart if r.get('Date')]
    if dates:
        actual = f'{min(dates)} → {max(dates)}'
        days = len(set(dates))
        print(f'Window (from Chart.csv, authoritative): {actual}  [{days} days]')
        print(f'Filters.csv label: "{label}"'
              + ('  ⚠️  verify -- labels have been wrong before'
                 if days not in (7, 28) else ''))
        if days <= 7:
            print('⚠️  7-day window: single-school swings are noise. Only quote '
                  'cohort- and theme-level movements; structural claims need '
                  'two consecutive exports.')
    else:
        print(f'⚠️  Chart.csv missing or empty -- cannot verify the window. '
              f'Filters.csv claims "{label}"; do NOT report that as fact.')
    # Use Chart.csv for the authoritative total, NOT a sum over Pages.csv --
    # Pages.csv silently caps at 1000 rows (same class of truncation as
    # Queries.csv), and once a site has enough long-tail pages each pulling
    # a handful of impressions, that cap means summing Pages.csv can
    # undercount the true total by more than half. Chart.csv is a pure
    # per-day aggregate and is never row-capped -- always authoritative.
    if len(pages) >= 1000:
        print(f'⚠️  Pages.csv has {len(pages)} rows -- likely capped. '
              f'Page-level breakdowns below are a sample, not exhaustive; '
              f'school profiles alone fill ~972 rows, so guides and other '
              f'page types can be absent from the file while still earning.')
    tc = sum(i(r['Clicks']) for r in chart)
    ti = sum(i(r['Impressions']) for r in chart)
    print(f'Clicks={tc}  Impressions={ti}  CTR={tc / max(ti, 1) * 100:.2f}%')
    dv = {r['Device']: i(r['Clicks']) for r in devices}
    tot_d = sum(dv.values()) or 1
    print('Devices: ' + ', '.join(
        f'{k} {v / tot_d * 100:.0f}%' for k, v in dv.items()))

    print(f'\n== 2. PAGE-TYPE BREAKDOWN ==')
    agg = defaultdict(lambda: [0, 0, 0])
    for p in pages:
        c = page_class(p['Top pages'])
        agg[c][0] += i(p['Clicks'])
        agg[c][1] += i(p['Impressions'])
        agg[c][2] += 1
    for k, v in sorted(agg.items(), key=lambda x: -x[1][0]):
        print(f'{k:16s} clicks={v[0]:5d} impr={v[1]:6d} pages={v[2]:4d} '
              f'ctr={v[0] / max(v[1], 1) * 100:.2f}%')
    prof = agg['school-profile'][0]
    nonbrand = sum(agg[k][0] for k in ('kawasan', 'state', 'guide'))
    print(f'Profile-click share: {prof / max(tc, 1) * 100:.0f}%  |  '
          f'Non-brand (kawasan+state+guide) share: '
          f'{nonbrand / max(tc, 1) * 100:.0f}%')
    # Any guide landing in 'other' means GUIDE_SLUGS is behind the site again,
    # and non-brand share above is understated -- the one number the AdSense
    # and partner triggers are read against.
    stray = [p['Top pages'].replace(BASE, '') for p in pages
             if page_class(p['Top pages']) == 'other'
             and re.search(r'(tadika|taska|prasekolah|kpm|jkm)', p['Top pages'], re.I)]
    if stray:
        print(f'⚠️  {len(stray)} topic-shaped page(s) classified "other" -- '
              f'check whether any is a guide missing from GUIDE_SLUGS: '
              + ', '.join(stray[:5]))

    print(f'\n== 3. STRIKING DISTANCE (impr>=150, pos 4-15) ==')
    sd = [p for p in pages
          if i(p['Impressions']) >= 150 and 4 <= f(p['Position']) <= 15]
    for p in sorted(sd, key=lambda x: -i(x['Impressions']))[:15]:
        print(f"impr={i(p['Impressions']):5d} pos{f(p['Position']):5.1f} "
              f"ctr={p['CTR']:>7s} clicks={i(p['Clicks']):3d}  "
              f"{p['Top pages'].replace(BASE, '')[:70]}")

    print(f'\n== 4. INTENT-MISMATCH COHORT (impr>=150, CTR<1%) — M22 ==')
    mm = [p for p in pages if i(p['Impressions']) >= 150 and f(p['CTR']) < 1.0]
    mm_impr = sum(i(p['Impressions']) for p in mm)
    print(f'{len(mm)} pages, {mm_impr} impressions '
          f'({mm_impr / max(ti, 1) * 100:.0f}% of all impressions)')
    print('These are bugs to investigate (title mismatch, miscategorized '
          'entity, wrong-audience ranking) — never vanity reach.')
    for p in sorted(mm, key=lambda x: -i(x['Impressions']))[:15]:
        print(f"impr={i(p['Impressions']):5d} pos{f(p['Position']):5.1f} "
              f"clicks={i(p['Clicks']):2d}  "
              f"{p['Top pages'].replace(BASE, '')[:70]}")

    print(f'\n== 5. OUTREACH AMMUNITION '
          f'(school-name queries, impr>=15, clicks<=1) ==')
    # School-name-shaped: starts with tadika/taska/sekolah/preschool-ish words
    # or contains photo intent. Join to profile pages by loose name match.
    school_pages = {p['Top pages'].replace(BASE + '/school/', ''): p
                    for p in pages if '/school/' in p['Top pages']}
    shaped = re.compile(
        r'^(tadika|taska|little|preschool|pusat|genius|smart)\b|'
        r'\b(photos?|照片|gambar)\b', re.I)
    # 'sekolah agama' queries are the M22 intent-mismatch cohort (searcher wants
    # the primary school, not our preschool entry) — NEVER outreach ammunition.
    mismatch_rx = re.compile(r'sekolah agama', re.I)
    ammo = []
    for q in queries:
        if i(q['Impressions']) >= 15 and i(q['Clicks']) <= 1 \
                and shaped.search(q['Top queries']) \
                and not mismatch_rx.search(q['Top queries']):
            slugish = re.sub(r'[^a-z0-9]+', '-',
                             q['Top queries'].lower()).strip('-')
            # Require a long prefix match; loose joins mislabel branches.
            hit = next((slug for slug in school_pages
                        if len(slugish) >= 12 and slugish[:24] in slug), '')
            ammo.append((i(q['Impressions']), q['Top queries'],
                         f(q['Position']), hit))
    for impr, query, p_, slug in sorted(ammo, reverse=True)[:25]:
        print(f'impr={impr:4d} pos{p_:5.1f}  "{query[:45]}"'
              + (f'  → /school/{slug[:45]}' if slug else ''))
    print(f'({len(ammo)} candidates total — verify school identity + '
          f'is_claimed=false in Supabase before outreach)')

    print(f'\n== 6. KAWASAN CANDIDATES (M20/M23/M32 drift check) ==')
    sitemap_labels, source = fetch_sitemap_kawasan_labels()
    if source == 'sitemap':
        print(f'(comparing against the {len(sitemap_labels)} kawasan URLs in '
              f'the PUBLISHED sitemap.xml — ground truth, covers both the '
              f'get_kawasan_towns() towns and KAWASAN_LINKED_LABELS)')
    elif source == 'rpc-towns-only':
        print(f'(DEGRADED: comparing against {len(sitemap_labels)} towns from '
              f'get_kawasan_towns() only. This CANNOT see KAWASAN_LINKED_LABELS, '
              f'so label-shaped candidates below are likely false positives — '
              f'cross-check each against api/sitemap.js by hand before acting.)')
    else:
        print(f'(DEGRADED: comparing against the {len(sitemap_labels)}-town '
              f'HARDCODED FALLBACK — known stale since 2026-07-15; treat every '
              f'finding below as unverified.)')
    # Compare case-insensitively: GSC returns whatever casing the URL was
    # crawled with, which is not guaranteed to match the sitemap's.
    known = {x.lower() for x in sitemap_labels}
    seen = set()
    for p in pages:
        m = re.search(r'kawasan\.html\?bandar=([^&\s]+)', p['Top pages'])
        if m:
            town = urllib.parse.unquote(m.group(1)).replace('+', ' ').strip()
            key = town.lower()
            if key not in known and key not in seen:
                seen.add(key)
                print(f"NOT in sitemap but earning: {town} "
                      f"(impr={i(p['Impressions'])}, "
                      f"clicks={i(p['Clicks'])})")
    if not seen:
        print('none — every earning kawasan URL is already in the sitemap')

    print('\nDone. Interpretation and "so what" lines are the analyst\'s job.')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    main(sys.argv[1])
