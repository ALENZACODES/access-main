import { expect, test } from "@playwright/test";
import { formatUnexplained } from "../src/narrow/allowlist.ts";
import { auditRoutes } from "../src/narrow/page.ts";
import { ROUTES } from "./shell-routes.ts";

test("audits every shell route at 320px in English and French", async ({ page, baseURL }) => {
  expect(baseURL).toBeTruthy();
  const leftovers: string[] = [];
  for (const language of ["en", "fr"] as const) {
    await page.goto("/");
    await page.getByRole("button", { name: language === "fr" ? "Français" : "English" }).click();
    const reports = await auditRoutes(page, baseURL!, ROUTES);
    expect(reports.length).toBe(ROUTES.length);
    for (const report of reports) {
      expect(report.viewportWidth).toBe(320);
      expect(report.route).toBeTruthy();
    }
    leftovers.push(...formatUnexplained(reports, language).map((line) => `${language} ${line}`));
  }
  expect(leftovers, leftovers.join("\n")).toEqual([]);
});
