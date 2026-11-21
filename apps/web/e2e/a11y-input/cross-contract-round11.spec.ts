import { expect, test, type Page } from "@playwright/test";
import { auditRouteContinuityRound11 } from "./route-continuity-round11";
import { auditDisclosureContractsRound11 } from "./disclosure-contract-round11";
import { auditDataViewsRound11 } from "./data-view-round11";
import { auditKeyboardGuidanceRound11 } from "./keyboard-guidance-round11";
import { observeHandoffFocusRound11 } from "./focus-handoff-round11";

async function mount(page: Page, content: string, language = "en"): Promise<void> {
  await page.setContent(`<!doctype html><html lang="${language}"><head><title>Interaction contracts</title>
    <style>button,a,input,summary {min-height:44px;min-width:44px}
    :focus-visible {outline:3px solid #274365;outline-offset:3px}</style></head>
    <body><main id="main" tabindex="-1"><h1>Interaction contracts</h1>${content}</main></body></html>`);
}

async function allFindings(page: Page): Promise<string[]> {
  const [navigation, disclosure, data, guidance] = await Promise.all([
    auditRouteContinuityRound11(page),
    auditDisclosureContractsRound11(page),
    auditDataViewsRound11(page),
    auditKeyboardGuidanceRound11(page),
  ]);
  return [...navigation.findings, ...disclosure.findings, ...data.findings, ...guidance.findings]
    .map((item) => item.code);
}

test("named bilingual menu and keyboard instructions do not conflict", async ({ page }) => {
  await mount(page, `<nav aria-label="Primary"><a href="/help">Help</a></nav>
    <button aria-expanded="false" aria-controls="panel" data-a11y-keyboard-instructions="hint">Show options</button>
    <p id="hint" lang="en">Press Enter to open options</p><div id="panel" hidden><p>Options</p></div>`);
  expect(await allFindings(page)).toEqual([]);
});

test("French instructions and fragment navigation are coherent", async ({ page }) => {
  await mount(page, `<nav aria-label="Navigation"><a href="#details">Détails</a></nav>
    <h2 id="details" tabindex="-1">Détails</h2><button aria-expanded="false" aria-controls="panel" data-a11y-keyboard-instructions="hint">Ouvrir</button>
    <p id="hint" lang="fr">Appuyez sur Entrée</p><section id="panel" hidden>Contenu</section>`, "fr");
  expect(await allFindings(page)).toEqual([]);
});

test("a named link can still fail if its destination is missing", async ({ page }) => {
  await mount(page, `<a id="guide" href="#not-here">Guide</a>`);
  const codes = await allFindings(page);
  expect(codes).toContain("missing-fragment");
  expect(codes).not.toContain("unnamed-link");
});

test("dialog opener must be named and keyboard reachable", async ({ page }) => {
  await mount(page, `<div aria-haspopup="dialog" aria-expanded="false" aria-controls="dialog"></div><div id="dialog" hidden role="dialog" aria-label="Options"></div>`);
  const codes = await allFindings(page);
  expect(codes).toContain("unnamed-disclosure");
  expect(codes).toContain("disclosure-not-keyboard-focusable");
});

test("table can have a caption yet still fail sorting keyboard support", async ({ page }) => {
  await mount(page, `<table><caption>Rates</caption><tr><th aria-sort="descending" data-a11y-sortable>Rate</th></tr><tr><td>3</td></tr></table>`);
  const codes = await allFindings(page);
  expect(codes).not.toContain("table-without-name");
  expect(codes).toContain("sort-action-not-keyboard");
});

test("valid table sort button remains accessible via Enter", async ({ page }) => {
  await mount(page, `<table><caption>Rates</caption><tr><th data-a11y-sortable aria-sort="ascending"><button id="sort">Rate</button></th></tr>
    <tr><td>3</td></tr></table><output id="state">ascending</output>
    <script>document.getElementById('sort').onclick=()=>{
      document.getElementById('state').textContent='descending';
      document.querySelector('[aria-sort]').setAttribute('aria-sort','descending');
    }</script>`);
  expect(await allFindings(page)).toEqual([]);
  await page.locator("#sort").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#state")).toHaveText("descending");
  expect(await allFindings(page)).toEqual([]);
});

test("a gesture alternative still needs a name", async ({ page }) => {
  await mount(page, `<div data-a11y-gesture="swipe" data-a11y-keyboard-alternative="move">Swipe</div><button id="move"></button>`);
  const codes = await allFindings(page);
  expect(codes).not.toContain("alternative-control-not-focusable");
  await page.locator("#move").focus();
  const focus = await observeHandoffFocusRound11(page);
  expect(focus.findings.map((item) => item.code)).toContain("focus-no-name");
});

test("hidden description does not provide complete input guidance", async ({ page }) => {
  await mount(page, `<div role="textbox" tabindex="0" aria-label="Notes" aria-describedby="hint"></div><p id="hint" hidden>Help</p>`);
  const codes = await allFindings(page);
  expect(codes).toContain("description-hidden");
  expect(codes).not.toContain("custom-input-without-label");
});

test("duplicate ID breaks fragment and instruction references", async ({ page }) => {
  await mount(page, `<a href="#hint">Jump</a><button data-a11y-keyboard-instructions="hint">Open</button>
    <p id="hint">One</p><p id="hint">Two</p>`);
  const codes = await allFindings(page);
  expect(codes).toContain("duplicate-fragment");
  expect(codes).toContain("instruction-ref-duplicate");
});

test("broken expanded panel does not disappear from audit when named", async ({ page }) => {
  await mount(page, `<button id="open" aria-expanded="true" aria-controls="missing">Details</button>`);
  const codes = await allFindings(page);
  expect(codes).toContain("missing-controlled-target");
  expect(codes).not.toContain("unnamed-disclosure");
});

test("UNKNOWN evidence text is not upgraded by keyboard auditing", async ({ page }) => {
  await mount(page, `<p id="evidence">UNKNOWN</p><nav aria-label="Primary"><a href="/help">Help</a></nav>`);
  const before = await page.locator("#evidence").textContent();
  expect(await allFindings(page)).toEqual([]);
  expect(await page.locator("#evidence").textContent()).toBe(before);
});

test("switch-style Enter activates a real native control", async ({ page }) => {
  await mount(page, `<button id="confirm">Confirm</button><output id="result">0</output>
    <script>let n=0;document.getElementById('confirm').onclick=()=>{document.getElementById('result').textContent=String(++n)}</script>`);
  await page.locator("#confirm").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#result")).toHaveText("1");
  expect(await allFindings(page)).toEqual([]);
});

test("closed dialog does not claim a modal focus trap", async ({ page }) => {
  await mount(page, `<button aria-haspopup="dialog" aria-expanded="false" aria-controls="dialog">Options</button>
    <dialog id="dialog" aria-label="Options"><button>Close</button></dialog>`);
  const disclosure = await auditDisclosureContractsRound11(page);
  expect(disclosure.findings).toEqual([]);
});

test("ARIA option selection cannot be malformed even when labelled", async ({ page }) => {
  await mount(page, `<div role="listbox" aria-label="Options" tabindex="0"><div role="option" aria-selected="maybe">A</div></div>`);
  const codes = await allFindings(page);
  expect(codes).toContain("invalid-option-state");
  expect(codes).not.toContain("option-without-name");
});

test("keyboard arrow movement on native range retains valid bounds", async ({ page }) => {
  await mount(page, `<label for="amount">Amount</label><input type="range" id="amount" min="0" max="10" value="5" />`);
  await page.locator("#amount").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#amount")).toHaveValue("6");
  expect(await allFindings(page)).toEqual([]);
});

test("collapsed disclosure cannot expose active keyboard children", async ({ page }) => {
  await mount(page, `<button aria-expanded="false" aria-controls="panel" data-a11y-collapses-panel>Options</button>
    <div id="panel" data-a11y-collapsed-panel><button id="hidden-action">Hidden action</button></div>`);
  const codes = await allFindings(page);
  expect(codes).toContain("collapsed-target-exposed");
  expect(codes).toContain("interactive-hidden-panel");
});

test("presentation table stays distinct from semantic data table", async ({ page }) => {
  await mount(page, `<table role="presentation"><tr><td>Layout</td></tr></table>
    <table><caption>Records</caption><tr><th scope="col">Name</th></tr><tr><td>One</td></tr></table>`);
  const report = await auditDataViewsRound11(page);
  expect(report.tables).toBe(2);
  expect(report.findings).toEqual([]);
});

test("non-English document does not silently get English instruction copy", async ({ page }) => {
  await mount(page, `<button data-a11y-keyboard-instructions="hint">Ouvrir</button><p id="hint" lang="en">Press Enter</p>`, "fr");
  const codes = await allFindings(page);
  expect(codes).toContain("instruction-not-bilingual");
});

test("properly linked French shortcut instructions are accepted", async ({ page }) => {
  await mount(page, `<button id="open" aria-keyshortcuts="Alt+O" data-a11y-keyboard-instructions="instructions">Ouvrir</button>
    <p id="instructions" lang="fr">Appuyez sur Alt+O</p>`, "fr");
  expect(await allFindings(page)).toEqual([]);
});

test("skip link and labelled data table remain independent", async ({ page }) => {
  await page.setContent(`<!doctype html><html lang="en"><body>
    <a class="a11y-skip-link" href="#main">Skip to content</a>
    <main id="main" tabindex="-1"><h1>Records</h1>
    <table><caption>Records</caption><tr><th>Name</th></tr><tr><td>One</td></tr></table></main></body></html>`);
  expect(await allFindings(page)).toEqual([]);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
});

test("named external download with safe rel has no route findings", async ({ page }) => {
  await mount(page, `<a href="https://example.org/report.txt" target="_blank" rel="noopener noreferrer" download="report.txt">Download report</a>`);
  expect(await allFindings(page)).toEqual([]);
});

test("conflicting table sort primaries cannot masquerade as correct selection", async ({ page }) => {
  await mount(page, `<table><caption>Records</caption><tr>
    <th aria-sort="ascending">Name</th><th aria-sort="descending">Date</th></tr><tr><td>One</td><td>Today</td></tr></table>`);
  const codes = await allFindings(page);
  expect(codes).toContain("multiple-sort-primaries");
});

test("modality-independent keyboard audit does not mutate document content", async ({ page }) => {
  await mount(page, `<nav aria-label="Primary"><a href="/help">Help</a></nav>
    <button id="open" aria-expanded="false" aria-controls="panel">Details</button><div id="panel" hidden>Text</div>`);
  const before = await page.locator("main").innerHTML();
  expect(await allFindings(page)).toEqual([]);
  const after = await page.locator("main").innerHTML();
  expect(after).toBe(before);
});

test("named alert dialog can coexist with a labelled data table", async ({ page }) => {
  await mount(page, `<table><caption>Options</caption><tr><th scope="col">Item</th></tr><tr><td>One</td></tr></table>
    <dialog open aria-label="Information" aria-describedby="explanation"><p id="explanation">Details</p>
      <button aria-label="Close">Close</button></dialog>`);
  const issues = await allFindings(page);
  expect(issues).toEqual([]);
});

test("missing dialog description remains a failure even with a title", async ({ page }) => {
  await mount(page, `<dialog open aria-label="Information" aria-describedby="missing">
    <button aria-label="Close">Close</button></dialog>`);
  const issues = await allFindings(page);
  expect(issues).toContain("dialog-description-missing");
  expect(issues).not.toContain("invalid-dialog-name");
});

test("valid multiline instructions are not mistaken for conflicting shortcuts", async ({ page }) => {
  await mount(page, `<button id="one" aria-keyshortcuts="Control+K" data-a11y-keyboard-instructions="guide">Open</button>
    <p id="guide">Press Control and K to open the command list. Press Escape to close it.</p>`);
  expect(await allFindings(page)).toEqual([]);
});

test("two individually named navigation landmarks preserve distinct destinations", async ({ page }) => {
  await mount(page, `<nav aria-label="Sections"><a href="/about">About</a></nav>
    <nav aria-label="Help"><a href="/help">Help</a></nav>`);
  expect(await allFindings(page)).toEqual([]);
});

test("a valid label does not excuse invalid keyboard shortcut syntax", async ({ page }) => {
  await mount(page, `<button aria-label="Open commands" aria-keyshortcuts="Control++K">Open</button>`);
  const issues = await allFindings(page);
  expect(issues).toContain("shortcut-invalid-token");
  expect(issues).not.toContain("shortcut-without-name");
});

test("positive tabindex inside a modal is rejected independently of its name", async ({ page }) => {
  await mount(page, `<dialog open aria-label="Options"><button tabindex="2" aria-label="Close">Close</button></dialog>`);
  const issues = await allFindings(page);
  expect(issues).toContain("overlay-with-positive-tabindex");
  expect(issues).not.toContain("invalid-dialog-name");
});

test("invalid grid selection cannot be concealed by a named grid", async ({ page }) => {
  await mount(page, `<div role="grid" aria-label="Results" tabindex="0"><div role="row">
    <span role="gridcell" aria-selected="sometimes">Result</span></div></div>`);
  const issues = await allFindings(page);
  expect(issues).toContain("invalid-selection-state");
  expect(issues).not.toContain("grid-without-name");
});

test("valid gesture alternative does not change UNKNOWN text", async ({ page }) => {
  await mount(page, `<p id="state">UNKNOWN</p><div data-a11y-gesture="drag" data-a11y-keyboard-alternative="move">Move item</div>
    <button id="move" type="button">Move item</button>`);
  const before = await page.locator("#state").textContent();
  expect(await allFindings(page)).toEqual([]);
  expect(await page.locator("#state").textContent()).toBe(before);
});

test("a disabled link must not be considered available for sequential input", async ({ page }) => {
  await mount(page, `<nav aria-label="Primary"><a href="/help" aria-disabled="true">Help</a></nav>`);
  const issues = await allFindings(page);
  expect(issues).toContain("conflicting-link-disabled");
});

test("fragment navigation to a hidden region is still an actionable finding", async ({ page }) => {
  await mount(page, `<a href="#details">Show details</a><section id="details" hidden>
    <h2>Details</h2><p>Information</p></section>`);
  const issues = await allFindings(page);
  expect(issues).toContain("hidden-fragment");
});
