import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page } from "@playwright/test";

const SRC = resolve(import.meta.dirname, "../../src");

export type Language = "en" | "fr";
export const LANGUAGES: readonly Language[] = ["en", "fr"];
/** Phone (320 CSS px, WCAG 1.4.10 reflow width) and desktop (1280). */
export const VIEWPORTS = [
  { name: "320", width: 320, height: 720 },
  { name: "1280", width: 1280, height: 900 },
] as const;

function read(file: string): string {
  const path = resolve(SRC, file);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

/** Child paths of a route table, from `path: "name"` entries. Parameter and splat paths are skipped. */
function tablePaths(source: string): string[] {
  return [...source.matchAll(/path:\s*"([^"]+)"/g)]
    .map((match) => match[1])
    .filter((path) => !path.includes(":") && !path.includes("*"));
}

/**
 * Every route the live app serves, read from the router and from the route
 * tables it mounts. A new top-level route, a new Settings page, or a new
 * More (J lane) page is checked without editing this file.
 */
export function appRoutes(): string[] {
  const found = new Set<string>(["/"]);
  const router = read("router.tsx");
  for (const match of router.matchAll(/path:\s*"([^"]+)"/g)) {
    const path = match[1];
    if (path === "/" || path === "*" || path.includes(":")) continue;
    found.add(`/${path.replace(/^\//, "").replace(/\/\*$/, "")}`);
  }
  const features = read("features/routes.tsx");
  const entries = /const entries = \[([^\]]*)\]/.exec(features)?.[1] ?? "";
  for (const match of entries.matchAll(/"([a-z0-9-]+)"/g)) found.add(`/settings/${match[1]}`);
  for (const path of tablePaths(features)) found.add(`/settings/${path}`);
  for (const path of tablePaths(read("hub/routes.tsx"))) found.add(`/more/${path}`);
  return [...found];
}

/** `A11Y_ROUTES` narrows the run for local debugging. By default, and in CI, every route is checked. */
export function routes(): string[] {
  const override = process.env.A11Y_ROUTES?.trim();
  const configured = override
    ? override.split(",").map((value) => value.trim()).filter((value) => value.length > 0)
    : appRoutes();

  if (configured.length === 0) {
    throw new Error("A11Y_ROUTES must contain at least one path");
  }

  for (const route of configured) {
    if (
      !route.startsWith("/") ||
      route.startsWith("//") ||
      route.includes("\\") ||
      route.includes("#") ||
      route.includes("?")
    ) {
      throw new Error(`Invalid application path: ${route}`);
    }
  }

  return [...new Set(configured)];
}

/** Switches the shell language the way a person does: the language button in the header. */
export async function chooseLanguage(page: Page, language: Language): Promise<void> {
  if (language === "en") return;
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Français" }).first().click();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
}

export async function visit(page: Page, route: string, language: Language): Promise<void> {
  const response = await page.goto(route, { waitUntil: "domcontentloaded" });
  expect(response, `Missing HTTP response for ${route}`).not.toBeNull();
  expect(response?.ok(), `Route ${route} did not load`).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("lang", language);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.locator("main [role='status']").filter({ hasText: /^(Loading|Chargement)/ })).toHaveCount(0);
}

export const sequentialSelector = [
  "a[href]",
  "button",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "summary",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");
