import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page } from "@playwright/test";

/** Discovery is based only on files in current main, not on stacked branches. */
const SOURCE = resolve(import.meta.dirname, "../../src");

function read(relative: string): string {
  const path = resolve(SOURCE, relative);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function literalRouteNames(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(/path:\s*"([^"]+)"/g)) {
    const value = match[1];
    if (!value || value === "*" || value.includes(":") || value.includes("*")) continue;
    names.push(value);
  }
  return names;
}

/** Discover literal top-level and optional children, without guessing IDs. */
export function round10Routes(): string[] {
  const found = new Set<string>(["/"]);
  for (const path of literalRouteNames(read("router.tsx"))) {
    found.add(`/${path.replace(/^\/+/, "")}`);
  }
  for (const path of literalRouteNames(read("features/routes.tsx"))) {
    found.add(`/settings/${path.replace(/^\/+/, "")}`);
  }
  const entries = /const entries\s*=\s*\[([^\]]*)\]/.exec(read("features/routes.tsx"))?.[1] ?? "";
  for (const match of entries.matchAll(/"([a-z0-9-]+)"/g)) {
    if (match[1]) found.add(`/settings/${match[1]}`);
  }
  for (const path of literalRouteNames(read("hub/routes.tsx"))) {
    found.add(`/more/${path.replace(/^\/+/, "")}`);
  }
  const override = process.env.A11Y_ROUTES?.trim();
  const selected = override ? override.split(",").map((part) => part.trim()) : [...found];
  const valid = selected.filter(Boolean);
  if (valid.length === 0) throw new Error("A11Y_ROUTES has no paths");
  for (const path of valid) {
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("?") ||
        path.includes("#") || path.includes("\\")) {
      throw new Error(`Invalid application route: ${path}`);
    }
  }
  return [...new Set(valid)];
}

/** Visit a real route, then wait for its page heading and stable shell. */
export async function openRound10Route(page: Page, path: string): Promise<void> {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response, `No response for ${path}`).not.toBeNull();
  expect(response?.ok(), `HTTP error for ${path}`).toBe(true);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.locator("main [role='status']").filter({ hasText: /^(Loading|Chargement)/ }))
    .toHaveCount(0);
}
