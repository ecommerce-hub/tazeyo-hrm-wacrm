-- Migration 042: Add number blocking to contacts.
--
-- A blocked contact's messages are still received and stored (nothing
-- is lost), but their conversation is parked in the archive: blocking
-- archives the thread, and the webhook's unarchive-on-inbound is
-- suppressed for blocked contacts so new messages can't surface it
-- back into the inbox. Flows / automations / AI auto-reply are also
-- skipped so the bot never responds to a blocked number.

ALTER TABLE contacts
  ADD COLUMN is_blocked BOOLEAN NOT NULL DEFAULT FALSE;

-- Blocking archives the contact's conversations atomically, DB-side.
-- The inbox UI performs the same pair of writes for instant feedback,
-- but the invariant "blocked ⇒ archived" must not depend on every
-- writer of is_blocked remembering the second write — a future block
-- action (contacts page, bulk block, public API) gets it for free.
CREATE OR REPLACE FUNCTION archive_conversations_on_block()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET is_archived = TRUE
  WHERE contact_id = NEW.id
    AND is_archived = FALSE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_archive_conversations_on_block
  AFTER UPDATE OF is_blocked ON contacts
  FOR EACH ROW
  WHEN (NEW.is_blocked AND NOT OLD.is_blocked)
  EXECUTE FUNCTION archive_conversations_on_block();
