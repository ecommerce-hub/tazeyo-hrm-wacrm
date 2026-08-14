import { ImageResponse } from "next/og";

// Replaces the default Next.js favicon with the Tazeyo brand mark —
// the kiwi-green disc with the warm-black sprout glyph, matching the
// sidebar logo in `src/components/brand/tazeyo-mark.tsx`. Next.js
// renders this at build time and auto-injects <link rel="icon"> into
// <head>.
//
// The artwork is duplicated here rather than imported from the
// component because Satori (what ImageResponse renders with) supports
// only a subset of SVG/CSS and no React component composition across
// the OG boundary — it needs plain elements. Both copies come from the
// same source asset (`public/tazeyo-mark.svg`); if the mark ever
// changes, all three move together.
//
// This route takes precedence over src/app/favicon.ico, which is the
// Next.js default and can stay on disk harmlessly (or be removed).

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // Transparent behind the mark: the disc is part of the
          // artwork, so a background square would double it up.
          background: "transparent",
        }}
      >
        <svg width="32" height="32" viewBox="224 224 552 552">
          <g transform="matrix(1 0 0 -1 0 1000)">
            <g transform="translate(764 499.5)">
              <path
                d="M 0 0 C 0 -145.803 -118.197 -264 -264 -264 C -409.803 -264 -528 -145.803 -528 0 C -528 145.803 -409.803 264 -264 264 C -118.197 264 0 145.803 0 0"
                fill="#A2E96C"
              />
            </g>
            <g transform="translate(658.3074 576.5877)">
              <path
                d="M 0 0 C -6.598 11.237 -20.527 14.668 -31.109 7.666 C -54.295 -7.671 -81.197 -23.582 -107.016 -18.172 L -107.555 -18.066 C -113.358 -17.006 -119.285 -15.212 -125.334 -13.004 C -123.119 12.247 -121.28 36.725 -118.734 58.853 C -116.476 89.787 -161.424 94.355 -165.944 63.899 C -167.908 44.737 -169.41 25.644 -170.962 6.603 C -184.088 12.023 -197.732 16.67 -212.397 18.688 C -240.383 22.764 -267.357 16.341 -286.332 1.109 C -315.194 -21.838 -318.061 -58.932 -319.958 -83.48 C -320.977 -96.675 -311.727 -108.248 -299.297 -109.331 C -298.668 -109.386 -298.045 -109.413 -297.426 -109.413 C -285.79 -109.413 -275.912 -99.928 -274.944 -87.4 C -273.129 -63.904 -270.941 -46.554 -259.174 -37.2 C -249.708 -29.601 -234.494 -26.467 -218.474 -28.82 L -218.268 -28.848 C -204.35 -30.753 -190.259 -36.577 -175.516 -43.181 C -176.947 -56.477 -178.606 -69.754 -180.715 -83.015 C -184.501 -106.317 -189.145 -129.017 -197.266 -150.8 C -200.898 -160.182 -204.736 -168.583 -210.133 -176.649 C -219.357 -191.321 -241.239 -200.228 -255.844 -187.918 C -265.399 -179.914 -270.596 -167.078 -276.271 -154.569 C -281.248 -143.31 -294.699 -138.081 -306.263 -142.968 C -317.83 -147.847 -323.155 -160.953 -318.157 -172.242 C -314.796 -179.832 -311.232 -188.104 -306.236 -196.787 C -288.202 -229.683 -252.779 -246.916 -215.566 -234.867 C -194.793 -228.216 -178.146 -213.679 -167.563 -195.396 C -146.176 -158.249 -136.307 -110.205 -130.328 -61.596 C -125.465 -63.069 -120.527 -64.333 -115.486 -65.266 C -75.621 -73.495 -39.898 -54.639 -7.222 -33.023 C 3.362 -26.021 6.596 -11.236 0 0"
                fill="#063639"
              />
            </g>
            <g transform="translate(597.077 596.4755)">
              <path
                d="M 0 0 C 17.852 0 32.325 14.473 32.325 32.325 C 32.325 50.178 17.852 64.65 0 64.65 C -17.853 64.65 -32.325 50.178 -32.325 32.325 C -32.325 14.473 -17.853 0 0 0"
                fill="#063639"
              />
            </g>
          </g>
        </svg>
      </div>
    ),
    { ...size },
  );
}
