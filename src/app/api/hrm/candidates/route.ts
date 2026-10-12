import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse, type AccountContext } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { getMediaUrl, downloadMedia } from '@/lib/whatsapp/meta-api'
import { decrypt } from '@/lib/whatsapp/encryption'
import { CV_MAX_BYTES, cvFilename } from '@/lib/hrm/cv'
import {
  hrmCreateCandidate,
  hrmUploadCandidateCv,
  hrmCandidateUrl,
  isHrmConfigured,
  HrmError,
  type HrmCvFile,
} from '@/lib/hrm/client'

// Creates a Tazeyo HRM candidate from an inbox contact. The phone is
// read from the contact row (RLS-scoped), not from the request body —
// the HRM's candidates.phone carries a global unique index and is the
// one field the agent must not be able to mistype. On success (and on
// the HRM's duplicate-phone 409) the contact row is stamped with the
// candidate id so the UI can render "already transferred".
//
// The body is multipart/form-data so a CV can ride along: either
// `cv_file` (an agent upload) or `cv_message_id` (a document message in
// the conversation — typically the CV the contact sent over WhatsApp).
// The CV is forwarded to the HRM in a second call AFTER the candidate
// is created; a CV failure never undoes the candidate, it comes back as
// `cv_error` for the UI to surface.

/** Pulls the CV bytes out of a chat message. The message is read with
 *  the caller's RLS client, and must be a document/image on one of THIS
 *  contact's conversations. Handles both media_url shapes: the durable
 *  chat-media public URL, and the legacy `/api/whatsapp/media/<id>`
 *  proxy path (re-fetched from Meta with the account's token). */
async function cvFromMessage(
  ctx: Pick<AccountContext, 'supabase' | 'accountId'>,
  messageId: string,
  contactId: string,
): Promise<HrmCvFile | { error: string; status: number }> {
  const { data: message, error } = await ctx.supabase
    .from('messages')
    .select('id, content_type, content_text, media_url, media_type, conversations!inner(contact_id)')
    .eq('id', messageId)
    .maybeSingle()
  if (error) return { error: error.message, status: 500 }
  if (!message) return { error: 'CV message not found', status: 404 }

  const conv = message.conversations as unknown as { contact_id: string }
  if (conv?.contact_id !== contactId) {
    return { error: 'CV message belongs to another contact', status: 400 }
  }
  if (!['document', 'image'].includes(message.content_type) || !message.media_url) {
    return { error: 'CV message has no attachment', status: 400 }
  }

  const name = cvFilename(message.content_text, message.media_type)
  if (!name) return { error: 'cv_type_not_allowed', status: 400 }

  let bytes: ArrayBuffer | Uint8Array
  let contentType = message.media_type || 'application/octet-stream'

  const proxyMatch = message.media_url.match(/^\/api\/whatsapp\/media\/([^/?]+)/)
  if (proxyMatch) {
    // Pre-mirroring message: the bytes only exist at Meta. Same dance as
    // the media proxy route — account token → short-lived CDN URL → fetch.
    const { data: config } = await ctx.supabase
      .from('whatsapp_config')
      .select('access_token')
      .eq('account_id', ctx.accountId)
      .maybeSingle()
    if (!config) return { error: 'WhatsApp not configured', status: 400 }
    try {
      const accessToken = decrypt(config.access_token)
      const mediaInfo = await getMediaUrl({ mediaId: proxyMatch[1], accessToken })
      const downloaded = await downloadMedia({ downloadUrl: mediaInfo.url, accessToken })
      bytes = new Uint8Array(downloaded.buffer)
      contentType = downloaded.contentType || contentType
    } catch {
      // Meta holds media ~30 days; an expired attachment is the common case.
      return { error: 'cv_media_expired', status: 410 }
    }
  } else {
    let res: Response
    try {
      res = await fetch(message.media_url, { signal: AbortSignal.timeout(15_000) })
    } catch {
      return { error: 'cv_fetch_failed', status: 502 }
    }
    if (!res.ok) return { error: 'cv_fetch_failed', status: 502 }
    bytes = await res.arrayBuffer()
  }

  if (bytes.byteLength === 0) return { error: 'cv_fetch_failed', status: 502 }
  if (bytes.byteLength > CV_MAX_BYTES) return { error: 'cv_too_large', status: 400 }
  return { bytes, name, type: contentType }
}

export async function POST(request: Request) {
  let ctx
  try {
    ctx = await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }

  if (!isHrmConfigured()) {
    return NextResponse.json(
      { error: 'HRM integration is not configured' },
      { status: 503 },
    )
  }

  const limit = checkRateLimit(`hrm-candidate:${ctx.userId}`, RATE_LIMITS.adminAction)
  if (!limit.success) return rateLimitResponse(limit)

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const str = (key: string) => {
    const v = form.get(key)
    return typeof v === 'string' ? v.trim() : ''
  }
  const int = (key: string) => {
    const v = str(key)
    return /^\d+$/.test(v) ? Number(v) : undefined
  }

  const contactId = str('contact_id')
  const firstName = str('first_name')
  const lastName = str('last_name')
  const hrNotes = str('hr_notes')
  const storeId = int('store_id')
  const staffRequestId = int('staff_request_id')
  const cvMessageId = str('cv_message_id')
  const cvUpload = form.get('cv_file')

  if (!contactId || !firstName || !lastName) {
    return NextResponse.json(
      { error: 'contact_id, first_name and last_name are required' },
      { status: 400 },
    )
  }

  // RLS scopes the read to the caller's account, so a foreign contact id
  // comes back as "not found" rather than leaking across accounts.
  const { data: contact, error: contactErr } = await ctx.supabase
    .from('contacts')
    .select('id, phone, hrm_candidate_id')
    .eq('id', contactId)
    .maybeSingle()
  if (contactErr) {
    return NextResponse.json({ error: contactErr.message }, { status: 500 })
  }
  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }
  if (!contact.phone) {
    return NextResponse.json(
      { error: 'Contact has no phone number' },
      { status: 400 },
    )
  }

  // Resolve the CV (if any) BEFORE creating the candidate, so a bad
  // attachment aborts the whole action instead of leaving a candidate
  // without the CV the agent asked for.
  let cv: HrmCvFile | null = null
  if (cvUpload instanceof File && cvUpload.size > 0) {
    if (cvUpload.size > CV_MAX_BYTES) {
      return NextResponse.json({ error: 'cv_too_large' }, { status: 400 })
    }
    const name = cvFilename(cvUpload.name, cvUpload.type)
    if (!name) return NextResponse.json({ error: 'cv_type_not_allowed' }, { status: 400 })
    cv = {
      bytes: await cvUpload.arrayBuffer(),
      name,
      type: cvUpload.type || 'application/octet-stream',
    }
  } else if (cvMessageId) {
    const resolved = await cvFromMessage(ctx, cvMessageId, contactId)
    if ('error' in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }
    cv = resolved
  }

  const stampContact = async (candidateId: number) => {
    const { error } = await supabaseAdmin()
      .from('contacts')
      .update({
        hrm_candidate_id: candidateId,
        hrm_synced_at: new Date().toISOString(),
      })
      .eq('id', contactId)
      .eq('account_id', ctx.accountId)
    if (error) {
      // The candidate exists on the HRM side either way — log and move
      // on rather than failing the request over a bookkeeping column.
      console.error('[hrm/candidates] failed to stamp contact:', error.message)
    }
  }

  try {
    const candidate = await hrmCreateCandidate({
      first_name: firstName,
      last_name: lastName,
      phone: contact.phone,
      store_id: storeId,
      staff_request_id: staffRequestId,
      hr_notes: hrNotes || undefined,
    })
    await stampContact(candidate.id)

    // The candidate exists from here on — a CV failure is reported, not
    // rolled back (HR can attach the file by hand in the HRM).
    let cvError: string | null = null
    if (cv) {
      try {
        await hrmUploadCandidateCv(candidate.id, cv)
      } catch (err) {
        cvError = err instanceof Error ? err.message : 'CV upload failed'
        console.error('[hrm/candidates] CV upload failed:', err)
      }
    }

    return NextResponse.json(
      {
        candidate: {
          id: candidate.id,
          status: candidate.status,
          hrm_url: hrmCandidateUrl(candidate.id),
        },
        cv_error: cvError,
      },
      { status: 201 },
    )
  } catch (err) {
    if (err instanceof HrmError) {
      if (err.isDuplicate && err.candidateId) {
        // The number is already an HRM candidate — link the contact to it
        // and pass the HRM's human-readable message through. The CV is
        // deliberately NOT uploaded onto someone else's candidate record.
        await stampContact(err.candidateId)
        return NextResponse.json(
          {
            error: err.message,
            candidate: {
              id: err.candidateId,
              hrm_url: hrmCandidateUrl(err.candidateId),
            },
          },
          { status: 409 },
        )
      }
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[hrm/candidates] unexpected error:', err)
    return NextResponse.json({ error: 'HRM request failed' }, { status: 502 })
  }
}
