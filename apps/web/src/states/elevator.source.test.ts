import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FILES = ["packElevators.ts", "elevatorRead.ts", "elevatorAge.ts", "elevatorView.ts", "elevatorCopy.ts", "elevatorExport.ts", "ElevatorNotices.tsx"];
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

describe("what the elevator notices source may do", () => {
  for (const file of FILES) {
    const source = read(file);
    it(`${file}: does not touch the network, storage, cookies or randomness`, () => {
      const c = code(source);
      for (const bad of ["fetch(", "XMLHttpRequest", "WebSocket", "sendBeacon", "localStorage", "sessionStorage", "indexedDB", "document.cookie", "navigator.", "Math.random", "eval(", "new Function", "dangerouslySetInnerHTML", "innerHTML", "window.open", "location."]) {
        expect(c.includes(bad), `${file} uses ${bad}`).toBe(false);
      }
    });
    it(`${file}: reads the clock only through today, which the caller can supply`, () => {
      const c = code(source);
      const uses = c.includes("new Date()") || c.includes("Date.now");
      expect(uses, file).toBe(file === "ElevatorNotices.tsx");
    });
    it(`${file}: imports only react, the design kit and files of this folder`, () => {
      const specs = [...source.matchAll(/from "([^"]+)"/g)].map((m) => m[1] ?? "");
      for (const s of specs) expect(s === "react" || s.startsWith("./") || s.startsWith("../design/"), `${file}: ${s}`).toBe(true);
    });
    it(`${file}: has no irregular space or hidden character`, () => {
      expect(source).not.toMatch(HIDDEN);
    });
    it(`${file}: has no plain http address, console output or leftover note`, () => {
      const c = code(source);
      expect(source).not.toMatch(/http:\/\//);
      expect(c).not.toMatch(/console\./);
      expect(source).not.toMatch(/TODO|FIXME|XXX/);
    });
    it(`${file}: has no hand-off link scheme in a string`, () => {
      const text = literals(source).map(decode).join("\n");
      expect(text).not.toMatch(/\b(?:mailto|tel|sms|geo):/);
    });
  }
});

describe("words the app does not use", () => {
  const banned = ["blind", "wheelchair-bound", "suffers from", "handicapped", "crippled", "normal people", "special needs", "disabled elevator"];
  for (const file of FILES) {
    it(`${file}: avoids the banned words in its strings`, () => {
      const text = literals(read(file)).map(decode).join("\n").toLowerCase();
      for (const w of banned) expect(text.includes(w), `${file}: ${w}`).toBe(false);
    });
    it(`${file}: says nothing that claims live or verified status`, () => {
      const text = literals(read(file)).map(decode).join("\n").toLowerCase();
      for (const w of ["real-time status", "live status", "up to date", "verified", "guaranteed", "is working", "is available", "now operating"]) expect(text.includes(w), `${file}: ${w}`).toBe(false);
    });
  }
});

describe("French strings", () => {
  for (const file of ["elevatorCopy.ts", "elevatorAge.ts", "elevatorView.ts", "elevatorExport.ts", "ElevatorNotices.tsx"]) {
    const french = literals(read(file)).map(decode).filter((s) => /[éèêàçôûîœ’]|\b(le|la|les|des|une|dans|pour|sur|est|sont|avis)\b/.test(s));
    it(`${file}: no plain space before : ; ! ? and no straight apostrophe`, () => {
      expect(french.filter((s) => / [:;!?]/.test(s) && !/\|/.test(s))).toEqual([]);
      expect(french.filter((s) => s.includes("'") && !/[\\^$]|\(\?/.test(s))).toEqual([]);
    });
  }
});

describe("the notice words are never changed on the way to the page", () => {
  it("shows notice.text without rewording it", () => {
    const view = read("ElevatorNotices.tsx");
    expect(view).toContain("{notice.text}");
    for (const bad of [".replace(", ".toLowerCase(", ".toUpperCase(", ".slice(", ".substring("]) expect(code(view).includes(bad), bad).toBe(false);
  });
  it("keeps the between phrase whole", () => {
    const r = code(read("elevatorRead.ts"));
    expect(r).not.toMatch(/between[^;\n]*\.split\(/);
  });
});

describe("the guard itself works", () => {
  it("finds a quoted string and skips template code", () => {
    expect(literals('const a = "x"; const b = `y ${z} w`;')).toEqual(["x", "y X w"]);
  });
  it("reads an escape", () => {
    expect(decode("a\\u00a0b")).toBe("a\u00a0b");
  });
  it("removes comments", () => {
    expect(code("/* fetch( */ const a = 1; // eval(\n")).not.toMatch(/fetch\(|eval\(/);
  });
});
