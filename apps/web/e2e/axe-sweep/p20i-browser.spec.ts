import { expect, test, type Page } from "@playwright/test";
import { captureBrowser, captureFocusWalk } from "./p20i-browser";
import {
  dialogIssues, disclosureIssues, documentIssues, evidenceIssues, fieldIssues,
  formIssues, linkIssues, liveIssues, mediaIssues, tableIssues, targetIssues,
  type Context,
} from "./p20i-contracts";

const ctx: Context = { route: "/fixture", locale: "en", width: 320 };
const html = (content: string): string => `<!doctype html>
<html lang="en"><head><base href="http://localhost/"><title>Fixture</title><style>
body { margin: 0; font-family: Arial, sans-serif; }
button, a, textarea, select, input { font: inherit; }
button, a.action, input, select, textarea { min-height: 48px; min-width: 48px; }
a.action { display: inline-flex; align-items: center; }
label.option { display: flex; min-height: 48px; align-items: center; }
label.option input { width: 18px; min-width: 18px; height: 18px; min-height: 18px; }
main { padding: 12px; }
</style></head><body>
<a class="action" href="#main">Skip to main content</a>
<main id="main"><h1>Fixture</h1>${content}</main></body></html>`;
async function show(page: Page, content: string): Promise<void> {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.setContent(html(content));
}
const rules = (findings: readonly { rule: string }[]): string[] => findings.map((finding) => finding.rule);

test.describe("P20I browser DOM snapshots", () => {
  test("captures page title, h1 and main", async ({ page }) => {
    await show(page, "<p>Body copy</p>");
    const snapshot = await captureBrowser(page);
    expect(snapshot.document.title).toBe("Fixture");
    expect(snapshot.document.h1).toEqual(["Fixture"]);
    expect(snapshot.document.mainCount).toBe(1);
    expect(snapshot.document.mainText).toContain("Body copy");
    expect(documentIssues(snapshot.document, ctx)).toEqual([]);
  });
  test("detects missing h1", async ({ page }) => {
    await show(page, "<p>Body copy</p>");
    await page.evaluate(() => document.querySelector("main h1")?.remove());
    expect(rules(documentIssues((await captureBrowser(page)).document, ctx))).toContain("page-heading");
  });
  test("detects two main landmarks", async ({ page }) => {
    await show(page, "<p>Body copy</p><main><p>Second</p></main>");
    expect(rules(documentIssues((await captureBrowser(page)).document, ctx))).toContain("main-landmark");
  });
  test("reports missing skip destination", async ({ page }) => {
    await show(page, "<p>Body copy</p>");
    await page.evaluate(() => document.querySelector("main")?.removeAttribute("id"));
    expect(rules(documentIssues((await captureBrowser(page)).document, ctx))).toContain("skip-destination");
  });
  test("detects horizontal overflow at phone width", async ({ page }) => {
    await show(page, "<div style='width:680px'>Wide data</div>");
    expect(rules(documentIssues((await captureBrowser(page)).document, ctx))).toContain("reflow");
  });
  test("captures lang without guessing a locale", async ({ page }) => {
    await show(page, "<p>Body copy</p>");
    await page.evaluate(() => { document.documentElement.lang = "fr"; });
    const summary = (await captureBrowser(page)).document;
    expect(summary.lang).toBe("fr");
    expect(rules(documentIssues(summary, ctx))).toContain("document-language");
  });
  test("visible 48px button passes", async ({ page }) => {
    await show(page, "<button type='button' id='apply'>Apply</button>");
    const target = (await captureBrowser(page)).targets.find((item) => item.id === "apply");
    expect(target?.rect.height).toBeGreaterThanOrEqual(48);
    expect(targetIssues(target ? [target] : [], ctx)).toEqual([]);
  });
  test("small button fails", async ({ page }) => {
    await show(page, "<button id='tiny' style='min-width:0;min-height:0;width:25px;height:25px'>Go</button>");
    const target = (await captureBrowser(page)).targets.find((item) => item.id === "tiny");
    expect(rules(targetIssues(target ? [target] : [], ctx))).toContain("target-44");
  });
  test("inline anchor is measured", async ({ page }) => {
    await show(page, "<p>Read <a href='/help'>Help</a> now</p>");
    const item = (await captureBrowser(page)).links.find((link) => link.href === "/help");
    expect(item).toBeDefined();
    expect(rules(linkIssues(item ? [item] : [], ctx, "http://localhost"))).toContain("link-44");
  });
  test("visible styled anchor passes", async ({ page }) => {
    await show(page, "<a class='action' href='/help'>Help</a>");
    const item = (await captureBrowser(page)).links.find((link) => link.href === "/help");
    expect(item).toBeDefined();
    expect(linkIssues(item ? [item] : [], ctx, "http://localhost")).toEqual([]);
  });
  test("labelled radio uses clickable wrapper", async ({ page }) => {
    await show(page, "<label class='option'>Washroom <input id='choice' type='radio' name='kind'></label>");
    const item = (await captureBrowser(page)).targets.find((target) => target.id === "choice");
    expect(item?.labelInteractive).toBe(true);
    expect(item?.labelRect?.height).toBeGreaterThanOrEqual(48);
    expect(targetIssues(item ? [item] : [], ctx)).toEqual([]);
  });
  test("radio without wrapper retains small hit box", async ({ page }) => {
    await show(page, "<input id='alone' type='radio' aria-label='Option' style='width:18px;height:18px;min-width:18px;min-height:18px'>");
    const item = (await captureBrowser(page)).targets.find((target) => target.id === "alone");
    expect(item?.labelInteractive).toBe(false);
    expect(rules(targetIssues(item ? [item] : [], ctx))).toContain("target-44");
  });
  test("radio group type is preserved", async ({ page }) => {
    await show(page, "<label class='option'>Charging <input id='charging' type='radio' name='kind'></label>");
    const item = (await captureBrowser(page)).fields.find((field) => field.id === "charging");
    expect(item?.kind).toBe("radio");
    expect(item?.label).toContain("Charging");
  });
  test("text input association is resolved", async ({ page }) => {
    await show(page, "<label for='query'>Search</label><input id='query' type='text'>");
    const item = (await captureBrowser(page)).fields.find((field) => field.id === "query");
    expect(item?.label).toBe("Search");
    expect(fieldIssues(item ? [item] : [], ctx)).toEqual([]);
  });
  test("textarea association is resolved", async ({ page }) => {
    await show(page, "<label for='notes'>Notes</label><textarea id='notes'></textarea>");
    const item = (await captureBrowser(page)).fields.find((field) => field.id === "notes");
    expect(item?.label).toBe("Notes");
    expect(fieldIssues(item ? [item] : [], ctx)).toEqual([]);
  });
  test("select association is resolved", async ({ page }) => {
    await show(page, "<label for='kind'>Kind</label><select id='kind'><option>One</option></select>");
    const item = (await captureBrowser(page)).fields.find((field) => field.id === "kind");
    expect(item?.label).toBe("Kind");
    expect(fieldIssues(item ? [item] : [], ctx)).toEqual([]);
  });
  test("placeholder alone is not an accessible label", async ({ page }) => {
    await show(page, "<textarea id='notes' placeholder='Your notes'></textarea>");
    const item = (await captureBrowser(page)).fields.find((field) => field.id === "notes");
    expect(rules(fieldIssues(item ? [item] : [], ctx))).toContain("field-name");
  });
  test("aria-labelledby association is resolved", async ({ page }) => {
    await show(page, "<span id='name'>Contact</span><input id='contact' aria-labelledby='name'>");
    const item = (await captureBrowser(page)).fields.find((field) => field.id === "contact");
    expect(item?.ariaLabelledby).toBe("Contact");
    expect(fieldIssues(item ? [item] : [], ctx)).toEqual([]);
  });
  test("missing aria-describedby is detected", async ({ page }) => {
    await show(page, "<label for='q'>Query</label><input id='q' aria-describedby='not-here'>");
    const item = (await captureBrowser(page)).fields.find((field) => field.id === "q");
    expect(item?.missingDescriptions).toEqual(["not-here"]);
    expect(rules(fieldIssues(item ? [item] : [], ctx))).toContain("field-description");
  });
  test("existing aria-describedby is resolved", async ({ page }) => {
    await show(page, "<label for='q'>Query</label><input id='q' aria-describedby='tip'><p id='tip'>Details</p>");
    const item = (await captureBrowser(page)).fields.find((field) => field.id === "q");
    expect(item?.missingDescriptions).toEqual([]);
    expect(fieldIssues(item ? [item] : [], ctx)).toEqual([]);
  });
  test("invalid form control gets error text", async ({ page }) => {
    await show(page, "<label for='q'>Query</label><input id='q' aria-invalid='true' aria-errormessage='err'><p id='err'>Required</p>");
    const item = (await captureBrowser(page)).fields.find((field) => field.id === "q");
    expect(item?.errorText).toBe("Required");
    expect(fieldIssues(item ? [item] : [], ctx)).toEqual([]);
  });
  test("invalid control without error fails", async ({ page }) => {
    await show(page, "<label for='q'>Query</label><input id='q' aria-invalid='true'>");
    const item = (await captureBrowser(page)).fields.find((field) => field.id === "q");
    expect(rules(fieldIssues(item ? [item] : [], ctx))).toContain("field-error");
  });
  test("hidden field is recorded as hidden", async ({ page }) => {
    await show(page, "<input id='hidden' type='text' style='display:none'>");
    const item = (await captureBrowser(page)).fields.find((field) => field.id === "hidden");
    expect(item?.visible).toBe(false);
  });
  test("disabled field is recorded", async ({ page }) => {
    await show(page, "<label for='q'>Query</label><input id='q' disabled>");
    const item = (await captureBrowser(page)).fields.find((field) => field.id === "q");
    expect(item?.disabled).toBe(true);
  });
  test("external blank link requires noopener", async ({ page }) => {
    await show(page, "<a class='action' href='https://example.invalid' target='_blank'>External</a>");
    const link = (await captureBrowser(page)).links.find((item) => item.text === "External");
    expect(rules(linkIssues(link ? [link] : [], ctx, page.url()))).toContain("external-window");
  });
  test("noopener on external blank link passes", async ({ page }) => {
    await show(page, "<a class='action' href='https://example.invalid' target='_blank' rel='noopener'>External</a>");
    const link = (await captureBrowser(page)).links.find((item) => item.text === "External");
    expect(linkIssues(link ? [link] : [], ctx, page.url())).toEqual([]);
  });
  test("telephone links remain valid", async ({ page }) => {
    await show(page, "<a class='action' href='tel:+15551234567'>Call</a>");
    const link = (await captureBrowser(page)).links.find((item) => item.text === "Call");
    expect(linkIssues(link ? [link] : [], ctx, "http://localhost")).toEqual([]);
  });
  test("named image passes media audit", async ({ page }) => {
    await show(page, "<img id='portrait' src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==' alt='Entrance photo' width='50' height='50'>");
    const item = (await captureBrowser(page)).media.find((medium) => medium.id === "portrait");
    expect(mediaIssues(item ? [item] : [], ctx)).toEqual([]);
  });
  test("unnamed image is detected", async ({ page }) => {
    await show(page, "<img id='portrait' src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==' width='50' height='50'>");
    const item = (await captureBrowser(page)).media.find((medium) => medium.id === "portrait");
    expect(rules(mediaIssues(item ? [item] : [], ctx))).toContain("media-alternative");
  });
  test("empty alt marks a decorative image", async ({ page }) => {
    await show(page, "<img id='decoration' src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==' alt='' width='50' height='50'>");
    const item = (await captureBrowser(page)).media.find((medium) => medium.id === "decoration");
    expect(item?.decorative).toBe(true);
    expect(mediaIssues(item ? [item] : [], ctx)).toEqual([]);
  });
  test("named SVG passes", async ({ page }) => {
    await show(page, "<svg id='diagram' aria-label='Simple diagram' width='60' height='60'><circle cx='30' cy='30' r='20'/></svg>");
    const item = (await captureBrowser(page)).media.find((medium) => medium.id === "diagram");
    expect(mediaIssues(item ? [item] : [], ctx)).toEqual([]);
  });
  test("SVG without alternative is detected", async ({ page }) => {
    await show(page, "<svg id='diagram' width='60' height='60'><circle cx='30' cy='30' r='20'/></svg>");
    const item = (await captureBrowser(page)).media.find((medium) => medium.id === "diagram");
    expect(rules(mediaIssues(item ? [item] : [], ctx))).toContain("media-alternative");
  });
  test("data table captures caption and associations", async ({ page }) => {
    await show(page, "<table id='records'><caption>Sources</caption><thead><tr><th scope='col'>Name</th></tr></thead><tbody><tr><td>Example</td></tr></tbody></table>");
    const item = (await captureBrowser(page)).tables.find((entry) => entry.id === "records");
    expect(item?.caption).toBe("Sources");
    expect(tableIssues(item ? [item] : [], ctx)).toEqual([]);
  });
  test("headerless table is detected", async ({ page }) => {
    await show(page, "<table id='records'><tr><td>Example</td></tr></table>");
    const item = (await captureBrowser(page)).tables.find((entry) => entry.id === "records");
    expect(rules(tableIssues(item ? [item] : [], ctx))).toContain("table-headers");
  });
  test("aria-expanded controls are captured", async ({ page }) => {
    await show(page, "<button id='toggle' aria-expanded='false' aria-controls='details'>Details</button><section id='details'>More</section>");
    const item = (await captureBrowser(page)).disclosures.find((entry) => entry.id === "toggle");
    expect(disclosureIssues(item ? [item] : [], ctx)).toEqual([]);
  });
  test("broken disclosure reference is caught", async ({ page }) => {
    await show(page, "<button id='toggle' aria-expanded='false' aria-controls='missing'>Details</button>");
    const item = (await captureBrowser(page)).disclosures.find((entry) => entry.id === "toggle");
    expect(rules(disclosureIssues(item ? [item] : [], ctx))).toContain("disclosure-controls");
  });
  test("status live region is captured", async ({ page }) => {
    await show(page, "<p role='status' id='count'>0 results</p>");
    const item = (await captureBrowser(page)).live.find((entry) => entry.id === "count");
    expect(item?.text).toBe("0 results");
    expect(liveIssues(item ? [item] : [], ctx)).toEqual([]);
  });
  test("live region with invalid priority fails", async ({ page }) => {
    await show(page, "<p id='count' aria-live='now'>Result</p>");
    const item = (await captureBrowser(page)).live.find((entry) => entry.id === "count");
    expect(rules(liveIssues(item ? [item] : [], ctx))).toContain("live-value");
  });
  test("named nonmodal dialog is captured", async ({ page }) => {
    await show(page, "<div id='dialog' role='dialog' aria-label='Preferences' style='padding:15px'>Options</div>");
    const item = (await captureBrowser(page)).dialogs.find((entry) => entry.id === "dialog");
    expect(dialogIssues(item ? [item] : [], ctx)).toEqual([]);
  });
  test("unnamed dialog is detected", async ({ page }) => {
    await show(page, "<div id='dialog' role='dialog' style='padding:15px'></div>");
    const item = (await captureBrowser(page)).dialogs.find((entry) => entry.id === "dialog");
    expect(rules(dialogIssues(item ? [item] : [], ctx))).toContain("dialog-name");
  });
  test("form has associated submit control", async ({ page }) => {
    await show(page, "<form id='find'><label for='q'>Search</label><input id='q'><button type='submit'>Search</button></form>");
    const item = (await captureBrowser(page)).forms.find((entry) => entry.id === "find");
    expect(item?.submits).toBe(1);
    expect(formIssues(item ? [item] : [], ctx)).toEqual([]);
  });
  test("form without submit is detected", async ({ page }) => {
    await show(page, "<form id='find'><label for='q'>Search</label><input id='q'></form>");
    const item = (await captureBrowser(page)).forms.find((entry) => entry.id === "find");
    expect(rules(formIssues(item ? [item] : [], ctx))).toContain("form-submit");
  });
  test("provenance attributes are retained", async ({ page }) => {
    await show(page, "<p data-source='Fixture' data-licence='CC0-1.0' data-source-date='2026-11-16' data-evidence-status='PASS'>Observation</p>");
    const snapshot = await captureBrowser(page);
    expect(snapshot.evidence).toHaveLength(1);
    expect(evidenceIssues(snapshot.evidence, ctx)).toEqual([]);
  });
  test("unsourced positive observation is detected", async ({ page }) => {
    await show(page, "<p data-evidence-status='PASS'>Observation</p>");
    expect(rules(evidenceIssues((await captureBrowser(page)).evidence, ctx))).toContain("evidence-source");
  });
  test("unknown observation remains unknown", async ({ page }) => {
    await show(page, "<p data-evidence-status='UNKNOWN'>Unknown</p>");
    const evidence = (await captureBrowser(page)).evidence;
    expect(evidence[0]?.status).toBe("UNKNOWN");
    expect(evidenceIssues(evidence, ctx)).toEqual([]);
  });
});

test.describe("P20I keyboard identity fixtures", () => {
  test("distinct controls with the same visible label retain unique identities", async ({ page }) => {
    await show(page, "<button id='a'>Help</button><button id='b'>Help</button><button id='c'>Continue</button>");
    const walk = await captureFocusWalk(page, 6);
    const names = walk.forward.filter((item) => item.name === "Help");
    expect(names.length).toBe(2);
    expect(new Set(names.map((item) => item.identity)).size).toBe(2);
  });
  test("keyboard walks past the skip link into main", async ({ page }) => {
    await show(page, "<button id='a'>Continue</button>");
    const walk = await captureFocusWalk(page, 5);
    expect(walk.forward.length).toBeGreaterThan(1);
    expect(walk.reachedMain).toBe(true);
  });
  test("disabled button is not a keyboard stop", async ({ page }) => {
    await show(page, "<button id='disabled' disabled>Disabled</button><button id='next'>Next</button>");
    const walk = await captureFocusWalk(page, 5);
    expect(walk.forward.some((item) => item.name === "Disabled")).toBe(false);
  });
  test("display-none button is not a keyboard stop", async ({ page }) => {
    await show(page, "<button id='hidden' style='display:none'>Hidden</button><button id='next'>Next</button>");
    const walk = await captureFocusWalk(page, 5);
    expect(walk.forward.some((item) => item.name === "Hidden")).toBe(false);
  });
  test("native anchor joins focus order", async ({ page }) => {
    await show(page, "<a class='action' id='help' href='/help'>Help</a>");
    const walk = await captureFocusWalk(page, 5);
    expect(walk.forward.some((item) => item.name === "Help")).toBe(true);
  });
  test("aria-label is read as a focus name", async ({ page }) => {
    await show(page, "<button id='next' aria-label='Next step'></button>");
    const walk = await captureFocusWalk(page, 5);
    expect(walk.forward.some((item) => item.name === "Next step")).toBe(true);
  });
});
