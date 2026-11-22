import { describe, expect, it } from "vitest";
import { parseCsv } from "./csvParse";
import { withNote } from "./noteTopicFixtures";
import { checkPlaces } from "./tagNoteCheck";
import { TN_CSV_HEADER } from "./tagNoteCopy";
import { findingsCsvFile, findingsTextFile, findingsToCsv, findingsToText } from "./tagNoteExport";

const f = checkPlaces([
  withNote("a", "Two steps at the front, ramp at the side.", { wheelchair: "yes", name: "Alpha, \"Hall\"" }),
  withNote("b", "Step free entrance.", { wheelchair: "no", name: "=Evil" }),
  withNote("c", "Stairs only.", { wheelchair: "designated", name: null }),
]).findings;

describe("findingsToCsv", () => {
  const csv = findingsToCsv(f);
  const parsed = parseCsv(csv);
  it("has the header then one row per place", () => {
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.rows[0]).toEqual([...TN_CSV_HEADER]);
      expect(parsed.rows).toHaveLength(f.length + 1);
    }
  });
  it("round-trips names with commas and quotes and guards a formula", () => {
    if (parsed.ok) {
      expect(parsed.rows[1]![1]).toBe('Alpha, "Hall"');
      expect(parsed.rows[2]![1]).toBe("'=Evil");
      expect(parsed.rows[3]![1]).toBe("");
    }
  });
  it("gives the tag, kind and weight as fixed English tokens", () => {
    if (parsed.ok) {
      expect(parsed.rows[1]!.slice(2, 5)).toEqual(["yes", "yes-but-barrier", "mixed"]);
      expect(parsed.rows[2]!.slice(2, 5)).toEqual(["no", "no-but-access", "one-sided"]);
      expect(parsed.rows[3]![2]).toBe("designated");
    }
  });
  it("separates the words against the tag from the words with it", () => {
    if (parsed.ok) {
      expect(parsed.rows[1]![5]).toBe("steps");
      expect(parsed.rows[1]![6]).toBe("ramp");
      expect(parsed.rows[2]![6]).toBe("");
    }
  });
  it("carries the note as written", () => {
    if (parsed.ok) expect(parsed.rows[1]![7]).toBe("Two steps at the front, ramp at the side.");
  });
  it("ends with CRLF and has a byte order mark only when asked", () => {
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.startsWith("﻿")).toBe(false);
    expect(findingsToCsv(f, { bom: true }).startsWith("﻿")).toBe(true);
  });
  it("is only the header for no findings", () => {
    expect(findingsToCsv([])).toBe(`${TN_CSV_HEADER.join(",")}\r\n`);
  });
});

describe("findingsToText", () => {
  it("starts with the caveat and says either may be right", () => {
    const t = findingsToText(f, "en");
    expect(t.startsWith("Not a finding.")).toBe(true);
    expect(t).toContain("the pack does not say which");
  });
  it("lists each place with its tag, what it reads as, the marked words and the note", () => {
    const t = findingsToText(f, "en");
    expect(t).toContain('Alpha, "Hall" (a)');
    expect(t).toContain("Tag: yes");
    expect(t).toContain("The tag says yes; the note uses words that read as barriers.");
    expect(t).toContain("steps (barrier), ramp (access)");
    expect(t).toContain("Two steps at the front, ramp at the side.");
    expect(t).toContain("Name not in the pack (c)");
  });
  it("is in French when asked, with French direction words", () => {
    const t = findingsToText(f, "fr");
    expect(t).toContain("Ce n’est pas une conclusion.");
    expect(t).toContain("(obstacle)");
    expect(t).toContain("(accès)");
  });
  it("has no more than one blank line in a row", () => {
    expect(findingsToText(f, "en")).not.toMatch(/\n\n\n/);
  });
});

describe("files", () => {
  it("are named by language, CSV with a byte order mark", () => {
    expect(findingsCsvFile(f, "en").name).toBe("tag-and-note.csv");
    expect(findingsCsvFile(f, "fr").name).toBe("balise-et-note.csv");
    expect(findingsTextFile(f, "en").name).toBe("tag-and-note.txt");
    expect(findingsTextFile(f, "fr").name).toBe("balise-et-note.txt");
    expect(findingsCsvFile(f, "en").content.startsWith("﻿")).toBe(true);
    expect(findingsTextFile(f, "en").mime).toContain("text/plain");
  });
});
