import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { beginBrief, emptyBriefDocument } from "../src/recovery/recoverySupportBrief";
import { recoverySupportCopy } from "../src/recovery/recoverySupportCopy";

for (const locale of ["en", "fr"] as const) {
  test(`a support brief retains its source through keyboard import and export (${locale})`, async ({ page }) => {
    const copy = recoverySupportCopy(locale);
    const entry = beginBrief(emptyBriefDocument(), {
      id: "brief-1", packId: "example-pack", title: "Sample brief", operation: "pack",
      condition: "UNKNOWN", openedAt: "2026-11-19T12:00:00.000Z", state: "draft",
      source: { name: "Test fixture", licence: "CC0", retrievedOn: "2026-11-19", reference: "local-sample", tier: "UNKNOWN" },
    });
    if (!entry.ok) throw new Error(entry.issue);
    await page.goto("/offline");
    if (locale === "fr") await page.getByRole("button", { name: "Français", exact: true }).click();
    const panel = page.getByRole("region", { name: copy.title, exact: true });
    const disclosure = page.locator("summary").filter({ hasText: copy.title });
    await expect(panel).toHaveCount(0);
    await disclosure.press("Enter");
    await expect(panel).toHaveAttribute("lang", locale);
    const input = panel.getByLabel(copy.open, { exact: true });
    await input.setInputFiles({ name: "brief.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(entry.value)) });
    const merge = panel.getByRole("button", { name: copy.merge });
    await merge.focus();
    await expect(merge).toBeFocused();
    await merge.press("Space");
    await expect(input).toBeFocused();
    await expect(panel.getByText("Sample brief — example-pack", { exact: true })).toBeVisible();

    await disclosure.press("Space");
    await expect(panel).toBeHidden();
    await disclosure.press("Enter");
    await expect(panel.getByText("Sample brief — example-pack", { exact: true })).toBeVisible();
    const save = panel.getByRole("button", { name: copy.save, exact: true });
    const box = await save.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
    const pending = page.waitForEvent("download");
    await save.press("Enter");
    const download = await pending;
    expect(download.suggestedFilename()).toBe("recovery-support-brief.json");
    const path = await download.path();
    if (!path) throw new Error("Missing local download");
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(entry.value);
    await expect(panel.getByRole("status")).toHaveText(copy.saved);
    const id = await panel.getAttribute("aria-labelledby");
    if (!id) throw new Error("Missing brief heading");
    const results = await new AxeBuilder({ page }).include(`section[aria-labelledby="${id}"]`)
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations).toEqual([]);
  });
}
