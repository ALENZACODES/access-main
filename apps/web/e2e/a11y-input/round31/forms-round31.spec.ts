import { expect, test } from "@playwright/test";
import { inspectBrowserSemantics, inspectLiveRegions, walkFixtureTabOrder } from "./browser";
import { auditSemanticSnapshot } from "./contracts.mjs";
import { auditAnnouncementTransition, auditErrorSummary, auditBilingualMessages } from "./announcements.mjs";
import { auditForwardWalk, auditKeyboardCommands } from "./focus.mjs";

const fixture = (body: string, lang = "en") => `<!doctype html><html lang="${lang}">
<head><meta charset="utf-8"><title>Form input fixture</title><style>
body{font:16px system-ui;padding:12px}main{max-width:660px}
button,input,select,textarea{min-height:44px;margin:4px}label{display:block}
:focus-visible{outline:3px solid black;outline-offset:3px}
</style></head><body><main><h1>Form input fixture</h1>${body}</main></body></html>`;
const codes = (issues: readonly { code: string }[]) => issues.map((entry) => entry.code);

function inputForm() {
  return `<form id="request">
    <label for="name">Name</label><input id="name" name="name" required>
    <label for="reason">Reason</label><textarea id="reason" name="reason"></textarea>
    <label for="priority">Priority</label><select id="priority" name="priority">
      <option value="normal">Normal</option><option value="high">High</option></select>
    <button id="submit" type="submit">Save request</button>
    <p id="notice" role="status"></p></form>
    <script>
    const form = document.getElementById('request');
    form.addEventListener('submit', event => {
      event.preventDefault();
      document.getElementById('notice').textContent = 'Saved locally';
    });
    </script>`;
}

test.describe("P16 Round 31: form and switch input lifecycle", () => {
  test("explicit input label is visible to the semantic audit", async ({ page }) => {
    await page.setContent(fixture(inputForm()));
    const snapshot = await inspectBrowserSemantics(page);
    const field = snapshot.nodes.find((item) => item.id === "name");
    expect(field?.name).toBe("Name");
    expect(codes(auditSemanticSnapshot(snapshot))).not.toContain("node.unnamed-control");
  });

  test("textarea has an explicit visible label", async ({ page }) => {
    await page.setContent(fixture(inputForm()));
    const snapshot = await inspectBrowserSemantics(page);
    expect(snapshot.nodes.find((item) => item.id === "reason")?.name).toBe("Reason");
  });

  test("select field is named and exposed for keyboard access", async ({ page }) => {
    await page.setContent(fixture(inputForm()));
    const snapshot = await inspectBrowserSemantics(page);
    expect(snapshot.nodes.find((item) => item.id === "priority")?.name).toBe("Priority");
  });

  test("missing field label is detected", async ({ page }) => {
    await page.setContent(fixture('<input id="empty-label" type="text">'));
    const snapshot = await inspectBrowserSemantics(page);
    expect(codes(auditSemanticSnapshot(snapshot))).toContain("node.unnamed-control");
  });

  test("labelledby points to same-document text", async ({ page }) => {
    await page.setContent(fixture('<span id="label">Contact method</span><input id="contact" aria-labelledby="label">'));
    const snapshot = await inspectBrowserSemantics(page);
    expect(snapshot.nodes.find((item) => item.id === "contact")?.name).toBe("Contact method");
    expect(codes(auditSemanticSnapshot(snapshot))).not.toContain("node.dangling-reference");
  });

  test("broken describedby pointer is an audit finding", async ({ page }) => {
    await page.setContent(fixture('<label for="contact">Contact</label><input id="contact" aria-describedby="missing">'));
    expect(codes(auditSemanticSnapshot(await inspectBrowserSemantics(page))))
      .toContain("node.dangling-reference");
  });

  test("form controls participate in sequential focus order", async ({ page }) => {
    await page.setContent(fixture(inputForm()));
    const forward = await walkFixtureTabOrder(page, 12);
    expect(forward.map((entry) => entry.id)).toEqual(["name", "reason", "priority", "submit"]);
    expect(auditForwardWalk(forward)).toEqual([]);
  });

  test("Enter submits valid form and updates status", async ({ page }) => {
    await page.setContent(fixture(inputForm()));
    const initial = (await inspectLiveRegions(page))[0];
    await page.locator("#name").evaluate((element) => { (element as HTMLInputElement).value = "Visitor"; });
    await page.locator("#submit").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#notice")).toHaveText("Saved locally");
    const updated = (await inspectLiveRegions(page))[0];
    expect(auditAnnouncementTransition(initial, { ...updated, expectedChange: true })).toEqual([]);
  });

  test("empty required field prevents submission feedback", async ({ page }) => {
    await page.setContent(fixture(inputForm()));
    await page.locator("#submit").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#notice")).toHaveText("");
  });

  test("native checkbox toggles with Space", async ({ page }) => {
    await page.setContent(fixture('<label for="agree">Consent</label><input id="agree" type="checkbox">'));
    await page.locator("#agree").focus();
    await page.keyboard.press("Space");
    await expect(page.locator("#agree")).toBeChecked();
    expect(auditKeyboardCommands([{
      key: "Space", targetId: "agree", focusedBefore: true, activated: true,
      destructive: false, confirmed: true, navigation: false, localTarget: true,
    }])).toEqual([]);
  });

  test("native checkbox can be toggled back with Space", async ({ page }) => {
    await page.setContent(fixture('<label for="agree">Consent</label><input id="agree" type="checkbox" checked>'));
    await page.locator("#agree").focus();
    await page.keyboard.press("Space");
    await expect(page.locator("#agree")).not.toBeChecked();
  });

  test("native radio selection is reachable by keyboard", async ({ page }) => {
    await page.setContent(fixture(`<fieldset><legend>Contact preference</legend>
      <label for="email">Email</label><input id="email" type="radio" name="channel" checked>
      <label for="phone">Phone</label><input id="phone" type="radio" name="channel">
    </fieldset>`));
    await page.locator("#email").focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#phone")).toBeChecked();
    await expect(page.locator("#phone")).toBeFocused();
  });

  test("disabled button remains out of active keyboard traversal", async ({ page }) => {
    await page.setContent(fixture('<button id="before">Before</button><button id="disabled" disabled>Disabled</button><button id="after">After</button>'));
    const focus = await walkFixtureTabOrder(page, 10);
    expect(focus.map((entry) => entry.id)).toEqual(["before", "after"]);
  });

  test("error summary requires live feedback and focus", async ({ page }) => {
    await page.setContent(fixture('<div id="error-summary" role="alert" tabindex="-1">Name is required</div>'));
    await page.locator("#error-summary").focus();
    const focusedSummary = await page.locator("#error-summary")
      .evaluate((node) => document.activeElement === node);
    expect(auditErrorSummary({
      summaryId: "error-summary", live: true, focusedSummary,
      errors: [{ fieldId: "name", message: "Name is required", describedBy: true, invalid: true }],
    })).toEqual([]);
  });

  test("error summary without focus is rejected", async ({ page }) => {
    await page.setContent(fixture('<div id="error-summary" role="alert">Name is required</div>'));
    expect(codes(auditErrorSummary({
      summaryId: "error-summary", live: true, focusedSummary: false,
      errors: [{ fieldId: "name", message: "Name is required", describedBy: true, invalid: true }],
    }))).toContain("errors.focus");
  });

  test("French status message uses required punctuation spacing", async ({ page }) => {
    await page.setContent(fixture('<p id="status" role="status">Note\u00A0: terminé\u202F!</p>', "fr"));
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    expect(auditBilingualMessages([
      { key: "done", language: "en", text: "Done", channel: "status" },
      { key: "done", language: "fr", text: "Note\u00A0: terminé\u202F!", channel: "status" },
    ])).toEqual([]);
  });

  test("missing English translation is explicitly reported", async ({ page }) => {
    await page.setContent(fixture('<p id="status" role="status">Terminé</p>', "fr"));
    const issues = auditBilingualMessages([
      { key: "done", language: "fr", text: "Terminé", channel: "status" },
    ]);
    expect(codes(issues)).toContain("messages.missing-translation");
  });

  test("a bilingual message never upgrades UNKNOWN evidence", async ({ page }) => {
    await page.setContent(fixture('<div id="state" role="status">UNKNOWN</div>'));
    const issues = auditBilingualMessages([
      { key: "state", language: "en", text: "UNKNOWN", status: "UNKNOWN", confidence: "PRIMARY", channel: "status" },
      { key: "state", language: "fr", text: "UNKNOWN", status: "UNKNOWN", confidence: "UNKNOWN", channel: "status" },
    ]);
    expect(codes(issues)).toContain("message.unknown-upgraded");
  });

  test("form fixtures never request a network URL", async ({ page }) => {
    await page.setContent(fixture(inputForm()));
    expect(page.url()).toBe("about:blank");
    expect(await page.locator("#request").getAttribute("action")).toBeNull();
  });
});
