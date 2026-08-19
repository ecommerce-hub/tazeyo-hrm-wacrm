-- Migration 040: Add archive support to conversations.
--
-- Adds `is_archived` boolean so agents can hide resolved threads
-- from the inbox without losing them. Archived conversations are
-- excluded from the default list query; a dedicated filter surfaces
-- them when needed.

ALTER TABLE conversations
  ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT FALSE;

-- Index supports the common query: "give me non-archived conversations
-- for this account, ordered by last_message_at". The partial index
-- keeps the write overhead minimal — only non-archived rows occupy
-- index space, and archiving a row simply removes it.
CREATE INDEX idx_conversations_not_archived
  ON conversations (account_id, last_message_at DESC)
  WHERE is_archived = FALSE;
