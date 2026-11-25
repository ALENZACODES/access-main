import { expect, test } from "@playwright/test";
import { inspectFormFeedback } from "./form-feedback-round14";

async function fixture(page: import("@playwright/test").Page, body: string): Promise<void> {
  await page.setContent(`<!doctype html><html lang="en"><head><title>Form fixture</title></head><body><main><h1>Form fixture</h1>${body}</main></body></html>`);
}
test.describe("P16 round 14 form feedback", () => {
  test("associated label names input", async ({ page }) => {
    await fixture(page, `<label for="name">Name</label><input id="name">`);
    expect((await inspectFormFeedback(page)).issues).toEqual([]);
  });
  test("wrapped label names checkbox", async ({ page }) => {
    await fixture(page, `<label><input type="checkbox">I agree</label>`);
    expect((await inspectFormFeedback(page)).issues).toEqual([]);
  });
  test("unnamed input is rejected", async ({ page }) => {
    await fixture(page, `<input id="name">`);
    expect((await inspectFormFeedback(page)).issues.map(x => x.code)).toContain("field-name-empty");
  });
  test("invalid field with described error is accepted", async ({ page }) => {
    await fixture(page, `<label for="email">Email</label><input id="email" aria-invalid="true" aria-describedby="email-error"><p id="email-error">Enter an email address</p>`);
    expect((await inspectFormFeedback(page)).issues).toEqual([]);
  });
  test("invalid field without error description is rejected", async ({ page }) => {
    await fixture(page, `<label for="email">Email</label><input id="email" aria-invalid="true">`);
    expect((await inspectFormFeedback(page)).issues.map(x => x.code)).toContain("field-error-unannounced");
  });
  test("missing described-by target is rejected", async ({ page }) => {
    await fixture(page, `<label for="email">Email</label><input id="email" aria-describedby="missing">`);
    expect((await inspectFormFeedback(page)).issues.map(x => x.code)).toContain("field-description-missing");
  });
  test("required attribute is exposed", async ({ page }) => {
    await fixture(page, `<label for="email">Email</label><input id="email" required>`);
    expect((await inspectFormFeedback(page)).fields[0]?.required).toBe(true);
  });
  test("aria-required is exposed", async ({ page }) => {
    await fixture(page, `<label for="email">Email</label><input id="email" aria-required="true">`);
    expect((await inspectFormFeedback(page)).fields[0]?.required).toBe(true);
  });
  test("conflicting required declarations are rejected", async ({ page }) => {
    await fixture(page, `<label for="email">Email</label><input id="email" required aria-required="false">`);
    expect((await inspectFormFeedback(page)).issues.map(x => x.code)).toContain("field-required-conflict");
  });
  test("disabled field is recorded but remains named", async ({ page }) => {
    await fixture(page, `<label for="field">Field</label><input id="field" disabled>`);
    const result = await inspectFormFeedback(page);
    expect(result.issues).toEqual([]);
    expect(result.fields[0]?.disabled).toBe(true);
  });
  test("read-only field is distinguished from disabled", async ({ page }) => {
    await fixture(page, `<label for="field">Field</label><input id="field" readonly>`);
    const result = await inspectFormFeedback(page);
    expect(result.fields[0]?.readOnly).toBe(true);
    expect(result.fields[0]?.disabled).toBe(false);
  });
  test("error message referenced through aria-errormessage must exist", async ({ page }) => {
    await fixture(page, `<label for="field">Field</label><input id="field" aria-errormessage="error"><p id="error">Required</p>`);
    expect((await inspectFormFeedback(page)).issues).toEqual([]);
  });
  test("missing aria-errormessage target is rejected", async ({ page }) => {
    await fixture(page, `<label for="field">Field</label><input id="field" aria-errormessage="error">`);
    expect((await inspectFormFeedback(page)).issues.map(x => x.code)).toContain("field-errormessage-missing");
  });
});
