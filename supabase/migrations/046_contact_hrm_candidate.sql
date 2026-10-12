-- Tazeyo HRM integration: remember which HRM candidate a contact was
-- transferred to, so the inbox can render the action as "already
-- transferred" (and deep-link to the candidate) instead of offering
-- a second transfer that would 409 on the HRM's unique phone index.
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS hrm_candidate_id integer,
  ADD COLUMN IF NOT EXISTS hrm_synced_at timestamptz;
