import { describe, expect, it } from "vitest";
import { bindingOf, describeFlow, flowsInFile, flowsOf, reachingNetwork, unfollowed } from "./idFlow";

const P = "apps/web/src/x.ts";
const flows = (text: string, path = P) => flowsInFile({ path, text });

describe("bindingOf", () => {
  const col = (line: string): number => line.indexOf("crypto");
  it("reads a const", () => expect(bindingOf("const id = crypto.randomUUID();", col("const id = crypto.randomUUID();"))).toEqual({ kind: "name", name: "id" }));
  it("reads let and var", () => {
    expect(bindingOf("let a = crypto.randomUUID();", 8)).toEqual({ kind: "name", name: "a" });
    expect(bindingOf("var b = crypto.randomUUID();", 8)).toEqual({ kind: "name", name: "b" });
  });
  it("reads a const with a type", () => expect(bindingOf("const id: string = crypto.randomUUID();", 20)).toEqual({ kind: "name", name: "id" }));
  it("reads an assignment to a name and to a property", () => {
    expect(bindingOf("token = crypto.randomUUID();", 8)).toEqual({ kind: "name", name: "token" });
    expect(bindingOf("this.token = crypto.randomUUID();", 13)).toEqual({ kind: "name", name: "token" });
  });
  it("reads an object key", () => expect(bindingOf("  id: crypto.randomUUID(),", 6)).toEqual({ kind: "key", name: "id" }));
  it("reads a key after another", () => expect(bindingOf("{ a: 1, id: crypto.randomUUID() }", 14)).toEqual({ kind: "key", name: "id" }));
  it("says none for a call with no name", () => expect(bindingOf("send(crypto.randomUUID());", 5)).toEqual({ kind: "none" }));
  it("does not take a comparison for an assignment", () => expect(bindingOf("if (a === crypto.randomUUID()) {}", 11)).toEqual({ kind: "none" }));
});

describe("flowsInFile", () => {
  it("follows a name to a store on another line", () => {
    const f = flows("const id = crypto.randomUUID();\nconst item = {};\ndb.items.put(id);");
    expect(f).toHaveLength(1);
    expect(f[0]?.binding).toEqual({ kind: "name", name: "id" });
    expect(f[0]?.storedLines).toEqual([3]);
    expect(f[0]?.networkLines).toEqual([]);
  });
  it("follows a name to a network call", () => {
    const f = flows("const id = crypto.randomUUID();\nawait fetch('/x', { body: id });");
    expect(f[0]?.networkLines).toEqual([2]);
  });
  it("sees send, sendBeacon, postMessage, XMLHttpRequest and WebSocket", () => {
    for (const call of ["ws.send(id)", "navigator.sendBeacon(u, id)", "port.postMessage(id)", "new XMLHttpRequest(id)", "new WebSocket(id)"]) {
      expect(flows(`const id = Math.random();\n${call};`)[0]?.networkLines, call).toEqual([2]);
    }
  });
  it("does not take another name that holds the name for the name", () => expect(flows("const id = crypto.randomUUID();\nfetch(userid);\nfetch(a.id);")[0]?.networkLines).toEqual([]));
  it("does not count the line that makes the id", () => expect(flows("const id = crypto.randomUUID(); fetch(id);")[0]?.networkLines).toEqual([]));
  it("does not follow an object key", () => {
    const f = flows("const item = {\n  id: crypto.randomUUID(),\n};\nfetch(item);");
    expect(f[0]?.binding).toEqual({ kind: "key", name: "id" });
    expect(f[0]?.networkLines).toEqual([]);
  });
  it("reads a name in a template expression as a use", () => expect(flows("const id = Math.random();\nfetch(`/x/${id}`);")[0]?.networkLines).toEqual([2]));
  it("does not read a name in a string or a comment as a use", () => expect(flows("const id = Math.random();\nfetch('id'); // id\n")[0]?.networkLines).toEqual([]));
  it("follows only the kinds that make an identifier", () => expect(flows("const w = navigator.hardwareConcurrency;")).toEqual([]));
  it("gives nothing for a file that is not scanned", () => expect(flows("const id = Math.random();", "apps/web/src/x.test.ts")).toEqual([]));
  it("follows each site on its own", () => expect(flows("const a = Math.random();\nconst b = Math.random();\nfetch(b);").map((f) => f.networkLines)).toEqual([[], [3]]));
});

describe("flowsOf, reachingNetwork and unfollowed", () => {
  const all = flowsOf([
    { path: "apps/web/src/b.ts", text: "const id = Math.random();\nfetch(id);" },
    { path: "apps/web/src/a.ts", text: "x({ id: crypto.randomUUID() });\nsend(crypto.randomUUID());" },
  ]);
  it("sorts by path and line", () => expect(all.map((f) => `${f.site.path.slice(-4)}:${f.site.line}`)).toEqual(["a.ts:1", "a.ts:2", "b.ts:1"]));
  it("picks the ones that reach the network", () => expect(reachingNetwork(all).map((f) => f.site.path)).toEqual(["apps/web/src/b.ts"]));
  it("picks the ones that could not be followed", () => expect(unfollowed(all).map((f) => f.binding.kind)).toEqual(["key", "none"]));
});

describe("describeFlow", () => {
  it("writes the place, the binding and the lines", () => {
    const [f] = flows("const id = crypto.randomUUID();\ndb.put(id);\nfetch(id);");
    expect(f && describeFlow(f)).toBe("apps/web/src/x.ts:1 randomUUID -> name id; stored 2; network 3");
  });
  it("writes a dash for no lines and says no name", () => {
    const [f] = flows("send(Math.random());");
    expect(f && describeFlow(f)).toBe("apps/web/src/x.ts:1 Math.random -> no name; stored -; network -");
  });
});
