import { describe, expect, it } from "vitest";
import { OPEN_LICENCES, STALE_AFTER_DAYS, ageLabel, attributionLine, daysBetween, formatDate, isIsoDate, isOpenLicence, isStale, validateProvenance } from "./provenance";
import { DataAuditError, assertPlacesClean, auditPlaces, type DataViolationCode } from "./dataAudit";
import { FEATURE_IDS } from "./dataStatus";
import { computeCoverage, coverageRouteView, formatPercent } from "./coverage";
import { initialConnectivity } from "./offline";
import { lcg } from "./placeFixtures";
import { PROV, TODAY, mkRecord } from "./testHelpers";
import { lintCopy } from "./copyLint";

const addDays = (iso: string, n: number): string => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n)).toISOString().slice(0, 10);

describe("isIsoDate", () => {
  it("accepts real dates, including leap days", () => {
    for (const d of ["2026-11-21", "2024-02-29", "2000-02-29", "1999-12-31", "2026-01-01"]) expect(isIsoDate(d), d).toBe(true);
  });
  it("rejects dates that do not exist", () => {
    for (const d of ["2026-02-29", "1900-02-29", "2026-04-31", "2026-13-01", "2026-00-10", "2026-01-00", "2026-01-32"]) expect(isIsoDate(d), d).toBe(false);
  });
  it("rejects text that is not exactly YYYY-MM-DD", () => {
    for (const d of ["2026-1-1", "26-01-01", "2026/01/01", " 2026-01-01", "2026-01-01 ", "2026-01-01T00:00:00Z", "", "today", "20260101"]) expect(isIsoDate(d), JSON.stringify(d)).toBe(false);
  });
  it("rejects values that are not text", () => {
    for (const d of [undefined, null, 20260101, {}, [], new Date()]) expect(isIsoDate(d)).toBe(false);
  });
});

describe("daysBetween", () => {
  it("counts whole days, across months, years and leap days", () => {
    expect(daysBetween("2026-11-01", "2026-11-21")).toBe(20);
    expect(daysBetween("2025-12-31", "2026-01-01")).toBe(1);
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
    expect(daysBetween("2025-02-28", "2025-03-01")).toBe(1);
    expect(daysBetween("2025-11-21", "2026-11-21")).toBe(365);
    expect(daysBetween("2023-11-21", "2024-11-21")).toBe(366);
  });
  it("is zero for the same day and negative for an earlier end", () => {
    expect(daysBetween("2026-11-21", "2026-11-21")).toBe(0);
    expect(daysBetween("2026-11-21", "2026-11-20")).toBe(-1);
  });
  it("is the negative of the reverse, and adds up over a path", () => {
    const rnd = lcg(7);
    for (let i = 0; i < 100; i++) {
      const a = addDays("2020-01-01", Math.floor(rnd() * 3000));
      const b = addDays("2020-01-01", Math.floor(rnd() * 3000));
      const c = addDays("2020-01-01", Math.floor(rnd() * 3000));
      expect(daysBetween(a, b)).toBe(-daysBetween(b, a));
      expect(daysBetween(a, c)).toBe(daysBetween(a, b) + daysBetween(b, c));
    }
  });
  it("is not moved by daylight saving, as it counts in UTC", () => {
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetween("2026-11-01", "2026-11-02")).toBe(1);
  });
  it("agrees with a day-by-day walk", () => {
    for (const n of [0, 1, 30, 364, 365, 366, 1000]) expect(daysBetween("2024-01-01", addDays("2024-01-01", n))).toBe(n);
  });
});

describe("isStale", () => {
  it("is false up to and including a year, and true after", () => {
    expect(isStale(addDays(TODAY, -STALE_AFTER_DAYS), TODAY)).toBe(false);
    expect(isStale(addDays(TODAY, -STALE_AFTER_DAYS - 1), TODAY)).toBe(true);
    expect(isStale(TODAY, TODAY)).toBe(false);
  });
  it("is false for a date in the future, which is a different problem", () => expect(isStale(addDays(TODAY, 5), TODAY)).toBe(false));
});

describe("formatDate", () => {
  it("writes the month in each language", () => {
    expect(formatDate("2026-11-21", "en")).toBe("21 November 2026");
    expect(formatDate("2026-11-21", "fr")).toBe("21 novembre 2026");
  });
  it("writes the first of the month as 1er in French only", () => {
    expect(formatDate("2026-03-01", "fr")).toBe("1er mars 2026");
    expect(formatDate("2026-03-01", "en")).toBe("1 March 2026");
    expect(formatDate("2026-03-11", "fr")).toBe("11 mars 2026");
  });
  it("names all twelve months, none empty, in both languages", () => {
    for (const l of ["en", "fr"] as const) {
      const names = Array.from({ length: 12 }, (_, i) => formatDate(`2026-${String(i + 1).padStart(2, "0")}-15`, l).split(" ")[1]!);
      expect(new Set(names).size, l).toBe(12);
      for (const n of names) expect(n.length).toBeGreaterThan(2);
    }
  });
  it("gives back text that is not a date, unchanged", () => {
    for (const s of ["soon", "2026-02-30", ""]) expect(formatDate(s, "en")).toBe(s);
  });
});

describe("ageLabel and attributionLine", () => {
  it("says retrieved, never current, for every age", () => {
    for (const n of [-3, 0, 1, 2, 30, 400]) for (const l of ["en", "fr"] as const) {
      const s = ageLabel(addDays(TODAY, -n), TODAY, l);
      expect(s.toLowerCase(), s).not.toMatch(/current|à jour|up to date|latest|récent/);
      expect(lintCopy(s, l), s).toEqual([]);
    }
  });
  it("says one day and several days correctly", () => {
    expect(ageLabel(addDays(TODAY, -1), TODAY, "en")).toBe("Retrieved 1 day ago");
    expect(ageLabel(addDays(TODAY, -2), TODAY, "en")).toBe("Retrieved 2 days ago");
    expect(ageLabel(addDays(TODAY, -1), TODAY, "fr")).toBe("Consulté il y a 1 jour");
    expect(ageLabel(addDays(TODAY, -9), TODAY, "fr")).toBe("Consulté il y a 9 jours");
    expect(ageLabel(TODAY, TODAY, "en")).toBe("Retrieved today");
  });
  it("flags a date in the future", () => expect(ageLabel(addDays(TODAY, 1), TODAY, "en")).toBe("Date in the future"));
  it("names the source, the licence and the date", () => {
    for (const id of Object.keys(OPEN_LICENCES) as (keyof typeof OPEN_LICENCES)[]) {
      const s = attributionLine({ source: "A source", licence: id, retrievedOn: "2026-10-01" }, "en");
      expect(s).toContain("A source");
      expect(s).toContain(OPEN_LICENCES[id]);
      expect(s).toContain("1 October 2026");
    }
  });
  it("puts the French colon rule into the label words", () => {
    const s = attributionLine({ source: "S", licence: "ODbL-1.0", retrievedOn: "2026-10-01" }, "fr");
    expect(s).toContain("Source : S");
    expect(s).toContain("Licence :");
    expect(s).toContain("Consulté le 1er octobre 2026");
  });
});

describe("validateProvenance", () => {
  it("accepts every open licence", () => {
    for (const licence of Object.keys(OPEN_LICENCES)) expect(validateProvenance({ source: "S", licence, retrievedOn: "2026-10-01" }).ok, licence).toBe(true);
  });
  it("rejects every licence that is not on the list, including names that only look right", () => {
    for (const licence of ["", "MIT", "cc-by-4.0", "CC-BY-4.0 ", "All rights reserved", "toString", "__proto__", "constructor", undefined, null, 4]) {
      expect(validateProvenance({ source: "S", licence, retrievedOn: "2026-10-01" }), String(licence)).toEqual({ ok: false, reason: "licence-not-open" });
    }
  });
  it("rejects a source that is empty or only spaces", () => {
    for (const source of ["", "  ", "\t", undefined, 3]) expect(validateProvenance({ source, licence: "ODbL-1.0", retrievedOn: "2026-10-01" })).toEqual({ ok: false, reason: "missing-source" });
  });
  it("allows an https address only", () => {
    const base = { source: "S", licence: "ODbL-1.0", retrievedOn: "2026-10-01" };
    expect(validateProvenance({ ...base, url: "https://a.example/x?y=1" }).ok).toBe(true);
    for (const url of ["http" + "://a.example", "ftp://a.example", "//a.example", "https://", "https://a b", "javascript:alert(1)", "", 3, null]) expect(validateProvenance({ ...base, url }), String(url)).toEqual({ ok: false, reason: "bad-url" });
  });
  it("reports the first problem in a fixed order: source, licence, date, address", () => {
    expect(validateProvenance({ source: "", licence: "x", retrievedOn: "x", url: "x" })).toEqual({ ok: false, reason: "missing-source" });
    expect(validateProvenance({ source: "S", licence: "x", retrievedOn: "x", url: "x" })).toEqual({ ok: false, reason: "licence-not-open" });
    expect(validateProvenance({ source: "S", licence: "ODbL-1.0", retrievedOn: "x", url: "x" })).toEqual({ ok: false, reason: "bad-date" });
  });
  it("rejects anything that is not an object", () => {
    for (const v of [null, undefined, "x", 1, true]) expect(validateProvenance(v)).toEqual({ ok: false, reason: "not-an-object" });
  });
  it("does not keep fields it was not asked for", () => {
    const r = validateProvenance({ source: "S", licence: "ODbL-1.0", retrievedOn: "2026-10-01", secret: "x" });
    expect(r.ok && Object.keys(r.value).sort()).toEqual(["licence", "retrievedOn", "source"]);
  });
  it("recognises open licences with isOpenLicence", () => {
    expect(isOpenLicence("ODbL-1.0")).toBe(true);
    for (const v of ["hasOwnProperty", "", null, 1]) expect(isOpenLicence(v)).toBe(false);
  });
});

describe("auditPlaces over generated records", () => {
  const VALUES = ["yes", "no", "partial", "unknown"] as const;
  const rnd = lcg(99);
  const records = Array.from({ length: 60 }, (_, i) => ({
    name: `P${i}`,
    features: FEATURE_IDS.filter(() => rnd() < 0.5).map((feature) => {
      const value = VALUES[Math.floor(rnd() * 4)]!;
      return value === "unknown" ? { feature, value } : { feature, value, provenance: { ...PROV, retrievedOn: addDays(TODAY, -Math.floor(rnd() * 600)) } };
    }),
  }));
  it("finds no error in records built to be right, and a warning for every stale reported value", () => {
    const r = auditPlaces(records, TODAY);
    expect(r.errors).toBe(0);
    expect(r.ok).toBe(true);
    const stale = records.flatMap((p) => p.features).filter((f) => f.value !== "unknown" && f.provenance && isStale(f.provenance.retrievedOn, TODAY)).length;
    expect(r.warnings).toBe(stale);
    expect(r.violations.every((v) => v.code === "stale-detail" && v.severity === "warning")).toBe(true);
  });
  it("points each violation at the record's position, name and feature", () => {
    const r = auditPlaces(records, TODAY);
    for (const v of r.violations) {
      expect(records[v.index]!.name).toBe(v.place);
      expect(FEATURE_IDS).toContain(v.feature);
    }
  });
  it("finds exactly the one fault planted in each of many records", () => {
    const plant: [string, (f: Record<string, unknown>) => void, DataViolationCode][] = [
      ["licence", (f) => { f.provenance = { ...PROV, licence: "Proprietary" }; }, "licence-not-open"],
      ["date", (f) => { f.provenance = { ...PROV, retrievedOn: "2026-99-99" }; }, "bad-date"],
      ["future", (f) => { f.provenance = { ...PROV, retrievedOn: addDays(TODAY, 3) }; }, "future-date"],
      ["source", (f) => { delete f.provenance; }, "missing-provenance"],
      ["value", (f) => { f.value = "maybe"; }, "bad-value"],
    ];
    for (const [label, mutate, code] of plant) {
      const copy = JSON.parse(JSON.stringify(records)) as typeof records;
      const target = copy.find((p) => p.features.some((f) => f.value !== "unknown"))!;
      mutate(target.features.find((f) => f.value !== "unknown") as unknown as Record<string, unknown>);
      const errs = auditPlaces(copy, TODAY).violations.filter((v) => v.severity === "error");
      expect(errs.map((v) => v.code), label).toEqual([code]);
    }
  });
  it("leaves out the date checks when today is not a date, rather than guessing", () => {
    const r = auditPlaces([{ name: "A", features: [{ feature: "elevator", value: "yes", provenance: { ...PROV, retrievedOn: "1990-01-01" } }] }], "not a date");
    expect(r.violations).toEqual([]);
  });
  it("skips a UNKNOWN value without needing a source", () => {
    expect(auditPlaces([{ name: "A", features: [{ feature: "elevator", value: "unknown" }, { feature: "automatic-door" }, { feature: "level-path", value: null }] }], TODAY).ok).toBe(true);
  });
  it("counts an item that is not an object once, and carries on with the next", () => {
    const r = auditPlaces([1, "x", null, { name: "A", features: [] }], TODAY);
    expect(r.violations.map((v) => v.index)).toEqual([0, 1, 2]);
    expect(r.errors).toBe(3);
  });
  it("assertPlacesClean returns the result when clean, even with warnings, and throws with every error when not", () => {
    expect(assertPlacesClean(records, TODAY).ok).toBe(true);
    try {
      assertPlacesClean([{ name: "", features: [] }, { name: "B" }], TODAY);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(DataAuditError);
      const err = e as DataAuditError;
      expect(err.name).toBe("DataAuditError");
      expect(err.result.errors).toBe(2);
      expect(err.message).toContain("2 error(s)");
      expect(err.message).toContain("#0 ?/- missing-name");
      expect(err.message).toContain("#1 B/- features-not-array");
    }
  });
});

describe("computeCoverage over generated records", () => {
  const rnd = lcg(5);
  const places = Array.from({ length: 80 }, (_, i) => {
    const spec: Record<string, "yes" | "no" | "partial" | "unknown"> = {};
    for (const f of FEATURE_IDS) if (rnd() < 0.4) spec[f] = (["yes", "no", "partial", "unknown"] as const)[Math.floor(rnd() * 4)]!;
    return mkRecord(`id${i}`, `P${i}`, spec, rnd() < 0.5 ? { lat: 43 + rnd(), lon: -79 - rnd(), provenance: PROV } : undefined);
  });
  const c = computeCoverage(places, TODAY);
  it("adds up for every feature", () => {
    for (const f of c.features) expect(f.yes + f.no + f.partial + f.unknown, f.feature).toBe(places.length);
  });
  it("gives a percentage that is the rounded share of reported values", () => {
    for (const f of c.features) expect(f.reportedPercent, f.feature).toBe(Math.round((100 * (f.yes + f.no + f.partial)) / places.length));
  });
  it("splits places into located and not, with nothing lost", () => expect(c.located + c.unlocated).toBe(places.length));
  it("gives the same answer twice and for a reversed list", () => {
    expect(computeCoverage(places, TODAY)).toEqual(c);
    expect(computeCoverage([...places].reverse(), TODAY)).toEqual(c);
  });
  it("counts a value with no source as UNKNOWN, never as reported", () => {
    const bare = [{ id: "x", name: "X", features: [{ feature: "elevator", value: "yes" }] }] as never;
    expect(computeCoverage(bare, TODAY).features.find((f) => f.feature === "elevator")).toMatchObject({ yes: 0, unknown: 1, reportedPercent: 0 });
  });
});

describe("formatPercent and coverageRouteView", () => {
  it("puts a no-break space before the percent sign in French only", () => {
    expect(formatPercent(75, "en")).toBe("75%");
    expect(formatPercent(75, "fr")).toBe("75 %");
  });
  it("shows an empty list as an empty state with the dropped count, and no table", () => {
    for (const l of ["en", "fr"] as const) {
      const v = coverageRouteView({ status: "ok", places: [], dropped: 3 }, { locale: l, connectivity: initialConnectivity(true), today: TODAY });
      expect(v.kind).toBe("empty");
      if (v.kind === "empty") expect(v.lines).toHaveLength(1);
    }
    const none = coverageRouteView({ status: "ok", places: [] }, { locale: "en", connectivity: initialConnectivity(true), today: TODAY });
    expect(none.kind === "empty" && none.lines).toEqual([]);
  });
  it("shows a table with a row for every feature and copy that passes the lint", () => {
    const places = [mkRecord("a", "A", { elevator: "yes" }), mkRecord("b", "B", {})];
    for (const l of ["en", "fr"] as const) {
      const v = coverageRouteView({ status: "ok", places, dropped: 1 }, { locale: l, connectivity: initialConnectivity(true), today: TODAY });
      expect(v.kind).toBe("table");
      if (v.kind !== "table") continue;
      expect(v.rows.map((r) => r.feature)).toEqual([...FEATURE_IDS]);
      for (const s of [v.heading, v.intro, v.caption, ...v.lines, ...Object.values(v.headers), ...v.rows.map((r) => r.label)]) expect(lintCopy(s, l), s).toEqual([]);
    }
  });
  it("turns a failed load into an error view that depends on the connection and status", () => {
    const online = coverageRouteView({ status: "error", httpStatus: 500 }, { locale: "en", connectivity: initialConnectivity(true), today: TODAY });
    const offline = coverageRouteView({ status: "error", httpStatus: 500 }, { locale: "en", connectivity: initialConnectivity(false), today: TODAY });
    expect(online.kind).toBe("error");
    expect(offline.kind).toBe("error");
    expect(JSON.stringify(online)).not.toBe(JSON.stringify(offline));
  });
});
