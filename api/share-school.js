// Generates a proper social-media link preview (WhatsApp, Facebook, etc.)
// for a specific school, then redirects real human visitors to the actual
// profile page. This exists because school.html is a static file that
// only fills in og:image/og:title via client-side JS AFTER load -- but
// social crawlers never execute JavaScript, so every shared link was
// showing the same generic fallback image regardless of which school.
// Share THIS url instead of the direct school.html link.
export default async function handler(req, res) {
  const { id } = req.query;

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const fallback = {
    name: 'CariSchool Malaysia',
    description: 'Direktori prasekolah & taska berdaftar KPM/JKM terbesar di Malaysia.',
    image: 'https://www.carischools.com/carischool%20logo%20512x512.png',
  };

  let school = null;
  if (id && SB_URL && SB_KEY) {
    try {
      const r = await fetch(
        `${SB_URL}/rest/v1/schools?id=eq.${encodeURIComponent(id)}&select=name,photo_url,town,state,category`,
        { headers: { 'Authorization': `Bearer ${SB_KEY}`, 'apikey': SB_KEY } }
      );
      const rows = r.ok ? await r.json() : [];
      school = rows[0] || null;
    } catch (e) {
      console.error('share-school fetch error:', e);
    }
  }

  const name = school?.name || fallback.name;
  const location = school ? `${school.town || school.state || ''}` : '';
  const description = school
    ? `${location ? location + ' — ' : ''}Lihat profil, gambar, dan maklumat lengkap ${name} di CariSchool.`
    : fallback.description;
  const image = school?.photo_url || fallback.image;
  const redirectUrl = id
    ? `https://www.carischools.com/school.html?id=${encodeURIComponent(id)}`
    : 'https://www.carischools.com';

  const esc = (s) => String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!DOCTYPE html>
<html lang="ms">
<head>
<meta charset="UTF-8">
<meta property="og:title" content="${esc(name)} — CariSchool">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(redirectUrl)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(name)} — CariSchool">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0; url=${esc(redirectUrl)}">
<title>${esc(name)} — CariSchool</title>
</head>
<body>
<p>Mengalihkan ke profil <a href="${esc(redirectUrl)}">${esc(name)}</a>...</p>
<script>window.location.replace(${JSON.stringify(redirectUrl)});</script>
</body>
</html>`);
}
