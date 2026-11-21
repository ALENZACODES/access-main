import { expect, test } from "@playwright/test";
import { inspectFormFeedback } from "./form-feedback-round14";

async function setForm(page: import("@playwright/test").Page, markup: string): Promise<void> {
  await page.setContent(`<!doctype html><html lang="en"><head><title>Validation state</title></head><body><main><h1>Validation state</h1>${markup}</main></body></html>`);
}
test.describe("P16 round 14 form state transitions", () => {
  test("empty required form becomes invalid after submit", async ({ page }) => {
    await setForm(page, `<form><label for="name">Name</label><input id="name" required><button type="submit">Continue</button></form>`);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator("#name")).toBeFocused();
    expect(await page.locator("#name").evaluate((node) => (node as HTMLInputElement).validity.valid)).toBe(false);
  });
  test("valid required field is not marked invalid", async ({ page }) => {
    await setForm(page, `<form><label for="name">Name</label><input id="name" required value="Alex"><button type="submit">Continue</button></form>`);
    expect((await inspectFormFeedback(page)).issues).toEqual([]);
    expect(await page.locator("#name").evaluate((node) => (node as HTMLInputElement).validity.valid)).toBe(true);
  });
  test("required custom textbox exposes required state", async ({ page }) => {
    await setForm(page, `<div role="textbox" aria-label="Name" aria-required="true" contenteditable="true"></div>`);
    expect((await inspectFormFeedback(page)).fields[0]?.required).toBe(true);
  });
  test("checkbox required state is inspectable", async ({ page }) => {
    await setForm(page, `<label><input id="agree" type="checkbox" required>I agree</label>`);
    expect((await inspectFormFeedback(page)).fields[0]?.required).toBe(true);
  });
  test("select without label is rejected", async ({ page }) => {
    await setForm(page, `<select><option>One</option></select>`);
    expect((await inspectFormFeedback(page)).issues.map(x => x.code)).toContain("field-name-empty");
  });
  test("select with label is accepted", async ({ page }) => {
    await setForm(page, `<label for="mode">Mode</label><select id="mode"><option>One</option></select>`);
    expect((await inspectFormFeedback(page)).issues).toEqual([]);
  });
  test("multiple described-by IDs are all resolved", async ({ page }) => {
    await setForm(page, `<label for="name">Name</label><input id="name" aria-describedby="hint error"><p id="hint">Required</p><p id="error">Enter a value</p>`);
    expect((await inspectFormFeedback(page)).issues).toEqual([]);
  });
  test("one missing ID among several descriptions is rejected", async ({ page }) => {
    await setForm(page, `<label for="name">Name</label><input id="name" aria-describedby="hint absent"><p id="hint">Required</p>`);
    expect((await inspectFormFeedback(page)).issues.map(x => x.code)).toContain("field-description-missing");
  });
  test("native readonly input is not treated as disabled", async ({ page }) => {
    await setForm(page, `<label for="name">Name</label><input id="name" readonly value="Read only">`);
    const field = (await inspectFormFeedback(page)).fields[0];
    expect(field?.readOnly).toBe(true);
    expect(field?.disabled).toBe(false);
  });
  test("disabled input is recorded as disabled", async ({ page }) => {
    await setForm(page, `<label for="name">Name</label><input id="name" disabled>`);
    expect((await inspectFormFeedback(page)).fields[0]?.disabled).toBe(true);
  });
});
