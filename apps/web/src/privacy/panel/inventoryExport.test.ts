import { describe, expect, it } from "vitest";
import { EXTRA_STRINGS } from "./copyExtra";
import { FIXTURE } from "./fixtures.test-util";
import { csvCell, inventoryAsCsv, inventoryAsText } from "./inventoryExport";
import type { InventoryEntry } from "./inventory";

const NOW = new Date(2026, 10, 15, 9, 0, 0);

/** A small RFC 4180 reader, so the tests check the file as a spreadsheet would read it. */
function parseCsv(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? "";
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\r" && text[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 1;
    } else cell += ch;
  }
  return rows;
}

describe("csvCell", () => {
  it("leaves plain text alone", () => {
    expect(csvCell("Saved places")).toBe("Saved places");
  });
  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell("a\rb")).toBe('"a\rb"');
  });
  it("quotes the chosen delimiter", () => {
    expect(csvCell("a;b", ";")).toBe('"a;b"');
    expect(csvCell("a,b", ";")).toBe("a,b");
  });
  it.each(["=SUM(A1)", "+1", "-1", "@cmd", "\tx", "\rx"])("defuses a leading formula character in %j", (v) => {
    expect(csvCell(v).replace(/^"/, "")).toMatch(/^'/);
  });
  it("does not touch a minus or equals sign that is not first", () => {
    expect(csvCell("a-b=c")).toBe("a-b=c");
  });
});

describe("inventoryAsCsv", () => {
  it("writes a header row in the chosen language, then one row per entry, with CRLF line ends", () => {
    const f = inventoryAsCsv("en", FIXTURE, NOW);
    const rows = parseCsv(f.text);
    expect(rows[0]).toEqual(EXTRA_STRINGS.en.csvHeader);
    expect(rows).toHaveLength(1 + FIXTURE.length);
    expect(f.text.endsWith("\r\n")).toBe(true);
    expect(f.count).toBe(FIXTURE.length);
    expect(f.mime).toBe("text/csv");
  });
  it("every row has as many cells as the header", () => {
    for (const loc of ["en", "fr"] as const) {
      const rows = parseCsv(inventoryAsCsv(loc, FIXTURE, NOW).text);
      for (const r of rows) expect(r).toHaveLength(8);
    }
  });
  it("writes missing fields as the word for unknown, never blank or invented", () => {
    const settings = parseCsv(inventoryAsCsv("en", FIXTURE, NOW).text).find((r) => r[0] === "Settings");
    expect(settings).toEqual(["Settings", "Not known", "Not known", "Not known", "Test fixture", "2026-11-13", "", ""]);
    const fr = parseCsv(inventoryAsCsv("fr", FIXTURE, NOW).text).find((r) => r[0] === "Réglages");
    expect(fr?.slice(1, 4)).toEqual(["Inconnu", "Inconnu", "Inconnu"]);
  });
  it("writes the stored names, and unknown for an on-device entry that names none", () => {
    const entries: InventoryEntry[] = [
      { ...(FIXTURE[0] as InventoryEntry), storageKeys: ["a.v1", "cache.*"] },
      { ...(FIXTURE[0] as InventoryEntry), id: "b", label: { en: "B", fr: "B" } },
      { ...(FIXTURE[1] as InventoryEntry), id: "c", label: { en: "C", fr: "C" } },
    ];
    const rows = parseCsv(inventoryAsCsv("en", entries, NOW).text);
    expect(rows.find((r) => r[0] === "Saved places")?.[7]).toBe("a.v1 cache.*");
    expect(rows.find((r) => r[0] === "B")?.[7]).toBe("Not known");
    expect(rows.find((r) => r[0] === "C")?.[7]).toBe("");
  });
  it("keeps the licence and the record date", () => {
    const row = parseCsv(inventoryAsCsv("en", FIXTURE, NOW).text).find((r) => r[0] === "Feedback <note>");
    expect(row?.[5]).toBe("2026-11-14");
    expect(row?.[6]).toBe("CC0-1.0");
  });
  it("defuses a label that starts like a formula", () => {
    const e: InventoryEntry = { ...(FIXTURE[0] as InventoryEntry), label: { en: "=HYPERLINK(1)", fr: "=HYPERLINK(1)" } };
    const rows = parseCsv(inventoryAsCsv("en", [e], NOW).text);
    expect(rows[1]?.[0]).toBe("'=HYPERLINK(1)");
  });
  it("round-trips commas, quotes and accents", () => {
    const e: InventoryEntry = { ...(FIXTURE[0] as InventoryEntry), label: { en: 'A, "B"', fr: "Café, « thé »" } };
    expect(parseCsv(inventoryAsCsv("en", [e], NOW).text)[1]?.[0]).toBe('A, "B"');
    expect(parseCsv(inventoryAsCsv("fr", [e], NOW).text, ",")[1]?.[0]).toBe("Café, « thé »");
  });
  it("can use a semicolon, as French spreadsheets expect", () => {
    const f = inventoryAsCsv("fr", FIXTURE, NOW, ";");
    expect(parseCsv(f.text, ";")[0]).toEqual(EXTRA_STRINGS.fr.csvHeader);
    expect(f.text.split("\r\n")[0]).toContain(";");
  });
  it("sorts rows by label in the chosen language", () => {
    const labels = parseCsv(inventoryAsCsv("en", FIXTURE, NOW).text).slice(1).map((r) => r[0]);
    expect(labels).toEqual(["Feedback <note>", "Saved places", "Settings"]);
  });
  it("names the file with the local date, per language", () => {
    expect(inventoryAsCsv("en", FIXTURE, NOW).filename).toBe("the-app-data-list-2026-11-15.csv");
    expect(inventoryAsCsv("fr", FIXTURE, NOW).filename).toBe("l-app-liste-des-donnees-2026-11-15.csv");
  });
  it("handles an empty list", () => {
    const f = inventoryAsCsv("en", [], NOW);
    expect(parseCsv(f.text)).toHaveLength(1);
    expect(f.count).toBe(0);
  });
});

describe("inventoryAsText", () => {
  it("starts with the title and the review date", () => {
    const t = inventoryAsText("en", FIXTURE, NOW, "2026-11-15").text.split("\n");
    expect(t[0]).toBe("The App: where your data is kept");
    expect(t[1]).toBe("Last reviewed: 2026-11-15");
    expect(t[2]).toBe("");
  });
  it("omits the review line when no date is given", () => {
    expect(inventoryAsText("en", FIXTURE, NOW).text).not.toContain("Last reviewed");
  });
  it("writes each entry as a block with its fields, and Not known for missing ones", () => {
    const t = inventoryAsText("en", FIXTURE, NOW).text;
    expect(t).toContain("Saved places\n  Where it is kept: Stays on this device\n  Why: Show them again next time");
    expect(t).toContain("Settings\n  Where it is kept: Not known\n  Why: Not known\n  How long: Not known");
  });
  it("leaves out empty fields such as a missing licence", () => {
    const settings = inventoryAsText("en", FIXTURE, NOW).text.split("\n\n").find((b) => b.startsWith("Settings")) ?? "";
    expect(settings).not.toContain("Licence");
  });
  it("French uses U+00A0 before every colon and the French field names", () => {
    const t = inventoryAsText("fr", FIXTURE, NOW, "2026-11-15").text;
    expect(t).toContain("L’App\u00a0: où vos données sont conservées");
    expect(t).toContain("Dernière révision\u00a0: 2026-11-15");
    expect(t).toContain("  Où c’est conservé\u00a0: Reste sur cet appareil");
    expect(t).not.toMatch(/[A-Za-zé] ?:(?= )/u);
  });
  it("ends with one newline and names the file", () => {
    const f = inventoryAsText("en", FIXTURE, NOW);
    expect(f.text.endsWith("\n\n")).toBe(false);
    expect(f.text.endsWith("\n")).toBe(true);
    expect(f.filename).toBe("the-app-data-list-2026-11-15.txt");
    expect(f.mime).toBe("text/plain");
  });
});
