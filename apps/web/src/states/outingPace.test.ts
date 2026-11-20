import { describe, expect, it } from "vitest";
import { MAX_PACE_KMH, MIN_PACE_KMH, formatMinutes, minutesAt, parsePace } from "./outingPace";

describe("parsePace", () => {
  it("is none for nothing or spaces", () => {
    for (const text of ["", " ", "\t", "   "]) expect(parsePace(text)).toEqual({ status: "none" });
  });
  it("reads a number with a decimal point or a comma", () => {
    expect(parsePace("3.5")).toEqual({ status: "ok", kmh: 3.5 });
    expect(parsePace("3,5")).toEqual({ status: "ok", kmh: 3.5 });
    expect(parsePace(" 4 ")).toEqual({ status: "ok", kmh: 4 });
    expect(parsePace("0.5")).toEqual({ status: "ok", kmh: 0.5 });
    expect(parsePace("8")).toEqual({ status: "ok", kmh: 8 });
    expect(parsePace("2.25")).toEqual({ status: "ok", kmh: 2.25 });
  });
  it("has a lowest and a highest pace that are both allowed, and nothing past them", () => {
    expect(parsePace(String(MIN_PACE_KMH)).status).toBe("ok");
    expect(parsePace(String(MAX_PACE_KMH)).status).toBe("ok");
    expect(parsePace("0.49").status).toBe("invalid");
    expect(parsePace("8.01").status).toBe("invalid");
    expect(parsePace("0").status).toBe("invalid");
    expect(parsePace("12").status).toBe("invalid");
  });
  it("is invalid for anything that is not a plain number, and never guesses", () => {
    for (const text of ["abc", "3.5 km/h", "3.5.1", "-3", "+3", "1e1", "3.", ".5", "3,5,1", "NaN", "Infinity", "３", "3.555", "١٢"]) expect(parsePace(text), text).toEqual({ status: "invalid" });
  });
});

describe("minutesAt", () => {
  it("is the straight-line time at the pace, rounded up to a whole minute", () => {
    expect(minutesAt(3000, 3)).toBe(60);
    expect(minutesAt(1000, 6)).toBe(10);
    expect(minutesAt(1001, 6)).toBe(11);
    expect(minutesAt(1, 3)).toBe(1);
  });
  it("is never below the true time, so it is a minimum and not an estimate", () => {
    for (const metres of [10, 99, 250, 777, 1234, 5000, 9999]) {
      for (const kmh of [0.5, 1, 2.5, 3.5, 8]) expect(minutesAt(metres, kmh)).toBeGreaterThanOrEqual(metres / ((kmh * 1000) / 60));
    }
  });
  it("is 0 for no distance and for numbers it cannot use", () => {
    for (const [m, k] of [[0, 3], [-5, 3], [NaN, 3], [Infinity, 3], [100, 0], [100, -1], [100, NaN]] as const) expect(minutesAt(m, k), `${m},${k}`).toBe(0);
  });
  it("grows with distance and shrinks with pace", () => {
    expect(minutesAt(2000, 3)).toBeGreaterThan(minutesAt(1000, 3));
    expect(minutesAt(2000, 6)).toBeLessThan(minutesAt(2000, 3));
  });
});

describe("formatMinutes", () => {
  it("writes minutes under an hour with a no-break space before the unit", () => {
    expect(formatMinutes(0)).toBe("0\u00a0min");
    expect(formatMinutes(4)).toBe("4\u00a0min");
    expect(formatMinutes(59)).toBe("59\u00a0min");
  });
  it("writes hours, and hours with minutes padded to two digits", () => {
    expect(formatMinutes(60)).toBe("1\u00a0h");
    expect(formatMinutes(65)).toBe("1\u00a0h\u00a005\u00a0min");
    expect(formatMinutes(125)).toBe("2\u00a0h\u00a005\u00a0min");
    expect(formatMinutes(180)).toBe("3\u00a0h");
  });
  it("never writes a negative or fractional number", () => {
    expect(formatMinutes(-4)).toBe("0\u00a0min");
    expect(formatMinutes(4.6)).toBe("5\u00a0min");
  });
  it("uses a no-break space, never a plain one, between number and unit", () => {
    for (const m of [3, 61, 200]) expect(formatMinutes(m)).not.toMatch(/\d [a-z]/);
  });
});
