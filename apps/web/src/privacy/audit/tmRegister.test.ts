import { describe, expect, it } from "vitest";
import { TM_ACCEPTED, TM_FOLDERS, validateTmRegister, type TmAcceptRow } from "./tmRegister";

const ok: TmAcceptRow = { path: "apps/web/src/a.ts", code: "tm-local-getter", count: 1, reason: "Writes a date from the getters of a Date, in the time zone of the device." };

describe("the accepted list", () => {
  it("is well formed", () => expect(validateTmRegister()).toEqual([]));
  it("has a reason of real length on every row", () => {
    for (const r of TM_ACCEPTED) expect(r.reason.length, r.path).toBeGreaterThan(60);
  });
  it("says what was not checked where the row is about a place that is not described by its lines", () => {
    for (const r of TM_ACCEPTED.filter((x) => x.code === "tm-hires-timer" || x.code === "tm-clock-in-text")) expect(r.reason, r.path).toContain("Not checked");
  });
  it("lists each folder once", () => expect(new Set(TM_FOLDERS).size).toBe(TM_FOLDERS.length));
});

describe("validateTmRegister", () => {
  it("passes a good row", () => expect(validateTmRegister([ok], [])).toEqual([]));
  it("refuses a code that is not of this audit", () => expect(validateTmRegister([{ ...ok, code: "x" as never }], [])[0]).toContain("not a code"));
  it("refuses a time zone read and an unlisted folder as rows", () => {
    expect(validateTmRegister([{ ...ok, code: "tm-tz-read" }], [])[0]).toContain("may not be accepted");
    expect(validateTmRegister([{ ...ok, code: "tm-unlisted-folder" }], [])[0]).toContain("may not be accepted");
  });
  it("refuses a count that is not a whole number from 1", () => {
    for (const count of [0, -1, 1.5, Number.NaN]) expect(validateTmRegister([{ ...ok, count }], [])[0]).toContain("count must be");
  });
  it("refuses a short reason", () => expect(validateTmRegister([{ ...ok, reason: "fine" }], [])[0]).toContain("too short"));
  it("refuses a reason that claims more than a reading", () => {
    expect(validateTmRegister([{ ...ok, reason: `${ok.reason} It is safe and verified.` }], [])[0]).toContain("claims more");
  });
  it("refuses the same row twice", () => expect(validateTmRegister([ok, ok], []).join("\n")).toContain("the same row twice"));
  it("refuses rows out of order", () => expect(validateTmRegister([{ ...ok, path: "apps/web/src/b.ts" }, ok], []).join("\n")).toContain("out of order"));
  it("refuses a folder twice, the privacy folder and a name that is not one", () => {
    expect(validateTmRegister([], ["a", "a"])[0]).toContain("listed twice");
    expect(validateTmRegister([], ["privacy"])[0]).toContain("policed by rows");
    expect(validateTmRegister([], ["A b"])[0]).toContain("not a folder name");
  });
});
