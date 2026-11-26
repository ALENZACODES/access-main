import { describe, expect, it } from "vitest";
import { closingParen, countKinds, insideTemplateExpression, isTimeScanned, scanTime, scanTimeFile } from "./tmScan";

const scan = (text: string) => scanTimeFile({ path: "apps/web/src/x.ts", text });
const kinds = (text: string): string[] => scan(text).map((s) => s.kind);

describe("clock reads", () => {
  it("finds Date.now and new Date with no argument", () => {
    expect(scan("const a = Date.now(); const b = new Date();").map((s) => s.detail)).toEqual(["Date.now()", "new Date()"]);
  });
  it("does not find new Date with an argument", () => expect(kinds("new Date(0); new Date(iso); new Date(2026, 1, 1);")).toEqual([]));
  it("allows space around the dot and the brackets", () => expect(kinds("Date . now ( )")).toEqual(["clock-ms"]));
  it("does not find a name that only ends like it", () => expect(kinds("MyDate.now(); xDate.now();")).toEqual([]));
  it("says when the call sits in the ${ } of a template", () => {
    expect(scan("const id = `a-${Date.now()}`;")[0]?.inText).toBe(true);
    expect(scan("const id = Date.now();")[0]?.inText).toBe(false);
    expect(scan("const id = `a-${n}` + Date.now();")[0]?.inText).toBe(false);
  });
  it("says it for a template that starts on an earlier line", () => {
    expect(scan("const id = `a\nb ${\nDate.now()}`;")[0]?.inText).toBe(true);
  });
  it("does not find a call in a comment or a string", () => expect(kinds('// Date.now()\nconst s = "new Date()";')).toEqual([]));
});

describe("timers", () => {
  it("finds performance.now, timeOrigin and hrtime", () => {
    expect(kinds("performance.now(); performance.timeOrigin; process.hrtime(); hrtime.bigint();")).toEqual(["timer-hires", "timer-hires", "timer-hires", "timer-hires"]);
  });
  it("finds performance with an optional chain", () => expect(kinds("globalThis.performance?.now()")).toEqual(["timer-hires"]));
  it("does not find a method that is only named now", () => expect(kinds("clock.now();")).toEqual([]));
});

describe("written times", () => {
  it("finds a full toISOString", () => expect(scan("x.toISOString()")[0]).toMatchObject({ kind: "stamp-full", detail: "toISOString()" }));
  it.each([
    ["x.toISOString().slice(0, 10)", "date (10 characters)"],
    ["x.toISOString().slice(0,7)", "month (7 characters)"],
    ["x.toISOString().slice(0, 16)", "minute (16 characters)"],
    ["x.toISOString().slice(0, 19)", "second (19 characters)"],
    ["x.toISOString().substring(0, 10)", "date (10 characters)"],
  ])("reads the cut in %s", (text, cut) => {
    const s = scan(text)[0];
    expect(s?.kind).toBe("stamp-cut");
    expect(s?.detail).toContain(cut);
  });
  it("finds a split on a character", () => expect(scan('x.toISOString().split("T")[0]')[0]).toMatchObject({ kind: "stamp-cut" }));
  it("names a cut it does not know", () => expect(scan("x.toISOString().slice(5)")[0]?.detail).toContain("slice(5)"));
  it("counts a replace after toISOString as a full stamp", () => expect(kinds("x.toISOString().replace(/-/g, '')")).toEqual(["stamp-full"]));
});

describe("the time zone", () => {
  it("finds getTimezoneOffset and resolvedOptions", () => expect(kinds("d.getTimezoneOffset(); f.resolvedOptions().timeZone;")).toEqual(["tz-read", "tz-read"]));
  it("finds a timeZone option that is not UTC", () => expect(scan("{ timeZone: 'America/Toronto' }")[0]?.detail).toBe("timeZone option: America/Toronto"));
  it("lets a UTC option pass, in either quote", () => expect(kinds("{ timeZone: 'UTC' } { timeZone: \"UTC\" }")).toEqual([]));
  it("finds a timeZone that is a variable", () => expect(scan("{ timeZone: tz }")[0]?.detail).toContain("not written out"));
  it("finds the local getters and not the UTC ones", () => {
    expect(kinds("d.getFullYear(); d.getMonth(); d.getDate(); d.getDay(); d.getHours(); d.getMinutes(); d.getSeconds(); d.getMilliseconds();")).toHaveLength(8);
    expect(kinds("d.getUTCFullYear(); d.getUTCHours();")).toEqual([]);
  });
});

describe("formats", () => {
  it("calls a local format one that has no UTC", () => {
    expect(kinds("d.toLocaleDateString('en-CA'); d.toLocaleTimeString(); d.toDateString(); d.toTimeString();")).toEqual(["local-format", "local-format", "local-format", "local-format"]);
  });
  it("calls it UTC when the arguments say UTC", () => expect(kinds("d.toLocaleDateString('en-CA', { timeZone: 'UTC' })")).toEqual(["utc-format"]));
  it("reads Intl.DateTimeFormat by its arguments", () => {
    expect(kinds("new Intl.DateTimeFormat('en-CA', { year: 'numeric', timeZone: 'UTC' })")).toEqual(["utc-format"]);
    expect(kinds("new Intl.DateTimeFormat('en-CA', { year: 'numeric' })")).toEqual(["local-format"]);
  });
  it("does not count a number's toLocaleString", () => expect(kinds("n.toLocaleString('en-CA')")).toEqual([]));
});

describe("helpers", () => {
  it("closingParen finds the matching bracket", () => {
    expect(closingParen("f(a(b), c) d", 1)).toBe(9);
    expect(closingParen("f(a", 1)).toBe(-1);
  });
  it("insideTemplateExpression is false outside a template", () => expect(insideTemplateExpression("a Date.now()", "a Date.now()", 2)).toBe(false));
});

describe("which files are read", () => {
  it.each([
    ["apps/web/src/a.ts", true],
    ["apps/web/src/a.tsx", true],
    ["apps/web/src/narrow/bin.mjs", true],
    ["apps/web/src/a.test.ts", false],
    ["apps/web/src/a.spec.tsx", false],
    ["apps/web/src/privacy/audit/tmScan.ts", false],
    ["apps/web/src/a.css", false],
    ["packages/shared/src/a.ts", false],
  ])("%s -> %s", (path, read) => expect(isTimeScanned(path)).toBe(read));
  it("scanTime sorts by path then line and skips files that are not read", () => {
    const s = scanTime([
      { path: "apps/web/src/b.ts", text: "Date.now();" },
      { path: "apps/web/src/a.ts", text: "\nDate.now();" },
      { path: "apps/web/src/a.test.ts", text: "Date.now();" },
    ]);
    expect(s.map((x) => `${x.path}:${x.line}`)).toEqual(["apps/web/src/a.ts:2", "apps/web/src/b.ts:1"]);
  });
  it("countKinds lists every kind, with zero", () => {
    const c = countKinds(scan("Date.now();"));
    expect(c["clock-ms"]).toBe(1);
    expect(c["tz-read"]).toBe(0);
    expect(Object.keys(c)).toHaveLength(8);
  });
});
