import { describe, expect, it } from "vitest";
import { readScripts, SCRIPT_CODES, scanScripts, type ScriptCode } from "./scriptScan";

const pkg = (scripts: Record<string, string>): string => JSON.stringify({ name: "x", scripts });
const codes = (scripts: Record<string, string>): ScriptCode[] => scanScripts("package.json", pkg(scripts)).map((f) => f.code);

describe("readScripts", () => {
  it("reads the scripts in the order written", () => expect(readScripts(pkg({ b: "1", a: "2" }))).toEqual([["b", "1"], ["a", "2"]]));
  it("is empty when there are no scripts", () => expect(readScripts('{"name":"x"}')).toEqual([]));
  it("is null for text that is not JSON, not an object, or has scripts that are not an object", () => {
    expect(readScripts("{ nope")).toBeNull();
    expect(readScripts("[1]")).toBeNull();
    expect(readScripts("null")).toBeNull();
    expect(readScripts('{"scripts": []}')).toBeNull();
    expect(readScripts('{"scripts": "x"}')).toBeNull();
  });
  it("leaves out a script that is not text", () => expect(readScripts('{"scripts": {"a": 1, "b": "ok"}}')).toEqual([["b", "ok"]]));
});

describe("scanScripts", () => {
  it("finds nothing in plain scripts", () => expect(codes({ build: "vite build", test: "vitest run", lint: "eslint .", typecheck: "tsc -p tsconfig.json" })).toEqual([]));

  it.each([
    ["vitest run || true"],
    ["vitest run ||true"],
    ["eslint . || exit 0"],
    ["eslint . || :"],
    ["vitest run; true"],
    ["vitest run; exit 0"],
    ["eslint . --exit-zero"],
    ["eslint . --no-error-on-unmatched-pattern"],
    ["eslint . --max-warnings 999"],
    ["eslint . --max-warnings=-1"],
  ])("finds a failure turned into success in %s", (cmd) => expect(codes({ lint: cmd })).toEqual(["script-failure-ignored"]));

  it.each([["eslint . --max-warnings 0"], ["eslint . --max-warnings=10"], ["a || trueish"], ["echo true; echo done"], ["x || exit 1"], ["a && b"]])("does not find a failure turned into success in %s", (cmd) => expect(codes({ x: cmd })).toEqual([]));

  it.each([["vitest run --passWithNoTests"], ["vitest --allowOnly"]])("finds a flag that lets an empty or partial run pass in %s", (cmd) => expect(codes({ test: cmd })).toEqual(["script-no-tests-pass"]));
  it.each([["vitest run --retry=2"], ["playwright test --retries 3"]])("finds a retry in %s", (cmd) => expect(codes({ test: cmd })).toEqual(["script-retry"]));
  it.each([["vitest run --testTimeout=60000"], ["vitest run --hookTimeout 9000"], ["vitest --teardownTimeout=1"], ["timeout 60 vitest run"]])("finds a timeout change in %s", (cmd) => expect(codes({ test: cmd })).toEqual(["script-timeout"]));
  it.each([["git commit --no-verify"], ["HUSKY=0 npm ci"]])("finds a hook skipped in %s", (cmd) => expect(codes({ x: cmd })).toEqual(["script-hook-skipped"]));
  it.each([["npm ci --force"], ["npm install --legacy-peer-deps"]])("finds a forced install in %s", (cmd) => expect(codes({ x: cmd })).toEqual(["script-force"]));
  it.each([["curl https://example.org/a.js -o a.js"], ["wget https://example.org/a"], ["a && curl x"], ["(curl x)"]])("finds a fetch in %s", (cmd) => expect(codes({ x: cmd })).toContain("script-fetches"));
  it("finds a pipe into a shell", () => expect(codes({ x: "curl https://example.org/i | sh" })).toEqual(["script-fetches", "script-pipe-to-shell"]));
  it.each([["cat x | bash"], ["cat x | sudo sh"], ["cat x | zsh"], ["cat x | dash"]])("finds a pipe into a shell in %s", (cmd) => expect(codes({ x: cmd })).toEqual(["script-pipe-to-shell"]));
  it("does not take a word that only starts like a shell or fetch command", () => expect(codes({ x: "cat a | shuf; echo curling; echo timeouts" })).toEqual([]));

  it.each(["preinstall", "install", "postinstall", "prepare", "prepublish", "prepublishOnly", "prepack", "postpack"])("finds the %s script", (name) => {
    const f = scanScripts("package.json", pkg({ [name]: "tsc -p x" }));
    expect(f.map((x) => x.code)).toEqual(["script-install-lifecycle"]);
    expect(f[0]?.script).toBe(name);
  });
  it.each(["predev", "pretest", "postbuild", "prebuild", "build", "test"])("does not find the %s script", (name) => expect(codes({ [name]: "tsc" })).toEqual([]));

  it("finds each problem in each script, with the name of the script", () => {
    const f = scanScripts("p/package.json", pkg({ a: "x || true", b: "y --retry=1", c: "z" }));
    expect(f.map((x) => [x.script, x.code])).toEqual([["a", "script-failure-ignored"], ["b", "script-retry"]]);
    expect(f[0]?.path).toBe("p/package.json");
  });
  it("finds two problems in one script", () => expect(codes({ test: "vitest run --retry=1 --passWithNoTests || true" }).sort()).toEqual(["script-failure-ignored", "script-no-tests-pass", "script-retry"]));
  it("says when the file is not a package file", () => {
    const f = scanScripts("package.json", "{ nope");
    expect(f).toEqual([{ code: "script-unreadable", path: "package.json", script: "", detail: "the file is not JSON with an object of scripts" }]);
  });
  it("finds nothing in a package with no scripts", () => expect(scanScripts("package.json", '{"name":"x"}')).toEqual([]));
  it("lists 10 codes, each once", () => {
    expect(SCRIPT_CODES).toHaveLength(10);
    expect(new Set(SCRIPT_CODES).size).toBe(10);
  });
});
