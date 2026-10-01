import { readFileSync } from 'fs';
import { join } from 'path';

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
// The rule has a second edge that was being missed: parity is about the SET OF
// ROWS as much as the set of fields. If this route's query matches a different
// population than the page it stands in for, the crawler sees a different site.
// Any change to a matcher in school.html or kawasan.html must be mirrored here
// in the same session.
//
// Routes handled:
//   /api/prerender?type=school&slug=<slug>
//   /api/prerender?type=kawasan&bandar=<town>
//   /api/prerender?type=berdekatan&bandar=<town>  (added 2026-09-17, see
//     renderBerdekatan() below for why this deliberately reuses renderKawasan's
//     matcher instead of the client's GPS/box-distance logic)
//   /api/prerender?type=berdekatan&bandar=<town>&lang=en  (added 2026-09-24)
//     English branch. NOT invented copy -- berdekatan.html already ships a
//     real client-side English translation (TRANSLATIONS.en, toggled via
//     localStorage cs_lang), so this mirrors strings that already exist and
//     are already shown to human visitors who toggle to English. Content
//     parity rule is satisfied by construction: same page, same facts, the
//     language a human can already select. Added because Clarity AI-citation
//     data showed 0% citation on English "near me" queries (tadika near me,
//     kindergarten near me, playschool near me, preschool near me) despite
//     the underlying data existing -- the crawlers that don't execute JS
//     were only ever served the Malay branch, regardless of query language.

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

    // Sanity-guard before asserting expiry (2026-08-06), mirroring
    // school.html. JKM registrations run 5 years and the registration number
    // carries its issue year (e.g. B/TI 099/2026), so expiry_year minus issue
    // year should be ~5. Audit on 2026-08-06: 3,317 of 3,373 records satisfy
    // that; 4 had the START date stored in jkm_valid_to and were therefore
    // being reported as lapsed when they almost certainly were not.
    // This route feeds AI crawlers that quote it verbatim, so a false
    // "tamat tempoh" here can end up restated as fact by a chatbot to a
    // parent choosing childcare. A record failing the check falls through to
    // the unconfirmed branch rather than either claiming validity or
    // claiming expiry. Dates are never auto-corrected -- inferring the real
    // expiry would be inventing data.
    // The year must be preceded by a non-digit, or a phone number stored in
    // this field (`010-4647629`) matches "7629" as its year, and a typo'd
    // `.../20222` matches "0222" -- both would then fail the gap check and
    // suppress a valid expiry. Bounded to a plausible range: if the year is
    // unreadable we do not guess, and the check simply passes.
    const regYearM = String(s.jkm_registration_no).match(/(?:^|\D)(\d{4})\s*$/);
    const regYear = regYearM && Number(regYearM[1]) >= 2000 && Number(regYearM[1]) <= 2100
      ? Number(regYearM[1]) : null;
    const expYear = validTo ? validTo.getFullYear() : null;
    const dateLooksSane = !regYear || !expYear
      || Math.abs((expYear - regYear) - 5) <= 1;

    if (validTo && !dateLooksSane) {
      return {
        label: `Berdaftar dengan JKM (${s.jkm_registration_no}) — tempoh sah perlu disahkan semula dengan JKM`,
        labelEn: `Registered with JKM (${s.jkm_registration_no}) — validity period needs reconfirmation with JKM`,
        state: 'unknown'
      };
    }

    const expired = validTo && dateLooksSane && validTo < new Date();
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

function feeLine(s, lang) {
  if (s.fee_min) {
    const max = s.fee_max || s.fee_min;
    // Provenance wording, corrected 2026-08-06 (Fadly's call). This previously
    // told crawlers an unclaimed school's fee came from "Laman Web Sekolah" --
    // the school's own website. That branch is also hit by admin-curated and
    // crawler-sourced figures, so the claim was not something this route could
    // stand behind. The whole product rests on being right about where data
    // comes from, and this text is served to AI surfaces that quote it
    // verbatim. Broadened to cover every non-claimed source honestly.
    // "Disahkan Sekolah" is unchanged -- that one IS verified, via the claim.
    if (lang === 'en') {
      const srcEn = s.is_claimed
        ? 'Verified by School'
        : 'Source: public records / school website';
      return {
        text: `RM${s.fee_min}${max !== s.fee_min ? `–RM${max}` : ''}/month`,
        source: srcEn
      };
    }
    const src = s.is_claimed
      ? 'Disahkan Sekolah'
      : 'Sumber: rekod awam / laman web sekolah';
    return {
      text: `RM${s.fee_min}${max !== s.fee_min ? `–RM${max}` : ''} sebulan`,
      source: src
    };
  }
  return null;
}

function shell({ title, desc, canonical, jsonld, body, lang, alternates }) {
  const isEn = lang === 'en';
  const footer = isEn
    ? 'CariSchool Malaysia — directory of MOE(KPM)-registered kindergartens/preschools '
      + 'and JKM-registered childcare/daycare centres (taska). Data from public KPM/JKM '
      + 'registration records. Not officially affiliated with KPM or JKM.'
    : 'CariSchool Malaysia — direktori tadika berdaftar KPM dan taska berdaftar JKM.'
      + ' Data daripada pendaftaran awam KPM/JKM. Bukan afiliasi rasmi KPM atau JKM.';

  // hreflang alternates -- this is the discovery mechanism for the English
  // branch. The client page's language toggle is a localStorage flag a
  // non-JS crawler can never see, so without explicit alternate links there
  // is no path from the Malay URL to ?lang=en (or back) for a crawler that
  // only follows <link> tags. Both directions are emitted from whichever
  // side is currently rendering.
  const altTags = (alternates || [])
    .map(a => `<link rel="alternate" hreflang="${esc(a.hreflang)}" href="${esc(a.href)}">`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="${isEn ? 'en' : 'ms'}">
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
<meta property="og:locale" content="${isEn ? 'en_MY' : 'ms_MY'}">
${altTags}
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
</head>
<body>
${body}
<hr>
<p><small>${esc(footer)}</small></p>
</body>
</html>`;
}

// ---------- school ----------

async function renderSchool(slug, lang, opts) {
  const isEn = lang === 'en';
  const key = encodeURIComponent(slug);
  // is_active AND is_demo are both required here (M34). This route had
  // NEITHER, which made it the worst place in the codebase to be missing them:
  // the output is static HTML served straight to training and indexing
  // crawlers under `X-Robots-Tag: index, follow`. A deactivated school or the
  // sandbox row reaching a model's index is not something a later fix retracts
  // the way a client-rendered page is. Returning null yields the 404 shell,
  // which is already noindex.
  const FILTER = '&is_active=eq.true&is_demo=eq.false';
  let rows = await sb(`schools?slug=eq.${key}${FILTER}&limit=1`);
  // M73: id=eq.${key} is a Postgres `uuid` column comparison -- PostgREST
  // throws 22P02 "invalid input syntax for type uuid" (not a 0-row result)
  // when `slug` isn't UUID-shaped. That's the normal case: most incoming
  // slugs are just wrong/stale/crawler-guessed strings, not UUIDs. Left
  // unguarded, that throw was caught by the outer handler's catch-all and
  // turned into a 503 ("Sementara tidak tersedia", tells crawlers to
  // retry) instead of a clean, permanent 404 -- ~50 distinct slugs/day per
  // Vercel runtime-error logs. Only attempt the id= fallback when `slug`
  // actually looks like a UUID (schools without a slug use their raw id as
  // the canonical URL, per `s.slug || s.id` below -- that path still needs
  // this query); anything else falls straight through to the 404 branch.
  const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
  if (!rows.length && looksLikeUuid) rows = await sb(`schools?id=eq.${key}${FILTER}&limit=1`);
  if (!rows.length) return null;

  const s = rows[0];
  const name = s.commercial_name || s.name || (isEn ? 'School' : 'Sekolah');
  const place = [s.town || s.district, s.state].filter(Boolean).join(', ');
  const reg = registrationStatus(s);
  const fee = feeLine(s, isEn ? 'en' : undefined);
  const canonicalMs = `${SITE}/school/${s.slug || s.id}`;
  const canonicalEn = `${canonicalMs}?lang=en`;
  const canonical = isEn ? canonicalEn : canonicalMs;
  const isJKM = (s.agency === 'JKM' || s.category === 'JKM');

  // Title is mostly proper nouns (school name, place), so it stays the same
  // shape in both languages -- unlike kawasan/berdekatan's generic directory
  // titles, there's nothing here that reads as Malay-only to translate.
  // Ahrefs audit 2026-10-01: 2,888 of 11,189 titles ran past ~65 chars.
  // Drop the state first (town is what parents actually search); keep the
  // full form when it fits. school.html mirrors this for its non-SSR path.
  const town0 = s.town || s.district || '';
  const titleFull = `${name}${place ? ` — ${place}` : ''} | CariSchool`;
  const title = titleFull.length <= 65 || !town0 ? titleFull : `${name} — ${town0} | CariSchool`;
  // Same audit: 3,181 descriptions under ~110 chars ("Name di Town. Berdaftar
  // KPM."). The tail only says what every profile page genuinely offers.
  const descTail = isEn
    ? ` Check location, registration & nearby schools — free on CariSchool.`
    : ` Semak lokasi, status pendaftaran & sekolah berdekatan — percuma.`;
  const descBase = isEn
    ? [
        `${name}${place ? ` in ${place}` : ''}.`,
        reg.labelEn + '.',
        fee ? `Estimated fee ${fee.text}.` : null
      ].filter(Boolean).join(' ')
    : [
        `${name}${place ? ` di ${place}` : ''}.`,
        reg.label + '.',
        fee ? `Anggaran yuran ${fee.text}.` : null
      ].filter(Boolean).join(' ');
  // Only when it still fits in ~160 chars, so a long name never trips "too long".
  const desc = (descBase.length + descTail.length <= 160 ? descBase + descTail : descBase).slice(0, 300);

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
  // aggregateRating deliberately NOT emitted (removed 2026-09-30). The rating
  // shown on the page is Google's, collected on Google Maps. Google's review
  // snippet guidelines exclude ratings aggregated from other sites, and the
  // penalty is a manual action that strips rich results site-wide. The star
  // rating stays VISIBLE to parents; it just isn't claimed as our own review
  // data in structured markup. Do not re-add without first-party reviews.
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

  const rows_ = isEn ? [
    ['Name', name],
    ['Official name', s.name && s.name !== name ? s.name : null],
    ['Address', s.address],
    ['Town', s.town || s.district],
    ['State', s.state],
    ['Postcode', s.postcode],
    ['Type', isJKM ? 'Taska (childcare centre, JKM-registered)' : 'Tadika (preschool, KPM-registered)'],
    ['Registration status', reg.labelEn],
    // `age_min_years`/`age_max_years` are not columns on `schools` -- the real
    // one is `age_range` (free text, 0.7% filled as of 2026-07-25). The old
    // expression was always falsy, so `.filter()` dropped this row every time
    // and nobody saw a failure: an invented column degrades into silence, not
    // an error (CLAUDE.md: nothing invented).
    ['Age range', s.age_range],
    ['Operating hours', s.operating_hours || ((s.opens_at && s.closes_at) ? `${String(s.opens_at).slice(0,5)}–${String(s.closes_at).slice(0,5)}` : null)],
    ['Fees', fee ? `${fee.text} (${fee.source})` : null],
    ['Curriculum', s.curriculum],
    ['Languages', s.languages],
    ['Phone', s.phone],
    ['Website', s.website],
    ['Google rating', (s.google_rating && s.google_reviews_count) ? `${s.google_rating}/5 from ${s.google_reviews_count} reviews` : null]
  ].filter(r => r[1]) : [
    ['Nama', name],
    ['Nama rasmi', s.name && s.name !== name ? s.name : null],
    ['Alamat', s.address],
    ['Bandar', s.town || s.district],
    ['Negeri', s.state],
    ['Poskod', s.postcode],
    ['Jenis', isJKM ? 'Taska (pusat jagaan, berdaftar JKM)' : 'Tadika (prasekolah, berdaftar KPM)'],
    ['Status pendaftaran', reg.label],
    // `age_min_years`/`age_max_years` are not columns on `schools` -- the real
    // one is `age_range` (free text, 0.7% filled as of 2026-07-25). The old
    // expression was always falsy, so `.filter()` dropped this row every time
    // and nobody saw a failure: an invented column degrades into silence, not
    // an error (CLAUDE.md: nothing invented).
    ['Umur diterima', s.age_range],
    ['Waktu operasi', s.operating_hours || ((s.opens_at && s.closes_at) ? `${String(s.opens_at).slice(0,5)}–${String(s.closes_at).slice(0,5)}` : null)],
    ['Yuran', fee ? `${fee.text} (${fee.source})` : null],
    ['Kurikulum', s.curriculum],
    ['Bahasa', s.languages],
    ['Telefon', s.phone],
    ['Laman web', s.website],
    ['Penarafan Google', (s.google_rating && s.google_reviews_count) ? `${s.google_rating}/5 daripada ${s.google_reviews_count} ulasan` : null]
  ].filter(r => r[1]);

  const body = isEn ? `
<h1>${esc(name)}</h1>
<p>${esc(place)}</p>

<h2>Registration status</h2>
<p><strong>${esc(reg.labelEn)}</strong></p>
<p>${esc(reg.label)}</p>

<h2>School information</h2>
<table>
<tbody>
${rows_.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('\n')}
</tbody>
</table>

${s.description ? `<h2>About</h2>\n<p>${esc(s.description)}</p>` : ''}

<p><a href="${esc(canonical)}">See full profile on CariSchool</a></p>` : `
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

  // Parts for renderSchoolPage() (the human/Googlebot page). Same facts,
  // same row, so the two outputs cannot drift apart.
  if (opts && opts.parts) {
    return { s, name, place, reg, title, desc, canonicalMs, jsonld, isJKM };
  }

  const alternates = [
    { hreflang: 'ms', href: canonicalMs },
    { hreflang: 'en', href: canonicalEn },
    { hreflang: 'x-default', href: canonicalMs }
  ];

  return shell({ title, desc, canonical, jsonld, body, lang: isEn ? 'en' : 'ms', alternates });
}

// ---------- school page for humans + Googlebot (added 2026-09-30) ----------
//
// WHY: until now every /school/:slug request from a person or Googlebot got
// school.html's static shell -- title "Profil Sekolah", canonical
// /school.html, no name, no H1, empty JSON-LD -- and only became a real page
// after JavaScript ran. Verified live 2026-09-30. Google indexes that first
// HTML before rendering, saw 11,000+ identical templates all declaring the
// same wrong canonical, and filed 1,000+ of them as "Duplicate, Google chose
// different canonical". WhatsApp/Facebook link previews read the same
// generic tags. The AI-bot route above already rendered each school
// correctly; this serves the SAME facts inside the normal interactive page,
// to everyone, so there is no bot/human divergence left to worry about.
//
// HOW: school.html is read from the deployment (bundled via vercel.json
// functions.includeFiles), and only its head tags, H1, breadcrumb and a
// "more schools in this town" link block are filled in. The page's own
// script still runs exactly as before and re-renders everything with live
// data. If anything here fails, the untouched template is returned -- never
// worse than the old behaviour.

let TEMPLATE = null;
function schoolTemplate() {
  if (!TEMPLATE) TEMPLATE = readFileSync(join(process.cwd(), 'school.html'), 'utf8');
  return TEMPLATE;
}

const STATE_SLUG = {
  'SELANGOR':'tadika-selangor','JOHOR':'tadika-johor','WP KUALA LUMPUR':'tadika-kuala-lumpur',
  'KUALA LUMPUR':'tadika-kuala-lumpur','PERAK':'tadika-perak','PULAU PINANG':'tadika-pulau-pinang',
  'KEDAH':'tadika-kedah','KELANTAN':'tadika-kelantan','TERENGGANU':'tadika-terengganu',
  'PAHANG':'tadika-pahang','NEGERI SEMBILAN':'tadika-negeri-sembilan','MELAKA':'tadika-melaka',
  'PERLIS':'tadika-perlis','SABAH':'tadika-sabah','SARAWAK':'tadika-sarawak',
  'WP PUTRAJAYA':'tadika-putrajaya','WP LABUAN':'tadika-labuan'
};

function setAttr(html, id, attr, value) {
  const re = new RegExp(`(<[^>]*\\bid="${id}"[^>]*\\b${attr}=")[^"]*(")`);
  return html.replace(re, (m, a, b) => a + esc(value) + b);
}
function setInner(html, id, inner) {
  const re = new RegExp(`(<([a-z0-9]+)[^>]*\\bid="${id}"[^>]*>)[\\s\\S]*?(</\\2>)`);
  return html.replace(re, (m, open, tag, close) => open + inner + close);
}

async function renderSchoolPage(slug) {
  const tpl = schoolTemplate();
  const p = await renderSchool(slug, 'ms', { parts: true });
  if (!p) {
    // Unknown slug: real 404 + noindex instead of a 200 "soft 404".
    return { status: 404, html: setAttr(tpl, 'pageRobots', 'content', 'noindex, follow') };
  }
  const { s, name, place, reg, title, desc, canonicalMs, jsonld, isJKM } = p;
  const town = s.town || s.district || '';

  // More schools of the same kind in the same town -- real crawlable links
  // (the JS "similar schools" widget only exists after rendering).
  let more = [];
  if (town) {
    const cat = isJKM ? 'category=eq.JKM' : 'category=neq.JKM';
    // Quoted: PostgREST or=() splits on commas/parens, and some town values
    // contain them. Inner double quotes are stripped rather than escaped.
    const t = encodeURIComponent(`"${town.replace(/"/g, '')}"`);
    more = await sb(`schools?select=slug,name,commercial_name&${cat}`
      + `&or=(town.eq.${t},district.eq.${t})&is_active=eq.true&is_demo=eq.false`
      + `&id=neq.${s.id}&slug=not.is.null`
      + `&order=is_claimed.desc,google_reviews_count.desc.nullslast,name.asc&limit=6`).catch(() => []);
    // Alphabetical neighbours, wrapping round to the start of the list.
    // Ahrefs (2026-10-01) found 1,092 orphan profiles: the popularity list
    // above always links the same top schools, and town pages cap their
    // lists. Linking the next 6 names in the same town/kind forms a ring, so
    // every profile with a town gets at least one crawlable inbound link.
    const base = `schools?select=slug,name,commercial_name&${cat}`
      + `&or=(town.eq.${t},district.eq.${t})&is_active=eq.true&is_demo=eq.false`
      + `&id=neq.${s.id}&slug=not.is.null&order=name.asc,id.asc`;
    let ring = await sb(`${base}&name=gte.${encodeURIComponent(s.name || '')}&limit=6`).catch(() => []);
    if (ring.length < 6) ring = ring.concat(await sb(`${base}&limit=${6 - ring.length}`).catch(() => []));
    const seen = new Set();
    more = more.concat(ring).filter(r => r.slug && !seen.has(r.slug) && seen.add(r.slug)).slice(0, 12);
  }

  const stSlug = STATE_SLUG[(s.state || '').toUpperCase()];
  const stUrl = stSlug ? `/${stSlug}` : `/?state=${encodeURIComponent(s.state || '')}`;
  const townUrl = town ? `/kawasan.html?bandar=${encodeURIComponent(town)}` : null;

  const crumbs = [
    { '@type': 'ListItem', position: 1, name: 'CariSchool', item: `${SITE}/` },
    s.state ? { '@type': 'ListItem', position: 2, name: s.state, item: `${SITE}${stUrl}` } : null,
    townUrl ? { '@type': 'ListItem', position: 3, name: town, item: `${SITE}${townUrl}` } : null,
    { '@type': 'ListItem', position: 4, name }
  ].filter(Boolean).map((c, i) => ({ ...c, position: i + 1 }));
  const breadcrumbLd = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs };

  let h = tpl;
  h = setInner(h, 'pageTitle', esc(title));
  h = setAttr(h, 'pageDesc', 'content', desc);
  h = setAttr(h, 'twTitle', 'content', title);
  h = setAttr(h, 'twDesc', 'content', desc);
  h = setAttr(h, 'ogTitle', 'content', title);
  h = setAttr(h, 'ogDesc', 'content', desc);
  if (s.photo_url) h = setAttr(h, 'ogImage', 'content', s.photo_url);
  h = setAttr(h, 'pageCanon', 'href', canonicalMs);
  h = h.replace('<script type="application/ld+json" id="schemaMarkup">{}</script>',
    `<script type="application/ld+json" id="schemaMarkup">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>`
    + `\n<script type="application/ld+json" id="ssrBreadcrumb">${JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c')}</script>`
    + `\n<meta property="og:url" content="${esc(canonicalMs)}">`
    + `\n<meta name="cs-ssr" content="1">`);
  h = setInner(h, 'schoolName', esc(name));
  h = setInner(h, 'schoolCode', esc(reg.label));
  h = setInner(h, 'breadState', ` › <a href="${esc(stUrl)}" style="color:var(--teal);text-decoration:none;">${esc(s.state || '')}</a>`);
  if (townUrl) h = setInner(h, 'breadDistrict', ` › <a href="${esc(townUrl)}" style="color:var(--teal);text-decoration:none;">${esc(town)}</a>`);
  h = setInner(h, 'breadSchool', esc(` › ${name}`));

  if (more.length && townUrl) {
    const kind = isJKM ? 'taska' : 'tadika';
    const links = more.map(r =>
      `<li><a href="/school/${esc(r.slug)}">${esc(r.commercial_name || r.name)}</a></li>`).join('');
    h = setInner(h, 'ssrMore',
      `<div class="section-title" id="ssrMoreTitle" data-kind="${kind}" data-town="${esc(town)}">`
      + `🏫 Lagi ${isJKM ? 'Taska' : 'Tadika'} di ${esc(town)}</div>`
      + `<ul class="ssr-more-list">${links}</ul>`
      + `<a class="ssr-more-all" id="ssrMoreAll" href="${esc(townUrl)}" data-town="${esc(town)}">Lihat semua di ${esc(town)} →</a>`);
    h = h.replace('<section class="section" id="ssrMore" hidden>', '<section class="section" id="ssrMore">');
  }
  return { status: 200, html: h };
}

// ---------- state pages (/tadika-selangor etc.), added 2026-09-30 ----------
//
// Same problem and same fix as renderSchoolPage(): all 16 state URLs served
// one identical template (title "Tadika & Prasekolah Malaysia", canonical =
// homepage) until JavaScript ran. This fills the head, H1, counts, town links
// and the first page of school cards into state.html. The page's own script
// then reloads everything live, exactly as before.
// KEEP IN SYNC with STATE_CONFIG and init() in state.html.

const STATE_PAGES = {
  'tadika-selangor':        { state:'SELANGOR',        name:'Selangor',        emoji:'🏙️', desc:'Negeri dengan pilihan tadika terbanyak di Malaysia' },
  'tadika-johor':           { state:'JOHOR',           name:'Johor',           emoji:'🌴', desc:'Tadika terbaik di Johor Bahru, Batu Pahat, Kluang dan seluruh Johor' },
  'tadika-kuala-lumpur':    { state:'WP KUALA LUMPUR', name:'Kuala Lumpur',    emoji:'🌆', desc:'Tadika premium dan antarabangsa di ibu kota Malaysia' },
  'tadika-perak':           { state:'PERAK',           name:'Perak',           emoji:'⛰️', desc:'Tadika berdaftar KPM di Ipoh, Taiping, Teluk Intan dan seluruh Perak' },
  'tadika-pulau-pinang':    { state:'PULAU PINANG',    name:'Pulau Pinang',    emoji:'🌊', desc:'Tadika terbaik di Georgetown, Butterworth dan seluruh Pulau Pinang' },
  'tadika-kedah':           { state:'KEDAH',           name:'Kedah',           emoji:'🌾', desc:'Tadika berdaftar KPM di Alor Setar, Sungai Petani dan seluruh Kedah' },
  'tadika-kelantan':        { state:'KELANTAN',        name:'Kelantan',        emoji:'🌙', desc:'Tadika dan prasekolah Islam di Kota Bharu dan seluruh Kelantan' },
  'tadika-terengganu':      { state:'TERENGGANU',      name:'Terengganu',      emoji:'🐢', desc:'Tadika berdaftar KPM di Kuala Terengganu, Kemaman dan seluruh Terengganu' },
  'tadika-pahang':          { state:'PAHANG',          name:'Pahang',          emoji:'🏔️', desc:'Tadika berdaftar KPM di Kuantan, Temerloh dan seluruh Pahang' },
  'tadika-negeri-sembilan': { state:'NEGERI SEMBILAN', name:'Negeri Sembilan', emoji:'🦅', desc:'Tadika berdaftar KPM di Seremban, Port Dickson dan seluruh Negeri Sembilan' },
  'tadika-melaka':          { state:'MELAKA',          name:'Melaka',          emoji:'🏯', desc:'Tadika berdaftar KPM di bandar bersejarah Melaka' },
  'tadika-perlis':          { state:'PERLIS',          name:'Perlis',          emoji:'🌸', desc:'Tadika berdaftar KPM di negeri terkecil Malaysia' },
  'tadika-sabah':           { state:'SABAH',           name:'Sabah',           emoji:'🌺', desc:'Tadika berdaftar KPM di Kota Kinabalu, Sandakan dan seluruh Sabah' },
  'tadika-sarawak':         { state:'SARAWAK',         name:'Sarawak',         emoji:'🦧', desc:'Tadika berdaftar KPM di Kuching, Miri, Sibu dan seluruh Sarawak' },
  'tadika-putrajaya':       { state:'WP PUTRAJAYA',    name:'Putrajaya',       emoji:'🏛️', desc:'Tadika berdaftar KPM di bandar pentadbiran persekutuan Malaysia' },
  'tadika-labuan':          { state:'WP LABUAN',       name:'Labuan',          emoji:'🏝️', desc:'Tadika berdaftar KPM di pulau bebas cukai Labuan' },
};

async function sbCount(path) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method: 'HEAD',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Prefer: 'count=exact', Range: '0-0' }
  });
  const cr = res.headers.get('content-range') || '';
  const n = Number(cr.split('/')[1]);
  return Number.isFinite(n) ? n : null;
}

let STATE_TEMPLATE = null;
function stateTemplate() {
  if (!STATE_TEMPLATE) STATE_TEMPLATE = readFileSync(join(process.cwd(), 'state.html'), 'utf8');
  return STATE_TEMPLATE;
}

function stateCard(sc) {
  const name = sc.commercial_name || sc.name;
  const href = `/school/${sc.slug}`;
  const cat = (sc.category || '').toUpperCase();
  const isJKM = cat === 'JKM';
  const badges = [];
  if (isJKM) badges.push('<span class="badge" style="background:#FEF3C7;color:#92400E;">🧸 JKM</span>');
  if (!isJKM && sc.jkm_registration_no) badges.push('<span class="badge" style="background:#FEF3C7;color:#92400E;">🧸 Juga JKM</span>');
  if (cat.includes('ANTARABANGSA')) badges.push('<span class="badge badge-blue">🌍 Antarabangsa</span>');
  if (sc.closes_at && sc.closes_at >= '18:00') badges.push('<span class="badge badge-purple">🌇 Buka sehingga petang</span>');
  if (sc.is_claimed) badges.push('<span class="badge badge-yellow">✅ Dituntut</span>');
  if (sc.google_rating) badges.push(`<span class="badge badge-green">⭐ ${esc(sc.google_rating)}${sc.google_reviews_count ? ` (${esc(sc.google_reviews_count)})` : ''}</span>`);
  return `<a href="${esc(href)}" class="card"><div class="card-top">`
    + (sc.logo_url ? `<img src="${esc(sc.logo_url)}" alt="${esc(name)}" class="card-logo" loading="lazy">`
                   : `<div class="card-logo-placeholder">${isJKM ? '🧸' : '🏫'}</div>`)
    + `<div class="card-info"><div class="card-name">${esc(name)}</div>`
    + `<div class="card-meta">📍 ${esc(sc.district || sc.state || '')}</div></div></div>`
    + (badges.length ? `<div class="card-badges">${badges.join('')}</div>` : '')
    + `<div class="card-footer"><span class="card-district">${sc.phone ? '📞 ' + esc(sc.phone) : ''}</span>`
    + `<span class="card-btn">Profil →</span></div></a>`;
}

async function renderStatePage(stateSlug) {
  const cfg = STATE_PAGES[stateSlug];
  let h = stateTemplate();
  if (!cfg) return { status: 404, html: h };
  const st = encodeURIComponent(cfg.state);
  const base = `schools?is_active=eq.true&is_demo=eq.false&state=eq.${st}`;
  const [total, jkm, schools, towns] = await Promise.all([
    sbCount(`${base}&select=id`),
    sbCount(`${base}&category=eq.JKM&select=id`),
    sb(`${base}&slug=not.is.null&select=name,commercial_name,district,state,category,slug,logo_url,phone,is_claimed,google_rating,google_reviews_count,jkm_registration_no,closes_at`
      + `&order=is_claimed.desc,name.asc&limit=24`),
    fetch(`${SB_URL}/rest/v1/rpc/get_kawasan_towns`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ min_schools: 15, p_state: cfg.state })
    }).then(r => r.ok ? r.json() : []).catch(() => [])
  ]);
  const kpm = (total != null && jkm != null) ? total - jkm : null;
  const year = new Date().getFullYear();
  const canonical = `${SITE}/${stateSlug}`;
  // Mirrors state.html init(): the JKM-aware H1 is what the page settles on.
  const h1 = jkm > 0
    ? `${cfg.emoji} Senarai ${cfg.name} Taska Berdaftar JKM & Tadika KPM (${year})`
    : `${cfg.emoji} Tadika & Prasekolah ${cfg.name}`;
  const title = jkm > 0 ? `${h1.replace(cfg.emoji + ' ', '')} | CariSchool` : `Tadika & Prasekolah ${cfg.name} ${year} — Senarai Lengkap | CariSchool`;
  const desc = `Senarai lengkap tadika berdaftar KPM dan taska berdaftar JKM di ${cfg.name}. ${cfg.desc}. Cari mengikut bandar dan daerah — percuma.`;

  const topTowns = (Array.isArray(towns) ? towns : [])
    .sort((a, b) => Number(b.school_count) - Number(a.school_count)).slice(0, 24);

  const jsonld = {
    '@context': 'https://schema.org', '@type': 'ItemList',
    name: `Tadika & Prasekolah ${cfg.name} ${year}`, description: desc, url: canonical,
    numberOfItems: total ?? undefined,
    itemListElement: schools.map((sc, i) => ({
      '@type': 'ListItem', position: i + 1, url: `${SITE}/school/${sc.slug}`, name: sc.commercial_name || sc.name
    }))
  };

  h = setInner(h, 'pageTitle', esc(title));
  h = setAttr(h, 'pageDesc', 'content', desc);
  h = setAttr(h, 'ogTitle', 'content', title);
  h = setAttr(h, 'ogDesc', 'content', desc);
  h = setAttr(h, 'pageCanon', 'href', canonical);
  h = h.replace('<script type="application/ld+json" id="schemaScript">{}</script>',
    `<script type="application/ld+json" id="schemaScript">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>`);
  h = setInner(h, 'breadState', esc(`Tadika ${cfg.name}`));
  h = setInner(h, 'heroTitle', esc(h1));
  h = setInner(h, 'heroDesc', esc(cfg.desc));
  if (total != null) h = setInner(h, 'heroCount', `${total.toLocaleString('en-US')}+`);
  if (kpm != null) h = setInner(h, 'heroKpmCount', kpm.toLocaleString('en-US'));
  if (jkm != null) h = setInner(h, 'heroJkmCount', jkm.toLocaleString('en-US'));
  if (topTowns.length) {
    h = setInner(h, 'townsLinks', topTowns.map(t =>
      `<a href="/kawasan.html?bandar=${encodeURIComponent(t.town)}">${esc(t.town)} <span>${esc(t.school_count)}</span></a>`).join(''));
    h = h.replace('<div class="towns-strip" id="townsStrip" style="display:none;">', '<div class="towns-strip" id="townsStrip">');
  }
  if (schools.length) {
    h = h.replace('<div class="grid" id="schoolGrid"><div class="spinner"></div></div>',
      `<div class="grid" id="schoolGrid">${schools.map(stateCard).join('')}</div>`);
  }
  h = setInner(h, 'listTitle', esc(`Semua Tadika di ${cfg.name}`));
  if (total != null) h = setInner(h, 'listDesc', esc(`${total}+ prasekolah & taska berdaftar`));
  return { status: 200, html: h };
}

// ---------- kawasan town page for people + Googlebot, added 2026-09-30 ----------
//
// Same fix as renderSchoolPage(): kawasan.html?bandar=X used to reach Google
// as "CariSchool — Tadika & Taska", canonical /kawasan.html, H1 "...", and no
// school links until JS ran. This fills title/description/canonical/H1 and a
// plain crawlable list of the town's schools into #content. kawasan.html's
// script then replaces #content with its full interactive version, as before.
// Only the plain ?bandar=X form is handled; ?kawasan= / ?negeri= variants are
// passed through untouched by middleware.js.
// KEEP IN SYNC with loadTownPage() in kawasan.html (matcher, title, H1).

let KAWASAN_TEMPLATE = null;
function kawasanTemplate() {
  if (!KAWASAN_TEMPLATE) KAWASAN_TEMPLATE = readFileSync(join(process.cwd(), 'kawasan.html'), 'utf8');
  return KAWASAN_TEMPLATE;
}

async function renderKawasanPage(bandarRaw) {
  let h = kawasanTemplate();
  const town = String(bandarRaw || '').trim();
  const safe = town.replace(/[,()*]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!safe) return { status: 200, html: h };
  const v = encodeURIComponent(safe);

  const [statsRows, rows] = await Promise.all([
    fetch(`${SB_URL}/rest/v1/rpc/get_town_stats`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_town: town, p_state: null, p_neighbourhood: null })
    }).then(r => r.ok ? r.json() : null),
    // Cap 700 (was 200): the 10 largest towns hold 1,334 schools past 200, and
    // a town page is their main inbound link. Largest town = 631 (2026-10-01).
    sb(`schools?or=(town.ilike.${v},neighbourhood.ilike.${v})&is_active=eq.true&is_demo=eq.false`
      + `&select=${COLS}&order=name.asc&limit=700`)
  ]);
  const stats = Array.isArray(statsRows) ? statsRows[0] : null;
  const total = stats ? Number(stats.total) : rows.length;
  const jkmCount = stats ? Number(stats.jkm_count) : rows.filter(r => r.category === 'JKM').length;

  if (!total || !rows.length) {
    // Same as the client: an empty town is kept out of the index.
    return { status: 404, html: setAttr(h, 'pageRobots', 'content', 'noindex, follow') };
  }

  const year = new Date().getFullYear();
  const state = rows[0].state || '';
  const canonical = `${SITE}/kawasan.html?bandar=${encodeURIComponent(town)}`;
  const h1 = jkmCount > 0
    ? `Taska Berdaftar JKM & Tadika KPM di ${town} (${year})`
    : null;
  const title = h1 ? `${h1} | CariSchool` : `Tadika & Taska di ${town} — Senarai Berdaftar KPM & JKM | CariSchool`;
  const desc = `Senarai ${total}+ tadika & taska berdaftar KPM/JKM di ${town}${state ? ', ' + state : ''}. `
    + `Cari prasekolah terdekat, hubungi terus, percuma untuk ibu bapa.`;

  const isJ = r => r.agency === 'JKM' || r.category === 'JKM';
  const taska = rows.filter(isJ), tadika = rows.filter(r => !isJ(r));
  const li = r => {
    const reg = registrationStatus(r);
    return `<li><a href="/school/${esc(r.slug || r.id)}">${esc(r.commercial_name || r.name)}</a>`
      + ` <span class="ssr-reg">— ${esc(reg.label)}</span></li>`;
  };
  const list = `<div id="ssrList" class="intro-text">`
    + `<p><strong>${esc(total)}</strong> prasekolah berdaftar di <strong>${esc(town)}</strong>${state ? ', ' + esc(state) : ''}`
    + ` — disahkan daripada rekod Kementerian Pendidikan Malaysia (KPM)${jkmCount ? ' dan Jabatan Kebajikan Masyarakat (JKM)' : ''}.</p>`
    + (tadika.length ? `<h2>Tadika — berdaftar KPM (${tadika.length})</h2><ul>${tadika.map(li).join('')}</ul>` : '')
    + (taska.length ? `<h2>Taska — berdaftar JKM (${taska.length})</h2><ul>${taska.map(li).join('')}</ul>` : '')
    + (total > rows.length ? `<p>Menunjukkan ${rows.length} daripada ${esc(total)}.</p>` : '')
    + `</div>`;

  const jsonld = {
    '@context': 'https://schema.org', '@type': 'ItemList',
    name: `Tadika dan taska berdaftar di ${town}`, numberOfItems: total,
    itemListElement: rows.slice(0, 100).map((r, i) => ({
      '@type': 'ListItem', position: i + 1, url: `${SITE}/school/${r.slug || r.id}`, name: r.commercial_name || r.name
    }))
  };

  h = setInner(h, 'pageTitle', esc(title));
  h = setAttr(h, 'metaDesc', 'content', desc);
  h = setAttr(h, 'canonicalLink', 'href', canonical);
  h = h.replace('<script type="application/ld+json" id="faqSchema">{}</script>',
    `<script type="application/ld+json" id="faqSchema">{}</script>\n<script type="application/ld+json" id="ssrItemList">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>`);
  if (h1) {
    h = setInner(h, 'heroTown', esc(h1));
    // Empty + hidden: a display:none span's text still counts as H1 text
    // to a crawler ("Tadika & Taska Taska Berdaftar ...").
    h = h.replace('<span id="heroTitlePrefix">Tadika & Taska</span>', '<span id="heroTitlePrefix" style="display:none"></span>');
  } else {
    h = setInner(h, 'heroTown', esc(town));
  }
  h = setInner(h, 'heroSub', esc(`${total} prasekolah berdaftar di ${town}${state ? ', ' + state : ''}. Hubungi terus, 100% percuma.`));
  // Exact-string replace: #content holds a nested div, which setInner()'s
  // lazy match would cut at the inner </div>.
  h = h.replace('<div id="content" aria-live="polite"><div class="loading" id="loadingText">Memuatkan senarai sekolah...</div></div>',
    `<div id="content" aria-live="polite">${list}</div>`);
  return { status: 200, html: h };
}

// ---------- kawasan ----------

const COLS = 'id,slug,name,commercial_name,category,agency,town,neighbourhood,state,district,'
  + 'address,postcode,school_code,jkm_registration_no,jkm_valid_to,'
  + 'fee_min,fee_max,is_claimed,google_rating,google_reviews_count';

async function renderKawasan(bandar, lang) {
  const isEn = lang === 'en';
  // Commas, parens and `*` are PostgREST filter grammar and `bandar` arrives
  // straight off the query string -- sanitize before interpolating into an
  // or() (CLAUDE.md §2.6.2).
  const safe = String(bandar).replace(/[,()*]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!safe) return null;
  const v = encodeURIComponent(safe);

  // MUST mirror kawasan.html's matcher exactly:
  //   q.or(`town.ilike.X,neighbourhood.ilike.X`)   (EXACT, case-insensitive)
  // This route used `town=eq.X` (exact) until M32 changed it to substring
  // (`ilike.%X%`) for content parity with kawasan.html's own substring
  // matcher at the time. kawasan.html's matcher changed AGAIN on 2026-09-28
  // (see its baseFilter comment) from substring back to exact, after the
  // substring version was found to cross-contaminate unrelated towns/states
  // (?bandar=Ipoh pulling in Kuala Lumpur's "Jalan Ipoh" schools). This route
  // follows that same change, to keep the row set here identical to what
  // kawasan.html itself renders (M36 -- content parity is a row-set rule, not
  // just a field-list rule). Known tradeoff, same as kawasan.html: a colloquial
  // sitemap label that doesn't exactly match a `town` OR `neighbourhood` value
  // (not even via substring) will return zero rows here and fall through to
  // the 404 shell for AI crawlers -- accepted because the alternative
  // (substring) was actively wrong, not just imprecise, and neighbourhood
  // values are themselves the colloquial names this route needs to hit
  // directly (e.g. "Kota Damansara" is stored as an exact neighbourhood
  // value). Any future change to kawasan.html's matcher has to land here in
  // the same session.
  //
  // Ordering: was `commercial_name.asc`. That column is sparse (not even in the
  // 2026-07-25 fill-rate list) and Postgres sorts NULLS LAST on ASC, so a few
  // named schools appeared alphabetically and everything else followed in
  // arbitrary order. `name` is 100% filled; order on it, display still prefers
  // commercial_name below.
  const rows = await sb(
    `schools?or=(town.ilike.${v},neighbourhood.ilike.${v})`
    + `&is_active=eq.true&is_demo=eq.false`
    + `&select=${COLS}&order=name.asc&limit=700`
  );
  if (!rows.length) return null;

  const canonicalMs = `${SITE}/kawasan.html?bandar=${encodeURIComponent(safe)}`;
  const canonicalEn = `${canonicalMs}&lang=en`;
  const canonical = isEn ? canonicalEn : canonicalMs;
  const jkm = rows.filter(r => r.agency === 'JKM' || r.category === 'JKM');
  const kpm = rows.filter(r => !(r.agency === 'JKM' || r.category === 'JKM'));

  // English wording follows kawasan.html's own TRANSLATIONS.en strings
  // (titleTadikaTaska/titleRegisteredList/metaListOf/metaTadikaTaskaIn/
  // catJkmFull/catSwastaFull) -- not invented copy, same principle as
  // renderBerdekatan(). kawasan.html is directory-shaped intent ("list of
  // schools in X"), distinct from berdekatan's proximity-shaped intent, so
  // the synonym terms (kindergarten/playschool/childcare) appear once in
  // the intro in that directory register rather than "near me" phrasing.
  const title = isEn
    ? `Kindergartens & Childcare in ${safe} — MOE & JKM Registered List | CariSchool`
    : `Tadika & Taska Berdaftar di ${safe} | CariSchool`;
  const desc = isEn
    ? `List of MOE(KPM)-registered kindergartens and JKM-registered childcare centres `
      + `in ${safe}, Malaysia, including registration status, address and fees where available.`
    : `Senarai tadika berdaftar KPM dan taska berdaftar JKM di ${safe}, `
      + `termasuk status pendaftaran, alamat dan yuran di mana tersedia.`;

  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: isEn ? `Kindergartens and childcare centres in ${safe}` : `Tadika dan taska berdaftar di ${safe}`,
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
    const fee = feeLine(r, isEn ? 'en' : undefined);
    const label = isEn ? reg.labelEn : reg.label;
    return `<li><a href="${SITE}/school/${esc(r.slug || r.id)}">`
      + `${esc(r.commercial_name || r.name)}</a> — ${esc(label)}`
      + (fee ? ` — ${isEn ? 'fee' : 'yuran'} ${esc(fee.text)}` : '')
      + `</li>`;
  };

  const body = isEn ? `
<h1>Kindergartens &amp; Childcare in ${esc(safe)}</h1>
<p>${rows.length} registered schools on record in ${esc(safe)} -- whether you're searching for
a kindergarten, playschool, childcare centre or preschool in ${esc(safe)}, these are the
MOE(KPM) and JKM registered options here. Each listing shows its official registration status.</p>

${jkm.length ? `<h2>Taska — JKM-registered childcare (${jkm.length})</h2>
<ul>\n${jkm.map(li).join('\n')}\n</ul>` : ''}

${kpm.length ? `<h2>Tadika — MOE(KPM)-registered kindergarten/preschool (${kpm.length})</h2>
<ul>\n${kpm.map(li).join('\n')}\n</ul>` : ''}

<p><a href="${esc(canonical)}">See the full list on CariSchool</a></p>` : `
<h1>Tadika &amp; taska berdaftar di ${esc(safe)}</h1>
<p>${rows.length} sekolah berdaftar direkodkan di ${esc(safe)}.
Setiap penyenaraian menunjukkan status pendaftaran rasmi.</p>

${jkm.length ? `<h2>Taska — pusat jagaan berdaftar JKM (${jkm.length})</h2>
<ul>\n${jkm.map(li).join('\n')}\n</ul>` : ''}

${kpm.length ? `<h2>Tadika — prasekolah berdaftar KPM (${kpm.length})</h2>
<ul>\n${kpm.map(li).join('\n')}\n</ul>` : ''}

<p><a href="${esc(canonical)}">Lihat senarai penuh di CariSchool</a></p>`;

  const alternates = [
    { hreflang: 'ms', href: canonicalMs },
    { hreflang: 'en', href: canonicalEn },
    { hreflang: 'x-default', href: canonicalMs }
  ];

  return shell({ title, desc, canonical, jsonld, body, lang: isEn ? 'en' : 'ms', alternates });
}

// ---------- berdekatan (near-me landing page) ----------

async function renderBerdekatan(bandar, lang) {
  const isEn = lang === 'en';
  const safe = String(bandar).replace(/[,()*]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!safe) return null;
  const v = encodeURIComponent(safe);

  // Deliberately the SAME matcher as renderKawasan() -- this is a chosen
  // simplification, not laziness. berdekatan.html's real GPS/box-distance
  // math (loadNearbySchools: postcode-fallback join, ±0.5deg box, haversine
  // sort) is client-only. Duplicating that here to chase exact row-for-row
  // parity would mean maintaining two independent distance algorithms that
  // can silently drift apart -- exactly the failure class M32 already
  // taught us about (a second matcher for the "same" concept). For any
  // real Malaysian town, "schools registered under this town/neighbourhood
  // name" and "schools within a ~55km box of that town's centroid" are the
  // same population in practice, so this stays a safe, honest subset
  // rather than a fragile attempt at exact parity with client-side geo math.
  // EXACT match, not substring (fixed 2026-09-28, mirrors renderKawasan()'s
  // and kawasan.html's own fix, same session, same reasoning -- see the
  // comment above renderKawasan()'s query).
  const rows = await sb(
    `schools?or=(town.ilike.${v},neighbourhood.ilike.${v})`
    + `&is_active=eq.true&is_demo=eq.false`
    + `&select=${COLS}&order=name.asc&limit=700`
  );
  if (!rows.length) return null;

  const canonicalMs = `${SITE}/berdekatan.html?bandar=${encodeURIComponent(safe)}`;
  const canonicalEn = `${canonicalMs}&lang=en`;
  const canonical = isEn ? canonicalEn : canonicalMs;
  const jkm = rows.filter(r => r.agency === 'JKM' || r.category === 'JKM');
  const kpm = rows.filter(r => !(r.agency === 'JKM' || r.category === 'JKM'));

  // Deliberately distinct search-intent framing from renderKawasan():
  // "berdekatan" targets proximity-shaped queries ("tadika berdekatan
  // saya/[town]"), renderKawasan targets directory-shaped ones ("senarai
  // tadika [town]"). Same underlying schools, different intent -- title/
  // copy carry that distinction so the two pages read as complementary
  // rather than near-duplicate content targeting the same query.
  //
  // English title/H1/body wording follows berdekatan.html's own
  // TRANSLATIONS.en strings (heroTitle "Tadika & Taska Near You", nearLabel
  // "Near", resultsFoundPost "schools found nearby") -- not invented copy.
  // Synonym terms (kindergarten/playschool/daycare) are added once, in the
  // intro paragraph, in the same natural register a parent would search in
  // -- per Fadly's explicit target query list -- not stuffed into every line.
  const title = isEn
    ? `Tadika & Taska Near ${safe} | Kindergarten, Playschool & Daycare Near Me | CariSchool`
    : `Tadika & Taska Berdekatan ${safe} | CariSchool`;
  const desc = isEn
    ? `Find MOE(KPM)-registered kindergartens and JKM-registered daycare/childcare centres `
      + `near ${safe}, Malaysia. Check registration status, address and fees before you call.`
    : `Cari tadika berdaftar KPM dan taska berdaftar JKM berdekatan ${safe}. `
      + `Lihat status pendaftaran, alamat dan yuran sebelum menghubungi sekolah.`;

  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: isEn ? `Kindergartens and daycare centres near ${safe}` : `Tadika dan taska berdekatan ${safe}`,
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
    const fee = feeLine(r, isEn ? 'en' : undefined);
    const label = isEn ? reg.labelEn : reg.label;
    return `<li><a href="${SITE}/school/${esc(r.slug || r.id)}">`
      + `${esc(r.commercial_name || r.name)}</a> — ${esc(label)}`
      + (fee ? ` — ${isEn ? 'fee' : 'yuran'} ${esc(fee.text)}` : '')
      + `</li>`;
  };

  const body = isEn ? `
<h1>Tadika &amp; Taska Near ${esc(safe)}</h1>
<p>${rows.length} registered schools found near ${esc(safe)} — searching for a kindergarten
near me, playschool near me, daycare near me or preschool near me in ${esc(safe)}? These are
the MOE(KPM) and JKM registered options on record. Use your real location on CariSchool to
see them sorted by actual distance.</p>

${jkm.length ? `<h2>Taska — JKM-registered childcare/daycare (${jkm.length})</h2>
<ul>\n${jkm.map(li).join('\n')}\n</ul>` : ''}

${kpm.length ? `<h2>Tadika — MOE(KPM)-registered kindergarten/preschool (${kpm.length})</h2>
<ul>\n${kpm.map(li).join('\n')}\n</ul>` : ''}

<p><a href="${esc(canonical)}">See the full list sorted by distance on CariSchool</a></p>` : `
<h1>Tadika &amp; taska berdekatan ${esc(safe)}</h1>
<p>${rows.length} sekolah berdaftar dijumpai berdekatan ${esc(safe)}.
Guna lokasi sebenar anda di CariSchool untuk melihat susunan mengikut jarak sebenar.</p>

${jkm.length ? `<h2>Taska — pusat jagaan berdaftar JKM (${jkm.length})</h2>
<ul>\n${jkm.map(li).join('\n')}\n</ul>` : ''}

${kpm.length ? `<h2>Tadika — prasekolah berdaftar KPM (${kpm.length})</h2>
<ul>\n${kpm.map(li).join('\n')}\n</ul>` : ''}

<p><a href="${esc(canonical)}">Lihat senarai penuh disusun ikut jarak di CariSchool</a></p>`;

  const alternates = [
    { hreflang: 'ms', href: canonicalMs },
    { hreflang: 'en', href: canonicalEn },
    { hreflang: 'x-default', href: canonicalMs }
  ];

  return shell({ title, desc, canonical, jsonld, body, lang: isEn ? 'en' : 'ms', alternates });
}

// ---------- berdekatan per-town page for humans/Googlebot, added 2026-10-01 ----------
// berdekatan.html?bandar=X is in the sitemap, but its raw HTML declared
// /berdekatan.html as canonical until JS ran (Ahrefs: "non-canonical page in
// sitemap"). Same fix as renderKawasanPage, but the client builds this head
// from the URL alone, so no DB call: identical strings, set before JS.
let BERDEKATAN_TEMPLATE = null;
function berdekatanTemplate() {
  if (!BERDEKATAN_TEMPLATE) BERDEKATAN_TEMPLATE = readFileSync(join(process.cwd(), 'berdekatan.html'), 'utf8');
  return BERDEKATAN_TEMPLATE;
}
function renderBerdekatanPage(bandarRaw) {
  let h = berdekatanTemplate();
  const bandar = String(bandarRaw || '').trim();
  if (!bandar) return { status: 200, html: h };
  const title = `Tadika & Taska Berdekatan ${bandar} — CariSchool`;
  const desc = `Cari tadika & taska berdaftar berdekatan ${bandar}. Senarai disusun ikut jarak sebenar, termasuk status pendaftaran dan yuran.`;
  const canonical = `${SITE}/berdekatan.html?bandar=${encodeURIComponent(bandar)}`;
  const swap = (from, to) => { h = h.replace(from, to); };
  swap(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  swap(/(<meta name="description" content=")[^"]*(")/, (m, a, b) => a + esc(desc) + b);
  swap(/(<link rel="canonical" href=")[^"]*(")/, (m, a, b) => a + esc(canonical) + b);
  swap(/(<meta property="og:title" content=")[^"]*(")/, (m, a, b) => a + esc(title) + b);
  swap(/(<meta property="og:description" content=")[^"]*(")/, (m, a, b) => a + esc(desc) + b);
  swap(/(<meta property="og:url" content=")[^"]*(")/, (m, a, b) => a + esc(canonical) + b);
  return { status: 200, html: h };
}

// ---------- handler ----------

export default async function handler(req, res) {
  try {
    const { type, slug, bandar, lang } = req.query;
    let html = null;

    if (type === 'schoolpage' && slug) {
      // Human/Googlebot page. Any failure falls back to the plain template so
      // a visitor never sees an error page where the old shell used to work.
      let out;
      try { out = await renderSchoolPage(slug); }
      catch (e) { console.error('[prerender schoolpage]', e); out = { status: 200, html: schoolTemplate(), fallback: true }; }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', out.fallback ? 'no-store'
        : 'public, s-maxage=3600, stale-while-revalidate=86400');
      return res.status(out.status).send(out.html);
    }

    if (type === 'kawasanpage') {
      let out;
      try { out = await renderKawasanPage(bandar); }
      catch (e) { console.error('[prerender kawasanpage]', e); out = { status: 200, html: kawasanTemplate(), fallback: true }; }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', out.fallback ? 'no-store'
        : 'public, s-maxage=3600, stale-while-revalidate=86400');
      return res.status(out.status).send(out.html);
    }

    if (type === 'berdekatanpage') {
      let out;
      try { out = renderBerdekatanPage(bandar); }
      catch (e) { console.error('[prerender berdekatanpage]', e); out = { status: 200, html: berdekatanTemplate(), fallback: true }; }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', out.fallback ? 'no-store'
        : 'public, s-maxage=3600, stale-while-revalidate=86400');
      return res.status(out.status).send(out.html);
    }

    if (type === 'statepage' && slug) {
      let out;
      try { out = await renderStatePage(slug); }
      catch (e) { console.error('[prerender statepage]', e); out = { status: 200, html: stateTemplate(), fallback: true }; }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', out.fallback ? 'no-store'
        : 'public, s-maxage=3600, stale-while-revalidate=86400');
      return res.status(out.status).send(out.html);
    }

    if (type === 'school' && slug) html = await renderSchool(slug, lang);
    else if (type === 'kawasan' && bandar) html = await renderKawasan(bandar, lang);
    else if (type === 'berdekatan' && bandar) html = await renderBerdekatan(bandar, lang);

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
