export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, schoolId, claimCode, jobId, payload } = req.body || {};

  if (!action || !schoolId || !claimCode) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = {
    'Authorization': `Bearer ${SB_KEY}`,
    'apikey': SB_KEY,
    'Content-Type': 'application/json',
  };

  try {
    // ── Step 1: verify the school is claimed AND the claim code matches ──
    const verifyRes = await fetch(
      `${SB_URL}/rest/v1/schools?id=eq.${encodeURIComponent(schoolId)}&select=id,name,is_claimed,claim_code`,
      { headers }
    );
    if (!verifyRes.ok) throw new Error('Failed to verify school');
    const schools = await verifyRes.json();
    const school = schools[0];

    if (!school || !school.is_claimed || (school.claim_code || '').toUpperCase() !== claimCode.toUpperCase()) {
      return res.status(403).json({ error: 'Kod tuntutan tidak sah atau sekolah belum dituntut.' });
    }

    // ── Step 2: perform the requested action, scoped to this school only ──
    if (action === 'create') {
      const insertRes = await fetch(`${SB_URL}/rest/v1/job_postings`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          school_id: schoolId,
          position: payload?.position,
          num_openings: payload?.num_openings || 1,
          position_type: payload?.position_type,
          requirements: payload?.requirements || null,
          salary_min: payload?.salary_min || null,
          salary_max: payload?.salary_max || null,
          status: 'pending',
        }),
      });
      if (!insertRes.ok) throw new Error('Failed to create job posting');
      return res.status(200).json({ success: true });

    } else if (action === 'list') {
      const listRes = await fetch(
        `${SB_URL}/rest/v1/job_postings?school_id=eq.${encodeURIComponent(schoolId)}&order=created_at.desc`,
        { headers }
      );
      if (!listRes.ok) throw new Error('Failed to list job postings');
      const jobs = await listRes.json();
      return res.status(200).json({ jobs });

    } else if (action === 'markFilled') {
      if (!jobId) return res.status(400).json({ error: 'Missing jobId' });
      const updateRes = await fetch(
        `${SB_URL}/rest/v1/job_postings?id=eq.${encodeURIComponent(jobId)}&school_id=eq.${encodeURIComponent(schoolId)}`,
        { method: 'PATCH', headers, body: JSON.stringify({ status: 'filled' }) }
      );
      if (!updateRes.ok) throw new Error('Failed to update job posting');
      return res.status(200).json({ success: true });

    } else if (action === 'delete') {
      if (!jobId) return res.status(400).json({ error: 'Missing jobId' });
      const deleteRes = await fetch(
        `${SB_URL}/rest/v1/job_postings?id=eq.${encodeURIComponent(jobId)}&school_id=eq.${encodeURIComponent(schoolId)}`,
        { method: 'DELETE', headers }
      );
      if (!deleteRes.ok) throw new Error('Failed to delete job posting');
      return res.status(200).json({ success: true });

    } else {
      return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (err) {
    console.error('manage-job-posting error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
