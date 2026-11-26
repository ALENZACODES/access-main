// Audit of the function that writes today's date in the time zone of the device. It is declared again in many files
// of the privacy folder. This reads each declaration from the source, compiles it and runs it, and checks that every
// copy gives the same answer as an independent way of writing the same date, on many days and in several zones. It
// also records, as known, that the copies are copies, and that other folders write "today" in UTC.

import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { compileCopy, extractFunctions, groupCopies, type FunctionCopy } from "./tmCopies";
import { loadFiles } from "./repoFiles";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const files = loadFiles(ROOT, ["apps/web/src"]).filter((f) => !/\.test\.tsx?$/.test(f.path) && !f.path.includes("/privacy/audit/"));
const copies: FunctionCopy[] = files.flatMap((f) => extractFunctions(f, "localDate"));
const groups = groupCopies(copies);
const ZONES = ["UTC", "America/Toronto", "Asia/Kolkata", "Pacific/Kiritimati", "Pacific/Pago_Pago", "America/St_Johns"];
const original = process.env.TZ;
afterEach(() => {
  if (original === undefined) delete process.env.TZ;
  else process.env.TZ = original;
});

/** The same date written another way: the day in the zone of the device, from the Canadian format. */
const reference = (d: Date): string => d.toLocaleDateString("en-CA");

// Days that break a careless version: the turn of a month and a year, a leap day, the change of clock, and the
// moments near midnight on both sides of UTC.
const MOMENTS = [
  "2026-01-01T00:00:00.000Z", "2026-01-01T04:59:59.999Z", "2026-01-31T23:59:59.999Z", "2026-02-28T23:30:00.000Z", "2028-02-29T12:00:00.000Z",
  "2026-03-08T07:30:00.000Z", "2026-03-29T01:30:00.000Z", "2026-10-31T23:59:00.000Z", "2026-11-01T05:30:00.000Z", "2026-11-22T04:30:15.123Z",
  "2026-12-31T23:59:59.999Z", "2027-01-01T00:00:00.000Z", "2026-06-30T23:59:59.999Z", "2026-07-01T00:00:00.000Z", "2026-09-09T09:09:09.009Z",
].map((s) => new Date(s));

describe("the copies in the source", () => {
  it("are found, so the audit cannot pass by finding nothing", () => {
    expect(copies.length).toBeGreaterThanOrEqual(15);
    expect(new Set(copies.map((c) => c.path)).size).toBe(copies.length);
  });
  it("are all in the privacy folder", () => {
    for (const c of copies) expect(c.path.startsWith("apps/web/src/privacy/panel/"), c.path).toBe(true);
  });
  it("take one date and give a text", () => {
    for (const c of copies) expect(c.source, c.path).toMatch(/^function localDate\(d: Date\): string \{/);
  });
});

describe("what every copy gives", () => {
  it.each(ZONES)("is the date of the device in %s, for every copy and every moment", (tz) => {
    process.env.TZ = tz;
    for (const c of copies) {
      const f = compileCopy<[Date], string>(c);
      for (const m of MOMENTS) expect(f(m), `${c.path} at ${m.toISOString()} in ${tz}`).toBe(reference(m));
    }
  });
  it("is written as YYYY-MM-DD with two digits for the month and the day", () => {
    process.env.TZ = "UTC";
    for (const c of copies) expect(compileCopy<[Date], string>(c)(new Date("2026-03-04T05:06:07.000Z")), c.path).toBe("2026-03-04");
  });
  it("gives the same answer for every copy, on 400 moments across a year, in two zones", () => {
    for (const tz of ["America/Toronto", "Asia/Kolkata"]) {
      process.env.TZ = tz;
      const fns = copies.map((c) => compileCopy<[Date], string>(c));
      for (let k = 0; k < 400; k++) {
        const d = new Date(Date.UTC(2026, 0, 1) + k * 21 * 3_600_000 + k * 977);
        const answers = new Set(fns.map((f) => f(d)));
        expect(answers.size, `${tz} ${d.toISOString()}`).toBe(1);
      }
    }
  });
});

describe("known: what the copies are", () => {
  it("are the same text in every file, once the layout is made the same, apart from at most two forms", () => {
    expect(groups.length).toBeLessThanOrEqual(2);
    expect(groups[0]?.paths.length).toBeGreaterThanOrEqual(copies.length - 3);
  });
  it("are written out one by one rather than imported", () => {
    expect(copies.length).toBeGreaterThan(15);
  });
});

describe("known: the other way of writing today", () => {
  // Folders outside the privacy folder write "today" as the first ten characters of the UTC time. In the evening in
  // Toronto the two differ. This records both so the difference is not a surprise.
  const utcToday = (d: Date): string => d.toISOString().slice(0, 10);
  it("differs from the local date at 23:30 in Toronto", () => {
    process.env.TZ = "America/Toronto";
    const d = new Date("2026-11-22T04:30:15.123Z");
    const local = compileCopy<[Date], string>(copies[0] as FunctionCopy)(d);
    expect(local).toBe("2026-11-21");
    expect(utcToday(d)).toBe("2026-11-22");
  });
  it("is the same at midday in Toronto", () => {
    process.env.TZ = "America/Toronto";
    const d = new Date("2026-11-22T17:00:00.000Z");
    expect(compileCopy<[Date], string>(copies[0] as FunctionCopy)(d)).toBe(utcToday(d));
  });
  it("is used outside the privacy folder, in the source", () => {
    const users = files.filter((f) => !f.path.includes("/privacy/") && /toISOString\(\)\s*\.slice\(0,\s*10\)/.test(f.text));
    expect(users.length).toBeGreaterThan(5);
  });
});
