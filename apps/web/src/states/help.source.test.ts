import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FILES = ["packUrl.ts", "packHelp.ts", "helpAudit.ts", "helpContact.ts", "helpText.ts", "helpView.ts", "helpCopy.ts", "helpExport.ts", "HelpNumbers.tsx"];
const src = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");

describe("the help numbers source", () => {
  it("never builds a dialling, mail or map address", () => {
    for (const f of FILES) expect(src(f), f).not.toMatch(/["'`](tel|sms|mailto|geo):/i);
  });
  it("never uses an anchor, a form or a fetch", () => {
    for (const f of FILES) {
      expect(src(f), f).not.toMatch(/<a[\s>]|<form|\bfetch\(|XMLHttpRequest|sendBeacon|navigator\.(?:share|clipboard)/);
    }
  });
  it("does not touch storage, cookies or the clock directly outside the day it is given", () => {
    for (const f of FILES) {
      expect(src(f), f).not.toMatch(/localStorage|sessionStorage|document\.cookie|indexedDB/);
    }
    for (const f of FILES.filter((x) => x !== "HelpNumbers.tsx")) expect(src(f), f).not.toMatch(/new Date\(\)|Date\.now/);
  });
  it("does not inject markup", () => {
    for (const f of FILES) expect(src(f), f).not.toMatch(/dangerouslySetInnerHTML|innerHTML|eval\(|new Function/);
  });
  it("does not rank or reorder by anything but the name the person picks", () => {
    expect(src("helpView.ts")).not.toMatch(/Math\.random|\.reverse\(|tier\b.*sort|sort.*tier\b/);
  });
  it("does not use a word that claims a number was checked or is answered", () => {
    for (const f of FILES) {
      const text = src(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(text, f).not.toMatch(/verified|vérifi|up to date|24\/7|always answer/i);
    }
  });
  it("is closed by default and adds no heading in the tools", () => {
    const t = src("HelpNumbers.tsx");
    expect(t).toContain("useState(false)");
    const tools = t.slice(t.indexOf("{open ? ("), t.indexOf("data-help-count"));
    expect(tools).not.toMatch(/<h[1-6]/);
  });
  it("reads only own keys of a pack record", () => {
    const t = src("packHelp.ts");
    expect(t).toMatch(/hasOwn|hasOwnProperty/);
  });
});
