import { expect, type Page } from "@playwright/test";

export interface AnnouncementIssue {
  readonly code: string;
  readonly selector: string;
  readonly detail: string;
}
export interface AnnouncementRecord {
  readonly selector: string;
  readonly role: string;
  readonly live: string;
  readonly atomic: string;
  readonly relevant: string;
  readonly text: string;
  readonly hidden: boolean;
}
export async function inspectAnnouncements(page: Page): Promise<{ regions: AnnouncementRecord[]; issues: AnnouncementIssue[] }> {
  return page.evaluate(() => {
    const issues: AnnouncementIssue[] = [];
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[aria-live],[role='status'],[role='alert'],[role='log']"));
    const regions = nodes.map((node, index): AnnouncementRecord => {
      const selector = node.id ? `#${CSS.escape(node.id)}` : `live[${index}]`;
      const role = node.getAttribute("role") ?? "generic";
      const live = node.getAttribute("aria-live") ?? (role === "alert" ? "assertive" : role === "status" ? "polite" : "off");
      const atomic = node.getAttribute("aria-atomic") ?? "false";
      const relevant = node.getAttribute("aria-relevant") ?? "additions text";
      const text = node.textContent?.trim() ?? "";
      const style = getComputedStyle(node);
      const hidden = !!node.closest("[hidden],[inert],[aria-hidden='true']") || style.display === "none" || style.visibility === "hidden";
      if (!["off", "polite", "assertive"].includes(live)) issues.push({ code: "live-priority-invalid", selector, detail: `Unsupported aria-live value ${live}` });
      if (role === "alert" && live !== "assertive") issues.push({ code: "alert-not-assertive", selector, detail: "Alert role should be assertive" });
      if (role === "status" && live === "off") issues.push({ code: "status-silent", selector, detail: "Status role should be announced politely" });
      if (hidden) issues.push({ code: "live-region-hidden", selector, detail: "Live region is hidden from assistive technology" });
      if (text.length > 1000) issues.push({ code: "live-message-long", selector, detail: "Live message exceeds the local audit limit" });
      const recognized = relevant.split(/\s+/).some((token) => ["additions", "removals", "text", "all"].includes(token));
      if (!recognized) issues.push({ code: "live-relevant-invalid", selector, detail: "aria-relevant has no supported token" });
      return { selector, role, live, atomic, relevant, text, hidden };
    });
    return { regions, issues };
  });
}
export async function assertAnnouncementContract(page: Page): Promise<void> {
  const result = await inspectAnnouncements(page);
  expect(result.issues, "Announcement semantics").toEqual([]);
}
export async function exerciseAnnouncement(page: Page, selector: string, message: string): Promise<void> {
  const region = page.locator(selector);
  await expect(region).toHaveCount(1);
  const before = await region.textContent();
  await region.evaluate((node, value) => { node.textContent = value; }, message);
  await expect(region).toContainText(message);
  expect(await region.textContent()).not.toBe(before);
}
