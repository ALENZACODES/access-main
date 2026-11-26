import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FILES = ["visitMarks.ts", "useVisitMarks.ts", "visitMarksCopy.ts", "visitMarksExport.ts", "VisitMarks.tsx", "marksTransfer.ts", "MarksTransfer.tsx"];
const src = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const code = (f: string) => src(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("the visit marks source", () => {
  it("never builds a dialling, mail or map address", () => {
    for (const f of FILES) expect(src(f), f).not.toMatch(/["'`](tel|sms|mailto|geo):/i);
  });
  it("makes no request and no link", () => {
    for (const f of FILES) expect(code(f), f).not.toMatch(/<a[\s>]|<form|\bfetch\(|XMLHttpRequest|sendBeacon|navigator\.share/);
    // Only the transfer reads the clipboard, and only to copy a code the person asked for.
    for (const f of FILES.filter((x) => x !== "MarksTransfer.tsx")) expect(code(f), f).not.toMatch(/navigator\.clipboard/);
    expect(code("MarksTransfer.tsx")).not.toMatch(/readText|clipboard\.read\(/);
  });
  it("does not read the clock; the day is given", () => {
    for (const f of FILES) expect(code(f), f).not.toMatch(/new Date\(|Date\.now|performance\.now/);
  });
  it("touches storage only through the store it is given", () => {
    for (const f of FILES) expect(code(f), f).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
  });
  it("injects no markup", () => {
    for (const f of FILES) expect(code(f), f).not.toMatch(/dangerouslySetInnerHTML|innerHTML|eval\(|new Function/);
  });
  it("never sorts or scores places by a mark", () => {
    for (const f of FILES) expect(code(f), f).not.toMatch(/\.sort\(|\.reverse\(|Math\.random|score|rank/i);
  });
  it("stores nothing but id, status and day", () => {
    const s = src("visitMarks.ts");
    const write = s.slice(s.indexOf("export function serializeVisitMarks"), s.indexOf("export function markFor"));
    expect(write).toContain("id: m.id, status: m.status, markedOn: m.markedOn");
    expect(write).not.toMatch(/name|address|note|lat|lon/);
  });
  it("reads own keys of stored entries", () => {
    expect(src("visitMarks.ts")).toMatch(/hasOwnProperty/);
  });
  it("is closed by default and adds no heading", () => {
    const t = src("VisitMarks.tsx");
    expect(t).toContain("useState(false)");
    expect(t).not.toMatch(/<h[1-6]/);
  });
});
