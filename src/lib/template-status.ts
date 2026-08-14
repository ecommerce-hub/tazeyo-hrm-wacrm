/**
 * Shared display config for message_templates.status.
 *
 * The DB stores Meta's raw enum (DRAFT / APPROVED / PENDING / REJECTED /
 * PAUSED / DISABLED / IN_APPEAL / PENDING_DELETION) — the UI maps it to
 * a human label + dark-theme badge classes here so the template manager,
 * inbox picker, and broadcast picker stay aligned.
 *
 * The label itself lives in the message catalogue under
 * `Settings.templates.status.<STATUS>`; this map only carries the key so
 * the badge reads in the app locale. If you reword one of those messages,
 * also check `Settings.templates.editTitle` and
 * `Settings.templates.dialogEditDesc` — they quote the PENDING label.
 */

import type { MessageTemplateStatus } from '@/types';

export interface TemplateStatusDisplay {
  /** Message key under the `Settings.templates` namespace. */
  labelKey: string;
  classes: string;
}

export const templateStatusConfig: Record<
  MessageTemplateStatus,
  TemplateStatusDisplay
> = {
  DRAFT: {
    labelKey: 'status.DRAFT',
    classes: 'bg-slate-600/20 text-muted-foreground border-slate-600/30',
  },
  PENDING: {
    labelKey: 'status.PENDING',
    classes: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30',
  },
  APPROVED: {
    labelKey: 'status.APPROVED',
    classes: 'bg-primary/20 text-primary border-primary/30',
  },
  REJECTED: {
    labelKey: 'status.REJECTED',
    classes: 'bg-red-600/20 text-red-400 border-red-600/30',
  },
  PAUSED: {
    labelKey: 'status.PAUSED',
    classes: 'bg-orange-600/20 text-orange-400 border-orange-600/30',
  },
  DISABLED: {
    labelKey: 'status.DISABLED',
    classes: 'bg-red-900/30 text-red-500 border-red-900/40',
  },
  IN_APPEAL: {
    labelKey: 'status.IN_APPEAL',
    classes: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
  },
  PENDING_DELETION: {
    labelKey: 'status.PENDING_DELETION',
    classes: 'bg-slate-700/30 text-muted-foreground border-slate-700/40',
  },
};

/**
 * Localised badge label for a template status.
 *
 * @param t Translator scoped to `Settings.templates`.
 */
export function templateStatusLabel(
  status: MessageTemplateStatus,
  t: (key: string) => string,
): string {
  const cfg = templateStatusConfig[status];
  return cfg ? t(cfg.labelKey) : status;
}
