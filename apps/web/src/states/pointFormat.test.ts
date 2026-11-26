import { describe, expect, it } from "vitest";
import { POINT_STYLES, formatPointAs, isPointStyle, splitDm, splitDms } from "./pointFormat";
import { distanceMetres } from "./packGeo";
import { lcg } from "./placeFixtures";
import { readPoint } from "./pointRead";

const P = { lat: 43.65, lon: -79.38 };

describe("styles", () => {
  it("are five and recognised only by name", () => {
    expect([...POINT_STYLES]).toEqual(["decimal", "hemisphere", "dm", "dms", "geo"]);
    for (const s of POINT_STYLES) expect(isPointStyle(s)).toBe(true);
    for (const v of ["", "DMS", "degrees", null, 3]) expect(isPointStyle(v)).toBe(false);
  });
});

describe("formatPointAs in English", () => {
  it("writes each style", () => {
    expect(formatPointAs(P, "decimal", "en")).toBe("43.65000, -79.38000");
    expect(formatPointAs(P, "hemisphere", "en")).toBe("43.65000° N, 79.38000° W");
    expect(formatPointAs(P, "dm", "en")).toBe("43° 39.0000′ N, 79° 22.8000′ W");
    expect(formatPointAs(P, "dms", "en")).toBe("43° 39′ 0.00″ N, 79° 22′ 48.00″ W");
    expect(formatPointAs(P, "geo", "en")).toBe("geo:43.65000,-79.38000");
  });
  it("uses S and E for the other hemispheres", () => {
    const s = { lat: -33.8688, lon: 151.2093 };
    expect(formatPointAs(s, "hemisphere", "en")).toBe("33.86880° S, 151.20930° E");
    expect(formatPointAs(s, "decimal", "en")).toBe("-33.86880, 151.20930");
  });
  it("writes zero as north and east", () => {
    expect(formatPointAs({ lat: 0, lon: 0 }, "hemisphere", "en")).toBe("0.00000° N, 0.00000° E");
  });
});

describe("formatPointAs in French", () => {
  it("uses a decimal comma, a narrow space before the semicolon and O for ouest", () => {
    expect(formatPointAs(P, "decimal", "fr")).toBe("43,65000\u202f; -79,38000");
    expect(formatPointAs(P, "hemisphere", "fr")).toBe("43,65000° N\u202f; 79,38000° O");
    expect(formatPointAs(P, "dm", "fr")).toBe("43° 39,0000′ N\u202f; 79° 22,8000′ O");
    expect(formatPointAs(P, "geo", "fr")).toBe("geo:43.65000,-79.38000");
  });
});

describe("carrying", () => {
  it("never writes 60 seconds or 60 minutes", () => {
    expect(splitDms(43.99999999)).toEqual({ deg: 44, min: 0, sec: 0 });
    expect(splitDms(43 + 59 / 60 + 59.999 / 3600)).toEqual({ deg: 44, min: 0, sec: 0 });
    expect(splitDms(43 + 59 / 60 + 59.994 / 3600)).toEqual({ deg: 43, min: 59, sec: 59.99 });
    expect(splitDm(43.99999999)).toEqual({ deg: 44, min: 0 });
    expect(splitDm(43 + 59.99996 / 60)).toEqual({ deg: 44, min: 0 });
  });
  it("splits exact values exactly", () => {
    expect(splitDms(10.5)).toEqual({ deg: 10, min: 30, sec: 0 });
    expect(splitDm(10.5)).toEqual({ deg: 10, min: 30 });
    expect(splitDms(-10.5)).toEqual({ deg: 10, min: 30, sec: 0 });
    expect(splitDms(0)).toEqual({ deg: 0, min: 0, sec: 0 });
  });
  it("a point just under a whole degree is written with the degree carried", () => {
    const text = formatPointAs({ lat: 43.9999999, lon: -79.0000001 }, "dms", "en");
    expect(text).toBe("44° 0′ 0.00″ N, 79° 0′ 0.00″ W");
  });
});

describe("reading back what is written", () => {
  const next = lcg(2026);
  const points = Array.from({ length: 300 }, () => ({ lat: (next() - 0.5) * 180, lon: (next() - 0.5) * 360 }));
  for (const style of POINT_STYLES) {
    for (const locale of ["en", "fr"] as const) {
      it(`${style} in ${locale}: every point is read back within a metre or two`, () => {
        for (const p of points) {
          const text = formatPointAs(p, style, locale);
          const r = readPoint(text);
          expect(r.status, text).toBe("ok");
          if (r.status === "ok") expect(distanceMetres(p, r.point), text).toBeLessThan(2.5);
        }
      });
    }
  }
  it("round numbers read back exactly", () => {
    for (const style of POINT_STYLES) expect((readPoint(formatPointAs(P, style, "en")) as { point: typeof P }).point).toEqual(P);
  });
  it("the edges of the map read back", () => {
    for (const p of [{ lat: 90, lon: 180 }, { lat: -90, lon: -180 }, { lat: 0, lon: 0 }, { lat: 89.99999, lon: -179.99999 }]) {
      for (const style of POINT_STYLES) {
        const r = readPoint(formatPointAs(p, style, "en"));
        expect(r.status, `${style} ${JSON.stringify(p)}`).toBe("ok");
      }
    }
  });
  it("names the format it was written in", () => {
    const formats: Record<string, string> = { decimal: "decimal", hemisphere: "hemisphere", dm: "dm", dms: "dms", geo: "geo-link" };
    for (const style of POINT_STYLES) expect((readPoint(formatPointAs(P, style, "en")) as { format: string }).format).toBe(formats[style]);
  });
});
