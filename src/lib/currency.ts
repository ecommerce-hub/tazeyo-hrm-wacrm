/**
 * Currency — single source of truth for deal-value formatting and
 * the currency picker options.
 *
 * Before this module, ~6 components each defined their own
 * `Intl.NumberFormat(..., { currency: "USD" })` helper with USD
 * baked in. The default currency is now configurable per account
 * (accounts.default_currency, migration 021), so every formatter
 * takes a currency and falls back to DEFAULT_CURRENCY only when
 * nothing is known.
 */

/** App-wide fallback when no account/deal currency is available. */
export const DEFAULT_CURRENCY = "USD";

export interface CurrencyOption {
  /** ISO-4217 code, e.g. "USD". Stored verbatim in the DB. */
  code: string;
  /**
   * Localised name for the dropdown — "US Dollar" in English,
   * "ABD doları" in Turkish. Derived, never hand-written: see
   * {@link currencyLabel}.
   */
  label: string;
  /** Symbol for compact display, e.g. "$". */
  symbol: string;
}

/**
 * The currencies offered in pickers, with their compact symbol and the
 * English name used only as a fallback (see {@link currencyLabel}).
 *
 * Codes must be valid ISO-4217 so `Intl.NumberFormat` renders the right
 * symbol/grouping. Extend this list to offer more — nothing else needs
 * to change, and no translation work is required for a new entry.
 */
const CURRENCY_SEED: ReadonlyArray<{
  code: string;
  symbol: string;
  /** English name, used only when `Intl.DisplayNames` can't answer. */
  fallbackLabel: string;
}> = [
  // Turkish Lira leads the list: this instance is deployed for a
  // Turkish operator, so it's the code most accounts will pick. The
  // *fallback* is still USD (DEFAULT_CURRENCY above) because the
  // `accounts.default_currency` column defaults to 'USD' at the DB
  // level (migration 021) — changing only the TS constant would put
  // the two out of step. Set the account currency in Settings → Deals.
  { code: "TRY", symbol: "₺", fallbackLabel: "Turkish Lira" },
  { code: "USD", symbol: "$", fallbackLabel: "US Dollar" },
  { code: "EUR", symbol: "€", fallbackLabel: "Euro" },
  { code: "GBP", symbol: "£", fallbackLabel: "British Pound" },
  { code: "INR", symbol: "₹", fallbackLabel: "Indian Rupee" },
  { code: "AUD", symbol: "A$", fallbackLabel: "Australian Dollar" },
  { code: "CAD", symbol: "C$", fallbackLabel: "Canadian Dollar" },
  { code: "BRL", symbol: "R$", fallbackLabel: "Brazilian Real" },
  { code: "JPY", symbol: "¥", fallbackLabel: "Japanese Yen" },
  { code: "CNY", symbol: "¥", fallbackLabel: "Chinese Yuan" },
  { code: "AED", symbol: "د.إ", fallbackLabel: "UAE Dirham" },
  { code: "ZAR", symbol: "R", fallbackLabel: "South African Rand" },
  { code: "NGN", symbol: "₦", fallbackLabel: "Nigerian Naira" },
  { code: "SGD", symbol: "S$", fallbackLabel: "Singapore Dollar" },
  { code: "MXN", symbol: "$", fallbackLabel: "Mexican Peso" },
  { code: "COP", symbol: "$", fallbackLabel: "Colombian Peso" },
];

/**
 * BCP-47 tag for the app locale.
 *
 * These names are *not* in the message catalogue on purpose: the ICU
 * data shipped with every runtime already knows the name of every
 * ISO-4217 code in every locale, so a hand-maintained catalogue of 16
 * currency names would be 48 strings to keep in sync (en/ko/tr) and
 * would go stale the moment someone adds a code to the seed above.
 *
 * The app locale is a build-time constant (NEXT_PUBLIC_APP_LOCALE, see
 * src/i18n/request.ts), so it is safe to read here in a plain module
 * that has no access to the next-intl context — and it resolves to the
 * same value on the server and in the client bundle, so there is no
 * hydration mismatch. Mirrors the tag table in src/lib/i18n/date.ts,
 * which can't be imported here because it is a "use client" module.
 */
const INTL_TAGS: Record<string, string> = {
  en: "en-US",
  ko: "ko-KR",
  tr: "tr-TR",
};

function appLocaleTag(): string {
  const locale = process.env.NEXT_PUBLIC_APP_LOCALE || "tr";
  return INTL_TAGS[locale] ?? locale;
}

/**
 * Localised display name for an ISO-4217 code, e.g. "US Dollar" /
 * "ABD doları" / "미국 달러".
 *
 * Falls back to the hard-coded English name (then to the bare code) if
 * `Intl.DisplayNames` is missing or has no ICU data for the locale —
 * a `small-icu` Node build and very old browsers both land there.
 * `DisplayNames.of()` echoes the input back for a code it doesn't
 * know, which we treat as "no answer" rather than a label.
 */
export function currencyLabel(
  code: string,
  locale: string = appLocaleTag(),
): string {
  const fallback =
    CURRENCY_SEED.find((c) => c.code === code)?.fallbackLabel ?? code;
  try {
    const name = new Intl.DisplayNames([locale, "en"], {
      type: "currency",
    }).of(code);
    if (name && name !== code) return name;
  } catch {
    // No Intl.DisplayNames, or an unusable locale tag — use the fallback.
  }
  return fallback;
}

/**
 * The currencies offered in pickers, labelled in the app locale.
 * Built once at module load: the locale is a build-time constant, so
 * there is nothing to recompute per render.
 */
export const CURRENCIES: CurrencyOption[] = CURRENCY_SEED.map((c) => ({
  code: c.code,
  label: currencyLabel(c.code),
  symbol: c.symbol,
}));

/**
 * Format a deal value as a currency string. Whole-number output
 * (no minor units) — deal values are tracked to the dollar across
 * the app. `currency` defaults to USD so callers with nothing better
 * stay safe, but pass the account/deal currency wherever known.
 *
 * Total by design: `Intl.NumberFormat` throws a RangeError on a
 * structurally invalid currency code, and `deals.currency` carries
 * NO DB CHECK (only `accounts.default_currency` does), so legacy
 * rows, imports, or hand-edited data can hold malformed values like
 * "United States". We never let that crash a render — on a bad code
 * we fall back to "CODE 1,234".
 */
export function formatCurrency(
  value: number,
  currency: string = DEFAULT_CURRENCY,
): string {
  const code = (currency || DEFAULT_CURRENCY).trim();
  const amount = Number(value) || 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // Invalid ISO code — show the raw code + grouped number so the
    // value is still legible instead of throwing.
    return `${code} ${new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 0,
    }).format(amount)}`;
  }
}

/**
 * Compact currency for tight spaces (donut center, legend rows):
 * "$1.2M" / "€34.5k" / "₹900". Uses the currency's symbol from
 * CURRENCIES, falling back to the code when we don't carry a symbol.
 */
export function formatCurrencyShort(
  value: number,
  currency: string = DEFAULT_CURRENCY,
): string {
  const code = currency || DEFAULT_CURRENCY;
  const symbol = CURRENCIES.find((c) => c.code === code)?.symbol ?? `${code} `;
  return `${symbol}${formatCompactNumber(value)}`;
}

/**
 * Compact number for tight spaces (chart tiles, legends): 1_234 → "1.2k",
 * 1_200_000 → "1.2M", 900 → "900". The unit-less core shared with
 * {@link formatCurrencyShort}.
 */
export function formatCompactNumber(value: number): string {
  const v = Number(value || 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toFixed(0);
}
