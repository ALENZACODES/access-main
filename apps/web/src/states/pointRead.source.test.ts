import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FILES = ["pointRead.ts", "pointFormat.ts", "pointCopy.ts", "PointPaste.tsx"];
const HIDDEN = new RegExp("[" + ["00a0", "2007", "2009", "200a", "202f", "2028", "2029", "feff", "200b"].map((h) => String.fromCharCode(parseInt(h, 16))).join("") + "]");
const read = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");

/** The text of each quoted or template string; `${...}` code in a template is left out. */
function literals(source: string): string[] {
  const out: string[] = [];
  const re = /"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
  for (let m = re.exec(source); m !== null; m = re.exec(source)) out.push((m[1] ?? m[2] ?? "").replace(/\$\{[^}]*\}/g, "X"));
  return out;
}
const decode = (text: string) => text.replace(/\\u([0-9a-fA-F]{4})/g, (_m, u: string) => String.fromCharCode(parseInt(u, 16)));
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");

describe("what the paste-a-point source may do", () => {
  for (const file of FILES) {
    const source = read(file);
    it(`${file}: does not touch the network, storage, cookies or the clock`, () => {
      const c = code(source);
      for (const bad of ["fetch(", "XMLHttpRequest", "WebSocket", "sendBeacon", "localStorage", "sessionStorage", "indexedDB", "document.cookie", "navigator.geolocation", "Date.now", "new Date", "Math.random", "eval(", "new Function", "dangerouslySetInnerHTML", "innerHTML"]) {
        expect(c.includes(bad), `${file} uses ${bad}`).toBe(false);
      }
    });
    it(`${file}: has no import from outside this folder except react and the design kit`, () => {
      const specs = [...source.matchAll(/from "([^"]+)"/g)].map((m) => m[1] ?? "");
      for (const s of specs) expect(s === "react" || s.startsWith("./") || s.startsWith("../design/"), `${file}: ${s}`).toBe(true);
    });
    it(`${file}: has no irregular space or hidden character`, () => {
      expect(source).not.toMatch(HIDDEN);
    });
    it(`${file}: no plain URL scheme in the text`, () => {
      expect(source).not.toMatch(/http:\/\//);
    });
    it(`${file}: no console output and no TODO left behind`, () => {
      const c = code(source);
      expect(c).not.toMatch(/console\./);
      expect(source).not.toMatch(/TODO|FIXME|XXX/);
    });
  }
});

describe("words the app does not use", () => {
  const banned = ["blind", "wheelchair-bound", "suffers from", "handicapped", "crippled", "normal people", "special needs"];
  for (const file of FILES) {
    it(`${file}: avoids the banned words in its strings`, () => {
      const text = literals(read(file)).map(decode).join("\n").toLowerCase();
      for (const w of banned) expect(text.includes(w), `${file}: ${w}`).toBe(false);
    });
    it(`${file}: names no organisation or brand`, () => {
      const text = literals(read(file)).map(decode).join("\n");
      for (const org of ["Google", "Apple", "OpenStreetMap", "Bing", "Mapbox", "Waze", "Yandex", "Anthropic", "Claude"]) {
        expect(text.includes(org), `${file}: ${org}`).toBe(false);
      }
    });
  }
});

describe("French strings", () => {
  for (const file of ["pointCopy.ts", "PointPaste.tsx"]) {
    const french = literals(read(file)).map(decode).filter((s) => /[éèêàçôûîœ’]|\b(le|la|les|des|une|dans|pour|sur|est|sont)\b/.test(s));
    it(`${file}: has French to check`, () => {
      expect(french.length).toBeGreaterThan(0);
    });
    it(`${file}: no plain space before : ; ! ? and no straight apostrophe`, () => {
      expect(french.filter((s) => / [:;!?]/.test(s) && !/\|/.test(s))).toEqual([]);
      expect(french.filter((s) => s.includes("'"))).toEqual([]);
    });
  }
});

describe("the reader looks only at the numbers, never at the host", () => {
  const source = code(read("pointRead.ts"));
  it("does not parse a URL host, path name or origin", () => {
    for (const bad of [".hostname", ".host", ".origin", "new URL"]) expect(source.includes(bad), bad).toBe(false);
  });
  it("names no map service in code", () => {
    for (const s of ["openstreetmap", "google", "apple", "bing", "mapbox", "waze"]) expect(source.toLowerCase().includes(s), s).toBe(false);
  });
});

describe("the guard itself works", () => {
  it("finds a quoted string and skips template code", () => {
    expect(literals('const a = "x"; const b = `y ${z} w`;')).toEqual(["x", "y X w"]);
  });
  it("reads an escape", () => {
    expect(decode("a\\u00a0b")).toBe("a\u00a0b");
  });
  it("removes comments but keeps a URL-looking string", () => {
    expect(code('const a = 1; // fetch(\nconst b = "https://x";')).not.toContain("fetch(");
    expect(code("/* fetch( */ const a = 1;")).not.toContain("fetch(");
  });
});
