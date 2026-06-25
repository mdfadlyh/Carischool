// ─────────────────────────────────────────────────────────────
// CariSchool — Dynamic Sitemap
// Vercel Serverless Function: /api/sitemap
// Generates sitemap.xml with all 7,809 school slug URLs
// ─────────────────────────────────────────────────────────────

const SB_URL = process.env.SUPABASE_URL || 'https://pwbuhlwxnnxvtbqehyvy.supabase.co';
const SB_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3YnVobHd4bm54dnRicWVoeXZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNTc4MTIsImV4cCI6MjA5MzczMzgxMn0.jIPBjCIazqMw6F-luFEebNy_YV6V35f2-LlnN9SDGiQ';
const BASE   = 'https://www.carischools.com';

async function getAllSlugs() {
  let all   = [];
  let page  = 0;
  const size = 1000;

  while (true) {
    const res = await fetch(
      `${SB_URL}/rest/v1/schools?select=slug,updated_at&slug=not.is.null&order=id.asc&limit=${size}&offset=${page * size}`,
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

export default async function handler(req, res) {
  try {
    const schools = await getAllSlugs();
    const today   = new Date().toISOString().split('T')[0];

    // Static pages
    const staticPages = [
      { url: '/',                          priority: '1.0', freq: 'daily'   },
      { url: '/claim.html',               priority: '0.8', freq: 'monthly' },
      { url: '/privacy.html',             priority: '0.3', freq: 'yearly'  },
      { url: '/jobs.html',                priority: '0.7', freq: 'daily'   },
      { url: '/cara-pilih-tadika.html',   priority: '0.8', freq: 'monthly' },
      { url: '/tadika-terbaik-selangor.html', priority: '0.8', freq: 'monthly' },
      { url: '/yuran-tadika-malaysia.html',   priority: '0.8', freq: 'monthly' },
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
      // Town/area SEO landing pages (kawasan.html template)
      { url: '/kawasan.html?bandar=Petaling%20Jaya', priority: '0.8', freq: 'weekly' },
      { url: '/kawasan.html?bandar=Shah%20Alam',     priority: '0.8', freq: 'weekly' },
      { url: '/kawasan.html?bandar=Subang%20Jaya',   priority: '0.8', freq: 'weekly' },
      { url: '/kawasan.html?bandar=Bangi',           priority: '0.8', freq: 'weekly' },
      { url: '/kawasan.html?bandar=Klang',           priority: '0.8', freq: 'weekly' },
      { url: '/kawasan.html?bandar=Johor%20Bahru',   priority: '0.8', freq: 'weekly' },
      { url: '/kawasan.html?bandar=Ipoh',            priority: '0.8', freq: 'weekly' },
      { url: '/kawasan.html?bandar=George%20Town',   priority: '0.8', freq: 'weekly' },
      { url: '/kawasan.html?bandar=Kota%20Kinabalu',  priority: '0.8', freq: 'weekly' },
      { url: '/kawasan.html?bandar=Kuching',          priority: '0.8', freq: 'weekly' },
      { url: '/kawasan.html?bandar=Seremban',         priority: '0.8', freq: 'weekly' },
      { url: '/kawasan.html?bandar=Melaka',           priority: '0.8', freq: 'weekly' },
      { url: '/kawasan.html?bandar=Kuantan',          priority: '0.8', freq: 'weekly' },
      { url: '/kawasan.html?bandar=Kuala%20Lumpur',   priority: '0.8', freq: 'weekly' },
    ];

    const staticXml = staticPages.map(p => `
  <url>
    <loc>${BASE}${p.url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.freq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('');

    // School pages
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
