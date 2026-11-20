import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { forbiddenOrgNeedles } from "../../../../packages/shared/test/forbiddenOrg";

const SOURCE = ["tagNoteRules.ts", "tagNoteIndex.ts", "tagNoteCopy.ts", "tagNoteExport.ts", "TagNoteReads.tsx"];
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

describe("the pack-search source files", () => {
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
  it("the copy never says a tag or a note is wrong, right or checked", () => {
    const words = /\b(correct|incorrect|wrong|mistaken|error|accurate|inaccurate|confirmed|reliable|trusted|best|recommend\w*|suitable|safe|eligible|contradict\w*|conflict\w*)\b/i;
    // The intro says "not a list of mistakes", which names the word only to deny it.
    for (const text of literals(read("tagNoteCopy.ts") + read("tagNoteExport.ts") + read("TagNoteReads.tsx"))) {
      expect(text.replace(/not a list of mistakes/g, "").replace(/pas une liste d’erreurs/g, ""), text).not.toMatch(words);
    }
  });
  it("the rules, index and export have no UI, no storage and no clock", () => {
    for (const f of ["tagNoteRules.ts", "tagNoteIndex.ts", "tagNoteExport.ts"]) {
      expect(read(f), f).not.toMatch(/from "react|document\.|window\.|Date\.now|new Date|Math\.random/);
    }
  });
  it("the rules name exactly three readings and never read the Limited tag", () => {
    const rules = read("tagNoteRules.ts");
    expect((rules.match(/\{ kind: "/g) ?? []).length).toBe(3);
    expect(rules).not.toMatch(/tags: \[[^\]]*"limited"/);
  });
  it("the component has no bare button and never builds HTML from a note", () => {
    const c = read("TagNoteReads.tsx");
    expect(c).not.toMatch(/<button\b/);
    expect(c).not.toMatch(/dangerouslySetInnerHTML|innerHTML/);
    expect((c.match(/<Button\b/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
  it("the OpenStreetMap credit comes from one place", () => {
    expect(read("tagNoteExport.ts")).toContain("OSM_CREDIT");
    expect(read("tagNoteExport.ts")).not.toContain("OpenStreetMap contributors");
  });
  it("the style sheet gives every button at least a 44px target in height", () => {
    const rule = /\.lang-button,\s*\.btn,[^{]*\{[^}]*min-height:\s*(\d+)px/.exec(css);
    expect(rule).not.toBeNull();
    expect(Number(rule![1])).toBeGreaterThanOrEqual(44);
  });
  it("every file the source imports from this folder exists", () => {
    for (const f of SOURCE) {
      for (const m of read(f).matchAll(/from "\.\/([A-Za-z0-9.]+)"/g)) {
        const base = m[1]!;
        expect(["", ".ts", ".tsx"].some((ext) => existsSync(new URL(`./${base}${ext}`, import.meta.url))), `${f} imports ${base}`).toBe(true);
      }
    }
  });
  it("the wiring lists every new file and the page mounts the component", () => {
    const index = read("index.ts");
    const fr = read("frSourceTypography.test.ts");
    for (const f of SOURCE) {
      expect(fr, f).toContain(`"${f}"`);
      expect(index, f).toContain(`./${f}`);
    }
    expect(read("PackPlaces.tsx")).toContain("<TagNoteReads");
    expect(read("PackPlaces.tsx")).toContain("<NoteTopics");
  });
});
