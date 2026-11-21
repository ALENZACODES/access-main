import { describe, expect, it } from "vitest";
import { ELEVATOR_AGE_BANDS, ELEVATOR_AGE_LIMITS, ageLine, bandForDays, bandName, noticeAge } from "./elevatorAge";
import { lintCopy } from "./copyLint";
import { lintFrench } from "./typography";

const at = (day: string | null) => ({ checkedDay: day });

describe("bandForDays", () => {
  it("puts each day count in its band at the edges", () => {
    expect(bandForDays(0)).toBe("same-day");
    expect(bandForDays(1)).toBe("within-3");
    expect(bandForDays(3)).toBe("within-3");
    expect(bandForDays(4)).toBe("within-week");
    expect(bandForDays(7)).toBe("within-week");
    expect(bandForDays(8)).toBe("older");
    expect(bandForDays(10_000)).toBe("older");
  });
  it("puts a negative count in future, never in a fresh band", () => {
    expect(bandForDays(-1)).toBe("future");
    expect(bandForDays(-400)).toBe("future");
  });
  it("puts a count that is not a number in unknown", () => {
    for (const n of [NaN, Infinity, -Infinity]) expect(bandForDays(n)).toBe("unknown");
  });
  it("uses the limits it exports", () => {
    expect([...ELEVATOR_AGE_LIMITS]).toEqual([0, 3, 7]);
    expect(ELEVATOR_AGE_BANDS).toEqual(["same-day", "within-3", "within-week", "older", "future", "unknown"]);
  });
});

describe("noticeAge", () => {
  it("counts whole days between the check day and today", () => {
    expect(noticeAge(at("2026-11-13"), "2026-11-21")).toEqual({ days: 8, band: "older" });
    expect(noticeAge(at("2026-11-21"), "2026-11-21")).toEqual({ days: 0, band: "same-day" });
    expect(noticeAge(at("2026-11-20"), "2026-11-21")).toEqual({ days: 1, band: "within-3" });
    expect(noticeAge(at("2026-11-14"), "2026-11-21")).toEqual({ days: 7, band: "within-week" });
  });
  it("counts across a month, a year and a leap day", () => {
    expect(noticeAge(at("2026-10-31"), "2026-11-01").days).toBe(1);
    expect(noticeAge(at("2026-12-31"), "2027-01-01").days).toBe(1);
    expect(noticeAge(at("2028-02-28"), "2028-03-01").days).toBe(2);
    expect(noticeAge(at("2027-02-28"), "2027-03-01").days).toBe(1);
  });
  it("is the same whichever way the clocks change, because it counts calendar days", () => {
    expect(noticeAge(at("2026-11-01"), "2026-11-02").days).toBe(1);
    expect(noticeAge(at("2026-03-08"), "2026-03-09").days).toBe(1);
  });
  it("reports a check after today as future", () => {
    expect(noticeAge(at("2026-11-22"), "2026-11-21")).toEqual({ days: -1, band: "future" });
  });
  it("reports no check day as unknown", () => {
    expect(noticeAge(at(null), "2026-11-21")).toEqual({ days: null, band: "unknown" });
  });
});

describe("ageLine", () => {
  const line = (day: string | null, today: string, l: "en" | "fr" = "en") => ageLine(at(day), noticeAge(at(day), today), l);
  it("says how many days before today, and that it is a saved copy", () => {
    expect(line("2026-11-13", "2026-11-21")).toBe("Last checked on 13 November 2026, 8 days before today. This is a saved copy.");
  });
  it("says one day in the singular", () => {
    expect(line("2026-11-20", "2026-11-21")).toContain("1 day before today");
  });
  it("says today for a check today, and still says saved copy", () => {
    expect(line("2026-11-21", "2026-11-21")).toBe("Last checked on 21 November 2026, today. This is a saved copy.");
  });
  it("says the date cannot be right when it is after today", () => {
    expect(line("2026-12-01", "2026-11-21")).toContain("cannot be right");
    expect(line("2026-12-01", "2026-11-21")).not.toContain("saved copy");
  });
  it("says the time is not recorded when it is not", () => {
    expect(line(null, "2026-11-21")).toBe("The time this notice was last checked is not recorded.");
  });
  it("is in French, with the first of the month as 1er", () => {
    expect(line("2026-11-01", "2026-11-09", "fr")).toBe("Dernier contrôle le 1er novembre 2026, 8 jours avant aujourd’hui. Ceci est une copie enregistrée.");
    expect(line("2026-11-08", "2026-11-09", "fr")).toContain("1 jour avant");
    expect(line("2026-11-09", "2026-11-09", "fr")).toContain("aujourd’hui");
  });
  it("is clean French and clean copy in every case", () => {
    for (const [d, today] of [["2026-11-13", "2026-11-21"], ["2026-11-21", "2026-11-21"], ["2026-12-01", "2026-11-21"], [null, "2026-11-21"], ["2026-11-20", "2026-11-21"]] as const) {
      expect(lintFrench(line(d, today, "fr")), String(d)).toEqual([]);
      for (const l of ["en", "fr"] as const) expect(lintCopy(line(d, today, l), l), `${l} ${d}`).toEqual([]);
    }
  });
  it("never says an elevator works, is available or is current", () => {
    for (const d of ["2026-11-21", "2026-11-13", "2026-12-01", null]) {
      for (const l of ["en", "fr"] as const) expect(line(d, "2026-11-21", l)).not.toMatch(/working|available|current|disponible|fonctionn|à jour/i);
    }
  });
});

describe("bandName", () => {
  it("names every band in both languages, all different", () => {
    for (const l of ["en", "fr"] as const) {
      const names = ELEVATOR_AGE_BANDS.map((b) => bandName(b, l));
      expect(new Set(names).size).toBe(ELEVATOR_AGE_BANDS.length);
      for (const n of names) expect(lintCopy(n, l), n).toEqual([]);
    }
    for (const b of ELEVATOR_AGE_BANDS) expect(lintFrench(bandName(b, "fr")), b).toEqual([]);
  });
  it("says what each fresh band means in days", () => {
    expect(bandName("within-3", "en")).toContain("1 to 3");
    expect(bandName("within-week", "en")).toContain("4 to 7");
  });
});
