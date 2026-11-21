import { describe, expect, it } from "vitest";
import { MEET_UP_ORDERS, buildMeetUp } from "./meetUp";
import { MEET_UP_CSV_FILENAMES, MEET_UP_FILENAMES, meetUpApartText, meetUpCaveat, meetUpCountText, meetUpOrderHelp, meetUpOrderLabel, meetUpPointText, meetUpRowText, meetUpStatus, meetUpToCsv, meetUpToText, nearerText } from "./meetUpCopy";
import { bare, place } from "./placeFixtures";
import { lintFrench } from "./typography";

const A = { lat: 43.65, lon: -79.4 };
const B = { lat: 43.65, lon: -79.36 };
const ps = [place("p1", { name: "Alpha", lat: 43.6501, lon: -79.395 }), place("p2", { name: "Beta, \"B\"", lat: 43.6501, lon: -79.37 }), bare("none")];
const r = buildMeetUp(ps, A, B);
const LOCALES = ["en", "fr"] as const;

describe("meetUpPointText", () => {
  it("uses a point in English and a comma with a narrow space before the semicolon in French", () => {
    expect(meetUpPointText({ lat: 43.65, lon: -79.38 }, "en")).toBe("43.65000, -79.38000");
    expect(meetUpPointText({ lat: 43.65, lon: -79.38 }, "fr")).toBe("43,65000 ; -79,38000");
  });
});

describe("labels", () => {
  it("every order has a distinct label and help line in both languages", () => {
    for (const l of LOCALES) {
      expect(new Set(MEET_UP_ORDERS.map((o) => meetUpOrderLabel(o, l))).size).toBe(4);
      expect(new Set(MEET_UP_ORDERS.map((o) => meetUpOrderHelp(o, l))).size).toBe(4);
    }
  });
  it("French differs from English", () => {
    for (const o of MEET_UP_ORDERS) {
      expect(meetUpOrderLabel(o, "fr")).not.toBe(meetUpOrderLabel(o, "en"));
      expect(meetUpOrderHelp(o, "fr")).not.toBe(meetUpOrderHelp(o, "en"));
    }
  });
  it("the caveat says straight lines, not routes, not a recommendation", () => {
    expect(meetUpCaveat("en")).toMatch(/straight lines/);
    expect(meetUpCaveat("en")).toMatch(/not routes/);
    expect(meetUpCaveat("en")).toMatch(/not a recommendation/);
    expect(meetUpCaveat("fr")).toMatch(/lignes droites/);
    expect(meetUpCaveat("fr")).toMatch(/pas des itinéraires/);
  });
  it("names which point is nearer", () => {
    expect(nearerText("a", "en")).toContain("first");
    expect(nearerText("b", "en")).toContain("second");
    expect(nearerText("same", "en")).toContain("same");
    expect(nearerText("a", "fr")).toContain("premier");
    expect(nearerText("b", "fr")).toContain("deuxième");
  });
});

describe("sentences", () => {
  it("states the distance between the points and the middle", () => {
    expect(meetUpApartText(r, "en")).toContain(" apart in a straight line");
    expect(meetUpApartText(r, "en")).toContain(meetUpPointText(r.middle, "en"));
    expect(meetUpApartText(r, "fr")).toContain("en ligne droite");
  });
  it("counts places measured and those with no map point", () => {
    expect(meetUpCountText(r, "en")).toBe("2 places measured from both points. 1 with no map point: UNKNOWN.");
    expect(meetUpCountText(r, "fr")).toContain("2 lieux mesurés");
    expect(meetUpCountText(buildMeetUp([ps[0]!], A, B), "en")).toBe("1 place measured from both points.");
    expect(meetUpCountText(buildMeetUp([ps[0]!], A, B), "fr")).toContain("1 lieu mesuré ");
    expect(meetUpCountText(buildMeetUp([bare("z")], A, B), "en")).toContain("No places with a map point");
    expect(meetUpCountText(buildMeetUp([], A, B), "fr")).toContain("Aucun lieu");
  });
  it("describes a row with both distances and which is nearer by how much", () => {
    const row = r.rows.find((x) => x.id === "p1")!;
    const en = meetUpRowText(row, "en");
    expect(en).toMatch(/^Alpha: .* from the first point, .* from the second; nearer the first point by /);
    expect(meetUpRowText(row, "fr")).toContain("du premier point");
  });
  it("says the same distance for a tie and uses UNKNOWN for no name", () => {
    const row = { ...r.rows[0]!, name: null, nearer: "same" as const, gap: 0 };
    expect(meetUpRowText(row, "en")).toMatch(/^UNKNOWN: .*; the same distance from both\.$/);
  });
  it("reports the status", () => {
    expect(meetUpStatus("a", 5, 12, "en")).toBe("Ordered by: Nearest to the first point. Showing 5 of 12.");
    expect(meetUpStatus("a", 5, 12, "fr")).toContain("5 affichés sur 12");
  });
});

describe("text export", () => {
  for (const l of LOCALES) {
    it(`${l}: lists both points, the caveat, every placed row in order and the places with no point`, () => {
      const txt = meetUpToText(r, A, B, l);
      expect(txt.endsWith("\n")).toBe(true);
      expect(txt).toContain(meetUpCaveat(l));
      expect(txt).toContain(meetUpPointText(A, l));
      expect(txt).toContain(meetUpPointText(B, l));
      r.rows.forEach((row, i) => expect(txt).toContain(`${i + 1}. ${meetUpRowText(row, l)}`));
      expect(txt).toContain("none");
    });
  }
  it("omits the no-point line when every place has one", () => {
    expect(meetUpToText(buildMeetUp([ps[0]!], A, B), A, B, "en")).not.toContain("No map point");
  });
});

describe("csv export", () => {
  it("has a BOM, CRLF lines, and nine columns on each row", () => {
    const csv = meetUpToCsv(r, ps, "en");
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines.pop()).toBe("");
    expect(lines).toHaveLength(1 + 2 + 1);
    expect(lines[0]).toBe("Position,Place,Id,Metres from first point,Metres from second point,Longer distance (metres),Total (metres),Difference (metres),Nearer");
  });
  it("quotes a name with a comma and quotes, and gives UNKNOWN for what is not known", () => {
    const csv = meetUpToCsv(r, ps, "en");
    expect(csv).toContain('"Beta, ""B"""');
    expect(csv).toContain("UNKNOWN,UNKNOWN,none,UNKNOWN,UNKNOWN,UNKNOWN,UNKNOWN,UNKNOWN,UNKNOWN");
  });
  it("carries whole-metre numbers for each row", () => {
    const csv = meetUpToCsv(r, ps, "fr");
    for (const x of r.rows) expect(csv).toContain(`,${x.id},${x.metresA},${x.metresB},${x.longer},${x.total},${x.gap},`);
    expect(csv).toContain("Écart (mètres)");
  });
  it("names the files for each language", () => {
    expect(MEET_UP_FILENAMES.en).toMatch(/\.txt$/);
    expect(MEET_UP_CSV_FILENAMES.fr).toMatch(/\.csv$/);
    expect(new Set([...Object.values(MEET_UP_FILENAMES), ...Object.values(MEET_UP_CSV_FILENAMES)]).size).toBe(4);
  });
});

describe("French typography", () => {
  it("every French string passes lintFrench", () => {
    const out: string[] = [meetUpCaveat("fr"), meetUpApartText(r, "fr"), meetUpCountText(r, "fr"), meetUpStatus("b", 3, 9, "fr"), nearerText("a", "fr"), nearerText("b", "fr"), nearerText("same", "fr")];
    for (const o of MEET_UP_ORDERS) out.push(meetUpOrderLabel(o, "fr"), meetUpOrderHelp(o, "fr"));
    for (const row of r.rows) out.push(meetUpRowText(row, "fr"));
    out.push(...meetUpToText(r, A, B, "fr").split("\n"));
    for (const s of out) expect(lintFrench(s), s).toEqual([]);
  });
});

describe("exports with paces", () => {
  const paces = { a: 5, b: null };
  it("text adds the note and the minutes to each row, and is unchanged with no pace", () => {
    const withPace = meetUpToText(r, A, B, "en", paces);
    expect(withPace).toContain("Streets, crossings, slopes and waiting make a real trip longer");
    for (const row of r.rows) expect(withPace).toMatch(new RegExp(`${row.position}\\. .*At least \\d+\\u00a0min for the first person\\.`));
    expect(meetUpToText(r, A, B, "en", { a: null, b: null })).toBe(meetUpToText(r, A, B, "en"));
    expect(meetUpToText(r, A, B, "en")).not.toContain("At least");
  });
  it("text in French passes lintFrench with paces", () => {
    for (const line of meetUpToText(r, A, B, "fr", { a: 5, b: 3 }).split("\n")) expect(lintFrench(line), line).toEqual([]);
  });
  it("csv adds two minute columns, UNKNOWN for a person without a pace, and keeps every row the same width", () => {
    const csv = meetUpToCsv(r, ps, "en", paces);
    const lines = csv.slice(1).split("\r\n").filter(Boolean);
    expect(lines[0]).toContain('"Least minutes, first person","Least minutes, second person"');
    const width = (l: string) => l.replace(/"(?:[^"]|"")*"/g, "x").split(",").length;
    const w = width(lines[0]!);
    expect(w).toBe(11);
    for (const l of lines.slice(1)) expect(width(l), l).toBe(w);
    const row = r.rows[0]!;
    expect(lines[1]).toContain(`,${row.gap},${Math.ceil(row.metresA / (5000 / 60))},UNKNOWN,`);
  });
  it("csv with no pace is the same as before", () => {
    expect(meetUpToCsv(r, ps, "en", { a: null, b: null })).toBe(meetUpToCsv(r, ps, "en"));
  });
});
