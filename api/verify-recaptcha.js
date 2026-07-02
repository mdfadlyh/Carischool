// ─────────────────────────────────────────────────────────────
// CariSchool — reCAPTCHA v3 Verification
// Vercel Serverless Function: /api/verify-recaptcha
//
// Called client-side (from claim.html, post-job.html,
// daftar-sekolah-baharu.html) BEFORE the actual form submission is
// allowed to proceed. Verifies the token with Google using the
// server-only Secret Key (never exposed to the browser), and checks
// the returned bot-likelihood score.
//
// SETUP: Set RECAPTCHA_SECRET_KEY in Vercel → Settings → Environment
// Variables (the Secret Key from admin.recaptcha.net for
// carischools.com, NOT the Site Key used in the HTML).
//
// USAGE (from any form's client-side JS):
//   const token = await grecaptcha.execute(SITE_KEY, {action: 'claim_submit'});
//   const res = await fetch('/api/verify-recaptcha', {
//     method: 'POST',
//     headers: {'Content-Type':'application/json'},
//     body: JSON.stringify({ token, action: 'claim_submit' })
//   });
//   const { success, score } = await res.json();
//   if (!success) { /* block submission, show error */ }
// ─────────────────────────────────────────────────────────────

// Minimum acceptable score. reCAPTCHA v3 returns 0.0 (very likely a
// bot) to 1.0 (very likely a human). 0.5 is Google's own recommended
// default starting threshold -- lower it if legitimate users start
// getting blocked, raise it if spam gets through.
const MIN_SCORE = 0.5;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { token, action } = req.body || {};

  if (!token) {
    return res.status(400).json({ success: false, error: 'Missing reCAPTCHA token' });
  }

  const secretKey = process.env.RECAPTCHA_SECRET_KEY;
  if (!secretKey) {
    console.error('RECAPTCHA_SECRET_KEY not set in environment variables');
    // Fail OPEN on server misconfiguration -- don't let a missing env
    // var accidentally lock out every legitimate submission. This is a
    // deliberate tradeoff: availability over strict enforcement when
    // the setup itself is broken. Logged loudly so it gets noticed.
    return res.status(200).json({ success: true, score: null, warning: 'reCAPTCHA not configured server-side' });
  }

  try {
    const verifyRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: secretKey, response: token }),
    });
    const data = await verifyRes.json();

    if (!data.success) {
      console.warn('reCAPTCHA verification failed:', data['error-codes']);
      return res.status(200).json({ success: false, score: 0, errors: data['error-codes'] || [] });
    }

    // Optional but recommended: confirm the action name matches what
    // the form claims to be (prevents a token generated for one action
    // being replayed against a different, more sensitive endpoint).
    if (action && data.action && data.action !== action) {
      console.warn(`reCAPTCHA action mismatch: expected "${action}", got "${data.action}"`);
      return res.status(200).json({ success: false, score: data.score, error: 'Action mismatch' });
    }

    const passed = data.score >= MIN_SCORE;
    return res.status(200).json({ success: passed, score: data.score });

  } catch (err) {
    console.error('reCAPTCHA verify error:', err);
    // Same fail-open reasoning as above -- a Google-side outage
    // shouldn't take down your claim/job-post/registration forms.
    return res.status(200).json({ success: true, score: null, warning: 'Verification service unreachable' });
  }
}
