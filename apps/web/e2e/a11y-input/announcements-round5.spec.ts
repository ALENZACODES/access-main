import { expect, test } from "@playwright/test";

import { auditAnnouncements, exerciseSafeAnnouncement } from "./announcements-round5";

test.describe("Announcement focus regression", () => {
  test("a keyboard status update keeps focus on its trigger", async ({ page }) => {
    await page.setContent(`
      <button id="trigger" data-a11y-announcement-trigger="status">Update</button>
      <div id="status" role="status">Before</div>
      <script>
        document.getElementById('trigger').addEventListener('click', () => {
          document.getElementById('status').textContent = 'After';
        });
      </script>
    `);
    expect(await auditAnnouncements(page)).toEqual([]);
    expect(await exerciseSafeAnnouncement(page)).toEqual([]);
    await expect(page.locator("#trigger")).toBeFocused();
  });

  test("a status update that steals focus is a hard failure", async ({ page }) => {
    await page.setContent(`
      <button id="trigger" data-a11y-announcement-trigger="status">Update</button>
      <div id="status" role="status">Before</div>
      <button id="other">Other</button>
      <script>
        document.getElementById('trigger').addEventListener('click', () => {
          document.getElementById('status').textContent = 'After';
          document.getElementById('other').focus();
        });
      </script>
    `);
    expect((await exerciseSafeAnnouncement(page)).map((issue) => issue.code))
      .toContain("announcement-focus-stolen");
  });

  test("missing announcement targets do not pass silently", async ({ page }) => {
    await page.setContent('<button data-a11y-announcement-trigger="absent">Update</button>');
    expect((await exerciseSafeAnnouncement(page)).map((issue) => issue.code))
      .toContain("announcement-target-count");
  });
});
