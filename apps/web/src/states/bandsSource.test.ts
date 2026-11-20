import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FILES = ["packBands.ts", "packBandsExport.ts", "PackBands.tsx", "packNearest.ts", "PackNearest.tsx"];

/** The text of each quoted or template string in the source; `${...}` code is left out of a template. */
function literals(source: string): string[] {
  const out: string[] = [];
  const re = /"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
  for (let m = re.exec(source); m !== null; m = re.exec(source)) {
    const body = m[1] ?? m[2] ?? "";
    out.push(body.replace(/\$\{[^}]*\}/g, "X"));
  }
  return out;
}

/** The text a literal holds once its \uXXXX and \xNN escapes are read. */
function decode(text: string): string {
  return text.replace(/\\u([0-9a-fA-F]{4})|\\x([0-9a-fA-F]{2})/g, (_m, u: string | undefined, x: string | undefined) => String.fromCharCode(parseInt((u ?? x)!, 16)));
}

describe("French text in the distance table source", () => {
  for (const file of FILES) {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    const french = literals(source)
      .map(decode)
      .filter((s) => /[éèêàçôûîœ’]|\b(le|la|les|des|une|dans|pour|sur|est|sont)\b/.test(s));
    it(`${file}: has French strings to check`, () => {
      expect(french.length).toBeGreaterThan(0);
    });
    it(`${file}: no plain space before : ; ! ? and no straight apostrophe`, () => {
      expect(french.filter((s) => / [:;!?]/.test(s))).toEqual([]);
      expect(french.filter((s) => s.includes("'"))).toEqual([]);
    });
    it(`${file}: no literal no-break or thin space, which the linter would reject`, () => {
      expect(source).not.toMatch(/[\u00a0\u202f\uFEFF]/);
    });
  }
  it("would catch a plain space before a colon (the check itself works)", () => {
    const sample = literals('const a = "Date : 5";').map(decode);
    expect(sample.filter((s) => / [:;!?]/.test(s))).toEqual(["Date : 5"]);
  });
  it("reads an escaped no-break space as a no-break space", () => {
    expect(decode("Date\\u00a0: 5")).toBe("Date\u00a0: 5");
    expect(/ [:;!?]/.test(decode("Date\\u00a0: 5"))).toBe(false);
  });
});
