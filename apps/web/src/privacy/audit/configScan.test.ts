import { describe, expect, it } from "vitest";
import { CONFIG_CODES, scanConfig } from "./configScan";

const VITEST = `import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    include: ["a/**/*.test.ts", 'b/**/*.test.tsx'],
    // comment with exclude: ["not-this"]
    exclude: ["**/node_modules/**", "x/**"],
  },
});
`;

const codes = (text: string): string[] => scanConfig("c.ts", text).findings.map((f) => f.code);

describe("lists", () => {
  it("reads the strings of the include and exclude lists", () => {
    const f = scanConfig("vitest.config.ts", VITEST);
    expect(f.lists["include"]).toEqual(["a/**/*.test.ts", "b/**/*.test.tsx"]);
    expect(f.lists["exclude"]).toEqual(["**/node_modules/**", "x/**"]);
  });
  it("does not read a list that is written in a comment", () => expect(scanConfig("c.ts", "// include: ['a']\nexport default {};").lists).toEqual({}));
  it("does not read a list that is written in a string", () => expect(scanConfig("c.ts", "const s = \"exclude: ['a']\";").lists).toEqual({}));
  it("reads an empty list as empty", () => expect(scanConfig("c.ts", "export default { include: [] };").lists["include"]).toEqual([]));
  it("reads a list that runs over lines, with comments and a comma at the end", () => {
    const t = "export default {\n  ignores: [\n    // first\n    'a/**', /* second */ \"b/**\",\n  ],\n};";
    expect(scanConfig("c.ts", t).lists["ignores"]).toEqual(["a/**", "b/**"]);
  });
  it("reads only the strings written directly in the list, not in a list inside it", () => expect(scanConfig("c.ts", "export default { include: ['a', ['b'], f('c'), 'd'] };").lists["include"]).toEqual(["a", "d"]));
  it("reads a template string with no substitution as its text", () => expect(scanConfig("c.ts", "export default { include: [`a/**`] };").lists["include"]).toEqual(["a/**"]));
  it("reads a string with a bracket or a comma in it", () => expect(scanConfig("c.ts", "export default { include: ['a[1],b', 'c'] };").lists["include"]).toEqual(["a[1],b", "c"]));
  it("reads the setup files and the global setup", () => {
    const f = scanConfig("c.ts", "export default { setupFiles: ['s.ts'], globalSetup: ['g.ts'] };");
    expect(f.lists).toEqual({ setupFiles: ["s.ts"], globalSetup: ["g.ts"] });
  });
  it("does not read a key that is only the end of another name", () => expect(scanConfig("c.ts", "export default { myinclude: ['a'], reinclude: ['b'] };").lists).toEqual({}));
  it("does not read a key whose value is not a list written out", () => expect(scanConfig("c.ts", "export default { include: patterns };").lists).toEqual({}));
  it("does not read a list that is not closed", () => expect(scanConfig("c.ts", "export default { include: ['a'").lists).toEqual({}));
  it("reads the first list when a key is written twice", () => expect(scanConfig("c.ts", "const a = { include: ['x'] }; const b = { include: ['y'] };").lists["include"]).toEqual(["x"]));
});

describe("settings that change how a failure is treated", () => {
  it("finds nothing in the plain config", () => expect(codes(VITEST)).toEqual([]));
  it.each([
    ["retry: 2", "config-retry", "retry is set to 2"],
    ["retry: 0", "config-retry", "retry is set to 0"],
    ["bail: 1", "config-bail", "bail is set to 1"],
    ["testTimeout: 60000", "config-timeout", "testTimeout is set to 60000"],
    ["hookTimeout: 30_000", "config-timeout", "hookTimeout is set to 30_000"],
    ["teardownTimeout: 1", "config-timeout", "teardownTimeout is set to 1"],
    ["passWithNoTests: true", "config-pass-with-no-tests", "passWithNoTests is true"],
    ["allowOnly: true", "config-allow-only", "allowOnly is true"],
    ["silent: true", "config-silent", "silent is true: console output of the tests is hidden"],
  ])("finds %s", (setting, code, detail) => {
    const f = scanConfig("c.ts", `export default { test: { ${setting} } };`).findings;
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ code, detail, path: "c.ts", line: 1 });
  });
  it.each([["passWithNoTests: false"], ["allowOnly: false"], ["silent: false"]])("does not find %s", (s) => expect(codes(`export default { test: { ${s} } };`)).toEqual([]));
  it("does not find a setting that is only named in a comment or a string", () => {
    expect(codes("// retry: 3\nconst s = 'bail: 1'; const t = `testTimeout: 5`;")).toEqual([]);
  });
  it("does not find a word that only ends like a setting", () => expect(codes("export default { test: { shouldretry: 1, mybail: 2, notimeout: 3 } };")).toEqual([]));
  it("gives the line of a finding", () => expect(scanConfig("c.ts", "a;\nb;\nexport default { retry: 1 };").findings[0]?.line).toBe(3));
  it("gives findings in line order", () => {
    const f = scanConfig("c.ts", "export default {\n  bail: 1,\n  retry: 1,\n};").findings;
    expect(f.map((x) => x.code)).toEqual(["config-bail", "config-retry"]);
  });
});

describe("lint rules turned down", () => {
  const rules = (body: string) => scanConfig("eslint.config.js", `export default [{ rules: { ${body} } }];`).findings.map((f) => `${f.code}:${f.detail}`);
  it("finds a rule set to off, as text or as 0", () => {
    expect(rules('"no-console": "off"')).toEqual(["config-lint-off:no-console is off"]);
    expect(rules("'no-undef': 'off'")).toEqual(["config-lint-off:no-undef is off"]);
    expect(rules('"no-undef": 0')).toEqual(["config-lint-off:no-undef is off"]);
  });
  it("finds a rule set to warn, as text or as 1", () => {
    expect(rules('"no-console": "warn"')).toEqual(["config-lint-warn:no-console is warn"]);
    expect(rules('"no-console": 1')).toEqual(["config-lint-warn:no-console is warn"]);
  });
  it("finds a rule turned down with a list that has options", () => {
    expect(rules('"no-console": ["off", { allow: ["warn"] }]')).toEqual(["config-lint-off:no-console is off"]);
    expect(rules('"a/b": ["warn"]')).toEqual(["config-lint-warn:a/b is warn"]);
  });
  it("does not find a rule set to error", () => expect(rules('"no-console": "error", "no-undef": 2, "x/y": ["error", "always"]')).toEqual([]));
  it("finds a rule with a scoped name", () => expect(rules('"@typescript-eslint/no-explicit-any": "off"')).toEqual(["config-lint-off:@typescript-eslint/no-explicit-any is off"]));
  it("does not find a rule that is written in a comment or a string", () => {
    expect(scanConfig("e.js", '// "no-console": "off"\nconst s = \'"a": "off"\';').findings).toEqual([]);
  });
  it("does not take a value like 10 or off-site for off or warn", () => expect(rules('"a": 10, "b": 11, "c": "offsite", "d": "warning"')).toEqual([]));
  it("finds several rules, each once", () => expect(rules('"a": "off", "b": "warn", "c": 0')).toHaveLength(3));
});

describe("scanConfig", () => {
  it("never throws on odd text", () => {
    for (const s of ["", "{", "[", "include: [", "'", "`${", "/*", '"a": "off', "retry:", "export default {", "include: ['a'", "ignores: ["]) expect(() => scanConfig("c.ts", s)).not.toThrow();
  });
  it("has the path it was given", () => expect(scanConfig("x/y.ts", "").path).toBe("x/y.ts"));
  it("lists 8 codes, each once", () => {
    expect(CONFIG_CODES).toHaveLength(8);
    expect(new Set(CONFIG_CODES).size).toBe(8);
  });
});
