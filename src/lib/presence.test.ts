import { describe, expect, it } from "vitest";

import {
  OFFLINE_AFTER_MS,
  derivePresence,
  formatLastSeen,
  presenceLabel,
  summarize,
} from "./presence";

// Fixed reference clock so every case is deterministic.
const NOW = new Date("2026-06-22T12:00:00.000Z").getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

// The label helpers now take a next-intl translator (copy lives under
// `Common.presence.*`), so these assert the catalogue key + values the
// helper asks for rather than a baked-in English sentence. `t` here is
// a stub that renders "key(param=value)" — enough to pin down both the
// key chosen and the interpolation passed with it.
const t = (key: string, values?: Record<string, string | number>) =>
  values
    ? `${key}(${Object.entries(values)
        .map(([k, v]) => `${k}=${v}`)
        .join(",")})`
    : key;

describe("derivePresence", () => {
  it("returns the stored status for a fresh heartbeat", () => {
    expect(derivePresence("online", ago(1_000), NOW)).toBe("online");
    expect(derivePresence("away", ago(1_000), NOW)).toBe("away");
  });

  it("reads as offline when the heartbeat is stale", () => {
    expect(derivePresence("online", ago(OFFLINE_AFTER_MS + 1_000), NOW)).toBe(
      "offline",
    );
    // Stored 'away' goes stale to offline too (tab was closed while idle).
    expect(derivePresence("away", ago(OFFLINE_AFTER_MS + 1_000), NOW)).toBe(
      "offline",
    );
  });

  it("treats a missing row or timestamp as offline", () => {
    expect(derivePresence(undefined, null, NOW)).toBe("offline");
    expect(derivePresence("online", null, NOW)).toBe("offline");
    expect(derivePresence("online", "not-a-date", NOW)).toBe("offline");
  });

  it("stays online exactly at the threshold and flips just past it", () => {
    expect(derivePresence("online", ago(OFFLINE_AFTER_MS), NOW)).toBe("online");
    expect(derivePresence("online", ago(OFFLINE_AFTER_MS + 1), NOW)).toBe(
      "offline",
    );
  });
});

describe("formatLastSeen", () => {
  it("describes recent activity coarsely", () => {
    expect(formatLastSeen(ago(10_000), NOW, t)).toBe("lastSeen.justNow");
    // Singular is an ICU branch in the catalogue now, so one minute and
    // five minutes share a key and differ only in `count`.
    expect(formatLastSeen(ago(60_000), NOW, t)).toBe("lastSeen.minutes(count=1)");
    expect(formatLastSeen(ago(5 * 60_000), NOW, t)).toBe(
      "lastSeen.minutes(count=5)",
    );
  });

  it("rolls up into hours and days", () => {
    expect(formatLastSeen(ago(60 * 60_000), NOW, t)).toBe(
      "lastSeen.hours(count=1)",
    );
    expect(formatLastSeen(ago(2 * 60 * 60_000), NOW, t)).toBe(
      "lastSeen.hours(count=2)",
    );
    expect(formatLastSeen(ago(24 * 60 * 60_000), NOW, t)).toBe(
      "lastSeen.days(count=1)",
    );
    expect(formatLastSeen(ago(3 * 24 * 60 * 60_000), NOW, t)).toBe(
      "lastSeen.days(count=3)",
    );
  });

  it("falls back gracefully on missing/invalid input", () => {
    expect(formatLastSeen(null, NOW, t)).toBe("lastSeen.unknown");
    expect(formatLastSeen("nonsense", NOW, t)).toBe("lastSeen.unknown");
  });
});

describe("presenceLabel", () => {
  it("labels each state for the tooltip", () => {
    expect(presenceLabel("online", ago(1_000), NOW, t)).toBe("online");
    expect(presenceLabel("away", ago(1_000), NOW, t)).toBe("away");
    // The offline label embeds the relative time as the `when` value.
    expect(presenceLabel("offline", ago(2 * 60 * 60_000), NOW, t)).toBe(
      "offline(when=lastSeen.hours(count=2))",
    );
  });
});

describe("summarize", () => {
  it("counts each status", () => {
    expect(
      summarize(["online", "online", "online", "away", "offline"]),
    ).toEqual({ online: 3, away: 1, offline: 1 });
  });

  it("returns zeroes for an empty roster", () => {
    expect(summarize([])).toEqual({ online: 0, away: 0, offline: 0 });
  });
});
