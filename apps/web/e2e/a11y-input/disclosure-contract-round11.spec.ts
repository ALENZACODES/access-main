import { expect, test, type Page } from "@playwright/test";
import {
  auditDisclosureContractsRound11,
  exerciseOptInDialogRound11,
  type DisclosureCode,
} from "./disclosure-contract-round11";

async function mount(page: Page, content: string): Promise<void> {
  await page.setContent(`<!doctype html><html lang="en"><head><title>Disclosure fixture</title>
    <style>button,summary {min-height:44px;min-width:44px}</style></head><body>
    <main><h1>Disclosure fixture</h1>${content}</main></body></html>`);
}
async function negative(page: Page, content: string, code: DisclosureCode): Promise<void> {
  await mount(page, content);
  const report = await auditDisclosureContractsRound11(page);
  expect(report.findings.map((finding) => finding.code), JSON.stringify(report.findings)).toContain(code);
}

const invalid: readonly { name: string; html: string; code: DisclosureCode }[] = [
  { name: "invalid expansion state", html: `<button aria-expanded="sometimes" aria-controls="panel">Details</button><div id="panel">Body</div>`, code: "invalid-expanded" },
  { name: "expanded without target", html: `<button aria-expanded="true">Details</button>`, code: "expanded-without-target" },
  { name: "missing controlled panel", html: `<button aria-expanded="true" aria-controls="absent">Details</button>`, code: "missing-controlled-target" },
  { name: "duplicate controlled panel", html: `<button aria-expanded="true" aria-controls="one">Details</button><p id="one">A</p><p id="one">B</p>`, code: "ambiguous-controlled-target" },
  { name: "expanded panel hidden", html: `<button aria-expanded="true" aria-controls="one">Details</button><div id="one" hidden>Hidden</div>`, code: "expanded-target-hidden" },
  { name: "declared collapsed panel exposed", html: `<button aria-expanded="false" aria-controls="one" data-a11y-collapses-panel>Details</button><div id="one">Text</div>`, code: "collapsed-target-exposed" },
  { name: "invalid popup type", html: `<button aria-haspopup="popup">Options</button>`, code: "invalid-haspopup" },
  { name: "unnamed disclosure control", html: `<button aria-expanded="false" aria-controls="one"></button><div id="one" hidden></div>`, code: "unnamed-disclosure" },
  { name: "non-focusable custom disclosure", html: `<div tabindex="-1" aria-expanded="true" aria-controls="one">Expand</div><div id="one">Text</div>`, code: "disclosure-not-keyboard-focusable" },
  { name: "unnamed dialog", html: `<dialog id="one" open><p>Body</p></dialog>`, code: "invalid-dialog-name" },
  { name: "broken dialog description", html: `<dialog open aria-label="Confirm" aria-describedby="missing">Body</dialog>`, code: "dialog-description-missing" },
  { name: "modal focus outside", html: `<dialog open role="dialog" aria-label="Confirm" aria-modal="true"><button>Close</button></dialog><button id="outside">Outside</button>`, code: "modal-outside-focus" },
  { name: "dialog hidden from accessibility tree", html: `<dialog open aria-label="Confirm" aria-hidden="true">Content</dialog>`, code: "hidden-open-dialog" },
  { name: "dialog with required close and no close button", html: `<dialog open aria-label="Confirm" data-a11y-requires-close-button><p>Body</p></dialog>`, code: "dialog-has-no-keyboard-exit" },
  { name: "duplicate dialog label", html: `<dialog open aria-label="Details">A</dialog><dialog open aria-label="Details">B</dialog>`, code: "duplicate-dialog-label" },
  { name: "details without summary", html: `<details><p>Panel</p></details>`, code: "details-without-summary" },
  { name: "details with two summaries", html: `<details><summary>One</summary><summary>Two</summary><p>Text</p></details>`, code: "invalid-details-summary" },
  { name: "summary outside details", html: `<summary>Details</summary>`, code: "summary-outside-details" },
  { name: "invalid popover target", html: `<button popovertarget="absent">Show</button>`, code: "invalid-popover-target" },
  { name: "declared popover state mismatch", html: `<button aria-expanded="true" popovertarget="one">Open</button><div id="one" popover>Content</div>`, code: "popover-state-mismatch" },
  { name: "open inert region", html: `<button aria-expanded="true" aria-controls="one">Open</button><div inert><div id="one">Panel</div></div>`, code: "expanded-target-hidden" },
  { name: "positive tabindex in dialog", html: `<dialog open aria-label="Options"><button tabindex="3">Close</button></dialog>`, code: "overlay-with-positive-tabindex" },
  { name: "focusable children in declared collapsed panel", html: `<div data-a11y-collapsed-panel><button>Action</button></div>`, code: "interactive-hidden-panel" },
  { name: "missing dialog trigger", html: `<dialog open aria-label="Details" data-a11y-trigger="absent"><p>Content</p></dialog>`, code: "dialog-outside-trigger" },
  { name: "invalid aria-modal", html: `<dialog open aria-label="Details" aria-modal="sometimes">Content</dialog>`, code: "invalid-modal-state" },
];
for (const scenario of invalid) {
  test(`disclosure negative: ${scenario.name}`, async ({ page }) => {
    await negative(page, scenario.html, scenario.code);
  });
}

test("valid collapsed disclosure has an accessible button and hidden panel", async ({ page }) => {
  await mount(page, `<button aria-expanded="false" aria-controls="details" data-a11y-collapses-panel>Details</button><div id="details" hidden>Body</div>`);
  expect((await auditDisclosureContractsRound11(page)).findings).toEqual([]);
});

test("valid expanded disclosure reveals a named panel", async ({ page }) => {
  await mount(page, `<button id="open" aria-expanded="true" aria-controls="details">Details</button><section id="details" aria-label="Details panel">Content</section>`);
  expect((await auditDisclosureContractsRound11(page)).findings).toEqual([]);
});

test("details summary is keyboard reachable without scripting", async ({ page }) => {
  await mount(page, `<details id="details"><summary>Open instructions</summary><p>Instructions</p></details>`);
  expect((await auditDisclosureContractsRound11(page)).findings).toEqual([]);
  await page.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#details")).toHaveAttribute("open", "");
  await page.keyboard.press("Enter");
  await expect(page.locator("#details")).not.toHaveAttribute("open");
});

test("native modal closes with Escape and restores trigger focus", async ({ page }) => {
  await mount(page, `<button id="open" aria-haspopup="dialog">Open</button>
    <dialog id="modal" aria-label="Options"><button id="close">Close</button></dialog>
    <script>
      const opener = document.getElementById('open');
      const dialog = document.getElementById('modal');
      opener.addEventListener('click', () => dialog.showModal());
      dialog.addEventListener('close', () => opener.focus());
      document.getElementById('close').addEventListener('click', () => dialog.close());
    </script>`);
  const result = await exerciseOptInDialogRound11(page, page.locator("#open"));
  expect(result).toEqual({ opened: true, initiallyInside: true, trapped: true, closedByEscape: true, focusRestored: true });
});

test("dialog with labelledby and describedby has a semantic name", async ({ page }) => {
  await mount(page, `<dialog open aria-labelledby="heading" aria-describedby="detail">
    <h2 id="heading">Information</h2><p id="detail">More information</p><button aria-label="Close">Close</button></dialog>`);
  const report = await auditDisclosureContractsRound11(page);
  expect(report.findings.filter((finding) => finding.code === "invalid-dialog-name" || finding.code === "dialog-description-missing")).toEqual([]);
});

test("valid popover target can be opened from keyboard", async ({ page }) => {
  await mount(page, `<button id="open" popovertarget="panel">Options</button><div id="panel" popover>Details</div>`);
  expect((await auditDisclosureContractsRound11(page)).findings).toEqual([]);
  await page.locator("#open").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#panel")).toBeHidden();
});

test("opted-in custom dialog with no Escape handler fails", async ({ page }) => {
  await mount(page, `<button id="open" aria-haspopup="dialog">Open</button>
    <div id="modal" role="dialog" aria-modal="true" aria-label="Options" hidden><button id="close">Close</button></div>
    <script>
      const button = document.getElementById('open');
      button.addEventListener('click', () => {
        document.getElementById('modal').hidden = false;
        document.getElementById('close').focus();
      });
    </script>`);
  await page.locator("#open").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#modal")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#modal")).toBeVisible();
});

test("nonmodal dialog does not claim modal focus containment", async ({ page }) => {
  await mount(page, `<dialog open aria-label="Information"><p>Information</p></dialog>`);
  expect((await auditDisclosureContractsRound11(page)).findings.map((item) => item.code)).not.toContain("modal-outside-focus");
});

test("closed native dialogs are excluded from visible dialog census", async ({ page }) => {
  await mount(page, `<dialog aria-label="Information"><p>Information</p></dialog>`);
  expect((await auditDisclosureContractsRound11(page)).dialogs).toBe(0);
});

test("keyboard focus can reach button controlling native details", async ({ page }) => {
  await mount(page, `<button id="expand" aria-expanded="false" aria-controls="panel">Show</button><div id="panel" hidden>Content</div>
    <script>document.getElementById('expand').onclick = () => {
      const button = document.getElementById('expand');
      const panel = document.getElementById('panel');
      panel.hidden = !panel.hidden;
      button.setAttribute('aria-expanded', String(!panel.hidden));
    };</script>`);
  await page.locator("#expand").focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#expand")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#panel")).toBeVisible();
  expect((await auditDisclosureContractsRound11(page)).findings).toEqual([]);
});
