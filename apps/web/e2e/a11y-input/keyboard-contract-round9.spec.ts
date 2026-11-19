import { expect, test, type Page } from "@playwright/test";

import {
  auditAsJson,
  auditKeyboardContracts,
  describeKeyboardAudit,
  issueCodes,
  type KeyboardIssueCode,
} from "./keyboard-contract-round9";

/** Browser fixtures do not depend on app routes or external network access. */
const markup = (body: string): string => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Keyboard fixture</title></head>
<body><main>${body}</main></body></html>`;

async function diagnose(page: Page, body: string): Promise<KeyboardIssueCode[]> {
  await page.setContent(markup(body));
  return issueCodes(await auditKeyboardContracts(page));
}

const tabs = `<div role="tablist" aria-label="Example tabs">
  <button id="first" role="tab" tabindex="0" aria-selected="true" aria-controls="first-panel">First</button>
  <button id="second" role="tab" tabindex="-1" aria-selected="false" aria-controls="second-panel">Second</button>
</div>
<section id="first-panel" role="tabpanel" aria-labelledby="first"><p>First panel</p></section>
<section id="second-panel" role="tabpanel" aria-labelledby="second"><p>Second panel</p></section>`;

const listbox = `<div role="listbox" aria-label="Results">
  <div id="option-1" role="option" tabindex="0" aria-selected="true">First</div>
  <div id="option-2" role="option" tabindex="-1" aria-selected="false">Second</div>
</div>`;

const tree = `<div role="tree" aria-label="Folders">
  <div id="folder" role="treeitem" tabindex="0" aria-expanded="false">Folder</div>
  <div id="file" role="treeitem" tabindex="-1">File</div>
</div>`;

const menu = `<div role="menu" aria-label="Actions">
  <button id="copy" role="menuitem" tabindex="0">Copy</button>
  <button id="save" role="menuitem" tabindex="-1">Save</button>
</div>`;

const radioGroup = `<div role="radiogroup" aria-label="Delivery">
  <div id="r1" role="radio" tabindex="0" aria-checked="true">Pickup</div>
  <div id="r2" role="radio" tabindex="-1" aria-checked="false">Courier</div>
</div>`;

test.describe("P16 independent keyboard contract fixtures", () => {
  test("a valid tabset has no diagnostic", async ({ page }) => {
    const codes = await diagnose(page, tabs);
    expect(codes).toEqual([]);
  });

  test("a valid roving listbox has no diagnostic", async ({ page }) => {
    expect(await diagnose(page, listbox)).toEqual([]);
  });

  test("a valid roving tree has no diagnostic", async ({ page }) => {
    expect(await diagnose(page, tree)).toEqual([]);
  });

  test("a valid menu has no diagnostic", async ({ page }) => {
    expect(await diagnose(page, menu)).toEqual([]);
  });

  test("a valid radio group has no diagnostic", async ({ page }) => {
    expect(await diagnose(page, radioGroup)).toEqual([]);
  });

  test("duplicate IDs are a regression even if only one is referenced", async ({ page }) => {
    const codes = await diagnose(page, `<div id="duplicate"></div><span id="duplicate"></span>`);
    expect(codes).toContain("duplicate-dom-id");
  });

  test("IDs that only contain whitespace are rejected", async ({ page }) => {
    expect(await diagnose(page, `<span id=" "></span>`)).toContain("empty-dom-id");
  });

  test("labels must resolve in the current root", async ({ page }) => {
    expect(await diagnose(page, `<button aria-labelledby="missing"></button>`)).toContain("dangling-idref");
  });

  test("an empty label reference is not a valid IDREF", async ({ page }) => {
    expect(await diagnose(page, `<button aria-labelledby=" "></button>`)).toContain("empty-idref");
  });

  test("duplicate targets make a reference ambiguous", async ({ page }) => {
    const codes = await diagnose(page, `<span id="label">One</span><span id="label">Two</span><button aria-labelledby="label"></button>`);
    expect(codes).toContain("ambiguous-idref");
  });

  test("selected tab must have a panel", async ({ page }) => {
    const codes = await diagnose(page, tabs.replace('aria-controls="first-panel"', 'aria-controls="no-panel"'));
    expect(codes).toContain("tab-panel-missing");
  });

  test("tabpanel must link to the owning tab", async ({ page }) => {
    const codes = await diagnose(page, tabs.replace('role="tabpanel" aria-labelledby="first"', 'role="tabpanel" aria-labelledby="second"'));
    expect(codes).toContain("tab-panel-not-linked");
  });

  test("tablist with multiple selected tabs fails", async ({ page }) => {
    const codes = await diagnose(page, tabs.replace('aria-selected="false"', 'aria-selected="true"'));
    expect(codes).toContain("multiple-selected-tabs");
  });

  test("tablist with no selected tab fails", async ({ page }) => {
    const codes = await diagnose(page, tabs.replace('aria-selected="true"', 'aria-selected="false"'));
    expect(codes).toContain("missing-selected-tab");
  });

  test("selected tab cannot be removed from the tab sequence", async ({ page }) => {
    const codes = await diagnose(page, tabs.replace('id="first" role="tab" tabindex="0"', 'id="first" role="tab" tabindex="-1"'));
    expect(codes).toContain("tab-not-focusable");
  });

  test("a tablist rejects two simultaneous roving stops", async ({ page }) => {
    const codes = await diagnose(page, tabs.replace('id="second" role="tab" tabindex="-1"', 'id="second" role="tab" tabindex="0"'));
    expect(codes).toContain("multiple-roving-stops");
  });

  test("a tree without a roving stop is broken", async ({ page }) => {
    const codes = await diagnose(page, tree.replace('tabindex="0"', 'tabindex="-1"'));
    expect(codes).toContain("missing-roving-stop");
  });

  test("a disabled roving stop is diagnosed", async ({ page }) => {
    const codes = await diagnose(page, listbox.replace('role="option" tabindex="0"', 'role="option" tabindex="0" aria-disabled="true"'));
    expect(codes).toContain("disabled-roving-stop");
  });

  test("a positive tabindex is never part of a roving contract", async ({ page }) => {
    const codes = await diagnose(page, listbox.replace('tabindex="-1"', 'tabindex="3"'));
    expect(codes).toContain("positive-tabindex");
    expect(codes).toContain("invalid-roving-tabindex");
  });

  test("an option without a listbox is orphaned", async ({ page }) => {
    expect(await diagnose(page, '<span role="option">Orphan</span>')).toContain("orphan-option");
  });

  test("a treeitem outside a tree is orphaned", async ({ page }) => {
    expect(await diagnose(page, '<span role="treeitem">Orphan</span>')).toContain("orphan-treeitem");
  });

  test("a menuitem outside a menu is orphaned", async ({ page }) => {
    expect(await diagnose(page, '<span role="menuitem">Orphan</span>')).toContain("orphan-menuitem");
  });

  test("invalid aria-expanded is diagnosed", async ({ page }) => {
    expect(await diagnose(page, '<button aria-expanded="maybe">Expand</button>')).toContain("invalid-expanded");
  });

  test("expanded custom button needs controls", async ({ page }) => {
    expect(await diagnose(page, '<div role="button" aria-expanded="true" tabindex="0">Expand</div>'))
      .toContain("expanded-without-controls");
  });

  test("missing controlled region is diagnosed", async ({ page }) => {
    const codes = await diagnose(page, '<div role="button" aria-expanded="true" aria-controls="missing" tabindex="0">Expand</div>');
    expect(codes).toContain("missing-controlled-region");
  });

  test("invalid checked and selected states are diagnosed separately", async ({ page }) => {
    const codes = await diagnose(page, '<div role="checkbox" aria-checked="yes">Agree</div><div role="option" aria-selected="maybe">Option</div>');
    expect(codes).toContain("invalid-checked");
    expect(codes).toContain("invalid-selected");
  });

  test("activedescendant must be a resolvable, active descendant", async ({ page }) => {
    const codes = await diagnose(page, '<div role="listbox" aria-label="Names" tabindex="0" aria-activedescendant="elsewhere"><span role="option">A</span></div><span id="elsewhere">B</span>');
    expect(codes).toContain("inactive-activedescendant");
  });

  test("self-referencing activedescendant is invalid", async ({ page }) => {
    expect(await diagnose(page, '<div id="self" role="listbox" aria-label="Names" tabindex="0" aria-activedescendant="self"><div role="option">Name</div></div>'))
      .toContain("invalid-activedescendant");
  });

  test("ARIA orientation cannot contain invented values", async ({ page }) => {
    expect(await diagnose(page, '<div aria-orientation="diagonal"></div>'))
      .toContain("invalid-aria-orientation");
  });

  test("tree positional metadata is numeric and in range", async ({ page }) => {
    const codes = await diagnose(page, '<div role="tree" aria-label="Files"><div role="treeitem" tabindex="0" aria-level="0" aria-posinset="a" aria-setsize="0">File</div></div>');
    expect(codes).toContain("invalid-aria-level");
    expect(codes).toContain("invalid-aria-posinset");
    expect(codes).toContain("invalid-aria-setsize");
  });

  test("empty aria-keyshortcuts is not a shortcut", async ({ page }) => {
    expect(await diagnose(page, '<button aria-keyshortcuts=" ">Save</button>'))
      .toContain("invalid-aria-keyshortcuts");
  });

  test("a custom button cannot contain an interactive native child", async ({ page }) => {
    expect(await diagnose(page, '<div role="button" tabindex="0">Outer <button>Inner</button></div>'))
      .toContain("interactive-descendant");
  });

  test("a hidden focusable subtree is diagnosed", async ({ page }) => {
    expect(await diagnose(page, '<section aria-hidden="true"><button>Hidden</button></section>'))
      .toContain("hidden-focusable");
  });

  test("an inert focusable subtree is diagnosed", async ({ page }) => {
    expect(await diagnose(page, '<div inert><button>Hidden</button></div>'))
      .toContain("inert-focusable");
  });

  test("shadow-local ID duplication is detected without cross-root collision", async ({ page }) => {
    await page.setContent(markup('<p id="shared">Light</p><div id="mount"></div>'));
    await page.locator("#mount").evaluate((host) => {
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = '<p id="shared">Shadow</p><button aria-labelledby="shared"></button>';
    });
    const audit = await auditKeyboardContracts(page);
    expect(audit.roots).toBe(2);
    expect(issueCodes(audit)).not.toContain("duplicate-dom-id");
    expect(issueCodes(audit)).not.toContain("dangling-idref");
  });

  test("shadow-local dangling IDREF cannot resolve against document", async ({ page }) => {
    await page.setContent(markup('<p id="document-only">Name</p><div id="mount"></div>'));
    await page.locator("#mount").evaluate((host) => {
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = '<button aria-labelledby="document-only"></button>';
    });
    expect(issueCodes(await auditKeyboardContracts(page))).toContain("dangling-idref");
  });

  test("a DOM-ID regression is caught after a dynamic rerender", async ({ page }) => {
    await page.setContent(markup('<p id="label">Name</p><button aria-labelledby="label">Action</button>'));
    expect(issueCodes(await auditKeyboardContracts(page))).toEqual([]);
    await page.locator("main").evaluate((main) => {
      const duplicate = document.createElement("span");
      duplicate.id = "label";
      duplicate.textContent = "Another name";
      main.appendChild(duplicate);
    });
    const audit = await auditKeyboardContracts(page);
    expect(issueCodes(audit)).toContain("duplicate-dom-id");
    expect(issueCodes(audit)).toContain("ambiguous-idref");
  });

  test("diagnostics remain sorted and preserve useful failure information", async ({ page }) => {
    await page.setContent(markup('<button aria-labelledby="gone" tabindex="4">A</button>'));
    const audit = await auditKeyboardContracts(page);
    const sorted = [...audit.findings].sort((a, b) => a.code.localeCompare(b.code) || a.path.localeCompare(b.path) || a.attribute.localeCompare(b.attribute) || a.detail.localeCompare(b.detail));
    expect(audit.findings).toEqual(sorted);
    expect(describeKeyboardAudit(audit)).toContain("dangling-idref");
    const parsed = JSON.parse(auditAsJson(audit)) as { findings: { code: string }[] };
    expect(parsed.findings.some((item) => item.code === "positive-tabindex")).toBe(true);
  });
});
