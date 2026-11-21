import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { forbiddenOrgNeedles } from "../../../../packages/shared/test/forbiddenOrg";

const SOURCE = ["noteTopicLexicon.ts", "noteTopicScan.ts", "noteTopicIndex.ts", "noteTopicFilter.ts", "noteTopicCopy.ts", "noteTopicExport.ts", "NoteTopics.tsx"];
const read = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const css = readFileSync(new URL("../styles/global.css", import.meta.url), "utf8");

const decodeEscapes = (s: string) => s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
const isFrench = (text: string) => /[àâçéèêëîïôûùüœ’]|\b(le|la|les|des|du|une?|ne|ont|est|lieux?|arrêts?|vers|plus|sur)\b/i.test(text) && !/^[a-z_>]+$/.test(text);
/** Removes every ${...} expression, nested braces included, so code such as a ternary is not read as copy. */
function withoutExpressions(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "$" && text[i + 1] === "{") {
      let depth = 0;
      for (i += 1; i < text.length; i++) {
        if (text[i] === "{") depth++;
        if (text[i] === "}" && --depth === 0) break;
      }
      continue;
    }
    out += text[i];
  }
  return out;
}
function literals(source: string): string[] {
  const found: string[] = [];
  for (const m of source.matchAll(/"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) found.push(withoutExpressions(decodeEscapes(m[1] ?? m[2] ?? "")));
  return found;
}

describe("the note-words source files", () => {
  for (const file of SOURCE) {
    const source = read(file);
    it(`${file} has no invisible or irregular space typed into it`, () => {
      expect(source).not.toMatch(/[\u00a0\u202f\u2007\u2009\u200b\ufeff]/);
    });
    it(`${file} writes French with the typographic apostrophe and no stray backslash`, () => {
      for (const text of literals(source)) {
        if (!isFrench(text)) continue;
        expect(text, text).not.toMatch(/\w'\w/);
        expect(text, text).not.toContain("\\");
      }
    });
    it(`${file} puts a no-break space before a French colon and a thin space before ; ! ?`, () => {
      for (const text of literals(source)) {
        if (!isFrench(text)) continue;
        expect(text, text).not.toMatch(/\S [:;!?](?!\w)/);
        expect(text, text).not.toMatch(/\S[;!?](?=\s|$)/);
      }
    });
    it(`${file} never uses the French word for UNKNOWN`, () => {
      expect(source).not.toMatch(/INCONN/i);
    });
    it(`${file} makes none of the claims the App does not make`, () => {
      const claims = new RegExp(["real[- ]time", ["partner", "ship"].join(""), "guarantee", ["veri", "fied"].join(""), ["veri", "fy"].join(""), ["vé", "rifi"].join("")].join("|"), "i");
      for (const text of literals(source)) expect(text, text).not.toMatch(claims);
    });
    it(`${file} does not name an organisation`, () => {
      const lowered = source.toLowerCase().replace(/[^a-z]+/g, " ");
      for (const needle of forbiddenOrgNeedles()) expect(lowered.includes(needle.toLowerCase())).toBe(false);
    });
    it(`${file} makes no network call, reads no storage directly and holds no secret`, () => {
      expect(source).not.toMatch(/https?:\/\//);
      expect(source).not.toMatch(/\b(fetch|XMLHttpRequest|sendBeacon|navigator\.geolocation|document\.cookie)\b/);
      expect(source).not.toMatch(/(api[_-]?key|secret|token)\s*[:=]\s*["'][^"']{8,}/i);
      expect(source).not.toMatch(/\blocalStorage\b|\bsessionStorage\b/);
    });
  }
  it("the OpenStreetMap credit comes from one place", () => {
    expect(read("noteTopicExport.ts")).toContain("OSM_CREDIT");
    for (const f of SOURCE) expect(read(f)).not.toContain("OpenStreetMap contributors");
  });
  it("the copy never says a note, a word or a feature is checked, correct, complete or enough", () => {
    const words = /\b(correct|accurate|confirmed|up to date|complete|reliable|trusted|best|recommend\w*|suitable|near enough|safe|usable)\b/i;
    for (const text of literals(read("noteTopicCopy.ts") + read("NoteTopics.tsx"))) expect(text, text).not.toMatch(words);
  });
  it("the reader uses no map tiles, scripts or images from elsewhere", () => {
    expect(read("NoteTopics.tsx")).not.toMatch(/<img|<iframe|<script|tile/i);
  });
  it("the style sheet gives every button at least a 44px target in height", () => {
    const rule = /\.lang-button,\s*\.btn,[^{]*\{[^}]*min-height:\s*(\d+)px/.exec(css);
    expect(rule).not.toBeNull();
    expect(Number(rule![1])).toBeGreaterThanOrEqual(44);
  });
  it("the reader has no bare button and never builds HTML from a note", () => {
    const reader = read("NoteTopics.tsx");
    expect(reader).not.toMatch(/<button\b/);
    expect(reader).not.toMatch(/dangerouslySetInnerHTML|innerHTML/);
    expect((reader.match(/<Button\b/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
  it("every file the source imports from this folder exists", () => {
    for (const f of SOURCE) {
      for (const m of read(f).matchAll(/from "\.\/([A-Za-z0-9.]+)"/g)) {
        const base = m[1]!;
        expect(["", ".ts", ".tsx"].some((ext) => existsSync(new URL(`./${base}${ext}`, import.meta.url))), `${f} imports ${base}`).toBe(true);
      }
    }
  });
});
