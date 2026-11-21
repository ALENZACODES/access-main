import { describe, expect, it } from "vitest";
import { notice, manyNotices } from "./elevatorFixtures";
import { readNotice } from "./elevatorRead";
import { viewElevators, EMPTY_ELEVATOR_QUERY } from "./elevatorView";
import { noticesToCsv, noticesToText } from "./elevatorExport";
import { MAX_NOTICES, parseElevatorNotices, readInstant } from "./packElevators";
import { parseCsv } from "./csvParse";
import { lcg } from "./placeFixtures";

/** A random JSON-like value: the kind of thing a damaged or hostile pack could hold. */
function junk(rnd: () => number, depth = 0): unknown {
  const pick = Math.floor(rnd() * (depth > 2 ? 7 : 10));
  switch (pick) {
    case 0: return null;
    case 1: return rnd() < 0.5;
    case 2: return Math.floor(rnd() * 1e6) - 5e5;
    case 3: return rnd() * 1e3;
    case 4: return ["", "UNKNOWN", "Pape", "2026-11-13T19:48:29.000Z", "https://example.org", "en", "\u0000x", "<b>", "x".repeat(900)][Math.floor(rnd() * 9)];
    case 5: return undefined;
    case 6: return NaN;
    case 7: return Array.from({ length: Math.floor(rnd() * 5) }, () => junk(rnd, depth + 1));
    case 8: return { id: junk(rnd, depth + 1), station: junk(rnd, depth + 1), operator_text: junk(rnd, depth + 1), stop_ids: junk(rnd, depth + 1), checked_at: junk(rnd, depth + 1), tier: junk(rnd, depth + 1) };
    default: return Object.fromEntries(Array.from({ length: Math.floor(rnd() * 5) }, (_, i) => [`k${i}`, junk(rnd, depth + 1)]));
  }
}

describe("parseElevatorNotices on damaged input", () => {
  it("never throws and always gives a consistent count over 2000 random lists", () => {
    const rnd = lcg(808);
    for (let i = 0; i < 2000; i++) {
      const list = Array.from({ length: Math.floor(rnd() * 8) }, () => junk(rnd));
      const input = rnd() < 0.9 ? list : junk(rnd);
      const r = parseElevatorNotices(input);
      expect(r.notices.length + r.dropped).toBe(Array.isArray(input) ? input.length : 0);
      const ids = r.notices.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const n of r.notices) {
        expect(n.id.length).toBeGreaterThan(0);
        expect(n.stopIds.length).toBeLessThanOrEqual(40);
        expect(n.checkedAt === null).toBe(n.checkedDay === null);
        if (n.checkedDay) expect(n.checkedDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        if (n.sourceUrl) expect(n.sourceUrl.startsWith("https://")).toBe(true);
        if (n.text) expect([...n.text].every((c) => c.charCodeAt(0) > 8)).toBe(true);
      }
    }
  });
  it("keeps what comes out usable by every later step", () => {
    const rnd = lcg(909);
    for (let i = 0; i < 300; i++) {
      const list = Array.from({ length: Math.floor(rnd() * 10) }, () => junk(rnd));
      const { notices } = parseElevatorNotices(list);
      for (const n of notices) readNotice(n);
      const v = viewElevators(notices, EMPTY_ELEVATOR_QUERY, "2026-11-21", "en");
      expect(v.shown).toBe(notices.length);
      noticesToText(v.groups, "2026-11-21", "fr");
      const csv = parseCsv(noticesToCsv(notices, "2026-11-21"));
      expect(csv.ok).toBe(true);
      if (csv.ok) expect(csv.rows).toHaveLength(notices.length + 1);
    }
  });
  it("is quick on the largest allowed list", () => {
    const big = manyNotices(MAX_NOTICES, lcg(1)).map((n) => ({ id: n.id, station: n.station, operator_text: n.text, checked_at: n.checkedAt, stop_ids: n.stopIds }));
    const t0 = performance.now();
    const r = parseElevatorNotices(big);
    viewElevators(r.notices, EMPTY_ELEVATOR_QUERY, "2026-11-21", "en");
    expect(r.notices).toHaveLength(MAX_NOTICES);
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});

describe("readInstant against the platform's own parser", () => {
  it("agrees on the UTC day for 1500 random valid times", () => {
    const rnd = lcg(77);
    for (let i = 0; i < 1500; i++) {
      const ms = Date.UTC(2020, 0, 1) + Math.floor(rnd() * 8 * 365 * 86_400_000);
      const iso = new Date(ms).toISOString();
      expect(readInstant(iso)?.day, iso).toBe(iso.slice(0, 10));
      const off = ["+05:30", "-05:00", "+00:00", "-12:00", "+14:00"][Math.floor(rnd() * 5)]!;
      const local = iso.slice(0, 19) + off;
      expect(readInstant(local)?.day, local).toBe(new Date(Date.parse(local)).toISOString().slice(0, 10));
    }
  });
  it("never reads a text of random characters as a time", () => {
    const rnd = lcg(5);
    for (let i = 0; i < 2000; i++) {
      let s = "";
      for (let k = 0; k < 24; k++) s += "0123456789-:TZ.+ x"[Math.floor(rnd() * 18)];
      const r = readInstant(s);
      if (r) expect(Number.isFinite(Date.parse(s))).toBe(true);
    }
  });
});

describe("a station with a very long or odd name", () => {
  it("is cut, kept as text and shown in a group", () => {
    const { notices } = parseElevatorNotices([{ id: "a", station: "S".repeat(500) }]);
    expect(notices[0]?.station?.length).toBeLessThanOrEqual(120);
    expect(viewElevators(notices, EMPTY_ELEVATOR_QUERY, "2026-11-21", "en").groups).toHaveLength(1);
  });
  it("treats two names that differ only in case and accents as one station", () => {
    const v = viewElevators([notice({ id: "1", station: "Crémazie" }), notice({ id: "2", station: "CREMAZIE" })], EMPTY_ELEVATOR_QUERY, "2026-11-21", "en");
    expect(v.groups).toHaveLength(1);
  });
});
