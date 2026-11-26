import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { recoveryGuidedCopy } from "../src/recovery/recoveryGuidedCopy";
import { emptyGuidedDocument } from "../src/recovery/recoveryGuidedReview";

test.use({ serviceWorkers: "block", viewport: { width: 320, height: 720 } });

for (const locale of ["en", "fr"] as const) {
  test(`guided review recovers from a malformed local file and exports JSON (${locale})`, async ({ page }) => {
    const copy = recoveryGuidedCopy(locale);
    const requests: string[] = [];
    page.on("request", (request) => {
      if (/\/assets\/RecoveryGuidedReviewPanel-[^/]+\.js$/.test(request.url())) requests.push(request.url());
    });
    await page.goto("/offline");
    if (locale === "fr") await page.getByRole("button", { name: "Français", exact: true }).click();
    const review = page.getByRole("region", { name: copy.heading, exact: true });
    const disclosure = page.locator("details").filter({ has: page.locator("summary", { hasText: copy.heading }) });
    const summary = disclosure.locator("summary");
    await expect(summary).toBeVisible();
    await expect(review).toHaveCount(0);
    expect(requests).toHaveLength(0);
    await summary.focus();
    await summary.press("Enter");
    await expect(review).toHaveAttribute("lang", locale);
    expect(requests).toHaveLength(1);
    const search = review.getByRole("textbox", { name: copy.search, exact: true });
    await search.fill("local pack");
    const input = review.getByLabel(copy.open, { exact: true });
    await input.setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{") });
    await expect(review.getByRole("status")).toHaveText(copy.issues.format);

    const save = review.getByRole("button", { name: copy.save, exact: true });
    await save.focus();
    await expect(save).toBeFocused();
    const pending = page.waitForEvent("download");
    await save.press("Enter");
    const download = await pending;
    expect(download.suggestedFilename()).toBe("recovery-guided-review.json");
    const path = await download.path();
    if (!path) throw new Error("Missing local download");
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(emptyGuidedDocument());
    await expect(review.getByRole("status")).toHaveText(copy.saved);

    const box = await save.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    const id = await review.getAttribute("aria-labelledby");
    if (!id) throw new Error("Missing review heading");
    const results = await new AxeBuilder({ page }).include(`section[aria-labelledby="${id}"]`)
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations).toEqual([]);
    await summary.press("Space");
    await expect(search).toBeHidden();
    await summary.press("Enter");
    await expect(search).toHaveValue("local pack");
    await expect(summary).toBeFocused();
    expect(requests).toHaveLength(1);
  });
}
