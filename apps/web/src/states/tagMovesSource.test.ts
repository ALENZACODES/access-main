import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { forbiddenOrgNeedles } from "../../../../packages/shared/test/forbiddenOrg";

const FILES = ["packTagMoves.ts", "packTagMovesExport.ts", "PackTagMoves.tsx"];
const read = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");

/** Reads the \uXXXX escapes the way the compiler does, so correct escaped typography is not flagged. */
function decodeEscapes(s: string): string {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

/** True for copy that reads as French: an accent, or one of the small words English copy here never uses. */
const isFrench = (text: string): boolean => /[àâçéèêëîïôûùüœ’]|\b(le|la|les|des|du|une?|ne|ont|est|lieux?|figure|fichier|plus|vers|ajout[ée]s?|oui|non)\b/i.test(text) && !/^[a-z_>]+$/.test(text);

/** The text inside string and template literals, which is what a reader of the source sees as copy. */
function literals(source: string): string[] {
  const found: string[] = [];
  for (const m of source.matchAll(/"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) found.push(decodeEscapes(m[1] ?? m[2] ?? ""));
  return found;
}

describe("the tag-moves source files", () => {
  for (const file of FILES) {
    const source = read(file);

    it(`${file} has no invisible or irregular spaces typed into it`, () => {
      expect(source).not.toMatch(/[\u00a0\u202f\u2007\u2009\u200b\ufeff]/);
    });

    it(`${file} writes its French copy with typographic apostrophes and no stray backslashes`, () => {
      for (const text of literals(source)) {
        if (!isFrench(text)) continue;
        expect(text, text).not.toMatch(/\w'\w/);
        expect(text, text).not.toContain("\\");
      }
    });

    it(`${file} puts a no-break space before a French colon and a thin one before ; ! ?`, () => {
      for (const text of literals(source)) {
        if (!isFrench(text)) continue;
        expect(text, text).not.toMatch(/\S [:;!?](?!\w)/);
        expect(text, text).not.toMatch(/\S[;!?](?=\s|$)/);
      }
    });

    it(`${file} uses the token UNKNOWN and never a French word for it`, () => {
      expect(source).not.toMatch(/INCONNU/i);
    });

    it(`${file} passes the copy check, in both languages, in every literal that reads as copy`, () => {
      for (const text of literals(source)) {
        if (!/^[A-Z\u00c0-\u00dd{]/.test(text) || text.length < 12) continue;
        expect(lintCopy(text, isFrench(text) ? "fr" : "en"), text).toEqual([]);
      }
    });

    it(`${file} has no ranking words in its copy`, () => {
      for (const text of literals(source)) {
        if (text === "A move is only a difference between two lists. It is not a rating of the place, and it does not say which tag is right now.") continue;
        expect(text, text).not.toMatch(/\b(improved|worsened|declined|degraded|better|worse)\b|amélior|dégrad/i);
      }
    });

    it(`${file} does not name an organisation`, () => {
      const lowered = source.toLowerCase().replace(/[^a-z]+/g, " ");
      for (const needle of forbiddenOrgNeedles()) expect(lowered.includes(needle.toLowerCase()), "an organisation name").toBe(false);
    });

    it(`${file} has no secrets, tile servers or network calls`, () => {
      expect(source).not.toMatch(/https?:\/\//);
      expect(source).not.toMatch(/\b(fetch|XMLHttpRequest|sendBeacon|localStorage|sessionStorage)\b/);
      expect(source).not.toMatch(/(api[_-]?key|secret|token)\s*[:=]\s*["'][^"']{8,}/i);
    });
  }

  it("the OpenStreetMap credit appears in the export exactly as the pack requires, from one place", () => {
    const source = read("packTagMovesExport.ts");
    expect(source).toContain("OSM_CREDIT");
    expect(source).not.toContain("OpenStreetMap contributors");
  });

  it("the export file names are fixed words, not built from user text", () => {
    const source = read("packTagMovesExport.ts");
    expect(source).toMatch(/MOVE_CSV_FILENAMES/);
    expect(source).not.toMatch(/Date\.now|new Date\(/);
  });
});
