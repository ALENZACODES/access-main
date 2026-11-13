import { expect, test } from "@playwright/test";

async function grantConsent(page: import("@playwright/test").Page) {
  const consent = page.getByRole("checkbox", { name: "Store these preferences on this device only" });
  await consent.focus();
  await page.keyboard.press("Space");
  await expect(consent).toBeChecked();
}

test("onboarding saves a profile only after consent", async ({ page }) => {
  await page.goto("/onboarding");
  for (let step = 0; step < 4; step += 1) {
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await expect(page.getByText("Not set").first()).toBeVisible();
  await page.getByRole("button", { name: "Save on this device" }).click();
  await expect(page.getByText("Consent is required before these preferences can be stored.")).toBeVisible();
  await grantConsent(page);
  await page.getByRole("button", { name: "Save on this device" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "the App" })).toBeFocused();
  await expect(page.getByText("Preferences are stored on this device.")).toBeVisible();

  await page.goto("/profile");
  await expect(page.getByLabel("Maximum time between washrooms, in minutes")).toHaveCount(0);
  await expect(page.getByText("Personal reminder switch")).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Store these preferences on this device only" })).toBeChecked();
});

test("invalid width is refused and higher contrast persists", async ({ page }) => {
  await page.goto("/profile");
  await page.getByLabel("Chair width in millimetres").fill("0");
  await page.getByRole("button", { name: "Save on this device" }).click();
  await expect(page.getByText("Check the fields below. Nothing was saved.")).toBeVisible();
  await expect(page.getByText("Nothing was uploaded.")).toHaveCount(0);

  const width = page.getByLabel("Chair width in millimetres");
  await width.fill("");
  await expect(width).toHaveValue("");
  await grantConsent(page);
  const manual = page.getByRole("radio", { name: "Manual wheelchair" });
  await manual.focus();
  await page.keyboard.press("Space");
  await expect(manual).toBeChecked();
  const contrast = page.getByRole("radiogroup", { name: "Higher contrast" }).getByRole("radio", { name: "On" });
  await contrast.focus();
  await page.keyboard.press("Space");
  await expect(contrast).toBeChecked();
  await page.getByRole("button", { name: "Save on this device" }).click();
  await expect(page.getByText("Saved on this device. Nothing was uploaded.")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-contrast", "more");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-contrast", "more");
  await expect(page.getByRole("radiogroup", { name: "Equipment" }).getByRole("radio", { name: "Manual wheelchair" })).toBeChecked();

  await page.goto("/data-status");
  await expect(page.getByText("Last upload: none.")).toBeVisible();
  await expect(page.getByText("0 records stored on this device")).toBeVisible();
  await expect(page.getByText("Live elevator and disruption status is unavailable")).toBeVisible();
});

test("withdraw clears preferences and delete moves focus to the status", async ({ page }) => {
  await page.goto("/profile");
  await grantConsent(page);
  await page.getByRole("button", { name: "Save on this device" }).click();
  await expect(page.getByText("Saved on this device. Nothing was uploaded.")).toBeVisible();
  await page.getByRole("button", { name: "Withdraw consent" }).click();
  const withdrawn = page.getByText("Consent was withdrawn. Entered preferences were cleared on this device.");
  await expect(withdrawn).toBeVisible();
  await expect(withdrawn).toBeFocused();
  await expect(page.getByRole("checkbox", { name: "Store these preferences on this device only" })).not.toBeChecked();

  await grantConsent(page);
  await page.getByRole("button", { name: "Save on this device" }).click();
  await page.getByRole("button", { name: "Delete preferences" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Store these preferences on this device only" })).toBeChecked();

  await page.getByRole("button", { name: "Delete preferences" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete preferences" }).click();
  const deleted = page.getByText("Preferences were deleted from this device.");
  await expect(deleted).toBeVisible();
  await expect(deleted).toBeFocused();
  await page.goto("/data-status");
  await expect(page.getByText("No preferences record is stored.")).toBeVisible();
});
