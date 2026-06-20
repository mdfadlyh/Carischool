export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { to, type, schoolName, claimCode } = req.body || {};

  if (!to || !type || !schoolName || !claimCode) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

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
          <div style="font-size:12px;color:#78716C;margin-top:4px;">Simpan kod ini — anda akan memerlukannya untuk kemaskini masa hadapan, termasuk menyiarkan jawatan kosong.</div>
        </div>
        <p><a href="https://www.carischools.com" style="color:#0D9488;font-weight:700;">Lihat profil anda di CariSchool →</a></p>
        <p style="font-size:13px;color:#78716C;">— Pasukan CariSchool</p>
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
