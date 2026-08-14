"use client";

// ============================================================
// GatedButton — Button + role-gated "Read-only" tooltip helper.
//
// The wider problem this solves:
//
//   A bare `<Button disabled title="Read-only — ...">` doesn't
//   render a tooltip in Safari or older Firefox because those
//   browsers don't fire mouse events on disabled form controls.
//   Title attributes only render when the element receives a
//   mouseover. The 9-PR multi-user series relied on this pattern
//   for every "read-only for viewer" CTA across the app, which
//   meant viewers on those browsers saw a silently-disabled
//   button with no explanation.
//
//   Wrapping the disabled button in a `<span title=...>` makes
//   the tooltip target a non-disabled ancestor that does receive
//   mouseover, so the tooltip renders everywhere. The span also
//   serves as a single mounting point for `aria-label` /
//   `aria-disabled` if a screen reader needs richer signalling
//   later.
//
// The minor problem it also solves:
//
//   Five list pages had near-identical
//   `READ_ONLY_TITLE = "Read-only — your role can't ..."`
//   constants. GatedButton takes a single `gateReason` prop
//   and centralises the tooltip wording (with per-action
//   defaults).
//
// Use it like:
//
//   <GatedButton
//     canAct={canCreate}
//     gateReason="createBroadcasts"
//     onClick={() => router.push("/broadcasts/new")}
//   >
//     <Plus className="h-4 w-4" /> New Broadcast
//   </GatedButton>
//
// `canAct` defaults to true so unrelated usages still work.
// When `canAct` is false, the button is `disabled` and the
// wrapping span gets the localised tooltip for `gateReason`.
//
// `gateReason` is an *action id*, not a phrase: the catalogue
// (`Common.gated.*`) holds the whole tooltip sentence per id,
// because the sentence doesn't decompose the same way in every
// language — Turkish negates the verb ("rolünüz mesaj
// gönderemez") rather than prefixing a fixed "can't" clause, so
// a template + fragment split would only ever read naturally in
// English. `GateAction` being a union means a typo is a build
// error instead of a missing message key at runtime.
// ============================================================

import type { ComponentProps, ReactNode } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Actions a role can be gated out of. Each id is a key under
 *  the `Common.gated` namespace holding the full tooltip. */
export type GateAction =
  | "sendMessages"
  | "createBroadcasts"
  | "addContacts"
  | "deleteContacts"
  | "createFlows"
  | "createPipelines"
  | "createDeals"
  | "createAutomations";

interface GatedButtonProps extends Omit<ComponentProps<typeof Button>, "title"> {
  /** False → button is disabled and the wrapper span shows the
   *  "Read-only" tooltip. Defaults to `true` so a `<GatedButton>`
   *  without the prop is just a Button. */
  canAct?: boolean;
  /** Which action this CTA performs. Looked up in the
   *  `Common.gated` catalogue for the read-only tooltip. */
  gateReason?: GateAction;
  /** Optional fallback title for the non-gated case. */
  title?: string;
  children?: ReactNode;
}

export function GatedButton({
  canAct = true,
  gateReason,
  title,
  disabled,
  className,
  children,
  ...rest
}: GatedButtonProps) {
  const t = useTranslations("Common.gated");
  const effectivelyDisabled = disabled || !canAct;
  const tooltip = !canAct && gateReason ? t(gateReason) : title;

  return (
    <span
      // `inline-flex` so the span sizes to the button and doesn't
      // collapse to zero width / break inline layouts. `title`
      // here (not on the button) is what makes the tooltip work
      // in Safari / older Firefox — those browsers don't fire
      // mouseover on disabled buttons.
      className={cn("inline-flex", !canAct && "cursor-not-allowed")}
      title={tooltip}
    >
      <Button
        disabled={effectivelyDisabled}
        className={className}
        {...rest}
      >
        {children}
      </Button>
    </span>
  );
}
