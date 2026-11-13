import { expect, test } from "@playwright/test";

test("onboarding saves a profile without a timing default", async ({ page }) => {
  await page.goto("/onboarding");
  for (let step = 0; step < 5; step += 1) {
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await expect(page.getByText("Not set").first()).toBeVisible();
  await page.getByRole("button", { name: "Save on this device" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "the App" })).toBeVisible();
  await expect(page.getByText("Preferences are stored on this device.")).toBeVisible();

  await page.goto("/profile");
  await expect(page.getByLabel("Maximum time between washrooms, in minutes")).toHaveValue("");
  await expect(page.getByLabel("Maximum continuous travel, in minutes")).toHaveValue("");
  await expect(page.getByText("does not suggest a clinical interval")).toBeVisible();
});

test("invalid timing is refused and higher contrast persists", async ({ page }) => {
  await page.goto("/profile");
  await page.getByLabel("Maximum time between washrooms, in minutes").fill("0");
  await page.getByRole("button", { name: "Save on this device" }).click();
  await expect(page.getByText("Check the fields below. Nothing was saved.")).toBeVisible();
  await expect(page.getByText("Nothing was uploaded.")).toHaveCount(0);

  const washroom = page.getByLabel("Maximum time between washrooms, in minutes");
  await washroom.fill("");
  await expect(washroom).toHaveValue("");
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
  await expect(page.getByLabel("Maximum time between washrooms, in minutes")).toHaveValue("");

  await page.goto("/data-status");
  await expect(page.getByText("Last upload: none.")).toBeVisible();
  await expect(page.getByText("0 records stored on this device")).toBeVisible();
  await expect(page.getByText("Live elevator and disruption status is unavailable")).toBeVisible();
});

test("delete asks first and escape keeps the preferences", async ({ page }) => {
  await page.goto("/profile");
  await page.getByRole("button", { name: "Save on this device" }).click();
  await expect(page.getByText("Saved on this device. Nothing was uploaded.")).toBeVisible();
  await page.getByRole("button", { name: "Delete preferences" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("A preferences record is on this device.").or(page.getByRole("button", { name: "Delete preferences" }))).toBeVisible();

  await page.getByRole("button", { name: "Delete preferences" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete preferences" }).click();
  await expect(page.getByText("Preferences were deleted from this device.")).toBeVisible();
  await page.goto("/data-status");
  await expect(page.getByText("No preferences record is stored.")).toBeVisible();
});
