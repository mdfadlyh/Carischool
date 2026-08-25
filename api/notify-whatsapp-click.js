// /api/notify-whatsapp-click.js
//
// Called from school.html right after the existing increment_school_whatsapp_click
// RPC fires (see that call site for the exact sequencing comment). Two jobs:
// 1. Log the click as a real event (whatsapp_click_events) -- previously
//    only an atomic counter existed, no per-click record. This table also
//    seeds the future inquiry-tracking inbox (Build #2 on the roadmap),
//    no backfill needed later.
// 2. Push a notification to every device the school has subscribed
//    (push_subscriptions), so a school owner learns about interest in
//    real time instead of only seeing a stat next time they open
//    kemaskini.html.
//
// Deliberately fire-and-forget from the client (same pattern as the
// click-count RPC itself) -- a parent's WhatsApp click must never be
// slowed down or blocked by this endpoint's success or failure. This file
// swallows its own errors internally rather than ever surfacing a failure
// state the client would need to handle.
//
// Uses the 'web-push' npm package (not a raw fetch, unlike the other /api
// cron files) since VAPID-signed push payload encryption is genuinely
// nontrivial to hand-roll correctly -- this is the one exception to this
// project's usual zero-dependency convention, justified by that
// complexity, not a first choice.
//
// Env vars required (in addition to the existing SUPABASE_* ones):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: address)
//
// NOT auth-gated the way the cron files are (no CRON_SECRET check) --
// this is called by any visitor's browser on a real WhatsApp click, not a
// scheduled job. There's no sensitive action here beyond "send this
// school's own subscribed devices a notification," so open-but-scoped is
// the right posture, same as the existing increment_school_whatsapp_click
// RPC it rides alongside.

import webpush from 'web-push';

function sbHeaders() {
  return {
    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { school_id, school_name } = req.body || {};
  if (!school_id) {
    return res.status(400).json({ error: 'school_id required' });
  }

  // Log the event first, independent of whether push succeeds -- the
  // event record has standalone value (future inquiry inbox) even if
  // this school has zero subscriptions yet.
  try {
    await fetch(`${process.env.SUPABASE_URL}/rest/v1/whatsapp_click_events`, {
      method: 'POST',
      headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({ school_id }),
    });
  } catch (e) {
    console.error('whatsapp_click_events insert failed:', e.message);
    // Continue to the push step regardless -- logging failure shouldn't
    // block notifying a school that already has subscriptions.
  }

  try {
    const subsRes = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/push_subscriptions?school_id=eq.${school_id}&select=id,endpoint,p256dh,auth`,
      { headers: sbHeaders() }
    );
    const subs = await subsRes.json();
    if (!Array.isArray(subs) || subs.length === 0) {
      return res.status(200).json({ sent: 0 });
    }

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@carischools.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const payload = JSON.stringify({
      title: '📲 Klik WhatsApp Baharu',
      body: `Seseorang baru sahaja klik WhatsApp untuk ${school_name || 'sekolah anda'}.`,
      url: '/kemaskini.html',
    });

    const results = await Promise.allSettled(subs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      ).catch(async (err) => {
        // 410 Gone / 404 Not Found -- the subscription is dead (browser
        // data cleared, permission revoked, etc). Clean it up so future
        // sends don't keep retrying a subscription that will never work
        // again. Any other error is left alone -- could be transient.
        if (err.statusCode === 410 || err.statusCode === 404) {
          await fetch(`${process.env.SUPABASE_URL}/rest/v1/push_subscriptions?id=eq.${sub.id}`, {
            method: 'DELETE',
            headers: sbHeaders(),
          }).catch(() => {});
        }
        throw err;
      })
    ));

    const sent = results.filter(r => r.status === 'fulfilled').length;
    return res.status(200).json({ sent, total: subs.length });
  } catch (e) {
    console.error('notify-whatsapp-click error:', e.message);
    // Still 200 -- this is a fire-and-forget background call from the
    // client's perspective, a failure here must never surface as an
    // error state on the WhatsApp button the parent just clicked.
    return res.status(200).json({ sent: 0, error: e.message });
  }
}
