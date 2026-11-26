import { expect, test } from "@playwright/test";
import { auditRoleNames } from "./semantic-round4";

test.describe("Accessible role names during route updates", () => {
  test("file pickers require a label beyond the browser's default button name", async ({ page }) => {
    await page.setContent(`
      <label for="labelled">Read the bundle</label><input type="file" id="labelled">
      <input type="file" id="unlabelled">
      <button aria-label="Open details"></button>
      <button></button>
      <button style="width:0;height:0;padding:0;border:0"></button>`);
    expect(await auditRoleNames(page)).toEqual([
      { code: "unlabelled-role", element: "button[1]", detail: "No name source" },
      { code: "unlabelled-role", element: "button[3]", detail: "No name source" },
    ]);
  });

  test("a prompt inserted during the audit cannot change which file picker is checked", async ({ page }) => {
    await page.setContent(`
      <button>Clear local tasks</button>
      <label for="file">Choose a local JSON file</label><input type="file" id="file">`);
    await page.locator("#file").evaluate(input => {
      // Reproduce the offline-ready prompt arriving between name-source reads.
      // The first read of the file input's empty text schedules the same
      // ordinal change observed on /offline, without a timing-dependent delay.
      Object.defineProperty(input, "innerText", { get() {
        queueMicrotask(() => {
          if (!document.getElementById("later")) {
            const prompt = document.createElement("button");
            prompt.id = "later";
            prompt.textContent = "Not now";
            document.body.prepend(prompt);
          }
        });
        return "";
      } });
    });
    expect(await auditRoleNames(page)).toEqual([]);
    await expect(page.getByRole("button", { name: "Not now" })).toBeVisible();
    await expect(page.getByRole("button").nth(1)).toHaveText("Clear local tasks");
  });
});
