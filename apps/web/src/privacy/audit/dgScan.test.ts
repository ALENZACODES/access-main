import { describe, expect, it } from "vitest";
import { DG_KINDS, caughtNames, countThrows, isScanned, scanDiagnostics, scanFile } from "./dgScan";
import { identTokens } from "./jsLit";

const scan = (text: string, path = "apps/web/src/x.ts") => scanFile({ path, text });
const kinds = (text: string): string[] => scan(text).map((s) => s.kind);
const details = (text: string): string[] => scan(text).map((s) => s.detail);

describe("isScanned", () => {
  it.each([
    ["apps/web/src/a.ts", true], ["apps/web/src/a/b.tsx", true], ["apps/web/src/narrow/bin.mjs", true], ["apps/web/src/a.js", true], ["apps/web/src/a.cts", true],
    ["apps/web/src/a.test.ts", false], ["apps/web/src/a.spec.tsx", false], ["apps/web/src/a.json", false], ["apps/web/src/a.css", false],
    ["apps/web/scripts/a.ts", false], ["apps/web/e2e/a.ts", false], ["packages/x/src/a.ts", false], ["apps/web/src/node_modules/x/a.ts", false],
    ["apps/web/src/dist/a.ts", false], ["apps/web/src/test/a.ts", false], ["apps/web/src/__tests__/a.ts", false], ["apps/web/src/fixtures/a.ts", false],
    ["apps/web/src/testing.ts", true], ["apps/web/src/latest/a.ts", true],
  ])("%s is %s", (p, ok) => expect(isScanned(p)).toBe(ok));
});

describe("console, debugger and dialogs", () => {
  it("finds a console call with its method, and a console passed on", () => {
    expect(details("console.log(1);\nconsole.warn('x');\nconsole?.error(e);\nconst c = console;")).toEqual(["log", "warn", "error", "console"]);
  });
  it("gives the line of each", () => expect(scan("a;\n\nconsole.log(1);").map((s) => s.line)).toEqual([3]));
  it("does not find console in a comment, a string, a template or a regex", () => expect(kinds("// console.log(1)\nconst a = 'console.log(1)'; const b = `console.log(1)`; const c = /console/;")).toEqual([]));
  it("does not find a member named console, or a key named console", () => expect(kinds("a.console.log(1); const o = { console: 1 };")).toEqual([]));
  it("finds a debugger statement, and not a member named debugger", () => {
    expect(kinds("function f() { debugger; }")).toEqual(["debugger"]);
    expect(kinds("a.debugger = 1;")).toEqual([]);
  });
  it.each(["alert", "confirm", "prompt"])("finds %s called on its own and on the window", (n) => {
    expect(kinds(`${n}("x");`)).toEqual(["dialog"]);
    expect(kinds(`window.${n}("x");`)).toEqual(["dialog"]);
    expect(kinds(`globalThis.${n}("x");`)).toEqual(["dialog"]);
  });
  it("does not find a dialog name that is a method of something else, a declaration or a value", () => {
    expect(kinds("modal.alert('x'); function alert(m) {} const f = alert; user.prompt('a');")).toEqual([]);
  });
  it("does not find a name that is only part of a longer word", () => expect(kinds("alerts(1); promptly(2); consoles.log(3);")).toEqual([]));
});

describe("hooks for errors nobody caught", () => {
  it("finds an assignment to onerror on the window or the global scope", () => {
    expect(details("window.onerror = f; self.onunhandledrejection = g; globalThis.onrejectionhandled = h;")).toEqual(["window.onerror", "self.onunhandledrejection", "globalThis.onrejectionhandled"]);
  });
  it("does not find onerror on another object, such as a file reader", () => expect(kinds("reader.onerror = () => {}; req.onerror = f;")).toEqual([]));
  it("finds a call of reportError", () => expect(details("reportError(e);")).toEqual(["reportError"]));
  it("does not find reportError as a key in an object, as in a list of messages", () => expect(kinds('const m = { reportError: "text", other: 1 };')).toEqual([]));
  it("does not find a method named reportError", () => expect(kinds("a.reportError(e);")).toEqual([]));
  it("finds a listener for error or unhandledrejection", () => {
    expect(details("window.addEventListener('error', f); self.addEventListener(\"unhandledrejection\", g);")).toEqual(['addEventListener("error")', 'addEventListener("unhandledrejection")']);
  });
  it("finds the on form used by a map or a process", () => expect(details("map.on('error', f); process.on('uncaughtException', g); process.on(\"unhandledRejection\", h);")).toEqual(['on("error")', 'on("uncaughtException")', 'on("unhandledRejection")']));
  it("does not find a listener for another event", () => expect(kinds("window.addEventListener('resize', f); map.on('click', g); a.on(name, h);")).toEqual([]));
  it("does not find a listener whose event is not written as a string", () => expect(kinds("a.addEventListener(type, f); a.addEventListener(`error`, f);")).toEqual([]));
});

describe("boundaries", () => {
  it("finds the two methods that catch errors in a screen", () => expect(details("class A { static getDerivedStateFromError() { return {}; } componentDidCatch(e) {} }")).toEqual(["getDerivedStateFromError", "componentDidCatch"]));
  it("does not find them in a comment", () => expect(kinds("// getDerivedStateFromError")).toEqual([]));
});

describe("caughtNames", () => {
  const names = (t: string): string[] => [...caughtNames(t, identTokens(t))].sort();
  it("reads the name bound by catch, with or without a type", () => {
    expect(names("try {} catch (e) {}")).toEqual(["e"]);
    expect(names("try {} catch (err: unknown) {}")).toEqual(["err"]);
    expect(names("try {} catch {}")).toEqual([]);
  });
  it("reads the parameter of a catch method on a promise", () => {
    expect(names("p.catch((e) => f(e)); q.catch(err => g(err)); r.catch(() => 1);")).toEqual(["e", "err"]);
    expect(names("p.catch((e: Error) => f(e));")).toEqual(["e"]);
  });
  it("reads every name in the file", () => expect(names("try {} catch (a) {} try {} catch (b) {}")).toEqual(["a", "b"]));
  it("does not take a name that is only written in a string or comment", () => expect(names("// catch (e)\nconst s = 'catch (e)';")).toEqual([]));
});

describe("the text of a caught error", () => {
  it("finds the message of a caught error", () => expect(details("try { f(); } catch (err) { show(err.message); }")).toEqual(["err.message"]));
  it("finds a message in a ternary, the usual way", () => expect(kinds("try {} catch (e) { const s = e instanceof Error ? e.message : String(e); }")).toEqual(["error-string", "error-text"]));
  it("finds the stack of a caught error", () => expect(details("try {} catch (e) { log(e.stack); }")).toEqual(["e.stack"]));
  it("finds String() and toString() of a caught error", () => expect(details("try {} catch (e) { a(String(e)); b(e.toString()); }")).toEqual(["String(e)", "e.toString"]));
  it("does not find message on a name that is not a caught error", () => expect(kinds("const err = f(); show(err.message); try {} catch (e) {}")).toEqual([]));
  it("does not find a message that is only compared or tested", () => {
    expect(kinds('try {} catch (e) { if (e.message === "x") {} if (e.message !== "y") {} if (e.message.includes("z")) {} if (e.message.startsWith("a")) {} }')).toEqual([]);
  });
  it("finds a message that is compared with a fixed one and also shown", () => expect(kinds('try {} catch (e) { if (e.message === "x") {} show(e.message); }')).toEqual(["error-text"]));
  it("does not find String() of something that is not a caught error", () => expect(kinds("const n = String(x); try {} catch (e) {}")).toEqual([]));
  it("does not find a member named like a caught name after another dot", () => expect(kinds("try {} catch (e) { a.e.message; }")).toEqual([]));
  it("reads a name caught with a promise catch", () => expect(kinds("p.catch((e) => show(e.message));")).toEqual(["error-text"]));
  it("keeps the line of each find", () => expect(scan("try {}\ncatch (e) {\n  show(e.message);\n}").map((s) => s.line)).toEqual([3]));
});

describe("thrown messages", () => {
  it("finds a message that writes a value, with the expressions", () => expect(details("throw new Error(`bad ${a} and ${b.c}`);")).toEqual(["Error: a | b.c"]));
  it("finds the kinds of error, and an error of the code's own", () => expect(details("throw new TypeError(`x ${a}`); throw new RangeError(`y ${b}`); throw new InstallBudgetError(`z ${c}`);")).toEqual(["TypeError: a", "RangeError: b", "InstallBudgetError: c"]));
  it("does not find a message with no expression, or a message that is not a template", () => expect(kinds("throw new Error(`plain`); throw new Error('x ' + a); throw new Error();")).toEqual([]));
  it("does not find a call that is not made with new, or a word that only ends in Error", () => expect(kinds("Error(`x ${a}`); new Errors(`x ${a}`); new Terror(`x ${a}`);")).toEqual([]));
  it("lists the names that look like a typed value", () => {
    expect(scan("throw new Error(`bad ${query}`);")[0]?.userNames).toEqual(["query"]);
    expect(scan("throw new Error(`bad ${spec.name} ${count}`);")[0]?.userNames).toEqual(["name"]);
    expect(scan("throw new Error(`bad ${id}`);")[0]?.userNames).toEqual([]);
  });
  it("reads a template with a template inside its expression", () => expect(details("throw new Error(`a: ${p.map((x) => `${x.code}`).join(',')}`);")).toHaveLength(1));
  it("reads a message in a call that runs over lines", () => expect(scan("throw new Error(\n  `bad ${label}`,\n);")[0]?.userNames).toEqual(["label"]));
});

describe("scanDiagnostics and countThrows", () => {
  it("scans only the files it reads, in path order", () => {
    const f = [{ path: "apps/web/src/b.ts", text: "console.log(1);" }, { path: "apps/web/src/a.ts", text: "debugger;" }, { path: "apps/web/src/a.test.ts", text: "console.log(2);" }, { path: "other/x.ts", text: "console.log(3);" }];
    expect(scanDiagnostics(f).map((s) => `${s.path} ${s.kind}`)).toEqual(["apps/web/src/a.ts debugger", "apps/web/src/b.ts console"]);
  });
  it("counts throw statements in the files it reads, and not a member named throw", () => {
    const f = [{ path: "apps/web/src/a.ts", text: "throw a; if (x) throw new Error('x'); gen.throw(e); // throw\nconst s = 'throw';" }, { path: "apps/web/src/a.test.ts", text: "throw 1;" }];
    expect(countThrows(f)).toBe(2);
  });
  it("lists nine kinds, each once", () => {
    expect(DG_KINDS).toHaveLength(9);
    expect(new Set(DG_KINDS).size).toBe(9);
  });
  it("sorts the sites of a file by line, then kind", () => expect(scan("console.log(1); debugger;\nalert(1);").map((s) => `${s.line} ${s.kind}`)).toEqual(["1 console", "1 debugger", "2 dialog"]));
  it("never throws on odd text", () => {
    for (const s of ["", "`", "catch (", "new Error(`${", "console.", "window.onerror", "a.addEventListener(", "try {} catch (e) { e.", "/*", "'"]) expect(() => scan(s)).not.toThrow();
  });
});
