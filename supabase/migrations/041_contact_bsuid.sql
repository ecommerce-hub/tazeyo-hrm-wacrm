-- ============================================================
-- 041_contact_bsuid
--
-- Add BSUID (Business-Scoped User ID) support to contacts.
--
-- WhatsApp's username rollout (2026) means incoming webhooks may
-- omit the sender's phone number entirely, providing only a BSUID
-- (a per-business-portfolio identifier). We must be able to:
--   1. store the BSUID alongside (or instead of) a phone number,
--   2. look up contacts by BSUID when the phone is absent,
--   3. create contacts that have a BSUID but no phone.
--
-- Changes:
--   • Add nullable `bsuid` TEXT column to contacts.
--   • Unique partial index on (account_id, bsuid) — same scoping
--     as the phone dedup index from migration 022.
--   • Make `phone` nullable — username-only senders have no phone.
--   • Adjust the phone_normalized unique index to exclude NULL
--     phones (the generated column produces '' for NULL, which is
--     already guarded by the existing WHERE clause).
-- ============================================================

-- 1) BSUID column
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS bsuid TEXT;

-- 2) Unique per account, partial — NULLs and empty strings are
--    excluded so multiple phone-only contacts (bsuid IS NULL)
--    don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_account_bsuid
  ON contacts (account_id, bsuid)
  WHERE bsuid IS NOT NULL AND bsuid <> '';

-- 3) Allow contacts without a phone number. The generated
--    phone_normalized column will produce '' for NULL phones;
--    the existing unique index (migration 022) already has
--    WHERE phone_normalized <> '' so those rows are excluded.
ALTER TABLE contacts
  ALTER COLUMN phone DROP NOT NULL;
