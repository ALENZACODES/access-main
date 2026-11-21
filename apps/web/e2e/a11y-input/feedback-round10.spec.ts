import { expect, test, type Page } from "@playwright/test";
import {
  auditFeedback, describeFeedback, exerciseStatusEvent,
  type FeedbackCode,
} from "./feedback-round10";

async function fixture(page: Page, markup: string): Promise<void> {
  await page.setContent(`<!doctype html><html lang="en"><head><title>Status fixture</title>
    <style>body{font:18px sans-serif}button,input{min-height:44px}</style>
    </head><body><main><h1>Status fixture</h1>${markup}</main></body></html>`);
}

async function expectProblem(page: Page, markup: string, code: FeedbackCode): Promise<void> {
  await fixture(page, markup);
  const report = await auditFeedback(page);
  expect(report.issues.map((issue) => issue.code), describeFeedback(report)).toContain(code);
}

const invalidCases: ReadonlyArray<{ title: string; html: string; code: FeedbackCode }> = [
  { title: "unsupported live priority", html: `<p aria-live="urgent">Update</p>`, code: "invalid-live-mode" },
  { title: "empty live priority", html: `<p aria-live="">Update</p>`, code: "invalid-live-mode" },
  { title: "unsupported atomic value", html: `<p aria-live="polite" aria-atomic="sometimes">Update</p>`, code: "invalid-live-atomic" },
  { title: "empty atomic value", html: `<p aria-live="polite" aria-atomic="">Update</p>`, code: "invalid-live-atomic" },
  { title: "unsupported busy state", html: `<p role="status" aria-busy="maybe">Update</p>`, code: "invalid-live-busy" },
  { title: "unsupported relevant token", html: `<p aria-live="polite" aria-relevant="unknown">Update</p>`, code: "invalid-live-relevant" },
  { title: "blank relevant list", html: `<p aria-live="polite" aria-relevant="">Update</p>`, code: "invalid-live-relevant" },
  { title: "invalid relevant combination", html: `<p aria-live="polite" aria-relevant="additions wrong">Update</p>`, code: "invalid-live-relevant" },
  { title: "muted alert", html: `<p role="alert" aria-live="off">Warning</p>`, code: "silenced-alert" },
  { title: "muted status", html: `<p role="status" aria-live="off">Ready</p>`, code: "silenced-status" },
  { title: "hidden status region", html: `<p role="status" aria-hidden="true">Ready</p>`, code: "live-region-hidden" },
  { title: "positive tabindex on status", html: `<p role="status" tabindex="5">Ready</p>`, code: "live-positive-tabindex" },
  { title: "static alert without content", html: `<p role="alert" data-a11y-static-alert></p>`, code: "alert-empty" },
  { title: "button presented as a status", html: `<button role="status">Continue</button>`, code: "status-is-button" },
  { title: "invalid progress min/max", html: `<div role="progressbar" aria-label="Loading" aria-valuemin="5" aria-valuemax="1"></div>`, code: "invalid-progress-range" },
  { title: "equal progress endpoints", html: `<div role="progressbar" aria-label="Loading" aria-valuemin="3" aria-valuemax="3"></div>`, code: "invalid-progress-range" },
  { title: "non-numeric progress min", html: `<div role="progressbar" aria-label="Loading" aria-valuemin="none"></div>`, code: "invalid-progress-range" },
  { title: "progress value below min", html: `<div role="progressbar" aria-label="Loading" aria-valuemin="10" aria-valuemax="20" aria-valuenow="2"></div>`, code: "invalid-progress-value" },
  { title: "progress value above max", html: `<div role="progressbar" aria-label="Loading" aria-valuemin="10" aria-valuemax="20" aria-valuenow="40"></div>`, code: "invalid-progress-value" },
  { title: "non-numeric progress value", html: `<div role="progressbar" aria-label="Loading" aria-valuenow="pending"></div>`, code: "invalid-progress-value" },
  { title: "unnamed custom progressbar", html: `<div role="progressbar" aria-valuenow="20"></div>`, code: "progress-without-name" },
  { title: "blank progress value text", html: `<div role="progressbar" aria-label="Loading" aria-valuetext=""></div>`, code: "invalid-progress-value-text" },
  { title: "invalid meter min/max", html: `<div role="meter" aria-label="Usage" aria-valuemin="4" aria-valuemax="1"></div>`, code: "invalid-meter-range" },
  { title: "meter value outside range", html: `<div role="meter" aria-label="Usage" aria-valuenow="4"></div>`, code: "invalid-meter-value" },
  { title: "unnamed custom meter", html: `<div role="meter" aria-valuenow="0.5"></div>`, code: "meter-without-name" },
  { title: "empty output input reference", html: `<output for="">2</output>`, code: "output-empty-reference" },
  { title: "output references missing field", html: `<output for="absent">2</output>`, code: "output-broken-for" },
  { title: "output contains one missing field", html: `<input id="a"><output for="a b">2</output>`, code: "output-broken-for" },
  { title: "opted-in invalid field missing error", html: `<input id="a" aria-invalid="true" data-a11y-error-required>`, code: "missing-error-status" },
  { title: "invalid field points at absent error", html: `<input id="a" aria-invalid="true" aria-errormessage="absent">`, code: "invalid-error-target" },
  { title: "invalid field points at empty error", html: `<input id="a" aria-invalid="true" aria-errormessage="error"><p id="error"></p>`, code: "status-reference-empty" },
  { title: "invalid field points at hidden error", html: `<input id="a" aria-invalid="true" aria-errormessage="error"><p id="error" hidden>Required</p>`, code: "error-region-hidden" },
  { title: "unsupported aria-current", html: `<nav><a href="/" aria-current="perhaps">Home</a></nav>`, code: "invalid-aria-current" },
  { title: "multiple current pages", html: `<nav><a href="/" aria-current="page">Home</a><a href="/help" aria-current="page">Help</a></nav>`, code: "multiple-current-pages" },
  { title: "disabled expanded disclosure opt-in", html: `<button aria-disabled="true" aria-expanded="true" data-a11y-closed-when-disabled>Details</button>`, code: "disabled-control-still-expanded" },
];

for (const scenario of invalidCases) {
  test(`rejects ${scenario.title}`, async ({ page }) => {
    await expectProblem(page, scenario.html, scenario.code);
  });
}

test.describe("P16 round 10: valid feedback states", () => {
  test("polite status and assertive alert pass", async ({ page }) => {
    await fixture(page, `<p role="status" aria-live="polite">Ready</p>
      <p role="alert" aria-live="assertive">Warning</p>`);
    expect((await auditFeedback(page)).issues).toEqual([]);
  });

  test("atomic and relevant values are accepted", async ({ page }) => {
    await fixture(page, `<p role="status" aria-live="polite" aria-atomic="true"
      aria-relevant="additions text" aria-busy="false">Ready</p>`);
    expect((await auditFeedback(page)).issues).toEqual([]);
  });

  test("valid progress value inside range passes", async ({ page }) => {
    await fixture(page, `<div role="progressbar" aria-label="Loading" aria-valuemin="0"
      aria-valuemax="100" aria-valuenow="55"></div>`);
    expect((await auditFeedback(page)).issues).toEqual([]);
  });

  test("native progress with associated label passes", async ({ page }) => {
    await fixture(page, `<label for="load">Loading</label><progress id="load" value="40" max="100"></progress>`);
    expect((await auditFeedback(page)).issues).toEqual([]);
  });

  test("meter with semantic value passes", async ({ page }) => {
    await fixture(page, `<div role="meter" aria-label="Usage" aria-valuemin="0"
      aria-valuemax="1" aria-valuenow="0.25"></div>`);
    expect((await auditFeedback(page)).issues).toEqual([]);
  });

  test("output associated with two inputs passes", async ({ page }) => {
    await fixture(page, `<label for="a">A</label><input id="a"><label for="b">B</label>
      <input id="b"><output for="a b">10</output>`);
    expect((await auditFeedback(page)).issues).toEqual([]);
  });

  test("well-associated error message passes", async ({ page }) => {
    await fixture(page, `<label for="name">Name</label><input id="name" aria-invalid="true"
      aria-errormessage="error"><p id="error">Enter a name.</p>`);
    expect((await auditFeedback(page)).issues).toEqual([]);
  });

  test("empty, pre-mounted polite status is allowed", async ({ page }) => {
    await fixture(page, `<div role="status" aria-live="polite"></div>`);
    expect((await auditFeedback(page)).issues).toEqual([]);
  });

  test("aria-current step and location are accepted", async ({ page }) => {
    await fixture(page, `<nav><a href="/" aria-current="step">Step</a>
      <a href="/map" aria-current="location">Location</a></nav>`);
    expect((await auditFeedback(page)).issues).toEqual([]);
  });

  test("different navigation landmarks may each have one current page", async ({ page }) => {
    await fixture(page, `<nav aria-label="Primary"><a href="/" aria-current="page">Home</a></nav>
      <nav aria-label="Secondary"><a href="/help" aria-current="page">Help</a></nav>`);
    expect((await auditFeedback(page)).issues).toEqual([]);
  });

  test("live region auditor never moves focus", async ({ page }) => {
    await fixture(page, `<button id="action">Continue</button><p role="status">Ready</p>`);
    await page.locator("#action").focus();
    await auditFeedback(page);
    await expect(page.locator("#action")).toBeFocused();
  });

  test("status trigger announces on Enter without taking focus", async ({ page }) => {
    await fixture(page, `<button id="update" data-a11y-safe-status-target="status">Update</button>
      <p role="status" id="status">Waiting</p>
      <script>document.getElementById('update').addEventListener('click', () => {
        document.getElementById('status').textContent = 'Updated';
      });</script>`);
    expect(await exerciseStatusEvent(page, "#update")).toEqual([]);
    await expect(page.locator("#update")).toBeFocused();
    await expect(page.locator("#status")).toHaveText("Updated");
  });

  test("status trigger moving focus is reported", async ({ page }) => {
    await fixture(page, `<button id="update" data-a11y-safe-status-target="status">Update</button>
      <button id="other">Other</button><p role="status" id="status">Waiting</p>
      <script>document.getElementById('update').addEventListener('click', () => {
        document.getElementById('status').textContent = 'Updated';
        document.getElementById('other').focus();
      });</script>`);
    expect((await exerciseStatusEvent(page, "#update")).map((issue) => issue.code))
      .toContain("status-focus-stolen");
  });

  test("status trigger without target is rejected without activation", async ({ page }) => {
    await fixture(page, `<button id="bad" onclick="document.body.dataset.clicked='yes'">Update</button>`);
    expect((await exerciseStatusEvent(page, "#bad")).map((issue) => issue.code))
      .toContain("invalid-error-target");
    expect(await page.locator("body").getAttribute("data-clicked")).toBeNull();
  });

  test("status trigger with missing target is rejected", async ({ page }) => {
    await fixture(page, `<button id="bad" data-a11y-safe-status-target="absent">Update</button>`);
    expect((await exerciseStatusEvent(page, "#bad")).map((issue) => issue.code))
      .toContain("invalid-error-target");
  });

  test("status audit counts regions and progress indicators", async ({ page }) => {
    await fixture(page, `<p role="status">Ready</p><div role="progressbar" aria-label="Loading" aria-valuenow="25"></div>`);
    const report = await auditFeedback(page);
    expect(report.regions).toBe(1);
    expect(report.progressIndicators).toBe(1);
    expect(report.errors).toBe(0);
  });

  test("French announcement text is accepted", async ({ page }) => {
    await page.setContent(`<!doctype html><html lang="fr"><body>
      <p role="status" aria-live="polite">Mise à jour terminée</p></body></html>`);
    expect((await auditFeedback(page)).issues).toEqual([]);
  });
});
