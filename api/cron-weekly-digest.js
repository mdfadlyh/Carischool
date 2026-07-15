// /api/cron-weekly-digest.js
//
// Triggered weekly by Vercel Cron (see vercel.json). Compares each school's
// current view_count / click_count against the snapshot taken at the last
// digest send (last_digest_views / last_digest_clicks columns), and emails
// a digest ONLY when there's been genuine new WhatsApp click activity --
// this is deliberately click-gated, not view-gated, since clicks are a much
// stronger signal of real parent intent and views alone (including Fadly's
// own dev/testing sessions, though those are now excluded at the source via
// cs_dev_mode in school.html/index.html) are noisier.
//
// Two different templates, in English:
//   - Claimed schools: a neutral "here's your weekly report" digest.
//   - Unclaimed schools (must have an email on file): the same stats, framed
//     as a claim-now nudge, since real parent interest is the single best
//     conversion argument for outreach.
//
// Env vars required (verify these match your actual Vercel project names):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, CRON_SECRET

import { createClient } from '@supabase/supabase-js';

const MIN_CLICKS_TO_SEND = 3;

export default async function handler(req, res) {
  // Verify this request genuinely came from Vercel Cron, not a public hit
  // on the URL. Vercel automatically attaches this header to scheduled
  // invocations when CRON_SECRET is set as a project env var.
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: schools, error: schoolsErr } = await supabase
    .from('schools')
    .select('id, name, email, is_claimed, last_digest_views, last_digest_clicks')
    .not('email', 'is', null);

  if (schoolsErr) {
    console.error('Failed to fetch schools:', schoolsErr);
    return res.status(500).json({ error: schoolsErr.message });
  }

  const { data: viewRows } = await supabase.from('school_views').select('school_id, view_count');
  const { data: clickRows } = await supabase.from('school_whatsapp_clicks').select('school_id, click_count');

  const viewMap = Object.fromEntries((viewRows || []).map(v => [v.school_id, v.view_count]));
  const clickMap = Object.fromEntries((clickRows || []).map(c => [c.school_id, c.click_count]));

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
        // Only move the baseline forward on a confirmed successful send --
        // if the email fails, we want to retry with the same delta next run
        // rather than silently losing the count.
        await supabase
          .from('schools')
          .update({ last_digest_views: currentViews, last_digest_clicks: currentClicks })
          .eq('id', school.id);

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

  return res.status(200).json(results);
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
