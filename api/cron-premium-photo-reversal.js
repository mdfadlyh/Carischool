// /api/cron-premium-photo-reversal.js
//
// Triggered daily by Vercel Cron (see vercel.json). Part of the photo-upload
// policy started 2026-08-23: premium schools missing a cover photo OR with
// fewer than GALLERY_MIN gallery photos get a 30-day deadline
// (schools.premium_photo_deadline).
//
// Extended 2026-09-07 to do BOTH halves of this policy automatically, not
// just the reversal half -- previously, setting the initial 30-day deadline
// for a newly-premium, newly-claimed school was a manual one-off (the
// 2026-08-23 launch batch), with nothing ongoing to catch schools that
// claimed and went Premium afterward. This file is named "...reversal"
// for git-blame continuity, but now covers the full lifecycle:
//   1. notifyNewlyEligibleSchools() -- finds Premium schools that are
//      GRACE_DAYS past their claim approval, still non-compliant, and have
//      never been notified (premium_photo_deadline IS NULL). Sends the
//      same "one more step to keep Premium" first-notice email the
//      2026-08-23 launch batch used, then sets their deadline to
//      NOTICE_DAYS from now.
//   2. The original reversal logic below -- schools whose deadline has
//      already passed and are still non-compliant get reverted
//      (is_premium -> false), or have a stale deadline cleared if they
//      became compliant in time.
// Merged into this single file rather than a new /api/ file because the
// Vercel function count was already at its 12-function cap when this was
// written -- see CLAUDE.md.
//
// Excludes: is_demo=true schools are filtered out of both halves via a
// direct query condition now, rather than a one-time manual SQL exclusion
// (the notify half didn't exist yet when that manual exclusion happened,
// so it needed its own real filter, not just a comment referencing the
// old one).
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
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, CRON_SECRET

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

// Added 2026-09-07. GRACE_DAYS mirrors Fadly's own instruction verbatim
// ("never for 3 days after they claim") -- a brand new owner shouldn't get
// a Premium-at-risk email in their first few days, they just haven't had
// time yet. NOTICE_DAYS matches the original 2026-08-23 policy's own
// window exactly, so a school notified today and one notified next month
// get the identically-fair 30 days, not a shorter window because the
// launch batch got the "real" 30 and everyone after gets less by accident.
const GRACE_DAYS = 3;
const NOTICE_DAYS = 30;

function missingText(hasCover) {
  return hasCover ? 'at least 5 gallery photos' : 'a cover photo and at least 5 gallery photos';
}

// Same visual structure as the 2026-08-23 launch email (teal #0D9488 /
// gray #78716C CariSchool palette, one card per listing) -- built as a
// real JS template literal here, not hand-retyped JSON like the one-off
// send earlier tonight was, specifically so emoji survive intact. That
// manual send had a real, confirmed encoding bug (🙏 arrived corrupted in
// the delivered email) purely from retyping already-escaped JSON by hand;
// a literal string in actual source code doesn't have that failure mode.
function buildFirstNoticeEmail(schools, deadlineDate) {
  const plural = schools.length > 1 ? 's' : '';
  const deadlineLabel = deadlineDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const cardsHtml = schools.map(s => `
    <div style="background:#F5F5F4; border-radius:10px; padding:14px 16px; margin-bottom:10px;">
      <div style="font-weight:800; font-size:14px; color:#1C1917;">${s.name}</div>
      <div style="font-size:12.5px; color:#78716C; margin:4px 0 10px;">Missing: ${missingText(!!s.photo_url)}</div>
      <a href="https://www.carischools.com/kemaskini.html?id=${s.id}" style="display:inline-block; background:#0D9488; color:#fff; font-weight:800; padding:9px 18px; border-radius:8px; text-decoration:none; font-size:13px;">Upload Now →</a>
    </div>`).join('');

  const cardsText = schools.map(s =>
    `${s.name} — missing ${missingText(!!s.photo_url)}\nUpload: https://www.carischools.com/kemaskini.html?id=${s.id}`
  ).join('\n\n');

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; color: #1C1917;">
      <h2 style="color: #0D9488;">Thank you for claiming your profile${plural}! 🙏</h2>
      <p>We're glad to have the following school${plural} verified on CariSchool, and appreciate you upgrading to Premium.</p>
      <p style="font-size:13px; color:#78716C;">One thing left to complete each profile below — it's the single most important thing parents look for before reaching out:</p>
${cardsHtml}
      <p style="font-size:13px; margin-top:16px;">Please complete each listing above by <strong>${deadlineLabel}</strong>. Any listing still missing these by then will have its Premium status automatically removed and return to a verified (non-Premium) profile. Nothing else is affected, and you can re-apply for Premium anytime once complete.</p>
      <p style="font-size:13px; color:#78716C; margin-top:18px;">— CariSchool Team</p>
    </div>`;

  const text = `Thank you for claiming your profile${plural}!\n\n${cardsText}\n\nComplete by ${deadlineLabel} to keep Premium status. — CariSchool Team`;

  return {
    subject: `Thank you for claiming your CariSchool profile${plural} — one more step to keep Premium`,
    html,
    text,
  };
}

async function sendEmail(to, subject, html, text) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: 'CariSchool <noreply@carischools.com>', to: [to], subject, html, text }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Resend send failed for ${to}: ${res.status} ${errText}`);
  }
}

async function setDeadline(schoolId, deadlineIso) {
  const res = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/schools?id=eq.${schoolId}`,
    {
      method: 'PATCH',
      headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({ premium_photo_deadline: deadlineIso }),
    }
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Failed to set deadline for ${schoolId}: ${res.status} ${errText}`);
  }
}

// Finds Premium schools past the grace period, never notified, still
// non-compliant -- groups by owner email (one owner can hold several
// listings, e.g. a franchise), sends one email per owner covering all
// their qualifying listings, then sets each listing's deadline. A school
// that becomes compliant, or whose owner hasn't cleared the grace period
// yet, is silently skipped and picked up on a later run -- this function
// runs daily, so nothing is ever more than a day late.
async function notifyNewlyEligibleSchools() {
  const graceCutoffIso = new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const candidates = await fetchAllRows(
    'schools',
    `select=id,name,email,photo_url&is_premium=eq.true&is_demo=eq.false&premium_photo_deadline=is.null&email=not.is.null`
  );

  if (candidates.length === 0) return { notified: [], errors: [] };

  const ids = candidates.map(c => c.id).join(',');

  const [galleryRows, claimRows] = await Promise.all([
    fetchAllRows('school_photos', `select=school_id&school_id=in.(${ids})`),
    // Only 'approved' claims count as a real claim date -- a pending or
    // rejected submission shouldn't start the grace-period clock.
    fetchAllRows('claim_submissions', `select=school_id,reviewed_at&school_id=in.(${ids})&status=eq.approved`),
  ]);

  const galleryCounts = {};
  galleryRows.forEach(p => { galleryCounts[p.school_id] = (galleryCounts[p.school_id] || 0) + 1; });

  // A school can have multiple claim_submissions rows (e.g. re-claimed);
  // the earliest approval is the real claim date for grace-period purposes.
  const earliestApproval = {};
  claimRows.forEach(c => {
    if (!c.reviewed_at) return;
    if (!earliestApproval[c.school_id] || c.reviewed_at < earliestApproval[c.school_id]) {
      earliestApproval[c.school_id] = c.reviewed_at;
    }
  });

  const eligible = candidates.filter(s => {
    const hasCover = !!s.photo_url;
    const hasGallery = (galleryCounts[s.id] || 0) >= GALLERY_MIN;
    if (hasCover && hasGallery) return false; // already compliant, nothing to notify
    const approvedAt = earliestApproval[s.id];
    if (!approvedAt) return false; // no approved claim on record -- shouldn't happen, skip rather than guess
    return approvedAt <= graceCutoffIso;
  });

  const byEmail = {};
  eligible.forEach(s => {
    if (!byEmail[s.email]) byEmail[s.email] = [];
    byEmail[s.email].push(s);
  });

  const deadlineIso = new Date(Date.now() + NOTICE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const deadlineDate = new Date(deadlineIso);
  const notified = [];
  const errors = [];

  for (const [email, schools] of Object.entries(byEmail)) {
    try {
      const { subject, html, text } = buildFirstNoticeEmail(schools, deadlineDate);
      await sendEmail(email, subject, html, text);
      // Only set deadlines after a confirmed successful send -- same
      // "don't update state on an unconfirmed send" principle
      // cron-weekly-digest.js already applies to its own baseline update.
      for (const s of schools) {
        await setDeadline(s.id, deadlineIso);
        notified.push({ id: s.id, name: s.name, email });
      }
    } catch (e) {
      console.error('Notify error for', email, e);
      errors.push({ email, schools: schools.map(s => s.id), error: e.message });
    }
  }

  return { notified, errors };
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Half 1: notify newly-eligible schools and start their 30-day clock.
    // Runs first so a school can never be notified and reverted in the
    // same run -- setting a deadline of now()+30 days means it can't
    // possibly also be lt.now() a few lines later in the same request.
    const { notified, errors: notifyErrors } = await notifyNewlyEligibleSchools();
    console.log(`cron-premium-photo-reversal (notify half): notified=${notified.length} errors=${notifyErrors.length}`);

    // Half 2: revert schools whose deadline has already passed.
    const nowIso = new Date().toISOString();
    // Only a simple PostgREST filter here (deadline set + already passed) --
    // the photo_url and gallery checks can't be expressed as REST filters
    // across two tables, so those are done in JS below, same pattern
    // cron-weekly-digest.js already uses for view/click counts.
    const candidates = await fetchAllRows(
      'schools',
      `select=id,name,photo_url&is_premium=eq.true&is_demo=eq.false&premium_photo_deadline=not.is.null&premium_photo_deadline=lt.${encodeURIComponent(nowIso)}`
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

    console.log(`cron-premium-photo-reversal (revert half): reverted=${reverted.length} clearedOnly=${clearedOnly.length} errors=${errors.length}`);

    await logRun({
      reversed_count: reverted.length,
      reversed_schools: reverted,
      error_count: errors.length + notifyErrors.length,
      errors: [...errors, ...notifyErrors],
      notified_count: notified.length,
      notified_schools: notified,
    });

    return res.status(200).json({ notified, notifyErrors, reverted, clearedOnly, errors });
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
