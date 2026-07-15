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
from collections import defaultdict

BASE = 'https://www.carischools.com'

# Towns currently hardcoded in api/sitemap.js — update when sitemap.js changes
# (M20: this list mirrors code; drift here means drift there).
SITEMAP_TOWNS = {
    'Petaling Jaya', 'Shah Alam', 'Subang Jaya', 'Bangi', 'Klang',
    'Johor Bahru', 'Ipoh', 'George Town', 'Kota Kinabalu', 'Kuching',
    'Seremban', 'Melaka', 'Kuantan', 'Kuala Lumpur',
}


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
    if any(g in u for g in ('cara-pilih', 'yuran', 'panduan', 'terbaik',
                            'guide', 'kspk', 'day-one', 'checklist')):
        return 'guide'
    return 'other'


def main(d):
    filters = {r.get('Filter'): r.get('Value') for r in load(d, 'Filters.csv')}
    chart = load(d, 'Chart.csv')
    pages = load(d, 'Pages.csv')
    queries = load(d, 'Queries.csv')
    devices = load(d, 'Devices.csv')

    window = filters.get('Date', 'UNKNOWN WINDOW')
    dates = [r['Date'] for r in chart] if chart else []
    print(f'== 1. TOTALS ==')
    print(f'Window: {window}'
          + (f' ({dates[0]} → {dates[-1]})' if dates else ''))
    tc = sum(i(p['Clicks']) for p in pages)
    ti = sum(i(p['Impressions']) for p in pages)
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

    print(f'\n== 3. STRIKING DISTANCE (impr>=150, pos 4-15) ==')
    sd = [p for p in pages
          if i(p['Impressions']) >= 150 and 4 <= f(p['Position']) <= 15]
    for p in sorted(sd, key=lambda x: -i(x['Impressions']))[:15]:
        print(f"impr={i(p['Impressions']):5d} pos{f(p['Position']):5.1f} "
              f"ctr={p['CTR']:>7s} clicks={i(p['Clicks']):3d}  "
              f"{p['Top pages'].replace(BASE, '')[:70]}")

    print(f'\n== 4. INTENT-MISMATCH COHORT (impr>=150, CTR<1%) — M19 ==')
    mm = [p for p in pages if i(p['Impressions']) >= 150 and f(p['CTR']) < 1.0]
    mm_impr = sum(i(p['Impressions']) for p in mm)
    print(f'{len(mm)} pages, {mm_impr} impressions '
          f'({mm_impr / max(ti, 1) * 100:.0f}% of all impressions)')
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
    # 'sekolah agama' queries are the M19 intent-mismatch cohort (searcher wants
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

    print(f'\n== 6. KAWASAN CANDIDATES (M20 drift check) ==')
    seen = set()
    for p in pages:
        m = re.search(r'kawasan\.html\?bandar=([^&]+)', p['Top pages'])
        if m:
            town = m.group(1).replace('%20', ' ')
            if town not in SITEMAP_TOWNS and town not in seen:
                seen.add(town)
                print(f"NOT in sitemap but earning: {town} "
                      f"(impr={i(p['Impressions'])}, "
                      f"clicks={i(p['Clicks'])})")
    if not seen:
        print('none — sitemap town list matches observed performance')

    print('\nDone. Interpretation and "so what" lines are the analyst\'s job.')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    main(sys.argv[1])
