import { expect, test } from "@playwright/test";
import { inspectLiveRegions, inspectBrowserSemantics } from "./browser";
import {
  auditLiveRegions, auditAnnouncementTransition, auditLanguageChange,
  auditOfflineAnnouncement, auditProgressState,
} from "./announcements.mjs";

const fixture = (body: string, lang = "en") => `<!doctype html><html lang="${lang}">
<head><meta charset="utf-8"><title>Announcement fixture</title></head>
<body><main><h1>Announcement fixture</h1>${body}</main></body></html>`;
const codes = (items: readonly { code: string }[]) => items.map((item) => item.code);

test.describe("P16 Round 31: browser announcement semantics", () => {
  test("status update preserves region identity", async ({ page }) => {
    await page.setContent(fixture('<p id="message" role="status">Loading</p>'));
    const before = (await inspectLiveRegions(page))[0];
    await page.locator("#message").evaluate((item) => { item.textContent = "Complete"; });
    const after = (await inspectLiveRegions(page))[0];
    expect(auditLiveRegions([after])).toEqual([]);
    expect(auditAnnouncementTransition(before, { ...after, expectedChange: true, expectedComplete: true })).toEqual([]);
  });

  test("ARIA status set to off is reported", async ({ page }) => {
    await page.setContent(fixture('<p role="status" id="message" aria-live="off">Loading</p>'));
    expect(codes(auditLiveRegions(await inspectLiveRegions(page)))).toContain("live.silent-status");
  });

  test("alert gets assertive default", async ({ page }) => {
    await page.setContent(fixture('<p role="alert" id="alert">Please check the form.</p>'));
    expect((await inspectLiveRegions(page))[0]?.live).toBe("assertive");
  });

  test("updates must not replace the original live-region ID", async ({ page }) => {
    await page.setContent(fixture('<p role="status" id="message">Loading</p>'));
    const before = (await inspectLiveRegions(page))[0];
    await page.locator("#message").evaluate((item) => { item.id = "replacement"; item.textContent = "Complete"; });
    const after = (await inspectLiveRegions(page))[0];
    expect(codes(auditAnnouncementTransition(before, { ...after, expectedChange: true }))).toContain("transition.replaced-region");
  });

  test("language change can be observed separately from speech output", async ({ page }) => {
    await page.setContent(fixture('<button id="language">Français</button>'));
    const previous = await inspectBrowserSemantics(page);
    await page.locator("html").evaluate((element) => { element.lang = "fr"; });
    const current = await inspectBrowserSemantics(page);
    expect(auditLanguageChange({
      before: previous.language, after: "fr", expectedSwitch: true,
      documentLanguage: current.language, announcedLanguage: "fr", announcementExpected: true,
      focusPreserved: true, controlsNamed: true, sampleCopy: "«\u202FEntrée accessible\u202F»",
    })).toEqual([]);
  });

  test("offline unknown cache cannot be announced as ready", async ({ page }) => {
    await page.setContent(fixture('<p id="offline" role="status">UNKNOWN</p>'));
    const regions = await inspectLiveRegions(page);
    expect(regions).toHaveLength(1);
    const issues = auditOfflineAnnouncement({
      language: "en", cache: "UNKNOWN", claim: "READY", sourceTier: "UNKNOWN",
      statusRegion: regions[0]?.live === "polite", keyboardReachable: true,
      retryAvailable: false, retryNamed: true, downloadStarted: false,
      progressNamed: true, downloadFailed: false, failureAnnounced: true,
    });
    expect(codes(issues)).toContain("offline.unknown-upgraded");
  });

  test("progress indicator with name has a valid range", async ({ page }) => {
    await page.setContent(fixture('<div role="progressbar" id="download" aria-label="Download" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"></div>'));
    const progress = await page.locator("#download").evaluate((node) => ({
      label: node.getAttribute("aria-label"),
      min: Number(node.getAttribute("aria-valuemin")),
      max: Number(node.getAttribute("aria-valuemax")),
      value: Number(node.getAttribute("aria-valuenow")),
      live: false, complete: false, indeterminate: false,
    }));
    expect(auditProgressState(progress)).toEqual([]);
  });

  test("invalid progress maximum is detected", async ({ page }) => {
    await page.setContent(fixture('<div role="progressbar" id="download" aria-label="Download" aria-valuemin="100" aria-valuemax="0" aria-valuenow="50"></div>'));
    const progress = await page.locator("#download").evaluate((node) => ({
      label: node.getAttribute("aria-label"), min: Number(node.getAttribute("aria-valuemin")),
      max: Number(node.getAttribute("aria-valuemax")), value: Number(node.getAttribute("aria-valuenow")),
      live: false, complete: false, indeterminate: false,
    }));
    expect(codes(auditProgressState(progress))).toContain("progress.invalid-range");
  });
});
