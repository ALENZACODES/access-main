import { expect, test } from "@playwright/test";
import {
  downloadText,
  listRegion,
  openWithPack,
  samplePlaces,
  selectPlace,
} from "./browser.ts";
import { openHandout, readHandout, readOffline, saveHandout, toggleOption } from "./handout.ts";

for (const language of ["en", "fr"] as const) {
  test(`portable shortlist: the saved ${language} handout preserves the ordered preview and field meanings`, async ({ page, browser }) => {
    const [detailed, blank, unlisted] = samplePlaces();
    await openWithPack(page, [detailed, blank, unlisted], language);
    // Select in the opposite order to the pack. Rebuilding from the full pack
    // or sorting by display name would produce a different export.
    await selectPlace(page, blank);
    await selectPlace(page, detailed);
    const { preview, panel } = await openHandout(page);
    const contents = await readHandout(preview, "preview");
    const fr = language === "fr";
    expect(contents.title).toBe(fr ? "Mes 2 lieux" : "My 2 places");
    expect(contents.intro).toMatch(fr ? /UNKNOWN signifie/ : /UNKNOWN means/);
    expect(contents.entries.map((entry) => entry.name)).toEqual([blank.name, detailed.name]);
    const [missing, recorded] = contents.entries;
    if (!missing || !recorded) throw new Error("Expected two selected places");
    expect(missing.labels).toEqual(fr
      ? ["Indication pour fauteuil roulant", "Type", "Adresse", "Point de carte", "D’où cela vient"]
      : ["Wheelchair tag", "Kind", "Address", "Map point", "Where it comes from"]);
    expect(Object.values(missing.details)).toEqual(missing.labels.map(() => "UNKNOWN"));
    expect(recorded.details.Note).toBe(detailed.wheelchair_description);
    expect(recorded.details[fr ? "Adresse" : "Address"]).toBe(detailed.address);
    expect(recorded.details[fr ? "Point de carte" : "Map point"]).toBe("43.65432, -79.38124");
    const source = recorded.details[fr ? "D’où cela vient" : "Where it comes from"];
    expect(source).toContain(detailed.provenance?.source_name);
    expect(source).toContain("ODbL 1.0");
    expect(missing.questions).toEqual([]);
    expect(recorded.questionHeading).toBeNull();

    const html = await saveHandout(page, panel, language);
    await readOffline(browser, html, async (reader) => {
      await expect(reader.locator("html")).toHaveAttribute("lang", language);
      await expect(reader).toHaveTitle(contents.title);
      const main = reader.getByRole("main");
      await expect(main).toHaveCount(1);
      await expect(main.getByRole("heading", { level: 1 })).toHaveText(contents.title);
      await expect(main.getByRole("article")).toHaveCount(2);
      await expect(main.getByRole("heading", { level: 2 })).toHaveText([
        `1. ${blank.name}`, `2. ${detailed.name}`,
      ]);
      await expect(reader.getByRole("contentinfo")).toBeVisible();
      expect(await readHandout(reader.locator("body"), "document")).toEqual(contents);
      // Angle brackets and punctuation in the place name must remain text.
      await expect(main.getByRole("heading", { level: 2 }).first().locator("b")).toHaveCount(0);
      await expect(reader.getByText(unlisted.name, { exact: true })).toHaveCount(0);
    });
  });
}

test("portable shortlist: turning off one optional detail keeps the other choices intact", async ({ browser, page }) => {
  const [place] = samplePlaces();
  await openWithPack(page, [place], "en");
  await selectPlace(page, place);
  const { panel, preview } = await openHandout(page);
  const initial = await readHandout(preview, "preview");
  const original = initial.entries[0];
  if (!original) throw new Error("Selected place missing from the preview");

  const scenarios = [
    { option: "notes", label: "Note" },
    { option: "points", label: "Map point" },
    { option: "sources", label: "Where it comes from" },
  ] as const;
  for (const scenario of scenarios) {
    await test.step(`omit only ${scenario.label} from the preview and the saved copy`, async () => {
      await toggleOption(panel, scenario.option);
      const edited = await readHandout(preview, "preview");
      const entry = edited.entries[0];
      if (!entry) throw new Error("Changing an option removed the selected place");
      expect(entry.labels).toEqual(original.labels.filter((label) => label !== scenario.label));
      for (const label of entry.labels) expect(entry.details[label]).toBe(original.details[label]);
      expect(edited.footer).toEqual(initial.footer);
      expect(edited.title).toBe(initial.title);
      const html = await saveHandout(page, panel, "en");
      await readOffline(browser, html, async (reader) => {
        expect(await readHandout(reader.locator("body"), "document")).toEqual(edited);
        const omitted = original.details[scenario.label];
        if (!omitted) throw new Error(`Fixture lacks an observable ${scenario.label}`);
        expect(await reader.locator("body").innerText()).not.toContain(omitted);
      });
      await toggleOption(panel, scenario.option);
      expect(await readHandout(preview, "preview")).toEqual(initial);
    });
  }
});

test("portable shortlist: French visit questions print with independent writing space at the selected size", async ({ browser, page }) => {
  const [detailed, blank] = samplePlaces();
  await openWithPack(page, [detailed, blank], "fr");
  await selectPlace(page, detailed);
  await selectPlace(page, blank);
  const { panel, preview } = await openHandout(page);
  const sizes = panel.getByRole("radiogroup", { name: "Taille du texte" });
  const large = sizes.getByRole("radio", { name: "Grand (18 points)", exact: true });
  const extra = sizes.getByRole("radio", { name: "Très grand (24 points)", exact: true });
  await expect(large).toBeChecked();
  await large.focus();
  await large.press("ArrowRight");
  await expect(extra).toBeChecked();
  await expect(preview).toHaveCSS("font-size", "32px");
  await toggleOption(panel, "questions");
  const contents = await readHandout(preview, "preview");
  for (const entry of contents.entries) {
    expect(entry.questionHeading).toBe("Questions à poser");
    expect(entry.questions.length).toBeGreaterThan(0);
    expect(entry.questions.every((question) => question.endsWith("?"))).toBe(true);
  }

  const html = await saveHandout(page, panel, "fr");
  await readOffline(browser, html, async (reader) => {
    await reader.emulateMedia({ media: "print" });
    const body = reader.locator("body");
    await expect(body).toHaveCSS("font-size", "32px");
    await expect(body).toHaveCSS("padding-top", "0px");
    await expect(body).toHaveCSS("max-width", "none");
    expect(await readHandout(body, "document")).toEqual(contents);

    const articles = reader.getByRole("article");
    for (const [index, entry] of contents.entries.entries()) {
      const article = articles.nth(index);
      await expect(article).toHaveCSS("break-inside", "avoid");
      await expect(article.getByRole("heading", { level: 2 })).toHaveCSS("break-after", "avoid");
      await expect(article.getByRole("heading", { level: 3 })).toHaveText("Questions à poser");
      const prompts = article.getByRole("listitem");
      await expect(prompts).toHaveCount(entry.questions.length);
      for (const prompt of await prompts.all()) {
        const space = prompt.locator(".answer");
        await expect(space).toHaveCount(1);
        const room = await space.evaluate((line) => {
          const rect = line.getBoundingClientRect();
          const style = getComputedStyle(line);
          return {
            height: rect.height,
            width: rect.width,
            fontSize: Number.parseFloat(style.fontSize),
            rule: Number.parseFloat(style.borderBottomWidth),
            empty: line.textContent?.trim() === "",
          };
        });
        expect(room.empty).toBe(true);
        expect(room.height).toBeGreaterThanOrEqual(room.fontSize);
        expect(room.width).toBeGreaterThan(room.fontSize * 4);
        expect(room.rule).toBeGreaterThan(0);
      }
    }
  });

  await toggleOption(panel, "questions");
  const withoutPrompts = await saveHandout(page, panel, "fr");
  await readOffline(browser, withoutPrompts, async (reader) => {
    await expect(reader.getByRole("heading", { level: 3 })).toHaveCount(0);
    await expect(reader.locator(".answer")).toHaveCount(0);
    await expect(reader.getByRole("article")).toHaveCount(2);
    await expect(reader.locator("html")).toHaveCSS("font-size", "32px");
  });
});

test("portable shortlist: an offline edit changes the next copy without changing the one already saved", async ({ page, browser, context }) => {
  const [first, second] = samplePlaces();
  await openWithPack(page, [first, second], "en");
  await selectPlace(page, first);
  await selectPlace(page, second);
  const { panel, preview } = await openHandout(page);
  const firstContents = await readHandout(preview, "preview");
  const firstFile = await saveHandout(page, panel, "en");

  await context.setOffline(true);
  const remove = listRegion(page).getByRole("button", { name: `Remove ${first.name} from the list`, exact: true });
  await remove.focus();
  await remove.press("Enter");
  await expect(listRegion(page)).toBeFocused();
  await expect(preview.getByRole("heading")).toHaveText("My place");
  const updated = await readHandout(preview, "preview");
  expect(updated.entries.map((entry) => entry.name)).toEqual([second.name]);
  const editedFile = await saveHandout(page, panel, "en");

  await readOffline(browser, editedFile, async (reader) => {
    expect(await readHandout(reader.locator("body"), "document")).toEqual(updated);
    await expect(reader.getByRole("heading", { level: 2 })).toHaveText(`1. ${second.name}`);
    expect(await reader.locator("body").innerText()).not.toContain(first.name);
  });
  await readOffline(browser, firstFile, async (reader) => {
    expect(await readHandout(reader.locator("body"), "document")).toEqual(firstContents);
  });
  const clear = listRegion(page).getByRole("button", { name: "Empty the list", exact: true });
  await clear.press("Enter");
  await expect(page.getByRole("region", { name: "Preview", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save the page (.html)", exact: true })).toHaveCount(0);
});

test("portable shortlist: a single place can be printed directly without exposing the rest of the list", async ({ browser, page }) => {
  const [selected, other] = samplePlaces();
  await openWithPack(page, [selected, other], "en");
  await selectPlace(page, selected);
  const { panel, preview } = await openHandout(page);
  const expected = await readHandout(preview, "preview");
  const listFile = await saveHandout(page, panel, "en");
  // Enlarge and add questions to the shortlist handout, then use the distinct
  // per-place export. A detail sheet has its own documented default format.
  const large = panel.getByRole("radio", { name: "Large (18 point)", exact: true });
  await large.focus();
  await large.press("ArrowRight");
  await toggleOption(panel, "questions");
  await selectPlace(page, other);
  const card = page.locator("li.pack-place").filter({ has: page.getByRole("heading", { name: selected.name, exact: true }) });
  const details = card.getByRole("button", { name: "Details and gaps", exact: true });
  await details.focus();
  await details.press("Space");
  const html = await downloadText(page, card.getByRole("button", { name: "Save a large-print page (.html)" }), "large-print-list.html");
  await readOffline(browser, html, async (reader) => {
    expect(await readHandout(reader.locator("body"), "document")).toEqual(expected);
    await expect(reader.locator("body")).toHaveCSS("font-size", "24px");
    await expect(reader.getByRole("heading", { level: 3 })).toHaveCount(0);
    expect(await reader.locator("body").innerText()).not.toContain(other.name);
  });
  // The independently downloaded default list file and the single-place file
  // should offer the same reading order even if their HTML formatting changes.
  await readOffline(browser, listFile, async (reader) => {
    expect(await readHandout(reader.locator("body"), "document")).toEqual(expected);
  });
});

test("portable shortlist: extra-large print preserves every character of long names on a narrow screen", async ({ page, browser }) => {
  const [base] = samplePlaces();
  const place = {
    ...base,
    name: "BibliothèqueInteruniversitaireDesMétiersEtDuPatrimoine",
    address: "ÉdificeDeLaBibliothèqueInteruniversitaire",
  };
  await openWithPack(page, [place], "fr");
  await selectPlace(page, place);
  const { panel, preview } = await openHandout(page);
  const sizes = panel.getByRole("radiogroup", { name: "Taille du texte" });
  await sizes.getByRole("radio", { name: "Grand (18 points)", exact: true }).press("ArrowRight");
  await expect(preview).toHaveCSS("font-size", "32px");
  const html = await saveHandout(page, panel, "fr");

  await readOffline(browser, html, async (reader) => {
    await reader.setViewportSize({ width: 320, height: 720 });
    const heading = reader.getByRole("heading", { level: 2 });
    await expect(heading).toHaveText(`1. ${place.name}`);
    const address = reader.getByText(place.address, { exact: true });
    await expect(address).toBeVisible();
    for (const text of [heading, address]) {
      const layout = await text.evaluate((element) => {
        // A block's bounding box can fit even when its text overflows or is
        // clipped. Measure the text fragments a reader would actually see.
        const range = document.createRange();
        range.selectNodeContents(element);
        const lines = Array.from(range.getClientRects(), (rect) => ({
          left: rect.left,
          right: rect.right,
          top: rect.top,
        }));
        return {
          lines,
          viewportWidth: document.documentElement.clientWidth,
          fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
        };
      });
      expect(layout.fontSize).toBeGreaterThanOrEqual(32);
      expect(new Set(layout.lines.map((line) => line.top)).size).toBeGreaterThan(1);
      for (const line of layout.lines) {
        expect(line.left).toBeGreaterThanOrEqual(0);
        expect(line.right).toBeLessThanOrEqual(layout.viewportWidth + 1);
      }
    }
    const pageWidth = await reader.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(pageWidth.scrollWidth).toBeLessThanOrEqual(pageWidth.viewport);
  });
});

test("portable shortlist: omitting source fields keeps credit and record age attached to the selected places", async ({ page, browser }) => {
  const [base, unknown] = samplePlaces();
  if (!base.provenance) throw new Error("Attribution test needs a licensed pack record");
  const place = {
    ...base,
    provenance: {
      ...base.provenance,
      source_name: "OpenStreetMap, sample regional extract",
      retrieved_at: "2001-06-28",
    },
  };
  await openWithPack(page, [unknown, place], "en");
  await selectPlace(page, place);
  await selectPlace(page, unknown);
  const { preview, panel } = await openHandout(page);
  await toggleOption(panel, "sources");
  const contents = await readHandout(preview, "preview");
  expect(contents.entries.every((entry) => !entry.labels.includes("Where it comes from"))).toBe(true);
  expect(contents.footer).toContain("© OpenStreetMap contributors");
  const ageNotices = contents.footer.filter((line) => line.includes("over a year ago"));
  expect(ageNotices).toHaveLength(1);
  expect(ageNotices[0]).toMatch(/^1\b/);
  const file = await saveHandout(page, panel, "en");
  await readOffline(browser, file, async (reader) => {
    const credit = reader.getByRole("contentinfo").getByText("© OpenStreetMap contributors", { exact: true });
    await expect(credit).toHaveCount(1);
    await expect(credit).toBeVisible();
    await expect(reader.getByRole("article").getByText("OpenStreetMap, sample regional extract")).toHaveCount(0);
    expect(await readHandout(reader.locator("body"), "document")).toEqual(contents);
  });

  await listRegion(page).getByRole("button", { name: `Remove ${place.name} from the list`, exact: true }).press("Enter");
  const remainder = await readHandout(preview, "preview");
  expect(remainder.entries.map((entry) => entry.name)).toEqual([unknown.name]);
  expect(remainder.footer.join("\n")).not.toContain("OpenStreetMap");
  expect(remainder.footer.join("\n")).not.toContain("over a year ago");
  const remainderFile = await saveHandout(page, panel, "en");
  await readOffline(browser, remainderFile, async (reader) => {
    expect(await readHandout(reader.locator("body"), "document")).toEqual(remainder);
    await expect(reader.getByRole("contentinfo")).toContainText("Details may have changed");
  });
});
