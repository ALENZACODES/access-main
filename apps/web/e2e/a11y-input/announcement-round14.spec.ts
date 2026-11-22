import { expect, test } from "@playwright/test";
import { assertAnnouncementContract, exerciseAnnouncement, inspectAnnouncements } from "./announcement-round14";

async function fixture(page: import("@playwright/test").Page, body: string): Promise<void> {
  await page.setContent(`<!doctype html><html lang="en"><head><title>Announcement fixture</title></head><body><main><h1>Announcement fixture</h1>${body}</main></body></html>`);
}
test.describe("P16 round 14 announcement contract", () => {
  test("polite status is accepted", async ({ page }) => {
    await fixture(page, `<p id="status" role="status" aria-live="polite">Saved</p>`);
    await assertAnnouncementContract(page);
  });
  test("assertive alert is accepted", async ({ page }) => {
    await fixture(page, `<p role="alert" aria-live="assertive">Problem</p>`);
    await assertAnnouncementContract(page);
  });
  test("status with off priority is rejected", async ({ page }) => {
    await fixture(page, `<p role="status" aria-live="off">Saved</p>`);
    expect((await inspectAnnouncements(page)).issues.map(x => x.code)).toContain("status-silent");
  });
  test("alert with polite priority is rejected", async ({ page }) => {
    await fixture(page, `<p role="alert" aria-live="polite">Problem</p>`);
    expect((await inspectAnnouncements(page)).issues.map(x => x.code)).toContain("alert-not-assertive");
  });
  test("unsupported priority is rejected", async ({ page }) => {
    await fixture(page, `<p aria-live="urgent">Update</p>`);
    expect((await inspectAnnouncements(page)).issues.map(x => x.code)).toContain("live-priority-invalid");
  });
  test("hidden status region is rejected", async ({ page }) => {
    await fixture(page, `<p role="status" hidden>Saved</p>`);
    expect((await inspectAnnouncements(page)).issues.map(x => x.code)).toContain("live-region-hidden");
  });
  test("live region inside aria-hidden is rejected", async ({ page }) => {
    await fixture(page, `<div aria-hidden="true"><p role="status">Saved</p></div>`);
    expect((await inspectAnnouncements(page)).issues.map(x => x.code)).toContain("live-region-hidden");
  });
  test("live region inside inert is rejected", async ({ page }) => {
    await fixture(page, `<div inert><p role="status">Saved</p></div>`);
    expect((await inspectAnnouncements(page)).issues.map(x => x.code)).toContain("live-region-hidden");
  });
  test("announcement text update is observable", async ({ page }) => {
    await fixture(page, `<p id="status" role="status" aria-live="polite">Waiting</p>`);
    await exerciseAnnouncement(page, "#status", "Saved");
  });
  test("announcement update does not move focus", async ({ page }) => {
    await fixture(page, `<button id="save">Save</button><p id="status" role="status" aria-live="polite"></p>`);
    await page.locator("#save").focus();
    await exerciseAnnouncement(page, "#status", "Saved");
    await expect(page.locator("#save")).toBeFocused();
  });
  test("French announcement copy is preserved", async ({ page }) => {
    await page.setContent(`<html lang="fr"><head><title>État</title></head><body><main><h1>État</h1><p role="status" aria-live="polite">Enregistré</p></main></body></html>`);
    await assertAnnouncementContract(page);
    await expect(page.getByText("Enregistré")).toBeVisible();
  });
});
