import { expect, test, type Page } from "@playwright/test";
import { auditKeyboardGuidanceRound11, type KeyboardGuidanceCode } from "./keyboard-guidance-round11";

async function mount(page: Page, content: string, language = "en"): Promise<void> {
  await page.setContent(`<!doctype html><html lang="${language}"><head><title>Input guidance</title></head>
    <body><main><h1>Keyboard guidance</h1>${content}</main></body></html>`);
}
async function negative(page: Page, markup: string, expected: KeyboardGuidanceCode): Promise<void> {
  await mount(page, markup);
  const result = await auditKeyboardGuidanceRound11(page);
  expect(result.findings.map((finding) => finding.code), JSON.stringify(result.findings)).toContain(expected);
}

const cases: readonly { name: string; html: string; code: KeyboardGuidanceCode }[] = [
  { name: "shortcut without a visible or programmatic name", html: `<button aria-keyshortcuts="Alt+K"></button>`, code: "shortcut-without-name" },
  { name: "empty shortcut value", html: `<button aria-keyshortcuts="">Open</button>`, code: "shortcut-empty" },
  { name: "malformed shortcut", html: `<button aria-keyshortcuts="Control++K">Open</button>`, code: "shortcut-invalid-token" },
  { name: "duplicate shortcut", html: `<button aria-keyshortcuts="Alt+K">One</button><button aria-keyshortcuts="Alt+K">Two</button>`, code: "duplicate-shortcut" },
  { name: "global printable character shortcut", html: `<button aria-keyshortcuts="K" data-a11y-global-shortcut>Open</button>`, code: "shortcut-conflicts-with-text-entry" },
  { name: "non-focusable shortcut trigger", html: `<div aria-keyshortcuts="Control+K">Open</div>`, code: "nonfocusable-keyboard-trigger" },
  { name: "gesture without keyboard alternative", html: `<div data-a11y-gesture="swipe">Swipe</div>`, code: "gesture-without-keyboard-alternative" },
  { name: "gesture with missing alternative", html: `<div data-a11y-gesture="swipe" data-a11y-keyboard-alternative="missing">Swipe</div>`, code: "alternative-control-missing" },
  { name: "gesture with non-focusable alternative", html: `<div data-a11y-gesture="swipe" data-a11y-keyboard-alternative="hint">Swipe</div><p id="hint">Press</p>`, code: "alternative-control-not-focusable" },
  { name: "gesture with hidden alternative", html: `<div data-a11y-gesture="swipe" data-a11y-keyboard-alternative="action">Swipe</div><button id="action" hidden>Move</button>`, code: "gesture-alternative-hidden" },
  { name: "empty accesskey", html: `<button accesskey="">Open</button>`, code: "accesskey-empty" },
  { name: "accesskey with multiple characters", html: `<button accesskey="open">Open</button>`, code: "accesskey-multiple-characters" },
  { name: "duplicate accesskey", html: `<button accesskey="o">One</button><button accesskey="o">Two</button>`, code: "accesskey-duplicate" },
  { name: "invalid inputmode", html: `<label>Code <input inputmode="keyboard" /></label>`, code: "invalid-inputmode" },
  { name: "empty autocomplete", html: `<label>Name <input autocomplete="" /></label>`, code: "invalid-autocomplete" },
  { name: "invalid required attribute", html: `<div role="textbox" aria-label="Name" aria-required="sometimes" tabindex="0"></div>`, code: "invalid-required-state" },
  { name: "invalid readonly attribute", html: `<div role="textbox" aria-label="Name" aria-readonly="sometimes" tabindex="0"></div>`, code: "invalid-readonly-state" },
  { name: "custom textbox without name", html: `<div role="textbox" tabindex="0"></div>`, code: "custom-input-without-label" },
  { name: "custom switch without name", html: `<div role="switch" aria-checked="false" tabindex="0"></div>`, code: "custom-input-without-label" },
  { name: "description references missing node", html: `<div role="textbox" aria-label="Name" aria-describedby="missing" tabindex="0"></div>`, code: "broken-description" },
  { name: "description hidden from both audiences", html: `<div role="textbox" aria-label="Name" aria-describedby="hint" tabindex="0"></div><p id="hint" hidden>Hint</p>`, code: "description-hidden" },
  { name: "instruction points to missing node", html: `<button data-a11y-keyboard-instructions="missing">Open</button>`, code: "instruction-ref-missing" },
  { name: "instruction identifier appears twice", html: `<button data-a11y-keyboard-instructions="hint">Open</button><p id="hint">One</p><p id="hint">Two</p>`, code: "instruction-ref-duplicate" },
  { name: "instruction is hidden", html: `<button data-a11y-keyboard-instructions="hint">Open</button><p id="hint" hidden>Press Enter</p>`, code: "instructions-hidden" },
  { name: "instruction language differs from document", html: `<button data-a11y-keyboard-instructions="hint">Open</button><p id="hint" lang="fr">Appuyez sur Entrée</p>`, code: "instruction-not-bilingual" },
  { name: "unknown keyboard pattern", html: `<div data-a11y-key-map="magic">Use keys</div>`, code: "keyboard-map-unknown" },
  { name: "invalid keyboard state", html: `<div data-a11y-key-map="arrows" data-a11y-key-state="lost">Use arrows</div>`, code: "invalid-key-state" },
  { name: "invalid pressed state", html: `<div role="switch" aria-label="Option" aria-pressed="sometimes" tabindex="0"></div>`, code: "invalid-pressed-state" },
  { name: "invalid selected state", html: `<div role="radio" aria-label="Option" aria-selected="sometimes" tabindex="0"></div>`, code: "invalid-selected-state" },
];
for (const scenario of cases) {
  test(`guidance negative: ${scenario.name}`, async ({ page }) => {
    await negative(page, scenario.html, scenario.code);
  });
}

test("named shortcut button with modifier passes", async ({ page }) => {
  await mount(page, `<button aria-keyshortcuts="Control+K">Show commands</button>`);
  expect((await auditKeyboardGuidanceRound11(page)).findings).toEqual([]);
});

test("separate shortcuts on two buttons do not conflict", async ({ page }) => {
  await mount(page, `<button aria-keyshortcuts="Alt+K">Keyboard</button><button aria-keyshortcuts="Alt+H">Help</button>`);
  expect((await auditKeyboardGuidanceRound11(page)).findings).toEqual([]);
});

test("printable shortcut is allowed when it is not globally bound", async ({ page }) => {
  await mount(page, `<button aria-keyshortcuts="K">Keyboard</button>`);
  expect((await auditKeyboardGuidanceRound11(page)).findings).toEqual([]);
});

test("keyboard alternative can be a named visible button", async ({ page }) => {
  await mount(page, `<div data-a11y-gesture="swipe" data-a11y-keyboard-alternative="move">Swipe</div>
    <button id="move">Move selection</button>`);
  expect((await auditKeyboardGuidanceRound11(page)).findings).toEqual([]);
});

test("motion gesture can reuse a reachable control", async ({ page }) => {
  await mount(page, `<section data-a11y-motion-gesture data-a11y-keyboard-alternative="confirm">Motion option</section>
    <button id="confirm">Confirm</button>`);
  expect((await auditKeyboardGuidanceRound11(page)).findings).toEqual([]);
});

test("multiple gestures may share one alternative control", async ({ page }) => {
  await mount(page, `<div data-a11y-gesture data-a11y-keyboard-alternative="move">One</div>
    <div data-a11y-drag-source data-a11y-keyboard-alternative="move">Two</div>
    <button id="move">Move</button>`);
  expect((await auditKeyboardGuidanceRound11(page)).findings).toEqual([]);
});

test("custom text input with a referenced label passes", async ({ page }) => {
  await mount(page, `<label id="name-label">Name</label><div role="textbox" contenteditable tabindex="0" aria-labelledby="name-label"></div>`);
  expect((await auditKeyboardGuidanceRound11(page)).findings).toEqual([]);
});

test("labelled custom checkbox with Boolean state passes", async ({ page }) => {
  await mount(page, `<div role="checkbox" aria-label="Receive updates" aria-checked="false" tabindex="0"></div>`);
  expect((await auditKeyboardGuidanceRound11(page)).findings).toEqual([]);
});

test("visible description reference is usable", async ({ page }) => {
  await mount(page, `<div role="textbox" tabindex="0" aria-label="Reference" aria-describedby="hint"></div><p id="hint">Enter an identifier</p>`);
  expect((await auditKeyboardGuidanceRound11(page)).findings).toEqual([]);
});

test("English instructions use English document language", async ({ page }) => {
  await mount(page, `<button data-a11y-keyboard-instructions="hint">Open</button><p id="hint" lang="en">Press Enter</p>`);
  expect((await auditKeyboardGuidanceRound11(page)).findings).toEqual([]);
});

test("French instructions use French document language", async ({ page }) => {
  await mount(page, `<button data-a11y-keyboard-instructions="hint">Ouvrir</button><p id="hint" lang="fr">Appuyez sur Entrée</p>`, "fr");
  expect((await auditKeyboardGuidanceRound11(page)).findings).toEqual([]);
});

test("native numeric field with valid inputmode is accepted", async ({ page }) => {
  await mount(page, `<label for="code">Code</label><input id="code" inputmode="numeric" autocomplete="off" />`);
  expect((await auditKeyboardGuidanceRound11(page)).findings).toEqual([]);
});

test("screen reader only instruction uses explicit marker", async ({ page }) => {
  await mount(page, `<button data-a11y-keyboard-instructions="hint">Open</button><p id="hint" data-a11y-screen-reader-only hidden>Press Enter</p>`);
  expect((await auditKeyboardGuidanceRound11(page)).findings).toEqual([]);
});

test("keyboard instruction without a language attribute inherits document", async ({ page }) => {
  await mount(page, `<button data-a11y-keyboard-instructions="hint">Open</button><p id="hint">Press Enter</p>`);
  expect((await auditKeyboardGuidanceRound11(page)).findings).toEqual([]);
});

test("button can be activated with Enter and Space", async ({ page }) => {
  await mount(page, `<button id="action" aria-keyshortcuts="Alt+K">Action</button><output id="count">0</output>
    <script>let count=0;document.getElementById('action').onclick=()=>{document.getElementById('count').textContent=String(++count)}</script>`);
  await page.locator("#action").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#count")).toHaveText("1");
  await page.keyboard.press("Space");
  await expect(page.locator("#count")).toHaveText("2");
});

test("a 44px action remains reachable from sequential keyboard focus", async ({ page }) => {
  await mount(page, `<button id="action" style="width:44px;height:44px">Move</button>`);
  await page.keyboard.press("Tab");
  await expect(page.locator("#action")).toBeFocused();
  expect((await auditKeyboardGuidanceRound11(page)).findings).toEqual([]);
});

test("empty guidance document does not imply accessibility properties", async ({ page }) => {
  await mount(page, `<p>UNKNOWN</p>`);
  const report = await auditKeyboardGuidanceRound11(page);
  expect(report.keyboardShortcuts).toBe(0);
  expect(report.gestures).toBe(0);
  expect(report.customInputs).toBe(0);
  expect(report.findings).toEqual([]);
});
