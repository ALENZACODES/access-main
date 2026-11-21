import { expect, test, type Page } from "@playwright/test";
import {
  auditNameRelations, containsNameIssue, summarizeNameRelations,
  type NameRelationCode,
} from "./name-relations-round10";

async function fixture(page: Page, markup: string): Promise<void> {
  await page.setContent(`<!doctype html><html lang="en"><head><title>Name relationships</title>
    <style>body{font:18px sans-serif}button,input,label{min-height:44px}</style>
    </head><body><main><h1>Name relationships</h1>${markup}</main></body></html>`);
}

async function missing(page: Page, markup: string, code: NameRelationCode): Promise<void> {
  await fixture(page, markup);
  const report = await auditNameRelations(page);
  expect(containsNameIssue(report, code), summarizeNameRelations(report)).toBe(true);
}

const missingNameCases: ReadonlyArray<{
  title: string; markup: string; code: NameRelationCode;
}> = [
  { title: "empty native button", markup: `<button id="empty"></button>`, code: "unnamed-button" },
  { title: "empty standalone link", markup: `<a id="empty" href="/help"></a>`, code: "unnamed-link" },
  { title: "text input without label", markup: `<input id="query" type="text">`, code: "unnamed-field" },
  { title: "number input without label", markup: `<input id="count" type="number">`, code: "unnamed-field" },
  { title: "email input without label", markup: `<input id="email" type="email">`, code: "unnamed-field" },
  { title: "unlabelled textarea", markup: `<textarea id="message"></textarea>`, code: "unnamed-field" },
  { title: "unlabelled select", markup: `<select id="choice"><option>A</option></select>`, code: "unnamed-field" },
  { title: "unnamed checkbox", markup: `<input id="agree" type="checkbox">`, code: "unnamed-field" },
  { title: "unnamed radio", markup: `<input id="option" type="radio">`, code: "unnamed-field" },
  { title: "unnamed custom switch", markup: `<div role="switch" tabindex="0"></div>`, code: "unnamed-custom-control" },
  { title: "unnamed custom slider", markup: `<div role="slider" tabindex="0"></div>`, code: "unnamed-custom-control" },
  { title: "unnamed custom combobox", markup: `<div role="combobox" tabindex="0"></div>`, code: "unnamed-custom-control" },
  { title: "unnamed custom textbox", markup: `<div role="textbox" tabindex="0"></div>`, code: "unnamed-custom-control" },
  { title: "blank aria-labelledby", markup: `<button aria-labelledby="  "></button>`, code: "empty-label-reference" },
  { title: "missing label target", markup: `<button aria-labelledby="missing"></button>`, code: "dangling-label-reference" },
  { title: "duplicate label target", markup: `<p id="name">A</p><p id="name">B</p><button aria-labelledby="name">Open</button>`, code: "duplicate-label-reference" },
  { title: "blank label target", markup: `<span id="name"></span><button aria-labelledby="name"></button>`, code: "invisible-label-reference" },
  { title: "empty aria label", markup: `<button aria-label="">Continue</button>`, code: "empty-aria-label" },
  { title: "empty title", markup: `<button title="">Continue</button>`, code: "empty-title-fallback" },
  { title: "label not contained in accessible name", markup: `<button aria-label="Proceed">Continue</button>`, code: "label-not-in-name" },
  { title: "duplicate control id", markup: `<button id="same">One</button><button id="same">Two</button>`, code: "duplicate-control-id" },
  { title: "field without legend", markup: `<fieldset><label><input type="checkbox">Agree</label></fieldset>`, code: "fieldset-without-legend" },
  { title: "group without label", markup: `<div role="group"><button>Open</button></div>`, code: "group-without-name" },
  { title: "radiogroup without label", markup: `<div role="radiogroup"><button role="radio">One</button></div>`, code: "group-without-name" },
  { title: "bad help reference", markup: `<button aria-describedby="missing">Open</button>`, code: "invalid-description-reference" },
  { title: "bad error reference", markup: `<label for="q">Query</label><input id="q" aria-errormessage="missing">`, code: "invalid-error-reference" },
  { title: "invalid aria-invalid state", markup: `<label for="q">Query</label><input id="q" aria-invalid="sometimes">`, code: "invalid-invalid-state" },
  { title: "invalid required state", markup: `<label for="q">Query</label><input id="q" aria-required="yes">`, code: "invalid-required-state" },
  { title: "invalid readonly state", markup: `<label for="q">Query</label><input id="q" aria-readonly="maybe">`, code: "invalid-readonly-state" },
  { title: "invalid disabled state", markup: `<button aria-disabled="perhaps">Continue</button>`, code: "invalid-disabled-state" },
  { title: "placeholder used as sole label", markup: `<input id="q" placeholder="Search">`, code: "placeholder-only-label" },
  { title: "image control without alternative", markup: `<input id="image" type="image" src="data:image/svg+xml,%3Csvg/%3E">`, code: "image-button-without-alt" },
  { title: "duplicate labelledby token", markup: `<span id="title">Title</span><button aria-labelledby="title title">Open</button>`, code: "duplicate-labelledby-token" },
  { title: "label targeting missing control", markup: `<label for="not-here">Query</label>`, code: "label-for-nonexistent-field" },
  { title: "orphaned visible label", markup: `<label>Query</label>`, code: "unassociated-visible-label" },
  { title: "input paired with empty label", markup: `<label for="q"></label><input id="q">`, code: "input-associated-label-empty" },
];

for (const scenario of missingNameCases) {
  test(`rejects ${scenario.title}`, async ({ page }) => {
    await missing(page, scenario.markup, scenario.code);
  });
}

test.describe("P16 round 10: positive name relationships", () => {
  test("native button text is a usable name", async ({ page }) => {
    await fixture(page, `<button id="save">Save</button>`);
    const report = await auditNameRelations(page);
    expect(report.issues).toEqual([]);
    expect(report.controls).toBe(1);
    expect(report.names).toBe(1);
  });

  test("aria label names an icon-only button", async ({ page }) => {
    await fixture(page, `<button aria-label="Close"><span aria-hidden="true">×</span></button>`);
    expect((await auditNameRelations(page)).issues).toEqual([]);
  });

  test("aria-labelledby resolves one visible text node", async ({ page }) => {
    await fixture(page, `<span id="save-label">Save</span><button aria-labelledby="save-label"></button>`);
    expect((await auditNameRelations(page)).issues).toEqual([]);
  });

  test("multiple labelledby targets form one name", async ({ page }) => {
    await fixture(page, `<span id="first">Save</span><span id="second">changes</span>
      <button aria-labelledby="first second"></button>`);
    expect((await auditNameRelations(page)).issues).toEqual([]);
  });

  test("visible label included in aria-label passes", async ({ page }) => {
    await fixture(page, `<button aria-label="Save changes">Save</button>`);
    expect((await auditNameRelations(page)).issues).toEqual([]);
  });

  test("visible label included in aria-labelledby passes", async ({ page }) => {
    await fixture(page, `<span id="visible">Open details</span><button aria-labelledby="visible">Open</button>`);
    expect((await auditNameRelations(page)).issues).toEqual([]);
  });

  test("explicit label names a text field", async ({ page }) => {
    await fixture(page, `<label for="query">Search</label><input id="query" type="text">`);
    expect((await auditNameRelations(page)).issues).toEqual([]);
  });

  test("wrapping label names a checkbox", async ({ page }) => {
    await fixture(page, `<label><input type="checkbox"> Send update</label>`);
    expect((await auditNameRelations(page)).issues).toEqual([]);
  });

  test("wrapping label names a radio", async ({ page }) => {
    await fixture(page, `<label><input type="radio" name="choice"> Option one</label>`);
    expect((await auditNameRelations(page)).issues).toEqual([]);
  });

  test("fieldset with legend groups fields", async ({ page }) => {
    await fixture(page, `<fieldset><legend>Display</legend>
      <label><input type="checkbox"> Large text</label>
      <label><input type="checkbox"> More contrast</label></fieldset>`);
    expect((await auditNameRelations(page)).issues).toEqual([]);
  });

  test("explicitly named radiogroup passes", async ({ page }) => {
    await fixture(page, `<div role="radiogroup" aria-label="Display mode">
      <div role="radio" aria-checked="true" tabindex="0">Light</div>
      <div role="radio" aria-checked="false" tabindex="-1">Dark</div></div>`);
    expect((await auditNameRelations(page)).issues).toEqual([]);
  });

  test("described controls can reference multiple nodes", async ({ page }) => {
    await fixture(page, `<label for="q">Search</label><input id="q" aria-describedby="hint note">
      <p id="hint">Enter a place.</p><p id="note">Results may be UNKNOWN.</p>`);
    expect((await auditNameRelations(page)).issues).toEqual([]);
  });

  test("valid error reference is not reported", async ({ page }) => {
    await fixture(page, `<label for="q">Search</label><input id="q" aria-invalid="true"
      aria-errormessage="error"><p id="error">Enter a value.</p>`);
    expect((await auditNameRelations(page)).issues).toEqual([]);
  });

  test("valid aria-invalid grammar value is accepted", async ({ page }) => {
    await fixture(page, `<label for="q">Text</label><input id="q" aria-invalid="grammar">`);
    expect((await auditNameRelations(page)).issues).toEqual([]);
  });

  test("valid required readonly and disabled flags are accepted", async ({ page }) => {
    await fixture(page, `<button aria-disabled="false" aria-readonly="false" aria-required="false">Continue</button>`);
    expect((await auditNameRelations(page)).issues).toEqual([]);
  });

  test("unlabelled hidden input is excluded", async ({ page }) => {
    await fixture(page, `<input type="hidden" value="internal"><button>Continue</button>`);
    const report = await auditNameRelations(page);
    expect(report.controls).toBe(1);
    expect(report.issues).toEqual([]);
  });

  test("inert controls are excluded from visible-name census", async ({ page }) => {
    await fixture(page, `<section inert><button></button></section><button>Continue</button>`);
    const report = await auditNameRelations(page);
    expect(report.controls).toBe(1);
    expect(report.issues).toEqual([]);
  });

  test("report contains positive field and label counts", async ({ page }) => {
    await fixture(page, `<label for="name">Name</label><input id="name"><button>Send</button>`);
    const report = await auditNameRelations(page);
    expect(report.controls).toBe(2);
    expect(report.names).toBe(2);
    expect(report.labels).toBe(1);
  });

  test("audit never activates a named control", async ({ page }) => {
    await fixture(page, `<button id="send" onclick="document.body.dataset.sent='true'">Send</button>`);
    await auditNameRelations(page);
    expect(await page.locator("body").getAttribute("data-sent")).toBeNull();
  });

  test("audit never moves keyboard focus", async ({ page }) => {
    await fixture(page, `<button id="first">First</button><button>Second</button>`);
    await page.locator("#first").focus();
    await auditNameRelations(page);
    await expect(page.locator("#first")).toBeFocused();
  });

  test("diagnostic output retains code and control target", async ({ page }) => {
    await fixture(page, `<button id="unnamed"></button>`);
    const report = await auditNameRelations(page);
    expect(summarizeNameRelations(report)).toContain("unnamed-button #unnamed");
  });

  test("correct French names do not require English text", async ({ page }) => {
    await page.setContent(`<!doctype html><html lang="fr"><body><main>
      <button aria-label="Fermer">Fermer</button></main></body></html>`);
    expect((await auditNameRelations(page)).issues).toEqual([]);
  });
});
