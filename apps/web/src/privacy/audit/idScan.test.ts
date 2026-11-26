import { describe, expect, it } from "vitest";
import { ID_KINDS, NAVIGATOR_HIGH, NAVIGATOR_LOW, countKinds, countScanned, isIdScanned, joinedIntoText, lineOfMasked, navigatorAliases, nearbyLines, scanFile, scanIds } from "./idScan";

const P = "apps/web/src/x.ts";
const scan = (text: string, path = P) => scanFile({ path, text });
const details = (text: string) => scan(text).map((s) => `${s.kind}:${s.detail}`);

describe("isIdScanned", () => {
  it("reads the code of the App, in any script extension", () => {
    for (const e of ["ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts"]) expect(isIdScanned(`apps/web/src/a.${e}`), e).toBe(true);
  });
  it("leaves out tests, e2e, dist, node_modules, other apps and the audit tools", () => {
    for (const p of ["apps/web/src/a.test.ts", "apps/web/src/a.spec.tsx", "apps/web/src/e2e/a.ts", "apps/web/dist/a.js", "apps/web/src/node_modules/a.js", "packages/a.ts", "apps/web/src/privacy/audit/a.ts"]) expect(isIdScanned(p), p).toBe(false);
  });
  it("leaves out files that are not scripts", () => expect(isIdScanned("apps/web/src/a.css")).toBe(false));
});

describe("identifiers", () => {
  it("finds randomUUID", () => expect(details("const id = crypto.randomUUID();")).toEqual(["uuid:randomUUID"]));
  it("finds randomUUID through globalThis or self", () => expect(scan("globalThis.crypto.randomUUID(); self.crypto.randomUUID();")).toHaveLength(2));
  it("finds getRandomValues", () => expect(details("c.getRandomValues(new Uint8Array(8));")).toEqual(["random-bytes:getRandomValues"]));
  it("finds Math.random", () => expect(details("const n = Math.random();")).toEqual(["math-random:Math.random"]));
  it("finds Math.random with spaces", () => expect(details("Math . random ()")).toEqual(["math-random:Math.random"]));
  it("does not find the name without a call", () => expect(scan("const f = Math.random; const g = c.randomUUID;")).toEqual([]));
  it("finds an expression inside a template", () => expect(details("`report-${Date.now()}-${Math.random().toString(36)}`")).toEqual(["math-random:Math.random"]));
  it("does not find a name in a comment, a string or the text of a template", () => {
    expect(scan("// crypto.randomUUID()\n/* Math.random() */\nconst s = 'Math.random()';\nconst t = `crypto.randomUUID()`;")).toEqual([]);
  });
});

describe("what the navigator tells", () => {
  it("sorts the properties: no property is in both sets", () => {
    for (const p of NAVIGATOR_HIGH) expect(NAVIGATOR_LOW.has(p), p).toBe(false);
  });
  it.each([...NAVIGATOR_HIGH])("%s is high", (p) => expect(details(`const v = navigator.${p};`)).toEqual([`device-high:navigator.${p}`]));
  it.each([...NAVIGATOR_LOW])("%s is low", (p) => expect(details(`const v = navigator.${p};`)).toEqual([`device-low:navigator.${p}`]));
  it("reads optional chaining", () => expect(details("navigator?.language")).toEqual(["device-low:navigator.language"]));
  it("leaves a property that is a feature, not a fingerprint", () => expect(scan("navigator.serviceWorker; navigator.onLine; navigator.clipboard; navigator.geolocation;")).toEqual([]));
  it("does not read a name that only ends in navigator", () => expect(scan("mynavigator.language")).toEqual([]));
});

describe("reads of the screen and the device", () => {
  it("finds screen properties, with or without window", () => expect(details("screen.width; window.screen.height; screen.orientation")).toEqual(["device-low:screen.height", "device-low:screen.orientation", "device-low:screen.width"]));
  it("leaves a screen property that is not a size", () => expect(scan("screen.addEventListener('change', f)")).toEqual([]));
  it("finds devicePixelRatio and visualViewport", () => expect(details("window.devicePixelRatio; window.visualViewport")).toEqual(["device-low:devicePixelRatio", "device-low:visualViewport"]));
  it("finds the time zone reads", () => expect(details("new Date().getTimezoneOffset(); Intl.DateTimeFormat().resolvedOptions()")).toEqual(["device-low:getTimezoneOffset", "device-low:resolvedOptions"]));
  it("finds matchMedia", () => expect(details("window.matchMedia('(x)')")).toEqual(["device-low:matchMedia"]));
  it.each(["toDataURL", "getImageData", "enumerateDevices", "queryLocalFonts", "getHighEntropyValues", "getSupportedExtensions", "getExtension", "measureText"])("%s is high", (n) => expect(details(`x.${n}(1)`)).toEqual([`device-high:${n}`]));
  it.each(["WebGLRenderingContext", "WebGL2RenderingContext", "OfflineAudioContext", "AudioContext", "webkitAudioContext", "AnalyserNode"])("%s is high", (n) => expect(details(`new ${n}()`)).toEqual([`device-high:${n}`]));
});

describe("sites", () => {
  it("give the line of the name", () => expect(scan("a;\nb;\nMath.random();").map((s) => s.line)).toEqual([3]));
  it("give the right line after a block comment and a template", () => expect(scan("/* a\nb */\n`x\ny`;\nMath.random();")[0]?.line).toBe(5));
  it("say whether the same line stores or sends", () => {
    expect(scan("db.items.put({ id: Math.random() });")[0]?.moves).toBe(true);
    expect(scan("fetch('/x', { body: crypto.randomUUID() });")[0]?.moves).toBe(true);
    expect(scan("const id = Math.random();")[0]?.moves).toBe(false);
  });
  it("do not take a put on another line for the same line", () => expect(scan("const id = Math.random();\ndb.put(id);")[0]?.moves).toBe(false));
  it("are sorted by line and then by name", () => expect(scan("navigator.platform; navigator.language;").map((s) => s.detail)).toEqual(["navigator.language", "navigator.platform"]));
  it("are not given for a file that is not scanned", () => expect(scan("Math.random()", "apps/web/src/x.test.ts")).toEqual([]));
});

describe("scanIds, countScanned and countKinds", () => {
  const files = [
    { path: "apps/web/src/b.ts", text: "Math.random(); crypto.randomUUID();" },
    { path: "apps/web/src/a.ts", text: "\nnavigator.hardwareConcurrency;" },
    { path: "apps/web/src/a.test.ts", text: "Math.random()" },
  ];
  it("sorts by path and then line", () => expect(scanIds(files).map((s) => `${s.path.slice(-4)}:${s.line}`)).toEqual(["a.ts:2", "b.ts:1", "b.ts:1"]));
  it("counts the files it reads", () => expect(countScanned(files)).toBe(2));
  it("counts every kind, with zero for none", () => expect(countKinds(scanIds(files))).toEqual({ uuid: 1, "random-bytes": 0, "math-random": 1, "time-id": 0, "device-high": 1, "device-low": 0 }));
  it("names six kinds", () => expect(ID_KINDS).toHaveLength(6));
});

describe("lineOfMasked", () => {
  it("returns the line that holds the index", () => expect(lineOfMasked("ab\ncd\nef", 4)).toBe("cd"));
  it("returns the first line and the last line", () => {
    expect(lineOfMasked("ab\ncd", 0)).toBe("ab");
    expect(lineOfMasked("ab\ncd", 4)).toBe("cd");
  });
});

describe("aliases of the navigator", () => {
  it("finds a name bound to the navigator, to a property of it or to a window", () => {
    expect(navigatorAliases("const nav = navigator;\nconst n2 = window.navigator;\nlet n3 = env.host.navigator;")).toEqual(["n2", "n3", "nav"]);
  });
  it("finds a name with a type", () => expect(navigatorAliases("const nav: Navigator = navigator;")).toEqual(["nav"]));
  it("does not take a name bound to a property of the navigator", () => expect(navigatorAliases("const l = navigator.language;")).toEqual([]));
  it("reads a property read through an alias, with optional chaining", () => expect(details("const nav = env.navigator;\nconst l = nav?.language;\nconst o = nav.onLine;")).toEqual(["device-low:navigator.language"]));
  it("reads a high property through an alias", () => expect(details("const nav = navigator;\nnav.hardwareConcurrency;")).toEqual(["device-high:navigator.hardwareConcurrency"]));
  it("does not read a property of another name that ends like the alias", () => expect(details("const nav = navigator;\nsubnav.language; a.nav.language;")).toEqual([]));
  it("does not follow an alias named in a comment", () => expect(details("// const nav = navigator;\nnav.language")).toEqual([]));
  it("finds the privacy signals the browser sends", () => expect(details("navigator.globalPrivacyControl; navigator.doNotTrack; navigator.cookieEnabled")).toHaveLength(3));
});

describe("the clock used to make an id", () => {
  it("finds Date.now in a template on a line that names an id", () => expect(details("const id = `a-${Date.now()}`;")).toEqual(["time-id:Date.now"]));
  it("finds performance.now added to a string", () => expect(details("const key = 'k' + performance.now();")).toEqual(["time-id:performance.now"]));
  it("finds a clock added after the call", () => expect(details("const token = Date.now() + '-x';")).toEqual(["time-id:Date.now"]));
  it("reads the name of the function two lines up", () => expect(details("function newId() {\n  return ok\n    ? a\n    : `r-${Date.now()}`;\n}")).toEqual(["time-id:Date.now"]));
  it("does not take a clock that is only compared or stored as a number", () => {
    expect(scan("const id = 1; const t = Date.now();")).toEqual([]);
    expect(scan("if (Date.now() > limit) { id++; }")).toEqual([]);
  });
  it("does not take a clock on a line that names no id", () => expect(scan("const label = `at ${Date.now()}`;")).toEqual([]));
  it("does not take a plus plus for a sum", () => expect(scan("id++; const x = Date.now(); y++;")).toEqual([]));
});

describe("joinedIntoText", () => {
  const at = (line: string, call: string): boolean => joinedIntoText(line, line.indexOf(call), call.length);
  it("is true inside a template expression", () => expect(at("`a-${Date.now()}`", "Date.now(")).toBe(true));
  it("is false after a template expression has closed", () => expect(at("`a-${x}` + y; Date.now()", "Date.now(")).toBe(false));
  it("is true after a plus and before a plus", () => {
    expect(at("a + Date.now()", "Date.now(")).toBe(true);
    expect(at("Date.now() + a", "Date.now(")).toBe(true);
  });
  it("is false for an increment or a compound assignment next to it", () => {
    expect(at("n++ Date.now()", "Date.now(")).toBe(false);
    expect(at("Date.now() += 1", "Date.now(")).toBe(false);
  });
  it("is false for a call alone", () => expect(at("const t = Date.now();", "Date.now(")).toBe(false));
});

describe("nearbyLines", () => {
  const text = "a\nb\nc\nd\ne";
  it("gives the line and the lines before it", () => expect(nearbyLines(text, text.indexOf("e"), 2)).toBe("c\nd\ne"));
  it("gives fewer lines at the start of the text", () => expect(nearbyLines(text, text.indexOf("b"), 5)).toBe("a\nb"));
  it("gives only the line when none is asked for", () => expect(nearbyLines(text, text.indexOf("c"), 0)).toBe("c"));
});
