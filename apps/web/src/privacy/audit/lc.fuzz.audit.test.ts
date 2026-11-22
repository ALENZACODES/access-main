// Robustness audit for the coordinate scanner and the text finder. Whatever the text, they must not throw; every site
// must lie inside the file; a write made in a known way must be found once, in the right kind; a comparison of the
// findings with rows built from them is clean; and a coordinate cut to n decimals is read back with n digits.

import { describe, expect, it } from "vitest";
import { genString, mutateText } from "./fuzz/gen";
import { assertProperty, shrinkString } from "./fuzz/property";
import { auditCoordinates, compareCoordinates, countLcFindings, type LcAcceptRow } from "./lcRules";
import { LC_KINDS, scanCoordinatesFile } from "./lcScan";
import { findCoordinates, maxDigits, resolutionMetres } from "./lcText";

const SAMPLES = [
  "const s = p.lat.toFixed(5);",
  "return `geo:${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;",
  "cells.push(String(p.location.lat), String(p.location.lon));",
  "const r = Math.round(lat * 1e5) / 1e5;",
  "coordinates: [s.point.lon, s.point.lat],",
  "const text = '43.12345, -79.98765';",
];

const WRITTEN: ReadonlyArray<[string, string]> = [
  ["a.lat.toFixed(3);", "fixed"],
  ["String(a.lon);", "raw"],
  ["`${a.lat}`;", "raw"],
  ["[a.lon, a.lat];", "raw"],
];

describe("scanCoordinatesFile on any text", () => {
  it("does not throw and keeps every site inside the file", () => {
    assertProperty({
      name: "scan of mutated source",
      runs: 400,
      gen: (rng) => (rng.bool(0.3) ? genString(rng, 200) : mutateText(rng, mutateText(rng, rng.pick(SAMPLES)))),
      shrink: shrinkString,
      prop: (text) => {
        const sites = scanCoordinatesFile({ path: "apps/web/src/x.ts", text });
        const lines = text.split("\n").length;
        for (const s of sites) {
          expect(LC_KINDS).toContain(s.kind);
          expect(s.line).toBeGreaterThanOrEqual(1);
          expect(s.line).toBeLessThanOrEqual(lines);
          expect(Number.isInteger(s.digits)).toBe(true);
        }
      },
    });
  });
  it("finds each write made in a known way once, in the right kind", () => {
    assertProperty({
      name: "known writes",
      runs: 200,
      gen: (rng) => Array.from({ length: rng.int(1, 8) }, () => rng.pick(WRITTEN)),
      prop: (items) => {
        const text = items.map(([t]) => t).join("\n");
        const sites = scanCoordinatesFile({ path: "apps/web/src/x.ts", text });
        expect(sites).toHaveLength(items.length);
        for (const kind of ["fixed", "raw"]) expect(sites.filter((x) => x.kind === kind)).toHaveLength(items.filter(([, k]) => k === kind).length);
      },
    });
  });
});

describe("findings and rows", () => {
  it("rows built from the findings of a file match them, and one fewer does not", () => {
    assertProperty({
      name: "compare with own rows",
      runs: 200,
      gen: (rng) => Array.from({ length: rng.int(0, 8) }, () => rng.pick(["String(a.lat);", "[a.lon, a.lat];", "a.lat.toFixed(7);", "a.lat.toFixed(2);"])).join("\n"),
      prop: (text) => {
        const findings = auditCoordinates(scanCoordinatesFile({ path: "apps/web/src/x.ts", text }));
        const rows: LcAcceptRow[] = countLcFindings(findings).map((c) => ({ ...c, reason: "x" }));
        expect(compareCoordinates(findings, rows)).toEqual([]);
        if (rows.length > 0) expect(compareCoordinates(findings, rows.slice(1))).not.toEqual([]);
        if (findings.length > 0) expect(compareCoordinates(findings.slice(1), rows)).not.toEqual([]);
      },
    });
  });
});

describe("findCoordinates", () => {
  it("does not throw on any text", () => {
    assertProperty({ name: "find in any text", runs: 400, gen: (rng) => genString(rng, 120), shrink: shrinkString, prop: (t) => { for (const m of findCoordinates(t)) expect(t.slice(m.index, m.index + m.text.length)).toBe(m.text); } });
  });
  it("reads back the digits of a geo link written with n decimals", () => {
    assertProperty({
      name: "digits round trip",
      runs: 300,
      gen: (rng) => ({ n: rng.int(2, 10), lat: rng.int(-89, 89), lon: rng.int(-179, 179), f: rng.int(1, 999999) / 1e6 }),
      prop: ({ n, lat, lon, f }) => {
        const la = (lat + (lat < 0 ? -f : f)).toFixed(n);
        const lo = (lon + (lon < 0 ? -f : f)).toFixed(n);
        expect(maxDigits(findCoordinates(`geo:${la},${lo}`))).toBe(n);
      },
    });
  });
  it("gives coarser resolution for fewer digits", () => {
    for (let d = 1; d < 9; d++) expect(resolutionMetres(d)).toBeGreaterThan(resolutionMetres(d + 1));
  });
});
