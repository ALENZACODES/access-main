import { describe, expect, it } from "vitest";
import { classifyValue, countByPath, isSinkScanned, riskySinks, scanSinks, withoutCommentLines } from "./dgSink";

const P = "apps/web/src/x.ts";
const scan = (text: string, path = P) => scanSinks([{ path, text }]);

describe("isSinkScanned", () => {
  it("reads the code of the App", () => expect(isSinkScanned(P)).toBe(true));
  it("reads tsx and mjs", () => {
    expect(isSinkScanned("apps/web/src/a.tsx")).toBe(true);
    expect(isSinkScanned("apps/web/src/a.mjs")).toBe(true);
  });
  it("leaves out tests, e2e, dist and other folders", () => {
    for (const p of ["apps/web/src/x.test.ts", "apps/web/src/e2e/x.ts", "apps/web/dist/x.js", "apps/web/src/privacy/audit/x.ts", "packages/x.ts", "apps/web/src/x.css"]) expect(isSinkScanned(p), p).toBe(false);
  });
});

describe("classifyValue", () => {
  it("knows an empty string, either quote", () => {
    expect(classifyValue(' ""')).toEqual({ value: "empty", callee: "" });
    expect(classifyValue("''")).toEqual({ value: "empty", callee: "" });
  });
  it("knows a template", () => expect(classifyValue("`<p>${x}</p>`").value).toBe("template"));
  it("knows a call and names the function", () => expect(classifyValue(" render(a, b)")).toEqual({ value: "call", callee: "render" }));
  it("names the last function in a chain", () => expect(classifyValue("a.b.make (1)").callee).toBe("make"));
  it("calls anything else other", () => {
    expect(classifyValue("opts.flag ? a : b").value).toBe("other");
    expect(classifyValue("v").value).toBe("other");
  });
  it("has nothing for an empty right side", () => expect(classifyValue("  ").value).toBe("none"));
  it("does not take a string with text for an empty one", () => expect(classifyValue('"x"').value).toBe("other"));
});

describe("withoutCommentLines", () => {
  it("empties a line that is only a comment and keeps the line count", () => {
    const out = withoutCommentLines("a\n// el.innerHTML = x\n * b\n/* c */\nd");
    expect(out.split("\n")).toEqual(["a", "", "", "", "d"]);
  });
  it("keeps code that has a comment after it", () => expect(withoutCommentLines("x(); // y")).toBe("x(); // y"));
});

describe("scanSinks", () => {
  it("finds an assignment with a call", () => {
    const s = scan("el.innerHTML = render(a);");
    expect(s).toEqual([{ path: P, line: 1, kind: "assign", value: "call", callee: "render" }]);
  });
  it("reads the line of the write", () => expect(scan("a;\nb;\nel.innerHTML = `x`;")[0]?.line).toBe(3));
  it("finds outerHTML and srcdoc", () => expect(scan("a.outerHTML = f();\nb.srcdoc = g();").map((s) => s.kind)).toEqual(["assign", "assign"]));
  it("finds an append", () => expect(scan("el.innerHTML += x;")[0]).toMatchObject({ kind: "append", value: "other" }));
  it("does not take a comparison, an arrow or a read for a write", () => {
    expect(scan("if (el.innerHTML === x) {}\nconst f = o.innerHTML => 1;\nconst s = el.innerHTML;")).toEqual([]);
  });
  it("does not take a type or a property of an object for a write", () => expect(scan("interface A { innerHTML: string }\nconst o = { innerHTML: 'x' };")).toEqual([]));
  it("finds dangerouslySetInnerHTML", () => expect(scan("<div dangerouslySetInnerHTML={{ __html: h }} />", "apps/web/src/a.tsx")[0]?.kind).toBe("react-html"));
  it("finds insertAdjacentHTML and createContextualFragment", () => {
    expect(scan("el.insertAdjacentHTML('beforeend', h);").map((s) => s.kind)).toEqual(["adjacent"]);
    expect(scan("range.createContextualFragment(h);").map((s) => s.kind)).toEqual(["fragment"]);
  });
  it("finds document.write and writeln, but not another write", () => {
    expect(scan("document.write(h);\ndocument.writeln(h);\nstream.write(h);").map((s) => s.kind)).toEqual(["document-write", "document-write"]);
  });
  it("skips a comment line that names a sink", () => expect(scan("// el.innerHTML = x\n/* document.write(y) */")).toEqual([]));
  it("skips files it does not scan", () => expect(scan("el.innerHTML = x;", "apps/web/src/x.test.ts")).toEqual([]));
  it("stops the value at the end of the statement", () => expect(scan("el.innerHTML = a(); b = 2;")[0]?.callee).toBe("a"));
  it("sorts by path and then line", () => {
    const s = scanSinks([
      { path: "apps/web/src/b.ts", text: "x.innerHTML = a();" },
      { path: "apps/web/src/a.ts", text: "\nx.innerHTML = a();\nx.innerHTML = b();" },
    ]);
    expect(s.map((x) => `${x.path.slice(-4)}:${x.line}`)).toEqual(["a.ts:2", "a.ts:3", "b.ts:1"]);
  });
  it("reads a write after a slash that is not a regular expression", () => expect(scan("const r = a / b / c;\nel.innerHTML = f();")).toHaveLength(1));
});

describe("riskySinks and countByPath", () => {
  const sinks = scan('a.innerHTML = "";\nb.innerHTML = f();\nc.innerHTML = g();');
  it("leaves out a write that empties an element", () => {
    expect(sinks).toHaveLength(3);
    expect(riskySinks(sinks)).toHaveLength(2);
  });
  it("keeps an append of an empty string", () => expect(riskySinks(scan('a.innerHTML += "";'))).toHaveLength(1));
  it("counts the writes of each file", () => expect([...countByPath(riskySinks(sinks))]).toEqual([[P, 2]]));
});
