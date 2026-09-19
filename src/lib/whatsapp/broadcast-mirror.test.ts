import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mirrorBroadcastSend } from './broadcast-mirror';

const PARAMS = {
  accountId: 'acc-1',
  auditUserId: 'user-1',
  contactId: 'contact-1',
  whatsappMessageId: 'wamid.1',
  templateName: 'promo',
  contentText: 'Hello Ada',
};

// Supabase-shaped mock capturing conversation lookups/inserts, message
// upserts and summary updates. `existing` seeds the conversation lookup;
// `insertError` simulates the create losing a unique-index race.
function makeDb(opts: {
  existing?: { id: string }[];
  insertError?: { message: string } | null;
  racedRows?: { id: string }[];
  messageError?: { message: string } | null;
}) {
  const calls = {
    conversationInserts: [] as Record<string, unknown>[],
    messageUpserts: [] as { row: Record<string, unknown>; options: unknown }[],
    summaryUpdates: [] as Record<string, unknown>[],
    lookups: 0,
  };
  const database = {
    from(table: string) {
      if (table === 'conversations') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => {
                    calls.lookups++;
                    // First lookup returns `existing`; a re-fetch after a
                    // lost insert race returns `racedRows`.
                    const rows =
                      calls.lookups === 1
                        ? (opts.existing ?? [])
                        : (opts.racedRows ?? []);
                    return Promise.resolve({ data: rows, error: null });
                  },
                }),
              }),
            }),
          }),
          insert: (row: Record<string, unknown>) => {
            calls.conversationInserts.push(row);
            return {
              select: () => ({
                single: () =>
                  Promise.resolve(
                    opts.insertError
                      ? { data: null, error: opts.insertError }
                      : { data: { id: 'conv-new' }, error: null },
                  ),
              }),
            };
          },
          update: (row: Record<string, unknown>) => ({
            eq: () => {
              calls.summaryUpdates.push(row);
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      if (table === 'messages') {
        return {
          upsert: (row: Record<string, unknown>, options: unknown) => {
            calls.messageUpserts.push({ row, options });
            return Promise.resolve({
              error: opts.messageError ?? null,
            });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { db: database as unknown as SupabaseClient, calls };
}

describe('mirrorBroadcastSend', () => {
  it('reuses an existing conversation and upserts the outbound template', async () => {
    const { db, calls } = makeDb({ existing: [{ id: 'conv-1' }] });
    await mirrorBroadcastSend(db, PARAMS);

    expect(calls.conversationInserts).toHaveLength(0);
    expect(calls.messageUpserts).toHaveLength(1);
    expect(calls.messageUpserts[0].row).toMatchObject({
      conversation_id: 'conv-1',
      sender_type: 'agent',
      content_type: 'template',
      content_text: 'Hello Ada',
      template_name: 'promo',
      message_id: 'wamid.1',
      status: 'sent',
    });
    // Idempotent on the same unique index the inbound webhook uses.
    expect(calls.messageUpserts[0].options).toMatchObject({
      onConflict: 'conversation_id,message_id',
      ignoreDuplicates: true,
    });
    expect(calls.summaryUpdates).toHaveLength(1);
    expect(calls.summaryUpdates[0]).toMatchObject({
      last_message_text: 'Hello Ada',
    });
    // Never touches unread or status on an existing conversation.
    expect(calls.summaryUpdates[0]).not.toHaveProperty('unread_count');
    expect(calls.summaryUpdates[0]).not.toHaveProperty('status');
  });

  it('creates a CLOSED conversation when the contact has none', async () => {
    const { db, calls } = makeDb({ existing: [] });
    await mirrorBroadcastSend(db, PARAMS);

    expect(calls.conversationInserts).toHaveLength(1);
    expect(calls.conversationInserts[0]).toMatchObject({
      account_id: 'acc-1',
      user_id: 'user-1',
      contact_id: 'contact-1',
      // A broadcast must not flood the inbox's open view with
      // untouched threads; the customer's reply reopens it.
      status: 'closed',
    });
    expect(calls.messageUpserts[0].row).toMatchObject({
      conversation_id: 'conv-new',
    });
  });

  it('recovers the winning row after losing the conversation-create race', async () => {
    const { db, calls } = makeDb({
      existing: [],
      insertError: { message: 'duplicate key value violates unique constraint' },
      racedRows: [{ id: 'conv-winner' }],
    });
    await mirrorBroadcastSend(db, PARAMS);

    expect(calls.messageUpserts).toHaveLength(1);
    expect(calls.messageUpserts[0].row).toMatchObject({
      conversation_id: 'conv-winner',
    });
  });

  it('never throws and skips the summary when the message insert fails', async () => {
    const { db, calls } = makeDb({
      existing: [{ id: 'conv-1' }],
      messageError: { message: 'boom' },
    });
    await expect(mirrorBroadcastSend(db, PARAMS)).resolves.toBeUndefined();
    expect(calls.summaryUpdates).toHaveLength(0);
  });
});
