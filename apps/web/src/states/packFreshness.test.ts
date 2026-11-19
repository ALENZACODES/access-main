import { describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { containsForbiddenOrg } from "../../../../packages/shared/test/forbiddenOrg";
import { lintCopy } from "./copyLint";
import {
  AGE_BUCKET_IDS,
  AGE_BUCKET_LIMITS,
  ageBucket,
  bucketLines,
  computeFreshness,
  freshnessLines,
  freshnessSummary,
  rangeLine,
  undatedLine,
  type FreshnessLevel,
} from "./packFreshness";
import { parsePackPlaces } from "./packPlaces";
import { STALE_AFTER_DAYS, isStale, type Provenance } from "./provenance";

const TODAY = "2026-11-19";
const dayOffset = (days: number): string => new Date(Date.UTC(2026, 10, 19) - days * 86_400_000).toISOString().slice(0, 10);
const prov = (retrievedOn: string): Provenance => ({ source: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrievedOn });
const at = (days: number | null) => ({ provenance: days === null ? null : prov(dayOffset(days)) });

describe("ageBucket", () => {
  it.each([
    [-1, "future"], [-400, "future"], [0, "within-30"], [30, "within-30"], [31, "within-90"], [90, "within-90"], [91, "within-year"], [365, "within-year"], [366, "older"], [5000, "older"],
  ] as const)("puts %s days in %s", (days, id) => expect(ageBucket(days)).toBe(id));
  it("agrees with the stale limit used everywhere else", () => {
    for (const days of [364, 365, 366, 367]) expect(ageBucket(days) === "older").toBe(isStale(dayOffset(days), TODAY));
    expect(AGE_BUCKET_LIMITS[2]).toBe(STALE_AFTER_DAYS);
  });
});

describe("computeFreshness", () => {
  it("counts records into buckets and keeps the oldest and newest dates", () => {
    const f = computeFreshness([at(1), at(30), at(31), at(120), at(400), at(-2), at(null)], TODAY);
    expect(f.total).toBe(7);
    expect(f.dated).toBe(6);
    expect(f.undated).toBe(1);
    expect(f.buckets).toEqual({ "within-30": 2, "within-90": 1, "within-year": 1, older: 1, future: 1 });
    expect(f).toMatchObject({ oldest: dayOffset(400), newest: dayOffset(-2), oldestDays: 400, newestDays: -2, staleRecords: 1 });
  });
  it("counts every record in exactly one bucket or as undated", () => {
    const f = computeFreshness([at(0), at(50), at(200), at(900), at(-1), at(null), at(null)], TODAY);
    expect(AGE_BUCKET_IDS.reduce((n, id) => n + f.buckets[id], 0) + f.undated).toBe(f.total);
  });
  it("is empty for no records", () => {
    expect(computeFreshness([], TODAY)).toMatchObject({ total: 0, dated: 0, undated: 0, oldest: null, newest: null, oldestDays: null, level: "empty" });
  });
  it("does not count a future date as stale or as fresh", () => {
    const f = computeFreshness([at(-10)], TODAY);
    expect(f.staleRecords).toBe(0);
    expect(f.buckets.future).toBe(1);
    expect(f.level).toBe("recent");
  });
  it("does not depend on the order of the records", () => {
    const list = [at(3), at(70), at(500), at(null)];
    expect(computeFreshness([...list].reverse(), TODAY)).toEqual(computeFreshness(list, TODAY));
  });
});

describe("level", () => {
  const level = (items: ReturnType<typeof at>[]): FreshnessLevel => computeFreshness(items, TODAY).level;
  it("is no-dates when records exist but none is dated", () => expect(level([at(null), at(null)])).toBe("no-dates"));
  it("is recent when every dated record is within 90 days", () => expect(level([at(0), at(89), at(null)])).toBe("recent"));
  it("is aging when some record is older than 90 days but most are not stale", () => expect(level([at(10), at(100), at(200)])).toBe("aging"));
  it("is stale only when more than half of the dated records are past the limit", () => {
    expect(level([at(400), at(400), at(10)])).toBe("stale");
    expect(level([at(400), at(10)])).toBe("aging");
    expect(level([at(400)])).toBe("stale");
  });
});

describe("wording", () => {
  const stale = computeFreshness([at(400), at(500), at(5)], TODAY);
  const mixed = computeFreshness([at(1), at(60), at(null)], TODAY);
  it("says so plainly for the empty and undated cases", () => {
    expect(freshnessSummary(computeFreshness([], TODAY), "en")).toBe("No places in the pack on this device.");
    expect(freshnessSummary(computeFreshness([at(null)], TODAY), "en")).toContain("age is UNKNOWN");
    expect(freshnessSummary(computeFreshness([at(null)], TODAY), "fr")).toContain("UNKNOWN");
    expect(freshnessSummary(computeFreshness([at(null)], TODAY), "fr")).not.toMatch(/INCONNU/);
  });
  it("never says the data is current, even when it is recent", () => {
    const recent = freshnessSummary(computeFreshness([at(1)], TODAY), "en");
    expect(recent).toContain("not that it is still right");
    expect(recent).not.toMatch(/up to date|up-to-date|current(?!ly)/i);
    expect(freshnessSummary(computeFreshness([at(1)], TODAY), "fr")).toContain("pas qu’il est toujours exact");
  });
  it("warns in both languages when most records are old", () => {
    expect(freshnessSummary(stale, "en")).toContain("may be out of date");
    expect(freshnessSummary(stale, "fr")).toContain("peuvent être périmés");
  });
  it("lists only the buckets that have records, in age order", () => {
    expect(bucketLines(mixed, "en")).toEqual(["1 retrieved within 30 days", "1 retrieved 31 to 90 days ago"]);
    expect(bucketLines(mixed, "fr")).toEqual(["1 consultés il y a 30 jours ou moins", "1 consultés il y a 31 à 90 jours"]);
    expect(bucketLines(computeFreshness([], TODAY), "en")).toEqual([]);
  });
  it("gives the date range, or one date when all agree, or null with none", () => {
    expect(rangeLine(mixed, "en")).toBe("Retrieved between 20 September 2026 and 18 November 2026.");
    expect(rangeLine(computeFreshness([at(5), at(5)], TODAY), "en")).toBe("All retrieved 14 November 2026.");
    expect(rangeLine(computeFreshness([at(5), at(5)], TODAY), "fr")).toBe("Tous consultés le 14 novembre 2026.");
    expect(rangeLine(computeFreshness([at(null)], TODAY), "en")).toBeNull();
  });
  it("counts undated places with correct singular and plural, and says nothing when there are none", () => {
    expect(undatedLine(mixed, "en")).toBe("1 place has no usable source, so no date.");
    expect(undatedLine(computeFreshness([at(null), at(null)], TODAY), "en")).toBe("2 places have no usable source, so no date.");
    expect(undatedLine(mixed, "fr")).toBe("1 lieu n’a aucune source utilisable, donc aucune date.");
    expect(undatedLine(computeFreshness([at(null), at(null)], TODAY), "fr")).toContain("2 lieux n’ont");
    expect(undatedLine(computeFreshness([at(1)], TODAY), "en")).toBeNull();
    expect(undatedLine(computeFreshness([], TODAY), "en")).toBeNull();
  });
  it("uses French typography", () => {
    for (const line of freshnessLines(stale, "fr")) expect(line).not.toMatch(/ [:;?!]/);
  });
  it("passes the copy linter and carries no banned organisation name", () => {
    const cases = [stale, mixed, computeFreshness([], TODAY), computeFreshness([at(null)], TODAY), computeFreshness([at(1)], TODAY), computeFreshness([at(100), at(5)], TODAY)];
    for (const locale of ["en", "fr"] as const) {
      for (const f of cases) {
        for (const line of freshnessLines(f, locale)) {
          expect(lintCopy(line, locale), `${locale}: ${line}`).toEqual([]);
          expect(containsForbiddenOrg(line)).toBe(false);
        }
      }
    }
  });
});

describe("the pack shipped in this build", () => {
  it("accounts for every record", () => {
    const { places } = parsePackPlaces((JSON.parse(contentText) as { places: unknown[] }).places);
    const f = computeFreshness(places, "2026-11-19");
    expect(f.total).toBe(24);
    expect(AGE_BUCKET_IDS.reduce((n, id) => n + f.buckets[id], 0) + f.undated).toBe(24);
    expect(freshnessLines(f, "en").length).toBeGreaterThan(1);
  });
});
