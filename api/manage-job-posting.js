export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, schoolId, claimCode, jobId, payload, adminKey } = req.body || {};

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = {
    'Authorization': `Bearer ${SB_KEY}`,
    'apikey': SB_KEY,
    'Content-Type': 'application/json',
  };

  const ADMIN_ACTIONS = ['adminList', 'approve', 'reject', 'forceExpire', 'adminDelete'];

  try {
    // ── Admin-only actions: gated by a server-side secret, never the school claim code ──
    if (ADMIN_ACTIONS.includes(action)) {
      if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
        return res.status(403).json({ error: 'Tidak dibenarkan.' });
      }

      if (action === 'adminList') {
        const jobsRes = await fetch(`${SB_URL}/rest/v1/job_postings?select=*&order=created_at.desc`, { headers });
        if (!jobsRes.ok) throw new Error('Failed to list job postings');
        const jobs = await jobsRes.json();
        if (jobs.length === 0) return res.status(200).json({ jobs: [] });

        const schoolIds = [...new Set(jobs.map(j => j.school_id))];
        const schoolsRes = await fetch(
          `${SB_URL}/rest/v1/schools?id=in.(${schoolIds.join(',')})&select=id,name,district,state`,
          { headers }
        );
        const schools = schoolsRes.ok ? await schoolsRes.json() : [];
        const schoolMap = {};
        schools.forEach(s => schoolMap[s.id] = s);
        const merged = jobs.map(j => ({ ...j, school: schoolMap[j.school_id] || {} }));
        return res.status(200).json({ jobs: merged });

      } else if (action === 'approve') {
        if (!jobId) return res.status(400).json({ error: 'Missing jobId' });
        const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
        const updateRes = await fetch(`${SB_URL}/rest/v1/job_postings?id=eq.${encodeURIComponent(jobId)}`, {
          method: 'PATCH', headers, body: JSON.stringify({ status: 'active', expires_at: expiresAt })
        });
        if (!updateRes.ok) throw new Error('Failed to approve job posting');
        return res.status(200).json({ success: true });

      } else if (action === 'reject') {
        if (!jobId) return res.status(400).json({ error: 'Missing jobId' });
        const updateRes = await fetch(`${SB_URL}/rest/v1/job_postings?id=eq.${encodeURIComponent(jobId)}`, {
          method: 'PATCH', headers, body: JSON.stringify({ status: 'rejected' })
        });
        if (!updateRes.ok) throw new Error('Failed to reject job posting');
        return res.status(200).json({ success: true });

      } else if (action === 'forceExpire') {
        if (!jobId) return res.status(400).json({ error: 'Missing jobId' });
        const updateRes = await fetch(`${SB_URL}/rest/v1/job_postings?id=eq.${encodeURIComponent(jobId)}`, {
          method: 'PATCH', headers, body: JSON.stringify({ status: 'expired' })
        });
        if (!updateRes.ok) throw new Error('Failed to expire job posting');
        return res.status(200).json({ success: true });

      } else if (action === 'adminDelete') {
        // Permanent removal -- intended for cleaning up test postings or
        // terminal-state records (rejected/filled/expired) that don't
        // need to be kept around. Not exposed for active/pending jobs
        // in the admin UI (use reject/forceExpire for those instead).
        if (!jobId) return res.status(400).json({ error: 'Missing jobId' });
        const deleteRes = await fetch(`${SB_URL}/rest/v1/job_postings?id=eq.${encodeURIComponent(jobId)}`, {
          method: 'DELETE', headers
        });
        if (!deleteRes.ok) throw new Error('Failed to delete job posting');
        return res.status(200).json({ success: true });
      }
    }

    // ── School-side actions: require schoolId + claimCode ──
    if (!action || !schoolId || !claimCode) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Step 1: verify the school is claimed AND the claim code matches
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

    // Step 2: perform the requested action, scoped to this school only
    if (action === 'create') {
      // Cap concurrent postings per school (active + pending combined) --
      // no limit existed before, meaning a school could submit unlimited
      // simultaneous postings, each needing individual admin approval.
      // A small taska/tadika realistically has 1-3 genuine open roles at
      // once; this blocks spam/accidental duplicates without limiting
      // legitimate use.
      const MAX_CONCURRENT_POSTINGS = 3;
      const countRes = await fetch(
        `${SB_URL}/rest/v1/job_postings?school_id=eq.${encodeURIComponent(schoolId)}&status=in.(active,pending)&select=id`,
        { headers }
      );
      const existingJobs = countRes.ok ? await countRes.json() : [];
      if (existingJobs.length >= MAX_CONCURRENT_POSTINGS) {
        return res.status(400).json({ error: `Anda sudah mempunyai ${MAX_CONCURRENT_POSTINGS} siaran jawatan aktif/menunggu. Tandakan siaran lama sebagai "Sudah Diisi" atau buang sebelum menambah siaran baharu.` });
      }

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
          poster_url: payload?.poster_url || null,
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
