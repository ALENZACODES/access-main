import { describe, expect, it } from "vitest";
import { findTimes, finestPrecision, offsetsIn, tallyPrecision, timesOfDayAreUtc } from "./tmText";

describe("findTimes", () => {
  it("reads an ISO time with milliseconds and Z", () => {
    expect(findTimes("at 2026-11-21T14:05:09.123Z.")).toEqual([{ text: "2026-11-21T14:05:09.123Z", index: 3, precision: "millisecond", zone: "utc", form: "iso" }]);
  });
  it("reads seconds, and minutes, and no zone", () => {
    expect(findTimes("2026-11-21T14:05:09Z")[0]).toMatchObject({ precision: "second", zone: "utc" });
    expect(findTimes("2026-11-21T14:05")[0]).toMatchObject({ precision: "minute", zone: "none" });
  });
  it("reads an offset, with and without a colon", () => {
    expect(findTimes("2026-11-21T14:05:09+05:30")[0]).toMatchObject({ zone: "offset", offset: "+05:30" });
    expect(findTimes("2026-11-21T14:05:09-0500")[0]).toMatchObject({ zone: "offset", offset: "-0500" });
  });
  it("reads a date and time with a space", () => {
    expect(findTimes("2026-11-21 14:05")[0]).toMatchObject({ form: "spaced", precision: "minute", zone: "none" });
    expect(findTimes("2026-11-21 14:05:09")[0]).toMatchObject({ precision: "second" });
  });
  it("reads a date alone and finds it once inside a longer time", () => {
    expect(findTimes("2026-11-21")).toHaveLength(1);
    expect(findTimes("2026-11-21T14:05:09Z")).toHaveLength(1);
    expect(findTimes("2026-11-21 14:05")).toHaveLength(1);
  });
  it("reads a count of milliseconds in range, as UTC", () => {
    expect(findTimes("t=1795000000000;")[0]).toMatchObject({ form: "epoch", precision: "millisecond", zone: "utc" });
  });
  it("does not read a number out of range, with the wrong length, or inside a longer number", () => {
    expect(findTimes("9000000000000")).toEqual([]);
    expect(findTimes("17950000000001")).toEqual([]);
    expect(findTimes("179500000000")).toEqual([]);
    expect(findTimes("1795000000000.5")).toEqual([]);
  });
  it("does not read dates that do not exist", () => {
    expect(findTimes("2026-13-01 2026-02-30 2026-00-10 2026-04-31")).toEqual([]);
    expect(findTimes("2026-11-21T25:00:00Z 2026-11-21T10:61Z 2026-11-21T10:10:61Z")).toEqual([]);
  });
  it("reads 29 February only in a leap year", () => {
    expect(findTimes("2028-02-29")).toHaveLength(1);
    expect(findTimes("2026-02-29")).toEqual([]);
    expect(findTimes("2100-02-29")).toEqual([]);
    expect(findTimes("2000-02-29")).toHaveLength(1);
  });
  it("returns them in the order they appear", () => {
    expect(findTimes("b 2026-11-22, a 2026-11-21T01:00Z").map((m) => m.text)).toEqual(["2026-11-22", "2026-11-21T01:00Z"]);
  });
  it("gives nothing for no times and for an empty text", () => {
    expect(findTimes("no times here, version 1.2.3")).toEqual([]);
    expect(findTimes("")).toEqual([]);
  });
  it("reads times in JSON and in a file name", () => {
    expect(findTimes('{"at":"2026-11-21T14:05:09.000Z"}')).toHaveLength(1);
    expect(findTimes("the-app-data-2026-11-21.json")[0]).toMatchObject({ precision: "date" });
  });
});

describe("what is said of a set of times", () => {
  const set = findTimes("2026-11-21, 2026-11-21 10:00, 2026-11-21T10:00:00Z, 2026-11-21T10:00:00.5+02:00");
  it("finestPrecision is the finest, or null", () => {
    expect(finestPrecision(set)).toBe("millisecond");
    expect(finestPrecision(findTimes("2026-11-21"))).toBe("date");
    expect(finestPrecision([])).toBeNull();
  });
  it("offsetsIn lists each offset once", () => {
    expect(offsetsIn(set)).toEqual(["+02:00"]);
    expect(offsetsIn(findTimes("2026-11-21T10:00Z 2026-11-21"))).toEqual([]);
    expect(offsetsIn(findTimes("2026-11-21T10:00+02:00 2026-11-22T10:00+02:00"))).toEqual(["+02:00"]);
  });
  it("tallyPrecision counts each precision", () => expect(tallyPrecision(set)).toEqual({ millisecond: 1, second: 1, minute: 1, date: 1 }));
  it("timesOfDayAreUtc is true only when each time of day has Z or is a count", () => {
    expect(timesOfDayAreUtc(findTimes("2026-11-21 2026-11-21T10:00:00Z 1795000000000"))).toBe(true);
    expect(timesOfDayAreUtc(findTimes("2026-11-21T10:00:00Z 2026-11-21 10:00"))).toBe(false);
    expect(timesOfDayAreUtc(findTimes("2026-11-21T10:00:00+01:00"))).toBe(false);
    expect(timesOfDayAreUtc([])).toBe(true);
  });
});
