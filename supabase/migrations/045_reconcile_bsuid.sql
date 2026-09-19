-- ============================================================
-- 045_reconcile_bsuid
--
-- Fold this fork's interim BSUID schema into upstream's (#519).
--
-- Before syncing with upstream, this fork solved the WhatsApp
-- username rollout with its own migration (041_contact_bsuid):
--   • contacts.bsuid TEXT + unique index idx_contacts_account_bsuid
--   • contacts.phone made nullable
-- Upstream then landed the same feature as
-- 040_contact_business_scoped_user_id:
--   • contacts.wa_user_id / wa_parent_user_id / wa_username
--   • phone deliberately stays NOT NULL ('' for BSUID-only contacts)
-- The merged code reads/writes ONLY the upstream columns, so a
-- database that ran the old 041 must have its data carried over and
-- the interim schema removed.
--
-- Idempotent, and a no-op on databases that never ran the old 041
-- (every step is guarded on the interim column existing).
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'bsuid'
  ) THEN
    -- 1) Carry the identities over. wa_user_id wins if both are set
    --    (it can only have come from a real Meta webhook).
    UPDATE contacts
    SET wa_user_id = bsuid
    WHERE bsuid IS NOT NULL AND bsuid <> '' AND wa_user_id IS NULL;

    -- 2) Restore upstream's phone contract: '' sentinel, NOT NULL.
    --    Migration 022's unique index is partial (phone_normalized <> ''),
    --    so multiple ''-phone rows don't collide.
    UPDATE contacts SET phone = '' WHERE phone IS NULL;
    ALTER TABLE contacts ALTER COLUMN phone SET NOT NULL;

    -- 3) Drop the interim schema.
    DROP INDEX IF EXISTS idx_contacts_account_bsuid;
    ALTER TABLE contacts DROP COLUMN bsuid;
  END IF;
END;
$$;
