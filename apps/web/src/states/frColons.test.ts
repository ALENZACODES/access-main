import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATALOG, frTypography } from "./index";

const NBSP = "\u00a0";

const templatesOf = (value: unknown): string[] =>
  typeof value === "string" ? [value] : value && typeof value === "object" ? Object.values(value).flatMap(templatesOf) : [];

describe("French colons in the catalogue", () => {
  it("uses U+00A0 before ':' in every raw French string", () => {
    const wrong: string[] = [];
    for (const [id, entry] of Object.entries(CATALOG)) {
      for (const raw of templatesOf(entry.fr)) if (raw.replace(/'/g, "\u2019") !== frTypography(raw)) wrong.push(id);
    }
    expect(wrong).toEqual([]);
  });
  it("keeps the no-break space in the two place-feature lines", () => {
    expect(templatesOf(CATALOG["place.unknownFor"].fr)[0]).toContain(`${NBSP}:`);
    expect(templatesOf(CATALOG["place.matchedFor"].fr)[0]).toContain(`${NBSP}:`);
  });
  it("has no plain or narrow space before ':' in a French literal in states sources", () => {
    const dir = new URL(".", import.meta.url);
    const bad: string[] = [];
    for (const name of readdirSync(dir).filter((n) => /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n))) {
      for (const [i, line] of readFileSync(new URL(name, dir), "utf8").split("\n").entries()) {
        for (const m of line.matchAll(/\bfr:\s*"((?:[^"\\]|\\.)*)"/g)) {
          if (/[ \u202f]:(?!\/\/)/.test(m[1] ?? "")) bad.push(`${name}:${i + 1}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
