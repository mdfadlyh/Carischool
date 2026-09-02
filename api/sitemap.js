// ─────────────────────────────────────────────────────────────
// CariSchool — Dynamic Sitemap
// Vercel Serverless Function: /api/sitemap
// Generates sitemap.xml with all active school/taska slug URLs
// (KPM Tadika/Antarabangsa + JKM Taska, ~11,000+ as of Jul 2026)
//
// 2026-07-15 update (CLAUDE.md M23 -- "the stale hand-list"):
//   - Kawasan town list is now generated from real school counts in the
//     DB instead of a hardcoded 14-town array. Proof case that forced this:
//     /kawasan.html?bandar=Kota%20Bharu was already ranking and earning
//     real clicks in Search Console despite never being in the sitemap --
//     the hardcoded list had silently drifted behind what the data
//     actually supports. Threshold is KAWASAN_TOWN_MIN_SCHOOLS below.
//   - Added the 3 guide URLs that existed on-site but were missing here.
//   - Removed the fake lastmod=today on every static page. Google learns
//     to ignore a lastmod that's "today" on every single generation --
//     these are now omitted rather than lying about freshness.
//
// 2026-07-21 update:
//   - Added /untuk-sekolah.html (owner-facing legitimacy page).
//   - Town list now calls the shared get_kawasan_towns() RPC first (the
//     same source of truth berdekatan.html and kawasan.html use), so the
//     threshold lives in ONE place. PostgREST RPCs are callable with the
//     same plain fetch -- no new dependency. The previous in-memory
//     aggregation is kept as a fallback so a missing RPC grant degrades
//     gracefully instead of breaking the sitemap (critical SEO surface).
//
// 2026-07-27 update (M23, second order -- "the vocabulary mismatch"):
//   - get_kawasan_towns() does GROUP BY town, so it can only ever emit
//     strings that literally exist in the `town` column: registry names.
//     kawasan.html resolves ?bandar=X with
//         town ILIKE %X% OR neighbourhood ILIKE %X%
//     so colloquial names work at runtime with no matching row. The
//     homepage footer links the colloquial vocabulary; this sitemap
//     emitted the registry one. 11 of 23 internally-linked kawasan URLs
//     were therefore absent.
//     Worst case: ?bandar=Bangi ranks at pos 8.2 with 405 impressions and
//     was never listed, while ?bandar=Bandar Baru Bangi -- what GROUP BY
//     produces -- ranks nowhere at all.
//   - Added KAWASAN_LINKED_LABELS + get_kawasan_label_counts(), which
//     counts the way the page counts so labels are verified before being
//     published. This is what caught ?bandar=George%20Town returning zero
//     schools: no Penang row uses that name (it's Bayan Lepas,
//     Butterworth, Bukit Mertajam), so the footer linked an empty page.
//   - Merge is de-duplicated case-insensitively: 'Pasir Gudang' and
//     'PASIR GUDANG' were both ranking as separate URLs for one page.
//
// 2026-08-03 update -- demo school exclusion:
//   - getAllSlugs() now filters is_demo=eq.false, so the sandbox school
//     created for previewing features (see migration-demo-school.sql)
//     never reaches Google's crawler. This is the single most important
//     of the demo-school fixes across the site: search results and
//     homepage counts being off by one is cosmetic, but the demo school
//     appearing in Google's index would be a real, public-facing mistake.
//   - getKawasanTownsFallback() also filters is_demo, for consistency,
//     though in practice the demo school (town='Demo', 1 row) could never
//     cross KAWASAN_TOWN_MIN_SCHOOLS (50) regardless -- fixed explicitly
//     rather than left as "safe by coincidence."
//   - get_kawasan_towns() and get_kawasan_label_counts() needed the same
//     filter inside their SQL definitions, since this file cannot patch an
//     RPC. **DONE 2026-08-04** -- both now carry is_active AND is_demo
//     guards; verified against pg_get_functiondef on 2026-08-07. That covers
//     all three call sites (this file, kawasan.html, berdekatan.html).
//     Historical note kept because a stale "not yet fixed" comment here
//     caused a 2026-08-07 code audit to report the RPCs as still unguarded.
//     A comment describing pending work must be updated when the work lands,
//     or it becomes a false bug report that costs someone real time.
// ─────────────────────────────────────────────────────────────

const SB_URL = process.env.SUPABASE_URL || 'https://pwbuhlwxnnxvtbqehyvy.supabase.co';
const SB_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3YnVobHd4bm54dnRicWVoeXZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNTc4MTIsImV4cCI6MjA5MzczMzgxMn0.jIPBjCIazqMw6F-luFEebNy_YV6V35f2-LlnN9SDGiQ';
const BASE   = 'https://www.carischools.com';

// Added 2026-09-02 -- no <loc> value in this file was ever XML-escaped.
// Kawasan URLs happen to be mostly protected already since
// encodeURIComponent() percent-encodes XML-reserved characters as a side
// effect, but school slugs (/school/${s.slug}) go into the XML completely
// raw -- a single slug containing '&' or similar would produce malformed
// XML for the WHOLE sitemap file, not just that one entry. Applied to
// every <loc> below regardless of whether the value already looks safe,
// since that's cheap and removes the need to reason about it case by case.
function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Added 2026-09-02 -- the getAllSlugs() query already filters
// slug=not.is.null (real, pre-existing, not new), but that only excludes
// NULL specifically -- an empty string or a slug containing unexpected
// characters (spaces, XML-reserved characters, anything that slipped in
// from a source other than the established slugify() pattern used
// elsewhere on the site) would still pass through untouched. A real slug
// should only ever contain lowercase letters, digits, and hyphens.
const VALID_SLUG = /^[a-z0-9-]+$/;
function isValidSlug(slug) {
  return typeof slug === 'string' && slug.length > 0 && VALID_SLUG.test(slug);
}

// Minimum active schools a town needs to earn its own kawasan sitemap entry.
// Passed to the shared get_kawasan_towns() RPC (and used by the fallback
// aggregation below). 50 currently yields ~53 towns -- a meaningful
// expansion from the old hardcoded 14 without including every marginal
// town. This is the one number to revisit if the sitemap ever feels too
// thin or too bloated; keep it in sync with berdekatan.html's RPC call.
const KAWASAN_TOWN_MIN_SCHOOLS = 50;

// ── Colloquial kawasan labels (added 2026-07-27) ──────────────────────
// This list MUST mirror the town links in index.html's footer. It is NOT
// an inventory list -- inventory stays dynamic via getKawasanTowns(). It
// is a naming-convention list, which no GROUP BY can derive, because these
// strings deliberately don't exist in the `town` column.
//
// Counts are verified against the DB on every generation by
// get_kawasan_label_counts(), so a label pointing at nothing is dropped
// rather than published. Review against Search Console whenever the
// footer changes.
//
// 'Bayan Lepas' replaces 'George Town' here: no active row in Pulau
// Pinang uses "George Town", so that footer link resolved to an empty
// page. Bayan Lepas (104 schools) is the largest Penang town in the data.
const KAWASAN_LINKED_LABELS = [
  'Petaling Jaya', 'Shah Alam', 'Subang Jaya', 'Bangi', 'Klang',
  'Johor Bahru', 'Ipoh', 'Bayan Lepas', 'Kota Kinabalu', 'Kuching',
  'Seremban', 'Melaka', 'Kuantan', 'Kuala Lumpur',
  'Setia Alam', 'Kota Damansara', 'Ara Damansara', 'Putra Heights',
  'Kota Kemuning', 'Subang Bestari', 'Bukit Jelutong', 'Bandar Kinrara',
  'Denai Alam',
  // Added 2026-08-06. Bukit Jalil returned zero results until its 21 schools
  // had `neighbourhood` backfilled (they carry town='Kuala Lumpur'), so the
  // label could not have earned an entry before -- get_kawasan_label_counts
  // would have counted 0 and correctly dropped it. Now 21, above the floor.
  'Bukit Jalil',
];

// Minimum schools a colloquial label needs before it earns an entry.
// Deliberately lower than the town threshold: these are pages the site
// already links to, so the bar is "has real content", not "is a major
// town". Denai Alam (16) is the current floor.
const KAWASAN_LABEL_MIN_SCHOOLS = 10;

async function getAllSlugs() {
  let all   = [];
  let page  = 0;
  const size = 1000;

  while (true) {
    // IMPORTANT: filter is_active=true -- without this, expired JKM
    // registrations (currently 372+) and deactivated duplicate entries
    // get submitted to Google as indexable pages, wasting crawl budget
    // on pages that arguably shouldn't be prioritized for discovery.
    // is_demo=eq.false added 2026-08-03 -- the demo/sandbox school must
    // never reach Google's crawler; this is the most important of the
    // demo-school exclusions across the whole site.
    const res = await fetch(
      `${SB_URL}/rest/v1/schools?select=slug,updated_at&slug=not.is.null&is_active=eq.true&is_demo=eq.false&order=id.asc&limit=${size}&offset=${page * size}`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    const rows = await res.json();
    if (!rows || rows.length === 0) break;
    all = all.concat(rows);
    if (rows.length < size) break;
    page++;
  }
  return all;
}

// Kawasan town list. Primary path: the shared get_kawasan_towns() RPC --
// the same single source of truth used by berdekatan.html and kawasan.html,
// called with the same plain fetch (PostgREST exposes RPCs under
// /rest/v1/rpc/). Fallback: the previous in-memory aggregation, so the
// sitemap keeps working even if the RPC or its anon grant is ever missing.
//
// The RPC excludes is_demo as of 2026-08-04 (verified 2026-08-07 against
// pg_get_functiondef). The fallback path below filters it too, so both
// routes are consistent.
async function getKawasanTowns() {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/get_kawasan_towns`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ min_schools: KAWASAN_TOWN_MIN_SCHOOLS }),
    });
    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length > 0) {
        return rows.map(r => r.town).sort();
      }
    }
    console.error('get_kawasan_towns RPC unavailable, using fallback aggregation');
  } catch (err) {
    console.error('get_kawasan_towns RPC failed, using fallback aggregation:', err);
  }
  return getKawasanTownsFallback();
}

// Verified colloquial labels. Counted the way kawasan.html itself queries
// (town OR neighbourhood, substring, case-insensitive) so a label is only
// published if the page it points at actually has schools. On any failure
// this returns [] and the sitemap degrades to the town list alone -- which
// is exactly the pre-2026-07-27 behaviour, not a break.
//
// Like getKawasanTowns(), this RPC excludes is_demo as of 2026-08-04
// (verified 2026-08-07). It was never exposed in practice either, since the
// demo school's town='Demo' matches none of the KAWASAN_LINKED_LABELS.
async function getKawasanLabels() {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/get_kawasan_label_counts`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        labels: KAWASAN_LINKED_LABELS,
        min_schools: KAWASAN_LABEL_MIN_SCHOOLS,
      }),
    });
    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows)) return rows.map(r => r.label);
    }
    console.error('get_kawasan_label_counts RPC unavailable; town list only');
  } catch (err) {
    console.error('get_kawasan_label_counts RPC failed; town list only:', err);
  }
  return [];
}

// Fallback: fetch only the `town` column, paged, aggregate in-memory.
// PostgREST's table endpoint doesn't support GROUP BY without an RPC.
async function getKawasanTownsFallback() {
  let all   = [];
  let page  = 0;
  const size = 1000;

  while (true) {
    // is_demo=eq.false added 2026-08-03 -- fixed explicitly even though
    // the demo school (1 row, town='Demo') could never cross
    // KAWASAN_TOWN_MIN_SCHOOLS (50) on its own; relying on that threshold
    // as the only protection is exactly the kind of "safe by coincidence"
    // gap this session has been closing everywhere else too.
    const res = await fetch(
      `${SB_URL}/rest/v1/schools?select=town&is_active=eq.true&is_demo=eq.false&town=not.is.null&limit=${size}&offset=${page * size}`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    const rows = await res.json();
    if (!rows || rows.length === 0) break;
    all = all.concat(rows);
    if (rows.length < size) break;
    page++;
  }

  const counts = {};
  for (const r of all) {
    counts[r.town] = (counts[r.town] || 0) + 1;
  }

  return Object.entries(counts)
    .filter(([, count]) => count >= KAWASAN_TOWN_MIN_SCHOOLS)
    .map(([town]) => town)
    .sort();
}

export default async function handler(req, res) {
  try {
    const [schools, kawasanTowns, kawasanLabels] = await Promise.all([
      getAllSlugs(),
      getKawasanTowns(),
      getKawasanLabels(),
    ]);

    // Merge registry towns with verified colloquial labels, de-duplicating
    // case-insensitively so 'Pasir Gudang' and 'PASIR GUDANG' can never
    // both be published as separate URLs for the same page.
    const seenTowns = new Set();
    const allKawasan = [];
    for (const name of [...kawasanTowns, ...kawasanLabels]) {
      const key = String(name || '').trim().toLowerCase();
      if (!key || seenTowns.has(key)) continue;
      seenTowns.add(key);
      allKawasan.push(String(name).trim());
    }
    allKawasan.sort();

    // Static pages. No lastmod here (see header note) -- these are hand-
    // maintained files with no reliable per-page modification timestamp;
    // a fake "today" on every generation is worse than omitting it.
    const staticPages = [
      { url: '/',                          priority: '1.0', freq: 'daily'   },
      { url: '/berdekatan.html',          priority: '0.9', freq: 'weekly'  },
      { url: '/claim.html',               priority: '0.8', freq: 'monthly' },
      // Added 2026-07-21 -- owner-facing legitimacy page (untuk-sekolah);
      // also the landing link for school outreach. Update this list when
      // owner-facing pages change.
      { url: '/untuk-sekolah.html',       priority: '0.8', freq: 'monthly' },
      // Added 2026-07-27 -- linked from the main nav ("Cari Ikut Negeri")
      // but missing from this list entirely.
      { url: '/statistik.html',           priority: '0.6', freq: 'weekly'  },
      { url: '/privacy.html',             priority: '0.3', freq: 'yearly'  },
      { url: '/jobs.html',                priority: '0.7', freq: 'daily'   },
      { url: '/cara-pilih-tadika.html',   priority: '0.8', freq: 'monthly' },
      { url: '/tadika-terbaik-selangor.html', priority: '0.8', freq: 'monthly' },
      { url: '/yuran-tadika-malaysia.html',   priority: '0.8', freq: 'monthly' },
      { url: '/panduan-pendaftaran-taska.html', priority: '0.8', freq: 'monthly' },
      // Added 2026-07-15 -- these three guides existed on-site (linked from
      // index.html's Panduan & Tips section) but were missing from the
      // sitemap entirely.
      { url: '/panduan-pendaftaran-prasekolah.html', priority: '0.8', freq: 'monthly' },
      { url: '/kpm-vs-jkm-tadika-taska.html',         priority: '0.8', freq: 'monthly' },
      { url: '/persediaan-hari-pertama-tadika.html',  priority: '0.8', freq: 'monthly' },
      // Added 2026-08-04 -- new guide on ePrasekolah KPM registration/appeal,
      // written after real demand seen on Threads (parents asking/sharing
      // feelings after rejection), content verified against the official
      // KPM user manual (Buku Panduan Pengguna Sistem E-Prasekolah).
      { url: '/panduan-permohonan-prasekolah-kpm.html', priority: '0.8', freq: 'monthly' },
      // Added 2026-08-16 -- TASKA/TADIKA cost + compliance guides for
      // aspiring and current operators. Distinct audience from the guides
      // above (which are parent-facing) -- these target the "untuk
      // sekolah" persona. Cost figures verified against JKM/KPM primary
      // sources (Peraturan-Peraturan Taman Asuhan Kanak-Kanak 2012,
      // KPM Garis Panduan Penubuhan Tadika Swasta) before publishing.
      { url: '/kos-buka-taska.html',              priority: '0.8', freq: 'monthly' },
      { url: '/kos-buka-tadika.html',              priority: '0.8', freq: 'monthly' },
      { url: '/panduan-pematuhan-taska.html',      priority: '0.8', freq: 'monthly' },
      { url: '/panduan-pematuhan-tadika.html',     priority: '0.8', freq: 'monthly' },
      // Added 2026-08-22 -- interactive companion tool to the two cost
      // guides above. Linked from both guides (post-modal-kerja CTA) and
      // from panduan.html section 5 (g13, first card -- highest visibility
      // in that grid). Same "untuk sekolah" persona as kos-buka-taska/tadika,
      // so same priority; no lastmod, same reasoning as the rest of this
      // hand-maintained list (no reliable per-page timestamp).
      { url: '/kalkulator-kos-taska-tadika.html',  priority: '0.8', freq: 'monthly' },
      // Added 2026-08-05 -- guides index. Higher priority than the individual
      // guides because it is the hub that links all 12 of them; the guides
      // themselves stay at 0.8. Plain .html file, so no vercel.json rewrite
      // is needed (that requirement is only for clean slug routes).
      { url: '/panduan.html', priority: '0.9', freq: 'weekly' },
      { url: '/tadika-selangor',          priority: '0.9', freq: 'weekly'  },
      { url: '/tadika-johor',             priority: '0.9', freq: 'weekly'  },
      { url: '/tadika-kuala-lumpur',      priority: '0.9', freq: 'weekly'  },
      { url: '/tadika-perak',             priority: '0.8', freq: 'weekly'  },
      { url: '/tadika-pulau-pinang',      priority: '0.8', freq: 'weekly'  },
      { url: '/tadika-kedah',             priority: '0.8', freq: 'weekly'  },
      { url: '/tadika-kelantan',          priority: '0.8', freq: 'weekly'  },
      { url: '/tadika-terengganu',        priority: '0.8', freq: 'weekly'  },
      { url: '/tadika-pahang',            priority: '0.8', freq: 'weekly'  },
      { url: '/tadika-negeri-sembilan',   priority: '0.8', freq: 'weekly'  },
      { url: '/tadika-melaka',            priority: '0.8', freq: 'weekly'  },
      { url: '/tadika-perlis',            priority: '0.7', freq: 'weekly'  },
      { url: '/tadika-sabah',             priority: '0.8', freq: 'weekly'  },
      { url: '/tadika-sarawak',           priority: '0.8', freq: 'weekly'  },
      { url: '/tadika-putrajaya',         priority: '0.7', freq: 'weekly'  },
      { url: '/tadika-labuan',            priority: '0.7', freq: 'weekly'  },
    ];

    const staticXml = staticPages.map(p => `
  <url>
    <loc>${escapeXml(BASE + p.url)}</loc>
    <changefreq>${p.freq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('');

    // Kawasan (town) pages -- registry towns plus verified colloquial
    // labels, see getKawasanTowns() and getKawasanLabels().
    const kawasanXml = allKawasan.map(town => `
  <url>
    <loc>${escapeXml(BASE + '/kawasan.html?bandar=' + encodeURIComponent(town))}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`).join('');

    // School pages -- lastmod here is legitimate (real per-row updated_at
    // from the DB), unlike the static pages above.
    // Added 2026-09-02: filters out any slug that doesn't match the
    // established clean-slug shape (see isValidSlug above), and skips
    // duplicates rather than silently publishing two <url> entries
    // pointing at the same path -- the same dedup principle already used
    // for kawasan town labels above, extended here. Logs both cases
    // rather than failing the whole sitemap over one bad row.
    const today = new Date().toISOString().split('T')[0];
    const seenSlugs = new Set();
    let invalidSlugCount = 0;
    let duplicateSlugCount = 0;
    const schoolXml = schools.filter(s => {
      if (!isValidSlug(s.slug)) { invalidSlugCount++; return false; }
      if (seenSlugs.has(s.slug)) { duplicateSlugCount++; return false; }
      seenSlugs.add(s.slug);
      return true;
    }).map(s => {
      const lastmod = s.updated_at
        ? s.updated_at.split('T')[0]
        : today;
      return `
  <url>
    <loc>${escapeXml(BASE + '/school/' + s.slug)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
    }).join('');
    if (invalidSlugCount > 0) console.error(`Sitemap: skipped ${invalidSlugCount} school(s) with an invalid/missing slug`);
    if (duplicateSlugCount > 0) console.error(`Sitemap: skipped ${duplicateSlugCount} duplicate school slug(s)`);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticXml}
${kawasanXml}
${schoolXml}
</urlset>`;

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 'public, s-maxage=86400'); // cache 24hrs
    res.status(200).send(xml);

  } catch (err) {
    console.error('Sitemap error:', err);
    res.status(500).send('Error generating sitemap');
  }
}
