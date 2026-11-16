import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadFiles } from "./repoFiles";

const root = mkdtempSync(join(tmpdir(), "repo-audit-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function put(rel: string, text: string): void {
  const full = join(root, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, text);
}

put("apps/web/src/a.ts", "a");
put("apps/web/src/deep/b.ts", "b");
put("apps/web/src/node_modules/x/c.ts", "skip me");
put("apps/web/src/dist/d.ts", "skip me too");
put("apps/web/src/big.ts", "x".repeat(1_000_001));
put(".github/workflows/ci.yml", "on: push");

describe("loadFiles", () => {
  it("returns repo-relative paths with forward slashes, in a stable order", () => {
    const files = loadFiles(root, ["apps/web/src", ".github/workflows"]);
    expect(files.map((f) => f.path)).toEqual([
      "apps/web/src/a.ts",
      "apps/web/src/deep/b.ts",
      ".github/workflows/ci.yml",
    ]);
    expect(files[0]?.text).toBe("a");
  });
  it("skips dependency and build folders and files over 1 MB", () => {
    const paths = loadFiles(root, ["apps/web/src"]).map((f) => f.path);
    expect(paths.some((p) => p.includes("node_modules") || p.includes("dist") || p.endsWith("big.ts"))).toBe(false);
  });
  it("skips a folder that does not exist", () => {
    expect(loadFiles(root, ["nope", "apps/web/src/a.ts"])).toEqual([]);
  });
});
