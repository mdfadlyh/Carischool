// /api/cron-premium-photo-reversal.js
//
// Triggered daily by Vercel Cron (see vercel.json). Part of the photo-upload
// policy started 2026-08-23: premium schools missing a cover photo OR with
// fewer than GALLERY_MIN gallery photos get a 30-day deadline
// (schools.premium_photo_deadline, set once when the initial email + in-app
// banner went out -- see kemaskini.html's photoDeadlineBanner and the
// one-off notification sent the same day). This job checks daily for
// schools whose deadline has passed and are still non-compliant, and
// reverts them: is_premium -> false, premium_photo_deadline -> null. A
// school that became compliant before its deadline passed just has the
// stale deadline cleared, without touching is_premium.
//
// Excludes: the demo/test account (mdfadlyh@gmail.com, TADIKA DEMO
// CARISCHOOL) was explicitly kept out of the initial deadline-setting SQL
// and so never appears as a candidate here -- no special-casing needed in
// this file, just noting it so a future reader isn't confused about why
// it's absent from any run's output.
//
// Deliberately fully automatic, no admin review step and no reversal
// email -- both explicit decisions (2026-08-23): the initial 30-day warning
// (email + banner) was judged sufficient notice, and is_premium isn't tied
// to any billing/refund system, so reverting it is a pure status change,
// not a financial one. A school can simply re-request premium afterward
// through the normal upgradeBtn flow in kemaskini.html.
//
// Runs daily rather than weekly (unlike cron-weekly-digest) because a hard
// deadline should be enforced close to when it actually passes, not up to
// 6 days late.
//
// Env vars required (same project as cron-weekly-digest.js):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET

const PAGE_SIZE = 1000; // Supabase/PostgREST caps any single request at 1000 rows

function sbHeaders() {
  return {
    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function fetchAllRows(table, query) {
  const base = `${process.env.SUPABASE_URL}/rest/v1/${table}?${query}`;
  let all = [];
  let offset = 0;

  while (true) {
    const res = await fetch(base, {
      headers: {
        ...sbHeaders(),
        'Range-Unit': 'items',
        'Range': `${offset}-${offset + PAGE_SIZE - 1}`,
      },
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Supabase fetch failed for ${table}: ${res.status} ${errText}`);
    }
    const batch = await res.json();
    all = all.concat(batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

async function clearDeadline(schoolId) {
  const res = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/schools?id=eq.${schoolId}`,
    {
      method: 'PATCH',
      headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({ premium_photo_deadline: null }),
    }
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Failed to clear deadline for ${schoolId}: ${res.status} ${errText}`);
  }
}

async function revertSchool(schoolId) {
  const res = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/schools?id=eq.${schoolId}`,
    {
      method: 'PATCH',
      headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({ is_premium: false, premium_photo_deadline: null }),
    }
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Failed to revert ${schoolId}: ${res.status} ${errText}`);
  }
}

// Best-effort write to premium_reversal_runs. Never throws -- a failed log
// write must never be the reason a real cron run reports failure.
async function logRun(row) {
  try {
    const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/premium_reversal_runs`, {
      method: 'POST',
      headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('premium_reversal_runs log write failed:', res.status, errText);
    }
  } catch (e) {
    console.error('premium_reversal_runs log write threw:', e.message);
  }
}

// Extended 2026-08-23 (same day as launch) -- the policy covers gallery
// photos too, not just the cover photo: a premium school needs BOTH
// photo_url set AND at least GALLERY_MIN photos in school_photos.
// Mirrors kemaskini.html's own GALLERY_MIN constant -- keep both in sync
// if this threshold ever changes.
const GALLERY_MIN = 5;

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const nowIso = new Date().toISOString();
    // Only a simple PostgREST filter here (deadline set + already passed) --
    // the photo_url and gallery checks can't be expressed as REST filters
    // across two tables, so those are done in JS below, same pattern
    // cron-weekly-digest.js already uses for view/click counts.
    const candidates = await fetchAllRows(
      'schools',
      `select=id,name,photo_url&is_premium=eq.true&premium_photo_deadline=not.is.null&premium_photo_deadline=lt.${encodeURIComponent(nowIso)}`
    );

    let galleryCounts = {};
    if (candidates.length > 0) {
      const ids = candidates.map(c => c.id).join(',');
      const photoRows = await fetchAllRows('school_photos', `select=school_id&school_id=in.(${ids})`);
      photoRows.forEach(p => { galleryCounts[p.school_id] = (galleryCounts[p.school_id] || 0) + 1; });
    }

    const reverted = [];
    const clearedOnly = [];
    const errors = [];

    for (const school of candidates) {
      const hasCover = !!school.photo_url;
      const hasGallery = (galleryCounts[school.id] || 0) >= GALLERY_MIN;
      try {
        if (hasCover && hasGallery) {
          // Became compliant since the deadline was set but before this
          // cron ran -- clear the stale deadline so it doesn't keep
          // tripping this check every day, without touching is_premium.
          await clearDeadline(school.id);
          clearedOnly.push({ id: school.id, name: school.name });
        } else {
          await revertSchool(school.id);
          reverted.push({ id: school.id, name: school.name });
        }
      } catch (e) {
        console.error('Reversal error for', school.id, e);
        errors.push({ id: school.id, name: school.name, error: e.message });
      }
    }

    console.log(`cron-premium-photo-reversal: reverted=${reverted.length} clearedOnly=${clearedOnly.length} errors=${errors.length}`);

    await logRun({
      reversed_count: reverted.length,
      reversed_schools: reverted,
      error_count: errors.length,
      errors,
    });

    return res.status(200).json({ reverted, clearedOnly, errors });
  } catch (e) {
    console.error('cron-premium-photo-reversal fatal error:', e);
    await logRun({
      reversed_count: 0,
      error_count: 0,
      fatal_error: e.message,
    });
    return res.status(500).json({ error: e.message });
  }
}
