import { describe, expect, it } from "vitest";
import { lcg } from "./placeFixtures";
import { PART_KINDS, foldVenueName, readName, venueDisplayBase } from "./venueName";

const WORDS = ["Sankofa", "Square", "Entrance", "Elevator", "Parking", "from", "via", "(PATH)", "The", "La", "Entrée", "Ascenseur", "de", "du", "Hall", "North", "Main", "Underground", "&", "-", "Jack", "Astor's", "L’Église", "12", "Door", "Gate", "Ramp", "Toilettes", "[side]", "Café", "UNKNOWN"];
function name(next: () => number): string {
  const n = 1 + Math.floor(next() * 6);
  return Array.from({ length: n }, () => WORDS[Math.floor(next() * WORDS.length)]!).join(next() < 0.9 ? " " : "  ");
}

describe("readName on many generated names", () => {
  const next = lcg(77);
  const names = Array.from({ length: 4000 }, () => name(next));
  it("never throws", () => {
    for (const n of names) expect(() => readName(n), n).not.toThrow();
  });
  it("gives a known kind and a base that is null or non-empty", () => {
    for (const n of names) {
      const r = readName(n);
      expect(PART_KINDS, n).toContain(r.kind);
      if (r.base !== null) expect(r.base.length, n).toBeGreaterThan(0);
    }
  });
  it("a main place has no part words, and any other kind has at least one", () => {
    for (const n of names) {
      const r = readName(n);
      if (r.kind === "main") expect(r.partWords, n).toEqual([]);
      else expect(r.partWords.length, n).toBeGreaterThan(0);
    }
  });
  it("a base is folded: no upper case, no accents, no double spaces, no brackets", () => {
    for (const n of names) {
      const b = readName(n).base;
      if (b === null) continue;
      expect(b, n).toBe(b.toLowerCase());
      expect(b, n).not.toMatch(/[\u0300-\u036f\u00e0-\u00ff()[\]]/);
      expect(b, n).not.toContain("  ");
      expect(b.trim(), n).toBe(b);
    }
  });
  it("a base never contains a part word", () => {
    for (const n of names) {
      const r = readName(n);
      for (const w of r.partWords) expect((r.base ?? "").split(" "), n).not.toContain(w);
    }
  });
  it("is the same for the same name every time, and unchanged by case", () => {
    for (const n of names.slice(0, 600)) {
      expect(readName(n), n).toEqual(readName(n));
      expect(readName(n.toUpperCase()).base, n).toBe(readName(n.toLowerCase()).base);
    }
  });
  it("adding a part word to a name with a base keeps the base", () => {
    let checked = 0;
    for (const n of names) {
      const r = readName(n);
      // Link and direction words at the edge of a name are only dropped once a part word is present, so those names are left out.
      if (r.kind !== "main" || r.base === null || r.base.split(" ").length < 2 || /^(from|via|main|north|underground|de|du)\b|\b(from|via|main|north|underground|de|du)$/i.test(foldVenueName(n.replace(/\([^)]*\)|\[[^\]]*\]/g, " ")))) continue;
      const withPart = readName(`${n} Entrance`);
      expect(withPart.base, n).toBe(r.base);
      expect(withPart.kind, n).toBe("entrance");
      checked += 1;
    }
    expect(checked).toBeGreaterThan(50);
  });
  it("the display form of a base folds back to the base, or is null when a name cannot be shown", () => {
    let shown = 0;
    for (const n of names) {
      const base = readName(n).base;
      const display = venueDisplayBase(n);
      if (base === null) {
        expect(display, n).toBeNull();
        continue;
      }
      if (display === null) continue;
      expect(foldVenueName(display), n).toBe(base);
      shown += 1;
    }
    expect(shown).toBeGreaterThan(1500);
  });
  it("the display form only uses words that are in the name", () => {
    for (const n of names.slice(0, 1000)) {
      const display = venueDisplayBase(n);
      if (display === null) continue;
      for (const w of display.split(" ")) expect(n, n).toContain(w);
    }
  });
  it("folding is stable", () => {
    for (const n of names.slice(0, 800)) expect(foldVenueName(foldVenueName(n)), n).toBe(foldVenueName(n));
  });
});
