import { describe, expect, it } from "vitest";
import { POINT_STYLES, formatPointAs, splitDm, splitDms } from "./pointFormat";
import { readPoint } from "./pointRead";
import { lintFrench } from "./typography";

describe("splitDms carries instead of writing 60", () => {
  it("splits plain values", () => {
    expect(splitDms(43.65)).toEqual({ deg: 43, min: 39, sec: 0 });
    expect(splitDms(0)).toEqual({ deg: 0, min: 0, sec: 0 });
    expect(splitDms(10.5)).toEqual({ deg: 10, min: 30, sec: 0 });
  });
  it("ignores the sign, which the letter carries", () => {
    expect(splitDms(-43.65)).toEqual(splitDms(43.65));
  });
  it("carries seconds into minutes", () => {
    expect(splitDms(43 + 59 / 60 + 59.999 / 3600)).toEqual({ deg: 44, min: 0, sec: 0 });
  });
  it("carries minutes into degrees", () => {
    expect(splitDms(43.99999999)).toEqual({ deg: 44, min: 0, sec: 0 });
  });
  it("keeps the requested number of second decimals", () => {
    expect(splitDms(43 + 39 / 60 + 1.234 / 3600, 3)).toEqual({ deg: 43, min: 39, sec: 1.234 });
    expect(splitDms(43 + 39 / 60 + 1.234 / 3600, 0)).toEqual({ deg: 43, min: 39, sec: 1 });
  });
  it("never gives 60 for minutes or seconds over a sweep of 5000 values", () => {
    for (let i = 0; i < 5000; i++) {
      const v = (i * 0.0173) % 180;
      const r = splitDms(v);
      expect(r.min).toBeLessThan(60);
      expect(r.sec).toBeLessThan(60);
      expect(Number.isInteger(r.deg) && Number.isInteger(r.min)).toBe(true);
    }
  });
  it("is within a hundredth of a second of the value", () => {
    for (let i = 0; i < 2000; i++) {
      const v = (i * 0.0913) % 180;
      const r = splitDms(v);
      expect(Math.abs(r.deg + r.min / 60 + r.sec / 3600 - v)).toBeLessThan(0.005 / 3600 + 1e-9);
    }
  });
});

describe("splitDm carries instead of writing 60", () => {
  it("splits plain values", () => {
    expect(splitDm(43.65)).toEqual({ deg: 43, min: 39 });
    expect(splitDm(79.38)).toEqual({ deg: 79, min: 22.8 });
  });
  it("ignores the sign", () => {
    expect(splitDm(-79.38)).toEqual(splitDm(79.38));
  });
  it("carries minutes into degrees", () => {
    expect(splitDm(43.9999999)).toEqual({ deg: 44, min: 0 });
  });
  it("keeps the requested minute decimals", () => {
    expect(splitDm(43.65123, 2)).toEqual({ deg: 43, min: 39.07 });
    expect(splitDm(43.65123, 0)).toEqual({ deg: 43, min: 39 });
  });
  it("never gives 60 over a sweep of 5000 values", () => {
    for (let i = 0; i < 5000; i++) expect(splitDm((i * 0.0317) % 180).min).toBeLessThan(60);
  });
});

describe("the edges of the map", () => {
  const corners = [
    { lat: 90, lon: 180 },
    { lat: 90, lon: -180 },
    { lat: -90, lon: 180 },
    { lat: -90, lon: -180 },
    { lat: 0, lon: 0 },
    { lat: 0.00001, lon: -0.00001 },
    { lat: -0.00001, lon: 0.00001 },
  ];
  for (const c of corners) {
    for (const style of POINT_STYLES) {
      it(`writes ${c.lat}, ${c.lon} as ${style} and reads it back`, () => {
        for (const locale of ["en", "fr"] as const) {
          const text = formatPointAs(c, style, locale);
          const r = readPoint(text);
          expect(r.status, text).toBe("ok");
          if (r.status === "ok") {
            expect(Math.abs(r.point.lat - c.lat)).toBeLessThan(2e-5);
            expect(Math.abs(r.point.lon - c.lon)).toBeLessThan(2e-5);
          }
        }
      });
    }
  }
  it("writes 90 degrees north with no carry past the pole", () => {
    expect(formatPointAs({ lat: 90, lon: 0 }, "dms", "en")).toBe("90° 0′ 0.00″ N, 0° 0′ 0.00″ E");
    expect(formatPointAs({ lat: -90, lon: -180 }, "dm", "en")).toBe("90° 0.0000′ S, 180° 0.0000′ W");
  });
  it("writes a tiny negative value as the south letter, not as zero south", () => {
    expect(formatPointAs({ lat: -0.00001, lon: 0 }, "hemisphere", "en")).toBe("0.00001° S, 0.00000° E");
  });
  it("writes a value that rounds to zero without a minus in the decimal style", () => {
    expect(formatPointAs({ lat: 0, lon: 0 }, "decimal", "en")).toBe("0.00000, 0.00000");
  });
});

describe("French output", () => {
  const p = { lat: 45.5017, lon: -73.5673 };
  it("is clean French typography in every written style (a link is not prose)", () => {
    for (const style of ["decimal", "hemisphere", "dm", "dms"] as const) expect(lintFrench(formatPointAs(p, style, "fr")), style).toEqual([]);
  });
  it("keeps the narrow no-break space before the semicolon in three styles", () => {
    for (const style of ["decimal", "hemisphere", "dm", "dms"] as const) {
      expect(formatPointAs(p, style, "fr"), style).toContain("\u202f; ");
    }
  });
  it("writes a geo link the same in both languages, because it is a link", () => {
    expect(formatPointAs(p, "geo", "fr")).toBe(formatPointAs(p, "geo", "en"));
    expect(formatPointAs(p, "geo", "fr")).not.toContain(",  ");
  });
  it("writes O for ouest and E for est", () => {
    expect(formatPointAs(p, "hemisphere", "fr")).toMatch(/ O$/);
    expect(formatPointAs({ lat: 45, lon: 73 }, "hemisphere", "fr")).toMatch(/ E$/);
  });
  it("never writes a decimal point in French, apart from in the geo link", () => {
    for (const style of ["decimal", "hemisphere", "dm", "dms"] as const) expect(formatPointAs(p, style, "fr"), style).not.toMatch(/\d\.\d/);
  });
  it("never writes a decimal comma in English", () => {
    for (const style of POINT_STYLES) expect(formatPointAs(p, style, "en"), style).not.toMatch(/\d,\d/);
  });
});

describe("what is written is plain text", () => {
  it("has no irregular spaces except the one narrow space before a French semicolon", () => {
    const bad = new RegExp("[" + ["00a0", "2007", "2009", "200a", "2028", "2029", "feff"].map((h) => String.fromCharCode(parseInt(h, 16))).join("") + "]");
    for (const style of POINT_STYLES) {
      for (const locale of ["en", "fr"] as const) expect(bad.test(formatPointAs({ lat: 43.65, lon: -79.38 }, style, locale)), `${style} ${locale}`).toBe(false);
    }
  });
  it("has no leading or trailing space", () => {
    for (const style of POINT_STYLES) {
      const s = formatPointAs({ lat: 43.65, lon: -79.38 }, style, "fr");
      expect(s).toBe(s.trim());
    }
  });
});
