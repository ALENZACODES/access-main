import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The /dev/narrow audit page stays out of the first install: the router
 * loads it lazily, so it is a chunk of its own named after the page, and the
 * service worker does not precache that chunk. The install guard itself is
 * not changed; it measures every precached file.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "../..");
const read = (rel: string): string => readFileSync(path.join(web, rel), "utf8");

/** The globIgnores list of the Workbox options, as written in vite.config.ts. */
function globIgnores(config: string): string[] {
  const list = /globIgnores:\s*\[([^\]]*)\]/.exec(config)?.[1] ?? "";
  return [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? "");
}

describe("the /dev/narrow page and the first install", () => {
  it("is loaded lazily by the router, so it has a chunk of its own named after the page", () => {
    const router = read("src/router.tsx");
    expect(router).toMatch(
      /const NarrowAuditPage = lazy\(\(\) => import\("\.\/pages\/NarrowAuditPage\.tsx"\)/,
    );
    expect(router).toMatch(
      /path: "dev\/narrow", element: <Section><NarrowAuditPage \/><\/Section>/,
    );
    expect(router).not.toMatch(/^import \{ NarrowAuditPage \}/m);
  });

  it("is kept out of the precache, next to the other files fetched on demand", () => {
    const ignores = globIgnores(read("vite.config.ts"));
    expect(ignores).toContain("**/NarrowAuditPage-*.js");
    expect(ignores).toEqual(
      expect.arrayContaining(["data/**", "**/*.pmtiles", "**/maplibre-*.js"]),
    );
  });

  it("leaves the install guard measuring every precached file, with the same cap", () => {
    const guard = read("scripts/check-install-budget.ts");
    expect(guard).not.toMatch(/NarrowAuditPage/);
    expect(read("src/perf/install-budget.ts")).toContain(
      "export const INSTALL_BUDGET_BYTES = 4_718_592;",
    );
  });
});
