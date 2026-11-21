import { describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { HELP_FINDING_CODES, HELP_STALE_DAYS, auditHelp, auditToText, daysBetween, findingText, summariseAudit, type HelpFindingCode } from "./helpAudit";
import { lintCopy } from "./copyLint";
import { help } from "./helpFixtures";
import { parseHelpNumbers } from "./packHelp";
import { lintFrench } from "./typography";

const TODAY = "2026-11-21";
const shipped = parseHelpNumbers((JSON.parse(contentText) as { help_numbers: unknown[] }).help_numbers).items;
const codes = (items: Parameters<typeof auditHelp>[0], today = TODAY) => auditHelp(items, today).map((f) => f.code);
const bare = help({ id: "b", name: { en: null, fr: null }, how: { en: null, fr: null }, contact: null, url: null, sourceName: null, sourceUrl: null, retrievedOn: null, tier: null });

describe("daysBetween", () => {
  it("counts whole days, forward and back", () => {
    expect(daysBetween("2026-11-13", "2026-11-21")).toBe(8);
    expect(daysBetween("2026-11-21", "2026-11-13")).toBe(-8);
    expect(daysBetween("2026-11-21", "2026-11-21")).toBe(0);
  });
  it("crosses month, year and leap day", () => {
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
    expect(daysBetween("2027-02-28", "2027-03-01")).toBe(1);
  });
  it("has no answer for a day that is not real", () => {
    for (const v of ["2026-02-30", "2026-13-01", "26-11-21", "2026-11-21T00:00", "", "x"]) {
      expect(daysBetween(v, TODAY), v).toBeNull();
      expect(daysBetween(TODAY, v), v).toBeNull();
    }
  });
});

describe("auditHelp on the shipped pack", () => {
  it("finds only the gaps the pack has: 911 has no source address and no page, and two entries sharing a page is not a gap", () => {
    expect(auditHelp(shipped, TODAY)).toEqual([
      { id: "emergency-911", code: "no-source-page", detail: null },
      { id: "emergency-911", code: "no-page", detail: null },
    ]);
  });
  it("finds an old copy once the copy is old enough", () => {
    const later = auditHelp(shipped, "2027-06-01");
    expect(later.filter((f) => f.code === "old-copy")).toHaveLength(6);
    expect(later.find((f) => f.code === "old-copy")?.detail).toBe("200");
  });
});

describe("auditHelp", () => {
  it("finds nothing for a complete entry", () => {
    expect(auditHelp([help()], TODAY)).toEqual([]);
    expect(auditHelp([], TODAY)).toEqual([]);
  });
  it("finds every gap in a bare entry, in the order of the codes", () => {
    expect(codes([bare])).toEqual(["no-number", "no-name-en", "no-name-fr", "no-how-en", "no-how-fr", "no-source", "no-source-page", "no-date", "no-tier", "no-page"]);
  });
  it("finds one language missing on its own", () => {
    expect(codes([help({ name: { en: "A", fr: null } })])).toEqual(["no-name-fr"]);
    expect(codes([help({ how: { en: null, fr: "B" } })])).toEqual(["no-how-en"]);
  });
  it("treats a text that is not a number as no number", () => {
    expect(codes([help({ contact: "no digits here" })])).toEqual(["no-number"]);
  });
  it("calls a copy old only past the limit", () => {
    const at = (days: number) => {
      const d = new Date(Date.UTC(2026, 10, 21) - days * 86_400_000).toISOString().slice(0, 10);
      return codes([help({ retrievedOn: d })]);
    };
    expect(at(HELP_STALE_DAYS)).toEqual([]);
    expect(at(HELP_STALE_DAYS + 1)).toEqual(["old-copy"]);
    expect(at(0)).toEqual([]);
  });
  it("gives the age in days", () => {
    expect(auditHelp([help({ retrievedOn: "2026-01-01" })], TODAY)[0]).toEqual({ id: "h", code: "old-copy", detail: "324" });
  });
  it("finds a date after today and does not also call it old", () => {
    expect(auditHelp([help({ retrievedOn: "2027-01-01" })], TODAY)).toEqual([{ id: "h", code: "future-date", detail: "2027-01-01" }]);
  });
  it("says nothing about age when today is not a real day", () => {
    expect(codes([help()], "not a day")).toEqual([]);
  });
  it("finds the same digits under two entries however they are written, and names the first", () => {
    const f = auditHelp([help({ id: "a", contact: "9-8-8" }), help({ id: "b", contact: "988" }), help({ id: "c", contact: "9 8 8" })], TODAY);
    expect(f).toEqual([{ id: "b", code: "same-number", detail: "a" }, { id: "c", code: "same-number", detail: "a" }]);
  });
  it("does not take different numbers for the same", () => {
    expect(codes([help({ id: "a", contact: "211" }), help({ id: "b", contact: "811" })])).toEqual([]);
  });
  it("keeps the pack's order of entries", () => {
    const f = auditHelp([help({ id: "z", contact: "211", tier: null }), help({ id: "a", contact: "911", tier: null })], TODAY);
    expect(f.map((x) => x.id)).toEqual(["z", "a"]);
  });
  it("does not change what it is given", () => {
    const items = [bare, help({ id: "x" })];
    const before = JSON.stringify(items);
    auditHelp(items, TODAY);
    expect(JSON.stringify(items)).toBe(before);
  });
});

describe("summariseAudit", () => {
  it("counts entries, entries with findings and each code", () => {
    const items = [bare, help({ id: "ok" })];
    const s = summariseAudit(items, auditHelp(items, TODAY));
    expect(s.entries).toBe(2);
    expect(s.entriesWithFindings).toBe(1);
    expect(s.byCode["no-number"]).toBe(1);
    expect(s.byCode["same-number"]).toBe(0);
    expect(Object.keys(s.byCode)).toEqual([...HELP_FINDING_CODES]);
  });
  it("counts an entry once however many findings it has", () => {
    expect(summariseAudit([bare], auditHelp([bare], TODAY)).entriesWithFindings).toBe(1);
  });
});

describe("findingText", () => {
  const every: HelpFindingCode[] = [...HELP_FINDING_CODES];
  it("has a clean sentence for every code in both languages", () => {
    for (const l of ["en", "fr"] as const) {
      for (const code of every) {
        const text = findingText({ id: "x", code, detail: "7" }, l);
        expect(text.length, code).toBeGreaterThan(5);
        expect(lintCopy(text, l), `${l} ${code}`).toEqual([]);
        if (l === "fr") expect(lintFrench(text), code).toEqual([]);
      }
    }
  });
  it("uses the detail where it has a place", () => {
    expect(findingText({ id: "x", code: "old-copy", detail: "324" }, "en")).toBe("This copy is 324 days old.");
    expect(findingText({ id: "x", code: "same-number", detail: "a" }, "fr")).toBe("Les mêmes chiffres sont enregistrés sous a.");
  });
  it("never says a number works, is open or was checked", () => {
    for (const l of ["en", "fr"] as const) for (const code of every) expect(findingText({ id: "x", code, detail: "1" }, l)).not.toMatch(/works|working|open|verified|vérifi|valid|correct/i);
  });
});

describe("auditToText", () => {
  it("says no gaps were found for a complete pack", () => {
    const t = auditToText([help()], TODAY, "en");
    expect(t).toContain("1 entries, 0 with findings.");
    expect(t).toContain("No gaps were found in what is saved.");
  });
  it("lists each entry with findings under its id", () => {
    const t = auditToText([bare, help({ id: "ok" })], TODAY, "en");
    expect(t).toContain("\nb\n- No number is saved.\n- No English name is saved.");
    expect(t).not.toContain("\nok\n");
    expect(t.endsWith("\n")).toBe(true);
  });
  it("is in French", () => {
    const t = auditToText([bare], TODAY, "fr");
    expect(t).toContain("Contrôle des numéros d’aide enregistrés");
    expect(t).toContain("- Aucun numéro n’est enregistré.");
  });
  it("has a title underline as long as the title", () => {
    const [title, rule] = auditToText([], TODAY, "en").split("\n");
    expect(rule).toBe("=".repeat(title!.length));
  });
});
