import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CATALOG } from "./messages";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const sources = walk(SRC).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));
const text = sources.map((f) => readFileSync(f, "utf8")).join("\n");
const IDS = Object.keys(CATALOG);

const literal = [...text.matchAll(/\bmessage\(\s*"([a-zA-Z0-9.]+)"/g)].map((m) => m[1]!);
const prefixes = [...text.matchAll(/\bmessage\(\s*`([a-zA-Z0-9.]+)\$\{/g)].map((m) => m[1]!);

describe("message ids in the source", () => {
  it("finds the calls this audit relies on", () => {
    expect(sources.length).toBeGreaterThan(50);
    expect(literal.length).toBeGreaterThan(10);
    expect(prefixes.length).toBeGreaterThan(0);
  });
  it("uses only ids that exist when the id is a plain string", () => {
    for (const id of new Set(literal)) expect(IDS, id).toContain(id);
  });
  it("uses a prefix that starts at least one id when the id is built", () => {
    for (const p of new Set(prefixes)) expect(IDS.some((id) => id.startsWith(p)), p).toBe(true);
  });
  it("has every catalogue id reachable by a plain call, a built id, or a mention of the id in the source", () => {
    const lit = new Set(literal);
    const unreached = IDS.filter((id) => !lit.has(id) && !prefixes.some((p) => id.startsWith(p)) && !text.includes(`"${id}"`));
    expect(unreached).toEqual([]);
  });
});

describe("built ids", () => {
  it("has a message for every report option, tag and tier meaning that the code can ask for", () => {
    for (const p of ["report.opt.", "pack.tag.", "tier.meaning."]) {
      if (!prefixes.includes(p)) continue;
      expect(IDS.filter((id) => id.startsWith(p)).length, p).toBeGreaterThan(1);
    }
  });
});
