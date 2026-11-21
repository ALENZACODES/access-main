import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { REGISTER_STRINGS, registerAsCsv, registerAsText, registerLines } from "./registerExport";
import { STORAGE_REGISTER, UNSCANNED, type RegisterRow } from "./storageRegister";

const NOW = new Date(2026, 10, 19, 9, 0, 0);
const SMALL: RegisterRow[] = [
  { key: "access.a", path: "p", holds: { en: "Zebra", fr: "Zèbre" }, gated: true, reach: "panel", source: "S", recordedOn: "2026-11-01" },
  { key: "app.b", path: "p", holds: { en: "Apple", fr: "Pomme" }, gated: false, reach: "elsewhere", source: "S", recordedOn: "2026-11-02" },
];

describe("registerLines", () => {
  it("sorts by the item in the page language and says yes or no", () => {
    expect(registerLines("en", SMALL, [])).toEqual([
      { item: "Apple", choice: "No", erase: "No", source: "S", recordedOn: "2026-11-02" },
      { item: "Zebra", choice: "Yes", erase: "Yes", source: "S", recordedOn: "2026-11-01" },
    ]);
    expect(registerLines("fr", SMALL, []).map((l) => l.item)).toEqual(["Pomme", "Zèbre"]);
    expect(registerLines("fr", SMALL, [])[0]?.erase).toBe("Non");
  });
  it("lists unread storage last and marks it not confirmed", () => {
    const lines = registerLines("en", SMALL, UNSCANNED);
    const last = lines[lines.length - 1];
    expect(last).toMatchObject({ choice: "Not confirmed", erase: "Not confirmed", source: REGISTER_STRINGS.en.unconfirmedSource });
    expect(lines).toHaveLength(SMALL.length + UNSCANNED.length);
  });
  it("covers the real register", () => {
    expect(registerLines("en", STORAGE_REGISTER, UNSCANNED)).toHaveLength(STORAGE_REGISTER.length + UNSCANNED.length);
  });
});

describe("registerAsCsv", () => {
  it("has a header row, one row per item, and a dated file name", () => {
    const f = registerAsCsv("en", SMALL, [], NOW);
    expect(f.filename).toBe("the-app-what-is-kept-2026-11-19.csv");
    expect(f.mime).toBe("text/csv");
    expect(f.count).toBe(2);
    expect(f.text.split("\r\n")).toEqual([
      "Item,Needs your choice before saving,Reached by the erase button,Source,Recorded on",
      "Apple,No,No,S,2026-11-02",
      "Zebra,Yes,Yes,S,2026-11-01",
      "",
    ]);
  });
  it("uses the semicolon in French spreadsheets, and defuses a cell that starts like a formula", () => {
    const risky: RegisterRow[] = [{ ...SMALL[0]!, holds: { en: "=1+1", fr: "=1+1" }, source: "a;b" }];
    const f = registerAsCsv("fr", risky, [], NOW, ";");
    expect(f.filename).toBe("l-app-ce-qui-est-conserve-2026-11-19.csv");
    expect(f.text).toContain("'=1+1;Oui;Oui;\"a;b\";2026-11-01");
  });
  it("never writes a storage key", () => {
    const f = registerAsCsv("en", STORAGE_REGISTER, UNSCANNED, NOW);
    for (const r of STORAGE_REGISTER) expect(f.text).not.toContain(r.key);
  });
});

describe("registerAsText", () => {
  it("writes a title and four labelled lines per item", () => {
    const f = registerAsText("en", SMALL, [], NOW);
    expect(f.filename).toBe("the-app-what-is-kept-2026-11-19.txt");
    expect(f.mime).toBe("text/plain");
    expect(f.text.startsWith("What the App keeps on this device\n\nApple\n")).toBe(true);
    expect(f.text).toContain("  Needs your choice before saving: No\n");
    expect(f.text).toContain("  Reached by the erase button: Yes\n");
    expect(f.text).toContain("  Recorded on: 2026-11-01\n");
    expect(f.text.endsWith("\n")).toBe(true);
  });
  it("puts a no-break space before the colon in French", () => {
    const f = registerAsText("fr", SMALL, [], NOW);
    expect(f.text).toContain("  Source : S\n");
    expect(f.text).toContain("Touché par le bouton d’effacement : Non\n");
  });
});

describe("wording", () => {
  it("passes the copy lint in both languages", () => {
    for (const loc of ["en", "fr"] as const) {
      const s = REGISTER_STRINGS[loc];
      const texts: string[] = [s.title, s.yes, s.no, s.notConfirmed, s.unconfirmedSource, ...s.header, ...Object.values(s.line)];
      for (const l of registerLines(loc, STORAGE_REGISTER, UNSCANNED)) texts.push(l.item, l.choice, l.erase);
      for (const t of texts) expect(lintCopy(loc, t), t).toEqual([]);
    }
  });
});
