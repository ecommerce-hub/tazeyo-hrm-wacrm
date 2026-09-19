// ============================================================
// Broadcast → inbox mirror.
//
// Broadcasts historically lived only in `broadcasts` /
// `broadcast_recipients`: the template went out via Meta, but no
// `messages` row was written, so when a customer replied the agent saw
// a thread that opened with the reply and no trace of what the
// customer was replying TO. This helper mirrors each successful
// broadcast send into the contact's conversation as a normal outbound
// template message.
//
// Deliberate choices:
//   • Best-effort: the Meta send already succeeded, so a mirror
//     failure must never fail (or retry) the broadcast — log and move
//     on. The recipient row still carries the wamid either way.
//   • A conversation created BY the mirror starts 'closed', not
//     'open': a 1 000-recipient broadcast must not flood the inbox's
//     default (open) view with 1 000 untouched threads. The customer
//     replying reopens it (reopenClosedConversation in the webhook),
//     and the thread then shows template → reply in order. An
//     already-existing conversation keeps its status.
//   • `unread_count` is never touched — unread means "customer wrote
//     something an agent hasn't seen", and this is outbound.
//   • The message upsert is idempotent on (conversation_id,
//     message_id) — the same unique index the inbound webhook relies
//     on (issue #367) — so a replayed delivery pass can't double-post.
//
// The delivery/read receipts need no extra wiring: the status webhook
// already mirrors onto `messages` by `message_id`, so the mirrored row
// advances sent → delivered → read exactly like a composer send.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export interface MirrorBroadcastSendParams {
  accountId: string;
  /** Sender-of-record for a conversation the mirror has to create. */
  auditUserId: string;
  contactId: string;
  whatsappMessageId: string;
  templateName: string;
  /** Rendered template body (templateContentText). Null → no bubble
   *  text is better than a wrong one; the row still renders as a
   *  template message. */
  contentText: string | null;
}

/**
 * Find the contact's canonical conversation (oldest-first, matching
 * the webhook and dedup migration 036), creating a closed one if none
 * exists, then upsert the sent template as an outbound message and
 * refresh the conversation's last-message summary.
 *
 * Never throws.
 */
export async function mirrorBroadcastSend(
  db: SupabaseClient,
  params: MirrorBroadcastSendParams,
): Promise<void> {
  try {
    const conversationId = await findOrCreateMirrorConversation(db, params);
    if (!conversationId) return;

    const { error: msgError } = await db.from('messages').upsert(
      {
        conversation_id: conversationId,
        sender_type: 'agent',
        content_type: 'template',
        content_text: params.contentText,
        template_name: params.templateName,
        message_id: params.whatsappMessageId,
        status: 'sent',
      },
      { onConflict: 'conversation_id,message_id', ignoreDuplicates: true },
    );
    if (msgError) {
      console.error('[broadcast-mirror] message insert failed:', msgError.message);
      return;
    }

    // Same summary refresh a composer send performs. No unread bump,
    // no status change.
    const { error: convError } = await db
      .from('conversations')
      .update({
        last_message_text: params.contentText ?? `[${params.templateName}]`,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);
    if (convError) {
      console.error('[broadcast-mirror] summary update failed:', convError.message);
    }
  } catch (err) {
    console.error(
      '[broadcast-mirror] mirror failed:',
      err instanceof Error ? err.message : err,
    );
  }
}

async function findOrCreateMirrorConversation(
  db: SupabaseClient,
  params: MirrorBroadcastSendParams,
): Promise<string | null> {
  // Oldest-first: converge on the same canonical row the inbound
  // webhook picks, so the mirrored template and the customer's reply
  // land in one thread.
  const { data: existingRows, error: findError } = await db
    .from('conversations')
    .select('id')
    .eq('account_id', params.accountId)
    .eq('contact_id', params.contactId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (findError) {
    console.error('[broadcast-mirror] conversation lookup failed:', findError.message);
    return null;
  }
  if (existingRows && existingRows.length > 0) return existingRows[0].id;

  const { data: created, error: createError } = await db
    .from('conversations')
    .insert({
      account_id: params.accountId,
      user_id: params.auditUserId,
      contact_id: params.contactId,
      status: 'closed',
    })
    .select('id')
    .single();
  if (createError) {
    // Race with a concurrent inbound/mirror insert — the unique index
    // (migration 036) rejected the duplicate. Re-resolve the winner.
    const { data: raced } = await db
      .from('conversations')
      .select('id')
      .eq('account_id', params.accountId)
      .eq('contact_id', params.contactId)
      .order('created_at', { ascending: true })
      .limit(1);
    if (raced && raced.length > 0) return raced[0].id;
    console.error('[broadcast-mirror] conversation create failed:', createError.message);
    return null;
  }
  return created.id;
}
