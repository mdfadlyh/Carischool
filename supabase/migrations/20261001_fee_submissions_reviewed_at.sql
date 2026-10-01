-- Pending fee reports are live (get_school_fee_estimate reads status='pending'); Fadly only
-- rejects implausible ones. reviewed_at records "looked at an outlier, it's fine" so the HQ
-- dashboard stops flagging it, without changing status (which would remove it from the estimate).
alter table public.fee_submissions add column if not exists reviewed_at timestamptz;
comment on column public.fee_submissions.reviewed_at is 'Set when an outlier report was checked and kept live. Does not affect get_school_fee_estimate.';
