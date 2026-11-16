import { expect, type Page } from "@playwright/test";

export function routes(): string[] {
  const configured = (process.env.A11Y_ROUTES ?? "/")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

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

export async function visit(
  page: Page,
  route: string,
  configuredBaseURL: string | undefined,
): Promise<void> {
  const baseURL =
    process.env.A11Y_BASE_URL ?? configuredBaseURL ?? "http://127.0.0.1:3000";
  const base = new URL(baseURL);

  if (base.protocol !== "http:" && base.protocol !== "https:") {
    throw new Error("Accessibility test base URL must use HTTP or HTTPS");
  }

  const response = await page.goto(new URL(route, base).toString(), {
    waitUntil: "domcontentloaded",
  });

  expect(response, `Missing HTTP response for ${route}`).not.toBeNull();
  expect(response?.ok(), `Route ${route} did not load`).toBe(true);
  await expect(page.locator("body")).toBeVisible();
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
