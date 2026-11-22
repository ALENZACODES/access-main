import { describe, expect, it } from "vitest";
import { countLcKinds, digitsInUse, isCoordinateScanned, linesAround, scanCoordinates, scanCoordinatesFile } from "./lcScan";

const scan = (text: string) => scanCoordinatesFile({ path: "apps/web/src/x.ts", text });
const kinds = (text: string): string[] => scan(text).map((s) => s.kind);

describe("cut to a set number of decimals", () => {
  it("finds the number of decimals", () => {
    const s = scan("p.lat.toFixed(5); p.lon.toFixed(4); place.location.lat.toFixed(6);");
    expect(s.map((x) => [x.kind, x.digits])).toEqual([["fixed", 5], ["fixed", 4], ["fixed", 6]]);
  });
  it("finds longitude and latitude by their usual names, in any case", () => {
    expect(kinds("a.lng.toFixed(3); a.latitude.toFixed(3); a.longitude.toFixed(3); a.LAT.toFixed(2);")).toHaveLength(4);
  });
  it("allows an optional chain and space", () => expect(scan("p?.lat . toFixed( 5 )")[0]).toMatchObject({ kind: "fixed", digits: 5 }));
  it("finds a number of decimals that is not written in the call", () => expect(scan("p.lat.toFixed(digits)")[0]).toMatchObject({ kind: "fixed-variable", digits: 0 }));
  it("does not find toFixed on a name that is not a coordinate", () => expect(kinds("price.toFixed(2); a.latency.toFixed(1); n.toFixed(5);")).toEqual([]));
  it("finds a helper that cuts a number when a coordinate is named near it", () => expect(scan("const f = (n: number) => n.toFixed(5);\nreturn f(p.lat);")[0]).toMatchObject({ kind: "fixed", digits: 5 }));
  it("does not find a helper when no coordinate is named within two lines", () => expect(kinds("const f = (n: number) => n.toFixed(5);\n\n\n\n\nreturn f(p.lat);")).toEqual([]));
  it("does not find a call in a comment or a string", () => expect(kinds('// p.lat.toFixed(5)\nconst s = "p.lat.toFixed(5)";')).toEqual([]));
});

describe("a number written as it is", () => {
  it("finds String(), a template and a pair literal", () => {
    expect(scan("String(p.lat); `${p.lon}`; [s.point.lon, s.point.lat];").map((x) => x.detail)).toEqual(["String(p.lat)", "${p.lon}", "[s.point.lon, s.point.lat]"]);
  });
  it("does not find a name that is not a coordinate", () => expect(kinds("String(p.latency); `${p.name}`; [a.x, a.y];")).toEqual([]));
  it("does not find a pair of plain names, such as the dependencies of a hook", () => expect(kinds("useMemo(f, [lat, lon]);")).toEqual([]));
  it("does not find a pair when only one is a coordinate", () => expect(kinds("[p.lat, p.name]")).toEqual([]));
});

describe("rounded with a power of ten", () => {
  it("finds the exponent when a coordinate is near", () => expect(scan("const lat = 1;\nconst r = Math.round(n * 1e5) / 1e5;")[0]).toMatchObject({ kind: "rounded", digits: 5 }));
  it("does not find it when no coordinate is near", () => expect(kinds("const r = Math.round(n * 1e5) / 1e5;")).toEqual([]));
});

describe("lines, files and counts", () => {
  it("linesAround gives the line and the lines next to it", () => {
    const t = "a\nb\nc\nd\ne\nf";
    expect(linesAround(t, 4, 1)).toBe("b\nc\nd");
    expect(linesAround(t, 0, 1)).toBe("a\nb");
    expect(linesAround(t, 99, 1)).toBe("e\nf");
  });
  it.each([
    ["apps/web/src/a.ts", true],
    ["apps/web/src/a.tsx", true],
    ["apps/web/src/a.test.ts", false],
    ["apps/web/src/privacy/audit/x.ts", false],
    ["apps/web/src/states/placeFixtures.ts", false],
    ["apps/web/src/a.css", false],
    ["packages/x/a.ts", false],
  ])("isCoordinateScanned(%s) is %s", (path, read) => expect(isCoordinateScanned(path)).toBe(read));
  it("scanCoordinates sorts by path and line and skips files that are not read", () => {
    const s = scanCoordinates([
      { path: "apps/web/src/b.ts", text: "String(p.lat);" },
      { path: "apps/web/src/a.ts", text: "\nString(p.lat);" },
      { path: "apps/web/src/a.test.ts", text: "String(p.lat);" },
    ]);
    expect(s.map((x) => `${x.path}:${x.line}`)).toEqual(["apps/web/src/a.ts:2", "apps/web/src/b.ts:1"]);
  });
  it("countLcKinds lists every kind, with zero", () => {
    const c = countLcKinds(scan("String(p.lat); p.lat.toFixed(5);"));
    expect(c).toEqual({ fixed: 1, "fixed-variable": 0, raw: 1, rounded: 0 });
  });
  it("digitsInUse counts the sites per number of decimals, in order", () => expect([...digitsInUse(scan("a.lat.toFixed(5); a.lon.toFixed(5); a.lat.toFixed(4); String(a.lat);"))]).toEqual([[4, 1], [5, 2]]));
});
