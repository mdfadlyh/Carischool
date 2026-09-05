// Fixed 2026-09-04 -- this endpoint had zero authentication: anyone could
// call it directly with an arbitrary `to`/`schoolName`/`claimCode`/`type`
// and it would send a genuine, officially-branded email via this project's
// own Resend account and verified domain. That's a real phishing vector
// against third parties (a crafted "your claim is approved" email with a
// fake claim code, sent to any address, looking completely legitimate)
// and a real risk to email deliverability/reputation if abused at volume.
// Fix: verify server-side, against the database, that the claimCode
// genuinely belongs to schoolId (and that `to` matches the on-file email)
// BEFORE sending anything -- and pull the real school name from the
// database rather than trust the caller's schoolName at all, so nothing
// caller-controlled makes it into the email except which of the two valid
// templates to use.
const SB_URL = process.env.SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function sb(path) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SB_SERVICE_KEY,
      Authorization: `Bearer ${SB_SERVICE_KEY}`,
    },
  });
  return res.ok ? res.json() : [];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { to, type, claimCode, schoolId } = req.body || {};

  if (!to || !type || !claimCode || !schoolId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!SB_URL || !SB_SERVICE_KEY) {
    console.error('[send-claim-email] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  // Verify this is a real, matching claim -- and get the school's real
  // name and on-file email directly from the database, never from the
  // request body.
  let schoolName, onFileEmail;
  if (type === 'pending') {
    const rows = await sb(
      `claim_submissions?school_id=eq.${encodeURIComponent(schoolId)}`
      + `&claim_code=eq.${encodeURIComponent(claimCode)}`
      + `&select=email,schools(name)`
      + `&limit=1`
    );
    const row = rows[0];
    if (!row) return res.status(403).json({ error: 'No matching claim submission' });
    schoolName = row.schools?.name;
    onFileEmail = row.email;
  } else if (type === 'approved') {
    const rows = await sb(
      `schools?id=eq.${encodeURIComponent(schoolId)}`
      + `&claim_code=eq.${encodeURIComponent(claimCode)}`
      + `&is_claimed=eq.true`
      + `&select=name,email`
      + `&limit=1`
    );
    const row = rows[0];
    if (!row) return res.status(403).json({ error: 'No matching approved claim' });
    schoolName = row.name;
    onFileEmail = row.email;
  } else {
    return res.status(400).json({ error: 'Invalid type' });
  }

  if (!schoolName || !onFileEmail || onFileEmail.toLowerCase() !== String(to).toLowerCase()) {
    return res.status(403).json({ error: 'Recipient does not match the claim on file' });
  }

  // Deep-link query param so schools land directly on their own profile
  // instead of having to re-search for their school name. Falls back
  // gracefully to a bare link if schoolId wasn't passed for any reason.
  const idParam = schoolId ? `?id=${encodeURIComponent(schoolId)}` : '';

  let subject, html;

  if (type === 'pending') {
    subject = 'Permohonan Tuntutan Anda Sedang Disemak — CariSchool';
    html = `
      <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; color: #1C1917;">
        <h2 style="color: #0D9488;">Permohonan Berjaya Dihantar! 🎉</h2>
        <p>Terima kasih kerana menuntut profil <strong>${schoolName}</strong> di CariSchool.</p>
        <p>Pasukan kami akan menyemak dan mengaktifkan profil anda dalam masa 1-2 hari bekerja.</p>
        <div style="background:#F5F5F4;padding:14px 16px;border-radius:10px;margin:16px 0;">
          <div style="font-size:12px;color:#78716C;font-weight:700;">KOD TUNTUTAN ANDA</div>
          <div style="font-size:20px;font-weight:900;color:#0F766E;letter-spacing:2px;">${claimCode}</div>
          <div style="font-size:12px;color:#78716C;margin-top:4px;">Simpan kod ini untuk rujukan masa hadapan.</div>
        </div>
        <p style="font-size:13px;color:#78716C;">— Pasukan CariSchool</p>
      </div>
    `;
  } else if (type === 'approved') {
    subject = 'Tuntutan Anda Diluluskan! — CariSchool';
    html = `
      <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; color: #1C1917;">
        <h2 style="color: #16A34A;">Tuntutan Anda Diluluskan! 🎉</h2>
        <p>Profil <strong>${schoolName}</strong> kini aktif di CariSchool dan ibu bapa boleh mula menghubungi sekolah anda terus.</p>
        <div style="background:#F5F5F4;padding:14px 16px;border-radius:10px;margin:16px 0;">
          <div style="font-size:12px;color:#78716C;font-weight:700;">KOD TUNTUTAN ANDA</div>
          <div style="font-size:20px;font-weight:900;color:#0F766E;letter-spacing:2px;">${claimCode}</div>
          <div style="font-size:12px;color:#78716C;margin-top:4px;">Simpan kod ini untuk rujukan masa hadapan.</div>
        </div>
        <a href="https://www.carischools.com/kemaskini.html${idParam}" style="display:inline-block;background:#0D9488;color:#fff;font-weight:800;padding:12px 22px;border-radius:10px;text-decoration:none;margin:8px 4px 0 0;">✏️ Kemaskini Profil Sekolah Anda →</a>
        <a href="https://www.carischools.com/post-job.html${idParam}" style="display:inline-block;background:#F59E0B;color:#fff;font-weight:800;padding:12px 22px;border-radius:10px;text-decoration:none;margin:8px 0 0;">💼 Siar Jawatan Kosong →</a>
        <p style="font-size:13px;margin-top:14px;">Guna kod tuntutan di atas untuk log masuk ke mana-mana halaman di atas.</p>
        <p style="font-size:13px;"><a href="https://www.carischools.com" style="color:#78716C;">Lihat senarai sekolah di CariSchool →</a></p>
        <p style="font-size:13px;color:#78716C;margin-top:14px;">— Pasukan CariSchool</p>
      </div>
    `;
  } else {
    return res.status(400).json({ error: 'Invalid type' });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'CariSchool <noreply@carischools.com>',
        to: [to],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Resend API error:', errorData);
      return res.status(502).json({ error: 'Failed to send email via Resend' });
    }

    const data = await response.json();
    return res.status(200).json({ success: true, id: data.id });
  } catch (err) {
    console.error('Email send error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
