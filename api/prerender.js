// /api/prerender.js
//
// Serves fully-rendered, no-JavaScript HTML to AI crawlers that do not execute
// JS (OAI-SearchBot, PerplexityBot, ClaudeBot, etc).
//
// Human visitors and Googlebot are NOT routed here -- see vercel.json. Googlebot
// already renders school.html/kawasan.html correctly and ranks them at pos 6-8;
// there is no upside in changing what works, and excluding it keeps us clear of
// any dynamic-rendering / cloaking argument.
//
// CONTENT PARITY RULE: everything emitted here must also be visible to a human
// on the equivalent client-rendered page. Never add a field here that the real
// page doesn't show. Divergence is what turns dynamic rendering into cloaking.
//
// Routes handled:
//   /api/prerender?type=school&slug=<slug>
//   /api/prerender?type=kawasan&bandar=<town>

const SB_URL = process.env.SUPABASE_URL
  || 'https://pwbuhlwxnnxvtbqehyvy.supabase.co';

// Same public anon key already exposed in school.html. RLS-protected, read-only.
// No new secret is introduced by having it here.
const SB_KEY = process.env.SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3YnVobHd4bm54dnRicWVoeXZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNTc4MTIsImV4cCI6MjA5MzczMzgxMn0.jIPBjCIazqMw6F-luFEebNy_YV6V35f2-LlnN9SDGiQ';

const SITE = 'https://www.carischools.com';

// ---------- helpers ----------

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sb(path) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      Accept: 'application/json'
    }
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

// The registration-status line. This is the field no other source carries --
// Google has ratings and hours; JKM's own directory lists expired licences
// without flagging them. jkm_valid_to is the validity signal.
function registrationStatus(s) {
  const isJKM = (s.agency === 'JKM' || s.category === 'JKM');

  if (isJKM && s.jkm_registration_no) {
    const validTo = s.jkm_valid_to ? new Date(s.jkm_valid_to) : null;
    const expired = validTo && validTo < new Date();
    if (expired) {
      return {
        label: `Lesen JKM ${s.jkm_registration_no} tamat tempoh pada ${s.jkm_valid_to}`,
        labelEn: `JKM licence ${s.jkm_registration_no} expired on ${s.jkm_valid_to}`,
        state: 'expired'
      };
    }
    return {
      label: s.jkm_valid_to
        ? `Berdaftar dengan JKM (${s.jkm_registration_no}), sah sehingga ${s.jkm_valid_to}`
        : `Berdaftar dengan JKM (${s.jkm_registration_no})`,
      labelEn: s.jkm_valid_to
        ? `Registered with JKM (${s.jkm_registration_no}), valid until ${s.jkm_valid_to}`
        : `Registered with JKM (${s.jkm_registration_no})`,
      state: 'valid'
    };
  }

  if (s.school_code) {
    return {
      label: `Berdaftar dengan KPM (kod sekolah ${s.school_code})`,
      labelEn: `Registered with MOE Malaysia (school code ${s.school_code})`,
      state: 'valid'
    };
  }

  return {
    label: 'Status pendaftaran belum disahkan dalam rekod CariSchool',
    labelEn: 'Registration status not yet confirmed in CariSchool records',
    state: 'unknown'
  };
}

function feeLine(s) {
  if (s.fee_min) {
    const max = s.fee_max || s.fee_min;
    const src = s.is_claimed ? 'Disahkan Sekolah' : 'Sumber: Laman Web Sekolah';
    return {
      text: `RM${s.fee_min}${max !== s.fee_min ? `–RM${max}` : ''} sebulan`,
      source: src
    };
  }
  return null;
}

function shell({ title, desc, canonical, jsonld, body }) {
  return `<!DOCTYPE html>
<html lang="ms">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="index, follow">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="ms_MY">
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
</head>
<body>
${body}
<hr>
<p><small>CariSchool Malaysia — direktori tadika berdaftar KPM dan taska berdaftar JKM.
Data daripada pendaftaran awam KPM/JKM. Bukan afiliasi rasmi KPM atau JKM.</small></p>
</body>
</html>`;
}

// ---------- school ----------

async function renderSchool(slug) {
  const key = encodeURIComponent(slug);
  let rows = await sb(`schools?slug=eq.${key}&limit=1`);
  if (!rows.length) rows = await sb(`schools?id=eq.${key}&limit=1`);
  if (!rows.length) return null;

  const s = rows[0];
  const name = s.commercial_name || s.name || 'Sekolah';
  const place = [s.town || s.district, s.state].filter(Boolean).join(', ');
  const reg = registrationStatus(s);
  const fee = feeLine(s);
  const canonical = `${SITE}/school/${s.slug || s.id}`;
  const isJKM = (s.agency === 'JKM' || s.category === 'JKM');

  const title = `${name}${place ? ` — ${place}` : ''} | CariSchool`;
  const desc = [
    `${name}${place ? ` di ${place}` : ''}.`,
    reg.label + '.',
    fee ? `Anggaran yuran ${fee.text}.` : null
  ].filter(Boolean).join(' ').slice(0, 300);

  const jsonld = {
    '@context': 'https://schema.org',
    '@type': isJKM ? 'ChildCare' : 'Preschool',
    name,
    url: canonical,
    description: s.description || desc,
    address: {
      '@type': 'PostalAddress',
      streetAddress: s.address || '',
      addressLocality: s.town || s.district || '',
      addressRegion: s.state || '',
      postalCode: s.postcode || '',
      addressCountry: 'MY'
    }
  };
  if (s.lat && s.lng) {
    jsonld.geo = { '@type': 'GeoCoordinates', latitude: s.lat, longitude: s.lng };
  }
  if (s.phone) jsonld.telephone = s.phone;
  if (s.website) jsonld.sameAs = [s.website];
  if (s.photo_url) jsonld.image = s.photo_url;
  if (s.google_rating && s.google_reviews_count) {
    jsonld.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: String(s.google_rating),
      reviewCount: String(s.google_reviews_count)
    };
  }
  if (s.fee_min) {
    jsonld.priceRange = `RM${s.fee_min}–RM${s.fee_max || s.fee_min}`;
  }
  if (s.opens_at && s.closes_at) {
    jsonld.openingHours = `Mo-Fr ${String(s.opens_at).slice(0, 5)}-${String(s.closes_at).slice(0, 5)}`;
  }
  // Registration is the differentiating fact. Expose it as structured data,
  // not just prose, so an agent can lift it cleanly.
  jsonld.identifier = isJKM && s.jkm_registration_no
    ? { '@type': 'PropertyValue', name: 'JKM Registration Number', value: s.jkm_registration_no }
    : (s.school_code
        ? { '@type': 'PropertyValue', name: 'KPM School Code', value: s.school_code }
        : undefined);
  if (!jsonld.identifier) delete jsonld.identifier;

  const rows_ = [
    ['Nama', name],
    ['Nama rasmi', s.name && s.name !== name ? s.name : null],
    ['Alamat', s.address],
    ['Bandar', s.town || s.district],
    ['Negeri', s.state],
    ['Poskod', s.postcode],
    ['Jenis', isJKM ? 'Taska (pusat jagaan, berdaftar JKM)' : 'Tadika (prasekolah, berdaftar KPM)'],
    ['Status pendaftaran', reg.label],
    ['Umur diterima', (s.age_min_years && s.age_max_years) ? `${s.age_min_years}–${s.age_max_years} tahun` : null],
    ['Waktu operasi', s.operating_hours || ((s.opens_at && s.closes_at) ? `${String(s.opens_at).slice(0,5)}–${String(s.closes_at).slice(0,5)}` : null)],
    ['Yuran', fee ? `${fee.text} (${fee.source})` : null],
    ['Kurikulum', s.curriculum],
    ['Bahasa', s.languages],
    ['Telefon', s.phone],
    ['Laman web', s.website],
    ['Penarafan Google', (s.google_rating && s.google_reviews_count) ? `${s.google_rating}/5 daripada ${s.google_reviews_count} ulasan` : null]
  ].filter(r => r[1]);

  const body = `
<h1>${esc(name)}</h1>
<p>${esc(place)}</p>

<h2>Status pendaftaran</h2>
<p><strong>${esc(reg.label)}</strong></p>
<p>${esc(reg.labelEn)}</p>

<h2>Maklumat sekolah</h2>
<table>
<tbody>
${rows_.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('\n')}
</tbody>
</table>

${s.description ? `<h2>Perihal</h2>\n<p>${esc(s.description)}</p>` : ''}

<p><a href="${esc(canonical)}">Lihat profil penuh di CariSchool</a></p>`;

  return shell({ title, desc, canonical, jsonld, body });
}

// ---------- kawasan ----------

const COLS = 'id,slug,name,commercial_name,category,agency,town,state,district,'
  + 'address,postcode,school_code,jkm_registration_no,jkm_valid_to,'
  + 'fee_min,fee_max,is_claimed,google_rating,google_reviews_count';

async function renderKawasan(bandar) {
  const rows = await sb(
    `schools?town=eq.${encodeURIComponent(bandar)}&is_active=eq.true`
    + `&select=${COLS}&order=commercial_name.asc&limit=200`
  );
  if (!rows.length) return null;

  const canonical = `${SITE}/kawasan.html?bandar=${encodeURIComponent(bandar)}`;
  const jkm = rows.filter(r => r.agency === 'JKM' || r.category === 'JKM');
  const kpm = rows.filter(r => !(r.agency === 'JKM' || r.category === 'JKM'));

  const title = `Tadika & Taska Berdaftar di ${bandar} | CariSchool`;
  const desc = `Senarai tadika berdaftar KPM dan taska berdaftar JKM di ${bandar}, `
    + `termasuk status pendaftaran, alamat dan yuran di mana tersedia.`;

  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Tadika dan taska berdaftar di ${bandar}`,
    numberOfItems: rows.length,
    itemListElement: rows.slice(0, 100).map((r, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': (r.agency === 'JKM' || r.category === 'JKM') ? 'ChildCare' : 'Preschool',
        name: r.commercial_name || r.name,
        url: `${SITE}/school/${r.slug || r.id}`,
        address: {
          '@type': 'PostalAddress',
          addressLocality: r.town || r.district || '',
          addressRegion: r.state || '',
          addressCountry: 'MY'
        }
      }
    }))
  };

  const li = r => {
    const reg = registrationStatus(r);
    const fee = feeLine(r);
    return `<li><a href="${SITE}/school/${esc(r.slug || r.id)}">`
      + `${esc(r.commercial_name || r.name)}</a> — ${esc(reg.label)}`
      + (fee ? ` — yuran ${esc(fee.text)}` : '')
      + `</li>`;
  };

  const body = `
<h1>Tadika &amp; taska berdaftar di ${esc(bandar)}</h1>
<p>${rows.length} sekolah berdaftar direkodkan di ${esc(bandar)}.
Setiap penyenaraian menunjukkan status pendaftaran rasmi.</p>

${jkm.length ? `<h2>Taska — pusat jagaan berdaftar JKM (${jkm.length})</h2>
<ul>\n${jkm.map(li).join('\n')}\n</ul>` : ''}

${kpm.length ? `<h2>Tadika — prasekolah berdaftar KPM (${kpm.length})</h2>
<ul>\n${kpm.map(li).join('\n')}\n</ul>` : ''}

<p><a href="${esc(canonical)}">Lihat senarai penuh di CariSchool</a></p>`;

  return shell({ title, desc, canonical, jsonld, body });
}

// ---------- handler ----------

export default async function handler(req, res) {
  try {
    const { type, slug, bandar } = req.query;
    let html = null;

    if (type === 'school' && slug) html = await renderSchool(slug);
    else if (type === 'kawasan' && bandar) html = await renderKawasan(bandar);

    if (!html) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(404).send(
        '<!DOCTYPE html><html lang="ms"><head><meta charset="utf-8">'
        + '<title>Tidak dijumpai — CariSchool</title>'
        + '<meta name="robots" content="noindex"></head>'
        + '<body><h1>Tidak dijumpai</h1></body></html>'
      );
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.setHeader('X-Robots-Tag', 'index, follow');
    return res.status(200).send(html);

  } catch (err) {
    console.error('[prerender]', err);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // 503 not 500: tells a crawler to retry rather than treat the URL as dead.
    return res.status(503).send(
      '<!DOCTYPE html><html lang="ms"><head><meta charset="utf-8">'
      + '<title>Sementara tidak tersedia</title></head>'
      + '<body><p>Sementara tidak tersedia.</p></body></html>'
    );
  }
}
