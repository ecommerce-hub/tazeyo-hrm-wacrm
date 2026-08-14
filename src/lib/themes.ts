/**
 * Single source of truth for the color-theme catalog.
 *
 * The CSS variables themselves live in `src/app/globals.css` under
 * `html[data-theme="..."]` blocks — that file is the one we paste
 * theme tokens into. This module only carries the metadata the UI
 * (settings picker, no-flash boot script) needs.
 *
 * Adding a new theme is a two-step change:
 *   1. Append the new `html[data-theme="<id>"]` block in globals.css
 *      with every token from an existing theme (use violet as the
 *      shape reference).
 *   2. Add an entry below. The order here drives the picker grid.
 */

export const THEME_IDS = [
  "tazeyo",
  "violet",
  "emerald",
  "cobalt",
  "amber",
  "rose",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeId = "tazeyo";

export const STORAGE_KEY = "tazeyo.theme";

/**
 * MODE — the light/dark dimension, orthogonal to the accent theme.
 *
 * The CSS variables live in `src/app/globals.css` under
 * `html[data-mode="..."]` blocks (neutral surfaces only). Applied
 * at runtime via `document.documentElement.dataset.mode`. Dark is
 * the historical default and stays the app's identity; light is the
 * opt-in eye-strain-friendly alternative.
 *
 * Persisted under its own localStorage key so it composes freely
 * with the accent choice (you can run Tazeyo-light or Tazeyo-dark).
 *
 * Light is the default: the Tazeyo brand surface is the Alabaster
 * canvas used across the rest of the suite (Tazeyo HRM), so a Tazeyo
 * operator opening the CRM lands somewhere that looks like the tools
 * they already use. Dark stays a one-click opt-in.
 */
export const MODES = ["light", "dark"] as const;

export type Mode = (typeof MODES)[number];

export const DEFAULT_MODE: Mode = "light";

export const MODE_STORAGE_KEY = "tazeyo.mode";

export function isMode(value: unknown): value is Mode {
  return (
    typeof value === "string" && (MODES as ReadonlyArray<string>).includes(value)
  );
}

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  tagline: string;
  /**
   * Static swatch color for the picker chip. Hard-coded so the boot
   * script / picker cards don't need a getComputedStyle round trip
   * before the page settles. Must mirror `--primary` of the same
   * theme in globals.css.
   */
  swatch: string;
}

export const THEMES: ReadonlyArray<ThemeMeta> = [
  {
    id: "tazeyo",
    name: "Tazeyo",
    tagline: "Kurumsal marka teması — kivi yeşili ve sıcak siyah.",
    // Kiwi Green #A2E96C — the mark everyone recognises. The light
    // mode actually leads with Warm Black, but the swatch shows the
    // brand colour rather than the ink.
    swatch: "oklch(0.861 0.173 133.4)",
  },
  {
    id: "violet",
    name: "Violet",
    tagline: "Kendinden emin, hafif oyuncu.",
    swatch: "oklch(0.526 0.247 293)",
  },
  {
    id: "emerald",
    name: "Emerald",
    tagline: "Büyüme odaklı — WhatsApp yeşilini kopyalamadan mesajlaşmayı anımsatır.",
    swatch: "oklch(0.62 0.16 162)",
  },
  {
    id: "cobalt",
    name: "Cobalt",
    tagline: "Sade B2B-SaaS mavisi — sakin ve ürün odaklı.",
    swatch: "oklch(0.585 0.2 254)",
  },
  {
    id: "amber",
    name: "Amber",
    tagline: "Sıcak ve samimi — KOBİ ekipleri için ideal.",
    swatch: "oklch(0.745 0.16 65)",
  },
  {
    id: "rose",
    name: "Rose",
    tagline: "Cesur ve modern — D2C, içerik üreticisi ekonomisi, yaşam tarzı.",
    swatch: "oklch(0.645 0.22 16)",
  },
];

export function isThemeId(value: unknown): value is ThemeId {
  return (
    typeof value === "string" &&
    (THEME_IDS as ReadonlyArray<string>).includes(value)
  );
}
