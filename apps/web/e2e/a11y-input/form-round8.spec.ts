import { expect, test, type Page } from "@playwright/test";

import {
  assertOptInFormErrors,
  auditFormRoute,
  inspectFormActions,
  inspectFormGroups,
  inspectFormNames,
} from "./form-path-round8";

async function fixture(page: Page, markup: string): Promise<void> {
  await page.setContent(`<!doctype html><html lang="en"><head><style>
    input,button,select,textarea {min-height:44px;min-width:44px}
    :focus-visible {outline:3px solid black}
  </style></head><body><main>${markup}</main></body></html>`);
}

const validForm = `<form id="profile">
  <label for="name">Name</label><input id="name" name="name" />
  <label for="kind">Kind</label><select id="kind"><option>One</option></select>
  <label for="details">Details</label><textarea id="details"></textarea>
  <fieldset><legend>Contact method</legend>
    <label><input type="radio" name="contact" value="email">Email</label>
    <label><input type="radio" name="contact" value="phone">Phone</label>
  </fieldset>
  <button type="submit">Save</button>
</form>`;

test.describe("P16 round eight form semantics", () => {
  test("a labelled form passes static audits", async ({ page }) => {
    await fixture(page, validForm);
    expect(await auditFormRoute(page)).toEqual([]);
  });

  test("native radio inputs count as options inside an ARIA radiogroup", async ({ page }) => {
    await fixture(page, `<fieldset role="radiogroup" aria-label="Choices"><legend>Choices</legend>
      <label><input type="radio" name="choice" checked>First</label>
      <label><input type="radio" name="choice">Second</label>
    </fieldset>`);
    expect(await inspectFormGroups(page)).toEqual([]);
  });

  test("a synthetic radio wrapping a native input counts as one option", async ({ page }) => {
    await fixture(page, `<div role="radiogroup" aria-label="Choices">
      <label role="radio" aria-checked="true" tabindex="0">
        <input type="radio" name="choice" checked>First
      </label>
    </div>`);
    expect(await inspectFormGroups(page)).toEqual([]);
  });

  test("native checked radio count remains exclusive", async ({ page }) => {
    await fixture(page, `<div role="radiogroup" aria-label="Choices">
      <label><input id="one" type="radio" name="one" checked>First</label>
      <label><input id="two" type="radio" name="two" checked>Second</label>
    </div>`);
    expect((await inspectFormGroups(page)).map((item) => item.code))
      .toContain("radiogroup-multi-selected");
  });

  test("truly empty radiogroups remain a blocking finding", async ({ page }) => {
    await fixture(page, `<div role="radiogroup" aria-label="Choices"></div>`);
    expect((await inspectFormGroups(page)).map((item) => item.code))
      .toContain("radiogroup-empty");
  });

  test("an unlabelled text input is reported", async ({ page }) => {
    await fixture(page, `<input id="unnamed">`);
    expect((await inspectFormNames(page)).map((item) => item.code)).toContain("field-name");
  });

  test("textarea requires an accessible name", async ({ page }) => {
    await fixture(page, `<textarea id="note"></textarea>`);
    expect((await inspectFormNames(page)).map((item) => item.code)).toContain("field-name");
  });

  test("select requires an accessible name", async ({ page }) => {
    await fixture(page, `<select id="choice"><option>One</option></select>`);
    expect((await inspectFormNames(page)).map((item) => item.code)).toContain("field-name");
  });

  test("aria-label satisfies field name requirement", async ({ page }) => {
    await fixture(page, `<input id="named" aria-label="Name">`);
    expect(await inspectFormNames(page)).toEqual([]);
  });

  test("aria-labelledby satisfies field name requirement", async ({ page }) => {
    await fixture(page, `<label id="for-name">Name</label>
      <input aria-labelledby="for-name">`);
    expect(await inspectFormNames(page)).toEqual([]);
  });

  test("aria-labelledby absent target is reported", async ({ page }) => {
    await fixture(page, `<input aria-labelledby="missing">`);
    expect((await inspectFormNames(page)).map((item) => item.code))
      .toContain("field-label-reference");
  });

  test("aria-describedby absent target is reported", async ({ page }) => {
    await fixture(page, `<input aria-label="Field" aria-describedby="missing">`);
    expect((await inspectFormNames(page)).map((item) => item.code))
      .toContain("field-description-reference");
  });

  test("aria-errormessage absent target is reported", async ({ page }) => {
    await fixture(page, `<input aria-label="Field" aria-invalid="true"
      aria-errormessage="missing">`);
    expect((await inspectFormNames(page)).map((item) => item.code))
      .toContain("field-error-reference");
  });

  test("invalid aria-invalid token is reported", async ({ page }) => {
    await fixture(page, `<input aria-label="Field" aria-invalid="sometimes">`);
    expect((await inspectFormNames(page)).map((item) => item.code))
      .toContain("field-invalid-state");
  });

  test("invalid aria-required token is reported", async ({ page }) => {
    await fixture(page, `<input aria-label="Field" aria-required="maybe">`);
    expect((await inspectFormNames(page)).map((item) => item.code))
      .toContain("field-required-state");
  });

  test("synthetic checkbox requires checked state", async ({ page }) => {
    await fixture(page, `<span role="checkbox" aria-label="Agree" tabindex="0">Agree</span>`);
    expect((await inspectFormNames(page)).map((item) => item.code))
      .toContain("field-checked-state-missing");
  });

  test("synthetic switch with invalid checked state is reported", async ({ page }) => {
    await fixture(page, `<span role="switch" aria-label="Enable" aria-checked="yes">On</span>`);
    expect((await inspectFormNames(page)).map((item) => item.code))
      .toContain("field-checked-state-invalid");
  });

  test("synthetic radio cannot be mixed", async ({ page }) => {
    await fixture(page, `<span role="radio" aria-label="Option" aria-checked="mixed">A</span>`);
    expect((await inspectFormNames(page)).map((item) => item.code))
      .toContain("radio-indeterminate");
  });

  test("fieldset needs a legend", async ({ page }) => {
    await fixture(page, `<fieldset><input aria-label="Option"></fieldset>`);
    expect((await inspectFormGroups(page)).map((item) => item.code))
      .toContain("fieldset-legend");
  });

  test("radiogroup needs a name", async ({ page }) => {
    await fixture(page, `<div role="radiogroup">
      <span role="radio" aria-checked="false">Option</span></div>`);
    expect((await inspectFormGroups(page)).map((item) => item.code))
      .toContain("form-group-name");
  });

  test("radiogroup must contain options", async ({ page }) => {
    await fixture(page, `<div role="radiogroup" aria-label="Choices"></div>`);
    expect((await inspectFormGroups(page)).map((item) => item.code))
      .toContain("radiogroup-empty");
  });

  test("radiogroup cannot have two checked options", async ({ page }) => {
    await fixture(page, `<div role="radiogroup" aria-label="Choices">
      <span role="radio" aria-checked="true">A</span>
      <span role="radio" aria-checked="true">B</span></div>`);
    expect((await inspectFormGroups(page)).map((item) => item.code))
      .toContain("radiogroup-multi-selected");
  });

  test("radiogroup cannot have two sequential tab stops", async ({ page }) => {
    await fixture(page, `<div role="radiogroup" aria-label="Choices">
      <span role="radio" tabindex="0">A</span>
      <span role="radio" tabindex="0">B</span></div>`);
    expect((await inspectFormGroups(page)).map((item) => item.code))
      .toContain("radiogroup-multi-tabstop");
  });

  test("a listbox without options is reported", async ({ page }) => {
    await fixture(page, `<div role="listbox" aria-label="Options">No options</div>`);
    expect((await inspectFormGroups(page)).map((item) => item.code))
      .toContain("listbox-empty");
  });

  test("single-selection listbox cannot select multiple items", async ({ page }) => {
    await fixture(page, `<div role="listbox" aria-label="Options">
      <div role="option" aria-selected="true">A</div>
      <div role="option" aria-selected="true">B</div></div>`);
    expect((await inspectFormGroups(page)).map((item) => item.code))
      .toContain("listbox-too-many-selections");
  });

  test("multiselect listbox permits multiple selections", async ({ page }) => {
    await fixture(page, `<div role="listbox" aria-label="Options" aria-multiselectable="true">
      <div role="option" aria-selected="true">A</div>
      <div role="option" aria-selected="true">B</div></div>`);
    expect(await inspectFormGroups(page)).toEqual([]);
  });

  test("multiple forms need distinct accessible purposes", async ({ page }) => {
    await fixture(page, `<form><button type="submit">Go</button></form>
      <form><button type="submit">Go</button></form>`);
    expect((await inspectFormActions(page)).map((item) => item.code))
      .toContain("multi-form-unnamed");
  });

  test("unnamed submit action is reported", async ({ page }) => {
    await fixture(page, `<form><button type="submit"></button></form>`);
    expect((await inspectFormActions(page)).map((item) => item.code))
      .toContain("submit-name");
  });

  test("opt-in invalid form exposes a referenced error without moving focus", async ({ page }) => {
    await fixture(page, `<label for="field">Field</label>
      <input id="field" aria-describedby="hint">
      <p id="hint" hidden>Please correct your entry.</p>
      <button id="check" data-a11y-form-error-trigger="field">Check</button>`);
    await page.locator("#check").evaluate((button) => button.addEventListener("click", () => {
      const input = document.querySelector("#field");
      input?.setAttribute("aria-invalid", "true");
      const hint = document.querySelector("#hint");
      hint?.removeAttribute("hidden");
    }));
    await assertOptInFormErrors(page);
  });
});
