import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { hrmGetOptions, isHrmConfigured, HrmError } from '@/lib/hrm/client'

// Proxies the HRM options feed (stores + open, unrestricted staff
// requests) for the create-candidate dialog. Exists so the HRM key
// stays server-side and the browser never talks to the HRM origin
// (which the CSP connect-src would reject anyway).

export async function GET() {
  try {
    await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }

  if (!isHrmConfigured()) {
    return NextResponse.json(
      { error: 'HRM integration is not configured' },
      { status: 503 },
    )
  }

  try {
    const options = await hrmGetOptions()
    return NextResponse.json({ options })
  } catch (err) {
    const status = err instanceof HrmError ? err.status : 502
    const message = err instanceof Error ? err.message : 'HRM request failed'
    return NextResponse.json({ error: message }, { status })
  }
}
