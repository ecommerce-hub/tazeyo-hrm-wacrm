import type { AutomationTriggerType } from '@/types'

/**
 * Translator shape accepted by the helpers below. Plain modules cannot
 * call `useTranslations`, so client callers pass their scoped `t` in
 * (same pattern as `summarizeNode` in src/components/flows/shared.tsx).
 */
type Translate = (key: string, values?: Record<string, string | number>) => string

export interface TriggerMeta {
  /** English fallback, used when no translator is supplied. */
  label: string
  /** Tailwind classes for the Badge pill on the list row. */
  pillClass: string
}

export const TRIGGER_META: Record<AutomationTriggerType, TriggerMeta> = {
  new_message_received: {
    label: 'New Message',
    pillClass: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  },
  first_inbound_message: {
    label: 'First Message from Contact',
    pillClass: 'border-teal-500/30 bg-teal-500/10 text-teal-300',
  },
  keyword_match: {
    label: 'Keyword Match',
    pillClass: 'border-purple-500/30 bg-purple-500/10 text-purple-300',
  },
  new_contact_created: {
    label: 'New Contact',
    pillClass: 'border-primary/30 bg-primary/10 text-primary',
  },
  conversation_assigned: {
    label: 'Conversation Assigned',
    pillClass: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
  },
  tag_added: {
    label: 'Tag Added',
    pillClass: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  },
  time_based: {
    label: 'Time-Based',
    pillClass: 'border-slate-500/30 bg-slate-500/10 text-muted-foreground',
  },
  interactive_reply: {
    label: 'Button / List Reply',
    pillClass: 'border-pink-500/30 bg-pink-500/10 text-pink-300',
  },
}

/**
 * Pill label + classes for an automation trigger.
 *
 * @param t Optional translator scoped to `Automations.triggers` — the
 *          trigger type is the message key. Omit it on server paths to
 *          get the English fallback.
 */
export function triggerMeta(
  t: AutomationTriggerType | string,
  translate?: Translate,
): TriggerMeta {
  const known = TRIGGER_META[t as AutomationTriggerType]
  if (!known) {
    return {
      label: t,
      pillClass: 'border-slate-500/30 bg-slate-500/10 text-muted-foreground',
    }
  }
  return translate ? { ...known, label: translate(t) } : known
}

/**
 * Human "time since" label.
 *
 * @param t      Optional translator scoped to `Automations.relativeTime`.
 * @param locale Optional BCP-47 tag for the >30-day absolute-date fallback
 *               (see `useIntlLocale()` in src/lib/i18n/date.ts). Defaults to
 *               the runtime locale, which is what the un-localised call
 *               sites already did.
 */
export function formatRelative(
  iso: string | null | undefined,
  t?: Translate,
  locale?: string,
): string {
  const never = t ? t('never') : 'never'
  if (!iso) return never
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return never
  const diffSec = Math.round((Date.now() - then) / 1000)
  if (diffSec < 60) return t ? t('justNow') : 'just now'
  if (diffSec < 3600) {
    const count = Math.floor(diffSec / 60)
    return t ? t('minutesAgo', { count }) : `${count}m ago`
  }
  if (diffSec < 86400) {
    const count = Math.floor(diffSec / 3600)
    return t ? t('hoursAgo', { count }) : `${count}h ago`
  }
  if (diffSec < 2_592_000) {
    const count = Math.floor(diffSec / 86400)
    return t ? t('daysAgo', { count }) : `${count}d ago`
  }
  return new Date(iso).toLocaleDateString(locale)
}
