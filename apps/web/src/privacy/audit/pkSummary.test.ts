import { describe, expect, it } from "vitest";
import { EMPTY_SUMMARY, summarise, summaryLines } from "./pkSummary";

const place = (wheelchair: unknown, licence = "ODbL-1.0") => ({ id: "p", wheelchair, provenance: { licence } });

describe("summarise", () => {
  it("gives zeros for content that is not an object", () => {
    for (const v of [null, undefined, 5, "x", []]) expect(summarise(v)).toEqual(EMPTY_SUMMARY);
  });
  it("gives a copy of the empty summary, not the shared one", () => {
    const s = summarise(null);
    s.places = 9;
    expect(EMPTY_SUMMARY.places).toBe(0);
  });
  it("counts each wheelchair value apart, and UNKNOWN as unknown", () => {
    const s = summarise({ places: [place("yes"), place("yes"), place("no"), place("UNKNOWN"), place("limited"), place("unknown"), place(null)] });
    expect(s).toMatchObject({ places: 7, wheelchairYes: 2, wheelchairNo: 1, wheelchairUnknown: 1, wheelchairOther: 3 });
  });
  it("does not turn UNKNOWN into anything else", () => {
    const s = summarise({ places: [place("UNKNOWN"), place("UNKNOWN")] });
    expect(s.wheelchairUnknown).toBe(2);
    expect(s.wheelchairYes + s.wheelchairNo + s.wheelchairOther).toBe(0);
  });
  it("counts the records whose licence is UNKNOWN, in every list and in a record's own licence", () => {
    const s = summarise({ places: [place("yes", "UNKNOWN")], help_numbers: [{ provenance: { licence: "UNKNOWN" } }, { provenance: { licence: "OGL" } }], elevator_status: [{ licence: "UNKNOWN" }] });
    expect(s.licenceUnknown).toBe(3);
  });
  it("counts help numbers with no link: a null, a missing one or an empty one", () => {
    const s = summarise({ help_numbers: [{ url: null }, {}, { url: "" }, { url: "https://example.org/" }] });
    expect(s).toMatchObject({ helpNumbers: 4, helpWithoutLink: 3 });
  });
  it("counts elevator records with no time of last check", () => {
    const s = summarise({ elevator_status: [{ checked_at: "2026-11-13T19:48:29.000Z" }, {}, { checked_at: "" }, { checked_at: 5 }] });
    expect(s).toMatchObject({ elevators: 4, elevatorsUnchecked: 3 });
  });
  it("leaves out rows that are not records and lists that are not lists", () => expect(summarise({ places: [5, null, place("yes")], help_numbers: "x" })).toMatchObject({ places: 1, helpNumbers: 0 }));
});

describe("summaryLines", () => {
  it("writes four lines with the counts", () => {
    const l = summaryLines({ ...EMPTY_SUMMARY, places: 3, wheelchairYes: 1, wheelchairUnknown: 2, licenceUnknown: 4, helpNumbers: 5, helpWithoutLink: 1, elevators: 2, elevatorsUnchecked: 0 });
    expect(l).toEqual([
      "Places: 3; wheelchair access yes 1, no 0, UNKNOWN 2, other 0.",
      "Records with the licence UNKNOWN: 4.",
      "Help numbers: 5, 1 without a link.",
      "Elevator records: 2, 0 without a time of last check.",
    ]);
  });
});
