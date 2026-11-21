import { describe, expect, it } from "vitest";
import { NO_PACES, hasPace, meetUpMinutes, meetUpMinutesCell, meetUpPaceNote, meetUpTimeText, readPaces } from "./meetUpTime";
import { lintFrench } from "./typography";

describe("meetUpMinutes", () => {
  it("rounds up whole minutes for each person who gave a pace", () => {
    // 5 km/h is 83.33 m a minute: 1000 m is 12 minutes, 1001 m is 13.
    expect(meetUpMinutes({ metresA: 1000, metresB: 1001 }, { a: 5, b: 5 })).toEqual({ a: 12, b: 13, later: 13, spread: 1 });
  });
  it("is null for a person without a pace, and then has no later time or spread", () => {
    expect(meetUpMinutes({ metresA: 500, metresB: 500 }, { a: 3, b: null })).toEqual({ a: 10, b: null, later: null, spread: null });
    expect(meetUpMinutes({ metresA: 500, metresB: 500 }, NO_PACES)).toEqual({ a: null, b: null, later: null, spread: null });
  });
  it("is zero minutes for zero metres", () => {
    expect(meetUpMinutes({ metresA: 0, metresB: 0 }, { a: 4, b: 2 })).toEqual({ a: 0, b: 0, later: 0, spread: 0 });
  });
  it("a slower pace never gives fewer minutes", () => {
    for (const m of [10, 99, 500, 1234, 9999]) {
      const slow = meetUpMinutes({ metresA: m, metresB: m }, { a: 1, b: 4 });
      expect(slow.a!).toBeGreaterThanOrEqual(slow.b!);
      expect(slow.later).toBe(slow.a);
    }
  });
  it("spread is the difference of the two, whichever is larger", () => {
    expect(meetUpMinutes({ metresA: 100, metresB: 3000 }, { a: 5, b: 5 }).spread).toBe(36 - 2);
    expect(meetUpMinutes({ metresA: 3000, metresB: 100 }, { a: 5, b: 5 }).spread).toBe(34);
  });
});

describe("readPaces", () => {
  it("reads good paces, empty as none, and a decimal comma", () => {
    expect(readPaces("4", "3,5")).toEqual({ paces: { a: 4, b: 3.5 }, errorA: false, errorB: false });
    expect(readPaces("", "")).toEqual({ paces: NO_PACES, errorA: false, errorB: false });
  });
  it("flags only the pace that is wrong and does not use it", () => {
    expect(readPaces("fast", "4")).toEqual({ paces: { a: null, b: 4 }, errorA: true, errorB: false });
    expect(readPaces("4", "9")).toEqual({ paces: { a: 4, b: null }, errorA: false, errorB: true });
    expect(readPaces("0.1", "x").paces).toEqual(NO_PACES);
  });
  it("hasPace is true when either is given", () => {
    expect(hasPace(NO_PACES)).toBe(false);
    expect(hasPace({ a: null, b: 3 })).toBe(true);
    expect(hasPace({ a: 3, b: null })).toBe(true);
  });
});

describe("words", () => {
  it("the cell shows a dash for no pace", () => {
    expect(meetUpMinutesCell(null)).toBe("–");
    expect(meetUpMinutesCell(12)).toBe("12 min");
    expect(meetUpMinutesCell(65)).toBe("1 h 05 min");
  });
  it("says at least, for whom, in both languages", () => {
    expect(meetUpTimeText({ a: 4, b: 7, later: 7, spread: 3 }, "en")).toBe("At least 4 min for the first person and 7 min for the second person.");
    expect(meetUpTimeText({ a: null, b: 7, later: null, spread: null }, "en")).toBe("At least 7 min for the second person.");
    expect(meetUpTimeText({ a: 4, b: null, later: null, spread: null }, "fr")).toBe("Au moins 4 min pour la première personne.");
    expect(meetUpTimeText({ a: null, b: null, later: null, spread: null }, "en")).toBe("");
  });
  it("the note says minimum, longer in practice, and not saved", () => {
    expect(meetUpPaceNote("en")).toMatch(/least/);
    expect(meetUpPaceNote("en")).toMatch(/longer/);
    expect(meetUpPaceNote("en")).toMatch(/not saved/);
    expect(meetUpPaceNote("fr")).toMatch(/minimum/);
  });
  it("French passes lintFrench", () => {
    for (const s of [meetUpPaceNote("fr"), meetUpTimeText({ a: 4, b: 70, later: 70, spread: 66 }, "fr"), meetUpTimeText({ a: null, b: 9, later: null, spread: null }, "fr")]) expect(lintFrench(s), s).toEqual([]);
  });
});
