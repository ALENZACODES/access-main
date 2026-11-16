import { expect, test } from "@playwright/test";

import { auditDomRelations, formatRelationFindings } from "./dom-relations-round7";

const wrap = (body: string): string =>
  `<!doctype html><html lang="en"><head><title>Relationships</title></head><body>${body}</body></html>`;

const cases: readonly { name: string; html: string; code: string; target?: string }[] = [
  { name: "repeated IDs", html: '<p id="reused">A</p><p id="reused">B</p>', code: "duplicate-id", target: "reused" },
  { name: "blank IDs", html: '<p id="">Text</p>', code: "empty-id" },
  { name: "blank whitespace IDs", html: '<p id="  ">Text</p>', code: "empty-id" },
  { name: "unknown labelledby", html: '<button aria-labelledby="gone">Go</button>', code: "missing-reference", target: "gone" },
  { name: "unknown describedby", html: '<input aria-describedby="gone">', code: "missing-description", target: "gone" },
  { name: "unknown controls", html: '<button aria-controls="gone">Go</button>', code: "invalid-controls", target: "gone" },
  { name: "unknown owns", html: '<div aria-owns="gone"></div>', code: "invalid-owns", target: "gone" },
  { name: "unknown active descendant", html: '<div role="listbox" aria-activedescendant="gone"></div>', code: "invalid-activedescendant", target: "gone" },
  { name: "unknown error message", html: '<input aria-errormessage="gone" aria-invalid="true">', code: "invalid-error-message", target: "gone" },
  { name: "invalid label for", html: '<label for="gone">Name</label>', code: "invalid-form-label", target: "gone" },
  { name: "label for a paragraph", html: '<label for="paragraph">Name</label><p id="paragraph">Text</p>', code: "invalid-form-label", target: "paragraph" },
  { name: "headers missing", html: '<table><tr><td headers="gone">X</td></tr></table>', code: "invalid-header-reference", target: "gone" },
  { name: "headers not th", html: '<table><tr><td id="bad">X</td><td headers="bad">Y</td></tr></table>', code: "invalid-header-reference", target: "bad" },
  { name: "missing datalist", html: '<input list="gone">', code: "missing-reference", target: "gone" },
  { name: "non datalist list", html: '<input list="bad"><p id="bad">X</p>', code: "missing-reference", target: "bad" },
  { name: "missing associated form", html: '<input form="gone">', code: "missing-reference", target: "gone" },
  { name: "non form association", html: '<input form="bad"><div id="bad"></div>', code: "missing-reference", target: "bad" },
  { name: "broken fragment", html: '<a href="#gone">Go</a>', code: "invalid-fragment-target", target: "gone" },
  { name: "repeat relation token", html: '<p id="one">X</p><button aria-labelledby="one one">Go</button>', code: "duplicate-reference", target: "one" },
  { name: "self controls", html: '<button id="own" aria-controls="own">Go</button>', code: "self-reference", target: "own" },
  { name: "hidden labelledby", html: '<span id="gone" aria-hidden="true">Gone</span><button aria-labelledby="gone">Go</button>', code: "hidden-label-reference", target: "gone" },
];

for (const item of cases) {
  test(`DOM relationship detects ${item.name}`, async ({ page }) => {
    await page.setContent(wrap(item.html));
    const audit = await auditDomRelations(page);
    const matches = audit.findings.filter((finding) =>
      finding.code === item.code && (item.target === undefined || finding.target === item.target));
    expect(matches, formatRelationFindings(audit)).not.toHaveLength(0);
  });
}

test("DOM ID graph passes valid native and ARIA relationships", async ({ page }) => {
  await page.setContent(wrap(`
    <main id="main">
      <h1 id="title">Heading</h1>
      <p id="hint">Hint</p>
      <form id="form">
        <label for="name">Name</label>
        <input id="name" form="form" aria-describedby="hint" list="suggestions">
        <datalist id="suggestions"><option value="X"></datalist>
        <button id="opener" aria-controls="panel" aria-expanded="false">Open</button>
        <section id="panel" aria-labelledby="title"><p>Details</p></section>
      </form>
      <table><tr><th id="head">Column</th></tr><tr><td headers="head">Value</td></tr></table>
      <a href="#main">Skip</a>
    </main>`));
  const audit = await auditDomRelations(page);
  expect(audit.ids).toBeGreaterThan(5);
  expect(audit.references).toBeGreaterThan(5);
  expect(audit.findings, formatRelationFindings(audit)).toEqual([]);
});

test("an ID in a separate shadow root is not a document-level target", async ({ page }) => {
  await page.setContent(wrap('<div id="host"></div><button aria-controls="internal">Open</button>'));
  await page.locator("#host").evaluate((host) => {
    host.attachShadow({ mode: "open" }).innerHTML = '<p id="internal">Internal</p>';
  });
  const audit = await auditDomRelations(page);
  expect(audit.findings.some((finding) =>
    finding.code === "invalid-controls" && finding.target === "internal")).toBe(true);
});

test("identical IDs in distinct shadow roots are not duplicates", async ({ page }) => {
  await page.setContent(wrap('<div id="first"></div><div id="second"></div>'));
  for (const id of ["first", "second"]) {
    await page.locator(`#${id}`).evaluate((host) => {
      host.attachShadow({ mode: "open" }).innerHTML = '<p id="internal">Internal</p>';
    });
  }
  const audit = await auditDomRelations(page);
  expect(audit.findings, formatRelationFindings(audit)).toEqual([]);
});

test("a template's inert fragment does not create duplicate document IDs", async ({ page }) => {
  await page.setContent(wrap('<p id="shared">Visible</p><template><p id="shared">Future</p></template>'));
  const audit = await auditDomRelations(page);
  expect(audit.findings, formatRelationFindings(audit)).toEqual([]);
});

test("the regression reports all collisions, not just the first", async ({ page }) => {
  await page.setContent(wrap('<p id="x"></p><p id="x"></p><p id="x"></p><p id="y"></p><p id="y"></p>'));
  const audit = await auditDomRelations(page);
  expect(audit.findings.filter((item) => item.code === "duplicate-id")).toHaveLength(5);
});

test("localized labels may legitimately contain accented French text", async ({ page }) => {
  await page.setContent(wrap('<label for="élément">Élévation</label><input id="élément">'));
  const audit = await auditDomRelations(page);
  expect(audit.findings, formatRelationFindings(audit)).toEqual([]);
});
