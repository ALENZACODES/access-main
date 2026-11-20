import { expect, test, type Page } from "@playwright/test";

/** Isolated page fixtures exercise browser behaviour without app routes. */
const documentHtml = `<!doctype html><html lang="en"><head>
<title>Switch and screen-reader fixture</title>
<style>
  body { font: 16px system-ui; margin: 0; }
  main { max-width: 720px; margin: 12px auto; padding: 12px; }
  button, a, input, select, textarea { min-height: 44px; min-width: 44px; }
  button { margin: 4px; }
  :focus-visible { outline: 3px solid #173a6b; outline-offset: 3px; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0;
    margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
</style></head><body>
<a id="skip" href="#main">Skip to content</a>
<main id="main" tabindex="-1">
<h1>Switch and keyboard fixture</h1>
<div id="controls" role="group" aria-label="Controls">
<button id="first" type="button">First</button>
<button id="second" type="button">Second</button>
<button id="third" type="button">Third</button>
</div>
<div id="switches" role="group" aria-label="Switch alternatives">
<button id="advance" type="button" aria-controls="scan-status">Advance</button>
<button id="select" type="button" aria-controls="scan-status">Select</button>
<button id="cancel" type="button" aria-controls="scan-status">Cancel</button>
<p id="scan-status" role="status" aria-live="polite" aria-atomic="true">Ready</p>
</div>
<div id="actions" role="group" aria-label="Alternative actions">
<div id="draggable" draggable="true" tabindex="0" role="button" aria-label="Move item">Move item</div>
<button id="move-back" type="button">Move left</button>
<button id="move-next" type="button">Move right</button>
<p id="move-status" role="status" aria-live="polite">Item at zero</p>
</div>
<button id="open" type="button" aria-haspopup="dialog" aria-controls="dialog">Open dialog</button>
<dialog id="dialog" aria-labelledby="dialog-title">
<h2 id="dialog-title">Settings</h2>
<label for="choice">Choice</label>
<select id="choice"><option>One</option><option>Two</option></select>
<button id="close" type="button">Close</button>
</dialog>
<form id="form" novalidate>
<label for="email">Email address</label>
<input id="email" name="email" type="email" required aria-describedby="email-help">
<p id="email-help">Enter a valid address.</p>
<button id="submit" type="submit">Save</button>
<p id="form-status" role="status" aria-live="polite" aria-atomic="true"></p>
</form>
<div id="tabs" role="tablist" aria-label="Example tabs">
<button id="tab-one" role="tab" tabindex="0" aria-selected="true" aria-controls="panel-one">One</button>
<button id="tab-two" role="tab" tabindex="-1" aria-selected="false" aria-controls="panel-two">Two</button>
</div>
<section id="panel-one" role="tabpanel" aria-labelledby="tab-one"><p>Panel one</p></section>
<section id="panel-two" role="tabpanel" aria-labelledby="tab-two" hidden><p>Panel two</p></section>
<button id="lang" type="button" aria-label="Français">Français</button>
<p id="language-status" role="status" aria-live="polite">English</p>
<p id="offline" role="status" aria-live="polite">UNKNOWN</p>
</main>
<script>
  const $ = (id) => document.getElementById(id);
  let cursor = -1;
  let position = 0;
  const scanTargets = ['first', 'second', 'third'];
  $('advance').addEventListener('click', () => {
    cursor = (cursor + 1) % scanTargets.length;
    $('scan-status').textContent = 'Focused ' + scanTargets[cursor];
    $(scanTargets[cursor]).focus();
  });
  $('select').addEventListener('click', () => {
    if (cursor < 0) { $('scan-status').textContent = 'UNKNOWN'; return; }
    $('scan-status').textContent = 'Selected ' + scanTargets[cursor];
  });
  $('cancel').addEventListener('click', () => {
    cursor = -1;
    $('scan-status').textContent = 'Cancelled';
  });
  $('move-back').addEventListener('click', () => {
    position -= 1;
    $('move-status').textContent = 'Item at ' + position;
  });
  $('move-next').addEventListener('click', () => {
    position += 1;
    $('move-status').textContent = 'Item at ' + position;
  });
  $('draggable').addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); $('move-back').click(); }
    if (event.key === 'ArrowRight') { event.preventDefault(); $('move-next').click(); }
  });
  $('open').addEventListener('click', () => $('dialog').showModal());
  $('close').addEventListener('click', () => $('dialog').close());
  $('dialog').addEventListener('close', () => $('open').focus());
  $('form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (!$('email').checkValidity()) {
      $('email').setAttribute('aria-invalid', 'true');
      $('form-status').textContent = 'Please enter a valid email address.';
      $('email').focus();
      return;
    }
    $('email').removeAttribute('aria-invalid');
    $('form-status').textContent = 'Saved';
  });
  for (const [id, selected, panel, other, otherPanel] of [
    ['tab-one', 'tab-one', 'panel-one', 'tab-two', 'panel-two'],
    ['tab-two', 'tab-two', 'panel-two', 'tab-one', 'panel-one'],
  ]) {
    $(id).addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      $(other).click();
      $(other).focus();
    });
    $(id).addEventListener('click', () => {
      $(selected).setAttribute('aria-selected', 'true');
      $(selected).tabIndex = 0;
      $(panel).hidden = false;
      $(other).setAttribute('aria-selected', 'false');
      $(other).tabIndex = -1;
      $(otherPanel).hidden = true;
    });
  }
  $('lang').addEventListener('click', () => {
    const fr = document.documentElement.lang !== 'fr';
    document.documentElement.lang = fr ? 'fr' : 'en';
    $('lang').textContent = fr ? 'English' : 'Français';
    $('language-status').textContent = fr ? 'Français' : 'English';
  });
</script></body></html>`;

async function setup(page: Page): Promise<void> {
  await page.setContent(documentHtml, { waitUntil: "domcontentloaded" });
}

/** Probe real browser state; never simulate screen-reader speech. */
async function activeId(page: Page): Promise<string> {
  return page.evaluate(() => document.activeElement?.id ?? "");
}

async function visibleFocus(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && style.outlineStyle !== "none";
  });
}

test.describe("P16 R32 keyboard traversal", () => {
  test.beforeEach(async ({ page }) => setup(page));

  test("the skip link is the first keyboard target", async ({ page }) => {
    await page.keyboard.press("Tab");
    await expect(page.locator("#skip")).toBeFocused();
  });

  test("skip link moves to the main landmark", async ({ page }) => {
    await page.locator("#skip").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main")).toBeFocused();
  });

  test("forward tab sequence visits first control", async ({ page }) => {
    await page.locator("#skip").focus();
    await page.keyboard.press("Tab");
    await expect(page.locator("#first")).toBeFocused();
  });

  test("forward tab sequence visits second control", async ({ page }) => {
    await page.locator("#first").focus();
    await page.keyboard.press("Tab");
    await expect(page.locator("#second")).toBeFocused();
  });

  test("reverse tab returns to the previous control", async ({ page }) => {
    await page.locator("#second").focus();
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("#first")).toBeFocused();
  });

  test("keyboard controls have a visible focus outline", async ({ page }) => {
    await page.keyboard.press("Tab");
    await expect.poll(() => visibleFocus(page)).toBe(true);
  });

  test("all primary buttons meet minimum target size", async ({ page }) => {
    for (const id of ["first", "second", "third", "advance", "select", "cancel"]) {
      const rect = await page.locator(`#${id}`).boundingBox();
      expect(rect?.height).toBeGreaterThanOrEqual(44);
      expect(rect?.width).toBeGreaterThanOrEqual(44);
    }
  });

  test("Enter activates the advance switch", async ({ page }) => {
    await page.locator("#advance").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#scan-status")).toHaveText("Focused first");
    await expect(page.locator("#first")).toBeFocused();
  });

  test("Space activates the advance switch", async ({ page }) => {
    await page.locator("#advance").focus();
    await page.keyboard.press("Space");
    await expect(page.locator("#scan-status")).toHaveText("Focused first");
  });

  test("three advances visit the final scan target", async ({ page }) => {
    await page.locator("#advance").click();
    await page.locator("#advance").click();
    await page.locator("#advance").click();
    await expect(page.locator("#third")).toBeFocused();
  });

  test("a fourth advance wraps to first target", async ({ page }) => {
    for (let index = 0; index < 4; index += 1) await page.locator("#advance").click();
    await expect(page.locator("#first")).toBeFocused();
  });

  test("select before advance reports unknown", async ({ page }) => {
    await page.locator("#select").press("Enter");
    await expect(page.locator("#scan-status")).toHaveText("UNKNOWN");
  });

  test("selection announces the chosen target", async ({ page }) => {
    await page.locator("#advance").click();
    await page.locator("#select").press("Enter");
    await expect(page.locator("#scan-status")).toHaveText("Selected first");
  });

  test("cancel clears current selection state", async ({ page }) => {
    await page.locator("#advance").click();
    await page.locator("#cancel").press("Enter");
    await expect(page.locator("#scan-status")).toHaveText("Cancelled");
  });

  test("cancel followed by select does not invent a selection", async ({ page }) => {
    await page.locator("#advance").click();
    await page.locator("#cancel").click();
    await page.locator("#select").click();
    await expect(page.locator("#scan-status")).toHaveText("UNKNOWN");
  });

  test("switch status has polite live semantics", async ({ page }) => {
    await expect(page.locator("#scan-status")).toHaveAttribute("aria-live", "polite");
    await expect(page.locator("#scan-status")).toHaveAttribute("aria-atomic", "true");
  });

  test("no unintended keyboard focus is assigned to the status region", async ({ page }) => {
    const focused = await page.locator("#scan-status").evaluate((element) => {
      return element.hasAttribute("tabindex");
    });
    expect(focused).toBe(false);
  });
});

test.describe("P16 R32 switch alternatives", () => {
  test.beforeEach(async ({ page }) => setup(page));

  test("moving forward has a dedicated keyboard button", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Move right" })).toBeVisible();
  });

  test("moving backward has a dedicated keyboard button", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Move left" })).toBeVisible();
  });

  test("right button advances the item", async ({ page }) => {
    await page.locator("#move-next").press("Enter");
    await expect(page.locator("#move-status")).toHaveText("Item at 1");
  });

  test("left button reverses the item", async ({ page }) => {
    await page.locator("#move-back").press("Enter");
    await expect(page.locator("#move-status")).toHaveText("Item at -1");
  });

  test("Space activates the right movement alternative", async ({ page }) => {
    await page.locator("#move-next").press("Space");
    await expect(page.locator("#move-status")).toHaveText("Item at 1");
  });

  test("draggable control responds to ArrowRight", async ({ page }) => {
    await page.locator("#draggable").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#move-status")).toHaveText("Item at 1");
  });

  test("draggable control responds to ArrowLeft", async ({ page }) => {
    await page.locator("#draggable").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("#move-status")).toHaveText("Item at -1");
  });

  test("moving right and left is reversible", async ({ page }) => {
    await page.locator("#move-next").click();
    await page.locator("#move-back").click();
    await expect(page.locator("#move-status")).toHaveText("Item at 0");
  });

  test("drag alternative is focusable", async ({ page }) => {
    await page.locator("#draggable").focus();
    await expect(page.locator("#draggable")).toBeFocused();
  });

  test("drag alternative exposes an accessible name", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Move item" })).toBeVisible();
  });

  test("movement status has live semantics", async ({ page }) => {
    await expect(page.locator("#move-status")).toHaveAttribute("aria-live", "polite");
  });
});

test.describe("P16 R32 dialog lifecycle", () => {
  test.beforeEach(async ({ page }) => setup(page));

  test("dialog opens through Enter", async ({ page }) => {
    await page.locator("#open").press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("dialog opens through Space", async ({ page }) => {
    await page.locator("#open").press("Space");
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("dialog is named by its heading", async ({ page }) => {
    await page.locator("#open").click();
    await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  });

  test("opening a native modal moves focus inside", async ({ page }) => {
    await page.locator("#open").click();
    await expect(page.locator("#choice")).toBeFocused();
  });

  test("Escape dismisses native modal", async ({ page }) => {
    await page.locator("#open").click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("Escape returns focus to declared opener", async ({ page }) => {
    await page.locator("#open").click();
    await page.keyboard.press("Escape");
    await expect(page.locator("#open")).toBeFocused();
  });

  test("Close button returns focus to opener", async ({ page }) => {
    await page.locator("#open").click();
    await page.locator("#close").press("Enter");
    await expect(page.locator("#open")).toBeFocused();
  });

  test("Tab remains in native modal", async ({ page }) => {
    await page.locator("#open").click();
    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(() => {
        const dialog = document.querySelector("dialog");
        const active = document.activeElement;
        // Native modal tab wrap may park focus on body before the next stop.
        // An interactive control outside the modal must remain unreachable.
        return Boolean(dialog?.open) && (
          dialog?.contains(active) ||
          dialog === active ||
          active === document.body ||
          active === document.documentElement
        );
      });
      expect(inside).toBe(true);
    }
  });

  test("close does not leave a hidden focused element", async ({ page }) => {
    await page.locator("#open").click();
    await page.keyboard.press("Escape");
    expect(await activeId(page)).toBe("open");
  });

  test("dialog opener has controls reference", async ({ page }) => {
    await expect(page.locator("#open")).toHaveAttribute("aria-controls", "dialog");
  });
});

test.describe("P16 R32 forms and ARIA composites", () => {
  test.beforeEach(async ({ page }) => setup(page));

  test("email input has a native label", async ({ page }) => {
    await expect(page.getByRole("textbox", { name: "Email address" })).toBeVisible();
  });

  test("email input has a help reference", async ({ page }) => {
    await expect(page.locator("#email")).toHaveAttribute("aria-describedby", "email-help");
  });

  test("invalid email generates visible status", async ({ page }) => {
    await page.locator("#submit").press("Enter");
    await expect(page.locator("#form-status")).toHaveText("Please enter a valid email address.");
  });

  test("invalid email is marked aria-invalid", async ({ page }) => {
    await page.locator("#submit").click();
    await expect(page.locator("#email")).toHaveAttribute("aria-invalid", "true");
  });

  test("invalid email receives focus", async ({ page }) => {
    await page.locator("#submit").click();
    await expect(page.locator("#email")).toBeFocused();
  });

  test("valid form produces success status", async ({ page }) => {
    await page.locator("#email").fill("example@example.org");
    await page.locator("#submit").click();
    await expect(page.locator("#form-status")).toHaveText("Saved");
  });

  test("valid form clears aria-invalid", async ({ page }) => {
    await page.locator("#submit").click();
    await page.locator("#email").fill("example@example.org");
    await page.locator("#submit").click();
    await expect(page.locator("#email")).not.toHaveAttribute("aria-invalid", "true");
  });

  test("form status is polite", async ({ page }) => {
    await expect(page.locator("#form-status")).toHaveAttribute("aria-live", "polite");
  });

  test("tab list has a semantic name", async ({ page }) => {
    await expect(page.getByRole("tablist", { name: "Example tabs" })).toBeVisible();
  });

  test("first tab is initially selected", async ({ page }) => {
    await expect(page.getByRole("tab", { name: "One" })).toHaveAttribute("aria-selected", "true");
  });

  test("ArrowRight selects next tab", async ({ page }) => {
    await page.locator("#tab-one").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#tab-two")).toHaveAttribute("aria-selected", "true");
  });

  test("ArrowRight moves focus to next tab", async ({ page }) => {
    await page.locator("#tab-one").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#tab-two")).toBeFocused();
  });

  test("previous tab becomes unselected", async ({ page }) => {
    await page.locator("#tab-one").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#tab-one")).toHaveAttribute("aria-selected", "false");
  });

  test("second panel becomes visible", async ({ page }) => {
    await page.locator("#tab-two").click();
    await expect(page.locator("#panel-two")).toBeVisible();
  });

  test("first panel becomes hidden when second selected", async ({ page }) => {
    await page.locator("#tab-two").click();
    await expect(page.locator("#panel-one")).toBeHidden();
  });

  test("ArrowLeft restores first tab", async ({ page }) => {
    await page.locator("#tab-two").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("#tab-one")).toHaveAttribute("aria-selected", "true");
  });

  test("only one tab remains in sequential order", async ({ page }) => {
    await page.locator("#tab-two").click();
    await expect(page.locator("#tab-one")).toHaveAttribute("tabindex", "-1");
    await expect(page.locator("#tab-two")).toHaveAttribute("tabindex", "0");
  });
});

test.describe("P16 R32 language and offline semantics", () => {
  test.beforeEach(async ({ page }) => setup(page));

  test("default document language is English", async ({ page }) => {
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("language switch moves document to French", async ({ page }) => {
    await page.locator("#lang").press("Enter");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  });

  test("language switch publishes a status", async ({ page }) => {
    await page.locator("#lang").click();
    await expect(page.locator("#language-status")).toHaveText("Français");
  });

  test("language switch is reversible", async ({ page }) => {
    await page.locator("#lang").click();
    await page.locator("#lang").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("language status retains live semantics", async ({ page }) => {
    await expect(page.locator("#language-status")).toHaveAttribute("aria-live", "polite");
  });

  test("unknown offline status is not promoted", async ({ page }) => {
    await expect(page.locator("#offline")).toHaveText("UNKNOWN");
  });

  test("unknown offline status is exposed through live region", async ({ page }) => {
    await expect(page.locator("#offline")).toHaveAttribute("role", "status");
    await expect(page.locator("#offline")).toHaveAttribute("aria-live", "polite");
  });

  test("status regions do not create hidden focus traps", async ({ page }) => {
    const result = await page.locator("[role='status']").evaluateAll((nodes) =>
      nodes.every((node) => !node.hasAttribute("tabindex")),
    );
    expect(result).toBe(true);
  });

  test("all region IDs remain unique", async ({ page }) => {
    const duplicated = await page.evaluate(() => {
      const ids = Array.from(document.querySelectorAll("[id]"), (node) => node.id);
      return ids.filter((id, index) => ids.indexOf(id) !== index);
    });
    expect(duplicated).toEqual([]);
  });

  test("dialog target reference resolves to a dialog", async ({ page }) => {
    const target = await page.locator("#open").getAttribute("aria-controls");
    expect(target).toBe("dialog");
    await expect(page.locator(`#${target}`)).toHaveCount(1);
  });
});
