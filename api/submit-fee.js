// /api/submit-fee.js
//
// Handles parent fee submissions for fee_submissions. Deliberately NOT a
// direct browser->Supabase insert (see migration comment: no anon INSERT
// policy exists on purpose) -- this function is the only path in, so the
// 24h same-IP-per-school throttle and the IP-hash computation can't be
// bypassed by calling PostgREST directly from devtools.
//
// PDPA note (not legal advice -- Fadly should get a real opinion if this
// matters to him beyond engineering practice): no phone number, no email,
// no account is collected here on purpose. The IP hash is pseudonymized,
// not anonymous -- see the migration file header. It exists only to
// throttle repeat submissions and is purged after 90 days by
// purge_old_ip_hashes() in the same migration.

const SB_URL = process.env.SUPABASE_URL
  || 'https://pwbuhlwxnnxvtbqehyvy.supabase.co';

// Service-role key REQUIRED here -- this must be set in Vercel's
// environment variables, not hardcoded as the anon-key fallback pattern
// used elsewhere in this codebase. A service-role key hardcoded in a
// public repo defeats the entire point of not having an anon INSERT
// policy. If SUPABASE_SERVICE_ROLE_KEY is missing, the function fails
// closed (500) rather than silently falling back to a public key.
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Secret pepper mixed into the IP hash so the hash can't be reversed via
// a rainbow table over the ~4.3 billion IPv4 space (which is trivially
// brute-forceable with an unsalted/unpeppered hash). Set in Vercel env.
const IP_PEPPER = process.env.FEE_SUBMISSION_IP_PEPPER;

const THROTTLE_HOURS = 24;
const MIN_FEE = 1;
const MAX_FEE = 19999;

async function sha256Hex(input) {
  const enc = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function getClientIp(req) {
  // Vercel sets x-forwarded-for; first entry is the original client.
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

async function sb(path, options = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SB_SERVICE_KEY,
      Authorization: `Bearer ${SB_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  return res;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!SB_SERVICE_KEY || !IP_PEPPER) {
    console.error('[submit-fee] missing SUPABASE_SERVICE_ROLE_KEY or FEE_SUBMISSION_IP_PEPPER');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  try {
    const { school_id, fee_amount } = req.body || {};

    if (!school_id || typeof school_id !== 'string') {
      return res.status(400).json({ error: 'school_id required' });
    }
    const fee = Number(fee_amount);
    if (!Number.isFinite(fee) || fee < MIN_FEE || fee > MAX_FEE) {
      return res.status(400).json({ error: 'fee_amount out of range' });
    }

    // Confirm the school exists and is active -- avoids junk rows against
    // a typo'd or deleted school_id.
    const schoolCheck = await sb(`schools?id=eq.${encodeURIComponent(school_id)}&is_active=eq.true&select=id`);
    const schoolRows = await schoolCheck.json();
    if (!Array.isArray(schoolRows) || schoolRows.length === 0) {
      return res.status(404).json({ error: 'School not found' });
    }

    const ip = getClientIp(req);
    const ipHash = await sha256Hex(`${ip}:${IP_PEPPER}`);

    // 24h same-IP-per-school throttle. This is a silent no-op, not an
    // error -- from the parent's point of view the submission "succeeds"
    // either way, so there's no UI tell that reveals the throttle exists
    // (that itself would be information useful to someone probing it).
    const since = new Date(Date.now() - THROTTLE_HOURS * 3600 * 1000).toISOString();
    const dupeCheck = await sb(
      `fee_submissions?school_id=eq.${encodeURIComponent(school_id)}`
      + `&reporter_ip_hash=eq.${ipHash}`
      + `&submitted_at=gte.${since}`
      + `&select=id&limit=1`
    );
    const dupeRows = await dupeCheck.json();
    if (Array.isArray(dupeRows) && dupeRows.length > 0) {
      return res.status(200).json({ ok: true, note: 'already-recorded' });
    }

    const insertRes = await sb('fee_submissions', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        school_id,
        fee_amount: fee,
        reporter_ip_hash: ipHash,
      }),
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      console.error('[submit-fee] insert failed', insertRes.status, errText);
      return res.status(502).json({ error: 'Could not save submission' });
    }

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('[submit-fee]', err);
    return res.status(500).json({ error: 'Unexpected error' });
  }
}
