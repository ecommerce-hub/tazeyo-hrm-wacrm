"use client";

/**
 * Date/number formatting bound to the app locale.
 *
 * Two separate leaks made a Turkish UI print English dates:
 *
 *   1. `date-fns` `format()` / `formatDistanceToNow()` default to
 *      en-US when no `locale` option is passed — so "MMMM d, yyyy"
 *      rendered "August 14, 2026" no matter what the app locale was.
 *   2. `toLocaleDateString()` was called either with a hard-coded
 *      "en-US" or with `undefined`, which resolves to the *browser's*
 *      locale — i.e. whatever the operator's OS happens to be set to,
 *      not what the app is running in.
 *
 * Both are fixed by reading the next-intl locale and threading it
 * through. Use `useDateFnsLocale()` for date-fns calls and
 * `useIntlLocale()` for the `Intl`/`toLocale*String` family.
 *
 * The app locale is a build-time constant (NEXT_PUBLIC_APP_LOCALE, see
 * src/i18n/request.ts), so these hooks never change value at runtime —
 * they're hooks purely to reach the next-intl context.
 */

import { enUS, ko, tr, type Locale } from "date-fns/locale";
import { useLocale } from "next-intl";

/** date-fns locale objects for every dictionary we ship. */
const DATE_FNS_LOCALES: Record<string, Locale> = { en: enUS, ko, tr };

/**
 * BCP-47 tags for `Intl`. `Intl` would accept the bare "tr" too, but
 * the region matters for date order and separators, so be explicit.
 */
const INTL_TAGS: Record<string, string> = {
  en: "en-US",
  ko: "ko-KR",
  tr: "tr-TR",
};

/** Falls back to English for a locale we have no dictionary for. */
export function useDateFnsLocale(): Locale {
  const locale = useLocale();
  return DATE_FNS_LOCALES[locale] ?? enUS;
}

/** Falls back to English for a locale we have no dictionary for. */
export function useIntlLocale(): string {
  const locale = useLocale();
  return INTL_TAGS[locale] ?? "en-US";
}
