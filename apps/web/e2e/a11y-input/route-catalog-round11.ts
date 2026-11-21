import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../src");

function read(relative: string): string {
  const filename = resolve(root, relative);
  return existsSync(filename) ? readFileSync(filename, "utf8") : "";
}

function directPaths(source: string): string[] {
  return [...source.matchAll(/\bpath\s*:\s*["']([^"']+)["']/g)]
    .map((match) => match[1] ?? "")
    .filter((path) => Boolean(path) && !path.includes(":") && !path.includes("*"));
}

/** Discovery reads current-main source rather than guessing unpublished routes. */
export function discoverRound11Routes(): string[] {
  const set = new Set<string>(["/"]);
  for (const path of directPaths(read("router.tsx"))) {
    if (path === "/") continue;
    set.add(`/${path.replace(/^\//, "").replace(/\/$/, "")}`);
  }
  const features = read("features/routes.tsx");
  const table = /const entries\s*=\s*\[([^\]]*)\]/.exec(features)?.[1] ?? "";
  for (const entry of table.matchAll(/["']([a-z][a-z0-9-]+)["']/g)) {
    if (entry[1]) set.add(`/settings/${entry[1]}`);
  }
  for (const child of directPaths(features)) set.add(`/settings/${child.replace(/^\//, "")}`);
  for (const child of directPaths(read("hub/routes.tsx"))) set.add(`/more/${child.replace(/^\//, "")}`);
  return [...set].filter((path) => !path.includes("*") && !path.includes(":"));
}

/** Use override only to narrow a local run; CI leaves it unset. */
export function round11Routes(): string[] {
  const override = process.env.A11Y_ROUTES?.trim();
  if (!override) return discoverRound11Routes();
  const paths = override.split(",").map((value) => value.trim()).filter(Boolean);
  if (paths.length === 0) throw new Error("A11Y_ROUTES cannot be empty");
  for (const path of paths) {
    if (!/^\/(?!\/)[a-zA-Z0-9/_-]*$/.test(path)) throw new Error(`Invalid local route ${path}`);
  }
  return [...new Set(paths)];
}

export type Round11Locale = "en" | "fr";
export const ROUND11_LOCALES: readonly Round11Locale[] = ["en", "fr"];

export function findingsByCode<T extends { code: string }>(findings: readonly T[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of findings) counts[item.code] = (counts[item.code] ?? 0) + 1;
  return counts;
}

export function formatRound11Findings<T extends { code: string; path?: string; target?: string; detail: string }>(findings: readonly T[]): string {
  return findings.map((finding) => `${finding.code} ${finding.path ?? finding.target ?? ""} ${finding.detail}`.trim()).join("\n");
}

export function routeTag(route: string): string {
  return route === "/" ? "root" : route.replace(/^\//, "").replace(/\//g, "--");
}
