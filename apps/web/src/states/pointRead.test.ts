import { describe, expect, it } from "vitest";
import { MAX_POINT_TEXT, normalisePointText, readPoint } from "./pointRead";

const ok = (s: string) => {
  const r = readPoint(s);
  if (r.status !== "ok") throw new Error(`${s} -> ${JSON.stringify(r)}`);
  return r;
};
const bad = (s: string) => {
  const r = readPoint(s);
  return r.status === "invalid" ? r.problem : r.status;
};
const near = (a: number, b: number, d = 5e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(d);

describe("decimal degrees", () => {
  it.each([
    ["43.65, -79.38", 43.65, -79.38],
    ["43.65,-79.38", 43.65, -79.38],
    ["43.65 -79.38", 43.65, -79.38],
    ["43.65; -79.38", 43.65, -79.38],
    ["  43.65 ,  -79.38  ", 43.65, -79.38],
    ["(43.65, -79.38)", 43.65, -79.38],
    ["+43.65, -79.38", 43.65, -79.38],
    ["43,65 ; -79,38", 43.65, -79.38],
    ["43,65 -79,38", 43.65, -79.38],
    ["43,65, -79,38", 43.65, -79.38],
    ["-33.8688, 151.2093", -33.8688, 151.2093],
    ["0, 0", 0, 0],
    ["90, 180", 90, 180],
    ["-90, -180", -90, -180],
  ])("reads %s", (text, lat, lon) => {
    const r = ok(text);
    near(r.point.lat, lat);
    near(r.point.lon, lon);
    expect(r.format).toBe("decimal");
    expect(r.swapped).toBe(false);
  });
  it("reads a Unicode minus as a minus", () => {
    const r = ok("43.65, −79.38");
    expect(r.point.lon).toBe(-79.38);
  });
  it("rounds to five places (about 1 m)", () => {
    expect(ok("43.123456789, -79.987654321").point).toEqual({ lat: 43.12346, lon: -79.98765 });
  });
  it("accepts lat and lon words in either order", () => {
    expect(ok("lat 43.65 lon -79.38").point).toEqual({ lat: 43.65, lon: -79.38 });
    expect(ok("Latitude: 43.65, Longitude: -79.38").point).toEqual({ lat: 43.65, lon: -79.38 });
    expect(ok("lon=-79.38 lat=43.65").point).toEqual({ lat: 43.65, lon: -79.38 });
    expect(ok("lng -79.38, lat 43.65").point).toEqual({ lat: 43.65, lon: -79.38 });
  });
  it("is not fooled by two words of the same kind", () => {
    expect(ok("lat 43.65 lat -79.38").point).toEqual({ lat: 43.65, lon: -79.38 });
    expect(ok("lat 43.65 lat 10").point).toEqual({ lat: 43.65, lon: 10 });
  });
});

describe("a longitude pasted first", () => {
  it("is read as longitude first and flagged when the first number is over 90", () => {
    const r = ok("-120.5, 45.2");
    expect(r.point).toEqual({ lat: 45.2, lon: -120.5 });
    expect(r.swapped).toBe(true);
  });
  it("does not swap when both could be a latitude", () => {
    const r = ok("45, 60");
    expect(r.point).toEqual({ lat: 45, lon: 60 });
    expect(r.swapped).toBe(false);
  });
  it("is out of range when neither number could be a latitude", () => {
    expect(bad("120, 150")).toBe("out-of-range");
    expect(bad("-120, -150")).toBe("out-of-range");
  });
});

describe("hemisphere letters", () => {
  it.each([
    ["43.65 N 79.38 W", 43.65, -79.38],
    ["43.65 N, 79.38 W", 43.65, -79.38],
    ["43.65N 79.38W", 43.65, -79.38],
    ["43.65° N, 79.38° W", 43.65, -79.38],
    ["N 43.65 W 79.38", 43.65, -79.38],
    ["N43.65 W79.38", 43.65, -79.38],
    ["79.38 W 43.65 N", 43.65, -79.38],
    ["W 79.38 N 43.65", 43.65, -79.38],
    ["33.8688 S 151.2093 E", -33.8688, 151.2093],
    ["33.8688 s, 151.2093 e", -33.8688, 151.2093],
    ["43,65 N ; 79,38 O", 43.65, -79.38],
    ["43.65 North 79.38 West", 43.65, -79.38],
    ["43,65 Nord 79,38 Ouest", 43.65, -79.38],
    ["33.8688 South, 151.2093 East", -33.8688, 151.2093],
    ["33.8688 Sud 151.2093 Est", -33.8688, 151.2093],
  ])("reads %s", (text, lat, lon) => {
    const r = ok(text);
    near(r.point.lat, lat);
    near(r.point.lon, lon);
    expect(r.format).toBe("hemisphere");
    expect(r.swapped).toBe(false);
  });
  it("needs one letter for each axis", () => {
    expect(bad("43.65 N 79.38 S")).toBe("bad-letters");
    expect(bad("43.65 E 79.38 W")).toBe("bad-letters");
    expect(bad("43.65 N 79.38")).toBe("bad-letters");
    expect(bad("43.65 N 79.38 W 5 E")).toBe("bad-letters");
    expect(bad("N W")).toBe("bad-letters");
    expect(bad("43.65 N W 79.38")).toBe("bad-letters");
  });
  it("does not accept a minus sign beside a letter", () => {
    expect(bad("-43.65 N 79.38 W")).toBe("sign-and-letter");
    expect(bad("43.65 N -79.38 W")).toBe("sign-and-letter");
  });
  it("is out of range past the poles or the date line", () => {
    expect(bad("91 N 10 E")).toBe("out-of-range");
    expect(bad("10 N 181 E")).toBe("out-of-range");
    expect(ok("90 N 180 E").point).toEqual({ lat: 90, lon: 180 });
  });
  it("lat and lon words cannot be mixed with letters", () => {
    expect(bad("lat 43.65 N lon 79.38 W")).toBe("bad-letters");
  });
});

describe("degrees, minutes and seconds", () => {
  it("reads degrees and decimal minutes", () => {
    const r = ok("43° 39.0′ N 79° 22.8′ W");
    near(r.point.lat, 43.65);
    near(r.point.lon, -79.38);
    expect(r.format).toBe("dm");
  });
  it("reads degrees minutes seconds", () => {
    const r = ok(`43° 39' 0" N 79° 22' 48" W`);
    near(r.point.lat, 43.65);
    near(r.point.lon, -79.38);
    expect(r.format).toBe("dms");
  });
  it("reads curly marks, double single quotes and plain spaces", () => {
    near(ok("43°39′N 79°22.8′W").point.lon, -79.38);
    near(ok("43° 39′ 0″ N, 79° 22′ 48″ W").point.lat, 43.65);
  });
  it("reads them without letters, with the sign on the degrees", () => {
    const dm = ok("43 39 -79 22.8");
    expect(dm.format).toBe("dm");
    near(dm.point.lat, 43.65);
    near(dm.point.lon, -79.38);
    const dms = ok("43 39 0 -79 22 48");
    expect(dms.format).toBe("dms");
    near(dms.point.lon, -79.38);
  });
  it("a minus on the degrees applies to the minutes too", () => {
    near(ok("43 39 -0 30").point.lon, -0.5);
    near(ok("-0 30 10 20").point.lat, -0.5);
    near(ok("-0 30 10 20").point.lon, 10 + 20 / 60);
  });
  it("reads French letters with decimal commas", () => {
    const r = ok("43° 39,0′ N ; 79° 22,8′ O");
    near(r.point.lat, 43.65);
    near(r.point.lon, -79.38);
  });
  it("rejects minutes or seconds of 60 or more", () => {
    expect(bad("43 60 N 79 10 W")).toBe("bad-minutes");
    expect(bad("43 39 60 N 79 22 48 W")).toBe("bad-minutes");
    expect(ok("43 59 59.9 N 79 59 59.9 W").format).toBe("dms");
  });
  it("rejects a fraction on degrees that have minutes, and on minutes that have seconds", () => {
    expect(bad("43.5 30 N 79 10 W")).toBe("bad-minutes");
    expect(bad("43 30.5 10 N 79 10 10 W")).toBe("bad-minutes");
  });
  it("needs both coordinates to have the same parts", () => {
    expect(bad("43 39 N 79.38 W")).toBe("mixed-parts");
  });
  it("needs an even split of numbers without letters", () => {
    expect(bad("43 39 10")).toBe("number-count");
    expect(bad("1 2 3 4 5")).toBe("number-count");
    expect(bad("1 2 3 4 5 6 7 8")).toBe("number-count");
  });
});

describe("links", () => {
  it.each([
    ["geo:43.65,-79.38", 43.65, -79.38],
    ["geo:43.65000,-79.38000?z=17", 43.65, -79.38],
    ["GEO:43.65,-79.38;u=35", 43.65, -79.38],
    ["geo:43.65,-79.38,120", 43.65, -79.38],
    ["geo: 43.65 , -79.38", 43.65, -79.38],
    ["https://map.example/#map=17/43.65000/-79.38000", 43.65, -79.38],
    ["https://map.example/?mlat=43.65&mlon=-79.38#map=17/1/2", 43.65, -79.38],
    ["https://map.example/?mlat=43.65&amp;mlon=-79.38", 43.65, -79.38],
    ["https://map.example/?mlon=-79.38&mlat=43.65", 43.65, -79.38],
    ["https://map.example/place/@43.65,-79.38,17z/data=x", 43.65, -79.38],
    ["https://map.example/?q=43.65,-79.38", 43.65, -79.38],
    ["https://map.example/?q=43.65%2C-79.38&z=3", 43.65, -79.38],
    ["https://map.example/?ll=43.65,-79.38&z=3", 43.65, -79.38],
    ["https://map.example/?center=43.65,-79.38", 43.65, -79.38],
  ])("reads %s", (text, lat, lon) => {
    const r = ok(text);
    near(r.point.lat, lat);
    near(r.point.lon, lon);
    expect(r.format === "geo-link" || r.format === "map-link").toBe(true);
  });
  it("names the kind of link", () => {
    expect(ok("geo:1,2").format).toBe("geo-link");
    expect(ok("https://x.example/?q=1,2").format).toBe("map-link");
  });
  it("is invalid for a link with no point, a bad geo link, or a point out of range", () => {
    expect(bad("https://map.example/")).toBe("link-no-point");
    expect(bad("https://map.example/search?q=coffee")).toBe("link-no-point");
    expect(bad("geo:abc")).toBe("link-no-point");
    expect(bad("geo:43.65")).toBe("link-no-point");
    expect(bad("geo:95,10")).toBe("out-of-range");
    expect(bad("https://map.example/?q=95,10")).toBe("out-of-range");
  });
  it("never reads the host, so any host is the same", () => {
    expect(ok("https://one.example/?q=1,2").point).toEqual(ok("https://other.example/?q=1,2").point);
  });
  it("does not choke on a broken percent sequence", () => {
    expect(bad("https://map.example/?q=%E0%A4%A&z=1")).toBe("link-no-point");
  });
});

describe("what is not a point", () => {
  it("empty and blank are none", () => {
    expect(readPoint("")).toEqual({ status: "none" });
    expect(readPoint("   \n\t ")).toEqual({ status: "none" });
  });
  it("text with no numbers", () => {
    expect(bad("here")).toBe("stray-text");
    expect(bad("N")).toBe("bad-letters");
    expect(bad(",;")).toBe("no-numbers");
  });
  it("one number", () => expect(bad("43.65")).toBe("one-number"));
  it("three numbers", () => expect(bad("43.65, -79.38, 12")).toBe("number-count"));
  it("words other than the known ones", () => {
    expect(bad("43.65 metres -79.38")).toBe("stray-text");
    expect(bad("43.65 abc -79.38")).toBe("stray-text");
    expect(bad("1,2 and 3,4")).toBe("stray-text");
  });
  it("too many digits in the whole part", () => {
    expect(bad("1234.5, 10")).toBe("out-of-range");
    expect(bad("43.65, 1000")).toBe("out-of-range");
  });
  it("text over the limit", () => {
    expect(bad(`${"1".repeat(MAX_POINT_TEXT)}, 2`)).toBe("too-long");
    expect(bad("1, 2" + " ".repeat(MAX_POINT_TEXT))).not.toBe("too-long");
  });
  it("a point at the exact limit is read", () => {
    const pad = `43.65, -79.38${" ".repeat(MAX_POINT_TEXT - 13)}`;
    expect(pad.length).toBe(MAX_POINT_TEXT);
    expect(readPoint(pad).status).toBe("ok");
  });
  it("never throws, whatever it is given", () => {
    const junk = ["\u0000", "\uD800", "°°°", "N N N", "--1,--2", "1e5, 2", "٤٣.٦٥, ٧٩", "0x10, 0x20", "%", "http://", "geo:", "++1, 2", "1..2, 3", "1.2.3, 4"];
    for (const j of junk) expect(() => readPoint(j), j).not.toThrow();
    for (const j of junk) expect(["invalid", "ok", "none"]).toContain(readPoint(j).status);
  });
});

describe("normalisePointText", () => {
  it("makes one form of each mark and each space", () => {
    expect(normalisePointText("43º\u00a039’\u202f−")).toBe("43° 39′ -");
    expect(normalisePointText("a\u2007\u2009b\u200bc")).toBe("a b c");
    expect(normalisePointText("5˚ 6´ 7”")).toBe("5° 6′ 7″");
  });
  it("turns two minute marks into one second mark and leaves a single one alone", () => {
    expect(normalisePointText("1′′")).toBe("1″");
    expect(normalisePointText("1''")).toBe("1″");
    expect(normalisePointText("1'")).toBe("1′");
  });
  it("trims", () => expect(normalisePointText("  a  ")).toBe("a"));
});
