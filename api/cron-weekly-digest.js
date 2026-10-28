// /api/cron-weekly-digest.js
//
// Triggered monthly by Vercel Cron (see vercel.json) -- changed from weekly
// 2026-09-04, Fadly's call: weekly was too frequent, risked feeling like spam
// to both claimed and unclaimed schools. Compares each school's
// current view_count / click_count against the snapshot taken at the last
// digest send (last_digest_views / last_digest_clicks columns) -- this
// comparison is timing-agnostic, so the monthly change needed no logic
// change here, only the schedule and the email copy below -- and emails
// a digest ONLY when there's been genuine new WhatsApp click activity --
// clicks are a much stronger signal of real parent intent than views.
// "Click" here means either the general WhatsApp contact button OR the
// "Tanya Yuran & Kekosongan" fee-ask button (combined 2026-07-23) -- both
// open WhatsApp to the same school, so both count toward the same
// MIN_CLICKS_* thresholds. See school_whatsapp_clicks / school_fee_clicks.
//
// Two templates: claimed schools get an English "here's your monthly report";
// unclaimed schools with 10+ new taps get a bilingual "parents tried to reach you,
// claim for free" note (removed 2026-10-01, restored 2026-10-28 by Fadly's decision
// with a 10-tap floor and daily/monthly caps -- see the block below).
//
// IMPORTANT: uses plain fetch() against Supabase's PostgREST API directly,
// NOT the @supabase/supabase-js package -- that package isn't installed as
// a project dependency, and adding it would mean touching package.json /
// npm install for a workflow that otherwise never needs a build step. This
// keeps the whole API layer dependency-free, matching send-claim-email.js.
//
// RUN LOGGING (added 2026-07-20): Vercel's runtime logs only retain 1 hour
// on the current plan, which makes an infrequent cron run effectively
// unobservable after the fact -- by the time anyone thinks to check, the
// console.log output is already gone. Every run (success or crash) now
// writes one row to the digest_runs table instead, which survives forever
// regardless of hosting plan. Logging is deliberately best-effort: if the
// log write itself fails, it's swallowed, not thrown -- a broken log
// should never be the reason a real digest run fails.
//
// PERSONALIZED COMPLETENESS TIP (added 2026-08-07): the claimed-school
// digest previously carried one generic tip line, identical for every
// school regardless of what was actually missing from their own profile.
// Replaced with a real check against the same 5-item completeness
// checklist kemaskini.html already uses (photo/description/fee/hours+age/
// curriculum) -- reusing existing data, not a new build. A school missing
// something specific now hears about that specific thing; a school that's
// already fully complete gets a genuine congratulations instead of being
// told to do something it's already done.
//
// Env vars required (verify these match your actual Vercel project names):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, CRON_SECRET

// ── WHO GETS A DIGEST, AND HOW MANY PER DAY (rewritten 2026-10-28, Fadly's rules) ──
// Claimed schools: a monthly report of their own numbers (they also see clicks live in
// kemaskini's activity card). 3+ new WhatsApp taps (Fadly 2026-10-28: with paid Premium coming,
// a report showing 1 enquiry a month undersells CariSchool; owners still see every tap in kemaskini).
// Unclaimed schools: allowed again ONLY at 5+ new taps since our last email to them
// (2026-10-28, Fadly reversing the 2026-09-18 blanket ban for this high-signal case).
// Never to an unclaimed row whose email already belongs to a claimed school (that owner is
// already a customer), never to digest_opt_out rows.
// Pacing: the cron now runs DAILY but only sends in the first SEND_WINDOW_DAYS of the month
// (MYT), each school at most once per month (last_digest_sent_at). Claimed first, then the
// busiest unclaimed. Whoever doesn't fit today's budget goes tomorrow.
// Budget: Resend free tier is 100/day and 3,000/month for ALL mail. DAILY_BUDGET leaves ~30/day
// for claim codes, approvals and cron-premium-photo-reversal's reminders (max ~15/run).
const MIN_CLICKS_CLAIMED = 3;
const MIN_CLICKS_UNCLAIMED = 5;     // Fadly 2026-10-28: 10 qualified nobody; 5 = ~11 now, a few/month
const DAILY_BUDGET = 70;
const MONTHLY_BUDGET = 1500;     // half the monthly free tier; the rest stays for transactional mail
const SEND_WINDOW_DAYS = 7;
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

async function updateSchoolBaseline(schoolId, views, clicks, sentAt) {
  const res = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/schools?id=eq.${schoolId}`,
    {
      method: 'PATCH',
      headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({ last_digest_views: views, last_digest_clicks: clicks, last_digest_sent_at: sentAt }),
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

// Mirrors kemaskini.html's own completeness checklist exactly (5 items,
// same conditions) -- see that file's checklist array. Returns an array
// of { label, tip } for whichever items are NOT done, in the same
// priority order kemaskini itself displays them in, so "the first thing
// mentioned" is consistent between the digest email and the edit page a
// school lands on after clicking through.
function getMissingItems(school) {
  const items = [
    {
      done: !!school.photo_url,
      label: 'Add photos',
      tip: 'Schools with real photos get noticeably more parent interest than a placeholder.',
    },
    {
      done: !!(school.description && school.description.trim().length > 10),
      label: 'Add a description',
      tip: 'Tell parents what makes your school different in a couple of sentences.',
    },
    {
      done: !!(school.fee_min || school.fee_max),
      label: 'Add your fee info',
      tip: 'Fee range is one of the most-searched details parents look for before contacting a school.',
    },
    {
      done: !!(school.opens_at && school.closes_at && school.age_min_years != null),
      label: 'Add operating hours & age range',
      tip: 'Parents want to know this before they even call.',
    },
    {
      done: !!(school.curriculum && school.curriculum.trim().length > 0),
      label: 'Add your curriculum',
      tip: 'Montessori, KSPK, bilingual, whatever makes you unique -- parents filter by this.',
    },
  ];
  return items.filter(i => !i.done);
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
    // Calendar month in Malaysia time (UTC+8): the digest is a monthly report for MY schools.
    const myt = new Date(Date.now() + 8 * 3600e3);
    const dayOfMonth = myt.getUTCDate();
    const monthStartIso = new Date(Date.UTC(myt.getUTCFullYear(), myt.getUTCMonth(), 1) - 8 * 3600e3).toISOString();
    if (dayOfMonth > SEND_WINDOW_DAYS) {
      return res.status(200).json({ skipped: true, reason: `outside send window (day ${dayOfMonth})` });
    }
    const monthRuns = await fetchAllRows('digest_runs', `select=sent_count&run_at=gte.${encodeURIComponent(monthStartIso)}`);
    const sentThisMonth = monthRuns.reduce((n, r) => n + (r.sent_count || 0), 0);
    const budget = Math.max(0, Math.min(DAILY_BUDGET, MONTHLY_BUDGET - sentThisMonth));

    const schools = await fetchAllRows(
      'schools',
      'select=id,name,commercial_name,slug,email,is_claimed,last_digest_views,last_digest_clicks,last_digest_sent_at,photo_url,description,fee_min,fee_max,opens_at,closes_at,age_min_years,curriculum'
      + '&email=not.is.null&is_active=eq.true&is_demo=eq.false&digest_opt_out=eq.false'
    );
    const viewRows = await fetchAllRows('school_views', 'select=school_id,view_count');
    // Two click sources, both genuinely "someone tried to WhatsApp this
    // school": the general contact button (school_whatsapp_clicks) and the
    // "Tanya Yuran & Kekosongan" fee-ask button (school_fee_clicks), added
    // 2026-07-23. Combined per explicit decision.
    const waClickRows = await fetchAllRows('school_whatsapp_clicks', 'select=school_id,click_count');
    const feeClickRows = await fetchAllRows('school_fee_clicks', 'select=school_id,click_count');

    const viewMap = Object.fromEntries(viewRows.map(v => [v.school_id, v.view_count]));
    const clickMap = {};
    waClickRows.forEach(c => { clickMap[c.school_id] = (clickMap[c.school_id] || 0) + (c.click_count || 0); });
    feeClickRows.forEach(c => { clickMap[c.school_id] = (clickMap[c.school_id] || 0) + (c.click_count || 0); });
    const claimedEmails = new Set(schools.filter(s => s.is_claimed).map(s => String(s.email).trim().toLowerCase()));

    const results = { sent: [], skipped: 0, deferred: 0, errors: [], budget, sentThisMonth };

    const queue = [];
    for (const school of schools) {
      if (school.last_digest_sent_at && school.last_digest_sent_at >= monthStartIso) { results.skipped++; continue; }
      if (!school.is_claimed && claimedEmails.has(String(school.email).trim().toLowerCase())) { results.skipped++; continue; }
      const currentViews = viewMap[school.id] || 0;
      const currentClicks = clickMap[school.id] || 0;
      const deltaViews = Math.max(0, currentViews - (school.last_digest_views || 0));
      const deltaClicks = Math.max(0, currentClicks - (school.last_digest_clicks || 0));
      if (deltaClicks < (school.is_claimed ? MIN_CLICKS_CLAIMED : MIN_CLICKS_UNCLAIMED)) { results.skipped++; continue; }
      queue.push({ school, currentViews, currentClicks, deltaViews, deltaClicks });
    }
    // Claimed owners first (it's their report), then the busiest unclaimed schools.
    queue.sort((a, b) => (b.school.is_claimed - a.school.is_claimed) || (b.deltaClicks - a.deltaClicks));
    results.deferred = Math.max(0, queue.length - budget);

    for (const { school, currentViews, currentClicks, deltaViews, deltaClicks } of queue.slice(0, budget)) {
      const { subject, html } = school.is_claimed
        ? buildClaimedDigest(school, deltaViews, deltaClicks, getMissingItems(school))
        : buildUnclaimedDigest(school, deltaClicks);

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
            // One-click opt-out for the unclaimed track; replies land in hello@ (Fadly's Gmail)
            // and he sets digest_opt_out. Claimed owners get it too -- costs nothing.
            reply_to: 'hello@carischools.com',
            headers: { 'List-Unsubscribe': '<mailto:hello@carischools.com?subject=unsubscribe>' },
          }),
        });

        if (sendRes.ok) {
          // Only move the baseline forward on a confirmed successful send.
          await updateSchoolBaseline(school.id, currentViews, currentClicks, new Date().toISOString());
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

    console.log(`cron-weekly-digest: sent=${results.sent.length} deferred=${results.deferred} skipped=${results.skipped} errors=${results.errors.length} budget=${budget}`);

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

function buildClaimedDigest(school, views, clicks, missingItems) {
  const subject = `Your CariSchool Monthly Report — ${views} views, ${clicks} WhatsApp clicks`;

  // Personalized tip block: if something specific is missing, name it
  // and lead with the single highest-priority item (same order
  // kemaskini.html itself uses) rather than listing all of them at
  // once and overwhelming the email. If a second or third item is also
  // missing, say so briefly without spelling every one out. A fully
  // complete profile gets a genuine congratulations instead of being
  // told to do something it's already done -- telling a 100% school to
  // "complete your profile" would just be wrong.
  let tipHtml;
  if (missingItems.length === 0) {
    tipHtml = `<p style="font-size:13px;color:#16A34A;font-weight:700;">✅ Your profile is fully complete — nice work! Keep photos and fees updated whenever something changes.</p>`;
  } else {
    const top = missingItems[0];
    const restCount = missingItems.length - 1;
    const restNote = restCount > 0
      ? ` (and ${restCount} other ${restCount === 1 ? 'item' : 'items'} worth a look)`
      : '';
    tipHtml = `<p style="font-size:13px;color:#78716C;"><strong style="color:#1C1917;">${top.label}</strong>${restNote} — ${top.tip}</p>`;
  }

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; color: #1C1917;">
      <h2 style="color: #0D9488;">Your Monthly CariSchool Report 📊</h2>
      <p>Here's how parents engaged with <strong>${school.name}</strong>'s profile this month:</p>
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
      ${tipHtml}
      <a href="https://www.carischools.com/kemaskini.html?id=${school.id}" style="display:inline-block; background:#0D9488; color:#fff; font-weight:800; padding:12px 22px; border-radius:10px; text-decoration:none; margin-top:8px;">Update My Profile →</a>
      <p style="font-size:13px; color:#78716C; margin-top:18px;">— CariSchool Team</p>
    </div>
  `;
  return { subject, html };
}

// Unclaimed track (2026-10-28). Bilingual, factual, one reason to act: real parents tried to
// WhatsApp this school through CariSchool. No sales copy, no price, and a clear way out.
function buildUnclaimedDigest(school, clicks) {
  const nm = esc(school.commercial_name || school.name);
  const profile = `https://www.carischools.com/school/${encodeURIComponent(school.slug || school.id)}`;
  const claim = `https://www.carischools.com/claim.html?id=${encodeURIComponent(school.id)}`;
  const subject = `${clicks} ibu bapa cuba WhatsApp ${school.commercial_name || school.name} melalui CariSchool`;
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; color: #1C1917;">
      <h2 style="color: #0D9488;">${clicks} ibu bapa cuba hubungi sekolah anda 💬</h2>
      <p>Salam sejahtera,</p>
      <p>Sejak laporan terakhir kami, <strong>${clicks} ibu bapa</strong> telah menekan butang WhatsApp untuk <strong>${nm}</strong> di CariSchool, direktori tadika & taska berdaftar di Malaysia.</p>
      <p>Profil sekolah anda disenaraikan daripada rekod awam KPM/JKM. Anda boleh <strong>menuntut profil ini secara percuma</strong> untuk memastikan nombor WhatsApp, yuran, waktu operasi dan gambar adalah tepat.</p>
      <a href="${claim}" style="display:inline-block;background:#0D9488;color:#fff;font-weight:800;padding:12px 22px;border-radius:10px;text-decoration:none;margin:8px 0;">Tuntut Profil Percuma →</a>
      <p style="font-size:13px;"><a href="${profile}" style="color:#0F766E;font-weight:700;">Lihat profil sekolah anda</a></p>
      <p style="font-size:12.5px; color:#78716C;">${clicks} parents tapped WhatsApp for your school on CariSchool since our last update. You can claim your listing for free to keep your contact details, fees and photos accurate.</p>
      <p style="font-size:12px; color:#A8A29E; margin-top:18px;">Tidak mahu menerima emel ini? Balas "STOP" dan kami akan berhenti menghantarnya. / Reply "STOP" to stop these emails.</p>
      <p style="font-size:13px; color:#78716C;">— CariSchool Team</p>
    </div>`;
  return { subject, html };
}

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
