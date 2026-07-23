// /api/cron-weekly-digest.js
//
// Triggered weekly by Vercel Cron (see vercel.json). Compares each school's
// current view_count / click_count against the snapshot taken at the last
// digest send (last_digest_views / last_digest_clicks columns), and emails
// a digest ONLY when there's been genuine new WhatsApp click activity --
// clicks are a much stronger signal of real parent intent than views.
// "Click" here means either the general WhatsApp contact button OR the
// "Tanya Yuran & Kekosongan" fee-ask button (combined 2026-07-23) -- both
// open WhatsApp to the same school, so both count toward the same
// MIN_CLICKS_TO_SEND threshold. See school_whatsapp_clicks / school_fee_clicks.
//
// Two different templates, in English:
//   - Claimed schools: a neutral "here's your weekly report" digest.
//   - Unclaimed schools (must have an email on file): the same stats, framed
//     as a claim-now nudge.
//
// IMPORTANT: uses plain fetch() against Supabase's PostgREST API directly,
// NOT the @supabase/supabase-js package -- that package isn't installed as
// a project dependency, and adding it would mean touching package.json /
// npm install for a workflow that otherwise never needs a build step. This
// keeps the whole API layer dependency-free, matching send-claim-email.js.
//
// RUN LOGGING (added 2026-07-20): Vercel's runtime logs only retain 1 hour
// on the current plan, which makes a once-a-week cron run effectively
// unobservable after the fact -- by the time anyone thinks to check, the
// console.log output is already gone. Every run (success or crash) now
// writes one row to the digest_runs table instead, which survives forever
// regardless of hosting plan. Logging is deliberately best-effort: if the
// log write itself fails, it's swallowed, not thrown -- a broken log
// should never be the reason a real digest run fails.
//
// Env vars required (verify these match your actual Vercel project names):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, CRON_SECRET

const MIN_CLICKS_TO_SEND = 3;
const PAGE_SIZE = 1000; // Supabase/PostgREST caps any single request at 1000 rows

function sbHeaders() {
  return {
    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

// Pages through a PostgREST table using the Range header until all rows
// are collected -- required for any query that could return >1000 rows.
// (school_views / school_whatsapp_clicks / school_fee_clicks are small tables and don't need
// this, but the schools query with an email filter does: ~1,476 rows.)
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

async function updateSchoolBaseline(schoolId, views, clicks) {
  const res = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/schools?id=eq.${schoolId}`,
    {
      method: 'PATCH',
      headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({ last_digest_views: views, last_digest_clicks: clicks }),
    }
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Failed to update baseline for ${schoolId}: ${res.status} ${errText}`);
  }
}

// Best-effort write to digest_runs. Never throws -- a failed log write
// must never be the reason a real cron run reports failure.
async function logDigestRun(row) {
  try {
    const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/digest_runs`, {
      method: 'POST',
      headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('digest_runs log write failed:', res.status, errText);
    }
  } catch (e) {
    console.error('digest_runs log write threw:', e.message);
  }
}

export default async function handler(req, res) {
  // Verify this request genuinely came from Vercel Cron, not a public hit
  // on the URL. Vercel automatically attaches this header to scheduled
  // (and dashboard "Run") invocations when CRON_SECRET is set as a project
  // env var.
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const schools = await fetchAllRows(
      'schools',
      'select=id,name,email,is_claimed,last_digest_views,last_digest_clicks&email=not.is.null'
    );
    const viewRows = await fetchAllRows('school_views', 'select=school_id,view_count');
    // Two click sources, both genuinely "someone tried to WhatsApp this
    // school": the general contact button (school_whatsapp_clicks) and the
    // "Tanya Yuran & Kekosongan" fee-ask button (school_fee_clicks), added
    // 2026-07-23. Combined per explicit decision -- a parent asking
    // specifically about fees/vacancy is at least as strong a signal of
    // real intent as a general inquiry, and previously contributed nothing
    // to this threshold despite being real contact activity. Mirrors the
    // same combining logic already applied to admin.html's dashboard.
    const waClickRows = await fetchAllRows('school_whatsapp_clicks', 'select=school_id,click_count');
    const feeClickRows = await fetchAllRows('school_fee_clicks', 'select=school_id,click_count');

    const viewMap = Object.fromEntries(viewRows.map(v => [v.school_id, v.view_count]));
    const clickMap = {};
    waClickRows.forEach(c => { clickMap[c.school_id] = (clickMap[c.school_id] || 0) + (c.click_count || 0); });
    feeClickRows.forEach(c => { clickMap[c.school_id] = (clickMap[c.school_id] || 0) + (c.click_count || 0); });

    const results = { sent: [], skipped: 0, errors: [] };

    for (const school of schools) {
      const currentViews = viewMap[school.id] || 0;
      const currentClicks = clickMap[school.id] || 0;
      const deltaViews = Math.max(0, currentViews - (school.last_digest_views || 0));
      const deltaClicks = Math.max(0, currentClicks - (school.last_digest_clicks || 0));

      if (deltaClicks < MIN_CLICKS_TO_SEND) {
        results.skipped++;
        continue;
      }

      const { subject, html } = school.is_claimed
        ? buildClaimedDigest(school, deltaViews, deltaClicks)
        : buildUnclaimedDigest(school, deltaViews, deltaClicks);

      try {
        const sendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'CariSchool <noreply@carischools.com>',
            to: [school.email],
            subject,
            html,
          }),
        });

        if (sendRes.ok) {
          // Only move the baseline forward on a confirmed successful send.
          await updateSchoolBaseline(school.id, currentViews, currentClicks);
          results.sent.push({
            id: school.id,
            name: school.name,
            track: school.is_claimed ? 'claimed' : 'unclaimed',
            deltaViews,
            deltaClicks,
          });
        } else {
          const errData = await sendRes.json().catch(() => ({}));
          console.error('Resend API error for', school.id, errData);
          results.errors.push({ id: school.id, name: school.name, error: 'Resend API error' });
        }
      } catch (e) {
        console.error('Digest send error for', school.id, e);
        results.errors.push({ id: school.id, name: school.name, error: e.message });
      }
    }

    console.log(`cron-weekly-digest: sent=${results.sent.length} skipped=${results.skipped} errors=${results.errors.length}`);

    await logDigestRun({
      sent_count: results.sent.length,
      skipped_count: results.skipped,
      error_count: results.errors.length,
      sent_schools: results.sent,
      send_errors: results.errors,
    });

    return res.status(200).json(results);
  } catch (e) {
    console.error('cron-weekly-digest fatal error:', e);
    await logDigestRun({
      sent_count: 0,
      skipped_count: 0,
      error_count: 0,
      fatal_error: e.message,
    });
    return res.status(500).json({ error: e.message });
  }
}

function buildClaimedDigest(school, views, clicks) {
  const subject = `Your CariSchool Weekly Report — ${views} views, ${clicks} WhatsApp clicks`;
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; color: #1C1917;">
      <h2 style="color: #0D9488;">Your Weekly CariSchool Report 📊</h2>
      <p>Here's how parents engaged with <strong>${school.name}</strong>'s profile this week:</p>
      <div style="display:flex; gap:12px; margin:16px 0;">
        <div style="flex:1; background:#F5F5F4; padding:14px 16px; border-radius:10px; text-align:center;">
          <div style="font-size:24px; font-weight:900; color:#0F766E;">${views}</div>
          <div style="font-size:12px; color:#78716C; font-weight:700;">Profile Views</div>
        </div>
        <div style="flex:1; background:#F5F5F4; padding:14px 16px; border-radius:10px; text-align:center;">
          <div style="font-size:24px; font-weight:900; color:#16A34A;">${clicks}</div>
          <div style="font-size:12px; color:#78716C; font-weight:700;">WhatsApp Clicks</div>
        </div>
      </div>
      <p style="font-size:13px; color:#78716C;">Schools with complete photos and up-to-date fee info consistently get more views from parents searching in your area.</p>
      <a href="https://www.carischools.com/kemaskini.html?id=${school.id}" style="display:inline-block; background:#0D9488; color:#fff; font-weight:800; padding:12px 22px; border-radius:10px; text-decoration:none; margin-top:8px;">Update My Profile →</a>
      <p style="font-size:13px; color:#78716C; margin-top:18px;">— CariSchool Team</p>
    </div>
  `;
  return { subject, html };
}

function buildUnclaimedDigest(school, views, clicks) {
  const subject = `${views} parents looked at your school this week — see who`;
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; color: #1C1917;">
      <h2 style="color: #0D9488;">Parents are looking for schools like yours 👀</h2>
      <p>This week, real parents searching CariSchool found <strong>${school.name}</strong>:</p>
      <div style="display:flex; gap:12px; margin:16px 0;">
        <div style="flex:1; background:#F5F5F4; padding:14px 16px; border-radius:10px; text-align:center;">
          <div style="font-size:24px; font-weight:900; color:#0F766E;">${views}</div>
          <div style="font-size:12px; color:#78716C; font-weight:700;">Profile Views</div>
        </div>
        <div style="flex:1; background:#FEF3C7; padding:14px 16px; border-radius:10px; text-align:center;">
          <div style="font-size:24px; font-weight:900; color:#92400E;">${clicks}</div>
          <div style="font-size:12px; color:#92400E; font-weight:700;">Tried to WhatsApp You</div>
        </div>
      </div>
      <p style="font-size:14px;">Your profile isn't claimed yet — which means you can't see full details on these parents, add real photos, or make sure your fee and contact info is accurate for them.</p>
      <p style="font-size:13px; color:#78716C;">Claiming takes about 2 minutes and is completely free.</p>
      <a href="https://www.carischools.com/preview.html?id=${school.id}&src=email_digest" style="display:inline-block; background:#F59E0B; color:#fff; font-weight:800; padding:12px 22px; border-radius:10px; text-decoration:none; margin-top:8px;">See Your Profile & Claim It →</a>
      <p style="font-size:13px; color:#78716C; margin-top:18px;">— CariSchool Team</p>
    </div>
  `;
  return { subject, html };
}
