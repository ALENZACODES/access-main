import { expect, test } from "@playwright/test";
import { narrowRoute } from "./narrow-route.ts";

/**
 * "Look by hand" on the built app, in a real browser at 320 CSS pixels:
 * from the first step to a saved log file, with the keyboard, in English
 * and French. Short tests, one thing each.
 */

test.use({ viewport: { width: 320, height: 640 } });

const open = async (page: import("@playwright/test").Page, language: "en" | "fr") => {
  await page.goto("/");
  await page.getByRole("button", { name: language === "fr" ? "Français" : "English" }).click();
  await page.goto(narrowRoute());
  await expect(page.locator("#hand-h")).toBeVisible();
};

const hand = (page: import("@playwright/test").Page) => page.locator(".hand");

test("starts at the first step and says what the steps do not do", async ({ page }) => {
  await open(page, "en");
  await expect(page.locator("#hand-step-h")).toHaveText(/^Step 1 of \d+: \d\.\d\.\d+ /);
  await expect(hand(page)).toContainText("It does not make a page conform.");
  await expect(hand(page)).toContainText("Nothing here is stored or sent.");
});

test("refuses a step with no choice, then saves one and moves focus to the next step", async ({ page }) => {
  await open(page, "en");
  await hand(page).getByRole("button", { name: "Save and go to the next step" }).click();
  const group = hand(page).getByRole("radiogroup", { name: "What I found" });
  await expect(group).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#hand-result-error")).toHaveText("Choose what you found.");
  await expect(hand(page).getByLabel("I saw a problem")).toBeFocused();
  await hand(page).getByLabel("I found no problem").check();
  await hand(page).getByRole("button", { name: "Save and go to the next step" }).click();
  await expect(page.locator("#hand-step-h")).toHaveText(/^Step 2 of /);
  await expect(page.locator("#hand-step-h")).toBeFocused();
  await expect(hand(page).locator("[role=status]")).toHaveText("Saved.");
});

test("a problem needs a note that says what was seen", async ({ page }) => {
  await open(page, "en");
  await hand(page).getByLabel("I saw a problem").check();
  await hand(page).getByRole("button", { name: "Save this answer" }).click();
  await expect(hand(page).getByLabel("Note")).toBeFocused();
  await expect(page.locator("#hand-note-error")).toHaveText("Say what you saw, and on which page.");
  await hand(page).getByLabel("Note").fill("The form says to press the green button.");
  await hand(page).getByRole("button", { name: "Save this answer" }).click();
  await expect(hand(page)).toContainText("Saved answer: I saw a problem. The form says to press the green button.");
});

test("prepares a log the tool reads, and saves it as a file with the same content", async ({ page }) => {
  await open(page, "en");
  const requests: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("data:")) requests.push(r.url());
  });
  await hand(page).getByLabel("I am not sure").check();
  await hand(page).getByLabel("Note").fill("Ask the design lead.");
  await hand(page).getByRole("button", { name: "Save this answer" }).click();
  await hand(page).getByRole("button", { name: "Prepare the log" }).click();
  await expect(hand(page).getByLabel("Who is looking")).toBeFocused();
  await expect(page.locator("#hand-who-error")).toContainText("Say who looked.");
  await hand(page).getByLabel("Who is looking").fill("@sam");
  await hand(page).getByRole("button", { name: "Prepare the log" }).click();
  const log = hand(page).getByLabel("Log file");
  await expect(log).toBeFocused();
  const value = await log.inputValue();
  const data = JSON.parse(value) as { version: number; notes: Array<{ result: string; by: string; note: string; on: string }> };
  expect(data.version).toBe(1);
  expect(data.notes).toHaveLength(1);
  expect(data.notes[0]).toMatchObject({ result: "not-sure", by: "@sam", note: "Ask the design lead." });
  const [download] = await Promise.all([page.waitForEvent("download"), hand(page).getByRole("link", { name: "Save the log as a file" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^narrow-audit\.manual-log\.\d{4}-\d{2}-\d{2}\.json$/);
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
  expect(Buffer.concat(chunks).toString("utf8")).toBe(value);
  expect(requests).toEqual([]);
});

test("reads a pasted earlier log and shows the last look at its step", async ({ page }) => {
  await open(page, "en");
  await hand(page).getByLabel("An earlier log, if you have one").fill(JSON.stringify({ version: 1, notes: [{ sc: "1.4.10", result: "problem", on: "2026-01-15", by: "@lee", note: "The table is cut off." }] }));
  await hand(page).getByRole("button", { name: "Read this log" }).click();
  await expect(hand(page).locator("[role=status]")).toHaveText("1 note read from the earlier log.");
  await hand(page).getByRole("button", { name: /^Show all steps/ }).click();
  await expect(hand(page).getByRole("button", { name: /^Hide the list of steps/ })).toHaveAttribute("aria-expanded", "true");
  await hand(page).getByRole("button", { name: /^1\.4\.10 Reflow \(AA\): not looked at yet$/ }).click();
  await expect(page.locator("#hand-step-h")).toContainText("1.4.10 Reflow (AA)");
  await expect(page.locator("#hand-step-h")).toBeFocused();
  await expect(hand(page)).toContainText("Looked on 2026-01-15 by @lee");
  await expect(hand(page).locator("#hand-all")).toBeVisible();
});

test("shows more steps when more is at hand", async ({ page }) => {
  await open(page, "en");
  const total = async () => Number(/of (\d+)/.exec((await page.locator("#hand-step-h").textContent()) ?? "")?.[1] ?? "0");
  const before = await total();
  await hand(page).getByLabel("A screen reader").check();
  await hand(page).getByRole("button", { name: "Show the steps for what I have" }).click();
  expect(await total()).toBeGreaterThan(before);
  await expect(hand(page).getByLabel("A screen reader")).toBeChecked();
});

test("does not scroll sideways at 320 pixels, and every control is at least 44 pixels each way", async ({ page }) => {
  await open(page, "en");
  await hand(page).getByLabel("Who is looking").fill("@sam");
  await hand(page).getByLabel("I saw a problem").check();
  await hand(page).getByLabel("Note").fill(`${"A-very-long-word-with-no-space-in-it-".repeat(4)} on the search page.`);
  await hand(page).getByRole("button", { name: "Save this answer" }).click();
  await hand(page).getByRole("button", { name: "Prepare the log" }).click();
  await hand(page).getByRole("button", { name: /^Show all steps/ }).click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const sizes = await hand(page).locator("button, input, a.hand-save").evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { what: ((el as HTMLElement).textContent || el.id).trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) };
    }),
  );
  expect(sizes.length).toBeGreaterThan(30);
  for (const s of sizes) {
    expect(s.h, s.what).toBeGreaterThanOrEqual(44);
    expect(s.w, s.what).toBeGreaterThanOrEqual(44);
    expect(s.right, s.what).toBeLessThanOrEqual(320);
  }
});

test("works with the keyboard alone", async ({ page }) => {
  await open(page, "en");
  await hand(page).getByLabel("I saw a problem").focus();
  await page.keyboard.press("ArrowDown");
  await expect(hand(page).getByLabel("I found no problem")).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(hand(page).getByLabel("Note")).toBeFocused();
  await page.keyboard.type("Checked the home page.");
  await page.keyboard.press("Tab");
  await expect(hand(page).getByRole("button", { name: "Save and go to the next step" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#hand-step-h")).toBeFocused();
  await expect(page.locator("#hand-step-h")).toHaveText(/^Step 2 of /);
  await page.keyboard.press("Tab");
  await expect(hand(page).getByLabel("I saw a problem")).toBeFocused();
});

test("works in French and keeps the session when the language changes", async ({ page }) => {
  await open(page, "en");
  await hand(page).getByLabel("Who is looking").fill("@sam");
  await hand(page).getByLabel("I found no problem").check();
  await hand(page).getByRole("button", { name: "Save and go to the next step" }).click();
  // The switch inside the audit panel, not the one of the app shell.
  await page.locator('[data-action="lang-fr"]').click();
  await expect(page.locator("#hand-h")).toHaveText("Regarder à la main");
  await expect(page.locator("#hand-step-h")).toHaveText(/^Étape 2 sur \d+/);
  await expect(hand(page).getByLabel("Qui regarde")).toHaveValue("@sam");
  await hand(page).getByRole("button", { name: "Préparer le journal" }).click();
  await expect(hand(page).getByLabel("La même chose en mots")).toHaveValue(/Examen à la main du \d{4}-\d{2}-\d{2}, par @sam/);
  await expect(hand(page).getByLabel("La même chose en mots")).toHaveValue(/Je n’ai trouvé aucun problème\./);
});
