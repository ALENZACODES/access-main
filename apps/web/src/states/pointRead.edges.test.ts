import { describe, expect, it } from "vitest";
import { MAX_POINT_TEXT, readPoint } from "./pointRead";

const problem = (s: string) => {
  const r = readPoint(s);
  return r.status === "invalid" ? r.problem : r.status;
};

describe("the length limit", () => {
  it("reads a point of exactly the limit", () => {
    const s = `43.65,${" ".repeat(MAX_POINT_TEXT - 12)}-79.38`;
    expect(s.length).toBe(MAX_POINT_TEXT);
    expect(readPoint(s).status).toBe("ok");
  });
  it("refuses one character more", () => {
    const s = `43.65,${" ".repeat(MAX_POINT_TEXT - 11)}-79.38`;
    expect(s.length).toBe(MAX_POINT_TEXT + 1);
    expect(problem(s)).toBe("too-long");
  });
  it("counts the trimmed text, not the spaces around it", () => {
    expect(readPoint(`${" ".repeat(500)}43.65, -79.38${" ".repeat(500)}`).status).toBe("ok");
  });
});

describe("the swap rule at its edges", () => {
  it("does not swap when the first number is exactly 90", () => {
    expect(readPoint("90, 10")).toMatchObject({ status: "ok", swapped: false, point: { lat: 90, lon: 10 } });
  });
  it("does not swap when the first is -90", () => {
    expect(readPoint("-90, 179")).toMatchObject({ status: "ok", swapped: false, point: { lat: -90, lon: 179 } });
  });
  it("swaps when the first is just over 90 and the second is exactly 90", () => {
    expect(readPoint("100, 90")).toMatchObject({ status: "ok", swapped: true, point: { lat: 90, lon: 100 } });
    expect(readPoint("-100, -90")).toMatchObject({ status: "ok", swapped: true, point: { lat: -90, lon: -100 } });
  });
  it("swaps at 90.000001 but not at 90.0", () => {
    expect(readPoint("90.000001, 10")).toMatchObject({ status: "ok", swapped: true });
    expect(readPoint("90.0, 10")).toMatchObject({ status: "ok", swapped: false });
  });
  it("refuses when both numbers are over 90", () => {
    expect(problem("100, 100")).toBe("out-of-range");
    expect(problem("-100, 91")).toBe("out-of-range");
  });
  it("does not swap when the second is the one over 90 and the first is small", () => {
    expect(readPoint("10, 100")).toMatchObject({ status: "ok", swapped: false, point: { lat: 10, lon: 100 } });
  });
  it("never swaps a pair that says which is which", () => {
    expect(readPoint("lon 151.2 lat -33.9")).toMatchObject({ status: "ok", swapped: false, point: { lat: -33.9, lon: 151.2 } });
    expect(problem("lat 151.2 lon -33.9")).toBe("out-of-range");
  });
  it("never swaps when letters say which is which", () => {
    expect(readPoint("151.2 E 33.9 S")).toMatchObject({ status: "ok", swapped: false, point: { lat: -33.9, lon: 151.2 } });
  });
});

describe("integer digits", () => {
  it("reads three integer digits for a longitude", () => {
    expect(readPoint("0, 179.5")).toMatchObject({ status: "ok", point: { lat: 0, lon: 179.5 } });
  });
  it("refuses four integer digits, even with leading zeros", () => {
    expect(problem("0043.65, -79.38")).toBe("out-of-range");
    expect(problem("43.65, -0079.38")).toBe("out-of-range");
    expect(problem("1000, 5")).toBe("out-of-range");
  });
  it("reads two or three leading zeros", () => {
    expect(readPoint("043.65, -079.38")).toMatchObject({ status: "ok", point: { lat: 43.65, lon: -79.38 } });
    expect(readPoint("00.5, 000.5")).toMatchObject({ status: "ok", point: { lat: 0.5, lon: 0.5 } });
  });
  it("applies the digit rule to each part of degrees and minutes", () => {
    expect(problem("0043 39 N 079 22 W")).toBe("out-of-range");
  });
});

describe("minutes and seconds at their edges", () => {
  it("reads 59 minutes and refuses 60", () => {
    expect(readPoint("43 59 N, 79 59 W").status).toBe("ok");
    expect(problem("43 60 N, 79 30 W")).toBe("bad-minutes");
    expect(problem("43 30 N, 79 60 W")).toBe("bad-minutes");
  });
  it("reads 59.999 minutes", () => {
    expect(readPoint("43 59.999 N, 79 0 W")).toMatchObject({ status: "ok" });
  });
  it("reads 59 seconds and refuses 60", () => {
    expect(readPoint("43 39 59 N, 79 22 59 W").status).toBe("ok");
    expect(problem("43 39 60 N, 79 22 0 W")).toBe("bad-minutes");
    expect(problem("43 39 0 N, 79 22 60 W")).toBe("bad-minutes");
  });
  it("refuses decimal degrees when minutes follow", () => {
    expect(problem("43.5 30 N, 79 22 W")).toBe("bad-minutes");
  });
  it("refuses decimal minutes when seconds follow", () => {
    expect(problem("43 39.5 10 N, 79 22 10 W")).toBe("bad-minutes");
  });
  it("refuses a different number of parts for each coordinate", () => {
    expect(problem("43 39 N, 79 22 10 W")).toBe("mixed-parts");
    expect(problem("43 N, 79 22 W")).toBe("mixed-parts");
  });
  it("reads minutes that carry to the next degree as written", () => {
    expect(readPoint("43 59.9999 N, 79 0 W")).toMatchObject({ status: "ok", point: { lat: 43.999998, lon: -79 } });
  });
});

describe("hemisphere letters at their edges", () => {
  it("reads the letters before or after the number", () => {
    expect(readPoint("N 43.65 W 79.38")).toMatchObject({ status: "ok", point: { lat: 43.65, lon: -79.38 } });
    expect(readPoint("43.65 N 79.38 W")).toMatchObject({ status: "ok", point: { lat: 43.65, lon: -79.38 } });
  });
  it("reads longitude first when its letter is first", () => {
    expect(readPoint("79.38 W 43.65 N")).toMatchObject({ status: "ok", point: { lat: 43.65, lon: -79.38 } });
    expect(readPoint("W 79.38 N 43.65")).toMatchObject({ status: "ok", point: { lat: 43.65, lon: -79.38 } });
  });
  it("reads S and W as negative, and O as west in French", () => {
    expect(readPoint("10 S 20 W")).toMatchObject({ point: { lat: -10, lon: -20 } });
    expect(readPoint("10 N 20 O")).toMatchObject({ point: { lat: 10, lon: -20 } });
    expect(readPoint("10 N 20 E")).toMatchObject({ point: { lat: 10, lon: 20 } });
  });
  it("reads zero with a letter as zero, not negative zero", () => {
    const r = readPoint("0 S 0 W");
    expect(r.status === "ok" && Object.is(r.point.lat, -0)).toBe(false);
    expect(r.status === "ok" && Object.is(r.point.lon, -0)).toBe(false);
  });
  it("refuses two latitude letters or two longitude letters", () => {
    expect(problem("43 N 45 S")).toBe("bad-letters");
    expect(problem("79 E 80 W")).toBe("bad-letters");
  });
  it("refuses one letter, three letters and a letter with no number", () => {
    expect(problem("43.65 N 79.38")).toBe("bad-letters");
    expect(problem("43 N 79 W 1 E")).toBe("bad-letters");
    expect(problem("N W")).toBe("bad-letters");
    expect(problem("43.65 N W")).toBe("bad-letters");
  });
  it("refuses a minus sign with a letter, even a plus", () => {
    expect(problem("-43.65 N 79.38 W")).toBe("sign-and-letter");
    expect(problem("43.65 N -79.38 W")).toBe("sign-and-letter");
  });
  it("accepts a plus sign beside a letter", () => {
    expect(readPoint("+43.65 N +79.38 W")).toMatchObject({ status: "ok", point: { lat: 43.65, lon: -79.38 } });
  });
  it("reads letters beside the degree mark with no spaces", () => {
    expect(readPoint("43.65°N,79.38°W")).toMatchObject({ status: "ok", point: { lat: 43.65, lon: -79.38 } });
  });
});

describe("separators and decimal marks", () => {
  it("reads a comma between the numbers and a point as the decimal", () => {
    expect(readPoint("43.65,-79.38")).toMatchObject({ point: { lat: 43.65, lon: -79.38 } });
  });
  it("reads a semicolon between numbers that use a decimal comma", () => {
    expect(readPoint("43,65; -79,38")).toMatchObject({ point: { lat: 43.65, lon: -79.38 } });
    expect(readPoint("43,65;-79,38")).toMatchObject({ point: { lat: 43.65, lon: -79.38 } });
  });
  it("reads a space between the numbers", () => {
    expect(readPoint("43.65 -79.38")).toMatchObject({ point: { lat: 43.65, lon: -79.38 } });
  });
  it("reads a slash and brackets", () => {
    expect(readPoint("(43.65 / -79.38)")).toMatchObject({ point: { lat: 43.65, lon: -79.38 } });
  });
  it("refuses a thousands separator rather than guessing", () => {
    expect(readPoint("1,234.5, 1").status).toBe("invalid");
  });
  it("refuses a number with two decimal marks", () => {
    expect(readPoint("43.65.1, -79").status).toBe("invalid");
  });
  it("reads minus signs written as other dash characters", () => {
    for (const dash of ["−", "–", "—", "‒"]) {
      expect(readPoint(`43.65, ${dash}79.38`), dash).toMatchObject({ point: { lat: 43.65, lon: -79.38 } });
    }
  });
  it("reads degree, minute and second marks written in their other forms", () => {
    expect(readPoint("43º 39’ 0” N, 79º 22’ 48” W")).toMatchObject({ status: "ok", format: "dms" });
    expect(readPoint("43° 39' 0'' N, 79° 22' 48'' W")).toMatchObject({ status: "ok", format: "dms" });
    expect(readPoint("43° 39′ 0″ N, 79° 22′ 48″ W")).toMatchObject({ status: "ok", format: "dms" });
  });
});

describe("the minus sign belongs to the whole coordinate", () => {
  it("reads -79 22 as minus 79 degrees and 22 minutes", () => {
    const r = readPoint("43 39, -79 22");
    expect(r).toMatchObject({ status: "ok", format: "dm" });
    if (r.status === "ok") {
      expect(r.point.lat).toBeCloseTo(43.65, 5);
      expect(r.point.lon).toBeCloseTo(-(79 + 22 / 60), 5);
    }
  });
  it("reads -0 38 as a small negative", () => {
    const r = readPoint("43 39, -0 38");
    expect(r.status === "ok" && r.point.lon < 0).toBe(true);
  });
  it("reads three-part coordinates with a minus", () => {
    const r = readPoint("-33 52 7, 151 12 34");
    expect(r.status === "ok" && r.point.lat < -33.86 && r.point.lat > -33.87).toBe(true);
  });
});

describe("labels", () => {
  it("reads lat and lon in either order, in either language", () => {
    expect(readPoint("lat 43.65 lon -79.38")).toMatchObject({ point: { lat: 43.65, lon: -79.38 } });
    expect(readPoint("lon -79.38 lat 43.65")).toMatchObject({ point: { lat: 43.65, lon: -79.38 } });
    expect(readPoint("Latitude: 43.65, Longitude: -79.38")).toMatchObject({ point: { lat: 43.65, lon: -79.38 } });
    expect(readPoint("lat=43.65 lng=-79.38")).toMatchObject({ point: { lat: 43.65, lon: -79.38 } });
  });
  it("ignores a label that appears once or twice for the same axis", () => {
    expect(readPoint("lat 43.65, -79.38")).toMatchObject({ point: { lat: 43.65, lon: -79.38 } });
    expect(readPoint("lat 43.65 lat -79.38")).toMatchObject({ point: { lat: 43.65, lon: -79.38 } });
  });
  it("does not take a label that is part of another word", () => {
    expect(problem("latte 43.65 -79.38")).toBe("stray-text");
    expect(problem("flat 43.65 -79.38")).toBe("stray-text");
  });
});
