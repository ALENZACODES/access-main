import { describe, expect, it } from "vitest";
import { distanceMetres, isPoint } from "./packGeo";
import { lcg } from "./placeFixtures";
import { POINT_STYLES, formatPointAs } from "./pointFormat";
import { MAX_POINT_TEXT, normalisePointText, readPoint, type PointRead } from "./pointRead";

const PROBLEMS = new Set(["too-long", "no-numbers", "one-number", "number-count", "out-of-range", "bad-minutes", "bad-letters", "sign-and-letter", "mixed-parts", "link-no-point", "stray-text"]);
const FORMATS = new Set(["decimal", "hemisphere", "dm", "dms", "geo-link", "map-link"]);

/** A reader result must always be one of the three shapes, with a real point when it is ok. */
function wellFormed(r: PointRead, input: string): void {
  if (r.status === "none") {
    expect(input.trim(), JSON.stringify(input)).toBe("");
  } else if (r.status === "invalid") {
    expect(PROBLEMS.has(r.problem), `${r.problem} for ${JSON.stringify(input)}`).toBe(true);
  } else {
    expect(isPoint(r.point), JSON.stringify(input)).toBe(true);
    expect(FORMATS.has(r.format)).toBe(true);
    expect(typeof r.swapped).toBe("boolean");
    expect(Math.abs(r.point.lat)).toBeLessThanOrEqual(90);
    expect(Math.abs(r.point.lon)).toBeLessThanOrEqual(180);
    expect(Number.isFinite(r.point.lat) && Number.isFinite(r.point.lon)).toBe(true);
  }
}

const ALPHABET = ["0", "1", "2", "5", "9", ".", ",", ";", ":", " ", "-", "+", "N", "S", "E", "W", "O", "°", "'", "′", "″", '"', "lat", "lon", "geo:", "http://", "https://", "?", "&", "=", "#", "@", "/", "mlat", "mlon", "q", "\n", "\t", "−", "\u00a0", "e", "x", "(", ")"];

describe("the reader never throws and always answers with a known shape", () => {
  it("handles 3000 random strings from the characters a point is written with", () => {
    const rnd = lcg(20261121);
    for (let i = 0; i < 3000; i++) {
      const n = Math.floor(rnd() * 24);
      let s = "";
      for (let k = 0; k < n; k++) s += ALPHABET[Math.floor(rnd() * ALPHABET.length)];
      wellFormed(readPoint(s), s);
    }
  });
  it("handles random Unicode, including surrogates, controls and combining marks", () => {
    const rnd = lcg(77);
    for (let i = 0; i < 1500; i++) {
      const n = Math.floor(rnd() * 30);
      let s = "";
      for (let k = 0; k < n; k++) s += String.fromCharCode(Math.floor(rnd() * 0x3000));
      wellFormed(readPoint(s), s);
    }
  });
  it("handles lone surrogates and huge digit runs", () => {
    for (const s of ["\ud800", "\udfff 43.65", "9".repeat(299), `${"1".repeat(150)}.${"2".repeat(140)}`, "-".repeat(299), "0.".repeat(149)]) wellFormed(readPoint(s), s);
  });
  it("answers too-long for any text over the limit, whatever it holds", () => {
    for (const pad of ["x", "1", " ", "43.65, -79.38 "]) {
      const s = pad.repeat(Math.ceil((MAX_POINT_TEXT + 1) / pad.length) + 1);
      if (s.trim().length > MAX_POINT_TEXT) expect(readPoint(s)).toEqual({ status: "invalid", problem: "too-long" });
    }
  });
  it("accepts a point at exactly the length limit once padded with spaces inside the trim", () => {
    const s = `43.65,${" ".repeat(MAX_POINT_TEXT - 12)}-79.38`;
    expect(s.length).toBeLessThanOrEqual(MAX_POINT_TEXT);
    expect(readPoint(s).status).toBe("ok");
  });
});

describe("the reader is quick on awkward text", () => {
  const nasty = [
    "1".repeat(MAX_POINT_TEXT),
    "1 ".repeat(150),
    "1,".repeat(150),
    "N ".repeat(150),
    "1.1.1.".repeat(50),
    `${"-".repeat(140)}1`,
    "geo:" + "1,".repeat(140),
    "https://x/?" + "q=1,".repeat(70),
    "https://x/@" + "1,".repeat(140),
    "'".repeat(MAX_POINT_TEXT),
    "lat ".repeat(70),
  ];
  for (const s of nasty) {
    it(`finishes ${JSON.stringify(s.slice(0, 18))}... (${s.length} chars) well under a second`, () => {
      const t0 = performance.now();
      for (let i = 0; i < 20; i++) readPoint(s);
      expect(performance.now() - t0).toBeLessThan(1500);
    });
  }
});

describe("invariants of what is read", () => {
  const rnd = lcg(5150);
  const sample = (): { lat: number; lon: number } => ({
    lat: Math.round((rnd() * 180 - 90) * 1e5) / 1e5,
    lon: Math.round((rnd() * 360 - 180) * 1e5) / 1e5,
  });
  it("round-trips 400 random points through every style in both languages", () => {
    for (let i = 0; i < 400; i++) {
      const p = sample();
      for (const style of POINT_STYLES) {
        for (const locale of ["en", "fr"] as const) {
          const text = formatPointAs(p, style, locale);
          const r = readPoint(text);
          expect(r.status, `${locale} ${style}: ${text}`).toBe("ok");
          if (r.status === "ok") expect(distanceMetres(p, r.point), `${locale} ${style}: ${text}`).toBeLessThan(2.5);
        }
      }
    }
  });
  it("gives the same answer however the spaces and line breaks fall", () => {
    for (let i = 0; i < 100; i++) {
      const p = sample();
      const base = formatPointAs(p, "dms", "en");
      const alt = base.replace(/ /g, i % 2 ? "\u00a0" : "  ").replace(/, /, i % 3 ? " ,\n" : ",\t");
      expect(readPoint(alt)).toEqual(readPoint(base));
    }
  });
  it("gives the same answer for upper and lower case letters", () => {
    for (let i = 0; i < 100; i++) {
      const base = formatPointAs(sample(), "hemisphere", "en");
      expect(readPoint(base.toLowerCase())).toEqual(readPoint(base));
    }
  });
  it("gives the same answer with or without the hemisphere words spelled out", () => {
    const pairs: Array<[string, string]> = [
      ["43.65 north, 79.38 west", "43.65 N, 79.38 W"],
      ["33.87 south 151.21 east", "33.87 S 151.21 E"],
      ["45.5 nord, 73.6 ouest", "45.5 N, 73.6 W"],
      ["34 sud 18 est", "34 S 18 E"],
    ];
    for (const [a, b] of pairs) expect(readPoint(a), a).toEqual(readPoint(b));
  });
  it("normalising twice is the same as once", () => {
    const rnd2 = lcg(9);
    for (let i = 0; i < 500; i++) {
      let s = "";
      for (let k = 0; k < 20; k++) s += ALPHABET[Math.floor(rnd2() * ALPHABET.length)];
      const once = normalisePointText(s);
      expect(normalisePointText(once)).toBe(once);
    }
  });
  it("never reads a point that is outside the world", () => {
    for (let i = 0; i < 2000; i++) {
      const a = (rnd() * 800 - 400).toFixed(3);
      const b = (rnd() * 800 - 400).toFixed(3);
      const r = readPoint(`${a}, ${b}`);
      wellFormed(r, `${a}, ${b}`);
      if (r.status === "ok") {
        expect(Math.abs(r.point.lat)).toBeLessThanOrEqual(90);
        expect(Math.abs(r.point.lon)).toBeLessThanOrEqual(180);
      }
    }
  });
  it("swaps only when the first number cannot be a latitude and the second can", () => {
    for (let i = 0; i < 1500; i++) {
      const a = Math.round((rnd() * 360 - 180) * 100) / 100;
      const b = Math.round((rnd() * 360 - 180) * 100) / 100;
      const r = readPoint(`${a}, ${b}`);
      if (r.status !== "ok") continue;
      const expectSwap = Math.abs(a) > 90 && Math.abs(b) <= 90;
      expect(r.swapped, `${a}, ${b}`).toBe(expectSwap);
      if (expectSwap) expect(r.point).toEqual({ lat: b, lon: a });
      else expect(r.point).toEqual({ lat: a, lon: b });
    }
  });
});

describe("a link is read for its numbers, never for its host or path words", () => {
  it("does not take a point from a host that looks like numbers", () => {
    for (const u of ["https://192.168.1.1/", "https://10.0.0.5:8080/path", "https://1.2.3.4/x?y=1", "http://127.0.0.1/", "https://example.org/43.65/-79.38"]) {
      expect(readPoint(u), u).toEqual({ status: "invalid", problem: "link-no-point" });
    }
  });
  it("reads the same point from a link whatever the host is", () => {
    const hosts = ["map.example.org", "maps.invalid", "a.b.c.d.example", "localhost.test", "xn--bcher-kva.example"];
    const results = hosts.map((h) => readPoint(`https://${h}/place/@43.6532,-79.3832,15z`));
    for (const r of results) expect(r).toEqual(results[0]);
    expect(results[0]).toMatchObject({ status: "ok", format: "map-link", point: { lat: 43.6532, lon: -79.3832 } });
  });
  it("reads a point after a percent-encoded comma", () => {
    expect(readPoint("https://x.invalid/?q=43.65%2C-79.38")).toMatchObject({ status: "ok", point: { lat: 43.65, lon: -79.38 } });
  });
  it("survives a broken percent escape", () => {
    expect(readPoint("https://x.invalid/?q=%E0%A4&mlat=43.65&mlon=-79.38")).toMatchObject({ status: "ok" });
    expect(readPoint("https://x.invalid/%zz")).toEqual({ status: "invalid", problem: "link-no-point" });
  });
  it("reads mlon before mlat", () => {
    expect(readPoint("https://x.invalid/?mlon=-79.38&mlat=43.65")).toMatchObject({ status: "ok", point: { lat: 43.65, lon: -79.38 } });
  });
  it("prefers the marker pair over the view centre when both are in the link", () => {
    expect(readPoint("https://x.invalid/?mlat=43.1&mlon=-79.1#map=15/44.2/-80.2")).toMatchObject({ status: "ok", point: { lat: 43.1, lon: -79.1 } });
  });
  it("answers link-no-point for an out-of-range pair in a link only as out-of-range", () => {
    expect(readPoint("https://x.invalid/?mlat=143.1&mlon=-79.1")).toEqual({ status: "invalid", problem: "out-of-range" });
  });
  it("reads a geo link with altitude, uncertainty and spaces", () => {
    expect(readPoint("geo:43.65,-79.38,76?z=14")).toMatchObject({ status: "ok", format: "geo-link" });
    expect(readPoint("geo:43.65,-79.38;u=35")).toMatchObject({ status: "ok", point: { lat: 43.65, lon: -79.38 } });
    expect(readPoint("GEO: 43.65 , -79.38")).toMatchObject({ status: "ok" });
  });
  it("rejects a geo link that holds no pair", () => {
    for (const g of ["geo:", "geo:43.65", "geo:abc,def", "geo:0,0?q=Toronto", "geo:43.65;-79.38"]) {
      const r = readPoint(g);
      if (g === "geo:0,0?q=Toronto") expect(r.status).toBe("ok");
      else expect(r, g).toEqual({ status: "invalid", problem: "link-no-point" });
    }
  });
  it("does not run or fetch a script link", () => {
    for (const s of ["javascript:alert(1)", "data:text/html,<b>43.65,-79.38</b>", "file:///etc/passwd", "ftp://x.invalid/43.65,-79.38"]) {
      expect(readPoint(s).status, s).toBe("invalid");
    }
  });
});
