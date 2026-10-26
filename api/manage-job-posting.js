export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, schoolId, claimCode, jobId, payload, adminKey, password } = req.body || {};

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = {
    'Authorization': `Bearer ${SB_KEY}`,
    'apikey': SB_KEY,
    'Content-Type': 'application/json',
  };

  // Added 2026-09-04 -- merged in from what was a standalone admin-login.js
  // file, to stay under Vercel's Hobby-plan limit of 12 serverless
  // functions per deployment (this project was sitting at exactly 12
  // before admin-login.js pushed it to 13, which silently broke every
  // deployment, unrelated files included, since the check applies to the
  // whole project). Logic is otherwise identical to the standalone
  // version: real server-side password check against the same
  // ADMIN_API_KEY env var already used for the admin actions below,
  // never sent to the browser, then mints a real session token via
  // create_admin_session() (only callable with the service-role key,
  // never by the public anon key).
  if (action === 'adminLogin') {
    if (!password || password !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: 'Incorrect password' });
    }
    try {
      const rpcRes = await fetch(`${SB_URL}/rest/v1/rpc/create_admin_session`, {
        method: 'POST', headers, body: JSON.stringify({}),
      });
      if (!rpcRes.ok) {
        const errText = await rpcRes.text();
        console.error('create_admin_session failed:', errText);
        return res.status(500).json({ error: 'Could not create session' });
      }
      const token = await rpcRes.json();
      return res.status(200).json({ token });
    } catch (e) {
      console.error('adminLogin error:', e);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  // Added 2026-09-26, moved server-side same day it shipped -- admin.html
  // originally called https://api.indexnow.org/indexnow directly from the
  // browser with fetch(). The very first real backfill run (11,492 URLs)
  // reported 0 submitted, 100% failed. Root cause: that POST sends
  // `Content-Type: application/json`, which is a "non-simple" request under
  // the CORS spec, so the browser sends a preflight OPTIONS request first --
  // and api.indexnow.org doesn't answer preflight with the
  // Access-Control-Allow-* headers a browser requires, so every single call
  // was silently blocked client-side before it ever reached the network.
  // This never showed up in review because CORS is a browser-only
  // enforcement -- nothing about the request, the key, or the JSON body was
  // wrong, and there was no way to catch this without a real browser making
  // a real cross-origin call, which this sandbox can't do (no route to
  // api.indexnow.org from here either). Same reasoning as adminLogin just
  // above for living in this file rather than a new one: the Vercel Hobby
  // 12-function cap (M62) was already at exactly 12, and a server-to-server
  // fetch has no CORS restriction at all, so moving the call here fixes it
  // outright. No secret required -- the IndexNow key is meant to be public
  // (same key already sitting in the repo root's <key>.txt).
  if (action === 'indexNowSubmit') {
    const { urlList } = req.body || {};
    if (!Array.isArray(urlList) || !urlList.length) {
      return res.status(400).json({ ok: false, error: 'urlList required' });
    }
    const INDEXNOW_KEY = 'a64c6d0ae518114d227d09c39f14b6dc';
    const INDEXNOW_HOST = 'www.carischools.com';
    try {
      const inRes = await fetch('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          host: INDEXNOW_HOST,
          key: INDEXNOW_KEY,
          keyLocation: `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`,
          urlList,
        }),
      });
      // IndexNow returns 200 or 202 on success; surface the real status
      // rather than collapsing everything to true/false, so the admin UI
      // and any future debugging can tell a real rejection (e.g. bad key)
      // apart from "it worked."
      return res.status(200).json({ ok: inRes.ok, status: inRes.status });
    } catch (e) {
      console.error('indexNowSubmit error:', e);
      return res.status(200).json({ ok: false, error: e.message });
    }
  }

  // Added 2026-10-26 (Fadly OK): refresh ONE school's Google rating + review count
  // from its stored google_place_id. Not a crawl: no Find Place search and no name
  // matching, so it can never attach a different business (M29/M51), and it asks
  // Google for two fields only. Lives here for the 12-function cap (M62). The same
  // lookup is duplicated in cron-premium-photo-reversal.js (monthly claimed-school
  // refresh) -- change both together.
  // Gated by the admin dashboard session token (is_valid_admin_session), not the
  // ADMIN_API_KEY that admin.html carries in its source.
  // Needs env var GOOGLE_PLACES_API_KEY (server-only, restricted to the Places API).
  if (action === 'refreshGoogleRating') {
    const { adminToken } = req.body || {};
    try {
      const okRes = await fetch(`${SB_URL}/rest/v1/rpc/is_valid_admin_session`, {
        method: 'POST', headers, body: JSON.stringify({ p_token: adminToken || null }),
      });
      if (!okRes.ok || (await okRes.json()) !== true) {
        return res.status(403).json({ ok: false, error: 'Sesi admin tidak sah. Log masuk semula.' });
      }
      if (!schoolId) return res.status(400).json({ ok: false, error: 'schoolId required' });
      const result = await refreshGoogleRating(SB_URL, headers, schoolId);
      return res.status(200).json(result);
    } catch (e) {
      console.error('refreshGoogleRating error:', e);
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  const ADMIN_ACTIONS = ['adminList', 'approve', 'reject', 'forceExpire', 'adminDelete'];

  try {
    // ── Admin-only actions: gated by a server-side secret, never the school claim code ──
    if (ADMIN_ACTIONS.includes(action)) {
      if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
        return res.status(403).json({ error: 'Tidak dibenarkan.' });
      }

      if (action === 'adminList') {
        const jobsRes = await fetch(`${SB_URL}/rest/v1/job_postings?select=*&order=created_at.desc`, { headers });
        if (!jobsRes.ok) throw new Error('Failed to list job postings');
        const jobs = await jobsRes.json();
        if (jobs.length === 0) return res.status(200).json({ jobs: [] });

        const schoolIds = [...new Set(jobs.map(j => j.school_id))];
        const schoolsRes = await fetch(
          `${SB_URL}/rest/v1/schools?id=in.(${schoolIds.join(',')})&select=id,name,district,state`,
          { headers }
        );
        const schools = schoolsRes.ok ? await schoolsRes.json() : [];
        const schoolMap = {};
        schools.forEach(s => schoolMap[s.id] = s);
        const merged = jobs.map(j => ({ ...j, school: schoolMap[j.school_id] || {} }));
        return res.status(200).json({ jobs: merged });

      } else if (action === 'approve') {
        if (!jobId) return res.status(400).json({ error: 'Missing jobId' });
        const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
        const updateRes = await fetch(`${SB_URL}/rest/v1/job_postings?id=eq.${encodeURIComponent(jobId)}`, {
          method: 'PATCH', headers, body: JSON.stringify({ status: 'active', expires_at: expiresAt })
        });
        if (!updateRes.ok) throw new Error('Failed to approve job posting');
        return res.status(200).json({ success: true });

      } else if (action === 'reject') {
        if (!jobId) return res.status(400).json({ error: 'Missing jobId' });
        const updateRes = await fetch(`${SB_URL}/rest/v1/job_postings?id=eq.${encodeURIComponent(jobId)}`, {
          method: 'PATCH', headers, body: JSON.stringify({ status: 'rejected' })
        });
        if (!updateRes.ok) throw new Error('Failed to reject job posting');
        return res.status(200).json({ success: true });

      } else if (action === 'forceExpire') {
        if (!jobId) return res.status(400).json({ error: 'Missing jobId' });
        const updateRes = await fetch(`${SB_URL}/rest/v1/job_postings?id=eq.${encodeURIComponent(jobId)}`, {
          method: 'PATCH', headers, body: JSON.stringify({ status: 'expired' })
        });
        if (!updateRes.ok) throw new Error('Failed to expire job posting');
        return res.status(200).json({ success: true });

      } else if (action === 'adminDelete') {
        // Permanent removal -- intended for cleaning up test postings or
        // terminal-state records (rejected/filled/expired) that don't
        // need to be kept around. Not exposed for active/pending jobs
        // in the admin UI (use reject/forceExpire for those instead).
        if (!jobId) return res.status(400).json({ error: 'Missing jobId' });
        const deleteRes = await fetch(`${SB_URL}/rest/v1/job_postings?id=eq.${encodeURIComponent(jobId)}`, {
          method: 'DELETE', headers
        });
        if (!deleteRes.ok) throw new Error('Failed to delete job posting');
        return res.status(200).json({ success: true });
      }
    }

    // ── School-side actions: require schoolId + claimCode ──
    if (!action || !schoolId || !claimCode) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Step 1: verify the school is claimed AND the claim code matches.
    // 2026-09-30: claim codes moved out of schools.claim_code into a private
    // table (M59 follow-up). The check now goes through verify_claim_code(),
    // the same RPC kemaskini.html and post-job.html use -- never read the
    // code column directly again.
    const codeRes = await fetch(`${SB_URL}/rest/v1/rpc/verify_claim_code`, {
      method: 'POST', headers,
      body: JSON.stringify({ p_school_id: schoolId, p_code: claimCode })
    });
    if (!codeRes.ok) throw new Error('Failed to verify claim code');
    const codeOk = await codeRes.json();

    const verifyRes = await fetch(
      `${SB_URL}/rest/v1/schools?id=eq.${encodeURIComponent(schoolId)}&select=id,name,is_claimed`,
      { headers }
    );
    if (!verifyRes.ok) throw new Error('Failed to verify school');
    const schools = await verifyRes.json();
    const school = schools[0];

    if (codeOk !== true || !school || !school.is_claimed) {
      return res.status(403).json({ error: 'Kod tuntutan tidak sah atau sekolah belum dituntut.' });
    }

    // Step 2: perform the requested action, scoped to this school only
    if (action === 'create') {
      // Cap concurrent postings per school (active + pending combined) --
      // no limit existed before, meaning a school could submit unlimited
      // simultaneous postings, each needing individual admin approval.
      // A small taska/tadika realistically has 1-3 genuine open roles at
      // once; this blocks spam/accidental duplicates without limiting
      // legitimate use.
      const MAX_CONCURRENT_POSTINGS = 3;
      const countRes = await fetch(
        `${SB_URL}/rest/v1/job_postings?school_id=eq.${encodeURIComponent(schoolId)}&status=in.(active,pending)&select=id`,
        { headers }
      );
      const existingJobs = countRes.ok ? await countRes.json() : [];
      if (existingJobs.length >= MAX_CONCURRENT_POSTINGS) {
        return res.status(400).json({ error: `Anda sudah mempunyai ${MAX_CONCURRENT_POSTINGS} siaran jawatan aktif/menunggu. Tandakan siaran lama sebagai "Sudah Diisi" atau buang sebelum menambah siaran baharu.` });
      }

      const insertRes = await fetch(`${SB_URL}/rest/v1/job_postings`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          school_id: schoolId,
          position: payload?.position,
          num_openings: payload?.num_openings || 1,
          position_type: payload?.position_type,
          requirements: payload?.requirements || null,
          salary_min: payload?.salary_min || null,
          salary_max: payload?.salary_max || null,
          poster_url: payload?.poster_url || null,
          status: 'pending',
        }),
      });
      if (!insertRes.ok) throw new Error('Failed to create job posting');
      return res.status(200).json({ success: true });

    } else if (action === 'list') {
      const listRes = await fetch(
        `${SB_URL}/rest/v1/job_postings?school_id=eq.${encodeURIComponent(schoolId)}&order=created_at.desc`,
        { headers }
      );
      if (!listRes.ok) throw new Error('Failed to list job postings');
      const jobs = await listRes.json();
      return res.status(200).json({ jobs });

    } else if (action === 'markFilled') {
      if (!jobId) return res.status(400).json({ error: 'Missing jobId' });
      const updateRes = await fetch(
        `${SB_URL}/rest/v1/job_postings?id=eq.${encodeURIComponent(jobId)}&school_id=eq.${encodeURIComponent(schoolId)}`,
        { method: 'PATCH', headers, body: JSON.stringify({ status: 'filled' }) }
      );
      if (!updateRes.ok) throw new Error('Failed to update job posting');
      return res.status(200).json({ success: true });

    } else if (action === 'delete') {
      if (!jobId) return res.status(400).json({ error: 'Missing jobId' });
      const deleteRes = await fetch(
        `${SB_URL}/rest/v1/job_postings?id=eq.${encodeURIComponent(jobId)}&school_id=eq.${encodeURIComponent(schoolId)}`,
        { method: 'DELETE', headers }
      );
      if (!deleteRes.ok) throw new Error('Failed to delete job posting');
      return res.status(200).json({ success: true });

    } else {
      return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (err) {
    console.error('manage-job-posting error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ── Google rating refresh by place_id (2026-10-26) ──
// Duplicated in cron-premium-photo-reversal.js on purpose (no shared files under
// /api/: each file is a counted function, M62). Tries Places API (New) first and
// falls back to the legacy Place Details endpoint, because which of the two is
// enabled depends on the Google Cloud project behind the key; a denied call is
// not billed. Never writes anything Google did not return: a place with no
// reviews keeps its current values, and a closed or vanished place is reported
// for a human to look at, never deactivated here.
async function fetchGoogleRatingByPlaceId(placeId) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return { ok: false, error: 'GOOGLE_PLACES_API_KEY is not set in Vercel' };
  const r1 = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'rating,userRatingCount,businessStatus' },
  });
  if (r1.ok) {
    const j = await r1.json();
    return { ok: true, api: 'new', rating: j.rating ?? null, count: j.userRatingCount ?? null, status: j.businessStatus || null };
  }
  if (r1.status === 404) return { ok: false, notFound: true, error: 'Google: place_id not found' };
  const r2 = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=rating,user_ratings_total,business_status&key=${encodeURIComponent(key)}`);
  const j2 = await r2.json().catch(() => ({}));
  if (j2.status === 'OK') {
    const g = j2.result || {};
    return { ok: true, api: 'legacy', rating: g.rating ?? null, count: g.user_ratings_total ?? null, status: g.business_status || null };
  }
  if (j2.status === 'NOT_FOUND') return { ok: false, notFound: true, error: 'Google: place_id not found' };
  const newErr = await r1.text().catch(() => '');
  return { ok: false, error: `Google: new API ${r1.status} ${newErr.slice(0, 160)} | legacy ${j2.status || r2.status} ${j2.error_message || ''}`.trim() };
}

async function refreshGoogleRating(SB_URL, headers, schoolId) {
  const sRes = await fetch(`${SB_URL}/rest/v1/schools?id=eq.${encodeURIComponent(schoolId)}&select=id,name,google_place_id,google_rating,google_reviews_count,google_rating_checked_at`, { headers });
  if (!sRes.ok) throw new Error('School lookup failed: ' + sRes.status);
  const s = (await sRes.json())[0];
  if (!s) return { ok: false, error: 'School not found' };
  if (!s.google_place_id) return { ok: false, error: 'No google_place_id on this school (never matched, or match was rejected)' };
  const before = { rating: s.google_rating, count: s.google_reviews_count, checked: s.google_rating_checked_at };
  const g = await fetchGoogleRatingByPlaceId(s.google_place_id);
  if (!g.ok) return { ok: false, before, ...g };
  if (g.rating == null) return { ok: true, changed: false, before, google: g, note: 'Google has no rating for this place yet; nothing written' };
  const patch = {
    google_rating: Math.round(Number(g.rating) * 10) / 10,
    google_reviews_count: g.count ?? s.google_reviews_count,
    google_rating_checked_at: new Date().toISOString(),
  };
  const uRes = await fetch(`${SB_URL}/rest/v1/schools?id=eq.${encodeURIComponent(schoolId)}`, {
    method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify(patch),
  });
  if (!uRes.ok) throw new Error('Update failed: ' + uRes.status + ' ' + (await uRes.text().catch(() => '')));
  const changed = Number(before.rating) !== patch.google_rating || Number(before.count) !== Number(patch.google_reviews_count);
  return { ok: true, changed, before, after: patch, google: g };
}
