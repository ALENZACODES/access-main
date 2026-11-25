import { expect, test } from "@playwright/test";
import { observeHandoffFocusRound11 } from "./focus-handoff-round11";

test("programmatic focus cannot enter an already inert subtree", async ({ page }) => {
  await page.setContent('<main><div inert><button id="action">Action</button></div></main>');
  const action = page.getByText("Action", { exact: true });
  await action.evaluate((button) => (button as HTMLButtonElement).focus());
  const snapshot = await observeHandoffFocusRound11(page);
  expect(snapshot.target).not.toBe("#action");
  expect(snapshot.findings.map((finding) => finding.code)).toContain("focus-disappeared");
});
