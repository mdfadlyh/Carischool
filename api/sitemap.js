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
// ─────────────────────────────────────────────────────────────

const SB_URL = process.env.SUPABASE_URL || 'https://pwbuhlwxnnxvtbqehyvy.supabase.co';
const SB_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3YnVobHd4bm54dnRicWVoeXZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNTc4MTIsImV4cCI6MjA5MzczMzgxMn0.jIPBjCIazqMw6F-luFEebNy_YV6V35f2-LlnN9SDGiQ';
const BASE   = 'https://www.carischools.com';

// Minimum active schools a town needs to earn its own kawasan sitemap entry.
// 50 was chosen because it currently yields 53 towns -- a meaningful expansion
// from the old hardcoded 14 without including every marginal town. Adjust
// freely; this is the one number to revisit if the sitemap ever feels too
// thin or too bloated.
const KAWASAN_TOWN_MIN_SCHOOLS = 50;

async function getAllSlugs() {
  let all   = [];
  let page  = 0;
  const size = 1000;

  while (true) {
    // IMPORTANT: filter is_active=true -- without this, expired JKM
    // registrations (currently 372+) and deactivated duplicate entries
    // get submitted to Google as indexable pages, wasting crawl budget
    // on pages that arguably shouldn't be prioritized for discovery.
    const res = await fetch(
      `${SB_URL}/rest/v1/schools?select=slug,updated_at&slug=not.is.null&is_active=eq.true&order=id.asc&limit=${size}&offset=${page * size}`,
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

// Generates the kawasan town list dynamically from real active-school counts
// instead of a hardcoded array (M23). Only fetches the `town` column, paged,
// then aggregates in-memory -- PostgREST's table endpoint doesn't support
// GROUP BY directly without a custom RPC, and this keeps the function
// dependency-free (plain fetch, matching the rest of the API layer).
async function getKawasanTowns() {
  let all   = [];
  let page  = 0;
  const size = 1000;

  while (true) {
    const res = await fetch(
      `${SB_URL}/rest/v1/schools?select=town&is_active=eq.true&town=not.is.null&limit=${size}&offset=${page * size}`,
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
    const [schools, kawasanTowns] = await Promise.all([
      getAllSlugs(),
      getKawasanTowns(),
    ]);

    // Static pages. No lastmod here (see header note) -- these are hand-
    // maintained files with no reliable per-page modification timestamp;
    // a fake "today" on every generation is worse than omitting it.
    const staticPages = [
      { url: '/',                          priority: '1.0', freq: 'daily'   },
      { url: '/berdekatan.html',          priority: '0.9', freq: 'weekly'  },
      { url: '/claim.html',               priority: '0.8', freq: 'monthly' },
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
    <loc>${BASE}${p.url}</loc>
    <changefreq>${p.freq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('');

    // Kawasan (town) pages -- generated dynamically, see getKawasanTowns().
    const kawasanXml = kawasanTowns.map(town => `
  <url>
    <loc>${BASE}/kawasan.html?bandar=${encodeURIComponent(town)}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`).join('');

    // School pages -- lastmod here is legitimate (real per-row updated_at
    // from the DB), unlike the static pages above.
    const today = new Date().toISOString().split('T')[0];
    const schoolXml = schools.map(s => {
      const lastmod = s.updated_at
        ? s.updated_at.split('T')[0]
        : today;
      return `
  <url>
    <loc>${BASE}/school/${s.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
    }).join('');

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
