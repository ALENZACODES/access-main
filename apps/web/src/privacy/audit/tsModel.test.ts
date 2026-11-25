import { describe, expect, it } from "vitest";
import { effectiveFlags, joinPath, parseTsConfig, resolveExtends, STRICT_FAMILY, TS_FLAGS, withStrict, type TsConfig } from "./tsModel";

const cfg = (path: string, body: string): TsConfig => parseTsConfig(path, body);
const eff = (...cs: TsConfig[]) => effectiveFlags(cs);

describe("parseTsConfig", () => {
  it("reads the flags that are written, as true or false, and leaves the others absent", () => {
    const c = cfg("a/tsconfig.json", '{ "compilerOptions": { "strict": true, "skipLibCheck": false, "target": "ES2022" } }');
    expect(c.problem).toBeNull();
    expect(c.flags["strict"]).toBe("true");
    expect(c.flags["skipLibCheck"]).toBe("false");
    expect(c.flags["noUncheckedIndexedAccess"]).toBe("absent");
  });
  it("reads comments and trailing commas", () => {
    const c = cfg("t.json", '{\n  // strict\n  "compilerOptions": {\n    "strict": true, /* on */\n  },\n}');
    expect(c.problem).toBeNull();
    expect(c.flags["strict"]).toBe("true");
  });
  it("gives the line of each flag", () => {
    const c = cfg("t.json", '{\n  "compilerOptions": {\n    "strict": true,\n    "noEmit": true\n  }\n}');
    expect(c.lines).toEqual({ strict: 3, noEmit: 4 });
  });
  it("does not take a flag outside compilerOptions", () => {
    const c = cfg("t.json", '{ "strict": true, "compilerOptions": {} }');
    expect(c.flags["strict"]).toBe("absent");
  });
  it("keeps a flag that is not true or false as unknown", () => {
    const c = cfg("t.json", '{ "compilerOptions": { "strict": "yes", "noEmit": 1, "checkJs": null } }');
    expect([c.flags["strict"], c.flags["noEmit"], c.flags["checkJs"]]).toEqual(["unknown", "unknown", "unknown"]);
  });
  it("reads the lists include and exclude, or null when they are not lists of text", () => {
    expect(cfg("t.json", '{ "include": ["src"], "exclude": ["dist", "x"] }')).toMatchObject({ include: ["src"], exclude: ["dist", "x"] });
    expect(cfg("t.json", '{ "include": "src", "exclude": [1] }')).toMatchObject({ include: null, exclude: null });
    expect(cfg("t.json", "{}")).toMatchObject({ include: null, exclude: null });
  });
  it("reads extends as text, as a list of text, or as unreadable", () => {
    expect(cfg("t.json", '{ "extends": "./base.json" }').extends).toEqual(["./base.json"]);
    expect(cfg("t.json", '{ "extends": ["./a", "./b"] }').extends).toEqual(["./a", "./b"]);
    const bad = cfg("t.json", '{ "extends": 3 }');
    expect(bad.extends).toEqual([]);
    expect(bad.extendsUnreadable).toBe(true);
    expect(cfg("t.json", "{}").extendsUnreadable).toBe(false);
  });
  it("reports text that cannot be read", () => {
    const c = cfg("t.json", "{ nope");
    expect(c.problem).not.toBeNull();
    expect(c.flags["strict"]).toBe("absent");
  });
  it("reports a file that is not an object", () => expect(cfg("t.json", "[1]").problem).toBe("the file is not an object"));
  it("reads a compilerOptions that is not an object as having no flags", () => expect(cfg("t.json", '{ "compilerOptions": 5 }').flags["strict"]).toBe("absent"));
  it("has a flag for every name in TS_FLAGS", () => expect(Object.keys(cfg("t.json", "{}").flags)).toEqual([...TS_FLAGS]));
  it("keeps the strict family inside the flags", () => {
    for (const f of STRICT_FAMILY) expect(TS_FLAGS).toContain(f);
  });
});

describe("joinPath", () => {
  it.each([
    ["a/b", "./c.json", "a/b/c.json"],
    ["a/b", "../c.json", "a/c.json"],
    ["a/b", "../../c.json", "c.json"],
    ["", "./c.json", "c.json"],
    ["a", "b//c", "a/b/c"],
    ["a/b", "./", "a/b"],
  ])("%s + %s is %s", (d, r, out) => expect(joinPath(d, r)).toBe(out));
  it("is null when the path climbs out of the root", () => {
    expect(joinPath("a", "../../x")).toBeNull();
    expect(joinPath("", "../x")).toBeNull();
  });
});

describe("resolveExtends", () => {
  const known = new Set(["tsconfig.base.json", "apps/web/tsconfig.json", "packages/x/tsconfig.json", "packages/x/base.json"]);
  it("finds a relative file, with or without the ending", () => {
    expect(resolveExtends("apps/web/tsconfig.node.json", "./tsconfig.json", known)).toBe("apps/web/tsconfig.json");
    expect(resolveExtends("apps/web/tsconfig.node.json", "./tsconfig", known)).toBe("apps/web/tsconfig.json");
    expect(resolveExtends("packages/x/tsconfig.e2e.json", "./base", known)).toBe("packages/x/base.json");
  });
  it("finds a file in a folder", () => expect(resolveExtends("tsconfig.json", "./apps/web", known)).toBe("apps/web/tsconfig.json"));
  it("goes up a folder", () => expect(resolveExtends("apps/web/tsconfig.json", "../../tsconfig.base.json", known)).toBe("tsconfig.base.json"));
  it("is null for a package name, a missing file and a path out of the root", () => {
    expect(resolveExtends("a/tsconfig.json", "@tsconfig/strictest", known)).toBeNull();
    expect(resolveExtends("a/tsconfig.json", "./nothing.json", known)).toBeNull();
    expect(resolveExtends("tsconfig.json", "../x.json", known)).toBeNull();
  });
});

describe("effectiveFlags", () => {
  it("is the flags of the file when it extends nothing", () => {
    const e = eff(cfg("a.json", '{ "compilerOptions": { "strict": true } }')).get("a.json");
    expect(e?.["strict"]).toBe("true");
    expect(e?.["skipLibCheck"]).toBe("absent");
  });
  it("takes a flag from the file it extends", () => {
    const m = eff(cfg("base.json", '{ "compilerOptions": { "strict": true, "noEmit": true } }'), cfg("child.json", '{ "extends": "./base.json" }'));
    expect(m.get("child.json")?.["strict"]).toBe("true");
    expect(m.get("child.json")?.["noEmit"]).toBe("true");
  });
  it("lets the child change a flag of the file it extends", () => {
    const m = eff(cfg("base.json", '{ "compilerOptions": { "strict": true } }'), cfg("child.json", '{ "extends": "./base.json", "compilerOptions": { "strict": false } }'));
    expect(m.get("child.json")?.["strict"]).toBe("false");
    expect(m.get("base.json")?.["strict"]).toBe("true");
  });
  it("follows a chain of files", () => {
    const m = eff(cfg("a.json", '{ "compilerOptions": { "noEmit": true } }'), cfg("b.json", '{ "extends": "./a.json" }'), cfg("c.json", '{ "extends": "./b.json", "compilerOptions": { "strict": true } }'));
    expect(m.get("c.json")?.["noEmit"]).toBe("true");
    expect(m.get("c.json")?.["strict"]).toBe("true");
    expect(m.get("b.json")?.["strict"]).toBe("absent");
  });
  it("lets a later file of a list of extends win", () => {
    const m = eff(cfg("a.json", '{ "compilerOptions": { "strict": true } }'), cfg("b.json", '{ "compilerOptions": { "strict": false } }'), cfg("c.json", '{ "extends": ["./a.json", "./b.json"] }'));
    expect(m.get("c.json")?.["strict"]).toBe("false");
  });
  it("keeps a flag unknown when the file it extends is not among the files read", () => {
    const e = eff(cfg("child.json", '{ "extends": "@tsconfig/strictest/tsconfig.json", "compilerOptions": { "noEmit": true } }')).get("child.json");
    expect(e?.["strict"]).toBe("unknown");
    expect(e?.["noEmit"]).toBe("true");
  });
  it("keeps a flag unknown when extends cannot be read, or the file has a problem", () => {
    expect(eff(cfg("a.json", '{ "extends": 3 }')).get("a.json")?.["strict"]).toBe("unknown");
    expect(eff(cfg("a.json", "{ broken")).get("a.json")?.["strict"]).toBe("unknown");
  });
  it("does not loop on files that extend each other", () => {
    const m = eff(cfg("a.json", '{ "extends": "./b.json" }'), cfg("b.json", '{ "extends": "./a.json", "compilerOptions": { "strict": true } }'));
    expect(m.get("a.json")?.["strict"]).toBe("true");
    expect(m.get("b.json")?.["strict"]).toBe("true");
  });
  it("does not loop on a file that extends itself", () => expect(eff(cfg("a.json", '{ "extends": "./a.json" }')).get("a.json")?.["strict"]).toBe("unknown"));
  it("has an entry for every file", () => expect([...eff(cfg("a.json", "{}"), cfg("b.json", "{}")).keys()]).toEqual(["a.json", "b.json"]));
});

describe("withStrict", () => {
  const e = (body: string) => eff(cfg("a.json", body)).get("a.json") as NonNullable<ReturnType<typeof eff>["get"] extends (k: string) => infer R ? R : never>;
  it("gives a flag of the strict family as true when strict is true and it is not written", () => expect(withStrict(e('{ "compilerOptions": { "strict": true } }'), "noImplicitAny")).toBe("true"));
  it("gives the flag as written when it is written", () => expect(withStrict(e('{ "compilerOptions": { "strict": true, "noImplicitAny": false } }'), "noImplicitAny")).toBe("false"));
  it("gives the state of strict when it is false or absent", () => {
    expect(withStrict(e('{ "compilerOptions": { "strict": false } }'), "strictNullChecks")).toBe("false");
    expect(withStrict(e("{}"), "strictNullChecks")).toBe("absent");
  });
  it("does not let strict decide a flag that is not in the family", () => expect(withStrict(e('{ "compilerOptions": { "strict": true } }'), "noUncheckedIndexedAccess")).toBe("absent"));
});
