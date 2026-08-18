import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * Baseline security headers applied to every response.
 *
 * CSP ships as `Content-Security-Policy-Report-Only` so the browser
 * surfaces violations in the console without blocking anything — once
 * we have confidence nothing legit trips it (two deploys, a pass on
 * every route), flip the key to `Content-Security-Policy` to enforce.
 *
 * The rest of the headers are straight blocks, safe to enforce today:
 *   - HSTS: only meaningful on HTTPS (no-op on http://localhost).
 *   - X-Content-Type-Options / X-Frame-Options / Referrer-Policy:
 *     baseline OWASP hardening, no behavioural cost.
 *   - Permissions-Policy: we don't use camera / microphone / etc, so
 *     deny them. A supply-chain compromise or a forgotten plugin
 *     can't silently opt back in.
 */
const SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    // Microphone is allowed for same-origin (`self`) so the inbox
    // composer can record voice notes via MediaRecorder. Everything
    // else stays denied — a compromised dependency can't silently grab
    // the camera / geolocation / etc.
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=()",
  },
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      // Next.js needs 'unsafe-inline' for its inline hydration script
      // and 'unsafe-eval' in dev + some production optimisations.
      // Nonce-based CSP is a later project.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      // Tailwind + inline style attributes on lots of components.
      "style-src 'self' 'unsafe-inline'",
      // Supabase public-bucket avatars, contact avatars (arbitrary
      // https URLs paste-able from the UI), OG images, data URLs for
      // tiny inline assets.
      "img-src 'self' data: blob: https:",
      // Outbound media previews (blob: from MediaRecorder + file picker)
      // and Supabase public-bucket audio/video the inbox renders.
      "media-src 'self' blob: https://*.supabase.co",
      "font-src 'self' data:",
      // Supabase REST + realtime (WSS). All Meta API calls happen
      // server-side, so graph.facebook.com does not belong here.
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
] as const;

/**
 * Route prefixes that must never be stored by a shared cache.
 *
 * Keep in sync with `protectedPaths` in src/middleware.ts. `join` is
 * included even though it is not auth-gated: it renders per-token
 * invitation state, which is just as wrong to share between visitors.
 */
const PRIVATE_ROUTE_PREFIXES = [
  "dashboard",
  "inbox",
  "contacts",
  "pipelines",
  "broadcasts",
  "automations",
  "flows",
  "agents",
  "notifications",
  "settings",
  "join",
] as const;

const PRIVATE_ROUTES = PRIVATE_ROUTE_PREFIXES.join("|");

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (.next/standalone) so the
  // Docker image can run without node_modules or the Next CLI.
  // Harmless outside Docker: `next start` keeps working as before.
  output: "standalone",

  /**
   * Cross-origin dev access (Next.js 16).
   *
   * Next 16 blocks requests to dev-only resources (`/_next/*` internals,
   * the HMR websocket, the dev overlay) unless the browser's Origin is
   * the host the dev server booted on — `localhost` by default. Tunnels
   * like ngrok serve the app from a public HTTPS host, so without
   * allow-listing that host those dev requests come back 403: HMR stops
   * working and the dev session degrades over the tunnel (issue #365).
   *
   * Wildcards match subdomains only (Next's CSRF matcher), so the
   * randomised tunnel subdomain is covered. Add any other host via
   * `ALLOWED_DEV_ORIGINS` (comma-separated). This key is dev-only and
   * has no effect on a production build.
   */
  allowedDevOrigins: [
    "*.ngrok-free.app",
    "*.ngrok.app",
    "*.ngrok.io",
    "*.trycloudflare.com",
    "*.loca.lt",
    ...(process.env.ALLOWED_DEV_ORIGINS
      ? process.env.ALLOWED_DEV_ORIGINS.split(",")
          .map((origin) => origin.trim())
          .filter(Boolean)
      : []),
  ],

  /**
   * Cache-Control policy.
   *
   * Why this exists:
   *   Hostinger's CDN was applying `s-maxage=31536000` (1 year) to
   *   prerendered HTML pages by default. When a new deploy shipped
   *   fresh Turbopack chunk hashes, the edge kept serving year-old
   *   HTML referencing chunk filenames that no longer existed on
   *   disk — result: HTML 200, every /_next/static/*.js and .css
   *   came back 404, the page rendered unstyled. Private/incognito
   *   did nothing because the cache is server-side.
   *
   * Strategy:
   *   - /_next/static/* — leave to Next. Turbopack dev chunks can go
   *     stale if we force immutable caching here; Next already emits
   *     the correct production headers for hashed assets.
   *   - /api/*          — no-store. API responses are per-user and
   *     must never be shared across requests at the edge.
   *   - Everything else — public, brief s-maxage + generous
   *     stale-while-revalidate. The edge serves instantly from cache
   *     for the first 5 min, then returns cached content while
   *     refreshing in the background for up to 24 h. A deploy's
   *     chunk-hash drift self-heals within ~5 min with no user-
   *     visible latency.
   *
   *   Note: per-user routes (/dashboard, /inbox, /contacts, …) are
   *   NOT covered by the catch-all — they get an explicit
   *   `private, no-store` rule of their own, listed first. Do not
   *   assume "it is server-rendered, so it will not be cached":
   *   an explicit `public, s-maxage` header overrides whatever
   *   Next.js would have chosen, and it is applied to middleware
   *   redirects as well as rendered pages.
   *
   * Security headers are appended via a separate catch-all rule
   * below — Next.js merges headers from every matching rule, so
   * they apply to every response regardless of which cache rule
   * matched.
   */
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        // Per-user routes: never storable by a shared cache.
        //
        // This rule exists because the catch-all below used to swallow
        // them, and that broke production sign-in outright. Next applies
        // the header config to *middleware* responses too, so the 307
        // middleware issues for an unauthenticated visit to /dashboard
        // was going out as:
        //   307  Location: /login
        //   Cache-Control: public, s-maxage=300, stale-while-revalidate=86400
        // with no Vary on the auth cookie. That explicitly authorises a
        // CDN (CloudFront, on Amplify) to store the redirect under the
        // key "/dashboard" and replay it to everyone for 5 minutes —
        // 24 hours once stale-while-revalidate is counted.
        //
        // So one logged-out hit on /dashboard poisons the edge, and
        // every signed-in user afterwards is bounced back to /login
        // without the request ever reaching the origin. Sign-in itself
        // still "works" — the Supabase token call goes straight to
        // supabase.co and never touches the CDN — which is what makes
        // it look like a session bug rather than a caching one. Locally
        // it is invisible: no shared cache, and browsers obey max-age=0.
        source: `/:path(${PRIVATE_ROUTES})/:rest*`,
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          // Only meaningful for proxies that honour Vary and ignore
          // no-store. On rendered pages Next overwrites this with its
          // own `Vary: rsc, ...`; no-store is the load-bearing part.
          { key: "Vary", value: "Cookie" },
        ],
      },
      {
        // Public, non-personalised routes only — the landing redirect,
        // /login, /signup, /forgot-password. Short shared-cache TTL so
        // a deploy's chunk-hash drift self-heals within ~5 min.
        //
        // The private prefixes are excluded here as well as being given
        // their own rule above. Next resolves duplicate header keys as
        // "last matching rule wins", so relying on rule order alone
        // would leave this a one-line reordering away from silently
        // reintroducing the redirect-caching bug. Excluding them makes
        // the two rules disjoint and the outcome order-independent.
        source: `/:path((?!_next/static|_next/image|api|${PRIVATE_ROUTES}).*)`,
        headers: [
          {
            key: "Cache-Control",
            value:
              "public, max-age=0, s-maxage=300, stale-while-revalidate=86400",
          },
        ],
      },
      {
        // Security headers on every response, including /_next/static
        // assets (nosniff matters there) and /api/* (HSTS + referrer-
        // policy don't hurt).
        source: "/:path*",
        headers: [...SECURITY_HEADERS],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
