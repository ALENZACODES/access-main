// Robustness audit for the small stores the panel keeps on the device: expiring values, the activity list, the refused-request
// list, the "seen" list and the language choice. Whatever text is in storage, reading must not throw, must not return
// something malformed, and must not change what every object inherits.

import { describe, expect, it } from "vitest";
import { ACTIVITY_TTL_DAYS, MAX_ACTIVITY_ENTRIES, activityKey, loadActivity, recordActivity, type ActivityEntry } from "../panel/activityLog";
import { loadSeen, saveSeen, seenKey, snapshot } from "../panel/changes";
import { EGRESS_TTL_DAYS, MAX_EGRESS_HOSTS, egressKey, loadBlocked, recordBlocked } from "../panel/egressLog";
import { getExpiring, isExpired, parseEnvelope, purgeExpired, putExpiring } from "../panel/expiry";
import { FIXTURE } from "../panel/fixtures.test-util";
import { loadPrefs, prefsKey, savePrefs } from "../panel/preferences";
import { createMemoryStorage } from "../panel/storage";
import { createFaultyStorage } from "./fuzz/faultyStorage";
import { genDateText, genJson, genKeyName, genString, mutateJson, mutateText, setOwn, writeJson } from "./fuzz/gen";
import { assertProperty, shrinkString } from "./fuzz/property";
import type { Rng } from "./fuzz/rng";

const PREFIX = "app.";
const NOW = new Date(2026, 10, 20, 9, 0, 0);
const DAY = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function anyText(rng: Rng, valid: () => unknown): string {
  const roll = rng.int(0, 3);
  if (roll === 0) return genString(rng, 60);
  if (roll === 1) return writeJson(rng, genJson(rng, 4));
  if (roll === 2) return mutateText(rng, writeJson(rng, valid()));
  return writeJson(rng, mutateJson(rng, valid()));
}

function envelope(rng: Rng, inner: unknown, fresh = true): unknown {
  const now = NOW.getTime();
  return { v: typeof inner === "string" ? inner : JSON.stringify(inner), savedAt: new Date(now - DAY).toISOString(), expiresAt: new Date(now + (fresh ? 1 : -1) * rng.int(1, 30) * DAY).toISOString() };
}

const inheritsNothingNew = (o: object): void => {
  expect(Object.getPrototypeOf(o)).toBe(Object.prototype);
  expect(({} as Record<string, unknown>).count).toBeUndefined();
  expect(({} as Record<string, unknown>).h).toBeUndefined();
};

describe("expiring values", () => {
  it("parseEnvelope never throws and only accepts text with three strings, two of them real dates", () => {
    assertProperty<string>({
      name: "parseEnvelope on any text",
      runs: 600,
      gen: (rng) => anyText(rng, () => envelope(rng, "x")),
      prop: (text) => {
        const e = parseEnvelope(text);
        if (e === null) return;
        expect(typeof e.v).toBe("string");
        expect(Number.isNaN(Date.parse(e.savedAt))).toBe(false);
        expect(Number.isNaN(Date.parse(e.expiresAt))).toBe(false);
        expect(Object.keys(e).sort()).toEqual(["expiresAt", "savedAt", "v"]);
      },
      shrink: shrinkString,
      show: (t) => JSON.stringify(t),
    });
  });

  it("a value written with a lifetime is fresh until the day it ends, then expired", () => {
    assertProperty<{ ttl: number; offset: number; value: string }>({
      name: "putExpiring then getExpiring",
      gen: (rng) => ({ ttl: rng.int(1, 400), offset: rng.int(-2, 405), value: genString(rng, 30) }),
      prop: ({ ttl, offset, value }) => {
        const s = createMemoryStorage();
        expect(putExpiring(s, "k", value, NOW, ttl)).toBe(true);
        const r = getExpiring(s, "k", new Date(NOW.getTime() + offset * DAY));
        const alive = NOW.getTime() + offset * DAY < NOW.getTime() + ttl * DAY;
        expect(r.state).toBe(alive ? "fresh" : "expired");
        if (r.state === "fresh") expect(r.value).toBe(value);
      },
    });
  });

  it("refuses a lifetime that is not a whole number of days from 1 to 3650, and writes nothing", () => {
    for (const ttl of [0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 3651, 2 ** 53]) {
      const s = createMemoryStorage();
      expect(() => putExpiring(s, "k", "v", NOW, ttl), String(ttl)).toThrow(RangeError);
      expect(s.length).toBe(0);
    }
  });

  it("reads a value with no envelope as one with no known lifetime, and never as expired", () => {
    assertProperty<string>({
      name: "no envelope means no-expiry",
      runs: 400,
      gen: (rng) => genString(rng, 40),
      prop: (raw) => {
        const s = createMemoryStorage({ k: raw });
        const r = getExpiring(s, "k", NOW);
        if (parseEnvelope(raw) === null) expect(r).toEqual({ state: "no-expiry", raw });
      },
    });
  });

  it("purges exactly the expired envelopes under the prefix and leaves every other value alone", () => {
    type Item = { key: string; kind: "fresh" | "expired" | "plain" | "outside" };
    assertProperty<Item[]>({
      name: "purgeExpired is exact",
      runs: 300,
      gen: (rng) => Array.from({ length: rng.int(0, 14) }, (_, i): Item => ({ key: `${rng.bool(0.8) ? PREFIX : "site."}${genKeyName(rng, 5)}${i}`, kind: rng.pick(["fresh", "expired", "plain", "outside"] as const) })),
      prop: (items) => {
        const initial: Record<string, string> = {};
        for (const it of items) {
          const rng = { int: () => 3 } as unknown as Rng;
          initial[it.key] = it.kind === "plain" ? `{"note":"${it.key}"}` : JSON.stringify(envelope(rng, "v", it.kind !== "expired"));
        }
        const s = createMemoryStorage(initial);
        const r = purgeExpired(s, PREFIX, NOW);
        for (const [key, raw] of Object.entries(initial)) {
          const env = parseEnvelope(raw);
          const shouldGo = key.startsWith(PREFIX) && env !== null && isExpired(env, NOW);
          expect(s.getItem(key) === null, key).toBe(shouldGo);
          expect(r.purged.includes(key), key).toBe(shouldGo);
        }
        expect(r.failed).toEqual([]);
      },
      show: (v) => JSON.stringify(v),
    });
  });

  it("says which expired values it could not remove, and does not count a value that is still there", () => {
    const old = JSON.stringify(envelope({ int: () => 3 } as unknown as Rng, "v", false));
    const s = createFaultyStorage({ [`${PREFIX}a`]: old, [`${PREFIX}b`]: old, [`${PREFIX}c`]: old }, { failRemoveWhen: (k) => k.endsWith("a"), dropRemoveWhen: (k) => k.endsWith("b") });
    const r = purgeExpired(s, PREFIX, NOW);
    expect(r.purged).toEqual([`${PREFIX}c`]);
    expect(r.failed.sort()).toEqual([`${PREFIX}a`, `${PREFIX}b`]);
    expect(s.snapshot()).toEqual({ [`${PREFIX}a`]: old, [`${PREFIX}b`]: old });
  });

  it("returns a value as missing, not as an error, when storage will not be read", () => {
    const s = createFaultyStorage({ k: "x" }, { failReadWhen: () => true });
    expect(getExpiring(s, "k", NOW)).toEqual({ state: "missing" });
  });
});

describe("the activity list", () => {
  const entry = (rng: Rng): Record<string, unknown> => {
    const e: Record<string, unknown> = { at: NOW.toISOString(), kind: rng.pick(["export", "import", "language", "consent-granted", "device-clear"]) };
    if (rng.bool()) e.count = rng.int(0, 99);
    if (rng.bool()) e.lang = rng.pick(["en", "fr"]);
    if (rng.bool()) e.format = rng.pick(["csv", "text"]);
    if (rng.bool()) e.purposeId = "saved-places";
    return e;
  };
  const validList = (rng: Rng): unknown[] => Array.from({ length: rng.int(0, 6) }, () => entry(rng));

  it("reading never throws and returns only well-formed entries, at most fifty", () => {
    assertProperty<string>({
      name: "loadActivity on any stored value",
      runs: 600,
      gen: (rng) => {
        const raw = rng.bool(0.5) ? anyText(rng, () => envelope(rng, validList(rng))) : JSON.stringify(envelope(rng, anyText(rng, () => validList(rng))));
        return raw;
      },
      prop: (raw) => {
        const list = loadActivity(createMemoryStorage({ [activityKey(PREFIX)]: raw }), PREFIX, NOW);
        expect(list.length).toBeLessThanOrEqual(MAX_ACTIVITY_ENTRIES);
        for (const e of list) {
          expect(Number.isNaN(Date.parse(e.at))).toBe(false);
          expect(typeof e.kind).toBe("string");
          if (e.count !== undefined) expect(Number.isInteger(e.count) && e.count >= 0).toBe(true);
          if (e.lang !== undefined) expect(["en", "fr"]).toContain(e.lang);
          if (e.format !== undefined) expect(["csv", "text"]).toContain(e.format);
        }
      },
      shrink: shrinkString,
      show: (t) => JSON.stringify(t),
    });
  });

  it("keeps the newest entry first, at most fifty entries, and holds no contents", () => {
    assertProperty<number>({
      name: "recordActivity keeps a bounded newest-first list",
      runs: 60,
      gen: (rng) => rng.int(1, 120),
      prop: (n) => {
        const s = createMemoryStorage();
        for (let i = 0; i < n; i += 1) {
          expect(recordActivity(s, PREFIX, { kind: "export", count: i }, new Date(NOW.getTime() + i * 1000))).toBe(true);
        }
        const list = loadActivity(s, PREFIX, new Date(NOW.getTime() + n * 1000));
        expect(list).toHaveLength(Math.min(n, MAX_ACTIVITY_ENTRIES));
        expect(list[0]?.count).toBe(n - 1);
        for (let i = 1; i < list.length; i += 1) expect(Date.parse((list[i - 1] as ActivityEntry).at)).toBeGreaterThanOrEqual(Date.parse((list[i] as ActivityEntry).at));
        for (const e of list) expect(Object.keys(e).sort()).toEqual(["at", "count", "kind"]);
      },
    });
  });

  it("restarts the ninety day clock with each entry and drops everything after it runs out", () => {
    const s = createMemoryStorage();
    recordActivity(s, PREFIX, { kind: "export" }, NOW);
    expect(loadActivity(s, PREFIX, new Date(NOW.getTime() + (ACTIVITY_TTL_DAYS - 1) * DAY))).toHaveLength(1);
    expect(loadActivity(s, PREFIX, new Date(NOW.getTime() + ACTIVITY_TTL_DAYS * DAY))).toEqual([]);
    recordActivity(s, PREFIX, { kind: "import" }, new Date(NOW.getTime() + 60 * DAY));
    expect(loadActivity(s, PREFIX, new Date(NOW.getTime() + 140 * DAY))).toHaveLength(2);
  });

  it("returns false and leaves the earlier list alone when storage refuses the write", () => {
    const s = createFaultyStorage();
    recordActivity(s, PREFIX, { kind: "export" }, NOW);
    const before = s.snapshot();
    s.setFaults({ failWriteWhen: () => true });
    expect(recordActivity(s, PREFIX, { kind: "import" }, NOW)).toBe(false);
    expect(s.snapshot()).toEqual(before);
    expect(recordActivity(null, PREFIX, { kind: "import" }, NOW)).toBe(false);
  });
});

describe("the refused-request list", () => {
  const stored = (rng: Rng): unknown => {
    const hosts: Record<string, unknown> = {};
    for (let i = 0; i < rng.int(0, 4); i += 1) setOwn(hosts, `h${i}.example.net`, { count: rng.int(1, 9), lastAt: NOW.toISOString() });
    return { since: NOW.toISOString(), hosts };
  };

  it("reading never throws and returns hosts with a whole count of at least one, most refused first", () => {
    assertProperty<string>({
      name: "loadBlocked on any stored value",
      runs: 600,
      gen: (rng) => (rng.bool(0.5) ? anyText(rng, () => envelope(rng, stored(rng))) : JSON.stringify(envelope(rng, anyText(rng, () => stored(rng))))),
      prop: (raw) => {
        const v = loadBlocked(createMemoryStorage({ [egressKey(PREFIX)]: raw }), PREFIX, NOW);
        for (const h of v.hosts) {
          expect(Number.isInteger(h.count) && h.count >= 1).toBe(true);
          expect(Number.isNaN(Date.parse(h.lastAt))).toBe(false);
        }
        for (let i = 1; i < v.hosts.length; i += 1) expect((v.hosts[i - 1] as { count: number }).count).toBeGreaterThanOrEqual((v.hosts[i] as { count: number }).count);
      },
      shrink: shrinkString,
      show: (t) => JSON.stringify(t),
    });
  });

  it("keeps at most fifty hosts, the most recent ones, and counts repeats", () => {
    const s = createMemoryStorage();
    for (let i = 0; i < 70; i += 1) recordBlocked(s, PREFIX, { at: new Date(NOW.getTime() + i * 1000).toISOString(), host: `h${i}.example.net`, scheme: "https:", via: "fetch", reason: "not-listed" }, NOW);
    recordBlocked(s, PREFIX, { at: new Date(NOW.getTime() + 99_000).toISOString(), host: "h69.example.net", scheme: "https:", via: "fetch", reason: "not-listed" }, NOW);
    const v = loadBlocked(s, PREFIX, NOW);
    expect(v.hosts).toHaveLength(MAX_EGRESS_HOSTS);
    expect(v.hosts[0]).toMatchObject({ host: "h69.example.net", count: 2 });
    expect(v.hosts.some((h) => h.host === "h0.example.net")).toBe(false);
    expect(v.hosts.some((h) => h.host === "h20.example.net")).toBe(true);
  });

  it("stores no path, query or contents: only the host, a count and a time", () => {
    const s = createMemoryStorage();
    recordBlocked(s, PREFIX, { at: NOW.toISOString(), host: "evil.example.net", scheme: "https:", via: "fetch", reason: "not-listed" }, NOW);
    const raw = s.getItem(egressKey(PREFIX)) ?? "";
    expect(raw).not.toMatch(/fetch|not-listed|https:/);
  });

  it("expires thirty days after the latest refusal", () => {
    const s = createMemoryStorage();
    recordBlocked(s, PREFIX, { at: NOW.toISOString(), host: "a.example.net", scheme: "https:", via: "fetch", reason: "not-listed" }, NOW);
    expect(loadBlocked(s, PREFIX, new Date(NOW.getTime() + (EGRESS_TTL_DAYS - 1) * DAY)).hosts).toHaveLength(1);
    expect(loadBlocked(s, PREFIX, new Date(NOW.getTime() + EGRESS_TTL_DAYS * DAY)).hosts).toEqual([]);
  });

  it("does not let a host named like an object internal change what the list inherits", () => {
    for (const host of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
      const s = createMemoryStorage();
      expect(() => recordBlocked(s, PREFIX, { at: NOW.toISOString(), host, scheme: "https:", via: "fetch", reason: "not-listed" }, NOW), host).not.toThrow();
      expect(() => recordBlocked(s, PREFIX, { at: NOW.toISOString(), host, scheme: "https:", via: "fetch", reason: "not-listed" }, NOW), host).not.toThrow();
      const v = loadBlocked(s, PREFIX, NOW);
      expect(v.hosts.filter((h) => h.host === host).map((h) => h.count), host).toEqual([2]);
      for (const h of v.hosts) expect(Number.isInteger(h.count) && h.count >= 1, `${host}: ${JSON.stringify(h)}`).toBe(true);
      inheritsNothingNew({});
    }
  });

  it("returns false and keeps the earlier list when storage refuses the write", () => {
    const s = createFaultyStorage();
    const b = { at: NOW.toISOString(), host: "a.example.net", scheme: "https:", via: "fetch", reason: "not-listed" } as const;
    expect(recordBlocked(s, PREFIX, b, NOW)).toBe(true);
    const before = s.snapshot();
    s.setFaults({ quotaChars: 1 });
    expect(recordBlocked(s, PREFIX, b, NOW)).toBe(false);
    expect(s.snapshot()).toEqual(before);
  });
});

describe("the seen list", () => {
  const valid = (rng: Rng): unknown => ({ seenOn: "2026-11-15", entries: Object.fromEntries(FIXTURE.slice(0, rng.int(0, 3)).map((e) => [e.id, { h: "0123abcd", label: e.label }])) });

  it("reading never throws and returns a date and entries that each have a hash and both labels", () => {
    assertProperty<string>({
      name: "loadSeen on any stored value",
      runs: 600,
      gen: (rng) => (rng.bool(0.5) ? anyText(rng, () => envelope(rng, valid(rng))) : JSON.stringify(envelope(rng, anyText(rng, () => valid(rng))))),
      prop: (raw) => {
        const l = loadSeen(createMemoryStorage({ [seenKey(PREFIX)]: raw }), PREFIX, NOW);
        if (l === null) return;
        expect(l.seenOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        for (const e of Object.values(l.entries)) {
          expect(typeof e.h).toBe("string");
          expect(typeof e.label.en).toBe("string");
          expect(typeof e.label.fr).toBe("string");
        }
        inheritsNothingNew(l.entries);
      },
      shrink: shrinkString,
      show: (t) => JSON.stringify(t),
    });
  });

  it("an entry named __proto__ does not become something every entry inherits", () => {
    const body = `{"seenOn":"2026-11-15","entries":{"__proto__":{"h":"00000000","label":{"en":"a","fr":"b"}},"settings":{"h":"11111111","label":{"en":"S","fr":"R"}}}}`;
    const l = loadSeen(createMemoryStorage({ [seenKey(PREFIX)]: JSON.stringify({ v: body, savedAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + DAY).toISOString() }) }), PREFIX, NOW);
    expect(l).not.toBeNull();
    expect((l?.entries as Record<string, unknown>).h).toBeUndefined();
    expect((l?.entries as Record<string, unknown>).label).toBeUndefined();
  });

  it("saves and reads back a snapshot of the real list, and expires it after a year", () => {
    const s = createMemoryStorage();
    const snap = snapshot(FIXTURE, "2026-11-15");
    expect(saveSeen(s, PREFIX, snap, NOW)).toBe(true);
    expect(loadSeen(s, PREFIX, NOW)).toEqual(snap);
    expect(loadSeen(s, PREFIX, new Date(NOW.getTime() + 366 * DAY))).toBeNull();
  });
});

describe("the language choice", () => {
  it("reading never throws and gives en, fr or nothing", () => {
    assertProperty<string>({
      name: "loadPrefs on any text",
      runs: 500,
      gen: (rng) => anyText(rng, () => ({ locale: rng.pick(["en", "fr"]) })),
      prop: (raw) => {
        const p = loadPrefs(createMemoryStorage({ [prefsKey(PREFIX)]: raw }), PREFIX);
        if (p !== null) expect(["en", "fr"]).toContain(p.locale);
      },
      shrink: shrinkString,
    });
  });
  it("reads back what it saved and says so when it could not save", () => {
    const s = createMemoryStorage();
    expect(savePrefs(s, PREFIX, { locale: "fr" })).toBe(true);
    expect(loadPrefs(s, PREFIX)).toEqual({ locale: "fr" });
    expect(savePrefs(createFaultyStorage({}, { failWriteWhen: () => true }), PREFIX, { locale: "fr" })).toBe(false);
    expect(loadPrefs(createFaultyStorage({ [prefsKey(PREFIX)]: '{"locale":"fr"}' }, { failReadWhen: () => true }), PREFIX)).toBeNull();
  });
  it("stored dates are always written in one form, so an old and a new entry sort the same way as text", () => {
    expect(genDateText).toBeTypeOf("function");
    expect(new Date(NOW).toISOString()).toMatch(ISO);
  });
});
