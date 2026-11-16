import { expect, type Page } from "@playwright/test";

export interface AnnouncementFinding {
  readonly code: string;
  readonly target: string;
  readonly detail: string;
}

/** Live regions and notification messages must be exposed without stealing keyboard focus. */
export async function auditAnnouncements(page: Page): Promise<AnnouncementFinding[]> {
  return page.evaluate(() => {
    const findings: AnnouncementFinding[] = [];
    const report = (code: string, element: Element, detail: string): void => {
      findings.push({ code, target: element.id || element.localName, detail });
    };
    const regions = Array.from(document.querySelectorAll<HTMLElement>(
      "[aria-live],[role='alert'],[role='status'],[role='log'],[role='timer'],[role='marquee']",
    ));
    for (const region of regions) {
      if (region.closest("[aria-hidden='true'],[inert]")) continue;
      const live = region.getAttribute("aria-live");
      const atomic = region.getAttribute("aria-atomic");
      const relevant = region.getAttribute("aria-relevant");
      const busy = region.getAttribute("aria-busy");
      const role = region.getAttribute("role");
      if (live && !["off", "polite", "assertive"].includes(live)) {
        report("live-invalid-value", region, live);
      }
      if (atomic && !["true", "false"].includes(atomic)) {
        report("live-invalid-atomic", region, atomic);
      }
      if (busy && !["true", "false"].includes(busy)) {
        report("live-invalid-busy", region, busy);
      }
      if (relevant) {
        const tokens = relevant.split(/\s+/).filter(Boolean);
        if (tokens.length === 0 || tokens.some((token) =>
          !["additions", "removals", "text", "all"].includes(token))) {
          report("live-invalid-relevant", region, relevant);
        }
      }
      if (region.getAttribute("aria-hidden") === "true") {
        report("live-hidden", region, "Live region must be in the accessibility tree");
      }
      if (region.getAttribute("tabindex") && Number(region.getAttribute("tabindex")) > 0) {
        report("live-positive-tabindex", region, "Announcement cannot reorder sequential focus");
      }
      if (role === "alert" && live === "off") {
        report("alert-silenced", region, "Alert overrides its implicit announcement priority");
      }
      if (role === "status" && live === "off") {
        report("status-silenced", region, "Status overrides its implicit announcement priority");
      }
    }
    for (const progress of Array.from(document.querySelectorAll<HTMLElement>(
      "[role='progressbar'],progress,[role='meter'],meter",
    ))) {
      const style = getComputedStyle(progress);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const min = progress.getAttribute("aria-valuemin") ?? progress.getAttribute("min") ?? "0";
      const max = progress.getAttribute("aria-valuemax") ?? progress.getAttribute("max") ?? "100";
      const current = progress.getAttribute("aria-valuenow") ?? progress.getAttribute("value");
      const parsedMin = Number(min);
      const parsedMax = Number(max);
      if (!Number.isFinite(parsedMin) || !Number.isFinite(parsedMax) || parsedMax <= parsedMin) {
        report("progress-invalid-range", progress, `${min}/${max}`);
      }
      if (current !== null && current !== "") {
        const parsedValue = Number(current);
        if (!Number.isFinite(parsedValue) || parsedValue < parsedMin || parsedValue > parsedMax) {
          report("progress-invalid-value", progress, current);
        }
      }
      if (progress.getAttribute("role") === "progressbar" || progress.getAttribute("role") === "meter") {
        if (!progress.getAttribute("aria-label")?.trim() && !progress.getAttribute("aria-labelledby")) {
          report("progress-name", progress, "Custom progress indicator has no name");
        }
      }
    }
    for (const output of Array.from(document.querySelectorAll<HTMLOutputElement>("output[for]"))) {
      for (const id of (output.htmlFor.value || "").split(/\s+/).filter(Boolean)) {
        if (!document.getElementById(id)) report("output-reference", output, `Missing output input: ${id}`);
      }
    }
    return findings;
  });
}

/** Observe an opted-in event without requiring exact translated wording. */
export async function exerciseSafeAnnouncement(page: Page): Promise<AnnouncementFinding[]> {
  const issues: AnnouncementFinding[] = [];
  const triggers = page.locator("button[data-a11y-announcement-trigger]");
  const count = await triggers.count();
  for (let index = 0; index < count; index += 1) {
    const trigger = triggers.nth(index);
    if (!(await trigger.isVisible()) || !(await trigger.isEnabled())) continue;
    const regionId = await trigger.getAttribute("data-a11y-announcement-trigger");
    const name = (await trigger.getAttribute("id")) || `trigger-${index}`;
    if (!regionId) {
      issues.push({ code: "announcement-target-missing", target: name, detail: "Empty target identifier" });
      continue;
    }
    const region = page.locator(`[id=${JSON.stringify(regionId)}]`);
    if ((await region.count()) !== 1) {
      issues.push({ code: "announcement-target-count", target: name, detail: regionId });
      continue;
    }
    const before = (await region.textContent())?.trim() || "";
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await region.textContent())?.trim() || "").not.toBe(before);
    const after = (await region.textContent())?.trim() || "";
    if (!after) issues.push({ code: "announcement-empty", target: regionId, detail: "No announcement text" });
    if (!(await trigger.isFocused())) {
      issues.push({ code: "announcement-focus-stolen", target: name, detail: "Status update moved focus" });
    }
  }
  return issues;
}

export async function assertAnnouncements(page: Page): Promise<void> {
  expect(await auditAnnouncements(page), "Live region and progress semantics").toEqual([]);
  expect(await exerciseSafeAnnouncement(page), "Opted-in keyboard announcement triggers").toEqual([]);
}
