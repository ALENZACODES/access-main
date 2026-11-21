import { describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { parseCsv, undoFormulaGuard } from "./csvParse";
import { lintCopy } from "./copyLint";
import { notice } from "./elevatorFixtures";
import { CSV_COLUMNS, exportFileName, noticesToCsv, noticesToText, queryLine } from "./elevatorExport";
import { EMPTY_ELEVATOR_QUERY, viewElevators } from "./elevatorView";
import { parseElevatorNotices } from "./packElevators";
import { lintFrench } from "./typography";

const TODAY = "2026-11-21";
const shipped = parseElevatorNotices((JSON.parse(contentText) as { elevator_status: unknown[] }).elevator_status).notices;
const rows = (csv: string): string[][] => {
  const r = parseCsv(csv.replace(/^\uFEFF/, ""));
  if (!r.ok) throw new Error("csv did not parse");
  return r.rows as string[][];
};

describe("noticesToCsv", () => {
  it("starts with the column names, one row per notice, CRLF lines", () => {
    const csv = noticesToCsv(shipped, TODAY);
    expect(csv.split("\r\n")[0]).toBe(CSV_COLUMNS.join(","));
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.split("\r\n")).toHaveLength(shipped.length + 2);
  });
  it("can start with a byte order mark", () => {
    expect(noticesToCsv([], TODAY, { bom: true }).charCodeAt(0)).toBe(0xfeff);
    expect(noticesToCsv([], TODAY).charCodeAt(0)).not.toBe(0xfeff);
  });
  it("has the header and nothing more for no notices", () => {
    expect(noticesToCsv([], TODAY)).toBe(`${CSV_COLUMNS.join(",")}\r\n`);
  });
  it("carries the words, the reading, the time, the age and the source of each notice", () => {
    const [head, first] = rows(noticesToCsv(shipped, TODAY));
    const row = Object.fromEntries(head!.map((h, i) => [h, first![i]]));
    expect(row.station).toBe("Cedarvale");
    expect(row.elevator).toBe("ELV02-B");
    expect(row.notice_says).toBe("out-of-service");
    expect(row.between).toContain("upper concourse");
    expect(row.notice_text).toContain("Elevator ELV02-B out of service");
    expect(row.checked_at).toBe("2026-11-13T19:48:29.000Z");
    expect(row.days_since_check).toBe("8");
    expect(row.stop_ids).toBe("16069 13832 13831 16070");
    expect(row.source).toBe("TTC GTFS-Realtime accessibility alerts");
    expect(row.licence).toBe("OGL-Toronto-1.0");
    expect(row.retrieved).toBe("2026-11-13");
    expect(row.tier).toBe("0");
  });
  it("writes UNKNOWN for each part a notice does not state, never a blank", () => {
    const [head, first] = rows(noticesToCsv([notice({ station: null, text: null, stopIds: [], checkedAt: null, checkedDay: null, sourceName: null, licence: null, retrievedOn: null, tier: null })], TODAY));
    const row = Object.fromEntries(head!.map((h, i) => [h, first![i]]));
    for (const k of CSV_COLUMNS) expect(row[k], k).toBe("UNKNOWN");
  });
  it("has the same number of cells in every row", () => {
    for (const r of rows(noticesToCsv(shipped, TODAY))) expect(r).toHaveLength(CSV_COLUMNS.length);
  });
  it("quotes commas, quotes and line breaks and reads back the same", () => {
    const text = 'Pape: Elevator 1, "out" of service\nsee below';
    const [, r] = rows(noticesToCsv([notice({ text })], TODAY));
    expect(r?.[CSV_COLUMNS.indexOf("notice_text")]).toBe(text);
  });
  it("neutralises a cell that would run as a formula", () => {
    for (const bad of ["=1+1", "+1", "-1", "@SUM(A1)"]) {
      const csv = noticesToCsv([notice({ text: bad, station: bad })], TODAY);
      const [, r] = rows(csv);
      expect(r?.[0]?.startsWith("'"), bad).toBe(true);
      expect(undoFormulaGuard(r![0]!)).toBe(bad);
    }
  });
});

describe("noticesToText", () => {
  const v = viewElevators(shipped, EMPTY_ELEVATOR_QUERY, TODAY, "en");
  const text = noticesToText(v.groups, TODAY, "en");
  it("has the title, the lead and the day", () => {
    expect(text.startsWith("Saved elevator notices\n======================")).toBe(true);
    expect(text).toContain("They are not live and may be out of date.");
    expect(text).toContain("As of 21 November 2026.");
  });
  it("has each station with its notice in the operator's words", () => {
    for (const n of shipped) {
      expect(text).toContain(`${n.station}\n${"-".repeat(n.station!.length)}`);
      expect(text).toContain(n.text!);
    }
  });
  it("states what was read, the age, the stop ids and the source for each", () => {
    expect(text).toContain("Elevator: ELV02-B");
    expect(text).toContain("The notice says: Out of service");
    expect(text).toContain("Reason given: Maintenance");
    expect(text).toContain("Last checked on 13 November 2026, 8 days before today. This is a saved copy.");
    expect(text).toContain("Stop ids in the notice: 16069, 13832, 13831, 16070.");
    expect(text).toContain("Source: TTC GTFS-Realtime accessibility alerts. Licence: OGL-Toronto-1.0. Retrieved 13 November 2026. Tier 0, saved copy.");
  });
  it("says there is nothing to show for no groups", () => {
    expect(noticesToText([], TODAY, "en")).toContain("No notices to show.");
  });
  it("says what the search was when one is given", () => {
    const filtered = viewElevators(shipped, { ...EMPTY_ELEVATOR_QUERY, text: "pape" }, TODAY, "en");
    const t = noticesToText(filtered.groups, TODAY, "en", { ...EMPTY_ELEVATOR_QUERY, text: "pape" });
    expect(t).toContain('search "pape".');
    expect(t).not.toContain("Cedarvale");
  });
  it("says the notice has no words when it has none", () => {
    const t = noticesToText(viewElevators([notice({ text: null })], EMPTY_ELEVATOR_QUERY, TODAY, "en").groups, TODAY, "en");
    expect(t).toContain("The notice has no words.");
  });
  it("is in French with the French colon spacing, clean of English wording", () => {
    const fr = noticesToText(viewElevators(shipped, EMPTY_ELEVATOR_QUERY, TODAY, "fr").groups, TODAY, "fr");
    expect(fr).toContain("Avis d’ascenseur enregistrés");
    expect(fr).toContain("Ascenseur\u00a0: ELV02-B");
    expect(fr).toContain("En date du 21 novembre 2026.");
    expect(fr).not.toContain("The notice says");
  });
  it("never says an elevator works", () => {
    for (const l of ["en", "fr"] as const) {
      const t = noticesToText(viewElevators(shipped, EMPTY_ELEVATOR_QUERY, TODAY, l).groups, TODAY, l);
      expect(t).not.toMatch(/\b(working|available|disponible|fonctionne)\b/i);
    }
  });
  it("has no line that the copy linter or the French linter rejects", () => {
    for (const l of ["en", "fr"] as const) {
      const t = noticesToText(viewElevators(shipped, EMPTY_ELEVATOR_QUERY, TODAY, l).groups, TODAY, l);
      for (const line of t.split("\n").filter((x) => x && !shipped.some((n) => x === n.text))) {
        if (!/^Source/.test(line)) expect(lintCopy(line, l), `${l}: ${line}`).toEqual([]);
        if (l === "fr" && !/^(Source|Licence|Stop)/.test(line)) expect(lintFrench(line), line).toEqual([]);
      }
    }
  });
});

describe("queryLine", () => {
  it("says all notices for no search and no filter", () => {
    expect(queryLine(EMPTY_ELEVATOR_QUERY, "en")).toBe("All saved notices.");
    expect(queryLine(EMPTY_ELEVATOR_QUERY, "fr")).toBe("Tous les avis enregistrés.");
  });
  it("names the search and the filter", () => {
    expect(queryLine({ text: " pape ", band: "older", sort: "station" }, "en")).toBe('search "pape"; age filter: older.');
    expect(queryLine({ text: "", band: "same-day", sort: "station" }, "en")).toBe("age filter: same-day.");
  });
  it("is in French with the French quotes", () => {
    expect(queryLine({ text: "pape", band: "all", sort: "station" }, "fr")).toBe("recherche \u00ab\u202fpape\u202f\u00bb.");
  });
});

describe("exportFileName", () => {
  it("has the day and the kind", () => {
    expect(exportFileName("csv", TODAY)).toBe("elevator-notices-2026-11-21.csv");
    expect(exportFileName("txt", TODAY)).toBe("elevator-notices-2026-11-21.txt");
  });
});
