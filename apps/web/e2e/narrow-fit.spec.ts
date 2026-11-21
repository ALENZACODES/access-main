import { expect, test } from "@playwright/test";
import { narrowRoute } from "./narrow-route.ts";

/**
 * "This page on your screen" on the built app, in a real browser at 320 CSS
 * pixels: the facts table, the barrier form from an empty try to a finished
 * text, and the sizes of the controls. One language per test, so no test is
 * long.
 */

test.use({ viewport: { width: 320, height: 640 } });

const open = async (page: import("@playwright/test").Page, language: "en" | "fr") => {
  await page.goto("/");
  await page.getByRole("button", { name: language === "fr" ? "Français" : "English" }).click();
  await page.goto(narrowRoute());
  await expect(page.locator("#fit-h")).toBeVisible();
};

test("reports the real width and settings of the browser", async ({ page }) => {
  await open(page, "en");
  const row = (name: string) => page.locator(".fit tbody tr", { has: page.getByRole("rowheader", { name, exact: true }) }).locator("td");
  await expect(row("Width of the page area")).toHaveText("320 CSS pixels");
  await expect(row("Orientation")).toHaveText("portrait");
  await expect(row("Text size")).toHaveText("100% of the browser default");
  await expect(row("Reduced motion")).toHaveText(/^(asked for|not asked for)$/);
  await expect(page.locator(".fit")).toContainText("This is the narrowest width WCAG names (320 CSS pixels).");
});

test("reads the settings again after the window changes", async ({ page }) => {
  await open(page, "en");
  await page.setViewportSize({ width: 900, height: 600 });
  await page.getByRole("button", { name: "Read my settings again" }).click();
  await expect(page.locator(".fit tbody tr").first().locator("td")).toHaveText("900 CSS pixels");
  await expect(page.locator(".fit [role=status]")).toHaveText("Settings read again.");
  await expect(page.getByRole("button", { name: "Read my settings again" })).toBeFocused();
});

test("does not scroll sideways at 320 pixels, and every control is at least 44 pixels high", async ({ page }) => {
  await open(page, "en");
  await page.getByLabel("Something is cut off or needs sideways scrolling").check();
  await page.getByLabel("What happened").fill("The table runs off the right edge of the screen.");
  await page.getByRole("button", { name: "Prepare the text" }).click();
  await expect(page.getByLabel("Your text")).toBeFocused();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const sizes = await page.locator(".fit button, .fit a.fit-save, .fit label.fit-check, .fit input").evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { what: (el.textContent ?? "").trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) };
    }),
  );
  expect(sizes.length).toBeGreaterThanOrEqual(20);
  for (const s of sizes) {
    expect(s.h, s.what).toBeGreaterThanOrEqual(44);
    expect(s.w, s.what).toBeGreaterThanOrEqual(44);
    expect(s.right, s.what).toBeLessThanOrEqual(320);
  }
});

test("an empty form is refused with errors by the fields, then a text is prepared", async ({ page }) => {
  await open(page, "en");
  await page.getByRole("button", { name: "Prepare the text" }).click();
  const kind = page.getByRole("radiogroup", { name: "Kind of barrier" });
  await expect(page.getByLabel("Something is cut off or needs sideways scrolling")).toBeFocused();
  await expect(kind).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#fit-kind-error")).toHaveText("Choose the kind of barrier.");
  await expect(page.locator("#fit-what-error")).toBeVisible();
  await page.getByLabel("A button or link is too small or too close to another").check();
  await page.getByLabel("What happened").fill("The close button is too small to press. Reach me at ana@example.org");
  await page.getByRole("button", { name: "Prepare the text" }).click();
  const text = page.getByLabel("Your text");
  await expect(text).toHaveValue(/Barrier met in the App/);
  await expect(text).toHaveValue(/Page: \/dev\/narrow\n/);
  await expect(text).toHaveValue(/Width of the page area: 320 CSS pixels/);
  await expect(page.locator(".fit")).toContainText("Your description seems to hold an email address.");
  await expect(page.locator("#fit-kind-error")).toHaveCount(0);
  const save = page.getByRole("link", { name: "Save the text as a file" });
  await expect(save).toHaveAttribute("download", /^barrier-\d{4}-\d{2}-\d{2}\.txt$/);
});

test("saving gives a file with the same text, and no request leaves the page", async ({ page }) => {
  await open(page, "en");
  const requests: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("data:")) requests.push(r.url());
  });
  await page.getByLabel("Something moves, flashes or times out").check();
  await page.getByLabel("What happened").fill("The banner slides away before I can read it.");
  await page.getByRole("button", { name: "Prepare the text" }).click();
  const value = await page.getByLabel("Your text").inputValue();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Save the text as a file" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^barrier-\d{4}-\d{2}-\d{2}\.txt$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  expect(Buffer.concat(chunks).toString("utf8")).toBe(value);
  expect(requests).toEqual([]);
});

test("adds what the checks find when asked, and shows it in plain words", async ({ page }) => {
  await open(page, "en");
  await page.getByLabel("Text is hard to read (size, contrast, spacing)").check();
  await page.getByLabel("What happened").fill("The small grey text is hard to read.");
  await page.getByLabel("Run the checks and add what they find to the text").check();
  await page.getByRole("button", { name: "Prepare the text" }).click();
  await expect(page.getByLabel("Your text")).toHaveValue(/What the checks of the App found on this page:\n(On this page, at this size:|The checks that ran found nothing)/);
  await expect(page.locator(".fit")).toContainText("The checks look at part of what makes a page usable.");
});

test("works in French from the empty form to the text", async ({ page }) => {
  await open(page, "fr");
  await expect(page.locator("#fit-h")).toHaveText("Cette page sur votre écran");
  await page.getByRole("button", { name: "Préparer le texte" }).click();
  await expect(page.locator("#fit-kind-error")).toHaveText("Choisissez le type d’obstacle.");
  await page.getByLabel("Mon lecteur d’écran annonce autre chose, ou rien").check();
  await page.getByLabel("Ce qui s’est passé").fill("Le bouton n’est pas annoncé.");
  await page.getByRole("button", { name: "Préparer le texte" }).click();
  await expect(page.getByLabel("Votre texte")).toHaveValue(/Obstacle rencontré dans l’App/);
  await expect(page.getByLabel("Votre texte")).toHaveValue(/Largeur de la zone de page\u00A0: 320\u00A0pixels CSS/);
  await page.getByRole("button", { name: "Effacer mes réponses et le texte" }).click();
  await expect(page.getByLabel("Votre texte")).toHaveCount(0);
  await expect(page.getByLabel("Un contenu est coupé ou demande un défilement de côté")).toBeFocused();
});

test("can be used with the keyboard alone", async ({ page }) => {
  await open(page, "en");
  await page.getByLabel("Something is cut off or needs sideways scrolling").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByLabel("A button or link is too small or too close to another")).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("What happened")).toBeFocused();
  await page.keyboard.type("I cannot reach the menu with my switch.");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Add my screen and settings to the text")).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Prepare the text" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Your text")).toBeFocused();
  await expect(page.getByLabel("Your text")).toHaveValue(/I cannot reach the menu with my switch\./);
});
