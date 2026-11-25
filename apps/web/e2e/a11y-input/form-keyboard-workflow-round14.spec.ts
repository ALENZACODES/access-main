import { expect, test } from "@playwright/test";
import { inspectFormFeedback } from "./form-feedback-round14";
import { inspectSemanticSurface } from "./semantic-surface-round14";

async function formPage(page: import("@playwright/test").Page, markup: string): Promise<void> {
  await page.setContent(`<!doctype html><html lang="en"><head><title>Form keyboard workflow</title><style>
  input,button,select,textarea{min-width:44px;min-height:44px}:focus-visible{outline:3px solid #123}
  </style></head><body><main><h1>Form keyboard workflow</h1>${markup}</main></body></html>`);
}
test.describe("P16 round 14 keyboard form workflow", () => {
  test("Tab order follows label, input, submit sequence", async ({ page }) => {
    await formPage(page, `<form><label for="name">Name</label><input id="name"><button id="submit">Continue</button></form>`);
    await page.keyboard.press("Tab");
    await expect(page.locator("#name")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator("#submit")).toBeFocused();
  });
  test("Shift Tab returns from submit to input", async ({ page }) => {
    await formPage(page, `<form><label for="name">Name</label><input id="name"><button id="submit">Continue</button></form>`);
    await page.locator("#submit").focus();
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("#name")).toBeFocused();
  });
  test("invalid email field retains focus after native validation", async ({ page }) => {
    await formPage(page, `<form><label for="email">Email</label><input id="email" type="email" required><button>Continue</button></form>`);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator("#email")).toBeFocused();
    expect((await inspectFormFeedback(page)).issues).toEqual([]);
  });
  test("custom error summary link moves focus to its field", async ({ page }) => {
    await formPage(page, `<div id="errors"><p>There is a problem</p><a href="#email">Enter an email</a></div><label for="email">Email</label><input id="email">`);
    await page.locator("#errors a").focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#email$/);
    await page.locator("#email").focus();
    await expect(page.locator("#email")).toBeFocused();
  });
  test("aria-describedby help remains connected after field edit", async ({ page }) => {
    await formPage(page, `<label for="name">Name</label><input id="name" aria-describedby="help"><p id="help">Use your preferred name</p>`);
    await page.locator("#name").fill("Alex");
    expect((await inspectFormFeedback(page)).issues).toEqual([]);
    expect((await inspectSemanticSurface(page)).issues).toEqual([]);
  });
  test("error text update does not overwrite field label", async ({ page }) => {
    await formPage(page, `<label for="name">Name</label><input id="name" aria-invalid="true" aria-describedby="error"><p id="error" role="alert">Required</p>`);
    await page.locator("#error").evaluate(node => { node.textContent = "Enter a name"; });
    const result = await inspectFormFeedback(page);
    expect(result.fields[0]?.name).toBe("Name");
    expect(result.fields[0]?.errorText).toBe("Enter a name");
    expect(result.issues).toEqual([]);
  });
  test("fieldset legend provides grouping context", async ({ page }) => {
    await formPage(page, `<fieldset><legend>Contact preference</legend><label><input type="radio" name="contact" checked>Email</label><label><input type="radio" name="contact">Phone</label></fieldset>`);
    expect((await inspectFormFeedback(page)).issues).toEqual([]);
  });
  test("fieldset options remain keyboard selectable", async ({ page }) => {
    await formPage(page, `<fieldset><legend>Contact preference</legend><label><input type="radio" name="contact" checked>Email</label><label><input type="radio" name="contact">Phone</label></fieldset>`);
    await page.locator("input").first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("input").nth(1)).toBeChecked();
  });
  test("disabled field is not the first sequential focus target", async ({ page }) => {
    await formPage(page, `<label><input type="checkbox" disabled>Unavailable</label><label><input id="active" type="checkbox">Available</label>`);
    await page.keyboard.press("Tab");
    await expect(page.locator("#active")).toBeFocused();
  });
  test("read-only field remains reachable and selectable", async ({ page }) => {
    await formPage(page, `<label for="reference">Reference</label><input id="reference" readonly value="REF-1">`);
    await page.keyboard.press("Tab");
    await expect(page.locator("#reference")).toBeFocused();
    await expect(page.locator("#reference")).toHaveValue("REF-1");
  });
  test("required state is exposed on checkbox", async ({ page }) => {
    await formPage(page, `<label><input id="agree" type="checkbox" required>I agree</label>`);
    expect((await inspectFormFeedback(page)).fields[0]?.required).toBe(true);
  });
  test("multiple invalid fields each have their own description", async ({ page }) => {
    await formPage(page, `<label for="first">First</label><input id="first" aria-invalid="true" aria-describedby="first-error"><p id="first-error">First required</p><label for="last">Last</label><input id="last" aria-invalid="true" aria-describedby="last-error"><p id="last-error">Last required</p>`);
    const result = await inspectFormFeedback(page);
    expect(result.issues).toEqual([]);
    expect(result.fields.filter(field => field.invalid)).toHaveLength(2);
  });
  test("error references are checked after dynamic removal", async ({ page }) => {
    await formPage(page, `<label for="first">First</label><input id="first" aria-invalid="true" aria-describedby="error"><p id="error">Required</p>`);
    await page.locator("#error").evaluate(node => node.remove());
    expect((await inspectFormFeedback(page)).issues.map(x => x.code)).toContain("field-description-missing");
  });
  test("error references are checked after dynamic insertion", async ({ page }) => {
    await formPage(page, `<label for="first">First</label><input id="first" aria-invalid="true" aria-describedby="error"><p id="error">Required</p>`);
    await page.locator("#error").evaluate(node => node.textContent = "Enter a value");
    expect((await inspectFormFeedback(page)).issues).toEqual([]);
  });
  test("textarea label is available after content update", async ({ page }) => {
    await formPage(page, `<label for="notes">Notes</label><textarea id="notes"></textarea>`);
    await page.locator("#notes").fill("A note");
    expect((await inspectFormFeedback(page)).fields[0]?.name).toBe("Notes");
  });
  test("select label is available after keyboard selection", async ({ page }) => {
    await formPage(page, `<label for="choice">Choice</label><select id="choice"><option>Apple</option><option>Banana</option></select>`);
    await page.locator("#choice").focus();
    await page.keyboard.press("b");
    await expect(page.locator("#choice")).toHaveValue("Banana");
    expect((await inspectFormFeedback(page)).issues).toEqual([]);
  });
  test("form submit button remains named after validation", async ({ page }) => {
    await formPage(page, `<form><label for="name">Name</label><input id="name" required><button id="submit">Continue</button></form>`);
    await page.locator("#submit").click();
    expect((await inspectSemanticSurface(page)).controls.find(x => x.selector === "#submit")?.name).toBe("Continue");
  });
});
