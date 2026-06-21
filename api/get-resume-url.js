export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { path } = req.body || {};
  if (!path) {
    return res.status(400).json({ error: 'Missing file path' });
  }

  try {
    const response = await fetch(
      `${process.env.SUPABASE_URL}/storage/v1/object/sign/teacher-resumes/${encodeURIComponent(path)}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn: 300 }), // signed URL valid for 5 minutes
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Supabase sign error:', errorData);
      return res.status(502).json({ error: 'Failed to generate signed URL' });
    }

    const data = await response.json();
    const signedUrl = `${process.env.SUPABASE_URL}/storage/v1${data.signedURL}`;
    return res.status(200).json({ url: signedUrl });
  } catch (err) {
    console.error('Signed URL error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
