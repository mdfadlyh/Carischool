// Added 2026-09-04 -- replaces admin.html's client-side-only password
// check (const ADMIN_PASSWORD = 'hayden111', compared directly in the
// browser -- readable by anyone via View Source, and disconnected from
// actual database access regardless of whether it passed). This is the
// real gate: the password is checked here, server-side, against the same
// ADMIN_API_KEY env var manage-job-posting.js already uses for its own
// admin actions -- never sent to the browser. On success, mints a real
// session token via the service-role connection (create_admin_session()
// is deliberately not callable by the public anon key, so this endpoint
// is the only path that can create one). admin.html then sends that
// token, not the password, with every subsequent admin action, and each
// one verifies it server-side via is_valid_admin_session() before doing
// anything.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body || {};
  if (!password || password !== process.env.ADMIN_API_KEY) {
    // Deliberately generic message and a small delay-free flat response --
    // no hint about which part was wrong, same principle as any login form.
    return res.status(401).json({ error: 'Incorrect password' });
  }

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const rpcRes = await fetch(`${SB_URL}/rest/v1/rpc/create_admin_session`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SB_KEY}`,
        'apikey': SB_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    if (!rpcRes.ok) {
      const errText = await rpcRes.text();
      console.error('create_admin_session failed:', errText);
      return res.status(500).json({ error: 'Could not create session' });
    }
    const token = await rpcRes.json();
    return res.status(200).json({ token });
  } catch (e) {
    console.error('admin-login error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
